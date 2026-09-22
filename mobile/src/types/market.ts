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
  updatedAt: string;
  source: 'naver' | 'sample';
};

export type MarketMover = Quote & {
  reason: string;
  alertEligible: boolean;
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

export type StockDetail = {
  quote: Quote;
  prices: PricePoint[];
  news: StockNews[];
  source: 'naver' | 'sample';
};
