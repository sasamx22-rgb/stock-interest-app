import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AlertSettingsStore, normalizeAlertRule } from '../src/alert-settings-store.mjs';

test('normalizes alert thresholds to one decimal place', () => {
  assert.deepEqual(
    normalizeAlertRule({ changePercent: 5.04, volumeRatio: 3.06 }),
    { changePercent: 5, volumeRatio: 3.1 },
  );
});

test('persists updated alert thresholds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-alert-rule-'));
  const filePath = join(directory, 'alert-settings.json');

  try {
    const store = new AlertSettingsStore({ filePath });
    assert.deepEqual(await store.get(), { changePercent: 5, volumeRatio: 3 });

    await store.update({ changePercent: 7, volumeRatio: 4 });
    assert.deepEqual(await store.get(), { changePercent: 7, volumeRatio: 4 });

    await assert.rejects(
      () => store.update({ changePercent: 100, volumeRatio: 3 }),
      /out of range/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
