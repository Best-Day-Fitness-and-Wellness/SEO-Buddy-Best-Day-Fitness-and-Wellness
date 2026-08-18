import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadRuntimeConfig } = require('../src/config/runtime-config');
const { createAdminAuth } = require('../src/http/middleware/admin-auth');
const { escapeHtml, jsonForHtml, safeHttpUrl, sanitizeArticleHtml } = require('../src/shared/content-safety');
const {
  extractPlatformTotals,
  metaContent,
  monthlyGrowth,
  parseJsonLd,
  parseReviewCards,
} = require('../src/features/reviews/domain/review-page-parser');

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('runtime configuration loads durable dotenv values without overriding host values', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'seo-buddy-config-'));
  try {
    writeFileSync(join(dataDir, '.env'), 'GEMINI_MODEL=file-model\nADMIN_PASSWORD=file-password\n');
    const env = { DATA_DIR: dataDir, ADMIN_PASSWORD: 'host-password' };
    const config = loadRuntimeConfig({ env, projectRoot: 'C:\\project' });

    assert.equal(config.dataDir, dataDir);
    assert.equal(config.adminPassword, 'host-password');
    assert.equal(config.geminiModel, 'file-model');
    assert.equal(Object.isFrozen(config), true);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('admin authentication accepts a valid bearer token and preserves rejection contract', () => {
  const auth = createAdminAuth({ password: 'correct-password' });
  let nextCalls = 0;
  const validResponse = responseRecorder();
  auth({ ip: '127.0.0.1', headers: { authorization: 'Bearer correct-password' }, socket: {} }, validResponse, () => { nextCalls++; });
  assert.equal(nextCalls, 1);

  const invalidResponse = responseRecorder();
  auth({ ip: '127.0.0.2', headers: { authorization: 'Bearer wrong-password' }, socket: {} }, invalidResponse, () => { nextCalls++; });
  assert.equal(invalidResponse.statusCode, 401);
  assert.deepEqual(invalidResponse.payload, {
    success: false,
    error: 'Unauthorized. Enter the admin password in Settings to perform this action.',
  });
});

test('admin authentication rate limit is isolated by client address', () => {
  let currentTime = 1000;
  const auth = createAdminAuth({
    password: 'correct-password',
    now: () => currentTime,
    policy: { maxFailures: 1, windowMs: 1000, cleanupThreshold: 5000, hardLimit: 10000 },
  });

  const request = address => ({ ip: address, headers: {}, socket: {} });
  auth(request('first'), responseRecorder(), () => {});
  const blocked = responseRecorder();
  auth(request('first'), blocked, () => {});
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '1');

  const otherClient = responseRecorder();
  auth(request('second'), otherClient, () => {});
  assert.equal(otherClient.statusCode, 401);

  currentTime += 1001;
  const expired = responseRecorder();
  auth(request('first'), expired, () => {});
  assert.equal(expired.statusCode, 401);
});

test('review domain parser keeps inventory, JSON-LD, metadata, and monthly growth pure', () => {
  const html = `<!doctype html><html><head>
    <meta name="description" content="A sufficiently useful description">
    <script type="application/ld+json">{"review":[{"reviewRating":{"ratingValue":5}}]}</script>
  </head><body>
    <div class="rev" data-plat="google"><b>Alex</b><div class="d">2026-01</div><div class="rs" aria-label="5 out of 5 stars">★★★★★</div><p>Great</p></div>
    <b>Google</b><div class="s">5.0 · 100</div>
  </body></html>`;

  assert.deepEqual(parseReviewCards(html), [{ platform: 'google', author: 'Alex', date: '2026-01', rating: 5 }]);
  assert.equal(parseJsonLd(html).review[0].reviewRating.ratingValue, 5);
  assert.equal(metaContent(html, 'name', 'description'), 'A sufficiently useful description');
  assert.deepEqual(extractPlatformTotals(html), { google: { avgRating: 5, reviewCount: 100 } });
  assert.deepEqual(monthlyGrowth([
    { date: '2026-01' },
    { date: '2026-03' },
  ]), [
    { month: '2026-01', added: 1, total: 1 },
    { month: '2026-02', added: 0, total: 1 },
    { month: '2026-03', added: 1, total: 2 },
  ]);
});

test('shared content safety preserves formatting while removing active content', () => {
  const unsafe = '<h2 onclick="steal()">Hello</h2><a href="java&#x73;cript:alert(1)">bad</a><script>alert(1)</script>';
  const sanitized = sanitizeArticleHtml(unsafe);

  assert.match(sanitized, /<h2>Hello<\/h2>/);
  assert.doesNotMatch(sanitized, /onclick|javascript|<script/i);
  assert.equal(escapeHtml('<Best Day & Friends>'), '&lt;Best Day &amp; Friends&gt;');
  assert.equal(safeHttpUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeHttpUrl('https://user:pass@example.com', '#'), '#');
  assert.doesNotMatch(jsonForHtml({ closing: '</script>' }), /<\/script>/);
});
