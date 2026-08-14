'use strict';

const ANSWERED_OUTCOMES = new Set([
  'GATEKEEPER_REACHED', 'DECISION_MAKER_REACHED', 'QUALIFYING', 'QUALIFIED',
  'MEETING_PENDING', 'MEETING_BOOKED', 'DISQUALIFIED_CAPACITY', 'NOT_INTERESTED',
]);
const DECISION_MAKER_OUTCOMES = new Set([
  'DECISION_MAKER_REACHED', 'QUALIFYING', 'QUALIFIED', 'MEETING_PENDING',
  'MEETING_BOOKED', 'DISQUALIFIED_CAPACITY', 'NOT_INTERESTED',
]);

function ratio(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : null;
}

function uniqueProspects(rows) {
  return new Set(rows.map((row) => row.prospectId)).size;
}

function summarize(prospects, attempts) {
  const tenantProspects = Array.isArray(prospects) ? prospects : [];
  const rows = (Array.isArray(attempts) ? attempts : []).slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const commercial = rows.filter((row) => !row.technical);
  const answered = commercial.filter((row) => ANSWERED_OUTCOMES.has(row.outcome));
  const decisionMakers = commercial.filter((row) => DECISION_MAKER_OUTCOMES.has(row.outcome));
  const meetings = commercial.filter((row) => row.outcome === 'MEETING_BOOKED');
  const reached = new Set(answered.map((row) => row.prospectId));
  const attemptsByProspect = new Map();
  const firstReach = [];
  for (const row of commercial) {
    const count = (attemptsByProspect.get(row.prospectId) || 0) + 1;
    attemptsByProspect.set(row.prospectId, count);
    if (ANSWERED_OUTCOMES.has(row.outcome) && !firstReach.some((item) => item.prospectId === row.prospectId)) {
      firstReach.push({ prospectId: row.prospectId, attempt: count });
    }
  }
  const firstReachAverage = firstReach.length
    ? Math.round((firstReach.reduce((sum, item) => sum + item.attempt, 0) / firstReach.length) * 100) / 100
    : null;
  const finalStateCount = (state) => tenantProspects.filter((row) => row.state === state).length;

  return {
    source: 'tenant_prospect_attempts',
    carrierCdr: 'not_recorded',
    metrics: {
      prospects: tenantProspects.length,
      dials: commercial.length,
      answeredCalls: answered.length,
      answerRatePerDial: ratio(answered.length, commercial.length),
      companiesReached: reached.size,
      companyReachRate: ratio(reached.size, tenantProspects.length),
      attemptsPerCompany: ratio(commercial.length, tenantProspects.length),
      firstReachAttempt: firstReachAverage,
      gatekeepers: commercial.filter((row) => row.outcome === 'GATEKEEPER_REACHED').length,
      decisionMakersReached: uniqueProspects(decisionMakers),
      decisionMakerRate: ratio(uniqueProspects(decisionMakers), reached.size),
      meetingsBooked: uniqueProspects(meetings),
      decisionMakerToMeetingRate: ratio(uniqueProspects(meetings), uniqueProspects(decisionMakers)),
      wrongNumbers: finalStateCount('WRONG_NUMBER'),
      doNotCall: finalStateCount('DO_NOT_CALL'),
      cadenceExhausted: finalStateCount('CADENCE_EXHAUSTED'),
      technicalFailures: rows.filter((row) => row.technical).length,
    },
    unrecorded: [
      'avgGatekeeperDuration', 'avgDecisionMakerDuration', 'sttRtf',
      'ttsTtfa', 'endToEndTurnLatency',
    ],
  };
}

module.exports = { summarize };
