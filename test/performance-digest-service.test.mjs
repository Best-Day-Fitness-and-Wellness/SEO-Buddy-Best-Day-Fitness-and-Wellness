import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  createPerformanceDigestService,
  percentageChange,
  renderPerformanceDigest,
} = require('../lib/performance-digest-service.js');

function digestState(overrides = {}) {
  return {
    enabled: true,
    intervalDays: 7,
    autoEmail: false,
    lastRun: null,
    digest: null,
    ...overrides,
  };
}

function performance(overrides = {}) {
  return {
    source: 'live_gsc',
    current: { clicks: 120, impressions: 2400, avgPosition: 8.4 },
    previous: { clicks: 100, impressions: 2000, avgPosition: 9.1 },
    movers: {
      gainers: [
        { query: 'one', posChange: 5, position: 3 },
        { query: 'two', posChange: 4, position: 4 },
        { query: 'three', posChange: 3, position: 5 },
        { query: 'four', posChange: 2, position: 6 },
      ],
      losers: [
        { query: 'five', posChange: -3, position: 9 },
        { query: 'six', posChange: -2, position: 10 },
        { query: 'seven', posChange: -1, position: 11 },
        { query: 'eight', posChange: -1, position: 12 },
      ],
    },
    aioTrend: [{ rate: 35 }, { rate: 42 }],
    leads: { available: true, current: 7, previous: 5 },
    ...overrides,
  };
}

function makeService(overrides = {}) {
  const state = digestState(overrides.state);
  const sends = [];
  const errors = [];
  let saves = 0;
  const service = createPerformanceDigestService({
    state,
    save: () => { saves += 1; },
    getPerformance: async () => performance(),
    getHealthScore: async () => ({ overall: 73 }),
    businessName: 'Best Day Fitness',
    gmailClient: () => ({ connected: true }),
    sendGmail: async (...args) => { sends.push(args); return 'message-1'; },
    daysSince: () => 10,
    env: { DIGEST_EMAIL: 'owner@example.com', GMAIL_SENDER: 'sender@example.com' },
    nowIso: () => '2026-09-09T17:00:00.000Z',
    logger: { error(...args) { errors.push(args); } },
    ...overrides,
    state,
  });
  return { service, state, sends, errors, saves: () => saves };
}

test('performance digest percentage and text preserve the existing report language', () => {
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(80, 100), -20);
  assert.equal(percentageChange(5, 0), null);
  assert.equal(percentageChange(5, null), null);

  const text = renderPerformanceDigest({
    source: 'mock',
    score: 73,
    clicks: { cur: 120, pct: 20 },
    impressions: { cur: 2400, pct: -10 },
    avgPosition: { cur: 8.4, prev: 9.1 },
    aiVisibility: 42,
    leads: { current: 7, previous: 5 },
    gainers: [{ query: 'balance training', posChange: 5, position: 3 }],
    losers: [{ query: 'mobility', posChange: -2, position: 10 }],
  }, 'Best Day Fitness');

  assert.equal(text, [
    'Best Day Fitness — Weekly SEO Performance',
    '',
    'Optimization Score: 73/100',
    '',
    'Clicks: 120 (+20% vs the previous 4 weeks)',
    'Impressions: 2400 (-10%)',
    'Average Google rank: 8.4 (was 9.1)',
    'AI visibility: 42% of audits recommend you',
    'New leads: 7 (was 5)',
    '',
    'Top rising keywords:',
    '  • balance training — up 5 spots, now #3',
    '',
    'Slipping keywords (worth a look):',
    '  • mobility — down 2 spots, now #10',
    '',
    '(Sample data — connect Search Console for live numbers.)',
    '',
    '— SEO Buddy',
  ].join('\n'));
});

