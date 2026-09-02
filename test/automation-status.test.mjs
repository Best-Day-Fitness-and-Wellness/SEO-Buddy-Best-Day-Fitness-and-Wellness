import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildAutomationStatus, registerAutomationStatusRoute } = require('../lib/automation-status');
const now = Date.parse('2026-09-02T12:00:00Z');
const before = '2026-09-01T12:00:00Z';
const after = '2026-09-03T12:00:00Z';
const feature = { key: 'content', title: 'Content', tab: 'publish-tab', jobType: 'content.autopilot', configured: true, enabled: true };
const status = (overrides = {}, recent = [], worker = true) => buildAutomationStatus([{ ...feature, ...overrides }], { recent }, worker, now)[0];

test('automation distinguishes configuration, schedule, active work, review, history and pause', () => {
  assert.equal(status({ configured: false }).status, 'needs-setup');
  assert.equal(status().status, 'scheduled');
  assert.equal(status({ running: true }).status, 'running');
  assert.equal(status({ needsApproval: true }).status, 'needs-approval');
  assert.equal(status({ enabled: false, lastRun: before }).status, 'completed');
  assert.match(status({ enabled: false, lastRun: before }).reason, /paused/);
  assert.equal(status({ enabled: false }).status, 'paused');
  assert.equal(status({}, [], false).status, 'unknown');
  assert.equal(status({ failed: true }).status, 'failed');
});

test('automation requires a live lease for queue evidence of running work', () => {
  const job = { type: feature.jobType, status: 'running', updatedAt: before, leaseUntil: after };
  assert.equal(status({}, [job]).status, 'running');
  assert.equal(status({}, [{ ...job, leaseUntil: before }]).status, 'scheduled');
  assert.equal(status({}, [{ ...job, type: 'other.job' }]).status, 'scheduled');
});

test('a skipped successful check does not conceal a failure; later recorded work does', () => {
  const jobs = [
    { type: feature.jobType, status: 'failed', updatedAt: before, lastError: 'private details' },
    { type: feature.jobType, status: 'succeeded', updatedAt: after, result: { skipped: true } },
  ];
  assert.equal(status({}, jobs).status, 'failed');
  assert.equal(status({ lastRun: after }, jobs).status, 'scheduled');
  assert.doesNotMatch(JSON.stringify(status({}, jobs)), /private details|skipped|lastError|result/);
});

test('automation exposes explicit versus estimated schedules without inventing a next run', () => {
  assert.equal(status().nextRunAt, null);
  assert.equal(status({ lastRun: 'invalid' }).lastRecordedAt, null);
  assert.equal(status({ nextRun: after }).nextRunAt, after.replace('Z', '.000Z'));
  assert.equal(status({ nextRun: after }).nextRunEstimated, false);
  const estimated = status({ lastRun: before, intervalMs: 86400000 });
  assert.equal(Date.parse(estimated.nextRunAt), now);
  assert.equal(estimated.nextRunEstimated, true);
  assert.equal(status({ enabled: false, nextRun: after }).nextRunAt, null);
});

test('automation route is read-only and returns a bounded failure instead of an empty all-clear', async () => {
  let handler, snapshots = 0;
  const app = { get(path, cb) { assert.equal(path, '/api/automation-status'); handler = cb; } };
  const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  registerAutomationStatusRoute(app, { getFeatures: () => [feature], queue: { async snapshot(limit) { snapshots++; assert.equal(limit, 100); return { recent: [] }; } }, worker: { status: () => ({ running: true }) } });
  await handler({}, res);
  assert.equal(snapshots, 1);
  assert.equal(res.body.success, true);
  assert.equal(res.body.features[0].status, 'scheduled');
  registerAutomationStatusRoute(app, { getFeatures: () => [feature], queue: { async snapshot() { throw new Error('private database configuration'); } }, worker: {} });
  await handler({}, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.success, false);
  assert.doesNotMatch(JSON.stringify(res.body), /private database/);
});
