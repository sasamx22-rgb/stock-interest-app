import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { WatchlistStore } from '../src/watchlist-store.mjs';

test('persists, deduplicates and removes watchlist items', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-'));
  const filePath = join(directory, 'watchlist.json');

  try {
    const store = new WatchlistStore({
      filePath,
      defaults: [{ market: 'KR', code: '005930', name: '삼성전자' }],
    });

    assert.deepEqual(await store.getAll(), [
      { market: 'KR', code: '005930', name: '삼성전자' },
    ]);

    await store.add({ market: 'US', code: 'NVDA.O', name: 'NVIDIA' });
    await store.add({ market: 'US', code: 'NVDA.O', name: 'NVIDIA duplicate' });

    assert.equal((await store.getAll()).length, 2);

    await store.remove('KR', '005930');
    assert.deepEqual(await store.getAll(), [
      { market: 'US', code: 'NVDA.O', name: 'NVIDIA' },
    ]);

    const disk = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(disk.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
