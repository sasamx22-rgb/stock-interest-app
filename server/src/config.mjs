import { fileURLToPath } from 'node:url';

const DEFAULT_WATCHLIST = 'KR:005930:삼성전자,KR:000660:SK하이닉스,US:NVDA.O:NVIDIA';
const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

export const DEFAULT_MOVER_URLS = Object.freeze({
  KR: 'https://stock.naver.com/api/domestic/market/stock/default?tradeType=KRX&marketType=ALL&orderType=upperQuantTop&startIdx=0&pageSize=100',
  US: 'https://stock.naver.com/api/foreign/market/stock/global?nation=usa&tradeType=ALL&orderType=up&startIdx=0&pageSize=100',
});

export function parseWatchlist(value = DEFAULT_WATCHLIST) {
  return value.split(',').flatMap((entry) => {
    const [market, code, ...nameParts] = entry.trim().split(':');
    if (!code || !['KR', 'US'].includes(market)) return [];
    return [{ market, code, name: nameParts.join(':') || code }];
  });
}

function envOrDefault(value, fallback) {
  return value?.trim() || fallback;
}

const pushIntervalSeconds = Math.max(60, Number(process.env.PUSH_INTERVAL_SECONDS ?? 120) || 120);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  pushIntervalMs: pushIntervalSeconds * 1000,
  apiKey: process.env.MARKET_PULSE_API_KEY?.trim() ?? '',
  dataDir: envOrDefault(process.env.DATA_DIR, DEFAULT_DATA_DIR),
  watchlist: parseWatchlist(process.env.WATCHLIST),
  moverUrls: {
    KR: envOrDefault(process.env.NAVER_KR_MOVERS_URL, DEFAULT_MOVER_URLS.KR),
    US: envOrDefault(process.env.NAVER_US_MOVERS_URL, DEFAULT_MOVER_URLS.US),
  },
};
