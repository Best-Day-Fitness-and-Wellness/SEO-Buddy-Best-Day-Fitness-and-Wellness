import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { createJobDispatcher } = require('../lib/job-dispatcher');
const coreSource = readFileSync(new URL('../public/modules/core.js', import.meta.url), 'utf8');

function fakeTimers() {
  const handles = [];
  const add = (callback, delay, kind) => {
    const handle = { callback, delay, kind, cleared: false, unref() {} };
    handles.push(handle);
    return handle;
  };
  return {
    handles,
    setTimeout: (callback, delay) => add(callback, delay, 'timeout'),
    setInterval: (callback, delay) => add(callback, delay, 'interval'),
    setImmediate: callback => add(callback, 0, 'immediate'),
    clearTimeout: handle => { handle.cleared = true; },
    clearInterval: handle => { handle.cleared = true; },
  };
}

function browserCore() {
  const timers = fakeTimers();
  const scripts = [];
  const window = {};
  const document = {
    body: { dataset: { featureAsset: '/assets/feature.0123456789ab.js' } },
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({ remove() { scripts.splice(scripts.indexOf(this), 1); } }),
  };
  vm.runInNewContext(coreSource, { window, document, ...timers });
  return { core: window.SeoBuddyCore, document, scripts, timers };
}

test('feature loader coalesces concurrent requests and requires its public API', async () => {
  const { core, scripts, timers } = browserCore();
  let ready = false;
  const first = core.loadFeature('featureAsset', () => ready);
  assert.equal(core.loadFeature('featureAsset', () => ready), first);
  assert.equal(scripts.length, 1);
  ready = true;
  scripts[0].onload();
  await first;
  await core.loadFeature('featureAsset', () => ready);
  assert.equal(scripts.length, 1);
  assert.equal(timers.handles[0].cleared, true);
});

test('feature loader removes failed scripts and allows network or initialization retries', async () => {
  const { core, scripts } = browserCore();
  const networkFailure = core.loadFeature('featureAsset', () => false);
  scripts[0].onerror();
  await assert.rejects(networkFailure, /Could not load/);
  assert.equal(scripts.length, 0);
  const missingExport = core.loadFeature('featureAsset', () => false);
  scripts[0].onload();
  await assert.rejects(missingExport, /did not initialize/);
  assert.equal(scripts.length, 0);
  let ready = false;
  const retry = core.loadFeature('featureAsset', () => ready);
  ready = true;
  scripts[0].onload();
  await retry;
});

test('feature loader rejects unsafe paths and recovers from a stalled request', async () => {
  const { core, document, scripts, timers } = browserCore();
  for (const value of ['https://example.com/script.js', '//example.com/a.js', '/assets/../app.js', '/assets/unversioned.js']) {
    document.body.dataset.featureAsset = value;
    await assert.rejects(core.loadFeature('featureAsset', () => false), /asset is unavailable/);
  }
  assert.equal(scripts.length, 0);
  document.body.dataset.featureAsset = '/assets/feature.0123456789ab.js';
  const stalled = core.loadFeature('featureAsset', () => false);
  assert.equal(timers.handles[0].delay, 20000);
  timers.handles[0].callback();
  await assert.rejects(stalled, /too long/);
  assert.equal(scripts.length, 0);
});

test('shared relative time preserves missing, future, minute, hour, and day labels', () => {
  const { core } = browserCore();
  const ago = milliseconds => new Date(Date.now() - milliseconds).toISOString();
  assert.equal(core.relativeTime('not a date'), '');
  assert.equal(core.relativeTime(ago(-1000)), 'just now');
  assert.equal(core.relativeTime(ago(120000)), '2 min ago');
  assert.equal(core.relativeTime(ago(7200000)), '2h ago');
  assert.equal(core.relativeTime(ago(172800000)), '2d ago');
});

function dispatcher(overrides = {}) {
  const timers = fakeTimers();
  const calls = [];
  const logger = { info() {}, error() {} };
  const worker = { status: () => ({ running: true }), drain() {} };
  const queue = { async enqueue(type, payload, options) { calls.push({ type, payload, options }); return { created: true, job: { id: '1', type } }; } };
  const api = createJobDispatcher({ queue, worker, logger, timers, now: () => Date.parse('2026-09-02T12:00:00Z'), ...overrides });
  return { api, timers, calls };
}

