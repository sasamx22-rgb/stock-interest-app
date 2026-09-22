const BLS_ICS_URL = 'https://www.bls.gov/schedule/news_release/bls.ics';

const FOMC_DATES = [
  ['2026-10-28', '2026년 10월 FOMC 금리결정'],
  ['2026-12-09', '2026년 12월 FOMC 금리결정'],
  ['2027-01-27', '2027년 1월 FOMC 금리결정'],
  ['2027-03-17', '2027년 3월 FOMC 금리결정'],
  ['2027-04-28', '2027년 4월 FOMC 금리결정'],
  ['2027-06-09', '2027년 6월 FOMC 금리결정'],
  ['2027-07-28', '2027년 7월 FOMC 금리결정'],
  ['2027-09-15', '2027년 9월 FOMC 금리결정'],
  ['2027-10-27', '2027년 10월 FOMC 금리결정'],
  ['2027-12-08', '2027년 12월 FOMC 금리결정'],
];

const IMPORTANT_BLS = [
  /Consumer Price Index/i,
  /Employment Situation/i,
  /Producer Price Index/i,
  /Job Openings and Labor Turnover/i,
  /Employment Cost Index/i,
];

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour, minute, second = 0 }, timeZone) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let estimate = new Date(localAsUtc);

  for (let index = 0; index < 2; index += 1) {
    const offset = timeZoneOffsetMs(estimate, timeZone);
    estimate = new Date(localAsUtc - offset);
  }

  return estimate;
}

function parseIcsDate(value, timeZone = 'America/New_York') {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  if (raw.endsWith('Z')) {
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }

  return zonedDateTimeToUtc({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  }, timeZone);
}

export function parseBlsIcs(ics) {
  const blocks = unfoldIcs(ics).split('BEGIN:VEVENT').slice(1);

  return blocks.flatMap((block, index) => {
    const body = block.split('END:VEVENT')[0] ?? '';
    const lines = body.split(/\r?\n/);
    const values = Object.fromEntries(lines.flatMap((line) => {
      const separator = line.indexOf(':');
      if (separator < 0) return [];
      const key = line.slice(0, separator).split(';')[0];
      return [[key, line.slice(separator + 1)]];
    }));

    const summary = String(values.SUMMARY ?? '').replace(/\\,/g, ',').trim();
    if (!IMPORTANT_BLS.some((pattern) => pattern.test(summary))) return [];

    const startLine = lines.find((line) => line.startsWith('DTSTART')) ?? '';
    const timeZone = startLine.match(/TZID=([^;:]+)/)?.[1] ?? 'America/New_York';
    const date = parseIcsDate(values.DTSTART, timeZone);
    if (!date || Number.isNaN(date.getTime())) return [];

    return [{
      id: `bls:${date.toISOString()}:${index}`,
      title: summary,
      type: 'macro',
      startsAt: date.toISOString(),
      market: 'GLOBAL',
      importance: /Consumer Price Index|Employment Situation/i.test(summary) ? 'high' : 'medium',
      tickers: [],
      source: 'BLS',
      url: 'https://www.bls.gov/schedule/',
    }];
  });
}

function normalizeNasdaqRows(payload) {
  const data = payload?.data;
  const candidates = [
    data?.rows,
    data?.calendar?.rows,
    data?.calendar?.data,
  ];
  return candidates.find(Array.isArray) ?? [];
}

function textValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeNasdaqCalendar(payload, kind, date) {
  return normalizeNasdaqRows(payload).flatMap((row, index) => {
    const symbol = textValue(row.symbol ?? row.Symbol);
    if (!symbol) return [];

    if (kind === 'earnings') {
      const time = textValue(row.time ?? row.timeSlot ?? row.when) || '시간 미정';
      const hour = /after/i.test(time) ? 16 : /before|pre/i.test(time) ? 8 : 12;
      const minute = /after/i.test(time) ? 30 : 0;
      return [{
        id: `nasdaq:earnings:${date}:${symbol}`,
        title: `${symbol} 실적 발표`,
        type: 'earnings',
        startsAt: zonedDateTimeToUtc({
          year: Number(date.slice(0, 4)),
          month: Number(date.slice(5, 7)),
          day: Number(date.slice(8, 10)),
          hour,
          minute,
        }, 'America/New_York').toISOString(),
        market: 'US',
        importance: 'high',
        tickers: [symbol],
        source: 'Nasdaq',
        description: time,
        url: 'https://www.nasdaq.com/market-activity/earnings',
      }];
    }

    const exDate = textValue(row.dividend_Ex_Date ?? row.exDividendDate ?? row.exDate) || date;
    const normalizedDate = /^\d{2}\/\d{2}\/\d{4}$/.test(exDate)
      ? `${exDate.slice(6)}-${exDate.slice(0, 2)}-${exDate.slice(3, 5)}`
      : date;

    return [{
      id: `nasdaq:dividend:${normalizedDate}:${symbol}:${index}`,
      title: `${symbol} 배당락`,
      type: 'dividend',
      startsAt: zonedDateTimeToUtc({
        year: Number(normalizedDate.slice(0, 4)),
        month: Number(normalizedDate.slice(5, 7)),
        day: Number(normalizedDate.slice(8, 10)),
        hour: 9,
        minute: 30,
      }, 'America/New_York').toISOString(),
      market: 'US',
      importance: 'medium',
      tickers: [symbol],
      source: 'Nasdaq',
      url: 'https://www.nasdaq.com/market-activity/dividends',
    }];
  });
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export class EconomicCalendarProvider {
  constructor({ fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  async fetchText(url, headers = {}) {
    const response = await this.fetchImpl(url, {
      headers: {
        'User-Agent': 'MarketPulsePersonal/0.4',
        ...headers,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Calendar request failed: ${response.status}`);
    return response.text();
  }

  async fetchJson(url) {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.nasdaq.com',
        Referer: 'https://www.nasdaq.com/',
        'User-Agent': 'Mozilla/5.0 MarketPulsePersonal/0.4',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Calendar request failed: ${response.status}`);
    return response.json();
  }

  async upcoming({ days = 14, symbols = [], now = new Date() } = {}) {
    const boundedDays = Math.min(Math.max(Number(days) || 14, 1), 30);
    const cacheKey = `${dateKey(now)}:${boundedDays}:${symbols.slice().sort().join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 15 * 60_000) return cached.events;

    const end = new Date(now.getTime() + boundedDays * 86_400_000);
    const symbolSet = new Set(symbols.map((symbol) => symbol.toUpperCase()));

    const events = FOMC_DATES.map(([date, title]) => ({
      id: `fed:fomc:${date}`,
      title,
      type: 'fomc',
      startsAt: zonedDateTimeToUtc({
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
        hour: 14,
        minute: 0,
      }, 'America/New_York').toISOString(),
      market: 'GLOBAL',
      importance: 'high',
      tickers: [],
      source: 'Federal Reserve',
      url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    })).filter((event) => {
      const time = Date.parse(event.startsAt);
      return time >= now.getTime() - 86_400_000 && time <= end.getTime();
    });

    try {
      events.push(...parseBlsIcs(await this.fetchText(BLS_ICS_URL)));
    } catch {}

    const dates = [];
    for (let i = 0; i <= Math.min(boundedDays, 7); i += 1) {
      dates.push(dateKey(new Date(now.getTime() + i * 86_400_000)));
    }

    const requests = dates.flatMap((date) => [
      this.fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`)
        .then((payload) => normalizeNasdaqCalendar(payload, 'earnings', date))
        .catch(() => []),
      this.fetchJson(`https://api.nasdaq.com/api/calendar/dividends?date=${date}`)
        .then((payload) => normalizeNasdaqCalendar(payload, 'dividends', date))
        .catch(() => []),
    ]);

    const corporate = (await Promise.all(requests)).flat()
      .filter((event) => symbolSet.size === 0 || event.tickers.some((ticker) => symbolSet.has(ticker.toUpperCase())));

    events.push(...corporate);

    const result = events
      .filter((event) => {
        const time = Date.parse(event.startsAt);
        return time >= now.getTime() - 86_400_000 && time <= end.getTime();
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

    this.cache.set(cacheKey, { at: Date.now(), events: result });
    return result;
  }
}
