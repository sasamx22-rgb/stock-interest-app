import { sampleMovers, sampleReports, sampleWatchlist } from '@/data/sample-data';
import {
  AlertRule,
  CalendarEvent,
  EngagementSummary,
  Market,
  MarketMover,
  Quote,
  Report,
  PushRegistration,
  PushStatus,
  StockDetail,
  StockSearchResult,
  TodayFocusStock,
  WatchlistItem,
  WeeklyReview,
} from '@/types/market';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const API_KEY = process.env.EXPO_PUBLIC_API_KEY?.trim();

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
      ...(API_KEY ? { 'X-Market-Pulse-Key': API_KEY } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Market API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getEngagementSummary(): Promise<EngagementSummary> {
  try {
    return await request<EngagementSummary>('/api/engagement/summary');
  } catch {
    return { unreadReportIds: [], unreadReportCount: 0, dailyPicks: [] };
  }
}

export async function getWeeklyReview(): Promise<WeeklyReview | null> {
  try {
    return await request<WeeklyReview>('/api/review/weekly');
  } catch {
    return null;
  }
}

export async function markReportRead(id: string): Promise<void> {
  try {
    await request('/api/reports/' + encodeURIComponent(id) + '/read', {
      method: 'POST',
      body: '{}',
    });
  } catch {}
}

export async function recordStockView(item: {
  market: Market;
  code: string;
  name: string;
}): Promise<void> {
  try {
    await request('/api/activity/stock-view', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  } catch {}
}

export async function getCalendarEvents(days = 14): Promise<CalendarEvent[]> {
  try {
    return await request<CalendarEvent[]>('/api/calendar?days=' + encodeURIComponent(String(days)));
  } catch {
    return [];
  }
}

export async function getTodayFocus(): Promise<TodayFocusStock[]> {
  try {
    return await request<TodayFocusStock[]>('/api/today-focus');
  } catch {
    return sampleWatchlist.map((quote, index) => ({
      ...quote,
      sources: ['watchlist'],
      reportIds: [],
      priorityScore: sampleWatchlist.length - index,
    }));
  }
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

export async function getStockDetail(
  market: Market,
  code: string,
  name?: string,
): Promise<StockDetail | null> {
  try {
    const query = name ? `?name=${encodeURIComponent(name)}` : '';
    return await request<StockDetail>(
      `/api/stocks/${market}/${encodeURIComponent(code)}${query}`,
    );
  } catch {
    const quote = sampleWatchlist.find(
      (item) => item.market === market && item.naverCode === code,
    );
    return quote
      ? { quote, prices: [], news: [], source: 'sample' }
      : null;
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

export async function getLiveAlerts(): Promise<MarketMover[]> {
  return request<MarketMover[]>('/api/alerts');
}

export async function registerPushToken(
  registration: PushRegistration,
): Promise<{ registered: boolean; registeredDevices: number }> {
  return request('/api/push/register', {
    method: 'POST',
    body: JSON.stringify(registration),
  });
}

export async function getPushStatus(): Promise<PushStatus> {
  return request<PushStatus>('/api/push/status');
}

export async function getAlertSettings(): Promise<AlertRule> {
  try {
    return await request<AlertRule>('/api/settings/alerts');
  } catch {
    return { changePercent: 5, volumeRatio: 3 };
  }
}

export async function updateAlertSettings(rule: AlertRule): Promise<AlertRule> {
  return request<AlertRule>('/api/settings/alerts', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function getMovers(market?: Market): Promise<MarketMover[]> {
  try {
    const query = market ? `?market=${market}` : '';
    return await request<MarketMover[]>(`/api/movers${query}`);
  } catch {
    return market ? sampleMovers.filter((item) => item.market === market) : sampleMovers;
  }
}

function resolveReportLinks(report: Report): Report {
  if (!report.pdfUrl || !report.pdfUrl.startsWith('/') || !API_BASE_URL) return report;
  return {
    ...report,
    pdfUrl: `${API_BASE_URL}${report.pdfUrl}`,
  };
}

export async function getReports(): Promise<Report[]> {
  try {
    const reports = await request<Report[]>('/api/reports');
    return reports.map(resolveReportLinks);
  } catch {
    return sampleReports;
  }
}

export async function getReport(id: string): Promise<Report | null> {
  try {
    return resolveReportLinks(
      await request<Report>(`/api/reports/${encodeURIComponent(id)}`),
    );
  } catch {
    return sampleReports.find((report) => report.id === id) ?? null;
  }
}

export function isLiveDataConfigured() {
  return Boolean(API_BASE_URL);
}
