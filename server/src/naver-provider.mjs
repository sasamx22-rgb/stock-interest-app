const DEFAULT_TIMEOUT_MS = 7_000;

function numberFrom(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value.replaceAll(',', '').replace(/[％%배xX]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function marketFromCode(code) {
  return /^\d{6}$/.test(code) ? 'KR' : 'US';
}

function currencyFromMarket(market) {
  return market === 'KR' ? 'KRW' : 'USD';
}

function stockCodeFrom(value) {
  return value.itemCode
    ?? value.itemcode
    ?? value.stockCode
    ?? value.symbolCode
    ?? value.reutersCode
    ?? value.symbol;
}

function stockNameFrom(value) {
  return value.stockName
    ?? value.stockNameEng
    ?? value.itemName
    ?? value.itemname
    ?? value.name;
}

function quotePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)) return payload.result;
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const dataCode = stockCodeFrom(payload.data);
    const dataName = stockNameFrom(payload.data);
    if (dataCode || dataName || payload.data.closePrice || payload.data.currentPrice) return payload.data;
  }
  return payload;
}

export function normalizeBasicQuote(payload, requestedCode, fallbackName = requestedCode) {
  const source = quotePayload(payload);
  const market = marketFromCode(requestedCode);
  const symbol = market === 'US' ? requestedCode.split('.')[0] : requestedCode;

  return {
    symbol,
    naverCode: requestedCode,
    name: stockNameFrom(source) ?? fallbackName,
    market,
    price: numberFrom(source.closePrice ?? source.currentPrice ?? source.nowPrice ?? source.price),
    currency: currencyFromMarket(market),
    changePercent: numberFrom(
      source.fluctuationsRatio
      ?? source.changeRate
      ?? source.changePercent
      ?? source.prevChangeRate,
    ),
    volumeRatio: numberFrom(
      source.volumeRatio
      ?? source.accumulatedTradingVolumeRatio
      ?? source.tradingVolumeRatio
      ?? source.quantRate
      ?? source.volumeIncreaseRate,
      1,
    ),
    updatedAt: source.localTradedAt ?? source.updatedAt ?? source.tradeTime ?? new Date().toISOString(),
    source: 'naver',
  };
}

function walkForStockObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const child of value) walkForStockObjects(child, output);
    return output;
  }

  const code = stockCodeFrom(value);
  const name = stockNameFrom(value);
  if (code && name) output.push(value);
  for (const child of Object.values(value)) walkForStockObjects(child, output);
  return output;
}

export function normalizeRankingPayload(payload, market) {
  const objects = walkForStockObjects(payload);
  const seen = new Set();

  return objects.flatMap((item) => {
    const rawCode = String(stockCodeFrom(item));
    const naverCode = market === 'US' && !rawCode.includes('.')
      ? String(item.reutersCode ?? rawCode)
      : rawCode;

    if (seen.has(naverCode)) return [];
    seen.add(naverCode);

    const quote = normalizeBasicQuote(item, naverCode, stockNameFrom(item) ?? rawCode);
    return [{
      ...quote,
      market,
      currency: currencyFromMarket(market),
      volumeRatio: numberFrom(
        item.volumeRatio
        ?? item.accumulatedTradingVolumeRatio
        ?? item.tradingVolumeRatio
        ?? item.quantRate
        ?? item.volumeIncreaseRate
        ?? item.compareToPreviousTradingVolumeRatio,
        0,
      ),
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
        Referer: 'https://stock.naver.com/',
        'User-Agent': 'MarketPulsePersonal/0.2',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Naver request failed: ${response.status}`);
    return response.json();
  }

  async quote(naverCode, fallbackName) {
    const market = marketFromCode(naverCode);
    const url = market === 'KR'
      ? `https://m.stock.naver.com/api/stock/${encodeURIComponent(naverCode)}/basic`
      : `https://stock.naver.com/api/securityService/stock/${encodeURIComponent(naverCode)}/basic`;

    const payload = await this.fetchJson(url);
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
