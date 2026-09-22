import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

for (const publisherKey of ['', 'test-only-key']) {
  test(`production refuses ${publisherKey ? 'identical' : 'missing'} publisher credentials`, async () => {
    const child = spawn(process.execPath, ['src/server.mjs'], {
      env: { ...process.env, NODE_ENV: 'production', PORT: '0', MARKET_PULSE_API_KEY: 'test-only-key',
        MARKET_PULSE_PUBLISH_KEY: publisherKey, OPENAI_API_KEY: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data; });
    const killTimer = setTimeout(() => child.kill('SIGTERM'), 3_000);
    try {
      const [code] = await once(child, 'exit');
      assert.equal(code, 1);
      assert.match(stderr, /distinct MARKET_PULSE_PUBLISH_KEY/);
    } finally { clearTimeout(killTimer); }
  });
}

test('production refuses an empty write key', async () => {
  const child = spawn(process.execPath, ['src/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', MARKET_PULSE_API_KEY: '', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
  assert.match(stderr, /MARKET_PULSE_API_KEY is required/);
});

test('HTTP preserves UTF-8 and handles invalid Host without terminating', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-http-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '0', DATA_DIR: directory,
      MARKET_PULSE_API_KEY: 'test-only-key', MARKET_PULSE_PUBLISH_KEY: 'publisher-key', OPENAI_API_KEY: '',
      NAVER_KR_MOVERS_URL: 'http://127.0.0.1:9', NAVER_US_MOVERS_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5_000);
      child.once('error', reject);
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited during startup')); });
      child.stdout.on('data', (data) => {
        const match = String(data).match(/0\.0\.0\.0:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    const response = await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/watchlist', method: 'POST',
        headers: { Host: '[invalid', 'Content-Type': 'application/json', 'X-Market-Pulse-Key': 'test-only-key' } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      });
      req.on('error', reject);
      req.end(JSON.stringify({ market: 'KR', code: '035420', name: '한글테스트' }));
    });
    assert.equal(response.status, 201);
    assert.ok(response.body.some((item) => item.name === '한글테스트'));
    const unauthorizedWrite = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
      method: 'POST', body: '{}',
    });
    assert.equal(unauthorizedWrite.status, 401);

    const unauthorizedRead = await fetch(`http://127.0.0.1:${port}/api/reports`);
    assert.equal(unauthorizedRead.status, 401);

    const authorizedRead = await fetch(`http://127.0.0.1:${port}/api/reports`, {
      headers: { 'X-Market-Pulse-Key': 'test-only-key' },
    });
    assert.equal(authorizedRead.status, 200);

    const forbiddenPublish = await fetch(`http://127.0.0.1:${port}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Market-Pulse-Key': 'test-only-key',
      },
      body: JSON.stringify({
        id: 'forbidden-publish',
        title: 'Forbidden',
        publishedAt: '2026-09-23T08:00:00+09:00',
        type: 'morning',
        summary: 'test',
        tickers: [],
      }),
    });
    assert.equal(forbiddenPublish.status, 401);

    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Market-Pulse-Key': 'publisher-key',
      },
      body: JSON.stringify({
        id: 'signed-pdf-test',
        title: 'Signed PDF test',
        publishedAt: '2026-09-23T08:00:00+09:00',
        type: 'morning',
        summary: 'test',
        tickers: [],
      }),
    });
    assert.equal(reportResponse.status, 201);

    const pdfResponse = await fetch(`http://127.0.0.1:${port}/api/reports/signed-pdf-test/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Market-Pulse-Key': 'publisher-key',
      },
      body: Buffer.from('%PDF-1.4\n%%EOF'),
    });
    assert.equal(pdfResponse.status, 201);

    const linkResponse = await fetch(`http://127.0.0.1:${port}/api/reports/signed-pdf-test/pdf-link`, {
      headers: { 'X-Market-Pulse-Key': 'test-only-key' },
    });
    assert.equal(linkResponse.status, 200);
    const link = await linkResponse.json();

    const signedPdf = await fetch(`http://127.0.0.1:${port}${link.url}`);
    assert.equal(signedPdf.status, 200);
    assert.equal(signedPdf.headers.get('content-type'), 'application/pdf');

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.deepEqual(await health.json(), { ok: true });
    for (const path of ['/api/home/briefing', '/api/ai/status', '/api/engagement/summary',
      '/api/review/weekly', '/api/reports/signed-pdf-test', '/api/reports/signed-pdf-test/pdf',
      '/api/reports/signed-pdf-test/pdf-link', '/api/watchlist/items', '/api/watchlist',
      '/api/stocks/US/NVDA.O', '/api/search?q=NVDA', '/api/calendar', '/api/settings/alerts',
      '/api/push/status', '/api/alerts', '/api/movers']) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 401, path);
    }
    for (const [method, path] of [['POST', '/api/reports/signed-pdf-test/pdf'],
      ['DELETE', '/api/reports/signed-pdf-test'], ['POST', '/api/calendar']]) {
      assert.equal((await fetch(`http://127.0.0.1:${port}${path}`, { method,
        headers: { 'X-Market-Pulse-Key': 'test-only-key' }, body: '{}' })).status, 401, path);
    }
    const tampered = new URL(link.url, `http://127.0.0.1:${port}`);
    tampered.searchParams.set('signature', 'é'.repeat(64));
    assert.equal((await fetch(tampered)).status, 401);
    tampered.searchParams.set('expires', '1');
    assert.equal((await fetch(tampered)).status, 401);
    const wrongPath = link.url.replace('signed-pdf-test/pdf?', 'another-report/pdf?');
    assert.equal((await fetch(`http://127.0.0.1:${port}${wrongPath}`)).status, 401);
    const writeWithSignature = await fetch(`http://127.0.0.1:${port}${link.url}`, { method: 'POST', body: '%PDF-' });
    assert.equal(writeWithSignature.status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}${link.url}`)).status, 200, 'signed URLs are reusable within their TTL');

    // XFF is attacker controlled without an explicitly verified proxy boundary.
    let limited = false;
    for (let i = 0; i < 245; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/watchlist/items`, {
        headers: { 'X-Market-Pulse-Key': 'test-only-key', 'X-Forwarded-For': `198.51.100.${i}` },
      });
      await res.arrayBuffer();
      if (res.status === 429) { limited = true; break; }
    }
    assert.equal(limited, true);
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
