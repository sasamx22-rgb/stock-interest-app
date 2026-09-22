import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AiBudgetStore } from '../src/ai-budget-store.mjs';

test('enforces a persistent daily AI call limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-ai-budget-'));
  try {
    const store = new AiBudgetStore({
      filePath: join(directory, 'ai-budget.json'),
      dailyLimit: 2,
    });
    const now = new Date('2026-09-22T01:00:00Z');

    assert.equal((await store.reserve(now)).allowed, true);
    assert.equal((await store.reserve(now)).allowed, true);
    assert.equal((await store.reserve(now)).allowed, false);
    assert.equal((await store.get(now)).calls, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
