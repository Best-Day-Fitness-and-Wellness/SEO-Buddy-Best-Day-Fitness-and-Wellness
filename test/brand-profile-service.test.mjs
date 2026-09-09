import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BRAND_DEFAULT, createBrandProfileService } = require('../lib/brand-profile-service');

function fixture(options = {}) {
  const writes = [];
  const defaults = options.defaults || {
    name: 'Test Brand',
    audienceDescription: 'Active adults',
    tagline: 'Move well.',
    philosophy: 'Practice with purpose.',
    tone: 'Warm and clear.',
    voiceTraits: ['Confident', '', null],
    writingStyle: ['Plain language'],
    usePhrases: ['Keep moving'],
    neverUse: ['quick fix', 'shred'],
    services: ['Training'],
    differentiators: ['Integrated care'],
    audiencePainPoints: ['Needs a clear plan'],
    notPositioning: ['a big-box gym'],
  };
  const fsImpl = options.fsImpl || { readFileSync() { throw new Error('missing'); } };
  const saveJsonFileSync = options.saveJsonFileSync || ((...args) => { writes.push(args); return true; });
  const service = createBrandProfileService({
    filePath: 'brand-profile.json',
    defaults,
    fsImpl,
    saveJsonFileSync,
  });
  return { service, defaults, writes };
}

test('production defaults retain the approved Best Day Fitness voice contract', () => {
  assert.equal(BRAND_DEFAULT.name, 'Best Day Fitness');
  assert.equal(BRAND_DEFAULT.tagline, 'Move Better. Feel Stronger. Live Longer.');
  assert.equal(BRAND_DEFAULT.ctaPrimaryUrl, 'https://bestdayfitness.com/consult');
  assert.deepEqual(BRAND_DEFAULT.values, ['Human-Centered', 'Collaborative', 'Intentional', 'Progressive']);
  assert.equal(BRAND_DEFAULT.neverUse.includes('anti-aging'), true);
  assert.equal(BRAND_DEFAULT.services.length, 4);
});

test('missing or unreadable storage starts from an independent default profile', () => {
  const { service, defaults } = fixture();
  assert.deepEqual(service.state.profile, defaults);
  assert.notEqual(service.state.profile, defaults);
  assert.notEqual(service.state.profile.voiceTraits, defaults.voiceTraits);
  assert.equal(service.state.reviewedAt, null);
});

test('saved profiles merge onto defaults and preserve explicit review state', () => {
  const reviewed = fixture({
    fsImpl: { readFileSync: () => JSON.stringify({ tagline: 'Saved line', _reviewedAt: '2026-09-01T12:00:00.000Z' }) },
  }).service;
  assert.equal(reviewed.state.profile.tagline, 'Saved line');
  assert.equal(reviewed.state.profile.tone, 'Warm and clear.');
  assert.equal(reviewed.state.reviewedAt, '2026-09-01T12:00:00.000Z');
  assert.equal(Object.hasOwn(reviewed.state.profile, '_reviewedAt'), false);

  const resetMarker = fixture({
    fsImpl: { readFileSync: () => JSON.stringify({ _reviewedAt: null }) },
  }).service;
  assert.equal(resetMarker.state.reviewedAt, null);
});

test('legacy saved profiles infer their review timestamp without rewriting storage', () => {
  let saves = 0;
  const service = fixture({
    fsImpl: {
      readFileSync: () => JSON.stringify({ tone: 'Legacy tone' }),
      statSync: () => ({ mtime: new Date('2026-08-10T09:30:00.000Z') }),
    },
    saveJsonFileSync: () => { saves += 1; return true; },
  }).service;
  assert.equal(service.state.profile.tone, 'Legacy tone');
  assert.equal(service.state.reviewedAt, '2026-08-10T09:30:00.000Z');
  assert.equal(saves, 0);
});

test('saving persists the current profile and review marker with the existing label', () => {
  const { service, writes } = fixture();
  service.state.profile = { ...service.state.profile, tagline: 'Updated' };
  service.state.reviewedAt = '2026-09-09T10:00:00.000Z';
  assert.equal(service.save(), true);
  assert.deepEqual(writes, [[
    'brand-profile.json',
    { ...service.state.profile, _reviewedAt: '2026-09-09T10:00:00.000Z' },
    'Brand',
  ]]);
});

test('short and full prompts retain the exact sections and filter empty list values', () => {
  const { service } = fixture();
  assert.equal(service.prompt(false), [
    'Test Brand — Active adults',
    'Tagline: "Move well."',
    'Philosophy: Practice with purpose.',
    'TONE: Warm and clear.',
    'VOICE:\n- Confident',
    'STYLE:\n- Plain language',
    'PHRASES THAT ARE OURS (use naturally, do not force):\n- Keep moving',
    'NEVER USE THESE WORDS OR PHRASES — this is a hard rule and the copy is checked for them afterwards:\n"quick fix", "shred"',
  ].join('\n'));
  assert.equal(service.prompt(true), `${service.prompt(false)}\nSERVICES:\n- Training\nWHAT MAKES US DIFFERENT:\n- Integrated care\nWHAT THE READER IS FEELING:\n- Needs a clear plan\nWE ARE NOT: a big-box gym. Never imply otherwise.`);
});

test('blocked-language matching is case-insensitive, whitespace tolerant, and word bounded', () => {
  const { service } = fixture();
  assert.deepEqual(service.violations('Avoid a QUICK   FIX. Shredded lettuce is fine; do not SHRED workouts.'), [
    { phrase: 'quick fix', found: 'QUICK   FIX' },
    { phrase: 'shred', found: 'SHRED' },
  ]);
  assert.deepEqual(service.violations(''), []);
});

test('service validates persistence dependencies at composition time', () => {
  assert.throws(() => createBrandProfileService(), /filePath is required/);
  assert.throws(() => createBrandProfileService({ filePath: 'brand.json' }), /saveJsonFileSync is required/);
});
