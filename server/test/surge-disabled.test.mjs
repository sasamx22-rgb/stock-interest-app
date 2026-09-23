import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('surge monitoring is disabled by default and does not require ranking feeds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'surge-disabled-'));
  const child = spawn(process.execPath, ['src/server.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      DATA_DIR: directory,
      MARKET_PULSE_API_KEY: 'app-key',
      MARKET_PULSE_PUBLISH_KEY: 'publisher-key',
      OPENAI_API_KEY: '',
      WATCHLIST: '',
      NAVER_KR_MOVERS_URL: 'http://127.0.0.1:9/kr',
      NAVER_US_MOVERS_URL: 'http://127.0.0.1:9/us',
      SURGE_ALERTS_ENABLED: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5_000);
      child.once('error', reject);
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Server exited during startup'));
      });
      child.stdout.on('data', (data) => {
        const match = String(data).match(/0\.0\.0\.0:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });

    const headers = { 'X-Market-Pulse-Key': 'app-key' };
    const base = `http://127.0.0.1:${port}`;

    const movers = await fetch(`${base}/api/movers`, { headers });
    assert.equal(movers.status, 200);
    assert.deepEqual(await movers.json(), []);

    const alerts = await fetch(`${base}/api/alerts`, { headers });
    assert.equal(alerts.status, 200);
    assert.deepEqual(await alerts.json(), []);

    const status = await fetch(`${base}/api/push/status`, { headers });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      featureEnabled: false,
      registeredDevices: 0,
      monitorActive: false,
      intervalSeconds: 120,
    });
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
