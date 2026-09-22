import { sampleMovers, sampleReports, sampleWatchlist } from '@/data/sample-data';
import { Market, MarketMover, Quote, Report } from '@/types/market';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

async function request<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('API base URL is not configured');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
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
