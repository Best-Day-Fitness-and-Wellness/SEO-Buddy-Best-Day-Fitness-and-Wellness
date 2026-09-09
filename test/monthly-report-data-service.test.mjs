import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMonthlyReportDataService } = require('../lib/monthly-report-data-service');

function harness(overrides = {}) {
  const calls = [];
  const warnings = [];
  const aiState = { snapshots: [{ id: 'older' }, { id: 'latest' }], lastRun: '2026-09-08T00:00:00.000Z' };
  const dependencies = {
    buildScore: async () => ({ overall: 73 }),
    getPerformance: async () => ({ success: true, clicks: 25 }),
    getSearch: async () => ({ success: true, source: 'live_gsc' }),
    getReviews: async () => ({ reviewCount: 14 }),
    getQueue: async () => ({ pending: 1 }),
    buildMoves: () => [{ key: 'next' }],
    getProfile: () => ({ name: 'Best Day Fitness' }),
    getHistory: () => [{ title: 'Article' }],
    getAiState: () => aiState,
    getDigest: () => ({ success: true, lastRun: '2026-09-07T00:00:00.000Z' }),
    buildAutomation: (features, queue, running) => {
      calls.push(['automation', features, queue, running]);
      return [{ key: 'content', state: 'scheduled' }];
    },
    getAutomationFeatures: () => [{ key: 'content' }],
    getWorkerRunning: () => true,
    buildReadiness: () => ({ success: true, ready: 7, total: 7 }),
    nowIso: () => '2026-09-09T18:00:00.000Z',
    logger: { warn: (...args) => warnings.push(args) },
    ...overrides,
  };
  return {
    service: createMonthlyReportDataService(dependencies),
    aiState,
    calls,
    warnings,
  };
}

test('monthly report assembly preserves every existing source wrapper and projection', async () => {
  const { service, calls } = harness();
  assert.deepEqual(await service.build(), {
    score: { success: true, overall: 73 },
    performance: { success: true, clicks: 25 },
    moves: { success: true, moves: [{ key: 'next' }] },
    profile: { success: true, profile: { name: 'Best Day Fitness' } },
    search: { success: true, source: 'live_gsc' },
    history: [{ title: 'Article' }],
    ai: { latest: { id: 'latest' }, lastRun: '2026-09-08T00:00:00.000Z' },
    digest: { success: true, lastRun: '2026-09-07T00:00:00.000Z' },
    automation: {
      success: true,
      checkedAt: '2026-09-09T18:00:00.000Z',
      features: [{ key: 'content', state: 'scheduled' }],
    },
    reviews: { success: true, reviewCount: 14 },
    readiness: { success: true, ready: 7, total: 7 },
  });
  assert.deepEqual(calls, [[
    'automation',
    [{ key: 'content' }],
    { pending: 1 },
    true,
  ]]);
});

test('optional live sources fail independently and retain the established warning', async () => {
  const failure = label => async () => { throw new Error(`${label} unavailable`); };
  const { service, warnings } = harness({
    buildScore: failure('score'),
    getPerformance: failure('performance'),
    getSearch: failure('search'),
    getReviews: failure('reviews'),
    getQueue: failure('queue'),
  });
  const result = await service.build();
  assert.equal(result.score, null);
  assert.equal(result.performance, null);
  assert.equal(result.search, null);
  assert.equal(result.reviews, null);
  assert.equal(result.automation, null);
  assert.deepEqual(result.moves, { success: true, moves: [{ key: 'next' }] });
  assert.deepEqual(result.readiness, { success: true, ready: 7, total: 7 });
  assert.equal(warnings.length, 5);
  assert.ok(warnings.every(([event, detail]) => event === 'monthly_report.source_unavailable' && detail.error instanceof Error));
});

test('source reads start concurrently before report projections are assembled', async () => {
  const started = [];
  const pending = [];
  const source = name => () => new Promise(resolve => {
    started.push(name);
    pending.push(() => resolve(name === 'queue' ? { pending: 0 } : {}));
  });
  const { service } = harness({
    buildScore: source('score'),
    getPerformance: source('performance'),
    getSearch: source('search'),
    getReviews: source('reviews'),
    getQueue: source('queue'),
  });
  const report = service.build();
  await Promise.resolve();
  assert.deepEqual(started, ['score', 'performance', 'search', 'reviews', 'queue']);
  pending.forEach(resolve => resolve());
  await report;
});

test('a missing queue suppresses automation projection without affecting the report', async () => {
  let automationCalls = 0;
  const { service } = harness({
    getQueue: async () => null,
    buildAutomation: () => { automationCalls += 1; return []; },
  });
  const report = await service.build();
  assert.equal(report.automation, null);
  assert.equal(automationCalls, 0);
  assert.equal(report.score.overall, 73);
});

test('each build reads current history and AI state instead of capturing stale snapshots', async () => {
  let history = [{ title: 'First' }];
  const aiState = { snapshots: [{ id: 'first' }], lastRun: 'first-run' };
  const { service } = harness({ getHistory: () => history, getAiState: () => aiState });
  assert.equal((await service.build()).ai.latest.id, 'first');
  history = [{ title: 'Second' }];
  aiState.snapshots.push({ id: 'second' });
  aiState.lastRun = 'second-run';
  const second = await service.build();
  assert.deepEqual(second.history, [{ title: 'Second' }]);
  assert.deepEqual(second.ai, { latest: { id: 'second' }, lastRun: 'second-run' });
});

test('non-optional report projections preserve fail-fast behavior', async () => {
  const { service, warnings } = harness({ buildMoves: () => { throw new Error('moves failed'); } });
  await assert.rejects(service.build(), /moves failed/);
  assert.equal(warnings.length, 0);
});

test('service validates all required report data boundaries', () => {
  const valid = {
    buildScore: () => {}, getPerformance: () => {}, getSearch: () => {}, getReviews: () => {}, getQueue: () => {},
    buildMoves: () => {}, getProfile: () => {}, getHistory: () => {}, getAiState: () => ({ snapshots: [] }),
    getDigest: () => {}, buildAutomation: () => {}, getAutomationFeatures: () => {}, getWorkerRunning: () => {},
    buildReadiness: () => {},
  };
  for (const key of Object.keys(valid)) {
    const broken = { ...valid };
    delete broken[key];
    assert.throws(() => createMonthlyReportDataService(broken), new RegExp(`${key} is required`));
  }
  assert.throws(() => createMonthlyReportDataService({ ...valid, logger: {} }), /logger.warn is required/);
  assert.throws(() => createMonthlyReportDataService({ ...valid, nowIso: 'not a function' }), /nowIso is required/);
});
