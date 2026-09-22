const DEFAULT_TIMEOUT_MS = 7_000;

function numberFrom(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value.replaceAll(',', '').replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function marketFromCode(code) {
  return /^\d{6}$/.test(code) ? 'KR' : 'US';
}

function currencyFromMarket(market) {
  return market === 'KR' ? 'KRW' : 'USD';
}

export function normalizeBasicQuote(payload, requestedCode, fallbackName = requestedCode) {
  const market = marketFromCode(requestedCode);
  const symbol = market === 'US' ? requestedCode.split('.')[0] : requestedCode;
  return {
    symbol,
    naverCode: requestedCode,
    name: payload.stockName ?? payload.name ?? fallbackName,
    market,
    price: numberFrom(payload.closePrice ?? payload.currentPrice ?? payload.price),
    currency: currencyFromMarket(market),
    changePercent: numberFrom(payload.fluctuationsRatio ?? payload.changeRate ?? payload.changePercent),
    volumeRatio: numberFrom(payload.volumeRatio ?? payload.accumulatedTradingVolumeRatio, 1),
    updatedAt: payload.localTradedAt ?? payload.updatedAt ?? new Date().toISOString(),
    source: 'naver',
  };
}

function walkForStockObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const child of value) walkForStockObjects(child, output);
    return output;
  }

  const code = value.itemCode ?? value.stockCode ?? value.symbolCode ?? value.reutersCode;
  const name = value.stockName ?? value.itemName ?? value.name;
  if (code && name) output.push(value);
  for (const child of Object.values(value)) walkForStockObjects(child, output);
  return output;
}

export function normalizeRankingPayload(payload, market) {
  const objects = walkForStockObjects(payload);
  const seen = new Set();
  return objects.flatMap((item) => {
    const rawCode = String(item.itemCode ?? item.stockCode ?? item.symbolCode ?? item.reutersCode);
    const naverCode = market === 'US' && !rawCode.includes('.')
      ? String(item.reutersCode ?? rawCode)
      : rawCode;
    if (seen.has(naverCode)) return [];
    seen.add(naverCode);

    const quote = normalizeBasicQuote(item, naverCode, item.stockName ?? item.itemName ?? item.name);
    return [{
      ...quote,
      market,
      currency: currencyFromMarket(market),
      volumeRatio: numberFrom(item.volumeRatio ?? item.accumulatedTradingVolumeRatio ?? item.tradingVolumeRatio, 0),
    }];
  });
}

export class NaverMarketProvider {
  constructor({ fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async fetchJson(url) {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MarketPulsePersonal/0.1',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Naver request failed: ${response.status}`);
    return response.json();
  }

  async quote(naverCode, fallbackName) {
    const payload = await this.fetchJson(`https://m.stock.naver.com/api/stock/${encodeURIComponent(naverCode)}/basic`);
    return normalizeBasicQuote(payload, naverCode, fallbackName);
  }

  async watchlist(items) {
    const settled = await Promise.allSettled(items.map((item) => this.quote(item.code, item.name)));
    return settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  }

  async movers(market, url) {
    if (!url) return [];
    const payload = await this.fetchJson(url);
    return normalizeRankingPayload(payload, market);
  }
}

