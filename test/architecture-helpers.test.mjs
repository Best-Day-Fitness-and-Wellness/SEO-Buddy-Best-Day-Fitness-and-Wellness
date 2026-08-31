import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { singleFlight } = require('../lib/single-flight.js');
const { ttlCache } = require('../lib/ttl-cache.js');
const { upsertDailySnapshot } = require('../lib/daily-snapshot.js');
const {
  SCORE_VERSION,
  migrateSnapshots,
  scoreDelta,
  scorePillars,
  snapshotFromScore,
  stabilizeScore,
} = require('../lib/health-score.js');
const { mocksAllowed, resolveAppMode, integrationUnavailable } = require('../lib/runtime-mode.js');
const { sanitize } = require('../lib/logger.js');
const { createRequestMetrics } = require('../lib/request-metrics.js');
const { parse: parseDotenv } = require('dotenv');
const { serializeDotenv } = require('../lib/dotenv-store.js');
const { writeFileAtomicSync, writeJsonFileSync } = require('../lib/json-file-store.js');
const {
  findBusinessUnitUrl: tpFindBusinessUnitUrl,
  normalizeBusinessUnit: tpNormalizeBusinessUnit,
  comparePageClaim: tpComparePageClaim,
  negativeCount: tpNegativeCount,
  trustpilotTrend: tpTrend,
} = require('../lib/trustpilot.js');

test('structured logs redact secrets without losing useful error context', () => {
  const clean = sanitize({
    requestId: 'request-123',
    authorization: 'Bearer do-not-log',
    nested: { apiKey: 'do-not-log', provider: 'gemini' },
    error: new Error('provider timeout'),
  });
  assert.equal(clean.authorization, '[redacted]');
  assert.equal(clean.nested.apiKey, '[redacted]');
  assert.equal(clean.nested.provider, 'gemini');
  assert.equal(clean.error.message, 'provider timeout');
});

test('request metrics stay bounded and expose operational totals', () => {
  const metrics = createRequestMetrics(() => new Date('2026-08-31T12:00:00.000Z'));
  metrics.started('GET');
  metrics.started('POST');
  metrics.finished(200, 42);
  metrics.finished(503, 2400);
  assert.deepEqual(metrics.snapshot(), {
    startedAt: '2026-08-31T12:00:00.000Z',
    totals: { requests: 2, responses: 2 },
    methods: { GET: 1, POST: 1 },
    statusClasses: { '2xx': 1, '3xx': 0, '4xx': 0, '5xx': 1 },
    latencyBuckets: { under100ms: 1, under500ms: 0, under2s: 0, over2s: 1 },
    averageDurationMs: 1221,
    inFlight: 0,
  });
});

test('singleFlight coalesces overlap without caching settled results', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const operation = singleFlight(async () => {
    calls++;
    await gate;
    return { call: calls };
  });

  const first = operation();
  const second = operation();
  assert.strictEqual(first, second);
  assert.equal(calls, 0, 'the operation starts on the next microtask');

  release();
  assert.deepEqual(await first, { call: 1 });
  assert.equal(calls, 1);

  assert.deepEqual(await operation(), { call: 2 });
  assert.equal(calls, 2, 'a settled result is never reused');
});

test('singleFlight clears a rejected operation for the next caller', async () => {
  let calls = 0;
  const operation = singleFlight(async () => {
    calls++;
    if (calls === 1) throw new Error('temporary failure');
    return 'recovered';
  });

  await assert.rejects(operation(), /temporary failure/);
  assert.equal(await operation(), 'recovered');
  assert.equal(calls, 2);
});

test('ttlCache coalesces overlap and reuses a settled value until expiry', async () => {
  let time = 1000;
  let calls = 0;
  const cached = ttlCache(async () => ({ call: ++calls }), { ttlMs: 100, now: () => time });

  const [first, second] = await Promise.all([cached(), cached()]);
  assert.deepEqual(first, { call: 1 });
  assert.strictEqual(first, second);
  assert.deepEqual(await cached(), { call: 1 });
  assert.equal(calls, 1);

  time += 101;
  assert.deepEqual(await cached(), { call: 2 });
  assert.equal(calls, 2);
});

