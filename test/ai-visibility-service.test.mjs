import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_AI_ENGINES,
  DEFAULT_VIS_PROMPTS,
  createAiVisibilityService,
  normalizeName,
  sentimentToScore,
  visibilityPrompt,
} = require('../lib/ai-visibility-service.js');

function serviceFixture(overrides = {}) {
  const state = overrides.state || { prompts: ['query one'], snapshots: [], updatedAt: null, lastRun: null };
  const fetchCalls = [];
  let saves = 0;
  const service = createAiVisibilityService({
    state,
    save: () => { saves += 1; },
    geminiGenerate: async request => ({ text: request.config ? 'Best Day Fitness' : '{"mentioned":true,"sentiment":"positive","competitors":[]}' }),
    geminiModel: 'gemini-test',
    providerRuntime: {
      fetch: async (...args) => {
        fetchCalls.push(args);
        return { json: async () => ({ choices: [{ message: { content: ' provider answer ' } }], citations: ['https://source.example'] }) };
      },
    },
    parseJson: JSON.parse,
    brandName: () => 'Best Day Fitness',
    meterUsage: () => {},
    env: {},
    nowIso: () => '2026-09-08T14:00:00.000Z',
    ...overrides,
    state,
  });
  return { service, state, fetchCalls, saves: () => saves };
}

test('AI visibility helpers preserve the public engine catalog and scoring rules', () => {
  assert.deepEqual(DEFAULT_AI_ENGINES.map(engine => engine.id), ['google', 'openai', 'perplexity']);
  assert.equal(DEFAULT_VIS_PROMPTS.length, 5);
  assert.equal(normalizeName('  Best-Day Fitness! '), 'best day fitness');
  assert.deepEqual(['positive', 'neutral', 'negative', 'absent'].map(sentimentToScore), [100, 50, 0, 50]);
  assert.match(visibilityPrompt('senior fitness'), /senior fitness/);
});

test('AI visibility provider adapters preserve request and response contracts', async () => {
  const geminiCalls = [];
  const { service, fetchCalls } = serviceFixture({
    env: { GEMINI_API_KEY: 'gemini-secret', OPENAI_API_KEY: 'openai-secret', PERPLEXITY_API_KEY: 'pplx-secret' },
    openAiModel: 'openai-test',
    perplexityModel: 'pplx-test',
    geminiGenerate: async request => {
      geminiCalls.push(request);
      return {
        text: ' Google answer ',
        candidates: [{ groundingMetadata: { groundingChunks: [{ web: { title: 'Source', uri: 'https://google.example' } }] } }],
      };
    },
  });

  assert.deepEqual(service.enginesStatus().map(engine => engine.configured), [true, true, true]);
  assert.deepEqual(await service.askEngine('google', 'prompt'), {
    ok: true,
    answer: 'Google answer',
    sources: [{ title: 'Source', uri: 'https://google.example' }],
  });
  assert.equal(geminiCalls[0].model, 'gemini-test');
  assert.deepEqual(geminiCalls[0].config, { tools: [{ googleSearch: {} }] });

  const openai = await service.askEngine('openai', 'openai prompt');
  const perplexity = await service.askEngine('perplexity', 'perplexity prompt');
  assert.equal(openai.answer, 'provider answer');
  assert.deepEqual(perplexity.sources, [{ title: '', uri: 'https://source.example' }]);
  assert.equal(fetchCalls[0][0], 'openai');
  assert.equal(fetchCalls[0][1], 'https://api.openai.com/v1/chat/completions');
  assert.equal(fetchCalls[0][2].headers.Authorization, 'Bearer openai-secret');
  assert.equal(JSON.parse(fetchCalls[0][2].body).model, 'openai-test');
  assert.equal(fetchCalls[1][0], 'perplexity');
  assert.equal(JSON.parse(fetchCalls[1][2].body).model, 'pplx-test');
  assert.deepEqual(await service.askEngine('missing', 'prompt'), { ok: false, answer: '', sources: [], error: 'unknown engine' });
});

test('AI visibility run keeps scoring, persistence, retention, and metering stable', async () => {
  const prior = Array.from({ length: 60 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    leaderboard: [],
    visibilityScore: 0,
    shareOfVoice: 0,
    sentimentScore: null,
  }));
  const state = { prompts: ['query one', 'query two'], snapshots: prior, updatedAt: null, lastRun: null };
  const usage = [];
  let providerCall = 0;
  let saves = 0;
  const { service } = serviceFixture({
    state,
    env: { OPENAI_API_KEY: 'openai-secret', GEMINI_API_KEY: 'gemini-secret' },
    meterUsage: engine => usage.push(engine),
    save: () => { saves += 1; },
    providerRuntime: {
      fetch: async () => ({
        json: async () => ({ choices: [{ message: { content: providerCall++ === 0 ? 'Best Day Fitness and Rival Gym' : 'Rival Gym' } }] }),
      }),
    },
    geminiGenerate: async request => {
      if (request.config) return { text: '' };
      const mentioned = request.contents.includes('Best Day Fitness and Rival Gym');
      return { text: JSON.stringify({ mentioned, sentiment: mentioned ? 'positive' : 'neutral', competitors: ['Rival Gym', 'rival gym', 'Best Day Fitness'] }) };
    },
  });

  const { snapshot } = await service.runVisibility(['openai']);
  assert.equal(snapshot.visibilityScore, 50);
  assert.equal(snapshot.shareOfVoice, 33);
  assert.equal(snapshot.sentimentScore, 100);
  assert.equal(snapshot.brandMentions, 1);
  assert.equal(snapshot.totalAnswers, 2);
  assert.deepEqual(snapshot.perEngine, [{ engine: 'openai', label: 'ChatGPT', score: 50, answers: 2 }]);
  assert.deepEqual(snapshot.leaderboard.map(row => [row.name, row.mentions, row.score]), [
    ['Rival Gym', 2, 100],
    ['Best Day Fitness', 1, 50],
  ]);
  assert.deepEqual(usage, ['openai', 'openai']);
  assert.equal(state.snapshots.length, 60);
  assert.equal(state.snapshots.at(-1), snapshot);
  assert.equal(state.updatedAt, snapshot.ranAt);
  assert.equal(state.lastRun, snapshot.ranAt);
  assert.equal(saves, 1);

  const trend = service.trend();
  assert.equal(trend.dates.at(-1), '2026-09-08');
  assert.equal(trend.series[0].name, 'Rival Gym');
  assert.equal(trend.metricLines.visibility.at(-1).value, 50);
});

test('AI visibility reports a controlled configuration error without calling providers', async () => {
  const { service, fetchCalls, saves } = serviceFixture();
  assert.deepEqual(await service.runVisibility(), {
    error: 'No AI engines are configured. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY).',
  });
  assert.equal(fetchCalls.length, 0);
  assert.equal(saves(), 0);
});
