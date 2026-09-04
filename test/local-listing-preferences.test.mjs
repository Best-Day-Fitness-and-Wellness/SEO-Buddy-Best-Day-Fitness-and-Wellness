import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { effectiveNap, platformKey, registerLocalListingRoutes } = require('../lib/local-listing-preferences');
const { resolveAssistantAction, assistantSystemPrompt } = require('../lib/assistant-routes');
const nap = { checkedAt: '2026-08-31', listings: [
  { platform: 'YogaFinder', nameMatch: true, addrMatch: false, phoneMatch: false },
  { platform: 'Google', nameMatch: true, addrMatch: true, phoneMatch: true },
  { platform: 'Apple Maps', nameMatch: null, addrMatch: null, phoneMatch: null },
], mismatchCount: 1 };
function harness(saveResult = true) {
  const state = { nap: structuredClone(nap), napExclusions: [], enabled: true, gbpDraft: { text: 'Keep this' } };
  const routes = new Map(); let saved;
  const requireOwner = () => {};
  registerLocalListingRoutes({ post: (path, ...handlers) => routes.set(path, handlers) }, { requireOwner, state, save: () => { if (saveResult instanceof Error) throw saveResult; if (saveResult) saved = JSON.stringify(state); return saveResult; } });
  return { state, requireOwner, routes, persisted: () => JSON.parse(saved), run(body) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    routes.get('/api/local-listing-preference').at(-1)({ body }, res); return res;
  } };
}

test('excluding a listing retains raw evidence and applies to future scans and restart', () => {
  const h = harness();
  assert.equal(h.routes.get('/api/local-listing-preference')[0], h.requireOwner);
  const result = h.run({ platform: 'Yoga Finder', excluded: true, reason: 'We do not offer yoga' });
  assert.equal(result.body.success, true);
  assert.equal(result.body.nap.mismatchCount, 0);
  assert.equal(result.body.nap.unverifiedCount, 1);
  assert.equal(result.body.nap.excludedListings[0].platform, 'YogaFinder');
  assert.deepEqual(h.state.nap, nap);
  assert.equal(h.state.enabled, true);
  assert.equal(h.state.gbpDraft.text, 'Keep this');
  const restarted = h.persisted();
  assert.equal(effectiveNap(restarted.nap, restarted.napExclusions).mismatchCount, 0);
  const nextScan = structuredClone(nap); nextScan.listings[0].platform = 'https://www.yogafinder.com/';
  assert.equal(effectiveNap(nextScan, restarted.napExclusions).mismatchCount, 0);
  h.run({ platform: 'YogaFinder', excluded: true });
  assert.equal(h.state.napExclusions.length, 1);
  const restored = h.run({ platform: 'YogaFinder', excluded: false });
  assert.equal(restored.body.nap.mismatchCount, 1);
  assert.deepEqual(h.state.napExclusions, []);
});

test('unknown platforms, invalid inputs, and failed persistence never alter preferences', () => {
  const h = harness();
  for (const body of [{ platform: 'unknown', excluded: true }, { platform: 'YogaFinder', excluded: 'true' }, { platform: {}, excluded: true }, { platform: 'YogaFinder', excluded: true, reason: {} }]) {
    assert.ok(h.run(body).statusCode >= 400);
    assert.deepEqual(h.state.napExclusions, []);
  }
  for (const failure of [false, new Error('disk full')]) {
    const failed = harness(failure);
    assert.equal(failed.run({ platform: 'YogaFinder', excluded: true }).statusCode, 503);
    assert.deepEqual(failed.state.napExclusions, []);
    assert.deepEqual(failed.state.nap, nap);
  }
  assert.notEqual(platformKey('YogaFinder'), platformKey('YogaFinder unrelated site'));
});

test('assistant proposes only recorded listing changes with explicit confirmation and no external deletion', () => {
  const context = { business: { name: 'Best Day Fitness' }, localListings: { listings: nap.listings } };
  const action = resolveAssistantAction('set_local_listing_relevance', { platform: 'yogafinder.com', excluded: true }, context);
  assert.equal(action.endpoint, '/api/local-listing-preference');
  assert.equal(action.confirmLabel, 'Mark not relevant');
  assert.deepEqual(action.body, { platform: 'YogaFinder', excluded: true, reason: 'Owner marked not relevant' });
  assert.match(action.note, /No external listing is edited or deleted/);
  assert.equal(resolveAssistantAction('set_local_listing_relevance', { platform: 'Invented', excluded: true }, context), null);
  assert.equal(resolveAssistantAction('set_local_listing_relevance', { platform: 'YogaFinder', excluded: 'yes' }, context), null);
  const prompt = assistantSystemPrompt(context);
  assert.match(prompt, /NOT recommendations to join a directory/);
  assert.match(prompt, /Tools → Local presence/);
});
