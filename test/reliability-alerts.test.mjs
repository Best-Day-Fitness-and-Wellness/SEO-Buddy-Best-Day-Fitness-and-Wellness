import test from 'node:test';
import assert from 'node:assert/strict';
import alertsModule from '../lib/reliability-alerts.js';

const { createReliabilityAlertService, incidentFingerprint, registerReliabilityAlertRoutes } = alertsModule;

function harness(overrides = {}) {
  const clock = { value: new Date('2026-09-08T13:00:00.000Z') };
  const state = { enabled: true };
  const saves = [];
  const sends = [];
  const service = createReliabilityAlertService({
    state,
    saveState: () => saves.push(structuredClone(state)),
    gmailConfigured: () => true,
    recipient: () => 'owner@example.com',
    sendEmail: async (...args) => { sends.push(args); return 'message-1'; },
    now: () => new Date(clock.value),
    ...overrides,
  });
  return { clock, saves, sends, service, state };
}

const overview = { alerts: [
  { key: 'worker', label: 'Scheduled work', message: 'The worker is unavailable.' },
  { key: 'backups', label: 'Daily backup', message: 'The backup is overdue.' },
] };

test('incident fingerprints are stable, bounded, and order independent', () => {
  assert.equal(incidentFingerprint([]), null);
  assert.equal(incidentFingerprint(overview.alerts), incidentFingerprint(overview.alerts.slice().reverse()));
  assert.match(incidentFingerprint(overview.alerts), /^[a-f0-9]{64}$/);
});

test('alerts are opt-in, use the report recipient, and send each incident set once', async () => {
  const h = harness();
  const first = await h.service.check(overview);
  assert.equal(first.sent, true);
  assert.equal(first.incidents, 2);
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0][0], 'owner@example.com');
  assert.match(h.sends[0][1], /2 issues/);
  assert.match(h.sends[0][2], /Scheduled work.*worker is unavailable/s);
  assert.equal((await h.service.check(overview)).skipped, 'already-notified');
  assert.equal(h.sends.length, 1);

  h.clock.value = new Date('2026-09-08T15:00:00.000Z');
  assert.equal((await h.service.check({ alerts: [] })).skipped, 'no-incidents');
  assert.ok(h.state.lastResolvedAt);
  assert.equal((await h.service.check(overview)).sent, true);
  assert.equal(h.sends.length, 2);
});

test('disabled and incomplete alert delivery never send', async () => {
  const off = harness();
  off.service.configure({ enabled: false });
  assert.equal((await off.service.check(overview)).skipped, 'disabled');
  assert.equal(off.sends.length, 0);
  assert.throws(() => off.service.configure({ enabled: 'yes' }), /Choose whether/);

  const missing = harness({ gmailConfigured: () => false });
  assert.equal((await missing.service.check(overview)).skipped, 'needs-email-setup');
  assert.equal(missing.service.status().recipientMasked, 'o****@example.com');
  assert.equal(missing.service.status().recipient, undefined);
  assert.equal(missing.sends.length, 0);
});

test('failed alert delivery is generic, non-retrying, and cooldown bounded', async () => {
  const h = harness({ sendEmail: async () => { throw new Error('private upstream response'); } });
  await assert.rejects(h.service.check(overview), error => {
    assert.equal(error.message, 'Failure alert email could not be delivered.');
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(h.service.status().hasDeliveryProblem, true);
  assert.equal(JSON.stringify(h.service.status()).includes('private upstream response'), false);
  assert.equal((await h.service.check(overview)).skipped, 'retry-cooldown');
});

test('alert routes require owner access and never send while saving a preference', () => {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  const owner = () => {};
  const h = harness();
  registerReliabilityAlertRoutes(app, { requireOwner: owner, service: h.service });
  assert.equal(routes.get('GET /api/reliability-alerts')[0], owner);
  assert.equal(routes.get('POST /api/reliability-alerts')[0], owner);
  const response = () => {
    const output = { statusCode: 200, body: null };
    return { output, status(code) { output.statusCode = code; return this; }, json(body) { output.body = body; return this; } };
  };
  const saved = response();
  routes.get('POST /api/reliability-alerts').at(-1)({ body: { enabled: false } }, saved);
  assert.equal(saved.output.body.enabled, false);
  assert.equal(h.sends.length, 0);
});
