import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createPerformanceService } = require('../lib/performance-routes');
const { createPerformanceHistory } = require('../lib/performance-history');
const { createPerformanceHistoryRepository } = require('../lib/performance-history-repository');
const { createFileStateRepository } = require('../lib/state-repository');
const { setJsonWriteObserver } = require('../lib/json-file-store');

const AT = Date.parse('2026-09-03T23:30:00.000Z');
const rows = [{ keys: ['best day fitness'], impressions: 100, clicks: 8, position: 4.25 }];
const daily = (date, clicks = 8) => ({ date, impressions: 100, clicks, avgPosition: 4.3, leaks: 0, brandedImpressions: 100, recommendedRate: 50 });

function fixture(options = {}) {
  let clock = AT;
  let queries = 0;
  const writes = [], requests = [], errors = [];
  const history = createPerformanceHistory({
    initialSnapshots: options.initialSnapshots ?? [],
    saveSnapshots: next => {
      writes.push(structuredClone(next));
      if (options.throwSave) throw new Error('test-only save failure');
      return options.saveResult ?? true;
    },
  });
  const service = createPerformanceService({
    allowMockIntegrations: false,
    getGoogleAuth: () => options.noGoogle ? null : {},
    getSiteUrl: () => 'sc-domain:bestdayfitness.com',
    createWebmasters: auth => ({ auth }),
    searchConsoleQuery: async (_client, request) => {
      requests.push(request);
      queries++;
      if (queries === options.failQuery) throw new Error('test-only upstream failure');
      await options.waitForQuery?.();
      return { data: { rows: options.rows || rows } };
    },
    getSnapshots: () => history.snapshots,
    recordSnapshot: history.record,
    getAioAudits: () => [
      { timestamp: '2026-09-02T10:00:00Z', recommended: true },
      { timestamp: '2026-09-02T11:00:00Z', recommended: false },
    ],
    getGhlConfig: () => ({}),
    providerFetch: () => { assert.fail('No contact connection configured'); },
    now: () => clock,
    logger: { error: (...args) => errors.push(args) },
  });
  return { service, writes, requests, errors, get snapshots() { return history.snapshots; }, setTime: value => { clock = value; } };
}

test('performance without Search Console preserves saved history without writing or inventing data', async () => {
  const initial = [daily('2026-09-02')];
  const f = fixture({ initialSnapshots: initial, noGoogle: true });
  const result = await f.service.computePerformanceSnapshot();
  assert.equal(result.source, 'unavailable');
  assert.equal(result.current, null);
  assert.equal(result.previous, null);
  assert.strictEqual(result.snapshots, initial);
  assert.equal(f.writes.length, 0);
  assert.equal(f.requests.length, 0);
});

test('performance refresh keeps the UTC dates, source fields, rounding and same-day no-op writes', async () => {
  const f = fixture();
  const first = await f.service.computePerformanceSnapshot();
  assert.equal(first.source, 'live_gsc');
  assert.deepEqual(first.current, { impressions: 100, clicks: 8, avgPosition: 4.3, ctr: 8 });
  assert.deepEqual(f.snapshots, [daily('2026-09-03')]);
  assert.deepEqual(f.requests.map(request => request.requestBody), [
    { startDate: '2026-08-04', endDate: '2026-08-31', dimensions: ['query'], rowLimit: 250 },
    { startDate: '2026-07-07', endDate: '2026-08-03', dimensions: ['query'], rowLimit: 250 },
  ]);
  const second = await f.service.computePerformanceSnapshot();
  assert.strictEqual(first.snapshots, second.snapshots);
  assert.equal(f.writes.length, 1);
  assert.equal(f.requests.length, 4);
});

test('changed performance replaces only the matching day and does not mutate prior responses', async () => {
  const initial = [daily('2026-09-02'), daily('2026-09-03', 3), daily('2026-09-01')];
  const before = structuredClone(initial);
  const f = fixture({ initialSnapshots: initial });
  const result = await f.service.computePerformanceSnapshot();
  assert.deepEqual(initial, before);
  assert.deepEqual(result.snapshots, [daily('2026-09-02'), daily('2026-09-03'), daily('2026-09-01')]);
  assert.notStrictEqual(result.snapshots, initial);
  assert.equal(f.writes.length, 1);
});

test('daily performance retention remains 180 rows and rolls over at UTC midnight', async () => {
  const initial = Array.from({ length: 180 }, (_, index) => daily(new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)));
  const f = fixture({ initialSnapshots: initial });
  await f.service.computePerformanceSnapshot();
  assert.equal(f.snapshots.length, 180);
  assert.deepEqual(f.snapshots.slice(0, -1), initial.slice(1));
  f.setTime(Date.parse('2026-09-04T00:00:00.000Z'));
  await f.service.computePerformanceSnapshot();
  assert.equal(f.snapshots.length, 180);
  assert.deepEqual(f.snapshots.at(-1), daily('2026-09-04'));
  assert.equal(f.writes.length, 2);
  assert.equal(initial.length, 180);
});

test('concurrent cached performance reads share provider work and one history write', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ waitForQuery: () => gate });
  const reads = Array.from({ length: 20 }, () => f.service.getPerformance());
  await Promise.resolve();
  assert.equal(f.requests.length, 1);
  release();
  const results = await Promise.all(reads);
  assert.ok(results.every(result => result === results[0]));
  assert.equal(f.requests.length, 2);
  assert.equal(f.writes.length, 1);
  assert.strictEqual(await f.service.getPerformance(), results[0]);
  assert.equal(f.requests.length, 2);
});

