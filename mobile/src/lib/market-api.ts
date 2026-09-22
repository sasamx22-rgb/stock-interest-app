import { sampleMovers, sampleReports, sampleWatchlist } from '@/data/sample-data';
import {
  Market,
  MarketMover,
  Quote,
  Report,
  StockSearchResult,
  WatchlistItem,
} from '@/types/market';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('API base URL is not configured');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Market API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getWatchlist(): Promise<Quote[]> {
  try {
    return await request<Quote[]>('/api/watchlist');
  } catch {
    return sampleWatchlist;
  }
}

export async function getWatchlistItems(): Promise<WatchlistItem[]> {
  try {
    return await request<WatchlistItem[]>('/api/watchlist/items');
  } catch {
    return sampleWatchlist.map((quote) => ({
      market: quote.market,
      code: quote.naverCode,
      name: quote.name,
    }));
  }
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  try {
    return await request<StockSearchResult[]>(`/api/search?q=${encodeURIComponent(clean)}`);
  } catch {
    const lowered = clean.toLocaleLowerCase();
    return sampleWatchlist.flatMap((quote) => (
      quote.name.toLocaleLowerCase().includes(lowered)
      || quote.symbol.toLocaleLowerCase().includes(lowered)
      || quote.naverCode.toLocaleLowerCase().includes(lowered)
        ? [{
            market: quote.market,
            code: quote.naverCode,
            symbol: quote.symbol,
            name: quote.name,
          }]
        : []
    ));
  }
}

export async function addWatchlistItem(item: WatchlistItem): Promise<WatchlistItem[]> {
  return request<WatchlistItem[]>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function removeWatchlistItem(
  item: Pick<WatchlistItem, 'market' | 'code'>,
): Promise<WatchlistItem[]> {
  return request<WatchlistItem[]>(
    `/api/watchlist?market=${encodeURIComponent(item.market)}&code=${encodeURIComponent(item.code)}`,
    { method: 'DELETE' },
  );
}

export async function getMovers(market?: Market): Promise<MarketMover[]> {
  try {
    const query = market ? `?market=${market}` : '';
    return await request<MarketMover[]>(`/api/movers${query}`);
  } catch {
    return market ? sampleMovers.filter((item) => item.market === market) : sampleMovers;
  }
}

export async function getReports(): Promise<Report[]> {
  try {
    return await request<Report[]>('/api/reports');
  } catch {
    return sampleReports;
  }
}

export function isLiveDataConfigured() {
  return Boolean(API_BASE_URL);
}
