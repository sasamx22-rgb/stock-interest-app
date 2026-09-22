function seoulClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

const SCHEDULES = [
  { type: 'morning', minuteOfDay: 8 * 60 },
  { type: 'premarket', minuteOfDay: 8 * 60 + 50 },
];

export class DailyReportScheduler {
  constructor({
    generateReport,
    enabled = true,
    intervalMs = 30_000,
    catchupWindowMinutes = 10,
    retryDelayMs = 5 * 60_000,
    logger = console,
  }) {
    this.generateReport = generateReport;
    this.enabled = enabled;
    this.intervalMs = intervalMs;
    this.catchupWindowMinutes = catchupWindowMinutes;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
    this.completed = new Set();
    this.inFlight = new Set();
    this.retryAfter = new Map();
    this.timer = null;
  }

  async check(now = new Date()) {
    if (!this.enabled) return [];

    const clock = seoulClock(now);
    const results = [];

    for (const schedule of SCHEDULES) {
      const key = `${clock.date}:${schedule.type}`;
      if (this.completed.has(key) || this.inFlight.has(key)) continue;
      if ((this.retryAfter.get(key) ?? 0) > now.getTime()) continue;

      const delta = clock.minutes - schedule.minuteOfDay;
      if (delta < 0 || delta >= this.catchupWindowMinutes) continue;

      this.inFlight.add(key);
      try {
        const report = await this.generateReport(schedule.type);
        if (report) {
          this.completed.add(key);
          results.push({ type: schedule.type, status: 'completed', reportId: report.id });
        } else {
          this.retryAfter.set(key, now.getTime() + this.retryDelayMs);
          results.push({ type: schedule.type, status: 'skipped' });
        }
      } catch (error) {
        this.retryAfter.set(key, now.getTime() + this.retryDelayMs);
        this.logger.error?.('Daily report generation failed', error);
        results.push({
          type: schedule.type,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.inFlight.delete(key);
      }
    }

    return results;
  }

  start() {
    if (!this.enabled || this.timer) return;
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  get active() {
    return Boolean(this.timer);
  }
}

export { seoulClock };
