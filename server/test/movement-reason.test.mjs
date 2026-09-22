import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeMovementReason } from '../src/movement-reason.mjs';

test('summarizes earnings-related movement cautiously', () => {
  const result = summarizeMovementReason(
    {
      name: 'NVIDIA',
      changePercent: 6.2,
      volumeRatio: 3.4,
    },
    [
      { title: 'NVIDIA earnings beat expectations as revenue jumps', publisher: 'Example' },
      { title: 'NVIDIA raises guidance for next quarter', publisher: 'Example' },
    ],
  );

  assert.equal(result.category, 'earnings');
  assert.equal(result.label, '실적·가이던스');
  assert.equal(result.confidence, 'medium');
  assert.match(result.summary, /최근 뉴스에서는 실적·가이던스/);
  assert.match(result.summary, /3.4배/);
});

test('returns low-confidence message when no news exists', () => {
  const result = summarizeMovementReason(
    { name: '삼성전자', changePercent: -2.1, volumeRatio: 1.2 },
    [],
  );

  assert.equal(result.category, 'unknown');
  assert.equal(result.confidence, 'low');
  assert.match(result.summary, /특정하기 어렵습니다/);
});
