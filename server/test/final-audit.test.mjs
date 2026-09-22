import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NaverMarketProvider, normalizeRankingPayload, normalizePriceHistory, normalizeBasicQuote } from '../src/naver-provider.mjs';
import { withFileLock, atomicWriteFile } from '../src/file-storage.mjs';
import { PushReceiptStore } from '../src/push-receipt-store.mjs';
import { PushReceiptMonitor } from '../src/push-receipt-monitor.mjs';
import { AiBudgetStore } from '../src/ai-budget-store.mjs';
import { EngagementStore } from '../src/engagement-store.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('captured US ranking names are recognized', async () => {
  const rows = await fixture('naver-us-ranking');
  const quotes = normalizeRankingPayload(rows, 'US');
  assert.equal(quotes.length, rows.length);
  assert.equal(quotes[0].name, rows[0].koreanCodeName);
});

test('captured KR ranking volume is preserved', async () => {
  const rows = await fixture('naver-kr-ranking');
  assert.equal(normalizeRankingPayload(rows, 'KR')[0].volume, Number(rows[0].tradeVolume));
});

for (const market of ['kr', 'us']) {
  test(`captured ${market} history dates and prices are recognized`, async () => {
    const data = await fixture(`naver-${market}-history`);
    const rows = data.items ?? data;
    const history = normalizePriceHistory(data);
    assert.equal(history.length, rows.length);
    assert.equal(history[0].date, '2026-09-22');
  });
}

test('invalid calendar dates do not enter price history', () => {
  assert.deepEqual(normalizePriceHistory([{ localDate: '2026-02-30', closePrice: '10' }]), []);
});

test('a missing timestamp is not manufactured as a current trade', () => {
  assert.equal(normalizeBasicQuote({ closePrice: '10', fluctuationsRatio: '0' }, '005930').updatedAt, '');
});

test('in-flight dedupe shares success and failure, then permits retry', async () => {
  let calls = 0;
  const gate = deferred();
  const provider = new NaverMarketProvider({ fetchImpl: async () => {
    calls++;
    await gate.promise;
    if (calls === 1) throw new Error('upstream');
    return { ok: true, json: async () => ({ ok: true }) };
  } });
  const first = provider.fetchJson('same');
  const second = provider.fetchJson('same');
  gate.resolve();
  const failures = await Promise.allSettled([first, second]);
  assert.equal(calls, 1);
  assert.ok(failures.every((item) => item.status === 'rejected'));
  assert.equal(provider.inFlight.size, 0);
  assert.deepEqual(await provider.fetchJson('same'), { ok: true });
  assert.equal(calls, 2);
  assert.equal(provider.inFlight.size, 0);
});

test('watchlist workers bound concurrency to six and preserve order on rejection', async () => {
  const provider = new NaverMarketProvider();
  let active = 0, peak = 0;
  provider.quote = async (code) => {
    active++; peak = Math.max(peak, active);
    await new Promise(setImmediate);
    active--;
    if (code === '7') throw new Error('test');
    return code;
  };
  const result = await provider.watchlist(Array.from({ length: 20 }, (_, i) => ({ code: String(i) })));
  assert.equal(peak, 6);
  assert.deepEqual(result, Array.from({ length: 20 }, (_, i) => String(i)).filter((x) => x !== '7'));
});

test('volume workers bound concurrency to five; candidate cap remains twenty', async () => {
  const provider = new NaverMarketProvider();
  let active = 0, peak = 0, calls = 0;
  provider.priceHistory = async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(setImmediate); active--; return [];
  };
  await provider.enrichVolumeRatios(Array.from({ length: 30 }, (_, i) => ({
    market: 'KR', naverCode: String(i), changePercent: 6, volumeRatio: 0,
  })));
  assert.equal(peak, 5);
  assert.equal(calls, 20);
});

test('expired receipt-only files are cleaned without a new push', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-audit-'));
  try {
    const filePath = join(directory, 'receipts.json');
    await new PushReceiptStore({ filePath }).save([{ id: 'old', token: 'ExpoPushToken[a]', createdAt: '2000-01-01T00:00:00Z' }]);
    const store = new PushReceiptStore({ filePath });
    const monitor = new PushReceiptMonitor({ receiptStore: store, getReceipts: async () => { throw new Error('must not call'); }, removeToken: async () => {} });
    await monitor.check();
    assert.deepEqual(await store.getAll(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('pending receipts survive a new Store/Monitor and remove invalid tokens', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-restart-'));
  try {
    const filePath = join(directory, 'receipts.json');
    await new PushReceiptStore({ filePath }).save([
      { id: 'gone', token: 'ExpoPushToken[a]', createdAt: new Date(Date.now() - 16 * 60_000).toISOString() },
      { id: 'later', token: 'ExpoPushToken[b]', createdAt: new Date(Date.now() - 16 * 60_000).toISOString() },
    ]);
    const removed = [];
    const store = new PushReceiptStore({ filePath });
    const monitor = new PushReceiptMonitor({ receiptStore: store,
      getReceipts: async () => ({ gone: { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
      removeToken: async (token) => { removed.push(token); } });
    await monitor.check();
    assert.deepEqual(removed, ['ExpoPushToken[a]']);
    assert.deepEqual((await store.getAll()).map((x) => x.id), ['later']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an async descendant cannot retain a released lock lease', async () => {
  const gate = deferred();
  const key = join(tmpdir(), 'lease-audit');
  let descendant, entered = false;
  await withFileLock(key, async () => {
    descendant = gate.promise.then(() => withFileLock(key, async () => { entered = true; }));
  });
  await withFileLock(key, async () => {
    gate.resolve();
    await new Promise(setImmediate);
    assert.equal(entered, false);
  });
  await descendant;
  assert.equal(entered, true);
});

test('nested operation and file locks complete through two Store instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nested-lock-'));
  try {
    const filePath = join(directory, 'state.json');
    const stores = [new EngagementStore({ filePath }), new EngagementStore({ filePath })];
    await Promise.all(Array.from({ length: 20 }, (_, i) => withFileLock(join(directory, `op-${i % 3}`),
      () => stores[i % 2].markReportRead(String(i)))));
    assert.equal(Object.keys((await stores[0].get()).readReports).length, 20);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('atomic pre-rename write failure preserves existing JSON and queue recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atomic-audit-'));
  try {
    const filePath = join(directory, 'data.json');
    await atomicWriteFile(filePath, '{"old":true}');
    await assert.rejects(withFileLock(filePath, () => atomicWriteFile(filePath, { invalid: 'input' })));
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { old: true });
    await withFileLock(filePath, () => atomicWriteFile(filePath, '{"next":true}'));
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { next: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('two budget Store instances enforce one daily limit concurrently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'budget-audit-'));
  try {
    const filePath = join(directory, 'budget.json');
    const stores = [new AiBudgetStore({ filePath, dailyLimit: 12 }), new AiBudgetStore({ filePath, dailyLimit: 12 })];
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => stores[i % 2].reserve()));
    assert.equal(results.filter((item) => item.allowed).length, 12);
    assert.equal((await stores[0].get()).calls, 12);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
