import { createHash } from 'node:crypto';

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text.trim();
      }
    }
  }

  return '';
}

function cacheKey(prefix, value) {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

const MOVEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    summary: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium'] },
  },
  required: ['label', 'summary', 'confidence'],
};

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    marketSummary: { type: 'string' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 6,
    },
    tickers: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 8,
    },
  },
  required: ['title', 'summary', 'marketSummary', 'highlights', 'tickers'],
};

export class OpenAiAnalysisService {
  constructor({
    apiKey = '',
    model = 'gpt-5.6-terra',
    fetchImpl = fetch,
    budgetStore,
    movementCacheMs = 6 * 60 * 60 * 1000,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.budgetStore = budgetStore;
    this.movementCacheMs = movementCacheMs;
    this.cache = new Map();
  }

  get enabled() {
    return Boolean(this.apiKey && this.budgetStore);
  }

  async status() {
    if (!this.enabled) {
      return {
        enabled: false,
        model: this.model,
        callsToday: 0,
        dailyLimit: this.budgetStore?.dailyLimit ?? 0,
      };
    }

    const budget = await this.budgetStore.get();
    return {
      enabled: true,
      model: this.model,
      callsToday: budget.calls,
      dailyLimit: budget.dailyLimit,
    };
  }

  async jsonResponse({ input, schema, schemaName, reasoningEffort, maxOutputTokens }) {
    if (!this.enabled) return null;

    const budget = await this.budgetStore.reserve();
    if (!budget.allowed) return null;

    const response = await this.fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        reasoning: {
          effort: reasoningEffort,
          mode: 'standard',
        },
        input,
        max_output_tokens: maxOutputTokens,
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses API failed: ${response.status}`);
    }

    const payload = await response.json();
    const text = extractOutputText(payload);
    if (!text) throw new Error('OpenAI response contained no output text');

    return JSON.parse(text);
  }

  async enhanceMovementReason({ quote, news, events, ruleBased }) {
    if (!this.enabled) return null;

    const evidence = {
      market: quote.market,
      symbol: quote.symbol,
      name: quote.name,
      changePercent: quote.changePercent,
      volumeRatio: quote.volumeRatio,
      news: news.slice(0, 6).map((item) => ({
        title: item.title,
        publisher: item.publisher ?? '',
        publishedAt: item.publishedAt ?? '',
      })),
      events: events.slice(0, 5).map((event) => ({
        type: event.type,
        title: event.title,
        startsAt: event.startsAt,
        source: event.source,
      })),
      ruleBased: {
        label: ruleBased.label,
        summary: ruleBased.summary,
        confidence: ruleBased.confidence,
      },
    };

    const key = cacheKey('movement', evidence);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.movementCacheMs) {
      return cached.value;
    }

    const result = await this.jsonResponse({
      schema: MOVEMENT_SCHEMA,
      schemaName: 'market_pulse_movement_reason',
      reasoningEffort: 'low',
      maxOutputTokens: 450,
      input: [
        '당신은 개인용 주식 모니터링 앱의 분석 보조 기능입니다.',
        '아래에 제공된 사실만 사용해 한국어로 가격 변동의 관련 요인을 2문장 이내로 요약하세요.',
        '인과관계를 확정적으로 단정하지 마세요. 매수·매도 추천이나 목표주가를 제시하지 마세요.',
        '근거가 부족하면 confidence를 low로 두고 불확실성을 명시하세요.',
        'label은 실적·가이던스, 공시·자금조달, 계약·수주, 제품·기술, 애널리스트, 거시·업종, 주요 뉴스, 원인 확인 중 중 가장 가까운 표현을 사용하세요.',
        '',
        JSON.stringify(evidence),
      ].join('\n'),
    });

    if (result) this.cache.set(key, { at: Date.now(), value: result });
    return result;
  }

  async generateReport({ type, publishedAt, focusStocks, calendarEvents, alertRule }) {
    if (!this.enabled) return null;

    const evidence = {
      reportType: type,
      publishedAt,
      alertRule,
      focusStocks: focusStocks.slice(0, 10).map((item) => ({
        market: item.market,
        symbol: item.symbol,
        name: item.name,
        changePercent: item.changePercent,
        volumeRatio: item.volumeRatio,
        sources: item.sources,
      })),
      calendarEvents: calendarEvents.slice(0, 12).map((event) => ({
        type: event.type,
        title: event.title,
        startsAt: event.startsAt,
        importance: event.importance,
        tickers: event.tickers,
        source: event.source,
      })),
    };

    return this.jsonResponse({
      schema: REPORT_SCHEMA,
      schemaName: 'market_pulse_daily_report',
      reasoningEffort: 'medium',
      maxOutputTokens: 1100,
      input: [
        '당신은 개인 투자자가 아침에 빠르게 시장을 파악하도록 돕는 한국어 시장 브리핑 작성자입니다.',
        '제공된 데이터만 사용하세요. 사실을 창작하지 말고 투자 추천, 매수·매도 지시, 목표주가를 제시하지 마세요.',
        type === 'premarket'
          ? '08:50 프리마켓 보고서입니다. 08:00 이후 확인할 변화와 오늘 장 시작 직전 체크포인트를 우선하세요.'
          : '08:00 모닝 브리프입니다. 밤사이 흐름과 오늘 확인할 종목·경제 일정을 우선하세요.',
        'summary는 2~3문장, marketSummary는 4~6문장, highlights는 짧고 실행 가능한 확인 항목으로 작성하세요.',
        '',
        JSON.stringify(evidence),
      ].join('\n'),
    });
  }
}

export { extractOutputText };
