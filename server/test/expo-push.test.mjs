import test from 'node:test';
import assert from 'node:assert/strict';

import { getExpoPushReceipts, sendExpoPushNotifications } from '../src/expo-push.mjs';

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
  assert.deepEqual(result.receiptTickets, [
    { id: 'ticket-1', token: 'ExpoPushToken[a]' },
  ]);
});

test('queries Expo push receipts by ticket id', async () => {
  const requests = [];
  const receipts = await getExpoPushReceipts(['ticket-1', 'ticket-2'], {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          data: {
            'ticket-1': { status: 'ok' },
            'ticket-2': { status: 'error', details: { error: 'DeviceNotRegistered' } },
          },
        }),
      };
    },
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), { ids: ['ticket-1', 'ticket-2'] });
  assert.equal(receipts['ticket-1'].status, 'ok');
  assert.equal(receipts['ticket-2'].details.error, 'DeviceNotRegistered');
});
