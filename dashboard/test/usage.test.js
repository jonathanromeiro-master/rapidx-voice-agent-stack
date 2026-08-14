'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeUsage } = require('../lib/usage');

test('usage keeps call counts out of the AI runtime spend contract', () => {
  const usage = summarizeUsage([{ day: '2026-08-13', chars: 1000, calls: 9, llmTokens: 250 }]);

  assert.deepEqual(usage.totals, { chars: 1000, calls: 9, llmTokens: 250 });
  assert.equal(usage.aiRuntimeSpend.status, 'not_metered');
  assert.deepEqual(usage.aiRuntimeSpend.excludes, ['telephony', 'DID/SIP', 'carrier', 'server', 'tax']);
  assert.equal(Object.hasOwn(usage.totals, 'costInr'), false);
});
