import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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
const { buildBrowserAssets, renderAssetIndex } = require('../lib/browser-assets.js');
const { createAccessControl, tokenFingerprint } = require('../lib/access-control.js');
const { createAuditLog } = require('../lib/audit-log.js');
const { normalizeSecretInput } = require('../lib/secrets.js');
const { createFileStateRepository, normalizeTenantId } = require('../lib/state-repository.js');
const { createBackupService } = require('../lib/backup-service.js');
const { loadMigrations } = require('../lib/postgres-store.js');
const { createDurableJobQueue } = require('../lib/durable-job-queue.js');
const { createSwitchableJobQueue } = require('../lib/job-queue.js');
const { createJobWorker } = require('../lib/job-worker.js');
const { createPostgresJobQueue, publicJob: publicPostgresJob } = require('../lib/postgres-job-queue.js');
const { registerProfileRoutes } = require('../lib/profile-routes.js');
const { normalizeBudget, registerUsageRoutes } = require('../lib/usage-routes.js');
const { createGscService, mapPageRows, mapQueryRows, searchDateRange } = require('../lib/gsc-routes.js');
const { registerAutopilotRoutes } = require('../lib/autopilot-routes.js');
const { belongsToSearchConsoleProperty, registerContentRoutes } = require('../lib/content-routes.js');
const { buildVisibilityDeltas, normalizePrompts, registerAiVisibilityRoutes } = require('../lib/ai-visibility-routes.js');
const { registerAiAuditRoutes } = require('../lib/ai-audit-routes.js');
const { registerScheduledFeatureRoutes } = require('../lib/scheduled-feature-routes.js');
const { createGoogleDelivery } = require('../lib/google-delivery.js');
const { EMAIL_PATTERN, registerDeliveryRoutes } = require('../lib/delivery-routes.js');
const { CITATION_STATUSES, LISTING_TYPES, normalizeCitationQueries, registerCitationRoutes } = require('../lib/citation-routes.js');
const { buildCanonicalNap, buildReviewReplyPrompt, mapNapListings, registerLocalSeoRoutes } = require('../lib/local-seo-routes.js');
const { aggregateGscRows, createPerformanceService, registerPerformanceRoutes } = require('../lib/performance-routes.js');
const { ProviderRuntimeError, createProviderRuntime } = require('../lib/provider-runtime.js');
const { createPostgresStateBridge, replayPostgresOutbox } = require('../lib/postgres-state-bridge.js');
const { classifyContactSource, summarizeContactAttribution } = require('../lib/attribution.js');
const { assessArticleQuality } = require('../lib/content-quality.js');
const { parse: parseDotenv } = require('dotenv');
const { serializeDotenv } = require('../lib/dotenv-store.js');
const { setJsonWriteObserver, writeFileAtomicSync, writeJsonFileSync } = require('../lib/json-file-store.js');
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

