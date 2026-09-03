import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fixture = require('./fixtures/report.cjs');
const {
  calendarParts,
  createMonthlyReportService,
  maskEmail,
  nextScheduledAt,
  registerMonthlyReportRoutes,
  validateTimeZone,
} = require('../lib/monthly-report.js');
const { createServerPdfReport } = require('../lib/server-pdf-report.js');

function createHarness(overrides = {}) {
  const clock = { value: new Date('2026-10-01T13:00:00.000Z') };
  const state = { enabled: true, timeZone: 'America/New_York', recipient: 'owner@example.com' };
  const saves = [];
  const sends = [];
  const service = createMonthlyReportService({
    state,
    saveState: () => saves.push(structuredClone(state)),
    gmailConfigured: () => true,
    defaultRecipient: () => '',
    buildReportData: async () => ({ score: { overall: 74 } }),
    renderReport: () => ({ filename: 'report.pdf', bytes: Buffer.from('%PDF-test'), model: { businessName: 'Example Fitness', score: { overall: 74 } } }),
    sendGmail: async (...args) => { sends.push(args); return 'message-1'; },
    now: () => new Date(clock.value),
    ...overrides,
  });
  return { clock, saves, sends, service, state };
}

test('monthly calendar uses the configured local date and finds the next first', () => {
  assert.deepEqual(calendarParts(new Date('2026-10-01T03:30:00Z'), 'America/New_York'), { day: 30, monthKey: '2026-09' });
  assert.deepEqual(calendarParts(new Date('2026-10-01T13:00:00Z'), 'America/New_York'), { day: 1, monthKey: '2026-10' });
  assert.equal(nextScheduledAt(new Date('2026-09-03T12:00:00Z'), 'America/New_York'), '2026-10-01T13:00:00.000Z');
  assert.throws(() => validateTimeZone('Not/A_Timezone'), /Invalid report time zone/);
  assert.equal(maskEmail('owner@example.com'), 'o****@example.com');
});

test('scheduled monthly report sends a PDF once on the first', async () => {
  const { service, sends, state, saves } = createHarness();
  assert.deepEqual(await service.runScheduled(), { sent: true });
  assert.equal(sends.length, 1);
  assert.equal(sends[0][0], 'owner@example.com');
  assert.match(sends[0][1], /monthly SEO report/);
  assert.equal(sends[0][3].attachments[0].filename, 'report.pdf');
  assert.equal(sends[0][3].attachments[0].contentType, 'application/pdf');
  assert.equal(state.lastSentMonth, '2026-10');
  assert.equal(state.lastMessageId, 'message-1');
  assert.ok(saves.length >= 2);
  assert.deepEqual(await service.runScheduled(), { skipped: 'already-sent' });
  assert.equal(sends.length, 1);
});

test('monthly report skips non-due days and surfaces incomplete email setup', async () => {
  const nonDue = createHarness();
  nonDue.clock.value = new Date('2026-10-02T13:00:00Z');
  assert.deepEqual(await nonDue.service.runScheduled(), { skipped: 'not-due' });
  assert.equal(nonDue.sends.length, 0);

  const missing = createHarness({ gmailConfigured: () => false });
  const result = await missing.service.runScheduled();
  assert.deepEqual(result, { skipped: 'needs-email-setup' });
  assert.equal(missing.service.status().needsSetup, true);
  assert.equal(missing.service.status().recipientMasked, 'o****@example.com');
  assert.equal(missing.service.status().recipient, undefined);
});

test('monthly report validates configuration and records retryable send failures', async () => {
  const harness = createHarness({ sendGmail: async () => { throw new Error('temporary Gmail failure'); } });
  assert.throws(() => harness.service.configure({ recipient: 'not-an-email' }), /valid owner email/);
  const paused = harness.service.configure({ enabled: false, recipient: 'new@example.com' });
  assert.equal(paused.enabled, false);
  assert.equal(paused.recipientMasked, 'n**@example.com');
  harness.service.configure({ enabled: true });
  await assert.rejects(harness.service.runScheduled(), /temporary Gmail failure/);
  assert.equal(harness.state.lastError, 'temporary Gmail failure');
  assert.equal(harness.state.lastSentMonth, undefined);
});

test('monthly report routes protect mutations and preserve masked public status', async () => {
  const routes = new Map();
  const app = {
    get(pathname, ...handlers) { routes.set(`GET ${pathname}`, handlers); },
    post(pathname, ...handlers) { routes.set(`POST ${pathname}`, handlers); },
  };
  const owner = () => {};
  const harness = createHarness();
  registerMonthlyReportRoutes(app, { requireOwner: owner, service: harness.service });
  assert.equal(routes.get('POST /api/monthly-report')[0], owner);
  assert.equal(routes.get('POST /api/monthly-report/send')[0], owner);
  const response = () => {
    const output = { statusCode: 200, body: null };
    return { output, status(code) { output.statusCode = code; return this; }, json(body) { output.body = body; return this; } };
  };
  const get = response();
  routes.get('GET /api/monthly-report').at(-1)({}, get);
  assert.equal(get.output.body.recipientMasked, 'o****@example.com');
  assert.equal(get.output.body.recipient, undefined);
  assert.equal(get.output.body.lastError, undefined);
  const invalid = response();
  routes.get('POST /api/monthly-report').at(-1)({ body: { recipient: 'bad' } }, invalid);
  assert.equal(invalid.output.statusCode, 400);
  const sent = response();
  await routes.get('POST /api/monthly-report/send').at(-1)({ body: {} }, sent);
  assert.equal(sent.output.body.sent, true);
});

test('server monthly attachment uses the same branded PDF renderer as downloads', () => {
  const raw = fixture('2026-09-03');
  const data = {
    score: raw['health-score'], performance: raw.performance, moves: raw['next-moves'],
    profile: raw['business-profile'], search: raw['gsc-data'], history: raw.history,
    ai: raw['ai-visibility'], digest: raw['performance-digest'], automation: raw['automation-status'],
    reviews: raw['reviews-stats'], readiness: raw['deploy-readiness'],
  };
  const renderer = createServerPdfReport({ publicDir: path.join(process.cwd(), 'public'), appOrigin: 'https://example.test' });
  const report = renderer.render(data, new Date('2026-09-03T12:00:00Z'));
  assert.match(report.filename, /^Example-Fitness-Visibility-Growth-Report-2026-09-03\.pdf$/);
  assert.equal(report.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(report.bytes.length > 15000);
  assert.equal(report.model.publishedRecent, 1);
});
