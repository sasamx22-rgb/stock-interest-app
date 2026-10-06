import test from 'node:test';
import assert from 'node:assert/strict';
import { NaverMarketProvider } from '../src/naver-provider.mjs';
import { EconomicCalendarProvider } from '../src/economic-calendar-provider.mjs';

for (const payload of [
  { data: { error: 'unavailable' } },
  { result: { byCode: { '005930': { price_v2: 100 } } } },
  { message: 'upstream unavailable', code: 500 },
]) {
  test(`reject unknown ranking shape without caching: ${JSON.stringify(payload)}`, async () => {
    let calls = 0;
    const p = new NaverMarketProvider({ fetchImpl: async () => {
      calls++; return { ok: true, json: async () => payload };
    } });
    for (let i = 0; i < 2; i++) await assert.rejects(p.movers('KR', 'test'));
    assert.equal(calls, 2);
  });
}

test('FOMC hardcoded event cannot mask total external calendar outage', async () => {
  const p = new EconomicCalendarProvider({ fetchImpl: async () => { throw Error('offline'); } });
  await assert.rejects(p.upcoming({ days: 7, now: new Date('2026-10-27T00:00:00Z') }));
});

test('HTTP 200 calendar error bodies are provider failures', async () => {
  const p = new EconomicCalendarProvider({ fetchImpl: async () => ({
    ok: true, text: async () => '<html>service unavailable</html>',
    json: async () => ({ data: null, status: { rCode: 500, bCodeMessage: 'unavailable' } }),
  }) });
  await assert.rejects(p.upcoming({ days: 1, now: new Date('2026-09-23T00:00:00Z') }));
});

for (const payload of [{ error: 'offline' }, { rows: [{ renamed: 'unknown' }] }]) {
  test(`supplemental HTTP 200 failure is unavailable: ${JSON.stringify(payload)}`, async () => {
    const p = new NaverMarketProvider({ fetchImpl: async () => ({ ok: true, json: async () => payload }) });
    p.quote = async () => ({ name: 'test', price: 100, market: 'KR', changePercent: 1 });
    const d = await p.stockDetail('005930', 'test', 'KR', []);
    assert.deepEqual(d.availability, { prices: 'unavailable', news: 'unavailable' });
    assert.equal(p.priceHistoryCache.size, 0);
    assert.equal(p.newsCache.size, 0);
  });
}

test('explicit empty feeds remain valid and cacheable', async () => {
  let calls = 0;
  const p = new NaverMarketProvider({ fetchImpl: async () => { calls++; return { ok: true, json: async () => [] }; } });
  assert.deepEqual(await p.movers('KR', 'empty'), []);
  assert.deepEqual(await p.movers('KR', 'empty'), []);
  assert.equal(calls, 1);
  p.quote = async () => ({ name: 'test', price: 100, market: 'KR', changePercent: 0 });
  assert.deepEqual((await p.stockDetail('005930')).availability, { prices: 'ok', news: 'ok' });
});

test('valid empty BLS/Nasdaq responses do not become an outage', async () => {
  const p = new EconomicCalendarProvider({ fetchImpl: async () => ({
    ok: true, text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    json: async () => ({ data: { rows: [] }, status: { rCode: 200 } }),
  }) });
  assert.deepEqual(await p.upcoming({ days: 1, now: new Date('2026-09-23T00:00:00Z') }), []);
});
