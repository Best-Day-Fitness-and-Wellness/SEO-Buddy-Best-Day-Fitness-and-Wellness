'use strict';

const crypto = require('node:crypto');
const { EMAIL_PATTERN } = require('./delivery-routes');
const { maskEmail } = require('./monthly-report');

function incidentFingerprint(alerts) {
  const incidents = (Array.isArray(alerts) ? alerts : [])
    .map(item => ({ key: String(item?.key || '').slice(0, 80), message: String(item?.message || '').slice(0, 500) }))
    .filter(item => item.key && item.message)
    .sort((a, b) => a.key.localeCompare(b.key) || a.message.localeCompare(b.message));
  if (!incidents.length) return null;
  return crypto.createHash('sha256').update(JSON.stringify(incidents)).digest('hex');
}

function createReliabilityAlertService(options) {
  const {
    state,
    saveState,
    gmailConfigured,
    recipient,
    sendEmail,
    now = () => new Date(),
    retryDelayMs = 55 * 60 * 1000,
  } = options;
  state.enabled = state.enabled === true;

  const destination = () => String(recipient() || '').trim();
  const ready = () => Boolean(gmailConfigured()) && EMAIL_PATTERN.test(destination());

  function status() {
    const to = destination();
    return {
      success: true,
      enabled: state.enabled === true,
      ready: ready(),
      gmailConfigured: Boolean(gmailConfigured()),
      recipientConfigured: EMAIL_PATTERN.test(to),
      recipientMasked: maskEmail(to),
      lastCheckedAt: state.lastCheckedAt || null,
      lastAttemptAt: state.lastAttemptAt || null,
      lastSentAt: state.lastSentAt || null,
      lastResolvedAt: state.lastResolvedAt || null,
      hasDeliveryProblem: state.lastDeliveryFailed === true,
    };
  }

  function configure(input = {}) {
    if (typeof input.enabled !== 'boolean') throw new TypeError('Choose whether failure email alerts are enabled.');
    state.enabled = input.enabled;
    saveState();
    return status();
  }

  async function check(overview) {
    if (!state.enabled) return { ...status(), skipped: 'disabled' };
    const checkedAt = now();
    const alerts = Array.isArray(overview?.alerts) ? overview.alerts : [];
    const fingerprint = incidentFingerprint(alerts);
    state.lastCheckedAt = checkedAt.toISOString();

    if (!fingerprint) {
      if (state.lastIncidentFingerprint) state.lastResolvedAt = checkedAt.toISOString();
      state.lastIncidentFingerprint = null;
      state.lastDeliveryFailed = false;
      saveState();
      return { ...status(), skipped: 'no-incidents' };
    }
    if (!ready()) {
      saveState();
      return { ...status(), skipped: 'needs-email-setup' };
    }
    if (state.lastIncidentFingerprint === fingerprint && state.lastSentAt) {
      saveState();
      return { ...status(), skipped: 'already-notified' };
    }
    const previousAttempt = Date.parse(state.lastAttemptAt);
    if (state.lastFailedFingerprint === fingerprint && Number.isFinite(previousAttempt) && checkedAt.getTime() - previousAttempt < retryDelayMs) {
      saveState();
      return { ...status(), skipped: 'retry-cooldown' };
    }

    state.lastAttemptAt = checkedAt.toISOString();
    state.lastFailedFingerprint = null;
    state.lastDeliveryFailed = false;
    saveState();
    const visible = alerts.slice(0, 8);
    const extra = Math.max(0, alerts.length - visible.length);
    const body = [
      'SEO Buddy found an operational issue that needs review:',
      '',
      ...visible.map(item => `• ${item.label}: ${item.message}`),
      ...(extra ? [`• ${extra} additional issue${extra === 1 ? '' : 's'} are visible in Settings.`] : []),
      '',
      'Open SEO Buddy → Settings → System health for the current evidence and next step.',
      '',
      'This message is sent once per distinct incident set. It will not repeat unless the issue changes or clears and later returns.',
      '',
      '— SEO Buddy',
    ].join('\n');
    try {
      await sendEmail(destination(), `SEO Buddy needs attention — ${alerts.length} issue${alerts.length === 1 ? '' : 's'}`, body);
      state.lastIncidentFingerprint = fingerprint;
      state.lastFailedFingerprint = null;
      state.lastDeliveryFailed = false;
      state.lastSentAt = now().toISOString();
      saveState();
      return { ...status(), sent: true, incidents: alerts.length };
    } catch (error) {
      state.lastFailedFingerprint = fingerprint;
      state.lastDeliveryFailed = true;
      saveState();
      const failure = new Error('Failure alert email could not be delivered.');
      failure.retryable = false;
      failure.cause = error;
      throw failure;
    }
  }

  return { check, configure, status };
}

function registerReliabilityAlertRoutes(app, { requireOwner, service }) {
  app.get('/api/reliability-alerts', requireOwner, (req, res) => res.json(service.status()));
  app.post('/api/reliability-alerts', requireOwner, (req, res) => {
    try { return res.json(service.configure(req.body || {})); }
    catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  });
}

module.exports = { createReliabilityAlertService, incidentFingerprint, registerReliabilityAlertRoutes };
