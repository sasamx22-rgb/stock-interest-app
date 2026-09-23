const CATEGORY_RULES = [
  {
    id: 'earnings',
    label: '실적·가이던스',
    patterns: [/실적/i, /영업이익/i, /매출/i, /순이익/i, /earnings/i, /revenue/i, /guidance/i, /forecast/i, /outlook/i],
  },
  {
    id: 'filing',
    label: '공시·자금조달',
    patterns: [/공시/i, /유상증자/i, /무상증자/i, /전환사채/i, /cb\b/i, /rcps/i, /증자/i, /자사주/i, /filing/i, /offering/i, /buyback/i],
  },
  {
    id: 'deal',
    label: '계약·수주·M&A',
    patterns: [/수주/i, /계약/i, /공급/i, /인수/i, /합병/i, /m&a/i, /acquisition/i, /merger/i, /contract/i, /deal/i],
  },
  {
    id: 'product',
    label: '제품·기술',
    patterns: [/출시/i, /신제품/i, /반도체/i, /hbm/i, /ai\b/i, /gpu/i, /제품/i, /technology/i, /product/i, /launch/i, /chip/i],
  },
  {
    id: 'analyst',
    label: '증권사·애널리스트',
    patterns: [/목표주가/i, /투자의견/i, /상향/i, /하향/i, /upgrade/i, /downgrade/i, /price target/i, /analyst/i],
  },
  {
    id: 'macro',
    label: '거시·업종',
    patterns: [/금리/i, /환율/i, /fomc/i, /연준/i, /fed\b/i, /cpi\b/i, /고용/i, /업종/i, /sector/i, /rate/i, /inflation/i],
  },
];

function categoryFor(title) {
  return CATEGORY_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(title))) ?? null;
}

function categoryFromEvent(event) {
  if (event.type === 'earnings') return { id: 'earnings', label: '실적·가이던스' };
  if (event.type === 'filing') return { id: 'filing', label: '공시·자금조달' };
  if (event.type === 'fomc' || event.type === 'macro') return { id: 'macro', label: '거시·업종' };
  if (event.type === 'dividend') return { id: 'dividend', label: '배당·주주환원' };
  return categoryFor(event.title);
}

function directionLabel(changePercent) {
  if (changePercent >= 1) return '상승';
  if (changePercent <= -1) return '하락';
  return '보합권';
}

function compactTitle(title, maxLength = 72) {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export function summarizeMovementReason(quote, news = [], events = []) {
  const usable = news
    .filter((item) => item?.title)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      category: categoryFor(item.title),
    }));

  const eventEvidence = events
    .filter((event) => event?.title)
    .slice(0, 6)
    .map((event) => ({
      ...event,
      category: categoryFromEvent(event),
    }));

  if (usable.length === 0 && eventEvidence.length === 0) {
    return {
      category: 'unknown',
      label: '원인 확인 중',
      summary: `현재 수집된 뉴스·실적·공시 일정만으로는 ${quote.name}의 ${directionLabel(quote.changePercent)} 원인을 특정하기 어렵습니다.`,
      confidence: 'low',
      evidence: [],
    };
  }

  const counts = new Map();
  for (const item of [...usable, ...eventEvidence]) {
    if (!item.category) continue;
    counts.set(item.category.id, (counts.get(item.category.id) ?? 0) + 1);
  }

  let dominant = null;
  for (const rule of CATEGORY_RULES) {
    const count = counts.get(rule.id) ?? 0;
    if (!dominant || count > dominant.count) {
      dominant = { ...rule, count };
    }
  }

  const representativeEvent = eventEvidence.find((item) => item.category?.id === dominant?.id)
    ?? (usable.length === 0 ? eventEvidence[0] : undefined);
  const representativeNews = usable.find((item) => item.category?.id === dominant?.id) ?? usable[0];
  const representative = representativeEvent ?? representativeNews;
  const categoryLabel = dominant?.count
    ? dominant.label
    : representativeEvent
      ? '주요 일정'
      : '주요 뉴스';
  const evidenceText = representativeEvent
    ? `최근 일정·공시에서는 ${categoryLabel} 관련 “${compactTitle(representative.title)}”가 확인됩니다.`
    : `최근 뉴스에서는 ${categoryLabel} 관련 이슈가 가장 눈에 띄며, 대표적으로 “${compactTitle(representative.title)}”가 포착됩니다.`;

  return {
    category: dominant?.count ? dominant.id : representativeEvent ? 'calendar' : 'news',
    label: categoryLabel,
    summary:
      `${quote.name}은 현재 ${directionLabel(quote.changePercent)}(${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)입니다. `
      + evidenceText,
    confidence: representativeEvent || dominant?.count >= 2 ? 'medium' : 'low',
    evidence: [
      ...eventEvidence.slice(0, 2).map((item) => ({
        type: item.type === 'earnings' || item.type === 'filing' ? item.type : 'calendar',
        title: compactTitle(item.title, 120),
        ...(item.url ? { url: item.url } : {}),
      })),
      ...usable.slice(0, 3).map((item) => ({
        type: 'news',
        title: compactTitle(item.title, 120),
        ...(item.publisher ? { publisher: item.publisher } : {}),
        ...(item.url ? { url: item.url } : {}),
      })),
    ].slice(0, 4),
  };
}
