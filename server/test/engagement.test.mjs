import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EngagementStore } from '../src/engagement-store.mjs';
import { buildEngagementSummary, buildWeeklyReview } from '../src/engagement-service.mjs';

test('tracks report reads and stock views', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-pulse-engagement-'));
  try {
    const store = new EngagementStore({ filePath: join(directory, 'engagement.json') });
    await store.markReportRead('r1', new Date('2026-09-22T01:00:00Z'));
    await store.logStockView(
      { market: 'KR', code: '005930', name: '삼성전자' },
      new Date('2026-09-22T02:00:00Z'),
    );

    const state = await store.get();
    assert.ok(state.readReports.r1);
    assert.equal(state.stockViews.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('builds unread reports, three daily picks and weekly review', () => {
  const engagement = {
    readReports: { r1: '2026-09-21T10:00:00Z' },
    stockViews: [
      { market: 'KR', code: '005930', name: '삼성전자', viewedAt: '2026-09-21T10:00:00Z' },
      { market: 'KR', code: '005930', name: '삼성전자', viewedAt: '2026-09-22T10:00:00Z' },
      { market: 'US', code: 'NVDA.O', name: 'NVIDIA', viewedAt: '2026-09-22T11:00:00Z' },
    ],
  };

  const reports = [
    { id: 'r1', publishedAt: '2026-09-21T08:00:00Z' },
    { id: 'r2', publishedAt: '2026-09-22T08:00:00Z' },
  ];

  const focusStocks = [
    { symbol: '005930', sources: ['report', 'watchlist'] },
    { symbol: 'NVDA', sources: ['surge'] },
    { symbol: '000660', sources: ['report'] },
    { symbol: 'AAPL', sources: ['watchlist'] },
  ];

  const summary = buildEngagementSummary({ reports, engagement, focusStocks });
  assert.deepEqual(summary.unreadReportIds, ['r2']);
  assert.equal(summary.dailyPicks.length, 3);

  const review = buildWeeklyReview({
    engagement,
    reports,
    watchlistItems: [{}, {}],
    now: new Date('2026-09-22T12:00:00Z'),
  });

  assert.equal(review.topViewed[0].name, '삼성전자');
  assert.equal(review.topViewed[0].views, 2);
  assert.equal(review.reportsRead, 1);
});