test('digest building preserves measured fields, bounds movers, and treats score as optional', async () => {
  const { service } = makeService();
  const result = await service.build();
  assert.equal(result.generatedAt, '2026-09-09T17:00:00.000Z');
  assert.equal(result.source, 'live_gsc');
  assert.equal(result.score, 73);
  assert.deepEqual(result.clicks, { cur: 120, prev: 100, pct: 20 });
  assert.deepEqual(result.impressions, { cur: 2400, prev: 2000, pct: 20 });
  assert.deepEqual(result.avgPosition, { cur: 8.4, prev: 9.1 });
  assert.deepEqual(result.gainers.map(item => item.query), ['one', 'two', 'three']);
  assert.deepEqual(result.losers.map(item => item.query), ['five', 'six', 'seven']);
  assert.equal(result.aiVisibility, 42);
  assert.deepEqual(result.leads, { current: 7, previous: 5 });
  assert.match(result.text, /^Best Day Fitness — Weekly SEO Performance/);
  assert.doesNotMatch(result.text, /Sample data/);

  const scoreUnavailable = makeService({
    getPerformance: async () => performance({
      current: null,
      previous: null,
      movers: null,
      aioTrend: [],
      leads: { available: false, current: 99, previous: 88 },
    }),
    getHealthScore: async () => { throw new Error('unavailable'); },
  });
  const sparse = await scoreUnavailable.service.build();
  assert.equal(sparse.score, null);
  assert.equal(sparse.clicks, null);
  assert.equal(sparse.impressions, null);
  assert.equal(sparse.avgPosition, null);
  assert.deepEqual(sparse.gainers, []);
  assert.deepEqual(sparse.losers, []);
  assert.equal(sparse.aiVisibility, null);
  assert.equal(sparse.leads, null);
});

test('scheduled digest preserves persistence order and verified Gmail delivery', async () => {
  const { service, state, sends, saves } = makeService({ state: { autoEmail: true } });
  await service.maybeRun(true);

  assert.equal(service.running, false);
  assert.equal(saves(), 2);
  assert.equal(state.lastRun, '2026-09-09T17:00:00.000Z');
  assert.equal(state.digest.isNew, true);
  assert.equal(state.digest.emailedAt, '2026-09-09T17:00:00.000Z');
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0], [
    'owner@example.com',
    'Your weekly SEO performance — Best Day Fitness',
    state.digest.text,
  ]);
});

test('digest run preserves due guards, overlap, and best-effort failure behavior', async () => {
  for (const candidate of [
    makeService({ state: { enabled: false } }),
    makeService({ daysSince: () => 2 }),
  ]) {
    await candidate.service.maybeRun(false);
    assert.equal(candidate.state.digest, null);
    assert.equal(candidate.saves(), 0);
  }

  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const overlap = makeService({
    getPerformance: async () => { reads += 1; await pending; return performance(); },
  });
  const first = overlap.service.maybeRun(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlap.service.running, true);
  await overlap.service.maybeRun(true);
  assert.equal(reads, 1);
  release();
  await first;
  assert.equal(overlap.saves(), 1);

  const buildFailure = makeService({
    getPerformance: async () => { throw new Error('performance failed'); },
  });
  await buildFailure.service.maybeRun(true);
  assert.equal(buildFailure.saves(), 0);
  assert.deepEqual(buildFailure.errors, [['[Perf Digest] build failed:', 'performance failed']]);

  const emailFailure = makeService({
    state: { autoEmail: true },
    sendGmail: async () => { throw new Error('gmail failed'); },
  });
  await emailFailure.service.maybeRun(true);
  assert.equal(emailFailure.saves(), 1);
  assert.equal(emailFailure.state.digest.emailedAt, undefined);
  assert.deepEqual(emailFailure.errors, [['[Perf Digest] auto-email failed:', 'gmail failed']]);
});

test('digest status, manual saves, preferences, and seen state retain their contracts', () => {
  const { service, state, saves } = makeService({
    state: { digest: { text: 'Existing', isNew: true } },
  });
  assert.equal(service.deliveryRecipient(), 'owner@example.com');
  assert.deepEqual(service.status(), {
    success: true,
    enabled: true,
    autoEmail: false,
    intervalDays: 7,
    lastRun: null,
    digest: { text: 'Existing', isNew: true },
    busy: false,
    gmailConfigured: true,
    emailTo: 'owner@example.com',
  });

  service.saveNewDigest({ text: 'Manual' });
  assert.deepEqual(state.digest, { text: 'Manual', isNew: true });
  assert.equal(state.lastRun, '2026-09-09T17:00:00.000Z');
  assert.deepEqual(service.setPreferences({ enabled: false, autoEmail: true }), {
    success: true,
    enabled: false,
    autoEmail: true,
  });
  service.markSeen();
  assert.equal(state.digest.isNew, false);
  assert.equal(saves(), 3);

  const senderFallback = makeService({ env: { GMAIL_SENDER: 'sender@example.com' } });
  assert.equal(senderFallback.service.status().emailTo, 'sender@example.com');
});
