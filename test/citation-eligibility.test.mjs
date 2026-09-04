import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { competitorDomains, isCompetitorDomain, eligibleCitationState, buildCitationWorklist } = require('../lib/citation-eligibility');
const { registerCitationRoutes } = require('../lib/citation-routes');
const { buildNextMoves, buildAutopilotDigest } = require('../lib/dashboard-routes');

const state = {
  targets: [
    { domain: 'stpeteymca.org', type: 'competitor', listed: false },
    { domain: 'rival.example', type: ' COMPETITOR ', listed: true },
    { domain: 'directory.example', type: 'directory', listed: false },
    { domain: 'reviews.example', type: 'review', listed: true },
    { domain: 'news.example', type: 'news', listed: false },
  ],
  statuses: { 'rival.example': { status: 'live' }, 'news.example': { status: 'pitched' } },
  newDomains: ['stpeteymca.org', 'directory.example', 'old.example'],
  autoEnabled: true, intervalDays: 7, lastScanned: '2026-09-04T12:00:00Z',
};

test('legacy competitors disappear from tasks, progress and NEW flags without losing source evidence', () => {
  const before = structuredClone(state);
  const worklist = buildCitationWorklist(state, {});
  assert.deepEqual(worklist.targets.map(t => t.domain), ['directory.example', 'reviews.example', 'news.example']);
  assert.deepEqual(worklist.targets.map(t => t.mode), ['listing', 'maintain', 'pitch']);
  assert.deepEqual(worklist.counts, { total: 3, listed: 1, inProgress: 1, live: 1 });
  assert.deepEqual(worklist.newDomains, ['directory.example']);
  assert.equal(worklist.excludedCompetitorCount, 2);
  assert.deepEqual(state, before);
});

test('remembered competitor domains survive rescans, absence, restart and changed classifications', () => {
  const excludedCompetitorDomains = competitorDomains(state, [{ domain: 'https://www.new-rival.example/', type: 'competitor' }]);
  const restarted = JSON.parse(JSON.stringify({ excludedCompetitorDomains, targets: [] }));
  assert.deepEqual(competitorDomains(restarted), ['stpeteymca.org', 'rival.example', 'new-rival.example']);
  restarted.targets = [
    { domain: 'WWW.STPETEYMCA.ORG', type: 'other' },
    { domain: 'blog.new-rival.example', type: 'listicle' },
    { domain: 'notrival.example', type: 'directory' },
    { domain: 'rival.example.evil.test', type: 'news' },
  ];
  assert.deepEqual(eligibleCitationState(restarted).targets.map(t => t.domain), ['notrival.example', 'rival.example.evil.test']);
  assert.equal(isCompetitorDomain('', excludedCompetitorDomains), false);
});

test('dashboard and digest use eligible sources only, including all-competitor scans', () => {
  const context = { citationsDb: eligibleCitationState(state), aioAuditsDb: [{}], autopilotEnabled: true, gscConfigured: true };
  assert.equal(buildNextMoves(context).find(move => move.key === 'listed').title, 'Get listed on directory.example');
  assert.match(buildAutopilotDigest(context).items.find(item => item.key === 'citations').text, /^1 new source/);
  const all = { ...state, targets: state.targets.slice(0, 2) };
  context.citationsDb = eligibleCitationState(all);
  assert.equal(buildNextMoves(context).some(move => move.key === 'listed'), false);
  assert.equal(buildAutopilotDigest(context).items.some(item => item.key === 'citations'), false);
  assert.deepEqual(buildCitationWorklist(all, {}).counts, { total: 0, listed: 0, inProgress: 0, live: 0 });
});

test('discovery filters competitors and stale clients cannot change their status or draft outreach', async () => {
  const routes = new Map(); let writes = 0; let generations = 0;
  const app = { get: (path, ...handlers) => routes.set(path, handlers), post: (path, ...handlers) => routes.set(path, handlers) };
  registerCitationRoutes(app, {
    requireAuth() {}, hasGeminiKey: () => true, listingKit: () => ({}),
    isExcludedDomain: domain => isCompetitorDomain(domain, competitorDomains(state)),
    discoverTargets: async () => ({ brandCited: false, sourcesFound: 5, targets: state.targets }),
    updateStatus: () => { writes++; }, geminiGenerate: () => { generations++; },
  });
  async function run(path, body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await routes.get(path).at(-1)({ body }, res); return res;
  }
  const found = await run('/api/citation-targets', { queries: ['fitness'] });
  assert.equal(found.body.targets.length, 3);
  const blocked = await run('/api/citation-status', { domain: 'stpeteymca.org', status: 'todo' });
  assert.equal(blocked.statusCode, 409);
  const skipped = await run('/api/citation-outreach', { domain: 'www.stpeteymca.org', type: 'directory' });
  assert.equal(skipped.body.kind, 'skip');
  assert.deepEqual([writes, generations], [0, 0]);
});
