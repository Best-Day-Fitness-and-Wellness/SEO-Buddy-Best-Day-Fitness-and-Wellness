import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ONSITE_SEEDS, createOnsiteAutopilotService } = require('../lib/onsite-autopilot-service.js');

function onsiteState(overrides = {}) {
  return {
    enabled: true,
    intervalDays: 7,
    lastRun: null,
    seedIndex: 0,
    ideas: null,
    links: null,
    titlemeta: null,
    ...overrides,
  };
}

function makeService(overrides = {}) {
  const state = onsiteState(overrides.state);
  const calls = [];
  const errors = [];
  let saves = 0;
  const service = createOnsiteAutopilotService({
    state,
    save: () => { saves += 1; },
    getHistory: () => [],
    brandPrompt: full => `Brand voice full=${full}`,
    geminiGenerate: async request => {
      calls.push(request);
      if (request.contents.includes('expand the seed keyword')) return { text: '{"clusters":[]}' };
      if (request.contents.includes('Suggest internal links')) return { text: '{"suggestions":[]}' };
      return { text: '{"titles":[],"metas":[]}' };
    },
    model: 'gemini-test',
    parseJson: JSON.parse,
    daysSince: () => 10,
    env: { GEMINI_API_KEY: 'configured' },
    nowIso: () => '2026-09-09T16:00:00.000Z',
    logger: { error(...args) { errors.push(args); } },
    ...overrides,
    state,
  });
  return { service, state, calls, errors, saves: () => saves };
}

