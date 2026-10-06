import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngagementStore } from '../src/engagement-store.mjs';
import { summarizeMovementReason } from '../src/movement-reason.mjs';
import { SurgePushMonitor } from '../src/surge-push-monitor.mjs';
import { sendExpoPushNotifications } from '../src/expo-push.mjs';
import { NaverMarketProvider, normalizeBasicQuote, normalizePriceHistory } from '../src/naver-provider.mjs';
import { readJsonBody } from '../src/http-body.mjs';
import { BoundedCache } from '../src/bounded-cache.mjs';
import { ReportStore } from '../src/report-store.mjs';

test('concurrent read markers survive through two store instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'release-review-'));
  try {
    const filePath = join(directory, 'engagement.json');
    const stores = [new EngagementStore({ filePath }), new EngagementStore({ filePath })];
    await stores[0].save({ readReports: {}, stockViews: [] });
    await Promise.all(Array.from({ length: 20 }, (_, i) => stores[i % 2].markReportRead(`report-${i}`)));
    assert.equal(Object.keys((await stores[0].get()).readReports).length, 20);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('dividend-only evidence does not crash stock detail', () => {
  const result = summarizeMovementReason(
    { name: 'Example', changePercent: 1, volumeRatio: 1 }, [],
    [{ type: 'dividend', title: 'Example 배당락' }],
  );
  assert.match(result.summary, /Example 배당락/);
});

test('a transport failure is retried while the alert remains eligible', async () => {
  let alerts = [];
  let attempts = 0;
  const monitor = new SurgePushMonitor({
    loadAlerts: async () => alerts,
    getTokens: async () => [{ token: 'ExpoPushToken[a]' }],
    sendPush: async () => {
      if (++attempts === 1) throw new Error('temporary failure');
      return { sent: 1 };
    },
    removeToken: async () => {}, logger: { error() {} },
  });
  await monitor.check();
  alerts = [{ market: 'KR', symbol: '005930' }];
  await monitor.check();
  await monitor.check();
  assert.equal(attempts, 2);
});

test('large alert batches fit a push payload and rejected tickets are not sent', async () => {
  let message;
  const result = await sendExpoPushNotifications(['ExpoPushToken[a]'],
    Array.from({ length: 200 }, (_, i) => ({ market: 'US', symbol: `TEST${i}`, name: '테스트종목', changePercent: 6, volumeRatio: 4 })),
    { fetchImpl: async (_url, options) => {
      [message] = JSON.parse(options.body);
      return { ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) };
    } },
  );
  assert.ok(Buffer.byteLength(JSON.stringify(message)) < 4096);
  assert.equal(result.sent, 0);
});

test('JSON preserves Korean characters split between transport chunks', async () => {
  const input = Buffer.from(JSON.stringify({ name: '삼성전자' }));
  async function* chunks() {
    for (const byte of input) yield Buffer.from([byte]);
  }
  assert.deepEqual(await readJsonBody(chunks()), { name: '삼성전자' });
  await assert.rejects(readJsonBody(chunks(), 3), { statusCode: 413 });
});

test('invalid quote payloads cannot become zero-priced live quotes', () => {
  for (const payload of [null, {}, { closePrice: '' }, { closePrice: 'N/A' }]) {
    assert.throws(() => normalizeBasicQuote(payload, '005930'));
  }
});

test('volume enrichment uses the configured rule and correct historical sessions', async () => {
  const provider = new NaverMarketProvider();
  provider.priceHistory = async () => [
    { date: '2026-09-21', volume: 300 },
    { date: '2026-09-18', volume: 100 },
    { date: '2026-09-17', volume: 200 },
  ];
  const quote = { market: 'KR', naverCode: '005930', changePercent: 4, volumeRatio: 0,
    volume: 800, updatedAt: '2026-09-22T10:00:00+09:00' };
  const [enriched] = await provider.enrichVolumeRatios([quote], { changePercent: 3, volumeRatio: 3 });
  assert.equal(enriched.volumeRatio, 4);
  const [unknown] = await provider.enrichVolumeRatios([{ ...quote, volume: 0 }], { changePercent: 3, volumeRatio: 3 });
  assert.equal(unknown.volumeRatio, 0);
});

test('historical cache keys remain bounded after many distinct symbols', () => {
  const cache = new BoundedCache(3);
  for (let i = 0; i < 100; i++) cache.set(`stock-${i}`, i);
  assert.equal(cache.size, 3);
  assert.equal(cache.has('stock-0'), false);
  assert.equal(cache.get('stock-99'), 99);
});


test('report library keeps more than 400 entries and preserves an existing PDF link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'report-library-'));
  try {
    const store = new ReportStore({ filePath: join(directory, 'reports.json') });
    for (let i = 0; i < 405; i++) {
      await store.upsert({
        id: `report-${String(i).padStart(3, '0')}`,
        title: `Report ${i}`,
        publishedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        type: i % 2 ? 'morning' : 'premarket',
        summary: 'summary',
        tickers: [],
        ...(i === 404 ? { pdfUrl: '/api/reports/report-404/pdf' } : {}),
      });
    }
    assert.equal((await store.getAll()).length, 405);
    const updated = await store.upsert({
      id: 'report-404',
      title: 'Updated report',
      publishedAt: new Date(Date.UTC(2026, 0, 2)).toISOString(),
      type: 'morning',
      summary: 'updated',
      tickers: [],
    });
    assert.equal(updated.pdfUrl, '/api/reports/report-404/pdf');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('reopening a report keeps its first read timestamp', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'first-read-'));
  try {
    const store = new EngagementStore({ filePath: join(directory, 'engagement.json') });
    await store.markReportRead('report-1', new Date('2026-09-20T01:00:00Z'));
    await store.markReportRead('report-1', new Date('2026-09-23T01:00:00Z'));
    const state = await store.get();
    assert.equal(state.readReports['report-1'], '2026-09-20T01:00:00.000Z');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('price history is deduplicated by session and sorted newest first', () => {
  const prices = normalizePriceHistory({
    data: [
      { localDate: '2026-09-20', closePrice: '100' },
      { localDate: '2026-09-22', closePrice: '120' },
      { localDate: '2026-09-22', closePrice: '119' },
      { localDate: '2026-09-21', closePrice: '110' },
      { localDate: 'bad', closePrice: '999' },
    ],
  });
  assert.deepEqual(prices.map((item) => item.date), [
    '2026-09-22',
    '2026-09-21',
    '2026-09-20',
  ]);
  assert.equal(prices[0].closePrice, 120);
});

test('surge monitor skips market polling when no devices are registered', async () => {
  let marketCalls = 0;
  const monitor = new SurgePushMonitor({
    loadAlerts: async () => { marketCalls += 1; return []; },
    getTokens: async () => [],
    sendPush: async () => ({ sent: 0 }),
    removeToken: async () => {},
    logger: { error() {} },
  });
  const result = await monitor.check();
  assert.equal(result.noDevices, true);
  assert.equal(marketCalls, 0);
});
