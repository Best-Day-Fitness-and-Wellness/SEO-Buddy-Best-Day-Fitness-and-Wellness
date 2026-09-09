import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { articleSlug, buildArticlePrompt, createArticleGenerationService } = require('../lib/article-generation-service');

const AT = new Date(2026, 8, 9, 12, 0, 0);

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unavailable(provider, message, cause) {
  const error = new Error(message, { cause });
  error.code = 'INTEGRATION_UNAVAILABLE';
  error.provider = provider;
  return error;
}

function service(overrides = {}) {
  return createArticleGenerationService({
    brandPrompt: () => 'TEST BRAND VOICE',
    brandViolations: text => text.includes('blocked phrase') ? [{ phrase: 'blocked phrase', found: 'blocked phrase' }] : [],
    assessArticleQuality: (content, options) => ({ publishable: true, content, options }),
    sanitizeArticleHtml: html => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
    escapeHtml,
    safeHttpUrl: (value, fallback = '') => /^https?:\/\//.test(String(value || '')) ? value : fallback,
    geminiGenerate: async () => ({ text: '<h1>Test article</h1><p>Body</p>' }),
    model: 'test-model',
    isGeminiReady: () => true,
    allowMockIntegrations: false,
    integrationUnavailable: unavailable,
    logger: { error() {} },
    now: () => AT,
    ...overrides,
  });
}

test('article prompt preserves AEO, brand, CTA, freshness, and bounded owner-source rules', () => {
  const transcript = `Owner detail ${'x'.repeat(60020)}`;
  const prompt = buildArticlePrompt({
    keyword: 'senior mobility',
    caseStudy: 'A specific client result',
    ctaText: 'Book now',
    ctaUrl: 'https://example.test/book',
    transcript,
    brand: 'TEST BRAND VOICE',
    date: AT,
  });
  assert.match(prompt, /^TEST BRAND VOICE/);
  assert.match(prompt, /Updated September 2026 · Best Day Fitness/);
  assert.match(prompt, /ANSWER-FIRST \(critical\)/);
  assert.match(prompt, /QUERY FAN-OUT/);
  assert.match(prompt, /A specific client result/);
  assert.match(prompt, /href="https:\/\/example\.test\/book"[^>]*>Book now<\/a>/);
  assert.match(prompt, /SOURCE MATERIAL/);
  assert.match(prompt, /<!--CLAIMS: first claim \| second claim \| third claim-->/);
  assert.equal(prompt.includes('x'.repeat(60001)), false);
});

test('live generation preserves provider request, cleanup, claims, safety, and quality contracts', async () => {
  const calls = [];
  const generated = await service({
    geminiGenerate: async (...args) => {
      calls.push(args);
      return { text: '```html\n<h1>Mobility <em>Guide</em></h1><script>unsafe()</script><p>blocked phrase</p><!--CLAIMS: 12-week result | 2026 date -->\n```' };
    },
  }).generate('Senior Mobility!', 'Case study', 'Start', 'https://example.test/start', 'Owner story');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].model, 'test-model');
  assert.match(calls[0][0].contents, /Owner story/);
  assert.deepEqual(calls[0][1], { usageKind: 'article' });
  assert.equal(generated.source, 'live_gemini');
  assert.equal(generated.title, 'Mobility Guide');
  assert.equal(generated.slug, 'senior-mobility');
  assert.equal(generated.fromTranscript, true);
  assert.deepEqual(generated.claimsToCheck, ['12-week result', '2026 date']);
  assert.doesNotMatch(generated.content, /script|CLAIMS/);
  assert.deepEqual(generated.brandViolations, [{ phrase: 'blocked phrase', found: 'blocked phrase' }]);
  assert.deepEqual(generated.quality.options, {
    claimsToCheck: ['12-week result', '2026 date'],
    brandViolations: [{ phrase: 'blocked phrase', found: 'blocked phrase' }],
  });
});

test('production never substitutes mock content when Gemini is not configured', async () => {
  await assert.rejects(
    service({ isGeminiReady: () => false }).generate('mobility'),
    error => error.code === 'INTEGRATION_UNAVAILABLE'
      && error.provider === 'gemini'
      && error.message === 'Gemini is not configured. Add a valid GEMINI_API_KEY before generating production content.',
  );
});

test('provider failures remain production failures with their original cause', async () => {
  const logged = [];
  const upstream = new Error('test-only provider outage');
  await assert.rejects(
    service({
      geminiGenerate: async () => { throw upstream; },
      logger: { error: (...args) => logged.push(args) },
    }).generate('mobility'),
    error => error.code === 'INTEGRATION_UNAVAILABLE'
      && error.cause === upstream
      && error.message === 'Gemini could not generate the article: test-only provider outage',
  );
  assert.deepEqual(logged, [['[Service Helper] Gemini generation failed:', 'test-only provider outage']]);
});

test('explicit development fallback keeps its response shape and escapes owner input', async () => {
  const generated = await service({
    isGeminiReady: () => false,
    allowMockIntegrations: true,
  }).generate('<img src=x>', '<script>case</script>', '<b>Start</b>', 'javascript:alert(1)', 'spoken');
  assert.equal(generated.source, 'mock_generator');
  assert.equal(generated.title, 'The Ultimate Guide to <img src=x> | Best Day Fitness');
  assert.equal(generated.slug, 'img-src-x');
  assert.equal(generated.fromTranscript, true);
  assert.deepEqual(generated.claimsToCheck, []);
  assert.match(generated.content, /&lt;img src=x&gt;/);
  assert.match(generated.content, /&lt;script&gt;case&lt;\/script&gt;/);
  assert.match(generated.content, /&lt;b&gt;Start&lt;\/b&gt;/);
  assert.match(generated.content, /href="#"/);
});

test('slug normalization and dependency validation stay deterministic', () => {
  assert.equal(articleSlug('  Balance & Mobility — St. Pete  '), 'balance-mobility-st-pete');
  assert.throws(() => createArticleGenerationService({}), /brandPrompt is required/);
});
