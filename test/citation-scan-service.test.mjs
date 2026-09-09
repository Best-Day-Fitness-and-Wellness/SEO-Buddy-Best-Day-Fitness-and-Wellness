import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCitationScanService } = require('../lib/citation-scan-service.js');

function grounded(...titles) {
  return {
    candidates: [{
      groundingMetadata: {
        groundingChunks: titles.map(title => ({ web: { title } })),
      },
    }],
  };
}

function makeService(overrides = {}) {
  const state = {
    autoEnabled: true,
    intervalDays: 7,
    lastScanned: '2026-08-01T00:00:00Z',
    queries: ['senior fitness'],
    targets: [],
    statuses: {},
    newDomains: [],
    excludedCompetitorDomains: [],
    ...(overrides.state || {}),
  };
  const calls = [];
  const errors = [];
  let saves = 0;
  const service = createCitationScanService({
    state,
    save: () => { saves += 1; },
    business: { name: 'Best Day Fitness' },
    geminiGenerate: async request => {
      calls.push(request);
      return request.contents.startsWith('A person') ? grounded() : { text: '{}' };
    },
    model: 'gemini-test',
    parseJson: JSON.parse,
    daysSince: () => 10,
    env: { GEMINI_API_KEY: 'configured' },
    nowIso: () => '2026-09-09T14:00:00.000Z',
    logger: { error(...args) { errors.push(args); } },
    ...overrides,
    state,
  });
  return { service, state, calls, errors, saves: () => saves };
}

test('citation discovery preserves grounded requests, ranking, remembered competitors, and classification', async () => {
  const parseCalls = [];
  const { service, calls } = makeService({
    state: { excludedCompetitorDomains: ['rival.com'] },
    geminiGenerate: async request => {
      calls.push(request);
      if (request.contents.includes('asks: "senior fitness"')) {
        return grounded('BestDayFitness.com', 'Directory.com', 'Directory.com', 'Rival.com');
      }
      if (request.contents.includes('asks: "mobility coach"')) {
        return grounded('Directory.com', 'News.com');
      }
      if (request.contents.includes('"directory.com"')) {
        return { text: '{"listed":false,"type":"directory","note":"Local directory"}' };
      }
      return { text: '{}' };
    },
    parseJson: text => { parseCalls.push(text); return JSON.parse(text); },
  });

  const result = await service.discoverTargets(['senior fitness', 'mobility coach']);
  assert.equal(result.brandCited, true);
  assert.equal(result.sourcesFound, 3);
  assert.deepEqual(result.targets, [
    { domain: 'directory.com', citedFor: 2, queries: ['senior fitness', 'mobility coach'], type: 'directory', listed: false, note: 'Local directory' },
    { domain: 'rival.com', citedFor: 1, queries: ['senior fitness'], type: 'competitor', listed: null, note: 'Previously identified as a competitor-owned site.' },
    { domain: 'news.com', citedFor: 1, queries: ['mobility coach'], type: 'other', listed: null, note: '' },
  ]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.model === 'gemini-test'));
  assert.ok(calls.every(call => JSON.stringify(call.config) === JSON.stringify({ tools: [{ googleSearch: {} }] })));
  assert.equal(calls.some(call => call.contents.includes('On the website "rival.com"')), false);
  assert.equal(parseCalls.length, 2);
  assert.deepEqual(service.filterTargets(result.targets).map(target => target.domain), ['directory.com', 'news.com']);
  assert.equal(service.isExcludedDomain('www.rival.com'), true);
});

test('citation scan preserves source evidence, active statuses, competitor memory, and new-source rules', async () => {
  const { service, state, calls, saves } = makeService({
    state: {
      targets: [
        { domain: 'old.example', type: 'directory' },
        { domain: 'gone.example', type: 'news' },
      ],
      statuses: {
        'old.example': { status: 'live', updatedAt: 'old' },
        'gone.example': { status: 'pitched', updatedAt: 'gone' },
      },
      excludedCompetitorDomains: ['remembered.example'],
    },
    geminiGenerate: async request => {
      calls.push(request);
      if (request.contents.startsWith('A person')) {
        return grounded('Old.example', 'New.example', 'Competitor.example');
      }
      if (request.contents.includes('"old.example"')) return { text: '{"listed":true,"type":"directory","note":"Listed"}' };
      if (request.contents.includes('"new.example"')) return { text: '{"listed":false,"type":"news","note":"Local news"}' };
      return { text: '{"listed":false,"type":"competitor","note":"Competing gym"}' };
    },
  });

  await service.performScan(['senior fitness']);
  assert.equal(saves(), 1);
  assert.equal(state.brandCited, false);
  assert.equal(state.sourcesFound, 3);
  assert.equal(state.totalQueries, 1);
  assert.deepEqual(state.queries, ['senior fitness']);
  assert.equal(state.lastScanned, '2026-09-09T14:00:00.000Z');
  assert.deepEqual(state.statuses, { 'old.example': { status: 'live', updatedAt: 'old' } });
  assert.deepEqual(state.newDomains, ['new.example']);
  assert.deepEqual(state.excludedCompetitorDomains, ['remembered.example', 'competitor.example']);
  assert.deepEqual(state.targets.map(target => target.domain), ['old.example', 'new.example', 'competitor.example']);
});

test('weekly citation guard preserves configuration, due-date, query bounds, and overlap behavior', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const queries = Array.from({ length: 10 }, (_, index) => ` query ${index} `);
  const { service, state, calls, saves } = makeService({
    state: { queries },
    geminiGenerate: async request => {
      calls.push(request);
      await pending;
      return grounded();
    },
  });

  const first = service.maybeRun(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.running, true);
  assert.equal(calls.length, 8);
  await service.maybeRun(true);
  assert.equal(calls.length, 8);
  release();
  await first;
  assert.equal(service.running, false);
  assert.equal(saves(), 1);
  assert.deepEqual(state.queries, queries.slice(0, 8).map(query => query.trim()));

  const disabled = makeService({ state: { autoEnabled: false } });
  await disabled.service.maybeRun(false);
  assert.equal(disabled.calls.length, 0);
  const missingKey = makeService({ env: {} });
  await missingKey.service.maybeRun(true);
  assert.equal(missingKey.calls.length, 0);
  const notDue = makeService({ daysSince: () => 2 });
  await notDue.service.maybeRun(false);
  assert.equal(notDue.calls.length, 0);
});

test('citation provider failures retain the established best-effort results and scheduler recovery', async () => {
  const { service, errors } = makeService({
    geminiGenerate: async request => {
      if (request.contents.startsWith('A person')) throw new Error('query failed');
      throw new Error('classification failed');
    },
  });
  assert.deepEqual(await service.discoverTargets(['senior fitness']), {
    brandCited: false,
    sourcesFound: 0,
    targets: [],
  });
  assert.deepEqual(errors[0], ['[Citation Scan] query failed "senior fitness":', 'query failed']);

  const scheduled = makeService({
    geminiGenerate: async () => { throw new Error('scheduled failure'); },
    parseJson: () => { throw new Error('not reached'); },
  });
  await scheduled.service.maybeRun(true);
  assert.equal(scheduled.service.running, false);
  assert.equal(scheduled.saves(), 1);
});
