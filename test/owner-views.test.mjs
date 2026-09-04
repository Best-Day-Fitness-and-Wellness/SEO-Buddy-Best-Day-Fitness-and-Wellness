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
      const value = await data[url];
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const snapshot = (h, ids) => ids.map(id => h.html(id));
const resultIds = ['ow-find', 'ow-find-note', 'ow-rev', 'ow-worth'];
const businessIds = ['ow-basics', 'ow-voice', 'ow-conn'];
const businessData = {
  '/api/business-profile': { profile: { name: 'Current business' } },
  '/api/brand-profile': { brand: { tagline: 'Current voice' }, reviewedAt: '2026-09-04T12:00:00Z' },
  '/api/deploy-readiness': { checks: [{ key: 'gsc', ok: true }, { key: 'ghl', ok: true }, { key: 'gemini', ok: true }] },
};

test('late Results responses cannot replace the newest results or its failure state', async () => {
  for (const latestFails of [false, true]) {
    for (const oldValue of [resultsData['/api/performance'], new Error('old timeout')]) {
      const old = deferred();
      const data = { ...resultsData, '/api/performance': old.promise, '/api/reviews-stats': { inventory: { published: 1, avgRating: 2 }, score: 10 } };
      const h = harness(data);
      const first = h.window.loadOwnerResults();
      await flush();
      Object.assign(data, resultsData);
      data['/api/performance'] = latestFails ? new Error('latest unavailable') : { current: { clicks: 99, impressions: 9000, avgPosition: 2 } };
      await h.window.loadOwnerResults();
      const current = snapshot(h, resultIds);
      assert.match(h.html(latestFails ? 'ow-find-note' : 'ow-find'), latestFails ? /couldn’t load your search numbers/ : /99/);
      old.resolve(oldValue);
      await first;
      assert.deepEqual(snapshot(h, resultIds), current);
    }
  }
});

test('late Results connection fallback cannot overwrite a successful retry', async () => {
  const old = deferred();
  const data = { ...resultsData, '/api/performance': new Error('first failed'), '/api/deploy-readiness': old.promise };
  const h = harness(data);
  const first = h.window.loadOwnerResults();
  await flush();
  assert.ok(h.requests.some(item => item.url === '/api/deploy-readiness'));
  Object.assign(data, resultsData);
  await h.window.loadOwnerResults();
  const current = snapshot(h, resultIds);
  old.resolve({ checks: [{ key: 'gsc', ok: false }] });
  await first;
  assert.deepEqual(snapshot(h, resultIds), current);
});

test('late Business responses cannot undo newer profile, voice, or connection evidence', async () => {
  for (const latestFails of [false, true]) {
    for (const oldValue of [{ profile: { name: 'Old business' } }, new Error('old timeout')]) {
      const old = deferred();
      const data = { ...businessData, '/api/business-profile': old.promise, '/api/brand-profile': { brand: { tagline: 'Old voice' } }, '/api/deploy-readiness': { checks: [{ key: 'gsc', ok: false }] } };
      const h = harness(data);
      const first = h.window.loadOwnerBusiness();
      await flush();
      Object.assign(data, businessData);
      if (latestFails) for (const path of Object.keys(businessData)) data[path] = new Error('latest unavailable');
      await h.window.loadOwnerBusiness();
      const current = snapshot(h, businessIds);
      assert.match(h.html('ow-basics'), latestFails ? /could not be loaded/ : /Current business/);
      old.resolve(oldValue);
      await first;
      assert.deepEqual(snapshot(h, businessIds), current);
    }
  }
});

test('Results and Business refresh generations stay independent', async () => {
  const old = deferred();
  const h = harness({ ...resultsData, ...businessData, '/api/performance': old.promise });
  const results = h.window.loadOwnerResults();
  await h.window.loadOwnerBusiness();
  old.resolve(resultsData['/api/performance']);
  await results;
  assert.match(h.html('ow-find'), /Visits from Google/);
  assert.match(h.html('ow-basics'), /Current business/);
});

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

test('search status requires explicit measured evidence, not configuration or malformed data', () => {
  const { healthScoreDataMode: mode } = harness().core;
  const score = (measured, demo = false) => ({ pillars: [{ key: 'found', measured }], runtime: { mockIntegrationsAllowed: demo } });
  assert.equal(mode(score(true)), 'live');
  assert.equal(mode(score(false, true)), 'demo');
  for (const value of [null, {}, { pillars: {} }, { pillars: [null] }, score('true'), score(undefined, true), score(false), score(false, 'true'), { ...score(true), success: false }]) {
    assert.equal(mode(value), 'unavailable');
  }
});

test('shared health checks coalesce concurrent readers, report failure, and allow fresh recovery', async () => {
  const data = { '/api/health-score': { pillars: [{ key: 'found', measured: true }] } };
  const h = harness(data), modes = [];
  h.window.setDataMode = mode => modes.push(mode);
  const first = h.core.readHealthScore();
  assert.equal(h.core.readHealthScore(), first);
  assert.equal(h.requests.length, 1);
  await first;
  assert.deepEqual(modes, ['live']);
  data['/api/health-score'] = new Error('timeout');
  await assert.rejects(h.core.readHealthScore(), /timeout/);
  assert.deepEqual(modes, ['live', 'unavailable']);
  data['/api/health-score'] = { pillars: [{ key: 'found', measured: false }], runtime: { mockIntegrationsAllowed: true } };
  await h.core.readHealthScore();
  assert.deepEqual(modes, ['live', 'unavailable', 'demo']);
  assert.equal(h.requests.length, 3);
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
  assert.doesNotMatch(h.html('ow-find-note'), /data-settings-section/);
});

test('confirmed missing Search Console offers connection settings rather than a dead-end instruction', async () => {
  const h = harness({ '/api/deploy-readiness': { checks: [{ key: 'gsc', ok: false }] } });
  await h.window.loadOwnerResults();
  assert.match(h.html('ow-find-note'), /data-settings-section="connections"/);
  assert.match(h.html('ow-find-note'), /Review connection settings/);
  assert.equal(h.navigations.length, 0);
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
