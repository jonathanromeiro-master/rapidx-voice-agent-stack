'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const observability = require('../lib/observability');

test('observability derives tenant metrics from recorded attempts without inventing CDR or latency data', () => {
  const prospects = [
    { id: 'p1', state: 'MEETING_BOOKED' },
    { id: 'p2', state: 'DO_NOT_CALL' },
    { id: 'p3', state: 'CADENCE_EXHAUSTED' },
  ];
  const attempts = [
    { prospectId: 'p1', outcome: 'NO_ANSWER', technical: false, createdAt: '2026-08-13T10:00:00.000Z' },
    { prospectId: 'p1', outcome: 'DECISION_MAKER_REACHED', technical: false, createdAt: '2026-08-13T10:01:00.000Z' },
    { prospectId: 'p1', outcome: 'MEETING_BOOKED', technical: false, createdAt: '2026-08-13T10:02:00.000Z' },
    { prospectId: 'p2', outcome: 'GATEKEEPER_REACHED', technical: false, createdAt: '2026-08-13T10:03:00.000Z' },
    { prospectId: 'p3', outcome: 'TECHNICAL_FAILURE', technical: true, createdAt: '2026-08-13T10:04:00.000Z' },
  ];
  const report = observability.summarize(prospects, attempts);

  assert.equal(report.source, 'tenant_prospect_attempts');
  assert.equal(report.carrierCdr, 'not_recorded');
  assert.deepEqual(report.metrics, {
    prospects: 3, dials: 4, answeredCalls: 3, answerRatePerDial: 0.75,
    companiesReached: 2, companyReachRate: 0.6667, attemptsPerCompany: 1.3333,
    firstReachAttempt: 1.5, gatekeepers: 1, decisionMakersReached: 1,
    decisionMakerRate: 0.5, meetingsBooked: 1, decisionMakerToMeetingRate: 1,
    wrongNumbers: 0, doNotCall: 1, cadenceExhausted: 1, technicalFailures: 1,
  });
  assert.deepEqual(report.unrecorded, [
    'avgGatekeeperDuration', 'avgDecisionMakerDuration', 'sttRtf',
    'ttsTtfa', 'endToEndTurnLatency',
  ]);
});
