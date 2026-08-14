'use strict';

const MAX_BUSINESS_ATTEMPTS = 5;
const CIRCUIT_BREAKER_FAILURES = 3;

const STATES = new Set([
  'NEW', 'SCHEDULED', 'DIALING', 'NO_ANSWER', 'BUSY', 'VOICEMAIL',
  'GATEKEEPER_REACHED', 'CALLBACK_SCHEDULED', 'DECISION_MAKER_REACHED',
  'QUALIFYING', 'QUALIFIED', 'MEETING_PENDING', 'MEETING_BOOKED',
  'DISQUALIFIED_CAPACITY', 'NOT_INTERESTED', 'WRONG_NUMBER', 'DO_NOT_CALL',
  'COMPANY_CLOSED', 'CADENCE_EXHAUSTED', 'TECHNICAL_FAILURE',
]);

const OUTCOMES = new Set([...STATES].filter((state) => !['NEW', 'SCHEDULED', 'DIALING', 'CADENCE_EXHAUSTED'].includes(state)));
const FINAL_STATES = new Set([
  'MEETING_BOOKED', 'DISQUALIFIED_CAPACITY', 'NOT_INTERESTED',
  'WRONG_NUMBER', 'DO_NOT_CALL', 'COMPANY_CLOSED', 'CADENCE_EXHAUSTED',
]);

function isoFuture(value, now) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time) || time <= now.getTime()) throw new RangeError('callback_at must be a future ISO timestamp');
  return new Date(time).toISOString();
}

function recordAttempt(prospect, input, now = new Date()) {
  if (!prospect || !STATES.has(prospect.state)) throw new RangeError('invalid prospect state');
  if (FINAL_STATES.has(prospect.state)) throw new RangeError('prospect has a final outcome');
  const outcome = String(input.outcome || '').trim().toUpperCase();
  if (!OUTCOMES.has(outcome)) throw new RangeError('invalid prospect outcome');

  const technical = input.technical === true || outcome === 'TECHNICAL_FAILURE';
  const callbackAt = input.callbackAt == null || input.callbackAt === '' ? null : isoFuture(input.callbackAt, now);
  if (technical && callbackAt) throw new RangeError('technical failure cannot schedule a callback');
  if (FINAL_STATES.has(outcome) && callbackAt) throw new RangeError('final outcome cannot schedule a callback');

  prospect.businessAttempts = Number(prospect.businessAttempts || 0) + (technical ? 0 : 1);
  prospect.technicalAttempts = Number(prospect.technicalAttempts || 0) + (technical ? 1 : 0);
  prospect.lastOutcome = outcome;
  prospect.lastAttemptAt = now.toISOString();
  prospect.updatedAt = prospect.lastAttemptAt;

  if (technical) {
    prospect.state = 'TECHNICAL_FAILURE';
    prospect.nextAttemptAt = null;
  } else if (outcome === 'DO_NOT_CALL') {
    prospect.state = outcome;
    prospect.optedOutAt = now.toISOString();
    prospect.nextAttemptAt = null;
  } else if (FINAL_STATES.has(outcome)) {
    prospect.state = outcome;
    prospect.nextAttemptAt = null;
  } else if (callbackAt) {
    prospect.state = 'CALLBACK_SCHEDULED';
    prospect.callbackAt = callbackAt;
    prospect.nextAttemptAt = callbackAt;
  } else if (prospect.businessAttempts >= MAX_BUSINESS_ATTEMPTS) {
    prospect.state = 'CADENCE_EXHAUSTED';
    prospect.nextAttemptAt = null;
  } else {
    prospect.state = outcome;
    prospect.nextAttemptAt = null;
  }

  return { outcome, technical, callbackAt, state: prospect.state, isFinal: FINAL_STATES.has(prospect.state) };
}

function circuitBreaker(attempts) {
  const rows = (attempts || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  let consecutive = 0;
  for (const attempt of rows) {
    if (!attempt.technical) break;
    consecutive += 1;
  }
  return { open: consecutive >= CIRCUIT_BREAKER_FAILURES, consecutiveTechnicalFailures: consecutive, threshold: CIRCUIT_BREAKER_FAILURES };
}

module.exports = { MAX_BUSINESS_ATTEMPTS, CIRCUIT_BREAKER_FAILURES, STATES, OUTCOMES, FINAL_STATES, recordAttempt, circuitBreaker };
