import test from 'node:test';
import assert from 'node:assert/strict';

import { EconomicCalendarProvider, normalizeNasdaqCalendar, parseBlsIcs } from '../src/economic-calendar-provider.mjs';

test('parses important BLS ICS events', () => {
  const events = parseBlsIcs([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART:20261014T083000',
    'SUMMARY:Consumer Price Index for September 2026',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261020T100000',
    'SUMMARY:Low priority unrelated release',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n'));

  assert.equal(events.length, 1);
  assert.match(events[0].title, /Consumer Price Index/);
  assert.equal(events[0].importance, 'high');
});

test('normalizes Nasdaq earnings and dividend rows', () => {
  const earnings = normalizeNasdaqCalendar({
    data: { rows: [{ symbol: 'NVDA', time: 'After Hours' }] },
  }, 'earnings', '2026-11-18');

  const dividends = normalizeNasdaqCalendar({
    data: { calendar: { rows: [{ symbol: 'AAPL', dividend_Ex_Date: '11/06/2026' }] } },
  }, 'dividends', '2026-11-06');

  assert.equal(earnings[0].type, 'earnings');
  assert.equal(earnings[0].tickers[0], 'NVDA');
  assert.equal(dividends[0].type, 'dividend');
  assert.match(dividends[0].startsAt, /^2026-11-06/);
});


test('shares external calendar source data across symbols and screen horizons', async () => {
  let calls = 0;
  const provider = new EconomicCalendarProvider({
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).endsWith('.ics')) {
        return { ok: true, text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' };
      }
      return {
        ok: true,
        json: async () => ({
          data: { rows: [
            { symbol: 'NVDA', time: 'After Hours' },
            { symbol: 'AAPL', time: 'Before Hours' },
          ] },
        }),
      };
    },
  });

  const now = new Date('2026-09-23T00:00:00Z');
  await provider.upcoming({ days: 7, symbols: ['NVDA'], now });
  const firstCalls = calls;
  await provider.upcoming({ days: 2, symbols: ['AAPL'], now });

  assert.equal(firstCalls, 17);
  assert.equal(calls, firstCalls);
});

test('skips Nasdaq calendar requests when there are no US watchlist symbols', async () => {
  const calls = [];
  const provider = new EconomicCalendarProvider({
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true, text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' };
    },
  });

  await provider.upcoming({
    days: 7,
    symbols: [],
    now: new Date('2026-09-23T00:00:00Z'),
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /bls\.ics$/);
});
