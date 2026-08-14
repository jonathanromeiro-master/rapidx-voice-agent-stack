'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cadence = require('../lib/cadence');

function prospect() {
  return { state: 'NEW', businessAttempts: 0, technicalAttempts: 0 };
}

test('technical failures preserve commercial attempts and open the safety breaker after three', () => {
  const row = prospect();
  const attempts = [];
  for (let index = 0; index < 3; index += 1) {
    const at = new Date(`2026-08-13T10:0${index}:00.000Z`);
    const result = cadence.recordAttempt(row, { outcome: 'TECHNICAL_FAILURE' }, at);
    attempts.push({ technical: result.technical, createdAt: at.toISOString() });
  }
  assert.equal(row.businessAttempts, 0);
  assert.equal(row.technicalAttempts, 3);
  assert.equal(row.state, 'TECHNICAL_FAILURE');
  assert.deepEqual(cadence.circuitBreaker(attempts), { open: true, consecutiveTechnicalFailures: 3, threshold: 3 });
});

test('explicit callbacks override generic cadence and terminal outcomes cannot be changed', () => {
  const row = prospect();
  const now = new Date('2026-08-13T10:00:00.000Z');
  const result = cadence.recordAttempt(row, { outcome: 'GATEKEEPER_REACHED', callbackAt: '2026-08-14T14:00:00.000Z' }, now);
  assert.equal(result.state, 'CALLBACK_SCHEDULED');
  assert.equal(row.nextAttemptAt, '2026-08-14T14:00:00.000Z');
  cadence.recordAttempt(row, { outcome: 'DO_NOT_CALL' }, new Date('2026-08-14T14:00:00.000Z'));
  assert.equal(row.state, 'DO_NOT_CALL');
  assert.throws(() => cadence.recordAttempt(row, { outcome: 'NO_ANSWER' }, new Date('2026-08-15T10:00:00.000Z')), /final outcome/);
});

test('the fifth commercial attempt exhausts the cadence', () => {
  const row = prospect();
  for (let index = 0; index < cadence.MAX_BUSINESS_ATTEMPTS; index += 1) {
    cadence.recordAttempt(row, { outcome: 'NO_ANSWER' }, new Date(`2026-08-${String(13 + index).padStart(2, '0')}T10:00:00.000Z`));
  }
  assert.equal(row.businessAttempts, cadence.MAX_BUSINESS_ATTEMPTS);
  assert.equal(row.state, 'CADENCE_EXHAUSTED');
});
