import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const ADMIN_PASSWORD = 'integration-test-password';
const dataDir = mkdtempSync(join(tmpdir(), 'seo-buddy-test-'));
let child;
let base;
let childLogs = '';

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer() {
  for (let i = 0; i < 300; i++) {
    if (child && child.exitCode != null) throw new Error(`Server exited during boot (${child.exitCode}).\n${childLogs}`);
    try {
      const response = await fetch(base + '/api/storage-status');
      if (response.ok) return;
    } catch (e) { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not become ready.');
}

function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.auth !== false) headers.Authorization = `Bearer ${ADMIN_PASSWORD}`;
  if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(base + path, {
    ...options,
    headers,
    body: options.body == null || typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
}

before(async () => {
  const port = await availablePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_PASSWORD,
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      PERPLEXITY_API_KEY: '',
      GHL_ACCESS_TOKEN: '',
      GOOGLE_APPLICATION_CREDENTIALS: '',
      GSC_SITE_URL: '',
      REVIEWS_URL: base,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { childLogs += chunk.toString(); });
  child.stderr.on('data', chunk => { childLogs += chunk.toString(); });
  await waitForServer();
});

after(() => {
  if (child && !child.killed) child.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

test('all read-only dashboard routes respond', { timeout: 30000 }, async () => {
  const paths = [
    '/api/brand-profile', '/api/business-profile', '/api/gsc-data', '/api/history',
    '/api/autopilot-status', '/api/autopilot-targets', '/api/aio-history',
    '/api/ai-visibility', '/api/ai-factcheck', '/api/ai-crawlers', '/api/reddit-threads',
    '/api/usage', '/api/storage-status', '/api/aio-schema', '/api/performance',
    '/api/onsite-schema', '/api/listing-kit', '/api/citation-worklist',
    '/api/local-autopilot', '/api/onsite-autopilot', '/api/gmail-status',
    '/api/gbp-status', '/api/performance-digest', '/api/health-score',
    '/api/next-moves', '/api/autopilot-digest', '/api/deploy-readiness',
    '/api/reviews-stats',
  ];
  for (const path of paths) {
    const response = await request(path, { auth: false });
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    assert.match(response.headers.get('cache-control') || '', /no-store/, `${path} must not be cached`);
  }
});

test('every mutating or credit-spending route is password protected', async () => {
  const paths = [
    '/api/brand-profile', '/api/brand-profile/reset', '/api/business-profile',
    '/api/save-settings', '/api/generate-article', '/api/publish-ghl', '/api/index-url',
    '/api/autopilot-toggle', '/api/autopilot-queue/add', '/api/autopilot-queue/remove',
    '/api/autopilot-targets/add', '/api/autopilot-targets/remove', '/api/autopilot-run-now',
    '/api/aio-audit', '/api/ai-visibility/run', '/api/ai-visibility/toggle',
    '/api/ai-factcheck/run', '/api/ai-crawlers/run', '/api/reddit-threads/run',
    '/api/usage/budget', '/api/assistant', '/api/ai-visibility/prompts',
    '/api/citation-targets', '/api/nap-audit', '/api/local-generate', '/api/onsite',
    '/api/listing-kit', '/api/citation-scan', '/api/citation-autopilot/toggle',
    '/api/citation-autopilot/seen', '/api/citation-status', '/api/citation-outreach',
    '/api/local-autopilot/toggle', '/api/local-autopilot/run', '/api/local-autopilot/seen',
    '/api/local-reply', '/api/onsite-autopilot/toggle', '/api/onsite-autopilot/run',
    '/api/onsite-autopilot/seen', '/api/send-pitch', '/api/gbp-post',
    '/api/gbp-mark-posted', '/api/performance-digest/toggle',
    '/api/performance-digest/run', '/api/performance-digest/seen',
    '/api/performance-digest/send', '/api/transcribe', '/api/social-pack',
  ];
  for (const path of paths) {
    const response = await request(path, { method: 'POST', auth: false, body: {} });
    assert.ok([401, 429].includes(response.status), `${path} returned ${response.status}`);
  }
  const validAfterFailures = await request('/api/brand-profile', { method: 'POST', body: { brand: { tagline: 'Test' } } });
  assert.equal(validAfterFailures.status, 200, 'a valid password must not be locked out by bad attempts');
});

test('settings persist safely without env-line injection', async () => {
  const response = await request('/api/save-settings', {
    method: 'POST',
    body: {
      ghlLocation: 'location-123',
      ghlBlog: 'blog-123',
      siteUrl: 'https://bestdayfitness.com/',
      blogPrefix: 'post',
      authorName: 'Coach\nINJECTED_KEY=not-a-real-setting',
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.persistent, true);
  const envFile = readFileSync(join(dataDir, '.env'), 'utf8');
  assert.match(envFile, /^GHL_LOCATION_ID=/m);
  assert.doesNotMatch(envFile, /^INJECTED_KEY=/m);

  const invalidJson = await request('/api/save-settings', { method: 'POST', body: { gscJson: '{bad json' } });
  assert.equal(invalidJson.status, 400);
});

test('generated and published content is sanitized', async () => {
  const generated = await request('/api/generate-article', {
    method: 'POST',
    body: { keyword: 'mobility <img src=x onerror=alert(1)>', caseStudy: '<script>alert(1)</script>' },
  });
  assert.equal(generated.status, 200);
  const article = await generated.json();
  assert.equal(article.success, true);
  assert.doesNotMatch(article.content, /<(?:script|img)\b|<[^>]+\sonerror\s*=/i);

  const published = await request('/api/publish-ghl', {
    method: 'POST',
    body: { title: 'Safe title', status: 'draft', content: '<h1>Hello</h1><img src=x onerror="alert(1)"><a href=java&#x73;cript:alert(1)>bad</a><script>alert(1)</script>' },
  });
  assert.equal(published.status, 200);
  const result = await published.json();
  assert.doesNotMatch(result.content, /onerror\s*=|<script>alert|javascript\s*:/i);
});

test('URL tools reject unsafe destinations and schemes', async () => {
  const ssrf = await request('/api/onsite', {
    method: 'POST',
    body: { tool: 'aeoReadiness', url: 'http://127.0.0.1:80/private' },
  });
  assert.equal(ssrf.status, 400);
  assert.match((await ssrf.json()).error, /private|reserved/i);

  const badIndex = await request('/api/index-url', { method: 'POST', body: { url: 'javascript:alert(1)' } });
  assert.equal(badIndex.status, 400);

  const unknownTool = await request('/api/onsite', { method: 'POST', body: { tool: 'not-real' } });
  assert.equal(unknownTool.status, 400);
});
