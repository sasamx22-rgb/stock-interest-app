import { summarizeMovementReason } from './movement-reason.mjs';

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
    ?? value.tickerCode
    ?? value.symbol;
}

function stockNameFrom(value) {
  return value.stockName
    ?? value.stockNameEng
    ?? value.itemName
    ?? value.itemname
    ?? value.displayName
    ?? value.korName
    ?? value.engName
    ?? value.name;
}

function nationFrom(value) {
  return String(
    value.nationType
    ?? value.nationCode
    ?? value.countryCode
    ?? value.country
    ?? '',
  ).toUpperCase();
}

function marketFromSearchItem(item, code) {
  const nation = nationFrom(item);
  if (['KOR', 'KR', 'KOREA'].includes(nation)) return 'KR';
  if (['USA', 'US', 'UNITED STATES'].includes(nation)) return 'US';
  if (nation && !['KOR', 'KR', 'KOREA', 'USA', 'US', 'UNITED STATES'].includes(nation)) {
    return null;
  }
  return marketFromCode(code);
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
    volume: numberFrom(
      source.accumulatedTradingVolume
      ?? source.tradingVolume
      ?? source.volume,
      0,
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
    const naverCode = market === 'US'
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

export function normalizeSearchPayload(payload) {
  const objects = walkForStockObjects(payload);
  const seen = new Set();

  return objects.flatMap((item) => {
    const rawCode = String(stockCodeFrom(item) ?? '').trim();
    const name = String(stockNameFrom(item) ?? '').trim();
    if (!rawCode || !name) return [];

    const market = marketFromSearchItem(item, rawCode);
    if (!market) return [];

    const code = market === 'US'
      ? String(item.reutersCode ?? rawCode).trim()
      : rawCode;

    if (market === 'KR' && !/^\d{6}$/.test(code)) return [];
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(code)) return [];

    const key = `${market}:${code.toUpperCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      market,
      code,
      symbol: market === 'US' ? code.split('.')[0] : code,
      name,
    }];
  }).slice(0, 12);
}


function walkObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const child of value) walkObjects(child, output);
    return output;
  }
  output.push(value);
  for (const child of Object.values(value)) walkObjects(child, output);
  return output;
}

export function normalizePriceHistory(payload) {
  const seen = new Set();
  return walkObjects(payload).flatMap((item) => {
    const date = String(
      item.localDate
      ?? item.bizdate
      ?? item.bizDate
      ?? item.tradeDate
      ?? item.date
      ?? item.priceDate
      ?? '',
    ).trim();

    const rawPrice =
      item.closePrice
      ?? item.close
      ?? item.currentPrice
      ?? item.price;

    const price = numberFrom(rawPrice, Number.NaN);
    if (!date || !Number.isFinite(price)) return [];

    const key = `${date}:${price}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      date,
      closePrice: price,
      changePercent: numberFrom(
        item.fluctuationsRatio
        ?? item.changeRate
        ?? item.changePercent
        ?? item.prevChangeRate,
        0,
      ),
      volume: numberFrom(
        item.accumulatedTradingVolume
        ?? item.tradingVolume
        ?? item.volume,
        0,
      ),
    }];
  }).slice(0, 30);
}

function newsTitleFrom(item) {
  return item.title
    ?? item.articleTitle
    ?? item.newsTitle
    ?? item.headline;
}

export function normalizeNewsPayload(payload) {
  const seen = new Set();

  return walkObjects(payload).flatMap((item) => {
    const title = String(newsTitleFrom(item) ?? '').trim();
    if (!title || title.length < 4) return [];

    const publishedAt = String(
      item.publishedAt
      ?? item.articleDateTime
      ?? item.datetime
      ?? item.dateTime
      ?? item.createdAt
      ?? item.date
      ?? '',
    ).trim();

    const publisher = String(
      item.officeName
      ?? item.press
      ?? item.publisher
      ?? item.provider
      ?? item.source
      ?? '',
    ).trim();

    const rawUrl = String(
      item.url
      ?? item.linkUrl
      ?? item.articleUrl
      ?? item.newsUrl
      ?? '',
    ).trim();

    const key = `${title}:${publishedAt}`;
    if (seen.has(key)) return [];
    seen.add(key);

    let url;
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.toString();
      } catch {
        // Some Naver payloads expose only an article id, so URL is optional.
      }
    }

    return [{
      title: title.slice(0, 240),
      ...(publishedAt ? { publishedAt } : {}),
      ...(publisher ? { publisher: publisher.slice(0, 80) } : {}),
      ...(url ? { url } : {}),
    }];
  }).slice(0, 10);
}

