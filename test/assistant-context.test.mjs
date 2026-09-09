import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAssistantContext, scoreChangeLast28Days } = require('../lib/assistant-context.js');

const DAY = 86400000;

function makeContext(overrides = {}) {
  const targets = [
    { domain: 'directory.example', listed: true, type: 'directory', status: 'done' },
    { domain: 'news.example', listed: false, type: 'news' },
    { domain: 'review.example', listed: null, type: 'review', status: 'in-progress' },
    { domain: 'four.example', listed: false, type: 'other' },
    { domain: 'five.example', listed: false, type: 'other' },
    { domain: 'six.example', listed: false, type: 'other' },
    { domain: 'seven.example', listed: false, type: 'other' },
  ];
  const options = {
    buildHealthScore: async () => ({ overall: 73 }),
    getBusinessProfile: () => ({ profile: { name: 'Saved Best Day', phone: '727-555-0100' } }),
    business: {
      name: 'Best Day Fitness',
      addressLocality: 'St. Petersburg',
      addressRegion: 'FL',
      telephone: '727-555-0199',
    },
    getScoreSnapshots: () => [
      { date: '2026-07-01', overall: 68 },
      { date: '2026-08-01', overall: 70 },
      { date: '2026-09-09', overall: 73 },
    ],
    getAiVisibilitySnapshot: () => ({
      visibilityScore: 42,
      shareOfVoice: 18,
      sentimentScore: 91,
      engines: ['Gemini'],
      leaderboard: [
        { name: 'Best Day', score: 42, isBrand: true },
        { name: 'Competitor', score: 38, isBrand: false },
      ],
      perEngine: { gemini: { visibility: 42 } },
    }),
    getFactCheckSnapshot: () => ({
      totalWrong: 1,
      results: [{
        label: 'Gemini',
        accuracy: 80,
        issues: [
          { correct: false, aiClaim: 'Wrong address', truth: 'Correct address' },
          { correct: true, aiClaim: 'Right phone', truth: 'Right phone' },
        ],
      }],
    }),
    getCrawlerSnapshot: () => ({
      blocked: 1,
      total: 2,
      bots: [{ label: 'GPTBot', status: 'blocked' }, { label: 'ClaudeBot', status: 'allowed' }],
    }),
    getLocalNap: () => ({ mismatchCount: 1, checkedAt: '2026-09-08T10:00:00Z', listings: [{ platform: 'Yelp' }] }),
    getNapExclusions: () => [{ platform: 'YogaFinder' }],
    getCitationWorklist: () => ({ targets }),
    getAioAudits: () => [{ recommended: true }, { recommended: false }],
    getConnections: () => ({ gmail: true, searchConsole: true }),
    getGooglePost: () => ({ status: 'owner-marked', recordedAt: '2026-09-07T12:00:00Z' }),
    getMonthlyReport: () => ({ ready: true, nextRunAt: '2026-10-01T13:00:00Z' }),
    getFailureAlerts: () => ({ enabled: true, ready: true }),
    getOperationalHealth: async () => ({
      checkedAt: '2026-09-09T12:00:00Z',
      overall: 'attention',
      alerts: [{ key: 'backup', label: 'Backup', message: 'Backup is due.', private: 'omit' }],
    }),
    getContentSchedule: () => ({ enabled: true, nextRunAt: '2026-09-10T13:00:00Z', lastSuccessfulRunAt: '2026-09-03T13:00:00Z' }),
    getRedditSnapshot: () => ({ threads: [{}, {}, {}] }),
    getEngines: () => [{ label: 'Gemini', configured: true }, { label: 'OpenAI', configured: false }],
    getUsage: () => ({ estCostUSD: 1.25, assistantMessages: 7, groundedCalls: 3, openaiCalls: 2, perplexityCalls: 0, articles: 1 }),
    getBudget: () => 25,
    getSiteDomain: () => 'https://bestdayfitness.com',
    nowMs: () => Date.UTC(2026, 8, 9),
    nowIso: () => '2026-09-09T12:30:00.000Z',
    ...overrides,
  };
  return createAssistantContext(options);
}

