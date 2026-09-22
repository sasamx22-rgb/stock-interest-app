import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NaverMarketProvider,
  normalizeBasicQuote,
  normalizeNewsPayload,
  normalizePriceHistory,
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


test('caches mover feed briefly to avoid duplicate Naver requests', async () => {
  let calls = 0;
  const provider = new NaverMarketProvider({
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          data: {
            stocks: [
              {
                itemCode: '000660',
                stockName: 'SK하이닉스',
                closePrice: '294,500',
                fluctuationsRatio: '5.84',
                volumeRatio: '3.36',
              },
            ],
          },
        }),
      };
    },
  });

  const url = 'https://example.test/movers';
  await provider.movers('KR', url);
  await provider.movers('KR', url);

  assert.equal(calls, 1);
});


test('normalizes nested daily price rows', () => {
  const prices = normalizePriceHistory({
    data: {
      prices: [
        { localDate: '2026-09-22', closePrice: '84,200', fluctuationsRatio: '2.31', accumulatedTradingVolume: '12,345,678' },
        { localDate: '2026-09-19', closePrice: '82,300', fluctuationsRatio: '-0.40', accumulatedTradingVolume: '9,876,543' },
      ],
    },
  });

  assert.equal(prices.length, 2);
  assert.equal(prices[0].closePrice, 84200);
  assert.equal(prices[0].volume, 12345678);
});

test('normalizes recent news while keeping URL optional', () => {
  const news = normalizeNewsPayload({
    data: [
      {
        articleTitle: '삼성전자 반도체 관련 주요 뉴스',
        officeName: '테스트경제',
        articleDateTime: '2026-09-22T09:10:00+09:00',
        articleUrl: 'https://example.com/news/1',
      },
      {
        title: 'NVIDIA 신제품 관련 뉴스',
        publisher: 'Example Wire',
        date: '2026-09-22',
      },
    ],
  });

  assert.equal(news.length, 2);
  assert.equal(news[0].publisher, '테스트경제');
  assert.equal(news[0].url, 'https://example.com/news/1');
  assert.equal(news[1].url, undefined);
});

test('stock detail tolerates price or news endpoint failures', async () => {
  const provider = new NaverMarketProvider({
    fetchImpl: async (url) => {
      if (url.includes('/basic')) {
        return {
          ok: true,
          json: async () => ({ stockName: '삼성전자', closePrice: '84,200', fluctuationsRatio: '2.31' }),
        };
      }
      if (url.includes('daily-prices')) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ data: [{ title: '삼성전자 테스트 뉴스 기사', publisher: '테스트' }] }),
      };
    },
  });

  const detail = await provider.stockDetail('005930', '삼성전자', 'KR');
  assert.equal(detail.quote.name, '삼성전자');
  assert.deepEqual(detail.prices, []);
  assert.equal(detail.news.length, 1);
});
