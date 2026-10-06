import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTodayFocus } from '../src/today-focus.mjs';

function quote({
  market = 'KR',
  naverCode,
  symbol = naverCode,
  name,
  changePercent = 0,
  alertEligible = false,
}) {
  return {
    symbol,
    naverCode,
    name,
    market,
    price: 100,
    currency: market === 'KR' ? 'KRW' : 'USD',
    changePercent,
    volumeRatio: 1,
    updatedAt: '2026-09-22T09:00:00+09:00',
    source: 'naver',
    alertEligible,
  };
}

test('merges watchlist, report and surge sources into one focus item', async () => {
  const provider = {
    watchlist: async () => [
      quote({ naverCode: '000660', name: 'SK하이닉스', changePercent: 3 }),
    ],
    searchStocks: async () => [],
    quote: async () => null,
  };

  const items = await buildTodayFocus({
    provider,
    watchlistItems: [{ market: 'KR', code: '000660', name: 'SK하이닉스' }],
    reports: [{
      id: 'r1',
      publishedAt: '2026-09-22T08:00:00+09:00',
      tickers: ['SK하이닉스'],
    }],
    movers: [
      quote({
        naverCode: '000660',
        name: 'SK하이닉스',
        changePercent: 6,
        alertEligible: true,
      }),
    ],
    now: new Date('2026-09-22T10:00:00+09:00'),
  });

  assert.equal(items.length, 1);
  assert.deepEqual(new Set(items[0].sources), new Set(['watchlist', 'report', 'surge']));
  assert.deepEqual(items[0].reportIds, ['r1']);
  assert.equal(items[0].alertEligible, true);
});

test('resolves report-only ticker through provider search', async () => {
  const provider = {
    watchlist: async () => [],
    searchStocks: async (ticker) => ticker === 'NVIDIA'
      ? [{ market: 'US', code: 'NVDA.O', symbol: 'NVDA', name: 'NVIDIA' }]
      : [],
    quote: async () => quote({
      market: 'US',
      naverCode: 'NVDA.O',
      symbol: 'NVDA',
      name: 'NVIDIA',
      changePercent: 2,
    }),
  };

  const items = await buildTodayFocus({
    provider,
    watchlistItems: [],
    reports: [{
      id: 'r1',
      publishedAt: '2026-09-22T08:00:00+09:00',
      tickers: ['NVIDIA'],
    }],
    movers: [],
    now: new Date('2026-09-22T10:00:00+09:00'),
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0].sources, ['report']);
  assert.equal(items[0].symbol, 'NVDA');
});
