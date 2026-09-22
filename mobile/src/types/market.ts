export type Market = 'KR' | 'US';

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
  pdfUrl?: string;
};
