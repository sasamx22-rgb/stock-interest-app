// Audit characterizations: tests marked "known limitation" describe the pinned
// V1 behavior, not a requirement to preserve the defect after a future fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { EconomicCalendarProvider } from '../src/economic-calendar-provider.mjs';

function api(fetchImpl, timers = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../../mobile/src/lib/market-api.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: () => ({}), fetch: fetchImpl, AbortController, URL, console,
    process: { env: { EXPO_PUBLIC_API_BASE_URL: 'https://audit.invalid', EXPO_PUBLIC_API_KEY: 'app' } },
    setTimeout: (fn, ms) => ms === 1000 ? (queueMicrotask(fn), 1) : 2,
    clearTimeout() {}, ...timers,
  });
  return exports;
}
const ok = () => ({ ok: true, json: async () => [] });
for (const failure of ['network', 502, 503, 504, 401, 403, 404]) {
  test(`V1 GET retry matrix: ${failure}`, async () => {
    let calls = 0;
    const client = api(async () => {
      calls++;
      if (calls > 1) return ok();
      if (failure === 'network') throw new TypeError('Network unavailable');
      return { ok: false, status: failure };
    });
    if (['network', 502, 503, 504].includes(failure)) {
      await client.getReports(); assert.equal(calls, 2);
    } else {
      await assert.rejects(client.getReports()); assert.equal(calls, 1);
    }
  });
}
test('V1 successful GET is single; failures stop after two; mutations never retry', async () => {
  let calls = 0;
  await api(async () => { calls++; return ok(); }).getReports();
  assert.equal(calls, 1);
  calls = 0;
  const failed = api(async () => { calls++; throw new TypeError('offline'); });
  await assert.rejects(failed.getReports()); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(failed.addWatchlistItem({ market: 'KR', code: '005930', name: 'Samsung' }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(failed.removeWatchlistItem({ market: 'KR', code: '005930' }));
  assert.equal(calls, 1);
});
test('known limitation: GET clears its abort timer before consuming response body', async () => {
  let cleared = false, clearedDuringBody;
  const client = api(async () => ({ ok: true, json: async () => {
    clearedDuringBody = cleared; return [];
  } }), { clearTimeout: () => { cleared = true; } });
  await client.getReports();
  assert.equal(clearedDuringBody, true);
});
const now = new Date('2026-09-23T00:00:00Z');
const ics = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
test('known limitation: simultaneous cold corporate calendars duplicate all 17 requests', async () => {
  let calls = 0;
  const provider = new EconomicCalendarProvider({ fetchImpl: async url => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    return String(url).endsWith('.ics') ? { ok: true, text: async () => ics }
      : { ok: true, json: async () => ({ data: { rows: [] } }) };
  } });
  await Promise.all([
    provider.upcoming({ days: 7, symbols: ['NVDA'], now }),
    provider.upcoming({ days: 21, symbols: ['AAPL'], now }),
  ]);
  assert.equal(calls, 34);
  await provider.upcoming({ days: 2, symbols: ['MSFT'], now });
  assert.equal(calls, 34); // Sequential source sharing works.
});
test('known limitation: partial corporate outage is cached after provider recovers', async () => {
  let calls = 0, failed = true;
  const provider = new EconomicCalendarProvider({ fetchImpl: async url => {
    calls++;
    if (String(url).endsWith('.ics')) return { ok: true, text: async () => ics };
    if (failed) throw new Error('Nasdaq unavailable');
    return { ok: true, json: async () => ({ data: { rows: [{ symbol: 'NVDA', time: 'After Hours' }] } }) };
  } });
  const first = await provider.upcoming({ days: 7, symbols: ['NVDA'], now });
  assert.equal(calls, 17);
  failed = false;
  const second = await provider.upcoming({ days: 7, symbols: ['NVDA'], now });
  assert.equal(calls, 17);
  assert.deepEqual(second, first);
  assert.equal(second.filter(event => event.tickers.includes('NVDA')).length, 0);
});
