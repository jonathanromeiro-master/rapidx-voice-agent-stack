'use strict';

const AI_RUNTIME_SPEND = Object.freeze({
  status: 'not_metered',
  message: 'AI runtime spend is unavailable until duration and provider invoices are metered.',
  excludes: Object.freeze(['telephony', 'DID/SIP', 'carrier', 'server', 'tax']),
});

function usageRow(row) {
  return {
    day: row.day,
    chars: Number(row.chars) || 0,
    calls: Number(row.calls) || 0,
    llmTokens: Number(row.llmTokens) || 0,
  };
}

function summarizeUsage(rows) {
  const days = rows.map(usageRow);
  const totals = days.reduce((acc, day) => ({
    chars: acc.chars + day.chars,
    calls: acc.calls + day.calls,
    llmTokens: acc.llmTokens + day.llmTokens,
  }), { chars: 0, calls: 0, llmTokens: 0 });
  return { days, totals, aiRuntimeSpend: AI_RUNTIME_SPEND };
}

module.exports = { AI_RUNTIME_SPEND, summarizeUsage };
