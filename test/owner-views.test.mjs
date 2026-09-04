import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('../public/modules/core.js', import.meta.url), 'utf8');
const viewsSource = readFileSync(new URL('../public/modules/owner-views.js', import.meta.url), 'utf8');
const resultsData = {
  '/api/performance': { current: { clicks: 10, impressions: 1000, avgPosition: 4 }, previous: { clicks: 12, impressions: 900, avgPosition: 5 } },
  '/api/reviews-stats': { inventory: { published: 20, avgRating: 4.9, byPlatform: { Google: 20 } }, score: 90, problems: 1 },
  '/api/health-score': { overall: 69, delta: -1 },
  '/api/deploy-readiness': { checks: [{ key: 'gsc', ok: true }] },
};

function harness(data = {}) {
  const elements = new Map(['ow-find', 'ow-find-note', 'ow-rev', 'ow-worth', 'ow-basics', 'ow-voice', 'ow-conn'].map(id => [id, { innerHTML: '' }]));
  const listeners = new Map(), requests = [], navigations = [];
  const window = { switchTab: tab => navigations.push(tab) };
  const document = {
    getElementById: id => elements.get(id),
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn]),
  };
  const context = vm.createContext({
    window, document, localStorage: { getItem: () => null },
    AbortSignal: { timeout: duration => ({ duration }) },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const value = data[url];
      if (value instanceof Error) throw value;
      return { ok: value !== undefined, json: async () => value };
    },
  });
  vm.runInContext(coreSource, context);
  vm.runInContext(viewsSource, context);
  return {
    window, elements, requests, navigations, core: window.SeoBuddyCore,
    html: id => elements.get(id).innerHTML,
    async emit(name, selector) {
      for (const fn of listeners.get(name) || []) fn({ target: { closest: query => query === selector } });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('shared views initialize without legacy controls, provider actions, or eager reads', () => {
  const h = harness();
  assert.equal(h.requests.length, 0);
  assert.equal(typeof h.window.loadOwnerResults, 'function');
  assert.equal(typeof h.window.loadOwnerBusiness, 'function');
  assert.equal(h.window.setOwnerMode, undefined);
  assert.equal(h.window.loadOwnerToday, undefined);
});

test('shared reader preserves its timeout, JSON validation, and upstream errors', async () => {
  const failure = new Error('offline');
  const h = harness({ '/ok': { success: true }, '/null': null, '/failed': { success: false }, '/offline': failure });
  assert.deepEqual(await h.core.readCheckedJson('/ok'), { success: true });
  assert.equal(h.requests[0].options.signal.duration, 15000);
  assert.equal(h.requests[0].options.method, undefined);
  await assert.rejects(h.core.readCheckedJson('/missing'), /could not complete this check/);
  await assert.rejects(h.core.readCheckedJson('/null'), /no verified data/);
  await assert.rejects(h.core.readCheckedJson('/failed'), /no verified data/);
  await assert.rejects(h.core.readCheckedJson('/offline'), error => error === failure);
});

test('Results retains comparisons, score, reviews, and opportunity-not-revenue language', async () => {
  const h = harness(resultsData);
  await h.window.loadOwnerResults();
  assert.deepEqual(h.requests.map(item => item.url).sort(), ['/api/health-score', '/api/performance', '/api/reviews-stats']);
  assert.match(h.html('ow-find'), /Visits from Google/);
  assert.match(h.html('ow-find'), /69<small> \/ 100/);
  assert.match(h.html('ow-find'), /lower is better/);
  assert.match(h.html('ow-find-note'), /went the wrong way/);
  assert.match(h.html('ow-rev'), /20 Google/);
  assert.match(h.html('ow-worth'), /\$279/);
  assert.match(h.html('ow-worth'), /Not measured revenue/);
});

test('a missing review rating is labelled without printing null or inventing zero', async () => {
  for (const avgRating of [null, undefined]) {
    const h = harness({ ...resultsData, '/api/reviews-stats': { inventory: { published: 0, avgRating }, score: 30 } });
    await h.window.loadOwnerResults();
    assert.match(h.html('ow-rev'), /No rating recorded yet/);
    assert.doesNotMatch(h.html('ow-rev'), /null|undefined/);
    assert.match(h.html('ow-rev'), /Average rating there<\/div><div class="v">—/);
  }
});

test('unavailable Results does not claim a disconnection, zero reviews, or revenue', async () => {
  const h = harness();
  await h.window.loadOwnerResults();
  assert.match(h.html('ow-find-note'), /Search figures and connection status are unavailable/);
  assert.match(h.html('ow-rev'), /Review figures are unavailable/);
  assert.match(h.html('ow-worth'), /need real visit numbers/);
  assert.doesNotMatch(h.html('ow-rev'), /No reviews site connected/);
});

test('Business keeps escaped details and brand-owned review evidence', async () => {
  const h = harness({
    '/api/business-profile': { profile: { name: '<b>Business</b>', phone: '123', website: 'https://example.com' } },
    '/api/brand-profile': { brand: { tagline: '<script>bad</script>', neverUse: ['<unsafe>'], usePhrases: ['"safe"'] }, reviewedAt: '2026-09-03T12:00:00Z' },
    '/api/deploy-readiness': { checks: [{ key: 'brand', ok: false, durable: false }, { key: 'gsc', ok: true }] },
  });
  await h.window.loadOwnerBusiness();
  assert.match(h.html('ow-basics'), /&lt;b&gt;Business&lt;\/b&gt;/);
  assert.match(h.html('ow-voice'), /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(h.html('ow-voice'), /Reviewed/);
  assert.match(h.html('ow-voice'), /won’t survive the next update/);
  assert.match(h.html('ow-conn'), /Posts copied by hand/);
});

test('missing Business data remains an unavailable check, not default verified facts', async () => {
  const h = harness();
  await h.window.loadOwnerBusiness();
  assert.match(h.html('ow-basics'), /could not be loaded/);
  assert.match(h.html('ow-voice'), /Couldn’t load your brand voice/);
  assert.match(h.html('ow-conn'), /Connection status is unavailable/);
});

test('shared retry and readiness events make one set of reads without loading legacy Today', async () => {
  const h = harness(resultsData);
  await h.emit('click', '[data-ow-retry]');
  assert.equal(h.requests.length, 3);
  h.requests.length = 0;
  await h.emit('click', '[data-ow-retry-business]');
  assert.equal(h.requests.length, 3);
  h.requests.length = 0;
  await h.emit('seo:readiness-changed');
  assert.deepEqual(h.requests.map(item => item.url).sort(), ['/api/brand-profile', '/api/business-profile', '/api/deploy-readiness']);
  await h.emit('click', '[data-ow-brand]');
  assert.deepEqual(h.navigations, ['brand-tab']);
});