export class NaverMarketProvider {
  constructor({ fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.moverCache = new Map();
    this.priceHistoryCache = new Map();
  }

  async fetchJson(url) {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://stock.naver.com/',
        'User-Agent': 'MarketPulsePersonal/0.3',
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

  async searchStocks(query) {
    const clean = String(query ?? '').trim();
    if (!clean) return [];

    const url = `https://stock.naver.com/api/autocomplete/search/autoComplete?query=${encodeURIComponent(clean)}&target=stock`;
    const payload = await this.fetchJson(url);
    return normalizeSearchPayload(payload);
  }

  async priceHistory(naverCode, market = marketFromCode(naverCode)) {
    const cacheKey = `${market}:${naverCode}`;
    const now = Date.now();
    const cached = this.priceHistoryCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < 90_000) {
      return cached.items;
    }

    const url = market === 'KR'
      ? `https://stock.naver.com/api/stockSecurity/items/v2/domestic/${encodeURIComponent(naverCode)}/daily-prices?size=30`
      : `https://stock.naver.com/api/securityService/stock/${encodeURIComponent(naverCode)}/price?page=1&pageSize=30`;

    const items = normalizePriceHistory(await this.fetchJson(url));
    this.priceHistoryCache.set(cacheKey, { fetchedAt: now, items });
    return items;
  }

  async enrichVolumeRatios(quotes) {
    const targets = quotes
      .map((quote, index) => ({ quote, index }))
      .filter(({ quote }) => quote.changePercent >= 5 && quote.volumeRatio < 3)
      .slice(0, 20);

    if (targets.length === 0) return quotes;

    const enriched = [...quotes];
    const settled = await Promise.allSettled(
      targets.map(({ quote }) => this.priceHistory(quote.naverCode, quote.market)),
    );

    settled.forEach((result, targetIndex) => {
      if (result.status !== 'fulfilled') return;

      const { quote, index } = targets[targetIndex];
      const rows = result.value.filter((item) => item.volume > 0);
      if (rows.length < 3) return;

      const currentVolume = quote.volume > 0 ? quote.volume : rows[0].volume;
      if (!(currentVolume > 0)) return;

      // The first daily-price row is the most recent session. Exclude it from
      // the comparison baseline so today's surge does not inflate its own average.
      const baselineRows = rows.slice(1, 21);
      if (baselineRows.length < 2) return;

      const averageVolume = baselineRows.reduce((sum, item) => sum + item.volume, 0) / baselineRows.length;
      if (!(averageVolume > 0)) return;

      const estimatedRatio = currentVolume / averageVolume;
      if (!Number.isFinite(estimatedRatio) || estimatedRatio <= 0) return;

      enriched[index] = {
        ...quote,
        volumeRatio: Math.max(quote.volumeRatio, estimatedRatio),
      };
    });

    return enriched;
  }

  async news(naverCode, market = marketFromCode(naverCode)) {
    const url = market === 'KR'
      ? `https://stock.naver.com/api/domestic/detail/news?itemCode=${encodeURIComponent(naverCode)}&page=1&pageSize=10`
      : `https://stock.naver.com/api/foreign/worldStock/list?reutersCode=${encodeURIComponent(naverCode)}&page=1&pageSize=10`;

    return normalizeNewsPayload(await this.fetchJson(url));
  }

  async stockDetail(naverCode, fallbackName, market = marketFromCode(naverCode)) {
    const [quoteResult, priceResult, newsResult] = await Promise.allSettled([
      this.quote(naverCode, fallbackName),
      this.priceHistory(naverCode, market),
      this.news(naverCode, market),
    ]);

    if (quoteResult.status !== 'fulfilled') {
      throw quoteResult.reason;
    }

    const news = newsResult.status === 'fulfilled' ? newsResult.value : [];

    return {
      quote: quoteResult.value,
      prices: priceResult.status === 'fulfilled' ? priceResult.value : [],
      news,
      movementReason: summarizeMovementReason(quoteResult.value, news),
      source: 'naver',
    };
  }

  async movers(market, url) {
    if (!url) return [];

    const now = Date.now();
    const cached = this.moverCache.get(url);
    if (cached && now - cached.fetchedAt < 45_000) {
      return cached.items;
    }

    const payload = await this.fetchJson(url);
    const items = normalizeRankingPayload(payload, market);
    this.moverCache.set(url, { fetchedAt: now, items });
    return items;
  }
}
