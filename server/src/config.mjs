const DEFAULT_WATCHLIST = 'KR:005930:삼성전자,KR:000660:SK하이닉스,US:NVDA.O:NVIDIA';

export function parseWatchlist(value = DEFAULT_WATCHLIST) {
  return value.split(',').flatMap((entry) => {
    const [market, code, ...nameParts] = entry.trim().split(':');
    if (!code || !['KR', 'US'].includes(market)) return [];
    return [{ market, code, name: nameParts.join(':') || code }];
  });
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  watchlist: parseWatchlist(process.env.WATCHLIST),
  moverUrls: {
    KR: process.env.NAVER_KR_MOVERS_URL ?? '',
    US: process.env.NAVER_US_MOVERS_URL ?? '',
  },
};

