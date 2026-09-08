import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createRedditDiscoveryService, normalizeRedditThreads } = require('../lib/reddit-discovery-service.js');

function makeService(overrides = {}) {
  const state = { latest: null, updatedAt: null };
  const calls = [];
  let saves = 0;
  const service = createRedditDiscoveryService({
    state,
    save: () => { saves += 1; },
    business: { name: 'Best Day Fitness', addressLocality: 'St. Petersburg', addressRegion: 'FL' },
    getListingKit: () => ({ shortDesc: 'coach-led fitness for adults 50+' }),
    geminiGenerate: async request => {
      calls.push(request);
      return { text: '{"threads":[]}' };
    },
    geminiModel: 'gemini-test',
    parseJson: JSON.parse,
    env: { GEMINI_API_KEY: 'secret' },
    nowIso: () => '2026-09-08T17:00:00.000Z',
    ...overrides,
    state,
  });
  return { service, state, calls, saves: () => saves };
}

test('Reddit result normalization preserves filtering, bounds, and exact URL deduplication', () => {
  const valid = Array.from({ length: 13 }, (_, index) => ({
    title: index === 0 ? '' : `Thread ${index}`,
    subreddit: index === 0 ? '/r/fitness' : 'seniorfitness',
    url: ` https://www.reddit.com/r/fitness/comments/${index} `,
    why: 'w'.repeat(260),
    angle: 'a'.repeat(320),
  }));
  const normalized = normalizeRedditThreads([
    ...valid,
    { ...valid[0] },
    { title: 'Not Reddit', url: 'https://example.com/thread' },
    null,
  ]);
  assert.equal(normalized.length, 12);
  assert.equal(normalized[0].title, 'Reddit thread');
  assert.equal(normalized[0].subreddit, 'r/fitness');
  assert.equal(normalized[1].subreddit, 'r/seniorfitness');
  assert.equal(normalized[0].url, 'https://www.reddit.com/r/fitness/comments/0');
  assert.equal(normalized[0].why.length, 240);
  assert.equal(normalized[0].angle.length, 300);
  assert.equal(new Set(normalized.map(thread => thread.url)).size, 12);
  assert.deepEqual(normalizeRedditThreads(null), []);
});

test('Reddit discovery preserves grounded prompt, provider request, and persistence contract', async () => {
  const threads = [{
    title: 'Senior fitness recommendations',
    subreddit: 'r/stpetersburgfl',
    url: 'https://www.reddit.com/r/stpetersburgfl/comments/example',
    why: 'Relevant local question',
    angle: 'Share a helpful mobility checklist and disclose affiliation',
  }];
  const { service, state, calls, saves } = makeService({
    geminiGenerate: async request => {
      calls.push(request);
      return { text: JSON.stringify({ threads }) };
    },
  });

  const { snapshot } = await service.run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-test');
  assert.deepEqual(calls[0].config, { tools: [{ googleSearch: {} }] });
  assert.match(calls[0].contents, /Best Day Fitness/);
  assert.match(calls[0].contents, /coach-led fitness for adults 50\+/);
  assert.match(calls[0].contents, /St\. Petersburg, FL/);
  assert.match(calls[0].contents, /NON-spammy/);
  assert.equal(snapshot.ranAt, '2026-09-08T17:00:00.000Z');
  assert.deepEqual(snapshot.threads, threads);
  assert.equal(state.latest, snapshot);
  assert.equal(state.updatedAt, snapshot.ranAt);
  assert.equal(saves(), 1);
});

test('Reddit discovery does no provider work or persistence without Gemini', async () => {
  const { service, calls, state, saves } = makeService({ env: {} });
  assert.deepEqual(await service.run(), {
    error: 'Reddit discovery uses live Google Search grounding — add your Gemini API key in Settings.',
  });
  assert.equal(calls.length, 0);
  assert.equal(state.latest, null);
  assert.equal(saves(), 0);
});

test('Reddit provider failures stay owner-safe and do not replace the saved snapshot', async () => {
  const raw = 'Authorization: Bearer secret-token from upstream';
  const { service, state, saves } = makeService({
    geminiGenerate: async () => { throw new Error(raw); },
  });
  const result = await service.run();
  assert.ok(result.code);
  assert.ok(result.error);
  assert.doesNotMatch(result.error, /secret-token|Authorization|upstream/i);
  assert.equal(state.latest, null);
  assert.equal(state.updatedAt, null);
  assert.equal(saves(), 0);
});
