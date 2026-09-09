import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GBP_TOPIC_SEED, createLocalAutopilotService, napSignatureOf } = require('../lib/local-autopilot-service.js');

function localState(overrides = {}) {
  return {
    enabled: true,
    napIntervalDays: 7,
    gbpIntervalDays: 7,
    lastNapRun: null,
    lastGbpRun: null,
    nap: null,
    napExclusions: [],
    napSignature: null,
    napNewMismatch: false,
    gbpDraft: null,
    gbpHistory: [],
    replyHistory: [],
    ...overrides,
  };
}

function makeService(overrides = {}) {
  const state = localState(overrides.state);
  const calls = [];
  const errors = [];
  const publications = [];
  let saves = 0;
  const service = createLocalAutopilotService({
    state,
    save: () => { saves += 1; },
    business: {
      name: 'Best Day Fitness',
      streetAddress: '6619 1st Avenue South',
      addressLocality: 'St. Petersburg',
      addressRegion: 'FL',
      postalCode: '33707',
      telephone: '(727) 555-0100',
    },
    getHistory: () => [],
    brandPrompt: full => `Brand voice full=${full}`,
    geminiGenerate: async request => {
      calls.push(request);
      return request.contents.startsWith('Find the current')
        ? { text: '{"listings":[]}' }
        : { text: ' Ready to post. ' };
    },
    model: 'gemini-test',
    parseJson: JSON.parse,
    daysSince: () => 10,
    isGbpConfigured: () => false,
    publishGbp: async text => ({ posted: true, name: `locations/1/posts/${text.length}` }),
    recordPublication: (draft, receipt) => {
      publications.push({ draft, receipt });
      draft.posted = true;
      draft.publicationSource = 'google-api';
      draft.googlePostName = receipt.name;
    },
    env: { GEMINI_API_KEY: 'configured' },
    nowIso: () => '2026-09-09T15:00:00.000Z',
    logger: { error(...args) { errors.push(args); } },
    ...overrides,
    state,
  });
  return { service, state, calls, errors, publications, saves: () => saves };
}

