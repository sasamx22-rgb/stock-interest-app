export type Market = 'KR' | 'US';

export type WatchlistItem = {
  market: Market;
  code: string;
  name: string;
};

export type StockSearchResult = WatchlistItem & {
  symbol: string;
};

export type Quote = {
  symbol: string;
  naverCode: string;
  name: string;
  market: Market;
  price: number;
  currency: 'KRW' | 'USD';
  changePercent: number;
  volumeRatio: number;
  volume?: number;
  updatedAt: string;
  source: 'naver' | 'sample';
};

export type MarketMover = Quote & {
  reason: string;
  alertEligible: boolean;
};

export type FocusSource = 'watchlist' | 'report' | 'surge';

export type TodayFocusStock = Quote & {
  sources: FocusSource[];
  reportIds: string[];
  priorityScore: number;
  alertEligible?: boolean;
};

export type Report = {
  id: string;
  title: string;
  publishedAt: string;
  type: 'morning' | 'premarket';
  summary: string;
  tickers: string[];
  highlights?: string[];
  marketSummary?: string;
  pdfUrl?: string;
};

export type AlertRule = {
  changePercent: number;
  volumeRatio: number;
};

export type PushRegistration = {
  token: string;
  platform: 'android' | 'ios';
};

export type PushStatus = {
  registeredDevices: number;
  monitorActive: boolean;
  intervalSeconds: number;
};

export type PricePoint = {
  date: string;
  closePrice: number;
  changePercent: number;
  volume: number;
};

export type StockNews = {
  title: string;
  publishedAt?: string;
  publisher?: string;
  url?: string;
};

export type MovementReasonEvidence = {
  type: 'news' | 'earnings' | 'filing' | 'calendar';
  title: string;
  publisher?: string;
  url?: string;
};

export type MovementReason = {
  category: string;
  label: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  evidence: MovementReasonEvidence[];
};

export type StockDetail = {
  quote: Quote;
  prices: PricePoint[];
  news: StockNews[];
  movementReason?: MovementReason;
  source: 'naver' | 'sample';
};

export type CalendarEvent = {
  id: string;
  title: string;
  type: 'macro' | 'fomc' | 'earnings' | 'dividend' | 'filing' | 'custom';
  startsAt: string;
  market: 'KR' | 'US' | 'GLOBAL';
  importance: 'high' | 'medium' | 'low';
  tickers: string[];
  source: string;
  description?: string;
  url?: string;
};
