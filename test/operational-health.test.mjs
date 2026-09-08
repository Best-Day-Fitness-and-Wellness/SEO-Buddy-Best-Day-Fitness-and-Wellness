import test from 'node:test';
import assert from 'node:assert/strict';
import healthModule from '../lib/operational-health.js';

const { backupHealth, buildOperationalHealth, providerHealth } = healthModule;

test('provider health distinguishes proven success, failure, optional setup, and untested configuration', () => {
  const providers = providerHealth({
    gemini: { configured: true, status: 'healthy', lastSuccessAt: '2026-09-08T12:00:00.000Z' },
    openai: { configured: false, status: 'unconfigured' },
    gohighlevel: { configured: true, status: 'degraded', lastFailureAt: '2026-09-08T12:01:00.000Z', lastError: 'secret response' },
    'search-console': { configured: true, status: 'unknown' },
  });

  assert.equal(providers.find(item => item.key === 'gemini').state, 'healthy');
  assert.equal(providers.find(item => item.key === 'openai').stateLabel, 'Optional');
  assert.equal(providers.find(item => item.key === 'gohighlevel').state, 'attention');
  assert.equal(providers.find(item => item.key === 'search-console').state, 'ready-to-test');
  assert.equal(JSON.stringify(providers).includes('secret response'), false);
});

test('newest corrupt backup is not hidden behind an older valid backup', () => {
  const result = backupHealth([
    { id: '2026-09-08T12-00-00-000Z', valid: false, error: 'checksum details' },
    { id: '2026-09-07T12-00-00-000Z', valid: true, createdAt: '2026-09-07T12:00:00.000Z' },
  ], Date.parse('2026-09-08T13:00:00.000Z'));

  assert.equal(result.state, 'attention');
  assert.equal(result.stateLabel, 'Verification failed');
  assert.equal(result.latestBackupId, '2026-09-08T12-00-00-000Z');
  assert.equal(JSON.stringify(result).includes('checksum details'), false);
});

test('operational overview reports current failures without treating optional providers as outages', () => {
  const now = Date.parse('2026-09-08T13:00:00.000Z');
  const overview = buildOperationalHealth({
    now,
    providerSnapshot: { providers: {
      gemini: { configured: true, status: 'healthy', lastSuccessAt: '2026-09-08T12:00:00.000Z' },
      openai: { configured: false, status: 'unconfigured' },
    } },
    storage: { ok: true, persistent: true },
    workerRunning: true,
    backups: [{ id: '2026-09-08T12-00-00-000Z', valid: true, createdAt: '2026-09-08T12:00:00.000Z' }],
    automation: [{ title: 'AI visibility checks', enabled: true, status: 'failed', lastRecordedAt: null }],
    monthlyReport: { ready: true, enabled: true, hasDeliveryProblem: false, lastSentAt: '2026-09-01T13:00:00.000Z' },
    budget: { reached: false },
  });

  assert.equal(overview.overall, 'attention');
  assert.equal(overview.alerts.length, 1);
  assert.equal(overview.alerts[0].key, 'automations');
  assert.equal(overview.systems.find(item => item.key === 'backups').state, 'healthy');
  assert.equal(overview.integrations.find(item => item.key === 'openai').state, 'not-connected');
});

test('budget limit and stale backup become concise owner alerts', () => {
  const now = Date.parse('2026-09-08T13:00:00.000Z');
  const overview = buildOperationalHealth({
    now,
    providerSnapshot: { providers: {} },
    storage: { ok: true, persistent: true },
    workerRunning: true,
    backups: [{ id: '2026-09-01T12-00-00-000Z', valid: true, createdAt: '2026-09-01T12:00:00.000Z' }],
    automation: [],
    monthlyReport: {},
    budget: { reached: true },
  });

  assert.deepEqual(overview.alerts.map(item => item.key), ['backups', 'budget']);
  assert.equal(overview.checkedAt, '2026-09-08T13:00:00.000Z');
});
