import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHealthScoreService } = require('../lib/health-score-service');
const { eligibleCitationState } = require('../lib/citation-eligibility');

const NOW = new Date('2026-09-09T12:00:00.000Z').getTime();

function fixture(overrides = {}) {
  const local = {
    nap: { mismatchCount: 1 },
    napExclusions: ['ignored.test'],
    lastNapRun: '2026-09-08T12:00:00.000Z',
    gbpDraft: { posted: true, postedAt: '2026-09-08T13:00:00.000Z' },
  };
  const citations = {
    lastScanned: '2026-09-08T14:00:00.000Z',
    excludedCompetitorDomains: ['competitor.test'],
    targets: [
      { domain: 'directory.test', type: 'directory' },
      { domain: 'reviews.test', type: 'review' },
      { domain: 'competitor.test', type: 'competitor' },
    ],
    statuses: { 'directory.test': { status: 'live' } },
  };
  return createHealthScoreService({
    getPerformance: async () => ({
      source: 'live_gsc',
      current: { avgPosition: 10 },
      snapshots: [{ date: '2026-09-08', leaks: 2 }],
    }),
    getLocalState: () => local,
    effectiveNap: nap => ({ ...nap, excludedListings: [{}], unverifiedCount: 2 }),
    getAiAudits: () => [
      { recommended: true, timestamp: '2026-09-08T15:00:00.000Z' },
      { recommended: false, timestamp: '2026-09-07T15:00:00.000Z' },
    ],
    getCitationState: () => citations,
    eligibleCitationState,
    getPublicationHistory: () => [{ date: '2026-09-01', publishedAt: '2026-09-01T16:00:00.000Z' }],
    isAutopilotEnabled: () => true,
    now: () => NOW,
    ...overrides,
  });
}

test('score composer preserves all five measured pillar contracts', async () => {
  const result = await fixture().compute();
  assert.equal(result.scoreVersion, 2);
  assert.equal(result.overall, 75);
  assert.equal(result.measuredCount, 5);

  const [found, local, ai, listed, fresh] = result.pillars;
  assert.deepEqual(found.inputs, { leaks: 2, averagePosition: 10 });
  assert.equal(found.score, 84);
  assert.equal(found.detail, '2 searches with no clicks · avg rank 10');
  assert.equal(found.sourceUpdatedAt, '2026-09-08T00:00:00.000Z');

  assert.deepEqual(local.inputs, { mismatches: 1, excludedListings: 1, unverifiedListings: 2, gbpPosted: true });
  assert.equal(local.score, 93);
  assert.equal(local.detail, '1 listing to fix');
  assert.equal(local.sourceUpdatedAt, '2026-09-08T12:00:00.000Z');

  assert.deepEqual(ai.inputs, { recommended: 1, checks: 2 });
  assert.equal(ai.score, 50);
  assert.equal(ai.detail, 'Recommended in 1 of 2 checks');

  assert.deepEqual(listed.inputs, { listed: 1, total: 2, excludedCompetitors: 1 });
  assert.equal(listed.score, 50);
  assert.equal(listed.detail, 'On 1 of 2 eligible sources AI cites');

  assert.deepEqual(fresh.inputs, { daysSincePost: 8.5, autopilotEnabled: true, postCount: 1 });
  assert.equal(fresh.score, 100);
  assert.equal(fresh.detail, 'Last post 9d ago · autopilot on');
  assert.equal(fresh.sourceUpdatedAt, '2026-09-01T16:00:00.000Z');
});

test('unavailable sources remain unmeasured without manufacturing a score', async () => {
  const result = await fixture({
    getPerformance: async () => ({ source: 'unavailable' }),
    getLocalState: () => ({}),
    getAiAudits: () => [],
    getCitationState: () => ({ targets: [], lastScanned: '2026-09-08T00:00:00.000Z' }),
    getPublicationHistory: () => [],
    isAutopilotEnabled: () => false,
  }).compute();
  assert.equal(result.overall, null);
  assert.equal(result.measuredCount, 0);
  assert.deepEqual(result.pillars.map(pillar => pillar.detail), [
    'Connect Search Console to measure',
    'Run a listings check to measure',
    'Run an AI visibility check to measure',
    'No eligible listing sources in the latest scan',
    'Publish your first post to measure',
  ]);
});

test('Search Console failures and enabled empty content preserve fallback semantics', async () => {
  const result = await fixture({
    getPerformance: async () => { throw new Error('test-only outage'); },
    getLocalState: () => ({}),
    getAiAudits: () => [],
    getCitationState: () => ({ targets: [] }),
    getPublicationHistory: () => [],
    isAutopilotEnabled: () => true,
  }).compute();
  assert.equal(result.pillars[0].detail, 'Not measured yet');
  assert.equal(result.pillars[4].score, 30);
  assert.equal(result.pillars[4].detail, 'Autopilot on, no posts yet');
  assert.deepEqual(result.pillars[4].inputs, { daysSincePost: null, autopilotEnabled: true, postCount: 0 });
});

test('listing and content bounds preserve zero and maximum scores', async () => {
  const result = await fixture({
    getLocalState: () => ({ nap: { mismatchCount: 20 }, gbpDraft: { posted: false } }),
    effectiveNap: nap => nap,
    getPublicationHistory: () => [{ date: '2025-01-01' }],
    isAutopilotEnabled: () => false,
  }).compute();
  assert.equal(result.pillars[1].score, 0);
  assert.equal(result.pillars[4].score, 0);
});

test('score composer rejects incomplete dependency wiring', () => {
  assert.throws(() => createHealthScoreService({}), /getPerformance is required/);
});
