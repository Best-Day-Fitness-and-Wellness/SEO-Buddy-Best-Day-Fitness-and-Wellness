'use strict';

const { EMAIL_PATTERN } = require('./delivery-routes');

function validateTimeZone(value) {
  const timeZone = String(value || 'America/New_York');
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()); }
  catch (_) { throw new TypeError(`Invalid report time zone: ${timeZone}`); }
  return timeZone;
}

function calendarParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { day: Number(parts.day), monthKey: `${parts.year}-${parts.month}` };
}

function maskEmail(value) {
  const [local, domain] = String(value || '').split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(4, Math.max(1, local.length - 1)))}@${domain}`;
}

function nextScheduledAt(now, timeZone, utcHour = 13) {
  const cursor = new Date(now);
  cursor.setUTCHours(utcHour, 0, 0, 0);
  if (cursor <= now) cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let index = 0; index < 40; index += 1) {
    if (calendarParts(cursor, timeZone).day === 1) return cursor.toISOString();
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return null;
}

function createMonthlyReportService(options) {
  const {
    state, saveState, gmailConfigured, defaultRecipient, buildReportData,
    renderReport, sendGmail, now = () => new Date(),
  } = options;
  state.enabled = state.enabled !== false;
  state.timeZone = validateTimeZone(state.timeZone || 'America/New_York');
  state.recipient = String(state.recipient || '').trim();

  const recipient = () => String(state.recipient || defaultRecipient() || '').trim();
  const ready = () => !!gmailConfigured() && EMAIL_PATTERN.test(recipient());

  function status() {
    const to = recipient();
    return {
      success: true,
      enabled: !!state.enabled,
      dayOfMonth: 1,
      timeZone: state.timeZone,
      gmailConfigured: !!gmailConfigured(),
      recipientConfigured: EMAIL_PATTERN.test(to),
      recipientMasked: maskEmail(to),
      ready: ready(),
      needsSetup: !ready(),
      lastAttemptAt: state.lastAttemptAt || null,
      lastSentAt: state.lastSentAt || null,
      lastSentMonth: state.lastSentMonth || null,
      hasDeliveryProblem: !!state.lastError,
      nextRunAt: state.enabled ? nextScheduledAt(now(), state.timeZone) : null,
    };
  }

  function configure(input = {}) {
    if (typeof input.enabled === 'boolean') state.enabled = input.enabled;
    if (input.recipient != null) {
      const value = String(input.recipient).trim();
      if (value && !EMAIL_PATTERN.test(value)) throw new TypeError('Enter a valid owner email address.');
      state.recipient = value;
    }
    saveState();
    return status();
  }

  async function deliver() {
    const to = recipient();
    if (!gmailConfigured()) return { ...status(), sent: false, needsSetup: true, message: 'Connect Gmail before the monthly report can be delivered.' };
    if (!EMAIL_PATTERN.test(to)) return { ...status(), sent: false, needsSetup: true, message: 'Add the owner email address before the monthly report can be delivered.' };
    const attemptedAt = now();
    state.lastAttemptAt = attemptedAt.toISOString();
    state.lastError = null;
    saveState();
    try {
      const report = renderReport(await buildReportData(), attemptedAt);
      const score = report.model?.score?.overall;
      const body = [
        'Your monthly SEO Buddy Visibility & Growth Report is attached.',
        score == null ? null : `Current optimization score: ${score}/100.`,
        '',
        'The report separates measured results, recorded work, and the next recommended actions.',
        '',
        '— SEO Buddy',
      ].filter(value => value != null).join('\n');
      const id = await sendGmail(to, `Your monthly SEO report — ${report.model.businessName}`, body, {
        attachments: [{ filename: report.filename, contentType: 'application/pdf', data: report.bytes }],
      });
      const sentAt = now();
      state.lastSentAt = sentAt.toISOString();
      state.lastSentMonth = calendarParts(sentAt, state.timeZone).monthKey;
      state.lastMessageId = id || null;
      state.lastError = null;
      saveState();
      return { ...status(), sent: true };
    } catch (error) {
      state.lastError = error.message;
      saveState();
      throw error;
    }
  }

  async function runScheduled() {
    if (!state.enabled) return { skipped: 'disabled' };
    const current = calendarParts(now(), state.timeZone);
    if (current.day !== 1) return { skipped: 'not-due' };
    if (state.lastSentMonth === current.monthKey) return { skipped: 'already-sent' };
    const result = await deliver();
    return result.sent ? { sent: true } : { skipped: 'needs-email-setup' };
  }

  return { configure, deliver, runScheduled, status };
}

function registerMonthlyReportRoutes(app, { requireOwner, service }) {
  app.get('/api/monthly-report', (req, res) => res.json(service.status()));
  app.post('/api/monthly-report', requireOwner, (req, res) => {
    try { return res.json(service.configure(req.body || {})); }
    catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  });
  app.post('/api/monthly-report/send', requireOwner, async (req, res) => {
    try {
      const result = await service.deliver();
      return res.status(result.needsSetup ? 409 : 200).json(result);
    } catch (error) {
      return res.status(502).json({ success: false, error: `Monthly report email failed: ${error.message}` });
    }
  });
}

module.exports = {
  calendarParts,
  createMonthlyReportService,
  maskEmail,
  nextScheduledAt,
  registerMonthlyReportRoutes,
  validateTimeZone,
};
