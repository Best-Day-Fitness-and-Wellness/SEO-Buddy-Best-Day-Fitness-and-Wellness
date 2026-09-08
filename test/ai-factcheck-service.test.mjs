import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFactTruth, createAiFactCheckService } = require('../lib/ai-factcheck-service.js');

const ENGINES = [
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'openai', label: 'ChatGPT' },
  { id: 'perplexity', label: 'Perplexity' },
];

function makeService(overrides = {}) {
  const state = overrides.state || { latest: null, updatedAt: null };
  let saves = 0;
  const service = createAiFactCheckService({
    state,
    save: () => { saves += 1; },
    engines: ENGINES,
    engineConfigured: () => false,
    askEngine: async () => ({ ok: false, error: 'not called' }),
    meterUsage: () => {},
    getTruth: () => ({ name: 'Best Day Fitness', city: 'St. Petersburg', region: 'FL' }),
    geminiGenerate: async () => ({ text: '{"issues":[],"summary":"Accurate."}' }),
    geminiModel: 'gemini-test',
    parseJson: JSON.parse,
    env: {},
    nowIso: () => '2026-09-08T15:00:00.000Z',
    ...overrides,
    state,
  });
  return { service, state, saves: () => saves };
}

test('FactCheck truth uses Listing Kit values and preserves established fallbacks', () => {
  const business = {
    name: 'Best Day Fitness',
    streetAddress: '6619 1st Avenue South',
    addressLocality: 'St. Petersburg',
    addressRegion: 'FL',
    postalCode: '33707',
    telephone: '727-555-0100',
  };
  assert.deepEqual(buildFactTruth({
    business,
    listingKit: () => ({
      addressOneLine: 'Canonical address',
      phone: '727-555-0199',
      website: 'https://bestdayfitness.com',
      categories: ['Personal trainer', 'Fitness center'],
    }),
    siteDomain: () => 'unused.example',
  }), {
    name: 'Best Day Fitness',
    city: 'St. Petersburg',
    region: 'FL',
    address: 'Canonical address',
    phone: '727-555-0199',
    website: 'https://bestdayfitness.com',
    services: 'Personal trainer, Fitness center',
  });

  const fallback = buildFactTruth({ business: { name: 'Brand', telephone: '123' }, listingKit: () => ({}), siteDomain: () => 'brand.example' });
  assert.equal(fallback.city, 'St. Petersburg');
  assert.equal(fallback.region, 'FL');
  assert.equal(fallback.website, 'https://brand.example');
  assert.match(fallback.services, /senior fitness/);
});

test('FactCheck analyzer preserves missing-key behavior and normalizes model output', async () => {
  const withoutKey = makeService();
  assert.deepEqual(await withoutKey.service.analyzeAnswer('answer', {}), {
    issues: [],
    summary: 'Add a Gemini key to analyze answers.',
  });

  const calls = [];
  const { service } = makeService({
    env: { GEMINI_API_KEY: 'secret' },
    geminiGenerate: async request => {
      calls.push(request);
      return { text: JSON.stringify({
        issues: [
          { field: 'phone', aiClaim: 123, correct: false, truth: 456, note: null },
          { field: '', aiClaim: 'A claim', truth: null },
          { field: 'address' },
        ],
        summary: 42,
      }) };
    },
  });
  assert.deepEqual(await service.analyzeAnswer('answer', { phone: '456' }), {
    issues: [
      { field: 'phone', aiClaim: '123', correct: false, truth: '456', note: '' },
      { field: 'other', aiClaim: 'A claim', correct: true, truth: '', note: '' },
    ],
    summary: '42',
  });
  assert.equal(calls[0].model, 'gemini-test');
  assert.match(calls[0].contents, /GROUND TRUTH/);
});

test('FactCheck run preserves engine results, scoring, metering, and persistence', async () => {
  const usage = [];
  let saves = 0;
  const state = { latest: null, updatedAt: null };
  const answer = 'A'.repeat(405);
  const sources = Array.from({ length: 7 }, (_, index) => ({ title: `Source ${index}`, uri: `https://source${index}.example` }));
  const { service } = makeService({
    state,
    save: () => { saves += 1; },
    engineConfigured: () => true,
    askEngine: async engine => engine === 'perplexity'
      ? { ok: false, error: 'temporarily unavailable' }
      : { ok: true, answer, sources },
    meterUsage: engine => usage.push(engine),
    env: { GEMINI_API_KEY: 'secret' },
    geminiGenerate: async () => ({ text: JSON.stringify({
      issues: [
        { field: 'city', aiClaim: 'Tampa', correct: false, truth: 'St. Petersburg', note: 'Wrong city' },
        { field: 'services', aiClaim: 'Personal training', correct: true, truth: 'Personal training', note: '' },
      ],
      summary: 'One incorrect claim.',
    }) }),
  });

  const { snapshot } = await service.run();
  assert.equal(snapshot.ranAt, '2026-09-08T15:00:00.000Z');
  assert.deepEqual(snapshot.engines, ['google', 'openai', 'perplexity']);
  assert.equal(snapshot.totalWrong, 2);
  assert.deepEqual(snapshot.results.map(result => [result.engine, result.accuracy, result.wrong]), [
    ['google', 50, 1],
    ['openai', 50, 1],
    ['perplexity', null, 0],
  ]);
  assert.equal(snapshot.results[0].snippet.length, 398);
  assert.equal(snapshot.results[0].sources.length, 5);
  assert.deepEqual(usage, ['openai']);
  assert.equal(state.latest, snapshot);
  assert.equal(state.updatedAt, snapshot.ranAt);
  assert.equal(saves, 1);
});

test('FactCheck does no work or persistence when no engine is configured', async () => {
  const { service, state, saves } = makeService();
  assert.deepEqual(await service.run(), {
    error: 'No AI engines are configured. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY).',
  });
  assert.equal(state.latest, null);
  assert.equal(saves(), 0);
});
