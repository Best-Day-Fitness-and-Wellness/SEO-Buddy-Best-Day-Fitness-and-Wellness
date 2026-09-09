import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AUTOPILOT_CASE_STUDIES,
  DEFAULT_CASE_STUDY,
  contentBaseDomain,
  createContentAutopilotService,
} = require('../lib/content-autopilot-service');

const AT = new Date('2026-09-09T12:00:00.000Z');

function fixture(overrides = {}) {
  const history = [];
  const logs = [];
  const calls = { config: 0, history: 0, gsc: [], generated: [], published: [], indexed: [] };
  const state = { queue: [], targets: [], targetIndex: 0, lastRun: null };
  const service = createContentAutopilotService({
    state,
    getHistory: () => history,
    saveHistory: () => { calls.history++; },
    saveConfig: () => { calls.config++; },
    logActivity: message => logs.push(message),
    getGoogleAuth: () => ({ account: 'test' }),
    getSiteUrl: () => 'sc-domain:example.test',
    createWebmasters: auth => ({ auth }),
    searchConsoleQuery: async (...args) => {
      calls.gsc.push(args);
      return { data: { rows: [{ keys: ['search gap'], impressions: 20, clicks: 0 }] } };
    },
    generateArticle: async (...args) => {
      calls.generated.push(args);
      return { title: 'Generated Guide', content: '<p>Guide</p>', quality: { publishable: true, score: 91, version: 3 } };
    },
    publishArticle: async (...args) => {
      calls.published.push(args);
      return { source: 'live_ghl', url: 'https://example.test/post/generated-guide' };
    },
    indexUrl: async (...args) => { calls.indexed.push(args); },
    explainIndexError: message => `Explained: ${message}`,
    now: () => new Date(AT),
    ...overrides,
  });
  return { calls, history, logs, service, state };
}

test('owner queue remains first priority and preserves live Search Console, publishing, indexing, and history contracts', async () => {
  const testCase = fixture();
  testCase.history.push({ keyword: 'already covered' });
  testCase.state.queue.push(
    { topic: 'already covered', addedAt: 'old' },
    { topic: 'Mobility for runners', addedAt: 'new' },
    { topic: ' mobility for runners ', addedAt: 'duplicate' },
  );
  testCase.state.targets.push('target after queue');

  const result = await testCase.service.runCycle();

  assert.equal(testCase.calls.gsc.length, 1);
  assert.deepEqual(testCase.calls.gsc[0][1], {
    siteUrl: 'sc-domain:example.test',
    requestBody: {
      startDate: '2026-08-10',
      endDate: '2026-09-09',
      dimensions: ['query'],
      rowLimit: 100,
    },
  });
  assert.deepEqual(testCase.calls.generated[0], [
    'Mobility for runners',
    DEFAULT_CASE_STUDY,
    'Claim Longevity Assessment',
    'https://example.test/consultation',
  ]);
  assert.deepEqual(testCase.calls.published[0], ['Generated Guide', '<p>Guide</p>', 'published']);
  assert.deepEqual(testCase.calls.indexed[0], ['https://example.test/post/generated-guide']);
  assert.deepEqual(result, {
    title: 'Generated Guide',
    keyword: 'Mobility for runners',
    platform: 'GoHighLevel (Published)',
    date: '2026-09-09',
    indexed: 'Indexing Requested',
    url: 'https://example.test/post/generated-guide',
    qualityScore: 91,
    qualityVersion: 3,
    indexWarning: false,
  });
  assert.deepEqual(testCase.state.queue, []);
  assert.equal(testCase.state.lastRun, AT.toISOString());
  assert.equal(testCase.history[0].keyword, 'Mobility for runners');
  assert.equal(testCase.calls.history, 1);
  assert.equal(testCase.calls.config, 3);
  assert.match(testCase.logs.at(-1), /Deployed and Indexed/);
});

test('proactive targets rotate before measured gaps and indexing failure remains non-fatal', async () => {
  const testCase = fixture({
    indexUrl: async () => { throw new Error('owner permission required'); },
  });
  testCase.state.targets.push('mobility training st pete', 'second target');

  const result = await testCase.service.runCycle();

  assert.equal(testCase.state.targetIndex, 1);
  assert.equal(testCase.calls.generated[0][0], 'mobility training st pete');
  assert.equal(testCase.calls.generated[0][1], AUTOPILOT_CASE_STUDIES['mobility training st pete']);
  assert.equal(result.indexed, 'Indexing Failed');
  assert.equal(result.indexWarning, true);
  assert.equal(testCase.calls.history, 1);
  assert.equal(testCase.calls.config, 2);
  assert.ok(testCase.logs.some(message => message.includes('Explained: owner permission required')));
  assert.match(testCase.logs.at(-1), /indexing skipped/);
});

test('measured gaps are used only after queued and proactive topics are exhausted', async () => {
  const testCase = fixture();
  const result = await testCase.service.runCycle();
  assert.equal(result.keyword, 'search gap');
  assert.ok(testCase.logs.some(message => message === 'Targeting leak query: "search gap" (Impressions: 20)'));
});

test('production GSC failures never create fabricated work and retain actionable activity', async () => {
  const testCase = fixture({
    searchConsoleQuery: async () => { throw new Error('test-only outage'); },
    allowMockIntegrations: false,
  });
  const result = await testCase.service.runCycle();
  assert.equal(result, null);
  assert.equal(testCase.calls.generated.length, 0);
  assert.ok(testCase.logs.some(message => /no fabricated search opportunities.*test-only outage/.test(message)));
  assert.equal(testCase.logs.at(-1), 'Check complete. No queued topics, target keywords, or new content gaps left to cover.');
});

test('development mode keeps demo fallback after a Search Console failure', async () => {
  const testCase = fixture({
    searchConsoleQuery: async () => { throw new Error('test-only outage'); },
    allowMockIntegrations: true,
    mockData: [{ query: 'demo gap', impressions: 30, clicks: 0, leak: true }],
  });
  const result = await testCase.service.runCycle();
  assert.equal(result.keyword, 'demo gap');
  assert.ok(testCase.logs.some(message => /development demo searches will be used/.test(message)));
});

test('quality failures are terminal and never publish, index, or mutate history', async () => {
  const testCase = fixture({
    generateArticle: async () => ({
      title: 'Unsafe', content: '<p>Unsafe</p>',
      quality: { publishable: false, blockingIssues: ['Missing required answer.'] },
    }),
  });
  testCase.state.queue.push({ topic: 'quality topic' });

  await assert.rejects(testCase.service.runCycle(), error => (
    error.code === 'CONTENT_QUALITY_FAILED'
      && error.retryable === false
      && /Missing required answer/.test(error.message)
  ));
  assert.equal(testCase.calls.published.length, 0);
  assert.equal(testCase.calls.indexed.length, 0);
  assert.equal(testCase.calls.history, 0);
  assert.equal(testCase.state.queue.length, 1);
  assert.match(testCase.logs.at(-1), /Autopilot cycle failed/);
});

test('domain normalization and dependency wiring stay deterministic', () => {
  assert.equal(contentBaseDomain('sc-domain:example.test'), 'https://example.test');
  assert.equal(contentBaseDomain('https://example.test/root/'), 'https://example.test/root');
  assert.equal(contentBaseDomain(''), 'https://bestdayfitness.com');
  assert.throws(() => createContentAutopilotService({}), /state is required/);
});