test('local NAP scan preserves grounded request, canonical matching, and missing-key behavior', async () => {
  const { service, calls } = makeService({
    geminiGenerate: async request => {
      calls.push(request);
      return { text: JSON.stringify({ listings: [
        { platform: 'Google', name: 'Best Day Fitness', address: '6619 1st Avenue South, St. Petersburg, FL 33707', phone: '727-555-0100' },
        { platform: 'Yelp', name: 'Best Day Wellness', address: 'Different address', phone: '727-555-9999' },
      ] }) };
    },
  });
  const result = await service.scanNap();
  assert.deepEqual(result.canonical, {
    name: 'Best Day Fitness',
    address: '6619 1st Avenue South, St. Petersburg, FL 33707',
    phone: '(727) 555-0100',
  });
  assert.equal(result.mismatchCount, 1);
  assert.deepEqual(result.listings.map(item => [item.platform, item.nameMatch, item.addrMatch, item.phoneMatch]), [
    ['Google', true, true, true],
    ['Yelp', false, false, false],
  ]);
  assert.equal(result.checkedAt, '2026-09-09T15:00:00.000Z');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-test');
  assert.deepEqual(calls[0].config, { tools: [{ googleSearch: {} }] });
  assert.match(calls[0].contents, /major platform \(Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB/);

  const missing = makeService({ env: {} });
  assert.equal(await missing.service.scanNap(), null);
  assert.equal(missing.calls.length, 0);
});

test('Google post drafting preserves recent-article priority and rotating fallback topics', async () => {
  const { service, calls } = makeService({
    getHistory: () => [{ title: 'Stronger After 50', keyword: 'strength training over 50' }],
  });
  const articleDraft = await service.draftGbp();
  assert.equal(articleDraft.text, 'Ready to post.');
  assert.equal(articleDraft.topic, 'Stronger After 50');
  assert.equal(articleDraft.postType, 'update');
  assert.match(calls[0].contents, /our recent article "Stronger After 50" \(topic: strength training over 50\)/);
  assert.match(calls[0].contents, /^Brand voice full=true\n/);
  assert.equal(calls[0].config, undefined);

  const fallback = makeService({
    state: { gbpHistory: [{}, {}, {}] },
    getHistory: () => [],
  });
  const fallbackDraft = await fallback.service.draftGbp();
  assert.equal(fallbackDraft.topic, GBP_TOPIC_SEED[3]);
  assert.match(fallback.calls[0].contents, new RegExp(GBP_TOPIC_SEED[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('local autopilot preserves exclusions, history bounds, verified publishing, and one final save', async () => {
  const priorHistory = Array.from({ length: 8 }, (_, index) => ({ text: `old-${index}` }));
  const oldDraft = { text: 'previous draft', topic: 'previous', isNew: true };
  const { service, state, calls, publications, saves } = makeService({
    state: {
      napExclusions: [{ platform: 'YogaFinder' }],
      napSignature: 'old-signature',
      gbpDraft: oldDraft,
      gbpHistory: priorHistory,
    },
    isGbpConfigured: () => true,
    geminiGenerate: async request => {
      calls.push(request);
      if (request.contents.startsWith('Find the current')) {
        return { text: JSON.stringify({ listings: [
          { platform: 'YogaFinder', name: 'Wrong', address: 'Wrong', phone: 'Wrong' },
          { platform: 'Yelp', name: 'Wrong', address: 'Wrong', phone: 'Wrong' },
        ] }) };
      }
      return { text: 'Fresh local post' };
    },
  });

  await service.maybeRun(true);
  assert.equal(service.running, false);
  assert.equal(saves(), 1);
  assert.equal(calls.length, 2);
  assert.equal(state.nap.mismatchCount, 2);
  assert.equal(state.napNewMismatch, true);
  assert.equal(state.napSignature, 'Yelp:falsefalsefalse');
  assert.equal(state.gbpHistory.length, 8);
  assert.deepEqual(state.gbpHistory[0], { ...oldDraft, isNew: false });
  assert.equal(state.gbpDraft.text, 'Fresh local post');
  assert.equal(state.gbpDraft.isNew, true);
  assert.equal(state.gbpDraft.posted, true);
  assert.equal(state.gbpDraft.publicationSource, 'google-api');
  assert.equal(publications.length, 1);
  assert.equal(publications[0].receipt.name, 'locations/1/posts/16');
  assert.equal(state.lastNapRun, '2026-09-09T15:00:00.000Z');
  assert.equal(state.lastGbpRun, '2026-09-09T15:00:00.000Z');
});

test('local autopilot preserves due guards, single-run overlap, and best-effort provider failures', async () => {
  for (const candidate of [
    makeService({ state: { enabled: false } }),
    makeService({ env: {} }),
    makeService({ daysSince: () => 2 }),
  ]) {
    await candidate.service.maybeRun(false);
    assert.equal(candidate.calls.length, 0);
    assert.equal(candidate.saves(), 0);
  }

  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const overlap = makeService({
    geminiGenerate: async request => {
      overlap.calls.push(request);
      if (request.contents.startsWith('Find the current')) await pending;
      return request.contents.startsWith('Find the current') ? { text: '{"listings":[]}' } : { text: 'Post' };
    },
  });
  const first = overlap.service.maybeRun(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlap.service.running, true);
  assert.equal(overlap.calls.length, 1);
  await overlap.service.maybeRun(true);
  assert.equal(overlap.calls.length, 1);
  release();
  await first;
  assert.equal(overlap.calls.length, 2);
  assert.equal(overlap.saves(), 1);

  const failures = makeService({
    geminiGenerate: async request => { throw new Error(request.contents.startsWith('Find the current') ? 'nap failure' : 'draft failure'); },
  });
  await failures.service.maybeRun(true);
  assert.equal(failures.service.running, false);
  assert.equal(failures.saves(), 1);
  assert.deepEqual(failures.errors, [
    ['[Local Autopilot] NAP scan failed:', 'nap failure'],
    ['[Local Autopilot] GBP draft failed:', 'draft failure'],
  ]);
});

test('local status and signatures retain raw evidence while reporting active mismatches', () => {
  const nap = {
    checkedAt: '2026-09-09T15:00:00.000Z',
    listings: [
      { platform: 'YogaFinder', nameMatch: false, addrMatch: false, phoneMatch: false },
      { platform: 'Yelp', nameMatch: true, addrMatch: false, phoneMatch: true },
    ],
    mismatchCount: 2,
  };
  assert.equal(napSignatureOf(nap), 'Yelp:truefalsetrue|YogaFinder:falsefalsefalse');
  const { service } = makeService({
    state: {
      nap,
      napExclusions: [{ platform: 'YogaFinder' }],
      napNewMismatch: true,
      gbpDraft: { text: 'Draft' },
      gbpHistory: [{ text: 'Old' }],
      replyHistory: [{ review: 'Great' }],
    },
  });
  assert.deepEqual(service.status(), {
    success: true,
    enabled: true,
    busy: false,
    napIntervalDays: 7,
    gbpIntervalDays: 7,
    lastNapRun: null,
    lastGbpRun: null,
    nap: {
      ...nap,
      listings: [nap.listings[1]],
      excludedListings: [nap.listings[0]],
      mismatchCount: 1,
      unverifiedCount: 0,
    },
    napExclusions: [{ platform: 'YogaFinder' }],
    napNewMismatch: true,
    gbpDraft: { text: 'Draft' },
    gbpHistory: [{ text: 'Old' }],
    replyHistory: [{ review: 'Great' }],
    hasKey: true,
  });
});
