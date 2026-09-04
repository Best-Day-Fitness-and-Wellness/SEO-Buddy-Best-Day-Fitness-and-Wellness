import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createContentScheduler } = require('../lib/content-scheduler');
const { registerAutopilotRoutes } = require('../lib/autopilot-routes');
function harness(saved = {}) {
  let clock = Date.parse('2026-09-04T13:00:00Z'), pending, snapshot, failSave = false, failQueue = false;
  const state = { enabled: true, intervalHours: 24, ...saved }, calls = [];
  const scheduler = createContentScheduler({ state, now: () => clock,
    save: () => { if (failSave) return false; snapshot = structuredClone(state); return true; },
    enqueue: async (...args) => { calls.push(args); return failQueue ? { error: 'offline' } : { created: calls.length === 1, job: { id: 'same-job' } }; },
    timers: { setTimeout: (fn, delay) => { pending = { fn, delay }; return pending; }, clearTimeout: () => { pending = null; } },
    logger: { error() {} },
  });
  return { state, calls, scheduler, snapshot: () => snapshot, pending: () => pending, advance: ms => { clock += ms; }, tick: () => pending.fn(), failSave: v => { failSave = v; }, failQueue: v => { failQueue = v; } };
}
test('content deadline survives restart and migrates from last successful run', () => {
  const h = harness({ lastRun: '2026-09-04T09:00:00Z' }); h.scheduler.start();
  assert.equal(h.state.nextRunTime, '2026-09-05T09:00:00.000Z');
  const restored = harness(h.snapshot()); restored.advance(3600000); restored.scheduler.start();
  assert.equal(restored.state.nextRunTime, h.state.nextRunTime); assert.equal(restored.calls.length, 0);
});
test('overdue content schedules one catch-up and keeps the original cadence', async () => {
  const h = harness({ nextRunTime: '2026-09-01T09:00:00Z' }); h.scheduler.start(); await h.tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][2].idempotencyKey, 'content.autopilot:scheduled:2026-09-01T09:00:00.000Z');
  assert.equal(h.state.nextRunTime, '2026-09-05T09:00:00.000Z');
});
test('failed queue/save retains the deadline and retries the same durable job key', async () => {
  const h = harness({ nextRunTime: '2026-09-04T12:00:00Z' }); h.scheduler.start();
  h.failQueue(true); await h.tick(); assert.equal(h.state.nextRunTime, '2026-09-04T12:00:00Z'); assert.equal(h.pending().delay, 60000);
  h.failQueue(false); h.failSave(true); await h.tick(); assert.equal(h.state.nextRunTime, '2026-09-04T12:00:00Z');
  h.failSave(false); await h.tick(); assert.equal(new Set(h.calls.map(call => call[2].idempotencyKey)).size, 1);
  assert.equal(h.state.nextRunTime, '2026-09-05T12:00:00.000Z');
});
test('pause cancels pending work; deliberate cadence change resets the deadline', () => {
  const h = harness(); h.scheduler.start(); const old = h.pending().fn;
  h.state.enabled = false; h.scheduler.start(); assert.equal(h.pending(), null); old(); assert.equal(h.calls.length, 0);
  h.state.enabled = true; h.state.intervalHours = 48; h.scheduler.start({ reset: true });
  assert.equal(h.state.nextRunTime, '2026-09-06T13:00:00.000Z'); h.scheduler.stop(); assert.equal(h.pending(), null);
  h.state.intervalHours = NaN; assert.throws(() => h.scheduler.start(), /interval/);
});

test('failed schedule changes retain the saved deadline, settings and existing timer', () => {
  const h = harness(); h.scheduler.start(); const previous = structuredClone(h.state), timer = h.pending();
  const routes = new Map();
  registerAutopilotRoutes({ get() {}, post: (path, ...handlers) => routes.set(path, handlers.at(-1)) }, {
    state: h.state, requireAuth() {}, startScheduler: h.scheduler.start,
  });
  const response = () => ({ status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
  h.failSave(true);
  const failed = response(); routes.get('/api/autopilot-toggle')({ body: { enabled: false, intervalHours: 48 } }, failed);
  assert.equal(failed.code, 500); assert.equal(failed.data.success, false);
  assert.deepEqual(h.state, previous); assert.equal(h.pending(), timer);
  h.failSave(false);
  const paused = response(); routes.get('/api/autopilot-toggle')({ body: { enabled: false, intervalHours: 48 } }, paused);
  assert.equal(paused.data.success, true); assert.equal(paused.data.nextRunTime, null); assert.equal(h.pending(), null);
  assert.equal(h.snapshot().enabled, false); assert.equal(h.snapshot().nextRunTime, '2026-09-06T13:00:00.000Z');
  const invalid = response(); routes.get('/api/autopilot-toggle')({ body: { enabled: true, intervalHours: 0 } }, invalid);
  assert.equal(invalid.code, 400); assert.equal(h.state.enabled, false);
});

test('initial persistence failure does not leave an unsaved deadline or timer', () => {
  const h = harness(); h.failSave(true);
  assert.throws(() => h.scheduler.start(), /save/); assert.equal(h.state.nextRunTime, undefined); assert.equal(h.pending(), undefined);
  h.failSave(false); h.scheduler.start(); assert.equal(h.snapshot().nextRunTime, h.state.nextRunTime);
});