test('ttlCache serves a recent successful value during a transient failure', async () => {
  let time = 0;
  let fail = false;
  const cached = ttlCache(async () => {
    if (fail) throw new Error('upstream unavailable');
    return 'stable';
  }, { ttlMs: 10, staleIfErrorMs: 50, now: () => time });

  assert.equal(await cached(), 'stable');
  fail = true;
  time = 11;
  assert.equal(await cached(), 'stable');
  time = 61;
  await assert.rejects(cached(), /upstream unavailable/);
});

test('upsertDailySnapshot skips identical writes and enforces retention', () => {
  const original = [{ date: '2026-08-17', value: 1 }, { date: '2026-08-18', value: 2 }];
  const unchanged = upsertDailySnapshot(original, { date: '2026-08-18', value: 2 }, 2);
  assert.equal(unchanged.changed, false);
  assert.strictEqual(unchanged.snapshots, original);

  const changed = upsertDailySnapshot(original, { date: '2026-08-19', value: 3 }, 2);
  assert.equal(changed.changed, true);
  assert.deepEqual(changed.snapshots, [
    { date: '2026-08-18', value: 2 },
    { date: '2026-08-19', value: 3 },
  ]);
  assert.deepEqual(original, [{ date: '2026-08-17', value: 1 }, { date: '2026-08-18', value: 2 }]);
});

test('health score keeps raw precision and rounds only the final weighted score', () => {
  const score = scorePillars([
    { key: 'primary', label: 'Primary', weight: 80, measured: true, score: 69.49, inputs: { value: 1 } },
    { key: 'secondary', label: 'Secondary', weight: 20, measured: true, score: 70.04, inputs: { value: 2 } },
  ], '2026-08-31T12:00:00.000Z');

  assert.equal(score.scoreVersion, SCORE_VERSION);
  assert.equal(score.pillars[0].score, 69);
  assert.equal(score.pillars[0].rawScore, 69.49);
  assert.equal(score.rawOverall, 69.6);
  assert.equal(score.liveOverall, 70);
  assert.equal(score.confidence.level, 'high');
});

test('health score treats missing data as unknown and lowers confidence for stale sources', () => {
  const score = scorePillars([
    { key: 'measured', label: 'Measured', weight: 50, measured: true, score: 80, sourceUpdatedAt: '2026-07-01T00:00:00.000Z' },
    { key: 'unknown', label: 'Unknown', weight: 50, measured: false, score: null },
  ], '2026-08-31T12:00:00.000Z');

  assert.equal(score.liveOverall, 80);
  assert.equal(score.pillars[1].score, null);
  assert.deepEqual(score.confidence.stalePillars, ['measured']);
  assert.equal(score.confidence.percent, 40);
  assert.equal(score.confidence.level, 'low');
});

test('health score stabilization uses seven same-version daily samples', () => {
  const history = [69, 70, 71, 72, 73, 74, 99].map((overall, index) => ({
    date: `2026-08-${String(23 + index).padStart(2, '0')}`,
    version: index === 6 ? 1 : SCORE_VERSION,
    overall,
    liveOverall: overall,
    rawOverall: overall,
  }));
  const current = {
    date: '2026-08-31', version: SCORE_VERSION, overall: 75,
    liveOverall: 75, rawOverall: 75,
  };

  const stable = stabilizeScore(history, current);
  assert.equal(stable.samples, 7);
  assert.equal(stable.overall, 72);
  assert.equal(stable.method, 'daily-average');
});

test('legacy score history is versioned and never used as a v2 trend baseline', () => {
  const migrated = migrateSnapshots([{ date: '2026-07-01', overall: 80 }]);
  const score = scorePillars([{ key: 'one', label: 'One', weight: 100, measured: true, score: 69, inputs: { observed: 69 } }]);
  const current = snapshotFromScore(score, '2026-08-31T12:00:00.000Z');

  assert.equal(migrated[0].version, 1);
  assert.equal(stabilizeScore(migrated, current).samples, 1);
  assert.equal(scoreDelta(migrated, current), null);
  assert.deepEqual(current.pillars[0].inputs, { observed: 69 });
});

test('runtime mode fails closed for Railway and explicit production environments', () => {
  assert.equal(resolveAppMode({ RAILWAY_PROJECT_ID: 'project' }), 'production');
  assert.equal(resolveAppMode({ NODE_ENV: 'production' }), 'production');
  assert.equal(resolveAppMode({ APP_MODE: 'demo', NODE_ENV: 'production' }), 'demo');
  assert.equal(mocksAllowed('production', { ALLOW_MOCK_INTEGRATIONS: 'true' }), false);
  assert.equal(mocksAllowed('development', {}), true);
  assert.throws(() => resolveAppMode({ APP_MODE: 'maybe' }), /APP_MODE/);
});