test('job dispatcher preserves queue payload, idempotency, and wakeup contracts', async () => {
  const { api, timers, calls } = dispatcher();
  const options = { idempotencyKey: 'test:key', maxAttempts: 5 };
  assert.equal(api.key('test', 1000, 2500), 'test:2');
  const result = await api.enqueue('test', { topic: 'example' }, options);
  assert.equal(result.created, true);
  assert.deepEqual(calls[0], { type: 'test', payload: { topic: 'example' }, options });
  assert.equal(timers.handles.filter(handle => handle.kind === 'immediate').length, 1);
});

test('job dispatcher preserves recurring and UTC daily schedules and stops them on shutdown', async () => {
  const { api, timers, calls } = dispatcher();
  api.scheduleCheck('local.autopilot', 30000, 43200000);
  api.scheduleDaily('health.snapshot', 60000, 5);
  api.scheduleDaily('storage.backup', 120000);
  assert.deepEqual(timers.handles.map(handle => handle.delay), [30000, 43200000, 60000, 43500000, 120000, 86400000]);
  await timers.handles[2].callback();
  assert.equal(calls[0].options.idempotencyKey, 'health.snapshot:2026-09-02');
  assert.equal(calls[0].options.maxAttempts, 5);
  api.stop();
  assert.equal((await api.enqueue('test', {}, {})).created, false);
  assert.ok(timers.handles.filter(handle => handle.kind === 'interval').every(handle => handle.cleared));
});

test('queue failures and duplicate jobs do not wake the worker', async () => {
  const failed = dispatcher({ queue: { enqueue: async () => { throw new Error('offline'); } } });
  assert.equal((await failed.api.enqueue('test')).error, 'offline');
  assert.equal(failed.timers.handles.length, 0);
  const duplicate = dispatcher({ queue: { enqueue: async () => ({ created: false, job: { id: 'existing' } }) } });
  assert.equal((await duplicate.api.enqueue('test')).created, false);
  assert.equal(duplicate.timers.handles.length, 0);
});

test('query parser handles attacker-controlled constructor fields without throwing', () => {
  const qs = require('qs');
  assert.doesNotThrow(() => qs.stringify(qs.parse('x[constructor][isBuffer]=y', { plainObjects: true })));
  assert.equal(qs.stringify({ topic: 'fitness', page: 2 }), 'topic=fitness&page=2');
});

test('offline recovery CLI preserves a safety snapshot and rejects corrupt backups before writing', () => {
  const { createFileStateRepository } = require('../lib/state-repository');
  const { createBackupService } = require('../lib/backup-service');
  const root = mkdtempSync(join(tmpdir(), 'seo-buddy-recovery-'));
  const repository = createFileStateRepository({ storageRoot: root, tenantId: 'recovery-test' });
  const backups = createBackupService({ repository, backupRoot: join(root, 'backups') });
  const run = args => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/restore-backup.mjs', import.meta.url)), ...args], {
    env: { ...process.env, DATA_DIR: root, TENANT_ID: 'recovery-test', STATE_BACKEND: 'filesystem', DATABASE_URL: '' },
    encoding: 'utf8', windowsHide: true,
  });
  try {
    repository.writeJson('history.json', [{ title: 'Before incident' }]);
    const backup = backups.create();
    repository.writeJson('history.json', [{ title: 'Later state' }]);
    assert.notEqual(run(['--backup', backup.id]).status, 0);
    assert.equal(repository.readJson('history.json')[0].title, 'Later state');
    const restored = run(['--backup', backup.id, '--confirm', `RESTORE ${backup.id}`]);
    assert.equal(restored.status, 0, restored.stderr);
    const result = JSON.parse(restored.stdout);
    assert.equal(repository.readJson('history.json')[0].title, 'Before incident');
    assert.equal(backups.verify(result.safetyBackupId).valid, true);
    const safety = JSON.parse(readFileSync(join(backups.backupRoot, result.safetyBackupId, 'history.json'), 'utf8'));
    assert.equal(safety[0].title, 'Later state');
    writeFileSync(join(backups.backupRoot, backup.id, 'history.json'), 'corrupt test fixture');
    assert.notEqual(run(['--backup', backup.id, '--confirm', `RESTORE ${backup.id}`]).status, 0);
    assert.equal(repository.readJson('history.json')[0].title, 'Before incident');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
