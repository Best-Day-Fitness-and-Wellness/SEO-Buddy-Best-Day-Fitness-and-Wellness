'use strict';

const PROVIDERS = Object.freeze({
  gemini: { label: 'Gemini', tab: 'settings-tab', optional: false },
  openai: { label: 'OpenAI / ChatGPT', tab: 'settings-tab', optional: true },
  perplexity: { label: 'Perplexity', tab: 'settings-tab', optional: true },
  gohighlevel: { label: 'Website publishing', tab: 'publish-tab', optional: false },
  'search-console': { label: 'Google Search Console', tab: 'performance-tab', optional: false },
  'google-indexing': { label: 'Google indexing', tab: 'publish-tab', optional: false },
  gmail: { label: 'Monthly report email', tab: 'performance-tab', optional: false },
  'google-business-profile': { label: 'Google Business Profile', tab: 'local-tab', optional: true },
  'reviews-site': { label: 'Reviews website', tab: 'performance-tab', optional: false },
  'web-audit': { label: 'Website checks', tab: 'onsite-tab', optional: false },
  trustpilot: { label: 'Trustpilot', tab: 'performance-tab', optional: true },
});

const parsedTime = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
};

function providerHealth(snapshot = {}) {
  return Object.entries(PROVIDERS).map(([key, definition]) => {
    const source = snapshot[key] || {};
    const configured = source.configured === true;
    let state = 'ready-to-test';
    let label = 'Ready to test';
    let detail = 'Configured, but no successful request is recorded since this server started.';

    if (!configured) {
      state = 'not-connected';
      label = definition.optional ? 'Optional' : 'Not connected';
      detail = definition.optional
        ? 'This optional connection is not set up.'
        : 'This connection is not set up.';
    } else if (source.status === 'healthy') {
      state = 'healthy';
      label = 'Working';
      detail = 'A successful request is recorded since this server started.';
    } else if (['degraded', 'unavailable'].includes(source.status)) {
      state = 'attention';
      label = source.status === 'unavailable' ? 'Temporarily unavailable' : 'Needs attention';
      detail = 'The latest connection attempt failed. Open its tool to review and retry.';
    }

    return {
      key,
      label: definition.label,
      tab: definition.tab,
      optional: definition.optional,
      configured,
      state,
      stateLabel: label,
      detail,
      lastAttemptAt: source.lastAttemptAt || null,
      lastSuccessAt: source.lastSuccessAt || null,
      lastFailureAt: source.lastFailureAt || null,
    };
  });
}

function backupHealth(backups = [], now = Date.now()) {
  // BackupService.list() is newest-first by its timestamped ID. Keep that
  // ordering so a corrupt newest manifest cannot disappear behind an older,
  // valid backup whose createdAt is still readable.
  const latest = Array.isArray(backups) ? backups[0] : null;
  if (!latest) return {
    key: 'backups', label: 'Daily backup', state: 'attention', stateLabel: 'No verified backup',
    detail: 'No backup is available yet. The daily backup job should create one automatically.', lastSuccessAt: null, latestBackupId: null,
  };
  if (!latest.valid) return {
    key: 'backups', label: 'Daily backup', state: 'attention', stateLabel: 'Verification failed',
    detail: 'The newest backup did not pass its checksum verification.', lastSuccessAt: null, latestBackupId: latest.id || null,
  };
  const ageMs = now - parsedTime(latest.createdAt);
  const stale = !Number.isFinite(ageMs) || ageMs > 48 * 60 * 60 * 1000;
  return {
    key: 'backups', label: 'Daily backup', state: stale ? 'attention' : 'healthy',
    stateLabel: stale ? 'Backup is overdue' : 'Verified',
    detail: stale ? 'The newest verified backup is more than two days old.' : 'The newest backup passed checksum verification.',
    lastSuccessAt: latest.createdAt || null, latestBackupId: latest.id || null,
  };
}

function buildOperationalHealth(input = {}) {
  const now = Number(input.now) || Date.now();
  const integrations = providerHealth(input.providerSnapshot?.providers || input.providerSnapshot || {});
  const storage = input.storage || {};
  const storageItem = {
    key: 'storage', label: 'Saved data', state: storage.ok && storage.persistent ? 'healthy' : 'attention',
    stateLabel: storage.ok && storage.persistent ? 'Persistent' : storage.ok ? 'Temporary storage' : 'Unavailable',
    detail: storage.ok && storage.persistent
      ? 'Saved work is stored outside the app process and survives deployments.'
      : storage.ok ? 'Saved work may be lost during a deployment.' : 'The app cannot safely read and write saved work.',
    lastSuccessAt: null,
  };
  const workerItem = {
    key: 'worker', label: 'Scheduled work', state: input.workerRunning ? 'healthy' : 'attention',
    stateLabel: input.workerRunning ? 'Running' : 'Unavailable',
    detail: input.workerRunning ? 'The background worker is available for scheduled tasks.' : 'Scheduled tasks cannot be verified while the worker is unavailable.',
    lastSuccessAt: null,
  };
  const backupItem = backupHealth(input.backups, now);
  const automation = Array.isArray(input.automation) ? input.automation : [];
  const failedAutomations = automation.filter(item => item.status === 'failed' || (item.enabled && item.status === 'unknown'));
  const automationSuccesses = automation.map(item => item.lastRecordedAt).filter(parsedTime).sort((a, b) => parsedTime(b) - parsedTime(a));
  const automationItem = {
    key: 'automations', label: 'Automation checks', state: failedAutomations.length ? 'attention' : 'healthy',
    stateLabel: failedAutomations.length ? `${failedAutomations.length} need attention` : 'No current failures',
    detail: failedAutomations.length
      ? `Review: ${failedAutomations.map(item => item.title).join(', ')}.`
      : 'No enabled automation currently reports a failed or unverifiable run.',
    lastSuccessAt: automationSuccesses[0] || null,
  };
  const report = input.monthlyReport || {};
  const reportItem = {
    key: 'monthly-report', label: 'Monthly report delivery',
    state: report.hasDeliveryProblem ? 'attention' : report.ready && report.enabled ? 'healthy' : 'not-connected',
    stateLabel: report.hasDeliveryProblem ? 'Delivery failed' : report.ready && report.enabled ? 'Scheduled' : 'Not fully set up',
    detail: report.hasDeliveryProblem
      ? 'The latest email attempt failed. Open Results to review the setup and retry.'
      : report.ready && report.enabled ? 'The owner report is ready for automatic monthly delivery.' : 'Complete or resume email delivery setup in Results.',
    lastSuccessAt: report.lastSentAt || null,
  };
  const systems = [storageItem, workerItem, backupItem, automationItem, reportItem];
  const alerts = [];
  for (const item of systems) if (item.state === 'attention') alerts.push({ key: item.key, label: item.label, message: item.detail });
  for (const item of integrations) {
    if (item.state === 'attention') alerts.push({ key: item.key, label: item.label, message: item.detail });
  }
  if (input.budget?.reached) alerts.push({ key: 'budget', label: 'AI budget', message: 'The monthly AI budget has been reached, so AI work is paused.' });

  const total = systems.length + integrations.length;
  const healthy = [...systems, ...integrations].filter(item => item.state === 'healthy').length;
  return {
    checkedAt: new Date(now).toISOString(),
    overall: alerts.length ? 'attention' : 'healthy',
    summary: { healthy, attention: alerts.length, total },
    alerts,
    systems,
    integrations,
  };
}

module.exports = { PROVIDERS, backupHealth, buildOperationalHealth, providerHealth };
