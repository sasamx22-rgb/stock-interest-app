import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNasdaqCalendar, parseBlsIcs } from '../src/economic-calendar-provider.mjs';

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
