import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

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
      MARKET_PULSE_API_KEY: 'test-only-key', OPENAI_API_KEY: '',
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
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