test('browser assets use deterministic content hashes and replace every index token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-buddy-assets-'));
  try {
    writeFileAtomicSync(join(dir, 'app.js'), 'console.log("v1")');
    const first = buildBrowserAssets(dir, [{ token: 'APP_ASSET', file: 'app.js' }]);
    const second = buildBrowserAssets(dir, [{ token: 'APP_ASSET', file: 'app.js' }]);
    assert.match(first[0].url, /^\/assets\/app\.[a-f0-9]{12}\.js$/);
    assert.equal(first[0].url, second[0].url);
    assert.equal(renderAssetIndex('<script src="{{APP_ASSET}}"></script>', first), `<script src="${first[0].url}"></script>`);
    assert.throws(() => renderAssetIndex('{{MISSING_ASSET}}', first), /Unresolved browser asset token/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('access control preserves owner access and limits an operator to operational actions', () => {
  const access = createAccessControl({ ownerToken: 'owner-secret', operatorToken: 'operator-secret' });
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  });
  const request = token => ({ headers: { authorization: `Bearer ${token}` }, ip: '127.0.0.1', socket: {} });

  let nextCalled = false;
  access.requireRole('operator')(request('operator-secret'), response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  const forbidden = response();
  access.requireRole('owner')(request('operator-secret'), forbidden, () => assert.fail('operator must not become owner'));
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.body.code, 'INSUFFICIENT_ROLE');

  nextCalled = false;
  const ownerRequest = request('owner-secret');
  access.requireRole('owner')(ownerRequest, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(ownerRequest.auth.role, 'owner');
  assert.equal(ownerRequest.auth.actorId, `owner:${tokenFingerprint('owner-secret')}`);
});

test('audit records are hash-chained, signed when configured, and detect edits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-buddy-audit-'));
  const file = join(dir, 'audit.jsonl');
  try {
    const audit = createAuditLog({ filePath: file, signingKey: 'stable-audit-key', clock: () => new Date('2026-08-31T12:00:00.000Z') });
    audit.record({ requestId: 'one', actorId: 'owner:abc', role: 'owner', action: 'POST /api/save-settings', statusCode: 200 });
    audit.record({ requestId: 'two', actorId: 'operator:def', role: 'operator', action: 'POST /api/autopilot-run-now', statusCode: 503 });
    assert.deepEqual(audit.verify(), { valid: true, entries: 2, signed: true, head: JSON.parse(readFileSync(file, 'utf8').trim().split(/\r?\n/)[1]).hash });

    const changed = readFileSync(file, 'utf8').replace('POST /api/save-settings', 'POST /api/changed');
    writeFileAtomicSync(file, changed, { mode: 0o600 });
    assert.equal(audit.verify().valid, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('secret inputs reject control characters and never normalize malformed credentials', () => {
  assert.equal(normalizeSecretInput('  valid-token-123  ', 'API key'), 'valid-token-123');
  assert.throws(() => normalizeSecretInput('valid\nINJECTED=value', 'API key'), /control characters/);
  assert.throws(() => normalizeSecretInput('x'.repeat(20), 'API key', 10), /longer than expected/);
});

test('file repository migrates legacy state without deleting it and enforces tenant boundaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-repository-'));
  try {
    writeJsonFileSync(join(root, 'history.json'), [{ title: 'Legacy article' }]);
    const repository = createFileStateRepository({ storageRoot: root, tenantId: 'Best Day Fitness / St Pete' });
    assert.equal(repository.tenantId, 'best-day-fitness-st-pete');
    assert.deepEqual(repository.readJson('history.json', []), [{ title: 'Legacy article' }]);
    assert.equal(existsSync(join(root, 'history.json')), true, 'rollback copy stays untouched');
    assert.deepEqual(repository.migrated, ['history.json']);
    assert.throws(() => repository.pathFor('../outside.json'), /Invalid state key|escapes tenant boundary/);
    assert.throws(() => normalizeTenantId('../../'), /TENANT_ID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup manifests verify checksums and restore a tenant snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-backup-'));
  try {
    const repository = createFileStateRepository({ storageRoot: root, tenantId: 'tenant-one' });
    repository.writeJson('history.json', [{ title: 'Before' }]);
    const service = createBackupService({ repository, backupRoot: join(root, 'backups') });
    const backup = service.create();
    assert.equal(service.verify(backup.id).valid, true);
    repository.writeJson('history.json', [{ title: 'After' }]);
    service.restore(backup.id);
    assert.deepEqual(repository.readJson('history.json', []), [{ title: 'Before' }]);
    const manifestPath = join(service.backupRoot, backup.id, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files[0].name = '../outside.json';
    writeJsonFileSync(manifestPath, manifest);
    assert.match(service.verify(backup.id).error, /invalid state key/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PostgreSQL migrations are immutable, ordered, and ignore unrelated files', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-migrations-'));
  try {
    writeFileAtomicSync(join(root, '002_second.sql'), 'SELECT 2;');
    writeFileAtomicSync(join(root, '001_first.sql'), 'SELECT 1;');
    writeFileAtomicSync(join(root, 'notes.txt'), 'ignored');
    const migrations = loadMigrations(root);
    assert.deepEqual(migrations.map(item => item.name), ['001_first.sql', '002_second.sql']);
    assert.ok(migrations.every(item => /^[a-f0-9]{64}$/.test(item.checksum)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PostgreSQL state bridge durably captures writes and drains its outbox', async () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-postgres-bridge-'));
  try {
    const repository = createFileStateRepository({ storageRoot: root, tenantId: 'bridge-test' });
    const writes = [];
    const store = { putState: async (tenantId, key, value) => { writes.push({ tenantId, key, value }); } };
    const bridge = createPostgresStateBridge({ repository, store });
    bridge.capture(repository.pathFor('health-score.json'), { score: 69 });
    assert.equal(existsSync(repository.pathFor('postgres-outbox.pending')), true);
    assert.equal(await bridge.flush(), true);
    assert.deepEqual(writes, [{ tenantId: 'bridge-test', key: 'health-score.json', value: { score: 69 } }]);
    assert.equal(existsSync(repository.pathFor('postgres-outbox.pending')), false);
    bridge.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PostgreSQL state bridge replays a pending write before hydration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-postgres-replay-'));
  try {
    const repository = createFileStateRepository({ storageRoot: root, tenantId: 'replay-test' });
    const failing = createPostgresStateBridge({
      repository,
      store: { putState: async () => { throw new Error('database offline'); } },
    });
    failing.capture(repository.pathFor('usage.json'), { total: 4 });
    assert.equal(await failing.flush(), false);
    failing.close();

    const writes = [];
    const replayed = await replayPostgresOutbox({
      repository,
      store: { putState: async (tenantId, key, value) => { writes.push({ tenantId, key, value }); } },
    });
    assert.equal(replayed, 1);
    assert.deepEqual(writes, [{ tenantId: 'replay-test', key: 'usage.json', value: { total: 4 } }]);
    assert.equal(existsSync(repository.pathFor('postgres-outbox.pending')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('durable jobs are idempotent, leased, completed, and never expose payloads in snapshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-jobs-'));
  let clock = Date.parse('2026-08-31T12:00:00.000Z');
  let sequence = 0;
  try {
    const queue = createDurableJobQueue({
      filePath: join(root, 'jobs.json'),
      now: () => clock,
      createId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    const first = queue.enqueue('seo.scan', { secret: 'must-not-leak' }, { idempotencyKey: 'scan:2026-08-31' });
    const duplicate = queue.enqueue('seo.scan', { secret: 'different' }, { idempotencyKey: 'scan:2026-08-31' });
    assert.equal(first.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, first.job.id);

    const claimed = queue.claim('worker-one', { leaseMs: 5000 });
    assert.equal(claimed.status, 'running');
    assert.deepEqual(claimed.payload, { secret: 'must-not-leak' });
    clock += 1000;
    assert.equal(queue.renewLease(claimed.id, 'wrong-worker', 5000), false);
    assert.equal(queue.renewLease(claimed.id, 'worker-one', 5000), true);
    assert.equal(Date.parse(queue.snapshot().recent[0].leaseUntil), clock + 5000);
    assert.equal(queue.complete(claimed.id, { rows: 3 }), true);
    const snapshot = queue.snapshot();
    assert.deepEqual(snapshot.counts, { pending: 0, running: 0, succeeded: 1, failed: 0 });
    assert.equal('payload' in snapshot.recent[0], false);
    assert.deepEqual(snapshot.recent[0].result, { rows: 3 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('durable jobs reclaim expired leases and retry with bounded exponential backoff', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-job-retries-'));
  let clock = Date.parse('2026-08-31T12:00:00.000Z');
  try {
    const queue = createDurableJobQueue({ filePath: join(root, 'jobs.json'), now: () => clock, createId: () => '00000000-0000-4000-8000-000000000001' });
    queue.enqueue('seo.retry', {}, { idempotencyKey: 'retry:one', maxAttempts: 3 });
    const first = queue.claim('worker-one', { leaseMs: 1000 });
    clock += 1001;
    const reclaimed = queue.claim('worker-two', { leaseMs: 1000 });
    assert.equal(reclaimed.id, first.id);
    assert.equal(reclaimed.attempts, 2);

    const retry = queue.fail(reclaimed.id, new Error('temporary provider outage'), { baseDelayMs: 2000 });
    assert.equal(retry.status, 'pending');
    assert.equal(Date.parse(retry.runAt), clock + 4000);
    assert.equal(queue.claim('worker-three'), null);
    clock += 4000;
    const finalAttempt = queue.claim('worker-three');
    const failed = queue.fail(finalAttempt.id, new Error('still unavailable'), { baseDelayMs: 2000 });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.lastError, 'still unavailable');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('durable jobs do not retry deterministic failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-job-terminal-'));
  try {
    const queue = createDurableJobQueue({ filePath: join(root, 'jobs.json') });
    queue.enqueue('content.quality', {}, { idempotencyKey: 'quality:one', maxAttempts: 5 });
    const job = queue.claim('worker-one');
    const error = new Error('quality gate failed');
    error.retryable = false;
    const failed = queue.fail(job.id, error);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('switchable job queue preserves one asynchronous worker contract', async () => {
  const calls = [];
  const fileQueue = { enqueue: value => { calls.push(`file:${value}`); return { created: true }; } };
  const databaseQueue = { enqueue: async value => { calls.push(`postgres:${value}`); return { created: true }; } };
  const queue = createSwitchableJobQueue(fileQueue, 'filesystem');
  assert.deepEqual(await queue.enqueue('one'), { created: true });
  queue.setBackend(databaseQueue, 'postgres');
  assert.deepEqual(await queue.enqueue('two'), { created: true });
  assert.equal(queue.backend(), 'postgres');
  assert.deepEqual(calls, ['file:one', 'postgres:two']);
});

test('PostgreSQL job queue maps database rows without exposing payloads', async () => {
  const timestamp = new Date('2026-08-31T12:00:00.000Z');
  const row = {
    job_id: '00000000-0000-4000-8000-000000000001', job_type: 'health.snapshot', payload: { secret: true },
    status: 'pending', attempts: 0, max_attempts: 5, run_at: timestamp, lease_until: null,
    idempotency_key: 'health:one', created_at: timestamp, updated_at: timestamp,
    started_at: null, finished_at: null, last_error: null, result: null,
  };
  assert.equal(Object.hasOwn(publicPostgresJob(row), 'payload'), false);
  const pool = { query: async sql => {
    if (sql.startsWith('INSERT INTO durable_jobs')) return { rows: [row], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const queue = createPostgresJobQueue({ pool, tenantId: 'best-day-fitness' });
  const inserted = await queue.enqueue('health.snapshot', { secret: true }, { idempotencyKey: 'health:one' });
  assert.equal(inserted.created, true);
  assert.equal(inserted.job.id, row.job_id);
  assert.equal(Object.hasOwn(inserted.job, 'payload'), false);
});

test('job worker executes registered handlers behind the queue interface', async () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-job-worker-'));
  try {
    const queue = createSwitchableJobQueue(createDurableJobQueue({ filePath: join(root, 'jobs.json') }));
    await queue.enqueue('health.snapshot', { day: 'today' }, { idempotencyKey: 'health:worker' });
    const handled = [];
    const handlers = new Map([['health.snapshot', async payload => { handled.push(payload); return { recorded: true }; }]]);
    const logger = { info() {}, error() {}, warn() {} };
    const worker = createJobWorker({ queue, handlers, logger, workerId: 'test-worker', intervalMs: 1000, heartbeatMs: 250 });
    worker.start();
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await queue.snapshot()).counts.succeeded === 1) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await worker.stop();
    assert.deepEqual(handled, [{ day: 'today' }]);
    assert.equal((await queue.snapshot()).counts.succeeded, 1);
    assert.equal(worker.status().running, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('profile routes preserve brand and business response contracts', () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const brandDefaults = { tagline: 'Default', tone: 'Friendly' };
  const brandState = { profile: { ...brandDefaults }, reviewedAt: null };
  let business = { name: 'Best Day Fitness' };
  let saves = 0;
  const requireOwner = () => {};
  registerProfileRoutes(app, {
    requireOwner,
    brandDefaults,
    brandState,
    saveBrand: () => { saves += 1; return true; },
    storageReadiness: () => ({ persistent: true }),
    businessProfile: () => business,
    saveBusinessProfile: body => { business = { ...business, ...body }; },
    now: () => '2026-09-01T12:00:00.000Z',
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  const invalid = response();
  routes.get('POST /api/brand-profile')({ body: {} }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.body, { success: false, error: 'No brand profile supplied.' });

  const saved = response();
  routes.get('POST /api/brand-profile')({ body: { brand: { tagline: 'Updated' } } }, saved);
  assert.deepEqual(saved.body, {
    success: true,
    brand: { tagline: 'Updated', tone: 'Friendly' },
    reviewedAt: '2026-09-01T12:00:00.000Z',
    persisted: true,
    durable: true,
  });

  const reset = response();
  routes.get('POST /api/brand-profile/reset')({ body: {} }, reset);
  assert.deepEqual(reset.body.brand, brandDefaults);
  assert.equal(reset.body.reviewedAt, null);
  assert.equal(saves, 2);

  const updatedBusiness = response();
  routes.get('POST /api/business-profile')({ body: { city: 'St. Petersburg' } }, updatedBusiness);
  assert.deepEqual(updatedBusiness.body, {
    success: true,
    profile: { name: 'Best Day Fitness', city: 'St. Petersburg' },
  });
});

test('usage routes preserve reporting and owner budget contracts', () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const requireOwner = () => {};
  const usageState = { budgetUSD: 25 };
  let saves = 0;
  registerUsageRoutes(app, {
    requireOwner,
    currentUsage: () => ({ geminiCalls: 3, estCostUSD: 1.25 }),
    usageMonthKey: () => '2026-09',
    accountKey: () => 'best-day-fitness',
    usageState,
    usageOverBudget: () => false,
    saveUsage: () => { saves += 1; },
  });

  function response() {
    return {
      body: null,
      json(body) { this.body = body; return this; },
    };
  }

  const usage = response();
  routes.get('GET /api/usage')({}, usage);
  assert.deepEqual(usage.body, {
    month: '2026-09',
    account: 'best-day-fitness',
    usage: { geminiCalls: 3, estCostUSD: 1.25 },
    budgetUSD: 25,
    overBudget: false,
  });

  const saved = response();
  routes.get('POST /api/usage/budget')({ body: { budgetUSD: '-12' } }, saved);
  assert.deepEqual(saved.body, { success: true, budgetUSD: 0 });
  assert.equal(usageState.budgetUSD, 0);
  assert.equal(saves, 1);

  assert.equal(normalizeBudget(''), null);
  assert.equal(normalizeBudget('invalid'), 0);
  assert.equal(normalizeBudget('42.5'), 42.5);
});

test('Search Console service preserves query shaping, sorting, and live contracts', async () => {
  assert.deepEqual(searchDateRange(() => Date.parse('2026-09-01T12:00:00.000Z')), {
    startDate: '2026-08-02',
    endDate: '2026-09-01',
  });
  assert.deepEqual(mapQueryRows([
    { keys: ['popular'], impressions: 100, clicks: 8, ctr: 0.08, position: 2.14 },
    { keys: ['opportunity'], impressions: 25, clicks: 0, ctr: 0, position: 6.25 },
  ]), [
    { query: 'opportunity', impressions: 25, clicks: 0, ctr: 0, position: 6.3, leak: true },
    { query: 'popular', impressions: 100, clicks: 8, ctr: 8, position: 2.1, leak: false },
  ]);
  assert.deepEqual(mapPageRows([
    { keys: ['https://example.com/low'], impressions: 5, clicks: 1, ctr: 0.2, position: 8.94 },
    { keys: ['https://example.com/high'], impressions: 40, clicks: 0, ctr: 0, position: 3.01 },
  ]).map(row => row.page), ['https://example.com/high', 'https://example.com/low']);

  const requests = [];
  const service = createGscService({
    getGoogleAuth: () => ({ account: 'service' }),
    getSiteUrl: () => 'sc-domain:bestdayfitness.com',
    getRawCredentials: () => '',
    createWebmasters: auth => ({ auth }),
    searchConsoleQuery: async (client, request) => {
      requests.push({ client, request });
      return { data: { rows: [{ keys: ['https://bestdayfitness.com/page'], impressions: 12, clicks: 0, ctr: 0, position: 4 }] } };
    },
    parseServiceAccountJson: () => ({ creds: null, repairs: [] }),
    credentialShape: () => '',
    integrationUnavailable: (provider, message) => new Error(`${provider}: ${message}`),
    allowMockIntegrations: false,
    mockData: [],
    baseDir: process.cwd(),
    now: () => Date.parse('2026-09-01T12:00:00.000Z'),
    logger: { error() {} },
  });

  const dashboard = await service.getDashboardData();
  assert.equal(dashboard.source, 'live_gsc');
  assert.equal(dashboard.data[0].query, 'https://bestdayfitness.com/page');

  const pages = await service.getPages(' senior fitness ');
  assert.equal(pages.source, 'live_gsc');
  assert.equal(pages.query, 'senior fitness');
  assert.deepEqual(requests[1].request.requestBody.dimensionFilterGroups, [{
    filters: [{ dimension: 'query', operator: 'equals', expression: 'senior fitness' }],
  }]);

  const diagnostics = await service.diagnostics();
  assert.equal(diagnostics.verdict, 'connected');
  assert.equal(diagnostics.serviceAccountEmail, null);
  assert.equal(Object.hasOwn(diagnostics, 'private_key'), false);
});

test('autopilot routes preserve schedule, queue, target, and run contracts', async () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const state = {
    enabled: true,
    intervalHours: 24,
    nextRunTime: '2026-09-02T12:00:00.000Z',
    queue: [],
    targets: ['senior fitness'],
    targetIndex: 1,
    logs: ['ready'],
  };
  let saves = 0;
  let schedulerStarts = 0;
  registerAutopilotRoutes(app, {
    requireAuth: () => {},
    state,
    startScheduler: () => { schedulerStarts += 1; state.nextRunTime = null; },
    saveConfig: () => { saves += 1; },
    runCycle: async () => ({ title: 'Balance guide', indexWarning: false }),
    explainIndexError: message => `explained: ${message}`,
    now: () => '2026-09-01T12:00:00.000Z',
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  const status = response();
  routes.get('GET /api/autopilot-status')({}, status);
  assert.deepEqual(status.body, {
    enabled: true,
    intervalHours: 24,
    nextRunTime: '2026-09-02T12:00:00.000Z',
    queue: [],
    targets: ['senior fitness'],
    logs: ['ready'],
  });

  const toggled = response();
  routes.get('POST /api/autopilot-toggle')({ body: { enabled: false, intervalHours: '12' } }, toggled);
  assert.equal(state.enabled, false);
  assert.equal(state.intervalHours, 12);
  assert.equal(schedulerStarts, 1);
  assert.equal(toggled.body.message, 'Autopilot schedule updated successfully.');

  const queued = response();
  routes.get('POST /api/autopilot-queue/add')({ body: { topic: '  mobility training  ' } }, queued);
  assert.deepEqual(state.queue, [{ topic: 'mobility training', addedAt: '2026-09-01T12:00:00.000Z' }]);

  const duplicate = response();
  routes.get('POST /api/autopilot-targets/add')({ body: { keyword: 'SENIOR FITNESS' } }, duplicate);
  assert.equal(duplicate.body.note, 'Already a target.');

  const removed = response();
  routes.get('POST /api/autopilot-targets/remove')({ body: { index: 0 } }, removed);
  assert.deepEqual(state.targets, []);
  assert.equal(state.targetIndex, 0);

  const run = response();
  await routes.get('POST /api/autopilot-run-now')({ body: {} }, run);
  assert.equal(run.body.ran, true);
  assert.equal(run.body.message, 'Autopilot completed a run successfully!');
  assert.equal(saves, 3);
});

test('content routes preserve validation, history, quality, and property containment', async () => {
  assert.equal(belongsToSearchConsoleProperty('https://www.example.com/post', 'sc-domain:example.com'), true);
  assert.equal(belongsToSearchConsoleProperty('https://example.com.evil.test/post', 'sc-domain:example.com'), false);
  assert.equal(belongsToSearchConsoleProperty('https://example.com/blog/post', 'https://example.com/blog/'), true);

  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const state = { history: [] };
  const generatedArgs = [];
  const indexedUrls = [];
  let saves = 0;
  registerContentRoutes(app, {
    requireAuth: () => {},
    state,
    generateArticle: async (...args) => { generatedArgs.push(args); return { success: true, title: 'Draft' }; },
    publishGhl: async (title, content, status) => ({ success: true, source: 'live_ghl', url: 'https://example.com/blog/draft', title, content, status }),
    indexUrl: async url => { indexedUrls.push(url); return { success: true, source: 'live_indexing' }; },
    safeHttpUrl: value => /^https?:\/\//.test(String(value || '')) ? String(value) : '',
    sanitizeArticleHtml: value => value.replace(/<script>.*?<\/script>/g, ''),
    assessArticleQuality: () => ({ score: 88, version: 3 }),
    brandViolations: () => [],
    usageOverBudget: () => false,
    budgetBlock: res => res.json({ budgetReached: true }),
    integrationErrorStatus: () => 502,
    explainIndexError: message => message,
    saveHistory: () => { saves += 1; },
    getSearchConsoleProperty: () => 'sc-domain:example.com',
    today: () => '2026-09-01',
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  const generated = response();
  await routes.get('POST /api/generate-article')({ body: { keyword: '  senior mobility  ', ctaUrl: 'https://example.com/join' } }, generated);
  assert.deepEqual(generated.body, { success: true, title: 'Draft' });
  assert.deepEqual(generatedArgs[0], ['senior mobility', '', '', 'https://example.com/join', '']);

  const published = response();
  await routes.get('POST /api/publish-ghl')({ body: { title: ' Guide ', content: '<p>Safe</p><script>bad</script>', status: 'published', keyword: 'mobility' } }, published);
  assert.equal(published.body.quality.score, 88);
  assert.deepEqual(state.history, [{
    title: 'Guide',
    keyword: 'mobility',
    platform: 'GoHighLevel (published)',
    date: '2026-09-01',
    indexed: 'Indexing Available',
    url: 'https://example.com/blog/draft',
    qualityScore: 88,
    qualityVersion: 3,
  }]);

  const rejected = response();
  await routes.get('POST /api/index-url')({ body: { url: 'https://outside.test/post' } }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.deepEqual(indexedUrls, []);

  const indexed = response();
  await routes.get('POST /api/index-url')({ body: { url: 'https://example.com/blog/draft' } }, indexed);
  assert.equal(indexed.body.source, 'live_indexing');
  assert.equal(state.history[0].indexed, 'Indexing Requested');
  assert.equal(saves, 2);
});

test('AI Visibility routes preserve status, prompt, schedule, and run contracts', async () => {
  assert.deepEqual(buildVisibilityDeltas(
    { visibilityScore: 60, shareOfVoice: 30, sentimentScore: null },
    { visibilityScore: 55, shareOfVoice: 32, sentimentScore: 70 },
  ), { visibility: 5, shareOfVoice: -2, sentiment: null });
  assert.deepEqual(normalizePrompts([' one ', '', 'two'], ['default']), ['one', 'two']);
  assert.deepEqual(normalizePrompts([], ['default']), ['default']);
  assert.equal(normalizePrompts('invalid', ['default']), null);

  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const state = {
    prompts: ['senior fitness'],
    snapshots: [{ date: '2026-08-31', visibilityScore: 50, shareOfVoice: 25, sentimentScore: 80 }],
    updatedAt: '2026-08-31T12:00:00.000Z',
    autoEnabled: true,
    intervalDays: 7,
    lastRun: '2026-08-31T12:00:00.000Z',
    running: false,
  };
  let nudges = 0;
  let saves = 0;
  registerAiVisibilityRoutes(app, {
    requireAuth: () => {},
    state,
    nudgeSchedule: () => { nudges += 1; },
    brandName: () => 'Best Day Fitness',
    enginesStatus: () => [{ id: 'google', configured: true }],
    trend: () => ({ series: [], metricLines: {}, dates: ['2026-08-31'] }),
    anyConfigured: () => true,
    runVisibility: async engines => ({ snapshot: { engines, visibilityScore: 75 } }),
    usageOverBudget: () => false,
    budgetBlock: res => res.json({ budgetReached: true }),
    save: () => { saves += 1; },
    defaultPrompts: ['default prompt'],
    logger: { error() {} },
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  const status = response();
  routes.get('GET /api/ai-visibility')({}, status);
  assert.equal(nudges, 1);
  assert.equal(status.body.brand, 'Best Day Fitness');
  assert.deepEqual(status.body.deltas, { visibility: null, shareOfVoice: null, sentiment: null });
  assert.equal(status.body.running, false);

  const prompts = response();
  routes.get('POST /api/ai-visibility/prompts')({ body: { prompts: ['  balance training ', ''] } }, prompts);
  assert.deepEqual(state.prompts, ['balance training']);

  const toggle = response();
  routes.get('POST /api/ai-visibility/toggle')({ body: { enabled: false } }, toggle);
  assert.equal(state.autoEnabled, false);

  const run = response();
  await routes.get('POST /api/ai-visibility/run')({ body: { engines: ['google'] } }, run);
  assert.deepEqual(run.body, { success: true, snapshot: { engines: ['google'], visibilityScore: 75 } });
  assert.equal(state.running, false);
  assert.equal(saves, 2);
});

test('AI audit routes preserve status, concurrency, budget, and error contracts', async () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
  };
  const factState = { running: false };
  const crawlerState = { running: false };
  let overBudget = false;
  let factResult = { snapshot: { claims: 3 } };
  let factSawRunning = false;
  let crawlerSawRunning = false;
  const errors = [];

  registerAiAuditRoutes(app, {
    requireAuth: () => {},
    usageOverBudget: () => overBudget,
    budgetBlock: res => res.status(429).json({ success: false, budgetReached: true }),
    logger: { error(...args) { errors.push(args); } },
    audits: [
      {
        path: '/api/ai-factcheck',
        state: factState,
        status: () => ({ latest: { claims: 2 }, running: factState.running, engines: ['gemini'] }),
        run: async () => {
          factSawRunning = factState.running;
          if (factResult instanceof Error) throw factResult;
          return factResult;
        },
        useBudget: true,
        rejectOutputError: true,
        logLabel: 'FactCheck',
      },
      {
        path: '/api/ai-crawlers',
        state: crawlerState,
        status: () => ({ latest: null, running: crawlerState.running, site: 'example.com' }),
        run: async () => {
          crawlerSawRunning = crawlerState.running;
          return { snapshot: { allowed: true } };
        },
        logLabel: 'AI Crawlers',
      },
    ],
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  const status = response();
  routes.get('GET /api/ai-factcheck')({}, status);
  assert.deepEqual(status.body, { latest: { claims: 2 }, running: false, engines: ['gemini'] });

  factState.running = true;
  const busy = response();
  await routes.get('POST /api/ai-factcheck/run')({}, busy);
  assert.deepEqual(busy.body, { success: true, busy: true });
  factState.running = false;

  overBudget = true;
  const blocked = response();
  await routes.get('POST /api/ai-factcheck/run')({}, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.body, { success: false, budgetReached: true });

  const crawler = response();
  await routes.get('POST /api/ai-crawlers/run')({}, crawler);
  assert.deepEqual(crawler.body, { success: true, snapshot: { allowed: true } });
  assert.equal(crawlerSawRunning, true);
  assert.equal(crawlerState.running, false);

  overBudget = false;
  const succeeded = response();
  await routes.get('POST /api/ai-factcheck/run')({}, succeeded);
  assert.deepEqual(succeeded.body, { success: true, snapshot: { claims: 3 } });
  assert.equal(factSawRunning, true);
  assert.equal(factState.running, false);

  factResult = { error: 'provider rejected request' };
  const rejected = response();
  await routes.get('POST /api/ai-factcheck/run')({}, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.deepEqual(rejected.body, { success: false, error: 'provider rejected request' });
  assert.equal(factState.running, false);

  factResult = new Error('provider unavailable');
  const failed = response();
  await routes.get('POST /api/ai-factcheck/run')({}, failed);
  assert.equal(failed.statusCode, 502);
  assert.deepEqual(failed.body, { success: false, error: 'provider unavailable' });
  assert.deepEqual(errors, [['[FactCheck run] failed:', 'provider unavailable']]);
  assert.equal(factState.running, false);
});

test('scheduled feature routes preserve nudge, toggle, availability, run, and seen contracts', () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  const requireAuth = () => {};
  const local = { enabled: true, isNew: true };
  const digest = { enabled: true, autoEmail: false, isNew: true };
  let available = false;
  let nudges = 0;
  let localStarts = 0;
  let digestStarts = 0;
  let saves = 0;

  registerScheduledFeatureRoutes(app, {
    requireAuth,
    features: [
      {
        path: '/api/local-autopilot',
        status: () => ({ success: true, enabled: local.enabled, hasKey: available }),
        nudge: () => { nudges += 1; },
        toggle: body => {
          local.enabled = !!body.enabled;
          saves += 1;
          return { success: true, enabled: local.enabled };
        },
        availability: () => available ? null : ({ success: true, unavailable: true, message: 'Add a key.' }),
        start: () => { localStarts += 1; },
        markSeen: () => { local.isNew = false; saves += 1; },
      },
      {
        path: '/api/performance-digest',
        status: () => ({ success: true, enabled: digest.enabled, autoEmail: digest.autoEmail }),
        toggle: body => {
          if (typeof body.enabled === 'boolean') digest.enabled = body.enabled;
          if (typeof body.autoEmail === 'boolean') digest.autoEmail = body.autoEmail;
          saves += 1;
          return { success: true, enabled: digest.enabled, autoEmail: digest.autoEmail };
        },
        start: () => { digestStarts += 1; },
        markSeen: () => { digest.isNew = false; saves += 1; },
      },
    ],
  });

  function response() {
    return {
      body: null,
      json(body) { this.body = body; return this; },
    };
  }
  const handler = (method, path) => routes.get(`${method} ${path}`).at(-1);

  for (const path of [
    '/api/local-autopilot/toggle',
    '/api/local-autopilot/run',
    '/api/local-autopilot/seen',
    '/api/performance-digest/toggle',
    '/api/performance-digest/run',
    '/api/performance-digest/seen',
  ]) {
    assert.equal(routes.get(`POST ${path}`)[0], requireAuth);
  }

  const status = response();
  handler('GET', '/api/local-autopilot')({}, status);
  assert.equal(nudges, 1);
  assert.deepEqual(status.body, { success: true, enabled: true, hasKey: false });

  const toggled = response();
  handler('POST', '/api/local-autopilot/toggle')({ body: { enabled: false } }, toggled);
  assert.deepEqual(toggled.body, { success: true, enabled: false });

  const blocked = response();
  handler('POST', '/api/local-autopilot/run')({ body: {} }, blocked);
  assert.deepEqual(blocked.body, { success: true, unavailable: true, message: 'Add a key.' });
  assert.equal(localStarts, 0);

  available = true;
  const started = response();
  handler('POST', '/api/local-autopilot/run')({ body: {} }, started);
  assert.deepEqual(started.body, { success: true, started: true });
  assert.equal(localStarts, 1);

  const seen = response();
  handler('POST', '/api/local-autopilot/seen')({ body: {} }, seen);
  assert.deepEqual(seen.body, { success: true });
  assert.equal(local.isNew, false);

  const digestToggle = response();
  handler('POST', '/api/performance-digest/toggle')({ body: { enabled: 'no', autoEmail: true } }, digestToggle);
  assert.deepEqual(digestToggle.body, { success: true, enabled: true, autoEmail: true });

  const digestRun = response();
  handler('POST', '/api/performance-digest/run')({ body: {} }, digestRun);
  assert.deepEqual(digestRun.body, { success: true, started: true });
  assert.equal(digestStarts, 1);
  assert.equal(saves, 3);
});

test('Google delivery adapter owns OAuth, Gmail encoding, and Business Profile publishing', async () => {
  const oauthClients = [];
  const gmailMessages = [];
  const providerCalls = [];
  const fetchCalls = [];
  class OAuth2 {
    constructor(id, secret, redirect) {
      this.id = id;
      this.secret = secret;
      this.redirect = redirect;
      oauthClients.push(this);
    }
    setCredentials(credentials) { this.credentials = credentials; }
    async getAccessToken() { return { token: 'gbp-access-token' }; }
  }
  const google = {
    auth: { OAuth2 },
    gmail: ({ version, auth }) => ({
      version,
      auth,
      users: { messages: { send: async request => { gmailMessages.push(request); return { data: { id: 'gmail-123' } }; } } },
    }),
  };
  const providerRuntime = {
    async run(provider, operation, options) {
      providerCalls.push({ provider, options });
      return operation();
    },
    async fetch(provider, url, options, policy) {
      fetchCalls.push({ provider, url, options, policy });
      return { ok: true, status: 200, json: async () => ({ name: 'posts/1', searchUrl: 'https://google.test/post/1' }) };
    },
  };
  const env = {};
  const delivery = createGoogleDelivery({ google, providerRuntime, env, siteDomain: () => 'https://example.com' });
  assert.equal(delivery.gmailClient(), null);
  assert.equal(delivery.gbpConfigured(), false);
  assert.deepEqual(await delivery.postGbpLocalPost('Draft'), { posted: false, needsSetup: true });

  Object.assign(env, {
    GMAIL_CLIENT_ID: 'gmail-client',
    GMAIL_CLIENT_SECRET: 'gmail-secret',
    GMAIL_REFRESH_TOKEN: 'gmail-refresh',
    GMAIL_SENDER: 'owner@example.com',
    GBP_REFRESH_TOKEN: 'gbp-refresh',
    GBP_ACCOUNT_ID: 'account-1',
    GBP_LOCATION_ID: 'location-1',
  });
  assert.ok(delivery.gmailClient());
  assert.equal(delivery.gbpConfigured(), true);
  assert.equal(await delivery.sendGmail(' editor@example.com ', 'A subject', 'A body'), 'gmail-123');
  assert.deepEqual(providerCalls, [{ provider: 'gmail', options: { policy: { retries: 0, timeoutMs: 30000 } } }]);
  const encoded = gmailMessages[0].requestBody.raw.replace(/-/g, '+').replace(/_/g, '/');
  const message = Buffer.from(encoded, 'base64').toString('utf8');
  assert.match(message, /To: editor@example\.com\r\nFrom: owner@example\.com\r\nSubject: A subject/);
  assert.match(message, /\r\n\r\nA body$/);

  assert.deepEqual(await delivery.postGbpLocalPost('Weekly update'), {
    posted: true,
    name: 'posts/1',
    searchUrl: 'https://google.test/post/1',
  });
  assert.equal(fetchCalls[0].provider, 'google-business-profile');
  assert.equal(fetchCalls[0].url, 'https://mybusiness.googleapis.com/v4/accounts/account-1/locations/location-1/localPosts');
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer gbp-access-token');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    languageCode: 'en-US',
    summary: 'Weekly update',
    topicType: 'STANDARD',
    callToAction: { actionType: 'LEARN_MORE', url: 'https://example.com' },
  });
  assert.deepEqual(fetchCalls[0].policy, { retries: 0 });
  assert.ok(oauthClients.every(client => client.redirect === 'https://developers.google.com/oauthplayground'));
});

test('delivery routes preserve setup, validation, send, draft, and digest contracts', async () => {
  assert.equal(EMAIL_PATTERN.test('valid@example.com'), true);
  assert.equal(EMAIL_PATTERN.test('invalid'), false);
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  const requireAuth = () => {};
  let gmailConnected = false;
  let gbpConnected = false;
  let gbpDraft = null;
  let digest = null;
  let recipient = '';
  let sendResult = 'message-1';
  let gbpResult = { posted: true, name: 'posts/1' };
  let marked = 0;
  let savedDigest = null;
  const sent = [];
  const errors = [];

  registerDeliveryRoutes(app, {
    requireAuth,
    gmailClient: () => gmailConnected ? ({}) : null,
    gmailSender: () => 'owner@example.com',
    sendGmail: async (...args) => {
      sent.push(args);
      if (sendResult instanceof Error) throw sendResult;
      return sendResult;
    },
    gbpConfigured: () => gbpConnected,
    postGbpLocalPost: async () => {
      if (gbpResult instanceof Error) throw gbpResult;
      if (typeof gbpResult === 'function') return gbpResult();
      return gbpResult;
    },
    getGbpDraft: () => gbpDraft,
    markGbpDraftPosted: () => { marked += 1; },
    defaultDigestRecipient: () => recipient,
    getDigest: () => digest,
    saveNewDigest: value => { savedDigest = value; digest = { ...value, isNew: true }; },
    buildDigest: async () => ({ text: 'Fresh digest' }),
    logger: { error(...args) { errors.push(args); } },
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }
  const handler = (method, path) => routes.get(`${method} ${path}`).at(-1);
  for (const path of ['/api/send-pitch', '/api/gbp-post', '/api/gbp-mark-posted', '/api/performance-digest/send']) {
    assert.equal(routes.get(`POST ${path}`)[0], requireAuth);
  }

  const gmailStatus = response();
  handler('GET', '/api/gmail-status')({}, gmailStatus);
  assert.deepEqual(gmailStatus.body, { configured: false, from: 'owner@example.com' });
  const gbpStatus = response();
  handler('GET', '/api/gbp-status')({}, gbpStatus);
  assert.deepEqual(gbpStatus.body, { configured: false });

  const pitchSetup = response();
  await handler('POST', '/api/send-pitch')({ body: { to: 'invalid' } }, pitchSetup);
  assert.equal(pitchSetup.body.needsSetup, true);
  gmailConnected = true;
  const pitchInvalid = response();
  await handler('POST', '/api/send-pitch')({ body: { to: 'invalid' } }, pitchInvalid);
  assert.equal(pitchInvalid.statusCode, 400);
  const pitchSent = response();
  await handler('POST', '/api/send-pitch')({ body: { to: 'editor@example.com', subject: 'Pitch', body: 'Hello' } }, pitchSent);
  assert.deepEqual(pitchSent.body, { success: true, sent: true, id: 'message-1' });
  sendResult = new Error('mailbox unavailable');
  const pitchFailed = response();
  await handler('POST', '/api/send-pitch')({ body: { to: 'editor@example.com' } }, pitchFailed);
  assert.equal(pitchFailed.statusCode, 502);
  assert.equal(pitchFailed.body.error, 'Gmail send failed: mailbox unavailable');

  const gbpMissing = response();
  await handler('POST', '/api/gbp-post')({ body: {} }, gbpMissing);
  assert.equal(gbpMissing.statusCode, 400);
  gbpDraft = { text: 'Draft post' };
  const gbpSetup = response();
  await handler('POST', '/api/gbp-post')({ body: {} }, gbpSetup);
  assert.equal(gbpSetup.body.needsSetup, true);
  gbpConnected = true;
  const gbpPosted = response();
  await handler('POST', '/api/gbp-post')({ body: {} }, gbpPosted);
  assert.deepEqual(gbpPosted.body, { success: true, posted: true, name: 'posts/1' });
  assert.equal(marked, 1);
  gbpDraft = { text: 'Draft post' };
  gbpResult = () => {
    gbpDraft = { text: 'Newer draft' };
    return { posted: true, name: 'posts/2' };
  };
  const superseded = response();
  await handler('POST', '/api/gbp-post')({ body: {} }, superseded);
  assert.equal(marked, 1, 'a superseded draft must not be marked as posted');
  gbpResult = new Error('GBP unavailable');
  const gbpFailed = response();
  await handler('POST', '/api/gbp-post')({ body: { text: 'Another post' } }, gbpFailed);
  assert.equal(gbpFailed.statusCode, 502);
  assert.equal(gbpFailed.body.error, 'GBP post failed: GBP unavailable');
  gbpDraft = null;
  const noDraft = response();
  handler('POST', '/api/gbp-mark-posted')({ body: {} }, noDraft);
  assert.deepEqual(noDraft.body, { success: true, note: 'No current post to mark.' });

  gmailConnected = false;
  const digestSetup = response();
  await handler('POST', '/api/performance-digest/send')({ body: {} }, digestSetup);
  assert.equal(digestSetup.body.needsSetup, true);
  gmailConnected = true;
  const digestInvalid = response();
  await handler('POST', '/api/performance-digest/send')({ body: {} }, digestInvalid);
  assert.equal(digestInvalid.statusCode, 400);
  recipient = 'owner@example.com';
  sendResult = 'digest-message';
  const digestSent = response();
  await handler('POST', '/api/performance-digest/send')({ body: {} }, digestSent);
  assert.deepEqual(savedDigest, { text: 'Fresh digest' });
  assert.deepEqual(digestSent.body, { success: true, sent: true, id: 'digest-message', to: 'owner@example.com' });
  assert.deepEqual(sent.at(-1), ['owner@example.com', 'Your weekly SEO performance — Best Day Fitness', 'Fresh digest']);
  assert.deepEqual(errors, [
    ['[Gmail send] failed:', 'mailbox unavailable'],
    ['[GBP post] failed:', 'GBP unavailable'],
  ]);
});

test('local SEO routes preserve NAP, generation, validation, and reply-history contracts', async () => {
  const business = {
    name: 'Best Day Fitness',
    streetAddress: '123 Main St',
    addressLocality: 'St. Petersburg',
    addressRegion: 'FL',
    postalCode: '33701',
    telephone: '+1 (727) 555-0100',
  };
  const canonical = buildCanonicalNap(business);
  assert.deepEqual(canonical, {
    name: 'Best Day Fitness',
    address: '123 Main St, St. Petersburg, FL 33701',
    phone: '+1 (727) 555-0100',
  });
  assert.deepEqual(mapNapListings([
    { platform: 'Google', name: 'Best Day Fitness LLC', address: '123 Main Street, St Petersburg, FL', phone: '727-555-0100' },
    { platform: 'Yelp', name: 'Different Gym', address: '999 Other Ave', phone: '727-555-9999' },
    { platform: 'Apple Maps' },
  ], business, canonical), [
    {
      platform: 'Google', name: 'Best Day Fitness LLC', address: '123 Main Street, St Petersburg, FL', phone: '727-555-0100',
      nameMatch: true, phoneMatch: true, addrMatch: true,
    },
    {
      platform: 'Yelp', name: 'Different Gym', address: '999 Other Ave', phone: '727-555-9999',
      nameMatch: false, phoneMatch: false, addrMatch: false,
    },
    {
      platform: 'Apple Maps', name: '', address: '', phone: '',
      nameMatch: null, phoneMatch: null, addrMatch: null,
    },
  ]);

  const routes = new Map();
  const app = {
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  const requireAuth = () => {};
  let hasKey = false;
  let geminiResult = { text: ' Generated copy ' };
  let geminiError = null;
  let saves = 0;
  const requests = [];
  const errors = [];
  const localState = {
    replyHistory: Array.from({ length: 20 }, (_, index) => ({ review: `old-${index}` })),
  };

  registerLocalSeoRoutes(app, {
    requireAuth,
    hasGeminiKey: () => hasKey,
    business,
    brandPrompt: () => 'Best Day Fitness brand',
    geminiGenerate: async request => {
      requests.push(request);
      if (geminiError) throw geminiError;
      return geminiResult;
    },
    model: 'gemini-test',
    localState,
    saveLocal: () => { saves += 1; },
    now: () => '2026-09-01T12:00:00.000Z',
    logger: { error(...args) { errors.push(args); } },
  });

  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const handler = path => routes.get(`POST ${path}`).at(-1);
  for (const path of ['/api/nap-audit', '/api/local-generate', '/api/local-reply']) {
    assert.equal(routes.get(`POST ${path}`)[0], requireAuth);
  }

  const napUnavailable = response();
  await handler('/api/nap-audit')({ body: {} }, napUnavailable);
  assert.deepEqual(napUnavailable.body, {
    success: true,
    unavailable: true,
    message: 'Add your Gemini API key in Settings to run a NAP audit (uses live Google Search grounding).',
    canonical,
    listings: [],
  });
  const generateUnavailable = response();
  await handler('/api/local-generate')({ body: { kind: 'unknown' } }, generateUnavailable);
  assert.equal(generateUnavailable.body.unavailable, true, 'credential check must stay ahead of generation validation');
  const replyInvalid = response();
  await handler('/api/local-reply')({ body: {} }, replyInvalid);
  assert.equal(replyInvalid.statusCode, 400, 'reply validation must stay ahead of its credential check');
  const replyUnavailable = response();
  await handler('/api/local-reply')({ body: { review: 'Great coaching' } }, replyUnavailable);
  assert.equal(replyUnavailable.body.unavailable, true);

  hasKey = true;
  geminiResult = {
    text: '```json\n{"listings":[{"platform":"Google","name":"Best Day Fitness","address":"123 Main St","phone":"7275550100"}]}\n```',
  };
  const nap = response();
  await handler('/api/nap-audit')({ body: {} }, nap);
  assert.equal(nap.body.listings[0].nameMatch, true);
  assert.equal(nap.body.listings[0].phoneMatch, true);
  assert.deepEqual(requests.at(-1).config, { tools: [{ googleSearch: {} }] });

  const missingReview = response();
  await handler('/api/local-generate')({ body: { kind: 'review-response' } }, missingReview);
  assert.deepEqual([missingReview.statusCode, missingReview.body], [400, { error: 'Paste the review to respond to.' }]);
  const missingTopic = response();
  await handler('/api/local-generate')({ body: { kind: 'gbp-post' } }, missingTopic);
  assert.deepEqual([missingTopic.statusCode, missingTopic.body], [400, { error: 'Enter a topic for the post.' }]);
  const unknownKind = response();
  await handler('/api/local-generate')({ body: { kind: 'unknown' } }, unknownKind);
  assert.deepEqual([unknownKind.statusCode, unknownKind.body], [400, { error: 'Unknown generation kind.' }]);

  geminiResult = { text: ' Thank you for the thoughtful review. ' };
  const generated = response();
  await handler('/api/local-generate')({ body: { kind: 'review-response', review: 'Great coaching', rating: 5 } }, generated);
  assert.deepEqual(generated.body, { success: true, text: 'Thank you for the thoughtful review.' });
  assert.equal(requests.at(-1).contents, buildReviewReplyPrompt('Best Day Fitness brand', 'Great coaching', 5));

  const longReview = 'x'.repeat(600);
  const replied = response();
  await handler('/api/local-reply')({ body: { review: longReview, rating: 4 } }, replied);
  assert.deepEqual(replied.body, { success: true, reply: 'Thank you for the thoughtful review.' });
  assert.equal(localState.replyHistory.length, 20);
  assert.deepEqual(localState.replyHistory[0], {
    review: 'x'.repeat(500),
    rating: 4,
    reply: 'Thank you for the thoughtful review.',
    createdAt: '2026-09-01T12:00:00.000Z',
  });
  assert.equal(saves, 1);

  geminiError = new Error('generation unavailable');
  const failed = response();
  await handler('/api/local-generate')({ body: { kind: 'review-request' } }, failed);
  assert.equal(failed.statusCode, 502);
  assert.deepEqual(failed.body, { success: false, error: 'generation unavailable' });
  assert.deepEqual(errors.at(-1), ['[Local Generate] failed:', 'generation unavailable']);
});

test('performance service preserves aggregation, trends, persistence, attribution, and route contracts', async () => {
  assert.deepEqual(aggregateGscRows([
    { keys: ['one'], impressions: 100, clicks: 10, position: 4 },
    { keys: ['two'], impressions: 50, clicks: 0, position: 8 },
    { impressions: 0, clicks: 0, position: 20 },
  ]), {
    impressions: 150,
    clicks: 10,
    avgPosition: 800 / 150,
    ctr: 10 / 150,
    byQuery: {
      one: { impressions: 100, clicks: 10, position: 4 },
      two: { impressions: 50, clicks: 0, position: 8 },
    },
  });

  const fixedNow = Date.parse('2026-09-01T12:00:00.000Z');
  let snapshots = [];
  let saves = 0;
  const gscRequests = [];
  const providerRequests = [];
  const gscRows = [
    [
      { keys: ['best day fitness'], impressions: 100, clicks: 10, position: 4 },
      { keys: ['senior fitness'], impressions: 50, clicks: 0, position: 8 },
      { keys: ['mobility coaching'], impressions: 20, clicks: 2, position: 5 },
    ],
    [
      { keys: ['best day fitness'], impressions: 80, clicks: 5, position: 7 },
      { keys: ['senior fitness'], impressions: 40, clicks: 1, position: 5 },
      { keys: ['mobility coaching'], impressions: 10, clicks: 1, position: 8 },
    ],
  ];
  const contacts = [
    { dateAdded: '2026-08-20T12:00:00Z', source: 'Google Organic Search' },
    { dateAdded: '2026-08-21T12:00:00Z', tags: ['ChatGPT referral'] },
    { dateAdded: '2026-07-20T12:00:00Z', source: 'Facebook' },
  ];
  const errors = [];
  const service = createPerformanceService({
    allowMockIntegrations: false,
    getGoogleAuth: () => ({ credential: true }),
    getSiteUrl: () => 'sc-domain:bestdayfitness.com',
    createWebmasters: auth => ({ auth }),
    searchConsoleQuery: async (webmasters, request) => {
      gscRequests.push({ webmasters, request });
      return { data: { rows: gscRows[gscRequests.length - 1] } };
    },
    getSnapshots: () => snapshots,
    replaceSnapshots: (next, changed) => {
      snapshots = next;
      if (changed) saves += 1;
    },
    getAioAudits: () => [
      { timestamp: '2026-08-30T12:00:00Z', recommended: true },
      { timestamp: '2026-08-30T16:00:00Z', recommended: false },
      { timestamp: '2026-08-31T12:00:00Z', recommended: true },
    ],
    getGhlConfig: () => ({ token: 'secret-token', locationId: 'location 1' }),
    providerFetch: async (...args) => {
      providerRequests.push(args);
      return { json: async () => ({ contacts }) };
    },
    now: () => fixedNow,
    logger: { error(...args) { errors.push(args); } },
  });

  const result = await service.computePerformanceSnapshot();
  assert.equal(result.source, 'live_gsc');
  assert.deepEqual(result.current, { impressions: 170, clicks: 12, avgPosition: 5.3, ctr: 7.06 });
  assert.deepEqual(result.previous, { impressions: 130, clicks: 7, avgPosition: 6.5, ctr: 5.38 });
  assert.deepEqual(result.movers.gainers.map(move => move.query), ['best day fitness', 'mobility coaching']);
  assert.deepEqual(result.movers.losers.map(move => move.query), ['senior fitness']);
  assert.deepEqual(result.brandedSearch, {
    available: true,
    current: { impressions: 100, clicks: 10 },
    previous: { impressions: 80, clicks: 5 },
  });
  assert.deepEqual(result.aioTrend, [
    { date: '2026-08-30', rate: 50, n: 2 },
    { date: '2026-08-31', rate: 100, n: 1 },
  ]);
  assert.equal(result.leads.current, 2);
  assert.equal(result.leads.previous, 1);
  assert.equal(result.leads.attribution.explicitlySearchAttributed, 2);
  assert.equal(result.aiReferral.available, false);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], {
    date: '2026-09-01',
    impressions: 170,
    clicks: 12,
    avgPosition: 5.3,
    leaks: 1,
    brandedImpressions: 100,
    recommendedRate: 67,
  });
  assert.equal(saves, 1);
  assert.equal(gscRequests.length, 2);
  assert.deepEqual(gscRequests[0].request.requestBody.dimensions, ['query']);
  assert.equal(gscRequests[0].request.requestBody.rowLimit, 250);
  assert.equal(providerRequests[0][0], 'gohighlevel');
  assert.match(providerRequests[0][1], /locationId=location%201&limit=100$/);
  assert.deepEqual(providerRequests[0][2].headers, {
    Authorization: 'Bearer secret-token',
    Version: '2021-07-28',
  });
  assert.deepEqual(providerRequests[0][3], { retries: 1 });
  assert.deepEqual(errors, []);

  const unavailable = createPerformanceService({
    allowMockIntegrations: false,
    getGoogleAuth: () => null,
    getSiteUrl: () => null,
    createWebmasters: () => { throw new Error('must not be called'); },
    searchConsoleQuery: () => { throw new Error('must not be called'); },
    getSnapshots: () => [],
    replaceSnapshots: () => {},
    getAioAudits: () => [],
    getGhlConfig: () => ({ token: '', locationId: '' }),
    providerFetch: () => { throw new Error('must not be called'); },
    now: () => fixedNow,
  });
  const unavailableResult = await unavailable.computePerformanceSnapshot();
  assert.equal(unavailableResult.source, 'unavailable');
  assert.deepEqual(unavailableResult.leads, {
    available: false,
    reason: 'GoHighLevel token/location not configured in Settings.',
  });

  const routes = new Map();
  const app = { get(path, ...handlers) { routes.set(`GET ${path}`, handlers); } };
  let routeError = null;
  registerPerformanceRoutes(app, {
    getPerformance: async () => {
      if (routeError) throw routeError;
      return { source: 'live_gsc' };
    },
  });
  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const route = routes.get('GET /api/performance').at(-1);
  const success = response();
  await route({}, success);
  assert.deepEqual(success.body, { source: 'live_gsc' });
  routeError = new Error('performance unavailable');
  const failed = response();
  await route({}, failed);
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.body, { success: false, error: 'performance unavailable' });
});

test('citation routes preserve scan, tracker, listing, and pitch contracts', async () => {
  assert.deepEqual(CITATION_STATUSES, ['todo', 'submitted', 'pitched', 'live']);
  assert.deepEqual(LISTING_TYPES, ['directory', 'review']);
  assert.deepEqual(normalizeCitationQueries([' one ', '', null, ...Array.from({ length: 10 }, (_, i) => `q${i}`)]), [
    'one', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6',
  ]);

  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  const requireAuth = () => {};
  let hasKey = false;
  let overBudget = false;
  let savedQueries = [' saved query '];
  let autoEnabled = true;
  let newDomains = ['new.example'];
  let scanError = null;
  let geminiResult = {};
  let geminiError = null;
  let nudges = 0;
  let saves = 0;
  const scans = [];
  const statuses = [];
  const prompts = [];
  const errors = [];
  const worklist = { success: true, targets: [{ domain: 'directory.example' }] };
  const kit = {
    name: 'Best Day Fitness',
    addressOneLine: '123 Main St',
    phone: '(727) 555-0100',
    website: 'https://example.com',
    categories: ['Personal Trainer', 'Senior Fitness'],
    shortDesc: 'Fitness for adults 50+.',
  };

  registerCitationRoutes(app, {
    requireAuth,
    hasGeminiKey: () => hasKey,
    usageOverBudget: () => overBudget,
    budgetBlock: res => res.status(429).json({ success: false, budgetReached: true }),
    getSavedQueries: () => savedQueries,
    performScan: async queries => {
      scans.push(queries);
      if (scanError) throw scanError;
    },
    worklist: () => worklist,
    enqueueScanCheck: () => { nudges += 1; },
    setAutoEnabled: enabled => { autoEnabled = enabled; saves += 1; return autoEnabled; },
    clearNewDomains: () => { newDomains = []; saves += 1; },
    updateStatus: (domain, status) => { statuses.push({ domain, status }); saves += 1; },
    listingKit: () => kit,
    geminiGenerate: async request => {
      prompts.push(request);
      if (geminiError) throw geminiError;
      return { text: JSON.stringify(geminiResult) };
    },
    model: 'gemini-test',
    parseGeminiJson: JSON.parse,
    brandPrompt: () => 'Best Day Fitness brand',
    logger: { error(...args) { errors.push(args); } },
  });

  function response() {
    return {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }
  const handler = (method, path) => routes.get(`${method} ${path}`).at(-1);
  for (const path of [
    '/api/citation-scan',
    '/api/citation-autopilot/toggle',
    '/api/citation-autopilot/seen',
    '/api/citation-status',
    '/api/citation-outreach',
  ]) {
    assert.equal(routes.get(`POST ${path}`)[0], requireAuth);
  }

  const cached = response();
  handler('GET', '/api/citation-worklist')({}, cached);
  assert.equal(nudges, 1);
  assert.deepEqual(cached.body, worklist);

  const unavailable = response();
  await handler('POST', '/api/citation-scan')({ body: {} }, unavailable);
  assert.equal(unavailable.body.unavailable, true);
  hasKey = true;
  overBudget = true;
  const blocked = response();
  await handler('POST', '/api/citation-scan')({ body: {} }, blocked);
  assert.equal(blocked.statusCode, 429);
  overBudget = false;
  savedQueries = [];
  const empty = response();
  await handler('POST', '/api/citation-scan')({ body: {} }, empty);
  assert.equal(empty.statusCode, 400);
  const scanned = response();
  await handler('POST', '/api/citation-scan')({ body: { queries: ['  senior fitness ', '', 'mobility'] } }, scanned);
  assert.deepEqual(scans.at(-1), ['senior fitness', 'mobility']);
  assert.deepEqual(scanned.body, worklist);
  scanError = new Error('search unavailable');
  const scanFailed = response();
  await handler('POST', '/api/citation-scan')({ body: { queries: ['fitness'] } }, scanFailed);
  assert.equal(scanFailed.statusCode, 502);
  assert.equal(scanFailed.body.error, 'Could not complete the scan: search unavailable');

  const toggled = response();
  handler('POST', '/api/citation-autopilot/toggle')({ body: { enabled: false } }, toggled);
  assert.deepEqual(toggled.body, { success: true, enabled: false });
  const seen = response();
  handler('POST', '/api/citation-autopilot/seen')({ body: {} }, seen);
  assert.deepEqual(newDomains, []);
  const invalidStatus = response();
  handler('POST', '/api/citation-status')({ body: { domain: 'example.com', status: 'unknown' } }, invalidStatus);
  assert.equal(invalidStatus.statusCode, 400);
  const updated = response();
  handler('POST', '/api/citation-status')({ body: { domain: 'example.com', status: 'pitched' } }, updated);
  assert.deepEqual(statuses, [{ domain: 'example.com', status: 'pitched' }]);
  assert.equal(saves, 3);

  const missingDomain = response();
  await handler('POST', '/api/citation-outreach')({ body: {} }, missingDomain);
  assert.equal(missingDomain.statusCode, 400);
  const competitor = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'competitor.example', type: 'competitor' } }, competitor);
  assert.equal(competitor.body.kind, 'skip');

  hasKey = false;
  const listingFallback = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'directory.example', type: 'directory' } }, listingFallback);
  assert.deepEqual(listingFallback.body.fields, {
    name: 'Best Day Fitness',
    address: '123 Main St',
    phone: '(727) 555-0100',
    website: 'https://example.com',
    categories: 'Personal Trainer · Senior Fitness',
    description: 'Fitness for adults 50+.',
  });
  assert.equal(listingFallback.body.claimUrl, 'https://directory.example');

  hasKey = true;
  geminiResult = { claimUrl: 'https://directory.example/claim', howTo: 'Complete the claim form.' };
  const listingGrounded = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'directory.example', type: 'review' } }, listingGrounded);
  assert.equal(listingGrounded.body.claimUrl, 'https://directory.example/claim');
  assert.equal(prompts.at(-1).model, 'gemini-test');

  hasKey = false;
  const pitchSetup = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'news.example', type: 'news' } }, pitchSetup);
  assert.equal(pitchSetup.body.unavailable, true);
  hasKey = true;
  geminiResult = {
    email: ' editor@news.example ',
    contactUrl: 'https://news.example/contact',
    to: 'Features editor',
    subject: 'Local fitness resource',
    body: 'A short pitch',
    howToFind: 'Use the contact page.',
  };
  const pitched = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'news.example', type: 'news', queries: ['senior fitness'] } }, pitched);
  assert.deepEqual(pitched.body, {
    success: true,
    kind: 'pitch',
    domain: 'news.example',
    email: 'editor@news.example',
    contactUrl: 'https://news.example/contact',
    to: 'Features editor',
    subject: 'Local fitness resource',
    body: 'A short pitch',
    howToFind: 'Use the contact page.',
  });
  geminiError = new Error('grounding failed');
  const pitchFailed = response();
  await handler('POST', '/api/citation-outreach')({ body: { domain: 'news.example', type: 'news' } }, pitchFailed);
  assert.equal(pitchFailed.statusCode, 502);
  assert.equal(pitchFailed.body.error, 'grounding failed');
  assert.deepEqual(errors, [
    ['[Citation Scan] failed:', 'search unavailable'],
    ['[Outreach pitch] failed:', 'grounding failed'],
  ]);
});

test('provider runtime retries transient failures and reports bounded integration health', async () => {
  let calls = 0;
  const runtime = createProviderRuntime({ sleep: async () => {} });
  runtime.setConfigured('gemini', true);
  const result = await runtime.run('gemini', async () => {
    calls += 1;
    if (calls === 1) throw new ProviderRuntimeError('temporary outage', { statusCode: 503, retryable: true });
    return { ok: true };
  }, { policy: { retries: 1, timeoutMs: 1000 } });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(runtime.snapshot().providers.gemini, {
    configured: true,
    status: 'healthy',
    inFlight: 0,
    totalCalls: 2,
    successes: 1,
    failures: 0,
    retries: 1,
    cacheHits: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
    lastAttemptAt: runtime.snapshot().providers.gemini.lastAttemptAt,
    lastSuccessAt: runtime.snapshot().providers.gemini.lastSuccessAt,
    lastFailureAt: null,
    lastLatencyMs: runtime.snapshot().providers.gemini.lastLatencyMs,
    lastError: null,
  });
});

test('provider runtime serves safe cached reads and opens a circuit after repeated failures', async () => {
  let clock = Date.parse('2026-08-31T12:00:00.000Z');
  let calls = 0;
  const runtime = createProviderRuntime({ now: () => clock, sleep: async ms => { clock += ms; } });
  runtime.setConfigured('search-console', true);
  const cachedCall = () => runtime.run('search-console', async () => ({ call: ++calls }), {
    cacheKey: 'queries:last-30-days', cacheTtlMs: 1000, staleIfErrorMs: 5000, policy: { timeoutMs: 1000 },
  });
  assert.deepEqual(await cachedCall(), { call: 1 });
  assert.deepEqual(await cachedCall(), { call: 1 });
  assert.equal(runtime.snapshot().providers['search-console'].cacheHits, 1);
  clock += 1001;
  const stale = await runtime.run('search-console', async () => { throw new ProviderRuntimeError('temporary read failure', { retryable: false }); }, {
    cacheKey: 'queries:last-30-days', cacheTtlMs: 1000, staleIfErrorMs: 5000, policy: { timeoutMs: 1000 },
  });
  assert.deepEqual(stale, { call: 1 });
  assert.equal(runtime.snapshot().providers['search-console'].status, 'degraded');

  const failing = createProviderRuntime({ now: () => clock, sleep: async () => {} });
  failing.setConfigured('openai', true);
  const operation = async () => { throw new ProviderRuntimeError('upstream down', { statusCode: 503, retryable: true }); };
  const policy = { retries: 0, timeoutMs: 1000, circuitFailures: 2, circuitCooldownMs: 2000 };
  await assert.rejects(failing.run('openai', operation, { policy }), /upstream down/);
  await assert.rejects(failing.run('openai', operation, { policy }), /upstream down/);
  await assert.rejects(failing.run('openai', operation, { policy }), error => error.code === 'PROVIDER_CIRCUIT_OPEN');
  assert.equal(failing.snapshot().providers.openai.status, 'unavailable');
});

test('provider runtime enforces the central spend guard before a provider call', async () => {
  let called = false;
  const runtime = createProviderRuntime({ guard: async provider => {
    throw new ProviderRuntimeError(`${provider} budget reached`, { code: 'PROVIDER_BUDGET_EXCEEDED', provider });
  } });
  await assert.rejects(runtime.run('gemini', async () => { called = true; }), error => error.code === 'PROVIDER_BUDGET_EXCEEDED');
  assert.equal(called, false);
});

test('contact attribution separates all new contacts from explicit organic and AI evidence', () => {
  const contacts = [
    { dateAdded: '2026-08-20T12:00:00Z', source: 'Google Organic Search' },
    { dateAdded: '2026-08-21T12:00:00Z', tags: ['ChatGPT referral'] },
    { dateAdded: '2026-08-22T12:00:00Z' },
    { dateAdded: '2026-07-20T12:00:00Z', source: 'Facebook' },
  ];
  const summary = summarizeContactAttribution(contacts, {
    currentStart: Date.parse('2026-08-01T00:00:00Z'),
    currentEnd: Date.parse('2026-08-31T23:59:59Z'),
    previousStart: Date.parse('2026-07-01T00:00:00Z'),
    previousEnd: Date.parse('2026-08-01T00:00:00Z'),
  });
  assert.equal(summary.currentTotal, 3);
  assert.equal(summary.previousTotal, 1);
  assert.equal(summary.explicitlySearchAttributed, 2);
  assert.equal(summary.unknownCurrent, 1);
  assert.equal(summary.confidence, 'medium');
  assert.equal(classifyContactSource({ source: 'Google Ads CPC' }).channel, 'paid_search');
});

test('article quality is deterministic and blocks only structural or brand-safety failures', () => {
  const body = `<div><h1>Guide</h1><p>${'direct answer '.repeat(30)}</p><h2>What matters?</h2><p>${'useful detail '.repeat(360)}</p><h2>How does it work?</h2><h2>Practical steps</h2><h2>Frequently Asked Questions</h2><ul><li>One</li></ul><table><tr><td>A</td></tr></table><a href="https://example.com">Book now</a></div>`;
  const quality = assessArticleQuality(body);
  assert.equal(quality.score, 100);
  assert.equal(quality.publishable, true);
  assert.equal(quality.status, 'excellent');

  const unsafe = assessArticleQuality('<p>Short copy</p>', { brandViolations: ['blocked phrase'] });
  assert.equal(unsafe.publishable, false);
  assert.ok(unsafe.blockingIssues.some(issue => /blocked brand/i.test(issue)));
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
  assert.equal(score.explainability.earnedWeightedPoints, 69.6);
  assert.equal(Math.round(score.pillars.reduce((sum, pillar) => sum + pillar.overallContribution, 0) * 100) / 100, 69.6);
  assert.equal(score.explainability.topOpportunity.key, 'primary');
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

test('JSON persistence notifies the state bridge only after an atomic write succeeds', () => {
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-write-observer-'));
  const target = join(root, 'state.json');
  const observed = [];
  try {
    setJsonWriteObserver((filePath, value) => observed.push({ filePath, value, exists: existsSync(filePath) }));
    writeJsonFileSync(target, { ready: true });
    assert.deepEqual(observed, [{ filePath: target, value: { ready: true }, exists: true }]);
  } finally {
    setJsonWriteObserver(null);
    rmSync(root, { recursive: true, force: true });
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
