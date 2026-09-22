import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NaverMarketProvider,
  normalizeBasicQuote,
  normalizeRankingPayload,
  normalizeSearchPayload,
} from '../src/naver-provider.mjs';

test('normalizes a Korean Naver quote', () => {
  const quote = normalizeBasicQuote({
    stockName: '삼성전자',
    closePrice: '84,200',
    fluctuationsRatio: '2.31',
    accumulatedTradingVolumeRatio: '1.42',
    localTradedAt: '2026-09-22T15:30:00+09:00',
  }, '005930');

  assert.equal(quote.market, 'KR');
  assert.equal(quote.price, 84200);
  assert.equal(quote.changePercent, 2.31);
  assert.equal(quote.currency, 'KRW');
});

test('normalizes a US Naver quote', () => {
  const quote = normalizeBasicQuote({
    stockName: 'NVIDIA',
    closePrice: '184.62',
    fluctuationsRatio: '1.76',
    localTradedAt: '2026-09-22T16:00:00-04:00',
  }, 'NVDA.O');

  assert.equal(quote.symbol, 'NVDA');
  assert.equal(quote.market, 'US');
  assert.equal(quote.price, 184.62);
  assert.equal(quote.changePercent, 1.76);
  assert.equal(quote.currency, 'USD');
});

test('extracts nested ranking items without duplicates', () => {
  const result = normalizeRankingPayload({ data: { stocks: [
    { itemCode: '000660', stockName: 'SK하이닉스', closePrice: '294,500', fluctuationsRatio: '5.84', volumeRatio: '3.36' },
    { itemCode: '000660', stockName: 'SK하이닉스', closePrice: '294,500', fluctuationsRatio: '5.84', volumeRatio: '3.36' },
  ] } }, 'KR');

  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, '000660');
  assert.equal(result[0].volumeRatio, 3.36);
});

test('supports current Naver ranking field names', () => {
  const result = normalizeRankingPayload([
    {
      itemcode: '035420',
      itemname: 'NAVER',
      nowPrice: '318,500',
      prevChangeRate: '5.24',
      quantRate: '3.41',
    },
  ], 'KR');

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'NAVER');
  assert.equal(result[0].price, 318500);
  assert.equal(result[0].changePercent, 5.24);
  assert.equal(result[0].volumeRatio, 3.41);
});

test('normalizes Korean and US autocomplete results only', () => {
  const result = normalizeSearchPayload({
    data: [
      { itemCode: '005930', itemName: '삼성전자', nationType: 'KOR' },
      { itemCode: 'NVDA', reutersCode: 'NVDA.O', stockName: 'NVIDIA', nationType: 'USA' },
      { itemCode: '7203', itemName: 'Toyota', nationType: 'JPN' },
    ],
  });

  assert.deepEqual(result, [
    { market: 'KR', code: '005930', symbol: '005930', name: '삼성전자' },
    { market: 'US', code: 'NVDA.O', symbol: 'NVDA', name: 'NVIDIA' },
  ]);
});

test('uses the foreign-stock basic endpoint for US watchlist quotes', async () => {
  const calls = [];
  const provider = new NaverMarketProvider({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          stockName: 'NVIDIA',
          closePrice: '184.62',
          fluctuationsRatio: '1.76',
        }),
      };
    },
  });

  const quote = await provider.quote('NVDA.O', 'NVIDIA');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://stock.naver.com/api/securityService/stock/NVDA.O/basic');
  assert.equal(calls[0].options.headers.Referer, 'https://stock.naver.com/');
  assert.equal(quote.market, 'US');
  assert.equal(quote.name, 'NVIDIA');
});

test('uses Naver public stock autocomplete for watchlist search', async () => {
  const calls = [];
  const provider = new NaverMarketProvider({
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({
          data: [{ itemCode: '005930', itemName: '삼성전자', nationType: 'KOR' }],
        }),
      };
    },
  });

  const result = await provider.searchStocks('삼성전자');

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0],
    'https://stock.naver.com/api/autocomplete/search/autoComplete?query=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90&target=stock',
  );
  assert.equal(result[0].code, '005930');
});
