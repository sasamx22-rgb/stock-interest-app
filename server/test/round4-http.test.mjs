import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

async function freePort() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  await new Promise(r => s.close(r));
  return port;
}
test('calendar outage degrades home; stored reports/read-state work during Naver outage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'r4-http-'));
  const port = await freePort();
  // This preload affects only the child provider calls, never the test's HTTP client.
  const preload = `globalThis.fetch = async (url) => {
    if (String(url).includes('ranking')) return {ok:true,json:async()=>[]};
    throw new Error('external providers offline');
  };`;
  const child = spawn(process.execPath, ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`, 'src/server.mjs'], {
    cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATA_DIR: dir,
      MARKET_PULSE_API_KEY: 'app', MARKET_PULSE_PUBLISH_KEY: 'publisher', OPENAI_API_KEY: '', WATCHLIST: '',
      NAVER_KR_MOVERS_URL: 'https://example.test/ranking/kr', NAVER_US_MOVERS_URL: 'https://example.test/ranking/us' },
  });
  let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'X-Market-Pulse-Key': 'app' };
  try {
    let started = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) { started = true; break; } } catch {}
      await new Promise(r => setTimeout(r, 20));
    }
    assert.ok(started, logs);
    const home = await fetch(`${base}/api/home/briefing`, { headers });
    assert.equal(home.status, 200, logs);
    assert.deepEqual((await home.json()).dataStatus, { calendar: 'unavailable' });
    const saved = await fetch(`${base}/api/reports`, { method: 'POST', headers: {
      'X-Market-Pulse-Key': 'publisher', 'Content-Type': 'application/json',
    }, body: JSON.stringify({ id: 'offline-report', type: 'morning', title: 'Saved', summary: 'Stored content', publishedAt: new Date().toISOString(), tickers: ['MISSING'] }) });
    assert.equal(saved.status, 201);
    // A market-dependent request must fail, proving this is not a healthy Naver mock.
    assert.equal((await fetch(`${base}/api/stocks/KR/005930`, { headers })).status, 502);
    assert.equal((await fetch(`${base}/api/reports/offline-report`, { headers })).status, 200);
    const reports = await fetch(`${base}/api/reports`, { headers });
    assert.equal((await reports.json())[0].id, 'offline-report');
    const readState = await fetch(`${base}/api/reports/read-state`, { headers });
    assert.equal(readState.status, 200);
    assert.deepEqual((await readState.json()).unreadReportIds, ['offline-report']);
  } finally {
    const exited = new Promise(r => child.once('exit', r));
    child.kill('SIGTERM'); await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
