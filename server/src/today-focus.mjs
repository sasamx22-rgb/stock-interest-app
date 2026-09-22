function seoulDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function quoteKey(quote) {
  return `${quote.market}:${String(quote.naverCode ?? quote.symbol).toUpperCase()}`;
}

function sourceScore(sources, alertEligible) {
  return (sources.includes('surge') ? 4 : 0)
    + (sources.includes('report') ? 3 : 0)
    + (sources.includes('watchlist') ? 2 : 0)
    + (alertEligible ? 2 : 0);
}

export async function buildTodayFocus({
  provider,
  watchlistItems,
  reports,
  movers,
  now = new Date(),
}) {
  const today = seoulDateKey(now);
  const todayReports = reports.filter(
    (report) => seoulDateKey(new Date(report.publishedAt)) === today,
  );

  const watchlistQuotes = await provider.watchlist(watchlistItems);
  const byKey = new Map();

  const upsert = (quote, source, reportIds = []) => {
    const key = quoteKey(quote);
    const current = byKey.get(key);
    const sources = new Set(current?.sources ?? []);
    sources.add(source);
    const linkedReports = new Set(current?.reportIds ?? []);
    reportIds.forEach((id) => linkedReports.add(id));

    byKey.set(key, {
      ...(current ?? {}),
      ...quote,
      sources: [...sources],
      reportIds: [...linkedReports],
      alertEligible: Boolean(current?.alertEligible || quote.alertEligible),
    });
  };

  watchlistQuotes.forEach((quote) => upsert(quote, 'watchlist'));

  movers
    .filter((quote) => quote.alertEligible)
    .slice(0, 12)
    .forEach((quote) => upsert(quote, 'surge'));

  const unresolved = [];
  for (const report of todayReports) {
    for (const ticker of report.tickers) {
      const needle = normalizeText(ticker);
      const existing = [...byKey.values()].find((item) => (
        normalizeText(item.name) === needle
        || normalizeText(item.symbol) === needle
        || normalizeText(item.naverCode) === needle
      ));

      if (existing) {
        upsert(existing, 'report', [report.id]);
      } else {
        unresolved.push({ ticker, reportId: report.id });
      }
    }
  }

  const uniqueUnresolved = [];
  const unresolvedSeen = new Set();
  for (const item of unresolved) {
    const key = normalizeText(item.ticker);
    if (!key || unresolvedSeen.has(key)) continue;
    unresolvedSeen.add(key);
    uniqueUnresolved.push(item);
  }

  const resolved = await Promise.allSettled(
    uniqueUnresolved.slice(0, 12).map(async ({ ticker, reportId }) => {
      const results = await provider.searchStocks(ticker);
      if (results.length === 0) return null;

      const exact = results.find((item) => (
        normalizeText(item.name) === normalizeText(ticker)
        || normalizeText(item.symbol) === normalizeText(ticker)
      ));
      const match = exact ?? results[0];
      const quote = await provider.quote(match.code, match.name);
      return { quote, reportId };
    }),
  );

  resolved.forEach((result) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    upsert(result.value.quote, 'report', [result.value.reportId]);
  });

  return [...byKey.values()]
    .map((item) => ({
      ...item,
      priorityScore: sourceScore(item.sources, item.alertEligible),
    }))
    .sort((a, b) => (
      b.priorityScore - a.priorityScore
      || Math.abs(b.changePercent) - Math.abs(a.changePercent)
    ))
    .slice(0, 20);
}

export { seoulDateKey };
