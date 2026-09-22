import { BoundedCache } from './bounded-cache.mjs';
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
    this.cache = new BoundedCache();
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


}

export { extractOutputText };
