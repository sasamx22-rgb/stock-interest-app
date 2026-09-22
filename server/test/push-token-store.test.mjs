import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { PushTokenStore, isValidExpoPushToken } from '../src/push-token-store.mjs';

test('validates Expo push token formats', () => {
  assert.equal(isValidExpoPushToken('ExponentPushToken[abc_123-XYZ]'), true);
  assert.equal(isValidExpoPushToken('ExpoPushToken[abc_123-XYZ]'), true);
  assert.equal(isValidExpoPushToken('not-a-token'), false);
});

test('persists, updates and removes push tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-push-'));
  const filePath = join(directory, 'push-tokens.json');

  try {
    const store = new PushTokenStore({ filePath });
    const token = 'ExpoPushToken[device_123]';

    await store.register({ token, platform: 'android' });
    await store.register({ token, platform: 'android' });
    assert.equal((await store.getAll()).length, 1);

    await store.remove(token);
    assert.deepEqual(await store.getAll(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
