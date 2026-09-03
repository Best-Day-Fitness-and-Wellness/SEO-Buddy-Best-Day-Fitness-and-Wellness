import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createScoreHistory } = require('../lib/score-history');
const { createScoreHistoryRepository } = require('../lib/score-history-repository');
const { createPublicationHistoryRepository } = require('../lib/publication-history-repository');
const { scorePillars } = require('../lib/health-score');
const { createFileStateRepository } = require('../lib/state-repository');
const { setJsonWriteObserver } = require('../lib/json-file-store');

const AT = '2026-09-03T12:00:00.000Z';
const runtime = () => ({ mode: 'test', mockIntegrationsAllowed: false });
const score = (value = 78) => scorePillars([{ key: 'found', label: 'Found', weight: 100, measured: true, score: value }], AT);
const row = (date, overall, version = 2) => ({ date, version, overall, liveOverall: overall, rawOverall: overall });

function timeline(options = {}) {
  const saves = [];
  let calls = 0;
  const api = createScoreHistory({
    initialSnapshots: [], computeScore: async () => { calls++; return score(); },
    saveSnapshots: rows => saves.push(structuredClone(rows)), getRuntime: runtime,
    now: () => AT, ...options,
  });
  return { api, saves, get calls() { return calls; } };
}

test('score response preserves smoothing, raw score, evidence, and read-only preview', async () => {
  const initial = [row('2026-09-01', 68), row('2026-09-02', 70)];
  const { api, saves } = timeline({ initialSnapshots: initial });
  const response = await api.buildResponse();
  assert.equal(response.scoreVersion, 2);
  assert.equal(response.overall, 72);
  assert.equal(response.liveOverall, 78);
  assert.equal(response.rawOverall, 78);
  assert.deepEqual(response.smoothing, { overall: 72, rawOverall: 72, samples: 3, windowDays: 7, method: 'daily-average' });
  assert.deepEqual(response.runtime, runtime());
  assert.deepEqual(response.pillars, score().pillars);
  assert.deepEqual(response.confidence, score().confidence);
  assert.deepEqual(response.freshness, score().freshness);
  assert.deepEqual(response.explainability, score().explainability);
  assert.equal(response.history.at(-1).overall, 72);
  assert.equal(response.history.at(-1).liveOverall, 78);
  assert.equal(response.history.at(-1).recordedAt, AT);
  assert.equal(response.delta, null);
  await api.buildResponse();
  assert.strictEqual(api.snapshots, initial);
  assert.equal(initial.length, 2);
  assert.equal(saves.length, 0);
});

test('score preview uses the existing version-safe 28-day delta', async () => {
  const initial = [row('2026-08-01', 90, 1), row('2026-08-06', 50), row('2026-09-02', 70)];
  const { api } = timeline({ initialSnapshots: initial });
  const response = await api.buildResponse();
  assert.equal(response.overall, 66);
  assert.equal(response.delta, 16);
  assert.equal(response.smoothing.samples, 3);
  assert.equal(initial[0].version, 1);
});

test('daily score recording saves once and reuses an existing same-version day', async () => {
  const testCase = timeline();
  const recorded = await testCase.api.recordDaily();
  const duplicate = await testCase.api.recordDaily('2026-09-03T22:00:00.000Z');
  assert.strictEqual(duplicate, recorded);
  assert.equal(testCase.calls, 1);
  assert.equal(testCase.saves.length, 1);
  assert.equal(testCase.api.snapshots.length, 1);
  assert.deepEqual(testCase.saves[0][0], recorded);
});

