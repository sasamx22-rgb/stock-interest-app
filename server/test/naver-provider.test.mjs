import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBasicQuote, normalizeRankingPayload } from '../src/naver-provider.mjs';

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

test('extracts nested ranking items without duplicates', () => {
  const result = normalizeRankingPayload({ data: { stocks: [
    { itemCode: '000660', stockName: 'SK하이닉스', closePrice: '294,500', fluctuationsRatio: '5.84', volumeRatio: '3.36' },
    { itemCode: '000660', stockName: 'SK하이닉스', closePrice: '294,500', fluctuationsRatio: '5.84', volumeRatio: '3.36' },
  ] } }, 'KR');

  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, '000660');
  assert.equal(result[0].volumeRatio, 3.36);
});

