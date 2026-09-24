const STRONG_NEWS = [
  /실적/i,
  /영업이익/i,
  /매출/i,
  /가이던스/i,
  /earnings/i,
  /revenue/i,
  /guidance/i,
  /공시/i,
  /증자/i,
  /자사주/i,
  /수주/i,
  /계약/i,
  /공급/i,
  /인수/i,
  /합병/i,
  /목표주가/i,
  /투자의견/i,
  /upgrade/i,
  /downgrade/i,
  /hbm/i,
  /ai\b/i,
  /gpu/i,
];

function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

function matchesEvent(stock, event) {
  if (!Array.isArray(event.tickers) || event.tickers.length === 0) return false;
  const targets = new Set([
    normalized(stock.symbol),
    normalized(stock.naverCode),
    normalized(stock.name),
  ]);
  return event.tickers.some((ticker) => targets.has(normalized(ticker)));
}

function eventLabel(event) {
  if (event.type === 'earnings') return '실적 일정';
  if (event.type === 'dividend') return '배당 일정';
  if (event.type === 'filing') return '공시 일정';
  return '기업 일정';
}

function sourceSignal(stock) {
  const labels = [];
  if (stock.sources.includes('watchlist')) labels.push('내 관심');
  if (stock.sources.includes('report')) labels.push('보고서');
  if (stock.sources.includes('surge')) labels.push('급등');
  return labels.length > 0 ? labels.join('+') : null;
}

export async function buildDailyPicks({
  provider,
  focusStocks,
  calendarEvents = [],
  limit = 3,
  useVolumeRatio = false,
}) {
  const candidates = focusStocks.slice(0, 8);
  const newsResults = await Promise.allSettled(
    candidates.map((stock) => provider.news(stock.naverCode, stock.market)),
  );

  const scored = candidates.map((stock, index) => {
    const news = newsResults[index]?.status === 'fulfilled'
      ? newsResults[index].value
      : [];
    const strongNewsCount = news.filter(
      (item) => STRONG_NEWS.some((pattern) => pattern.test(item.title)),
    ).length;
    const matchedEvents = calendarEvents.filter((event) => matchesEvent(stock, event));

    let score = Number(stock.priorityScore) || 0;
    score += Math.min(Math.abs(stock.changePercent) / 3, 2.5);
    if (useVolumeRatio && stock.volumeRatio >= 3) score += 2;
    else if (useVolumeRatio && stock.volumeRatio >= 2) score += 1;
    score += Math.min(strongNewsCount, 2) * 1.5;
    score += news.length > 0 ? 0.5 : 0;
    score += matchedEvents.reduce(
      (sum, event) => sum + (event.importance === 'high' ? 2.5 : event.importance === 'medium' ? 1.5 : 0.5),
      0,
    );

    const signals = [];
    const source = sourceSignal(stock);
    if (source) signals.push(source);
    if (useVolumeRatio && stock.volumeRatio >= 3) signals.push(`거래량 ${stock.volumeRatio.toFixed(1)}배`);
    if (strongNewsCount > 0) signals.push(`주요 뉴스 ${strongNewsCount}건`);
    if (matchedEvents.length > 0) signals.push(eventLabel(matchedEvents[0]));

    return {
      ...stock,
      pickScore: Math.round(score * 10) / 10,
      signals,
      pickReason: signals.length > 0
        ? signals.slice(0, 3).join(' · ')
        : '오늘 가격 흐름을 확인할 종목',
    };
  });

  return scored
    .sort((a, b) => (
      b.pickScore - a.pickScore
      || Math.abs(b.changePercent) - Math.abs(a.changePercent)
    ))
    .slice(0, limit);
}
