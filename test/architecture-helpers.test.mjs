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
