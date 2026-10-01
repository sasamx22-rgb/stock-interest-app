import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDailyPicks } from '../src/daily-picks.mjs';

function stock(overrides) {
  return {
    market: 'KR',
    symbol: '005930',
    naverCode: '005930',
    name: '삼성전자',
    changePercent: 1,
    volumeRatio: 1,
    sources: ['watchlist'],
    priorityScore: 2,
    ...overrides,
  };
}

test('ranks overlapping signals news and calendar above plain watchlist stocks', async () => {
  const provider = {
    news: async (code) => code === '000660'
      ? [{ title: 'SK하이닉스 HBM 공급 계약 확대' }]
      : [],
  };

  const picks = await buildDailyPicks({
    provider,
    focusStocks: [
      stock({ naverCode: '005930', symbol: '005930', name: '삼성전자' }),
      stock({
        naverCode: '000660',
        symbol: '000660',
        name: 'SK하이닉스',
        sources: ['watchlist', 'report', 'surge'],
        priorityScore: 11,
        changePercent: 6.2,
        volumeRatio: 3.5,
      }),
      stock({
        market: 'US',
        naverCode: 'NVDA.O',
        symbol: 'NVDA',
        name: 'NVIDIA',
        sources: ['report'],
        priorityScore: 3,
      }),
    ],
    calendarEvents: [{
      type: 'earnings',
      importance: 'high',
      tickers: ['NVDA'],
    }],
  });

  assert.equal(picks[0].name, 'SK하이닉스');
  assert.match(picks[0].pickReason, /급등/);
  assert.match(picks[0].pickReason, /주요 뉴스/);
  assert.ok(picks.find((item) => item.name === 'NVIDIA').pickScore > 3);
});