test('integration unavailable errors carry a stable production contract', () => {
  const error = integrationUnavailable('gohighlevel', 'Publishing is not configured.');
  assert.equal(error.code, 'INTEGRATION_UNAVAILABLE');
  assert.equal(error.integration, 'gohighlevel');
  assert.equal(error.statusCode, 503);
});

test('writeJsonFileSync replaces complete JSON and leaves no temporary files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-buddy-json-store-'));
  const file = join(directory, 'state.json');

  try {
    writeJsonFileSync(file, { version: 1, items: ['first'] });
    writeJsonFileSync(file, { version: 2, items: ['second'] });

    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 2, items: ['second'] });
    assert.deepEqual(readdirSync(directory), ['state.json']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('writeJsonFileSync preserves the existing file when serialization fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-buddy-json-store-'));
  const file = join(directory, 'state.json');
  const circular = {};
  circular.self = circular;

  try {
    writeJsonFileSync(file, { stable: true });
    assert.throws(() => writeJsonFileSync(file, circular), /circular/i);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { stable: true });
    assert.deepEqual(readdirSync(directory), ['state.json']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('dotenv serialization round-trips escapes, quotes, and multiline values without injection', () => {
  const values = {
    WINDOWS_PATH: 'C:\\data\\google-creations.json',
    LITERAL_ESCAPE: 'line one\\nline two',
    MULTILINE_NAME: 'Coach\nINJECTED_KEY=not-a-setting',
    MIXED_QUOTES: 'Coach O\'Brien said "move better"',
  };

  const serialized = serializeDotenv(values);
  assert.deepEqual(parseDotenv(serialized), values);
  assert.doesNotMatch(serialized, /^INJECTED_KEY=/m);
});

test('writeFileAtomicSync replaces private files completely and cleans temporary files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'seo-buddy-private-store-'));
  const file = join(directory, 'credentials.json');

  try {
    writeFileAtomicSync(file, 'first-secret', { mode: 0o600 });
    writeFileAtomicSync(file, 'second-secret', { mode: 0o600 });

    assert.equal(readFileSync(file, 'utf8'), 'second-secret');
    assert.deepEqual(readdirSync(directory), ['credentials.json']);
    if (process.platform !== 'win32') {
      assert.equal(statSync(file).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// --- Trustpilot business-unit parsing ---------------------------------------
// The network call needs a paid plan and a key; everything that can actually be
// got wrong is the parsing, so that is what is pinned here.

test('trustpilot: the API key never travels in the lookup URL', () => {
  const url = tpFindBusinessUnitUrl('https://www.BestDayFitness.com/some/path');
  assert.equal(url, 'https://api.trustpilot.com/v1/business-units/find?name=bestdayfitness.com');
  assert.doesNotMatch(url, /apikey/i, 'the key belongs in a header, not a query string');
  assert.equal(
    tpFindBusinessUnitUrl('example.com', 'http://127.0.0.1:9/v1/'),
    'http://127.0.0.1:9/v1/business-units/find?name=example.com',
    'the base URL is overridable so this is testable without calling Trustpilot');
});

test('trustpilot: a live profile is reduced to the fields the tile needs', () => {
  const parsed = tpNormalizeBusinessUnit({
    id: 'abc123',
    displayName: 'Best Day Fitness',
    name: { identifying: 'bestdayfitness.com' },
    status: 'active',
    score: { trustScore: 4.7, stars: 4.5 },
    numberOfReviews: { total: 41, usedForTrustScoreCalculation: 39, fiveStars: 35, fourStars: 4, threeStars: 1, twoStars: 1, oneStar: 0 },
  });
  assert.equal(parsed.businessUnitId, 'abc123');
  assert.equal(parsed.trustScore, 4.7);
  assert.equal(parsed.stars, 4.5);
  assert.equal(parsed.reviewCount, 41, 'the public total, not the filtered one — that is what a visitor sees');
  assert.equal(parsed.distribution[5], 35);
  assert.equal(parsed.profileUrl, 'https://www.trustpilot.com/review/bestdayfitness.com');
});

test('trustpilot: a claimed but never-reviewed profile is data, not an error', () => {
  const parsed = tpNormalizeBusinessUnit({
    id: 'abc123', displayName: 'Best Day Fitness', name: { identifying: 'bestdayfitness.com' },
    score: { trustScore: 0, stars: 0 }, numberOfReviews: { total: 0 },
  });
  assert.equal(parsed.reviewCount, 0);
  assert.equal(parsed.trustScore, 0);
  assert.equal(parsed.distribution, null, 'no star breakdown to report');
});

test('trustpilot: an unrecognisable payload becomes null rather than a half-object', () => {
  for (const junk of [null, undefined, 'nope', {}, { message: 'Not Found' }, []]) {
    assert.equal(tpNormalizeBusinessUnit(junk), null, `expected null for ${JSON.stringify(junk)}`);
  }
});

test('trustpilot: the page claim is compared against Trustpilot, and silence means silence', () => {
  const live = { reviewCount: 41 };
  assert.deepEqual(tpComparePageClaim({ reviewCount: 41 }, live), { claimed: 41, actual: 41, drift: 0, matches: true });
  assert.deepEqual(tpComparePageClaim({ reviewCount: 38 }, live), { claimed: 38, actual: 41, drift: -3, matches: false });
  assert.equal(tpComparePageClaim(null, live), null, 'no claim on the page is nothing to fail');
  assert.equal(tpComparePageClaim({ reviewCount: 41 }, null), null, 'no live data is nothing to compare against');
  assert.equal(tpComparePageClaim({ avgRating: 4.7 }, live), null, 'a rating without a count is not a count claim');
});

test('trustpilot: low ratings are counted, and "cannot see" is not "zero"', () => {
  assert.equal(tpNegativeCount({ 5: 30, 4: 5, 3: 2, 2: 1, 1: 3 }), 4);
  assert.equal(tpNegativeCount({ 5: 30, 4: 5, 3: 2 }), null, 'no 1/2-star keys at all means no breakdown');
  assert.equal(tpNegativeCount({ 5: 30, 2: 0, 1: 0 }), 0, 'an explicit zero is a real zero');
  assert.equal(tpNegativeCount(null), null);
});

test('trustpilot: the trend measures movement, not level', () => {
  const snaps = [
    { date: '2026-07-01', trustpilot: { trustScore: 4.8, reviewCount: 30, negative: 1 } },
    { date: '2026-07-20', trustpilot: { trustScore: 4.7, reviewCount: 36, negative: 2 } },
    { date: '2026-08-20', trustpilot: { trustScore: 4.6, reviewCount: 41, negative: 4 } },
  ];
  const now = { trustScore: 4.6, reviewCount: 41, distribution: { 1: 3, 2: 1, 5: 37 } };
  const t = tpTrend(snaps, now, '2026-08-20', 30);
  assert.equal(t.comparable, true);
  assert.equal(t.partial, undefined === t.partial ? undefined : false);
  assert.equal(t.since, '2026-07-20', 'compares against the reading at the window start');
  assert.equal(t.scoreDelta, -0.1);
  assert.equal(t.reviewDelta, 5);
  assert.equal(t.negativeDelta, 2);
  assert.equal(t.now.negative, 4, 'today comes from the live distribution, not the snapshot');
});

test('trustpilot: a young install reports its real history instead of nothing', () => {
  const snaps = [{ date: '2026-08-14', trustpilot: { trustScore: 4.5, reviewCount: 10, negative: 0 } }];
  const t = tpTrend(snaps, { trustScore: 4.6, reviewCount: 12, distribution: { 1: 0, 2: 0, 5: 12 } }, '2026-08-20', 30);
  assert.equal(t.comparable, true);
  assert.equal(t.partial, true, 'flagged so the UI can say "since we started watching"');
  assert.equal(t.since, '2026-08-14');
  assert.equal(t.reviewDelta, 2);
});

test('trustpilot: no history, or history without Trustpilot in it, is not comparable', () => {
  const live = { trustScore: 4.6, reviewCount: 12, distribution: { 1: 1, 2: 0 } };
  assert.equal(tpTrend([], live, '2026-08-20').comparable, false);
  assert.equal(tpTrend([{ date: '2026-07-01', published: 26 }], live, '2026-08-20').comparable, false,
    'older snapshots predate the Trustpilot module and carry no reading');
  const none = tpTrend(null, live, '2026-08-20');
  assert.equal(none.comparable, false);
  assert.equal(none.now.negative, 1, 'today is still reported even with no history to compare it to');
});