test('keyword scan preserves grounded provider request, parsing, and current brand voice', async () => {
  const { service, calls } = makeService({
    geminiGenerate: async request => {
      calls.push(request);
      return { text: '{"clusters":[{"theme":"Balance","keywords":["senior balance"],"questions":[],"contentIdea":"A guide"}]}' };
    },
  });

  const result = await service.scanKeywords('senior balance');
  assert.deepEqual(result, {
    seed: 'senior balance',
    clusters: [{ theme: 'Balance', keywords: ['senior balance'], questions: [], contentIdea: 'A guide' }],
    generatedAt: '2026-09-09T16:00:00.000Z',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-test');
  assert.deepEqual(calls[0].config, { tools: [{ googleSearch: {} }] });
  assert.match(calls[0].contents, /^Brand voice full=true\n/);
  assert.match(calls[0].contents, /expand the seed keyword "senior balance" into 4–5 topic clusters/);

  const missing = makeService({ env: {} });
  assert.equal(await missing.service.scanKeywords('unused'), null);
  assert.equal(missing.calls.length, 0);
});

test('link scan preserves the two-page gate and published-page prompt', async () => {
  const insufficient = makeService({
    getHistory: () => [{ title: 'One page', keyword: 'one', url: '/one' }],
  });
  assert.deepEqual(await insufficient.service.scanLinks(), {
    suggestions: [],
    note: 'Publish at least two pages first — then this suggests internal links between them.',
    generatedAt: '2026-09-09T16:00:00.000Z',
  });
  assert.equal(insufficient.calls.length, 0);

  const history = [
    { title: 'Balance', keyword: 'balance after 50', url: '/balance', ignored: true },
    { title: 'Strength', keyword: 'senior strength', url: '/strength' },
  ];
  const linked = makeService({
    getHistory: () => history,
    geminiGenerate: async request => {
      linked.calls.push(request);
      return { text: '{"suggestions":[{"from":"Balance","to":"Strength","anchor":"build strength","why":"Related"}]}' };
    },
  });
  const result = await linked.service.scanLinks();
  assert.equal(result.note, '');
  assert.equal(result.suggestions.length, 1);
  assert.match(linked.calls[0].contents, /Here are the pages this website has published/);
  assert.match(linked.calls[0].contents, /"title":"Balance","keyword":"balance after 50","url":"\/balance"/);
  assert.doesNotMatch(linked.calls[0].contents, /ignored/);
  assert.equal(linked.calls[0].config, undefined);
});

test('title and meta scan preserves prompt, fallbacks, and output shape', async () => {
  const { service, calls } = makeService({
    geminiGenerate: async request => {
      calls.push(request);
      return { text: '{"titles":["Strong After 50"],"metas":["Build strength today."]}' };
    },
  });
  assert.deepEqual(await service.scanTitleMeta('strength after 50', ''), {
    page: 'strength after 50',
    keyword: 'strength after 50',
    titles: ['Strong After 50'],
    metas: ['Build strength today.'],
    generatedAt: '2026-09-09T16:00:00.000Z',
  });
  assert.match(calls[0].contents, /keyword "strength after 50"/);
  assert.match(calls[0].contents, /3 title options \(each 60 characters or fewer/);
});

test('weekly run rotates seeds, uses the latest page, marks results new, and saves once', async () => {
  const history = [
    { title: 'Latest page', keyword: 'latest keyword', url: '/latest' },
    { title: 'Older page', keyword: 'older keyword', url: '/older' },
  ];
  const { service, state, calls, saves } = makeService({
    state: { seedIndex: ONSITE_SEEDS.length - 1 },
    getHistory: () => history,
  });

  await service.maybeRun(true);
  assert.equal(service.running, false);
  assert.equal(saves(), 1);
  assert.equal(calls.length, 3);
  assert.equal(state.seedIndex, 0);
  assert.equal(state.ideas.seed, ONSITE_SEEDS.at(-1));
  assert.equal(state.ideas.isNew, true);
  assert.equal(state.links.isNew, true);
  assert.equal(state.titlemeta.page, 'Latest page');
  assert.equal(state.titlemeta.keyword, 'latest keyword');
  assert.equal(state.titlemeta.isNew, true);
  assert.equal(state.lastRun, '2026-09-09T16:00:00.000Z');
  assert.match(calls[2].contents, /keyword "latest keyword"/);
});

test('on-site autopilot preserves guards, overlap, best-effort failures, and state controls', async () => {
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
      if (request.contents.includes('expand the seed keyword')) await pending;
      if (request.contents.includes('expand the seed keyword')) return { text: '{"clusters":[]}' };
      return { text: '{"titles":[],"metas":[]}' };
    },
  });
  const first = overlap.service.maybeRun(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(overlap.service.running, true);
  assert.equal(overlap.service.status().busy, true);
  await overlap.service.maybeRun(true);
  assert.equal(overlap.calls.length, 1);
  release();
  await first;
  assert.equal(overlap.calls.length, 2);
  assert.equal(overlap.saves(), 1);

  const failures = makeService({
    getHistory: () => [
      { title: 'One', keyword: 'one', url: '/one' },
      { title: 'Two', keyword: 'two', url: '/two' },
    ],
    geminiGenerate: async () => { throw new Error('provider failed'); },
  });
  await failures.service.maybeRun(true);
  assert.equal(failures.saves(), 1);
  assert.equal(failures.state.lastRun, '2026-09-09T16:00:00.000Z');
  assert.deepEqual(failures.errors, [
    ['[On-Site Autopilot] keywords failed:', 'provider failed'],
    ['[On-Site Autopilot] links failed:', 'provider failed'],
    ['[On-Site Autopilot] titlemeta failed:', 'provider failed'],
  ]);

  const controls = makeService({
    state: {
      ideas: { isNew: true },
      links: { isNew: true },
      titlemeta: { isNew: true },
    },
  });
  assert.deepEqual(controls.service.status(), {
    success: true,
    enabled: true,
    busy: false,
    intervalDays: 7,
    lastRun: null,
    ideas: { isNew: true },
    links: { isNew: true },
    titlemeta: { isNew: true },
    hasKey: true,
  });
  assert.deepEqual(controls.service.setEnabled(false), { success: true, enabled: false });
  controls.service.markSeen();
  assert.deepEqual(controls.state.ideas, { isNew: false });
  assert.deepEqual(controls.state.links, { isNew: false });
  assert.deepEqual(controls.state.titlemeta, { isNew: false });
  assert.equal(controls.saves(), 2);
});
