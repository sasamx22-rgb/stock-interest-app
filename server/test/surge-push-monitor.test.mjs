import test from 'node:test';
import assert from 'node:assert/strict';

import { SurgePushMonitor } from '../src/surge-push-monitor.mjs';

const first = {
  market: 'KR',
  symbol: '000660',
  name: 'SK하이닉스',
  changePercent: 5.4,
  volumeRatio: 3.1,
};

const second = {
  market: 'US',
  symbol: 'NVDA',
  name: 'NVIDIA',
  changePercent: 6.1,
  volumeRatio: 3.6,
};

test('establishes a baseline before sending newly eligible alerts', async () => {
  let calls = 0;
  const sent = [];
  const monitor = new SurgePushMonitor({
    loadAlerts: async () => {
      calls += 1;
      return calls === 1 ? [first] : [first, second];
    },
    getTokens: async () => [{ token: 'ExpoPushToken[a]' }],
    sendPush: async (tokens, alerts) => {
      sent.push({ tokens, alerts });
      return { sent: tokens.length, invalidTokens: [] };
    },
    removeToken: async () => {},
    logger: { error() {} },
  });

  const baseline = await monitor.check();
  const next = await monitor.check();

  assert.equal(baseline.baseline, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].alerts[0].symbol, 'NVDA');
  assert.equal(next.newAlerts, 1);
});
