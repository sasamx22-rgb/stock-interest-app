import test from 'node:test';
import assert from 'node:assert/strict';

import { isAlertEligible } from '../src/alerts.mjs';

test('requires both price and volume thresholds', () => {
  assert.equal(isAlertEligible({ changePercent: 5, volumeRatio: 3 }), true);
  assert.equal(isAlertEligible({ changePercent: 4.99, volumeRatio: 4 }), false);
  assert.equal(isAlertEligible({ changePercent: 8, volumeRatio: 2.99 }), false);
});

