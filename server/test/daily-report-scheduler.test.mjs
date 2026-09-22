import test from 'node:test';
import assert from 'node:assert/strict';

import { DailyReportScheduler, seoulClock } from '../src/daily-report-scheduler.mjs';

test('reads Asia/Seoul clock independently of server timezone', () => {
  const value = seoulClock(new Date('2026-09-21T23:00:00Z'));
  assert.equal(value.date, '2026-09-22');
  assert.equal(value.minutes, 8 * 60);
});

test('generates morning and premarket reports once in their catchup windows', async () => {
  const calls = [];
  const scheduler = new DailyReportScheduler({
    generateReport: async (type) => {
      calls.push(type);
      return { id: `2026-09-22-${type}` };
    },
    enabled: true,
    logger: { error() {} },
  });

  await scheduler.check(new Date('2026-09-21T23:03:00Z'));
  await scheduler.check(new Date('2026-09-21T23:04:00Z'));
  await scheduler.check(new Date('2026-09-21T23:53:00Z'));

  assert.deepEqual(calls, ['morning', 'premarket']);
});

test('does nothing when AI scheduling is disabled', async () => {
  let calls = 0;
  const scheduler = new DailyReportScheduler({
    generateReport: async () => {
      calls += 1;
      return {};
    },
    enabled: false,
  });

  await scheduler.check(new Date('2026-09-21T23:03:00Z'));
  assert.equal(calls, 0);
});
