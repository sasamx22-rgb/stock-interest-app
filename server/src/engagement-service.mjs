function pickReason(item) {
  if (item.sources.includes('surge') && item.sources.includes('report')) {
    return '오늘 보고서에 포함됐고 급등 조건도 충족한 종목';
  }
  if (item.sources.includes('report') && item.sources.includes('watchlist')) {
    return '오늘 보고서와 내 관심종목에 모두 포함된 종목';
  }
  if (item.sources.includes('surge')) return '현재 급등 조건을 충족한 종목';
  if (item.sources.includes('report')) return '오늘 보고서에서 언급된 종목';
  return '내 관심종목 중 오늘 확인할 종목';
}

export function buildEngagementSummary({ reports, engagement, focusStocks }) {
  const unreadReportIds = reports
    .filter((report) => !engagement.readReports[report.id])
    .map((report) => report.id);

  const dailyPicks = focusStocks.slice(0, 3).map((item) => ({
    ...item,
    pickReason: pickReason(item),
  }));

  return {
    unreadReportIds,
    unreadReportCount: unreadReportIds.length,
    dailyPicks,
  };
}

export function buildWeeklyReview({
  engagement,
  reports,
  watchlistItems,
  now = new Date(),
}) {
  const since = now.getTime() - 7 * 86_400_000;
  const recentViews = engagement.stockViews.filter(
    (view) => Date.parse(view.viewedAt) >= since,
  );

  const counts = new Map();
  for (const view of recentViews) {
    const key = `${view.market}:${view.code}`;
    const current = counts.get(key) ?? { ...view, views: 0 };
    current.views += 1;
    counts.set(key, current);
  }

  const topViewed = [...counts.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  const readThisWeek = Object.values(engagement.readReports)
    .filter((readAt) => Date.parse(readAt) >= since)
    .length;

  const reportsThisWeek = reports.filter(
    (report) => Date.parse(report.publishedAt) >= since,
  ).length;

  return {
    periodDays: 7,
    stockViewCount: recentViews.length,
    uniqueStockCount: counts.size,
    topViewed,
    currentWatchlistCount: watchlistItems.length,
    reportsRead: readThisWeek,
    reportsPublished: reportsThisWeek,
  };
}