test('assistant context projects current feature data without exposing internal fields', async () => {
  const context = await makeContext()();

  assert.deepEqual(context.business, {
    name: 'Saved Best Day',
    city: 'St. Petersburg',
    region: 'FL',
    phone: '727-555-0100',
    website: 'https://bestdayfitness.com',
  });
  assert.equal(context.optimizationScore, 73);
  assert.equal(context.scoreChangeLast28Days, 3);
  assert.equal(context.scoreStatus, 'current-dashboard-calculation');
  assert.equal(context.contextCheckedAt, '2026-09-09T12:30:00.000Z');
  assert.deepEqual(context.connections, { gmail: true, searchConsole: true });
  assert.deepEqual(context.systemHealth, {
    status: 'available',
    checkedAt: '2026-09-09T12:00:00Z',
    overall: 'attention',
    alerts: [{ key: 'backup', label: 'Backup', message: 'Backup is due.' }],
  });
  assert.deepEqual(context.localListings.excludedListings, [{ platform: 'YogaFinder' }]);
  assert.deepEqual(context.citations, { total: 7, listedOn: 1, stillToDo: 5 });
  assert.deepEqual(context.singleSearchAudits, { checks: 2, recommendedIn: 1 });
  assert.deepEqual(context.reddit, { threadsFound: 3 });
  assert.deepEqual(context.enginesConnected, [
    { engine: 'Gemini', connected: true },
    { engine: 'OpenAI', connected: false },
  ]);
  assert.equal(context.topCitationTargets.length, 6);
  assert.deepEqual(context.topCitationTargets[0], { site: 'directory.example', alreadyListed: true, type: 'directory' });
  assert.deepEqual(context.usageThisMonth, {
    estimatedCostUSD: 1.25,
    assistantMessages: 7,
    aiChecksRun: 5,
    articlesWritten: 1,
    monthlyBudgetUSD: 25,
  });
  assert.deepEqual(context.aiVisibility.leaderboard[0], { name: 'Best Day', scorePct: 42, isYou: true });
  assert.deepEqual(context.factCheck.byEngine[0].wrongClaims, [{ aiSaid: 'Wrong address', actualTruth: 'Correct address' }]);
  assert.deepEqual(context.aiCrawlerAccess, { blockedCount: 1, totalChecked: 2, blockedBots: ['GPTBot'] });
});

test('assistant context keeps unavailable current score and operational health explicit', async () => {
  const context = await makeContext({
    buildHealthScore: async () => { throw new Error('score unavailable'); },
    getBusinessProfile: () => ({ profile: {} }),
    getOperationalHealth: async () => { throw new Error('health unavailable'); },
    getAiVisibilitySnapshot: () => null,
    getFactCheckSnapshot: () => null,
    getCrawlerSnapshot: () => null,
    getLocalNap: () => null,
    getAioAudits: () => [],
    getRedditSnapshot: () => null,
  })();

  assert.equal(context.optimizationScore, null);
  assert.equal(context.scoreChangeLast28Days, null);
  assert.equal(context.scoreStatus, 'unavailable');
  assert.deepEqual(context.systemHealth, { status: 'unavailable', checkedAt: null, overall: null, alerts: [] });
  assert.equal(context.aiVisibility, null);
  assert.equal(context.factCheck, null);
  assert.equal(context.aiCrawlerAccess, null);
  assert.equal(context.localListings, null);
  assert.equal(context.singleSearchAudits, null);
  assert.equal(context.reddit, null);
  assert.equal(context.business.name, 'Best Day Fitness');
  assert.equal(context.business.phone, '727-555-0199');
});

test('assistant context isolates citation projection failures from all other live data', async () => {
  let calls = 0;
  const context = await makeContext({
    getCitationWorklist: () => {
      calls += 1;
      throw new Error('citation state unavailable');
    },
  })();

  assert.equal(calls, 2);
  assert.equal(context.citations, null);
  assert.equal(context.topCitationTargets, null);
  assert.equal(context.optimizationScore, 73);
});

test('28-day score comparison preserves fallback and same-day semantics', () => {
  const now = Date.UTC(2026, 8, 9);
  assert.equal(scoreChangeLast28Days({ overall: 73 }, [
    { date: '2026-08-01', overall: 70 },
    { date: '2026-09-09', overall: 73 },
  ], now), 3);
  assert.equal(scoreChangeLast28Days({ overall: 73 }, [
    { date: '2026-09-09', overall: 70 },
    { date: '2026-09-09', overall: 73 },
  ], now), null);
  assert.equal(scoreChangeLast28Days(null, [
    { date: '2026-08-01', overall: 70 },
    { date: '2026-09-09', overall: 73 },
  ], now), null);
  assert.equal(scoreChangeLast28Days({ overall: 73 }, [{ date: '2026-09-09', overall: 73 }], now), null);
  assert.equal(now - 28 * DAY, Date.UTC(2026, 7, 12));
});
