'use strict';

// Existing application estimates, not vendor prices. Keep these and the
// counter mapping stable when changing persistence or provider adapters.
const COST = Object.freeze({ gemini: 0.0006, grounded: 0.008, openai: 0.006, perplexity: 0.006, assistant: 0.0009, article: 0.004, transcribe: 0.003, social: 0.0012, action: 0 });
const FIELD = Object.freeze({ gemini: 'geminiCalls', grounded: 'groundedCalls', openai: 'openaiCalls', perplexity: 'perplexityCalls', assistant: 'assistantMessages', article: 'articles', transcribe: 'geminiCalls', social: 'geminiCalls', action: 'actions' });

function normalizeUsageState(value) {
  return value && typeof value === 'object'
    ? { months: value.months || {}, budgetUSD: typeof value.budgetUSD === 'number' ? value.budgetUSD : null }
    : { months: {}, budgetUSD: null };
}

// One meter per application instance. Synchronous best-effort persistence is
// the existing contract, not a transactional multi-replica budget reservation.
function createUsageMeter({ initialState, saveState, getAccountKey, now = () => new Date() }) {
  const state = normalizeUsageState(initialState);
  const accountKey = () => getAccountKey() || 'default';
  const monthKey = () => now().toISOString().slice(0, 7);
  const save = () => saveState(state);

  function current() {
    const month = monthKey(), account = accountKey();
    state.months[month] = state.months[month] || {};
    state.months[month][account] = state.months[month][account] || {
      geminiCalls: 0, groundedCalls: 0, openaiCalls: 0, perplexityCalls: 0,
      assistantMessages: 0, articles: 0, actions: 0, estCostUSD: 0,
    };
    return state.months[month][account];
  }

  function record(kind, count) {
    count = count || 1;
    try {
      const usage = current();
      if (FIELD[kind]) usage[FIELD[kind]] = (usage[FIELD[kind]] || 0) + count;
      usage.estCostUSD = Math.round((usage.estCostUSD + (COST[kind] || 0) * count) * 10000) / 10000;
      save();
    } catch (_) { /* Metering must never break a provider request. */ }
  }

  return {
    accountKey, monthKey, current, record, save,
    overBudget: () => state.budgetUSD == null ? false : current().estCostUSD >= state.budgetUSD,
    get budgetUSD() { return state.budgetUSD; },
    set budgetUSD(value) { state.budgetUSD = value; },
  };
}

module.exports = { createUsageMeter, normalizeUsageState };