test('daily recorder coalesces overlapping calls and releases the guard afterward', async () => {
  let finish, calls = 0;
  const { api, saves } = timeline({ computeScore: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = api.recordDaily();
  const concurrent = api.recordDaily('2026-09-04T00:00:00.000Z');
  assert.equal(calls, 1);
  finish(score());
  const [left, right] = await Promise.all([first, concurrent]);
  assert.strictEqual(left, right);
  assert.equal(left.date, '2026-09-03');
  const next = api.recordDaily('2026-09-04T00:00:00.000Z');
  assert.equal(calls, 2);
  finish(score(80));
  await next;
  assert.equal(saves.length, 2);
});

test('failed score computation propagates without writes and permits a later retry', async () => {
  let fail = true;
  const { api, saves } = timeline({ computeScore: async () => { if (fail) throw new Error('test-only unavailable'); return score(); } });
  await assert.rejects(api.recordDaily(), /test-only unavailable/);
  await assert.rejects(api.buildResponse(), /test-only unavailable/);
  assert.equal(saves.length, 0);
  assert.equal(api.snapshots.length, 0);
  fail = false;
  assert.equal((await api.recordDaily()).overall, 78);
  assert.equal(saves.length, 1);
});

test('unmeasured scores neither manufacture a number nor record an empty daily sample', async () => {
  const initial = [row('2026-09-02', 70)];
  const { api, saves } = timeline({ initialSnapshots: initial, computeScore: async () => scorePillars([], AT) });
  assert.equal(await api.recordDaily(), null);
  const response = await api.buildResponse();
  assert.equal(response.overall, null);
  assert.equal(response.delta, null);
  assert.equal(response.smoothing.samples, 0);
  assert.deepEqual(response.history, initial);
  assert.equal(saves.length, 0);
});

test('same-day legacy samples are replaced only on recording, not on reading', async () => {
  const initial = [row('2026-09-03', 99, 1)];
  const { api, saves } = timeline({ initialSnapshots: initial });
  assert.equal((await api.buildResponse()).history[0].version, 2);
  assert.strictEqual(api.snapshots, initial);
  await api.recordDaily();
  assert.equal(api.snapshots.length, 1);
  assert.equal(api.snapshots[0].version, 2);
  assert.equal(saves.length, 1);
});

test('score retention stays at 180 persisted days and 60 response rows', async () => {
  const initial = Array.from({ length: 180 }, (_, index) => row(new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), 50));
  const { api, saves } = timeline({ initialSnapshots: initial });
  assert.equal((await api.buildResponse()).history.length, 60);
  assert.equal(saves.length, 0);
  await api.recordDaily();
  assert.equal(api.snapshots.length, 180);
  assert.equal(api.snapshots[0].date, '2026-01-02');
  assert.equal(api.snapshots.at(-1).date, '2026-09-03');
  assert.equal(saves[0].length, 180);
});

test('best-effort save refusal retains the historical in-memory recording behavior', async () => {
  const { api } = timeline({ saveSnapshots: () => false });
  const recorded = await api.recordDaily();
  assert.strictEqual(api.snapshots[0], recorded);
  assert.strictEqual(await api.recordDaily(), recorded);
});

function files(t, tenantId = 'history-test') {
  const storageRoot = mkdtempSync(join(tmpdir(), 'seo-history-'));
  t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
  return { repository: createFileStateRepository({ storageRoot, tenantId }), storageRoot };
}

test('score repository does not create a missing file and migrates legacy rows only in memory', t => {
  const { repository } = files(t);
  const scores = createScoreHistoryRepository(repository);
  assert.deepEqual(scores.load(), []);
  assert.equal(existsSync(repository.pathFor('health-score.json')), false);
  const original = JSON.stringify([row('2026-09-02', 70), { date: '2026-08-01', overall: 65 }, { bad: true }]);
  writeFileSync(repository.pathFor('health-score.json'), original);
  assert.deepEqual(scores.load(), [{ date: '2026-08-01', overall: 65, version: 1 }, row('2026-09-02', 70)]);
  assert.equal(readFileSync(repository.pathFor('health-score.json'), 'utf8'), original);
});

test('score and publication repositories preserve corrupt files while supplying fallback state', t => {
  const { repository } = files(t);
  for (const [key, create] of [['health-score.json', createScoreHistoryRepository], ['history.json', createPublicationHistoryRepository]]) {
    writeFileSync(repository.pathFor(key), '{test-only invalid JSON');
    assert.deepEqual(create(repository).load(), []);
    assert.equal(readFileSync(repository.pathFor(key), 'utf8'), '{test-only invalid JSON');
  }
});

test('publication repository preserves existing rows, ordering, URL repairs, and indexing flags across restart', t => {
  const { repository } = files(t);
  const publications = createPublicationHistoryRepository(repository);
  const rows = [{ title: 'A', url: 'https://example.test/post/a', indexed: 'Indexing Requested', needsReindex: true }, { title: 'B', url: 'https://example.test/post/b', customField: 12 }];
  repository.writeJson('history.json', rows);
  assert.deepEqual(publications.load(), rows);
  const loaded = publications.load();
  loaded.unshift({ title: 'C', url: 'https://example.test/post/c', platform: 'GoHighLevel (draft)' });
  loaded[1].needsReindex = false;
  assert.equal(publications.save(loaded), true);
  assert.deepEqual(createPublicationHistoryRepository(repository).load(), loaded);
});

test('legacy publication seed is created only for a missing file, with unchanged fields', t => {
  const { repository } = files(t);
  const publications = createPublicationHistoryRepository(repository);
  const initial = publications.load();
  assert.deepEqual(initial, [{ title: 'The Ultimate Guide to Senior Mobility Training', keyword: 'mobility training st pete', platform: 'GoHighLevel (Draft)', date: '2026-07-16', indexed: 'Indexing Requested', url: 'https://bestdayfitness.com/post/mobility-training-st-pete' }]);
  assert.deepEqual(publications.load(), initial);
  publications.save([]);
  assert.deepEqual(publications.load(), []);
  // Preserve the old parser contract; shape validation is not part of this refactor.
  publications.save(null);
  assert.equal(publications.load(), null);
});

test('publication initialization write failures still fail, while unreadable existing state falls back', () => {
  const unwritable = createPublicationHistoryRepository({ readJson: (key, fallback) => fallback, writeJson() { throw new Error('test-only unwritable'); } });
  assert.throws(() => unwritable.load(), /test-only unwritable/);
  const unreadable = createPublicationHistoryRepository({ readJson() { throw new Error('test-only unreadable'); }, writeJson() { assert.fail('Must not replace unreadable history'); } });
  assert.deepEqual(unreadable.load(), []);
});

test('score and publication writes retain tenant isolation and reach the durable-state observer', async t => {
  const { repository, storageRoot } = files(t);
  const observed = [];
  setJsonWriteObserver((file, value) => observed.push({ file, value: structuredClone(value) }));
  try {
    const scores = createScoreHistoryRepository(repository);
    const { api } = timeline({ initialSnapshots: scores.load(), saveSnapshots: scores.save });
    await api.recordDaily();
    createPublicationHistoryRepository(repository).save([{ title: 'Test-only record' }]);
    assert.deepEqual(observed.map(item => item.file), [repository.pathFor('health-score.json'), repository.pathFor('history.json')]);
    const reloaded = timeline({ initialSnapshots: scores.load(), saveSnapshots: scores.save });
    // Compare the HTTP/JSON contract: undefined optional fields are omitted on disk.
    assert.equal(JSON.stringify(await reloaded.api.buildResponse()), JSON.stringify(await api.buildResponse()));
    await reloaded.api.recordDaily();
    assert.equal(observed.length, 2, 'Restart must not duplicate the current daily record');
    const other = createFileStateRepository({ storageRoot, tenantId: 'other-tenant' });
    assert.deepEqual(createScoreHistoryRepository(other).load(), []);
    assert.equal(existsSync(other.pathFor('history.json')), false);
  } finally { setJsonWriteObserver(null); }
});