for (const failQuery of [1, 2]) {
  test(`GSC failure in period ${failQuery} does not save a partial daily snapshot`, async () => {
    const initial = [daily('2026-09-02')];
    const f = fixture({ initialSnapshots: initial, failQuery });
    const result = await f.service.computePerformanceSnapshot();
    assert.equal(result.source, 'unavailable');
    assert.equal(result.current, null);
    assert.equal(result.previous, null);
    assert.strictEqual(result.snapshots, initial);
    assert.equal(f.writes.length, 0);
    assert.equal(f.errors.length, 1);
    assert.deepEqual(result.aioTrend, [{ date: '2026-09-02', rate: 50, n: 2 }]);
  });
}

test('best-effort performance persistence failure keeps the current in-process update', async () => {
  const f = fixture({ saveResult: false });
  const first = await f.service.computePerformanceSnapshot();
  assert.deepEqual(first.snapshots, [daily('2026-09-03')]);
  await f.service.computePerformanceSnapshot();
  assert.equal(f.writes.length, 1, 'Unchanged refresh must retain existing no-retry behavior');
});

test('unexpected save exceptions keep the established error and response ordering', async () => {
  const initial = [daily('2026-09-02')];
  const f = fixture({ initialSnapshots: initial, throwSave: true });
  const result = await f.service.computePerformanceSnapshot();
  assert.equal(result.source, 'live_gsc');
  assert.strictEqual(result.snapshots, initial);
  assert.deepEqual(f.snapshots, [...initial, daily('2026-09-03')]);
  assert.equal(f.errors.length, 1);
  const retry = await f.service.computePerformanceSnapshot();
  assert.strictEqual(retry.snapshots, f.snapshots);
  assert.equal(f.writes.length, 1);
});

function files(t) {
  const storageRoot = mkdtempSync(join(tmpdir(), 'seo-performance-history-'));
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  return { storageRoot, repository: createFileStateRepository({ storageRoot, tenantId: 'test-tenant' }) };
}

test('performance repository reads never create, repair, reorder, or truncate history', t => {
  const { repository } = files(t);
  const adapter = createPerformanceHistoryRepository(repository);
  const file = repository.pathFor('performance.json');
  assert.deepEqual(adapter.load(), []);
  assert.equal(existsSync(file), false);
  const original = JSON.stringify([daily('2026-09-03'), daily('2026-09-01'), { custom: 'preserved' }]);
  writeFileSync(file, original);
  assert.deepEqual(adapter.load(), JSON.parse(original));
  assert.equal(readFileSync(file, 'utf8'), original);
  writeFileSync(file, '{broken');
  assert.deepEqual(adapter.load(), []);
  assert.equal(readFileSync(file, 'utf8'), '{broken');
  writeFileSync(file, 'null');
  assert.equal(adapter.load(), null, 'Keep existing JSON parser semantics during extraction');
});

test('performance repository keeps unreadable files untouched', () => {
  const adapter = createPerformanceHistoryRepository({
    readJson() { throw new Error('test-only read failure'); },
    writeJson() { assert.fail('A read must not initialize or repair storage'); },
  });
  assert.deepEqual(adapter.load(), []);
});

test('performance writes retain tenant isolation, atomic outbox notifications, and restart no-ops', t => {
  const { storageRoot, repository } = files(t);
  const adapter = createPerformanceHistoryRepository(repository);
  const observed = [];
  setJsonWriteObserver((file, value) => observed.push({ file, value: structuredClone(value) }));
  try {
    const history = createPerformanceHistory({ initialSnapshots: adapter.load(), saveSnapshots: adapter.save });
    history.record(daily('2026-09-03'));
    assert.deepEqual(observed, [{ file: repository.pathFor('performance.json'), value: [daily('2026-09-03')] }]);
    const restarted = createPerformanceHistory({ initialSnapshots: adapter.load(), saveSnapshots: adapter.save });
    assert.deepEqual(restarted.snapshots, history.snapshots);
    restarted.record(daily('2026-09-03'));
    assert.equal(observed.length, 1);
    restarted.record(daily('2026-09-04'));
    assert.deepEqual(adapter.load(), [daily('2026-09-03'), daily('2026-09-04')]);
    const other = createFileStateRepository({ storageRoot, tenantId: 'other-tenant' });
    assert.deepEqual(createPerformanceHistoryRepository(other).load(), []);
    assert.equal(existsSync(other.pathFor('performance.json')), false);
  } finally { setJsonWriteObserver(null); }
});

test('performance adapter write errors remain best-effort and do not notify the outbox', t => {
  const { storageRoot } = files(t);
  const adapter = createPerformanceHistoryRepository({ pathFor: () => join(storageRoot, 'absent-directory', 'performance.json') });
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  setJsonWriteObserver(() => assert.fail('A failed write must not be mirrored'));
  try {
    assert.equal(adapter.save([daily('2026-09-03')]), false);
    assert.match(errors[0][0], /Performance/);
  } finally { setJsonWriteObserver(null); }
});

test('performance history validates through the existing upsert without rewriting invalid collections', () => {
  const bad = { old: 'shape' };
  let saves = 0;
  const history = createPerformanceHistory({ initialSnapshots: bad, saveSnapshots: () => { saves++; } });
  assert.strictEqual(history.snapshots, bad);
  assert.throws(() => history.record(daily('2026-09-03')), /must be an array/);
  assert.strictEqual(history.snapshots, bad);
  assert.equal(saves, 0);
});
