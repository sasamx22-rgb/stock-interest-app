import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenAiAnalysisService, extractOutputText } from '../src/openai-analysis.mjs';

test('extracts output text from Responses API message content', () => {
  assert.equal(
    extractOutputText({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"ok":true}' }],
      }],
    }),
    '{"ok":true}',
  );
});

test('uses Terra structured outputs and caches movement analysis', async () => {
  const requests = [];
  const budgetStore = {
    dailyLimit: 10,
    get: async () => ({ calls: 0, dailyLimit: 10 }),
    reserve: async () => ({ allowed: true, calls: 1, dailyLimit: 10 }),
  };

  const service = new OpenAiAnalysisService({
    apiKey: 'test-key',
    budgetStore,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({
          output: [{
            type: 'message',
            content: [{
              type: 'output_text',
              text: JSON.stringify({
                label: '실적·가이던스',
                summary: '최근 실적 관련 뉴스가 주가 변동과 함께 관찰됩니다.',
                confidence: 'medium',
              }),
            }],
          }],
        }),
      };
    },
  });

  const input = {
    quote: {
      market: 'US',
      symbol: 'NVDA',
      name: 'NVIDIA',
      changePercent: 6.2,
      volumeRatio: 3.5,
    },
    news: [{ title: 'NVIDIA earnings beat expectations' }],
    events: [],
    ruleBased: {
      label: '실적·가이던스',
      summary: '규칙 기반 요약',
      confidence: 'medium',
    },
  };

  const first = await service.enhanceMovementReason(input);
  const second = await service.enhanceMovementReason(input);

  assert.equal(first.label, '실적·가이던스');
  assert.deepEqual(second, first);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.model, 'gpt-5.6-terra');
  assert.equal(requests[0].body.reasoning.effort, 'low');
  assert.equal(requests[0].body.text.format.type, 'json_schema');
});
