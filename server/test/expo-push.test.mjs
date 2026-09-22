import test from 'node:test';
import assert from 'node:assert/strict';

import { sendExpoPushNotifications } from '../src/expo-push.mjs';

test('sends one Expo push message per registered device', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok', id: 'ticket-1' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    };
  };

  const result = await sendExpoPushNotifications(
    ['ExpoPushToken[a]', 'ExpoPushToken[b]'],
    [{
      market: 'KR',
      symbol: '000660',
      name: 'SK하이닉스',
      changePercent: 6.2,
      volumeRatio: 3.4,
    }],
    { fetchImpl },
  );

  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.length, 2);
  assert.equal(body[0].channelId, 'surge-alerts');
  assert.equal(result.sent, 1);
  assert.deepEqual(result.invalidTokens, ['ExpoPushToken[b]']);
});
