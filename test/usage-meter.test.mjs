import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createUsageMeter, normalizeUsageState } = require('../lib/usage-meter');
const { createUsageRepository } = require('../lib/usage-repository');
const { createFileStateRepository } = require('../lib/state-repository');
const { setJsonWriteObserver } = require('../lib/json-file-store');

function meter(options = {}) {
  const saves = [];
  return {
    saves,
    api: createUsageMeter({
      saveState: value => saves.push(structuredClone(value)),
      getAccountKey: () => 'location-a',
      now: () => new Date('2026-09-03T12:00:00Z'),
      ...options,
    }),
  };
}

test('usage meter preserves every existing estimate and counter mapping', () => {
  const { api, saves } = meter();
  for (const kind of ['gemini', 'grounded', 'openai', 'perplexity', 'assistant', 'article', 'transcribe', 'social', 'action']) api.record(kind);
  assert.deepEqual(api.current(), {
    geminiCalls: 3, groundedCalls: 1, openaiCalls: 1, perplexityCalls: 1,
    assistantMessages: 1, articles: 1, actions: 1, estCostUSD: 0.0297,
  });
  assert.equal(saves.length, 9);
  assert.equal(api.budgetUSD, null);
  assert.equal(api.overBudget(), false);
  assert.equal(api.monthKey(), '2026-09');
  assert.equal(api.accountKey(), 'location-a');
});

test('usage meter preserves default quantities, per-call rounding, and unknown-kind saves', () => {
  const { api, saves } = meter();
  api.record('gemini', 0); // Existing callers treat a falsy count as one.
  api.record('gemini', 3);
  api.record('grounded', 2);
  api.record('assistant', 1.5);
  assert.equal(api.current().estCostUSD, 0.0198);
  assert.equal(api.current().geminiCalls, 4);
  assert.equal(api.current().assistantMessages, 1.5);
  const before = structuredClone(api.current());
  api.record('not-a-metered-kind');
  assert.deepEqual(api.current(), before);
  assert.equal(saves.length, 5);
});

test('usage meter separates UTC months and current account without capturing stale settings', () => {
  let account = 'location-a', date = new Date('2026-09-30T23:59:59Z');
  const { api, saves } = meter({ getAccountKey: () => account, now: () => date });
  api.record('article', 2);
  account = 'location-b';
  api.record('grounded');
  account = 'location-a';
  assert.equal(api.current().articles, 2);
  date = new Date('2026-10-01T00:00:00Z');
  assert.equal(api.current().articles, 0);
  account = '';
  api.record('action');
  assert.equal(api.accountKey(), 'default');
  assert.equal(saves.at(-1).months['2026-09']['location-b'].groundedCalls, 1);
  assert.equal(saves.at(-1).months['2026-10'].default.actions, 1);
});

test('usage meter preserves persisted budgets and blocks at the exact existing threshold', () => {
  const { api, saves } = meter({ initialState: { months: {}, budgetUSD: 0.008 } });
  assert.equal(api.overBudget(), false);
  api.record('article');
  assert.equal(api.overBudget(), false);
  api.record('article');
  assert.equal(api.overBudget(), true);
  api.budgetUSD = null;
  assert.equal(api.overBudget(), false);
  api.budgetUSD = 0;
  assert.equal(api.overBudget(), true);
  api.save();
  assert.equal(saves.at(-1).budgetUSD, 0);
});

test('usage meter retains historical and partial counters without a schema migration', () => {
  const prior = { months: { '2026-08': { 'location-a': { articles: 4, estCostUSD: 0.016 } }, '2026-09': { 'location-a': { estCostUSD: 1.2345 } } }, budgetUSD: 2 };
  const { api, saves } = meter({ initialState: prior });
  api.record('social');
  assert.equal(api.current().geminiCalls, 1);
  assert.equal(api.current().estCostUSD, 1.2357);
  assert.deepEqual(saves[0].months['2026-08'], prior.months['2026-08']);
  assert.equal(saves[0].budgetUSD, 2);
  assert.deepEqual(normalizeUsageState({ budgetUSD: '2' }), { months: {}, budgetUSD: null });
  assert.deepEqual(normalizeUsageState(null), { months: {}, budgetUSD: null });
});

test('usage persistence failures do not turn completed provider work into a failed request', () => {
  const { api } = meter({ saveState: () => { throw new Error('Test-only disk unavailable'); } });
  assert.doesNotThrow(() => api.record('article'));
  assert.equal(api.current().articles, 1);
  assert.equal(api.current().estCostUSD, 0.004);
});

function repository(t, tenantId = 'usage-test') {
  const storageRoot = mkdtempSync(join(tmpdir(), 'seo-usage-'));
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  const files = createFileStateRepository({ storageRoot, tenantId });
  return { files, usage: createUsageRepository(files), storageRoot };
}

test('usage repository persists the same tenant file and restores counters and budget after restart', t => {
  const { files, usage, storageRoot } = repository(t);
  const { api } = meter({ initialState: usage.load(), saveState: usage.save });
  api.budgetUSD = 12;
  api.record('grounded', 4);
  assert.deepEqual(files.listStateFiles(), ['usage.json']);
  const second = meter({ initialState: usage.load(), saveState: usage.save }).api;
  assert.deepEqual(second.current(), api.current());
  assert.equal(second.budgetUSD, 12);
  const other = createUsageRepository(createFileStateRepository({ storageRoot, tenantId: 'other-location' }));
  assert.deepEqual(other.load(), { months: {}, budgetUSD: null });
});

test('usage repository preserves corrupt existing files during boot', t => {
  const { files, usage } = repository(t);
  writeFileSync(files.pathFor('usage.json'), '{test-only incomplete JSON');
  const { api } = meter({ initialState: usage.load(), saveState: usage.save });
  assert.equal(api.current().estCostUSD, 0);
  assert.equal(readFileSync(files.pathFor('usage.json'), 'utf8'), '{test-only incomplete JSON');
});

test('usage repository writes still reach the existing durable-state observer', t => {
  const { files, usage } = repository(t);
  const observed = [];
  setJsonWriteObserver((file, value) => observed.push({ file, value: structuredClone(value) }));
  try {
    const { api } = meter({ initialState: usage.load(), saveState: usage.save });
    api.record('article');
    assert.equal(observed.length, 2);
    assert.equal(observed[1].file, files.pathFor('usage.json'));
    assert.equal(observed[1].value.months['2026-09']['location-a'].articles, 1);
  } finally { setJsonWriteObserver(null); }
});

test('usage repository preserves read failure and best-effort initialization semantics', () => {
  let writes = 0;
  const failedRead = createUsageRepository({ readJson() { throw new Error('unreadable'); }, writeJson() { writes++; } });
  assert.equal(failedRead.load(), null);
  assert.equal(writes, 0);
  const failedInit = createUsageRepository({ readJson(key, fallback) { return fallback; }, writeJson() { writes++; throw new Error('unwritable'); } });
  assert.deepEqual(failedInit.load(), { months: {}, budgetUSD: null });
  assert.equal(writes, 1);
});
