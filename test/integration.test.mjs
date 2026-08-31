import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { parse: parseDotenv } = require('dotenv');

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

test('static assets compress, cache briefly, and keep PDF code off the critical path', async () => {
  const index = await request('/', { auth: false });
  const html = await index.text();
  assert.match(index.headers.get('cache-control') || '', /no-cache/);
  assert.doesNotMatch(html, /<script[^>]+jspdf/i);
  assert.match(html, /status-indicator checking/);
  assert.match(html, /Checking live data/);
  assert.doesNotMatch(html, />Mock Mode</);

  const appJs = await request('/app.js', {
    auth: false,
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(appJs.status, 200);
  assert.match(appJs.headers.get('cache-control') || '', /public, max-age=300/);
  assert.match(appJs.headers.get('content-encoding') || '', /gzip/);

  const source = await (await request('/app.js', { auth: false })).text();
  assert.match(source, /setDataModeFromHealthScore\(hs\)/);
  assert.match(source, /setDataMode\(payload\.source === 'live_gsc'\)/);
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

test('saving an unchanged brand voice marks it reviewed', async () => {
  const reset = await request('/api/brand-profile/reset', { method: 'POST', body: {} });
  assert.equal(reset.status, 200);

  const before = await request('/api/deploy-readiness', { auth: false }).then(response => response.json());
  assert.equal(before.checks.find(check => check.key === 'brand').ok, false);

  const profile = await request('/api/brand-profile', { auth: false }).then(response => response.json());
  const save = await request('/api/brand-profile', { method: 'POST', body: { brand: profile.brand } });
  assert.equal(save.status, 200);

  const after = await request('/api/deploy-readiness', { auth: false }).then(response => response.json());
  assert.equal(after.checks.find(check => check.key === 'brand').ok, true);
  assert.ok(after.checks.find(check => check.key === 'brand').okText.includes('Your voice'));
});

test('a brand save reports when it was reviewed and whether that will survive a deploy', async () => {
  await request('/api/brand-profile/reset', { method: 'POST', body: {} });
  const profile = await request('/api/brand-profile', { auth: false }).then(response => response.json());
  assert.equal(profile.reviewedAt, null, 'a reset profile carries no review timestamp');

  const saved = await request('/api/brand-profile', { method: 'POST', body: { brand: profile.brand } })
    .then(response => response.json());
  assert.ok(!Number.isNaN(Date.parse(saved.reviewedAt)), 'the save returns when it was reviewed');
  assert.equal(saved.persisted, true, 'the save reports that it reached disk');
  assert.equal(saved.durable, true, 'DATA_DIR is set for these tests, so the save is durable');

  // The badge reads the brand profile directly, so the profile must carry the
  // same timestamp the readiness board does — otherwise the two surfaces
  // disagree on screen and the owner cannot tell which one is lying.
  const reread = await request('/api/brand-profile', { auth: false }).then(response => response.json());
  assert.equal(reread.reviewedAt, saved.reviewedAt);
  const check = await request('/api/deploy-readiness', { auth: false })
    .then(response => response.json())
    .then(body => body.checks.find(item => item.key === 'brand'));
  assert.equal(check.reviewedAt, saved.reviewedAt);
  assert.equal(check.durable, true);
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

test('settings keep Google credentials out of dotenv and preserve the path exactly', async () => {
  const serviceAccount = {
    type: 'service_account',
    client_email: 'incident-test@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n',
  };
  const response = await request('/api/save-settings', {
    method: 'POST',
    body: {
      siteUrl: 'sc-domain:bestdayfitness.com',
      gscJson: JSON.stringify(serviceAccount),
    },
  });

  assert.equal(response.status, 200);
  const envFile = readFileSync(join(dataDir, '.env'), 'utf8');
  const parsedEnv = parseDotenv(envFile);
  const credentialsPath = join(dataDir, 'google-creations.json');

  assert.equal(parsedEnv.GOOGLE_APPLICATION_CREDENTIALS, credentialsPath);
  assert.doesNotMatch(envFile, /private_key|BEGIN PRIVATE KEY/);
  assert.deepEqual(JSON.parse(readFileSync(credentialsPath, 'utf8')), serviceAccount);
  assert.equal(readdirSync(dataDir).some(name => name.endsWith('.tmp')), false);
});

test('an unrelated settings save migrates inherited raw Google JSON without corrupting it', { timeout: 15000 }, async () => {
  const isolatedDir = mkdtempSync(join(tmpdir(), 'seo-buddy-credential-migration-'));
  const isolatedPort = await availablePort();
  const isolatedBase = `http://127.0.0.1:${isolatedPort}`;
  const serviceAccount = {
    type: 'service_account',
    client_email: 'inherited-test@example.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nliteral-backslash-n-must-survive\n-----END PRIVATE KEY-----\n',
  };
  let isolatedLogs = '';
  const isolated = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: String(isolatedPort),
      DATA_DIR: isolatedDir,
      ADMIN_PASSWORD,
      GEMINI_API_KEY: '',
      GOOGLE_APPLICATION_CREDENTIALS: JSON.stringify(serviceAccount),
      GSC_SITE_URL: 'sc-domain:bestdayfitness.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  isolated.stdout.on('data', chunk => { isolatedLogs += chunk.toString(); });
  isolated.stderr.on('data', chunk => { isolatedLogs += chunk.toString(); });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      if (isolated.exitCode != null) throw new Error(`Isolated server exited (${isolated.exitCode}).\n${isolatedLogs}`);
      try { ready = (await fetch(isolatedBase + '/api/storage-status')).ok; } catch (_) { /* booting */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, `isolated server did not start\n${isolatedLogs}`);

    const response = await fetch(isolatedBase + '/api/save-settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ADMIN_PASSWORD}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ghlLocation: 'location-only-change' }),
    });
    assert.equal(response.status, 200);

    const envFile = readFileSync(join(isolatedDir, '.env'), 'utf8');
    const parsedEnv = parseDotenv(envFile);
    const credentialsPath = join(isolatedDir, 'google-creations.json');
    assert.equal(parsedEnv.GOOGLE_APPLICATION_CREDENTIALS, credentialsPath);
    assert.doesNotMatch(envFile, /private_key|BEGIN PRIVATE KEY/);
    assert.deepEqual(JSON.parse(readFileSync(credentialsPath, 'utf8')), serviceAccount);
  } finally {
    if (isolated.exitCode == null) {
      const stopped = new Promise(resolve => isolated.once('exit', resolve));
      isolated.kill();
      await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    rmSync(isolatedDir, { recursive: true, force: true });
  }
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
