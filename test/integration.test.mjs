import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const require = createRequire(import.meta.url);
const { parse: parseDotenv } = require('dotenv');

const ADMIN_PASSWORD = 'integration-test-password';
const OPERATOR_PASSWORD = 'integration-test-operator-password';
const dataDir = mkdtempSync(join(tmpdir(), 'seo-buddy-test-'));
const tenantDir = join(dataDir, 'tenants', 'best-day-fitness');
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
      OPERATOR_PASSWORD,
      DATABASE_URL: '',
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

test('reading the health score does not write score history', async () => {
  const healthFile = join(tenantDir, 'health-score.json');
  assert.equal(existsSync(healthFile), false);

  const response = await request('/api/health-score', { auth: false });
  const score = await response.json();

  assert.equal(response.status, 200);
  assert.equal(score.scoreVersion, 2);
  assert.ok(score.smoothing);
  assert.ok(score.confidence);
  assert.ok(score.freshness);
  assert.equal(score.explainability.method, 'weighted-average-of-measured-pillars');
  assert.ok(Array.isArray(score.explainability.opportunities));
  assert.equal(existsSync(healthFile), false);
});

test('lifecycle probes and protected diagnostics expose truthful process state', async () => {
  const requestId = 'integration-request-123';
  const live = await request('/health/live', { auth: false, headers: { 'X-Request-Id': requestId } });
  const liveBody = await live.json();
  assert.equal(live.status, 200);
  assert.equal(liveBody.status, 'live');
  assert.equal(live.headers.get('x-request-id'), requestId);
  assert.match(live.headers.get('cache-control') || '', /no-store/);

  const ready = await request('/health/ready', { auth: false });
  const readyBody = await ready.json();
  assert.equal(ready.status, 200);
  assert.equal(readyBody.status, 'ready');
  assert.equal(readyBody.checks.storage.ok, true);
  assert.equal(readyBody.checks.storage.persistent, true);

  const unauthorized = await request('/api/diagnostics', { auth: false });
  assert.equal(unauthorized.status, 401);
  const diagnostics = await request('/api/diagnostics');
  const diagnosticBody = await diagnostics.json();
  assert.equal(diagnostics.status, 200);
  assert.equal(diagnosticBody.storage.ok, true);
  assert.equal(diagnosticBody.runtime.shuttingDown, false);
  assert.ok(diagnosticBody.requests.totals.requests >= 4);

  const unauthorizedQueue = await request('/api/job-queue', { auth: false });
  assert.equal(unauthorizedQueue.status, 401);
  const queue = await request('/api/job-queue');
  const queueBody = await queue.json();
  assert.equal(queue.status, 200);
  assert.equal(queueBody.worker.running, true);
  assert.deepEqual(Object.keys(queueBody.counts).sort(), ['failed', 'pending', 'running', 'succeeded']);
  assert.ok(queueBody.recent.every(job => !Object.hasOwn(job, 'payload')));

  const unauthorizedIntegrations = await request('/api/integration-health', { auth: false });
  assert.equal(unauthorizedIntegrations.status, 401);
  const integrations = await request('/api/integration-health');
  const integrationBody = await integrations.json();
  assert.equal(integrations.status, 200);
  assert.equal(integrationBody.budget.reached, false);
  assert.equal(integrationBody.providers.gemini.configured, false);
  assert.equal(integrationBody.providers['reviews-site'].configured, true);
});

test('public contracts expose stable schemas and hardened response boundaries', async () => {
  const invalidRequestId = await request('/health/live', {
    auth: false,
    headers: { 'X-Request-Id': 'bad id with spaces' },
  });
  assert.equal(invalidRequestId.status, 200);
  assert.match(invalidRequestId.headers.get('x-request-id') || '', /^[a-f0-9-]{36}$/i);
  assert.equal(invalidRequestId.headers.get('x-powered-by'), null);
  assert.equal(invalidRequestId.headers.get('access-control-allow-origin'), null);
  assert.equal(invalidRequestId.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(invalidRequestId.headers.get('x-frame-options'), 'DENY');
  assert.match(invalidRequestId.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

  const storage = await request('/api/storage-status', { auth: false });
  const storageBody = await storage.json();
  assert.deepEqual(Object.keys(storageBody).sort(), ['backend', 'persistent', 'postgresMirror', 'tenantId']);
  assert.equal(storageBody.persistent, true);
  assert.equal(storageBody.tenantId, 'best-day-fitness');

  const deploy = await request('/api/deploy-readiness', { auth: false });
  const deployBody = await deploy.json();
  assert.equal(typeof deployBody.ready, 'number');
  assert.equal(typeof deployBody.total, 'number');
  assert.equal(Array.isArray(deployBody.checks), true);
  assert.equal(typeof deployBody.runtime.mode, 'string');
  assert.equal(typeof deployBody.runtime.mockIntegrationsAllowed, 'boolean');

  const score = await request('/api/health-score', { auth: false });
  const scoreBody = await score.json();
  assert.equal(typeof scoreBody.success, 'boolean');
  assert.equal(typeof scoreBody.scoreVersion, 'number');
  assert.equal(Array.isArray(scoreBody.pillars), true);
  assert.equal(Array.isArray(scoreBody.explainability.missingSources), true);
  assert.equal(typeof scoreBody.confidence.percent, 'number');
});

test('the global JSON boundary rejects oversized requests before business logic', async () => {
  const response = await request('/api/business-profile', {
    method: 'POST',
    body: { name: 'x'.repeat(110 * 1024) },
  });
  assert.equal(response.status, 413);
});

test('owner automation status is a read-only public summary without operational secrets', async () => {
  const response = await request('/api/automation-status', { auth: false });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(Number.isFinite(Date.parse(body.checkedAt)));
  assert.deepEqual(body.features.map(item => item.key), ['content', 'ai', 'local', 'citations', 'onsite', 'digest', 'monthly-report']);
  assert.ok(body.features.every(item => item.status === 'needs-setup'));
  assert.doesNotMatch(JSON.stringify(body), /lastError|payload|password|idempotencyKey|leaseUntil/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('production mode never reports demo generation, publishing, indexing, or search data as live success', { timeout: 30000 }, async () => {
  const productionDir = mkdtempSync(join(tmpdir(), 'seo-buddy-production-mode-'));
  const port = await availablePort();
  const productionBase = `http://127.0.0.1:${port}`;
  let productionLogs = '';
  const production = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      APP_MODE: 'production',
      NODE_ENV: 'production',
      PORT: String(port),
      DATA_DIR: productionDir,
      ADMIN_PASSWORD,
      OPERATOR_PASSWORD,
      DATABASE_URL: '',
      GEMINI_API_KEY: '',
      GHL_ACCESS_TOKEN: '',
      GHL_LOCATION_ID: '',
      GHL_BLOG_ID: '',
      GOOGLE_APPLICATION_CREDENTIALS: '',
      GSC_SITE_URL: '',
      REVIEWS_URL: productionBase,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  production.stdout.on('data', chunk => { productionLogs += chunk.toString(); });
  production.stderr.on('data', chunk => { productionLogs += chunk.toString(); });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 150 && !ready; attempt++) {
      if (production.exitCode != null) throw new Error(`Production-mode server exited (${production.exitCode}).\n${productionLogs}`);
      try { ready = (await fetch(productionBase + '/api/storage-status')).ok; } catch (_) { /* booting */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, `production-mode server did not start\n${productionLogs}`);

    const auth = { Authorization: `Bearer ${ADMIN_PASSWORD}`, 'Content-Type': 'application/json' };
    const gsc = await (await fetch(productionBase + '/api/gsc-data')).json();
    assert.equal(gsc.source, 'unavailable');
    assert.deepEqual(gsc.data, []);

    const generation = await fetch(productionBase + '/api/generate-article', {
      method: 'POST', headers: auth, body: JSON.stringify({ keyword: 'senior mobility' }),
    });
    assert.equal(generation.status, 503);
    assert.equal((await generation.json()).code, 'INTEGRATION_UNAVAILABLE');

    const publish = await fetch(productionBase + '/api/publish-ghl', {
      method: 'POST', headers: auth, body: JSON.stringify({ title: 'Test article', content: '<p>Safe content</p>', status: 'draft' }),
    });
    assert.equal(publish.status, 503);
    assert.equal((await publish.json()).code, 'INTEGRATION_UNAVAILABLE');

    const indexing = await fetch(productionBase + '/api/index-url', {
      method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://bestdayfitness.com/test-article' }),
    });
    assert.equal(indexing.status, 503);
    assert.equal((await indexing.json()).code, 'INTEGRATION_UNAVAILABLE');
  } finally {
    if (production.exitCode == null) {
      const stopped = new Promise(resolve => production.once('exit', resolve));
      production.kill();
      await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 1000))]);
    }
    rmSync(productionDir, { recursive: true, force: true });
  }
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
    '/api/next-moves', '/api/autopilot-digest', '/api/deploy-readiness', '/api/auth/status',
    '/api/reviews-stats', '/api/monthly-report',
  ];
  for (const path of paths) {
    const response = await request(path, { auth: false });
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    assert.match(response.headers.get('cache-control') || '', /no-store/, `${path} must not be cached`);
  }
});

test('supplied logo variants and shortcut icons are served without authentication', async () => {
  const html = await (await request('/', { auth: false })).text();
  const assets = [
    ['sb-mark.svg', 'image/svg+xml'],
    ['sb-mark-dark.svg', 'image/svg+xml'],
    ['sb-favicon.svg', 'image/svg+xml'],
    ['sb-mark.png', 'image/png'],
    ['sb-touch-180.png', 'image/png'],
  ];
  for (const [name, type] of assets) {
    const url = `/${name}?v=20260903`;
    assert.ok(html.includes(`"${url}"`), `${name} must use the new branding cache version`);
    const response = await request(url, { auth: false });
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('content-type').split(';')[0], type);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(new URL(`../public/${name}`, import.meta.url)));
  }
  const favicon = readFileSync(new URL('../public/sb-mark.png', import.meta.url));
  const touchIcon = readFileSync(new URL('../public/sb-touch-180.png', import.meta.url));
  assert.deepEqual([favicon.readUInt32BE(16), favicon.readUInt32BE(20)], [32, 32]);
  assert.deepEqual([touchIcon.readUInt32BE(16), touchIcon.readUInt32BE(20)], [180, 180]);
  assert.doesNotMatch(html, /--sb-mark-core|--sb-mark-tick/);
});

test('legacy recovery is present in the shell but hidden before workspace startup', async () => {
  const response = await request('/', { auth: false });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<a\b[^>]*href="\?workspace=classic"[^>]*id="ws-classic"[^>]*\bhidden>Open recovery interface<\/a>/);
  assert.doesNotMatch(html, />Previous interface</);
});

test('static assets compress, cache briefly, and keep PDF code off the critical path', async () => {
  const index = await request('/', { auth: false });
  const html = await index.text();
  assert.match(index.headers.get('cache-control') || '', /no-cache/);
  assert.doesNotMatch(html, /<script[^>]+jspdf/i);
  assert.match(html, /status-indicator checking/);
  assert.match(html, /Checking live data/);
  assert.doesNotMatch(html, />Mock Mode</);
  assert.doesNotMatch(html, /mock-data\.js/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'production HTML must not require inline script execution');
  assert.match(index.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.doesNotMatch(index.headers.get('content-security-policy') || '', /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(html, /{{[A-Z0-9_]+}}/);
  const hashedAssets = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert.equal(hashedAssets.length, 5, 'stylesheet, theme, core, app, and assistant must be on the initial path');
  const lazyAssets = [...html.matchAll(/data-[a-z-]+-asset="(\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(lazyAssets).size, lazyAssets.length, 'feature asset declarations must be unique');
  assert.ok(lazyAssets.some(asset => /\/content-workspace\./.test(asset)));
  for (const asset of lazyAssets) {
    assert.equal(hashedAssets.includes(asset), false, `${asset} must remain lazy`);
    const response = await request(asset, { auth: false });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /immutable/);
  }
  const reviewsAsset = html.match(/data-reviews-asset="(\/assets\/reviews\.[a-f0-9]{12}\.js)"/)?.[1];
  const recordedContentAsset = html.match(/data-recorded-content-asset="(\/assets\/recorded-content\.[a-f0-9]{12}\.js)"/)?.[1];
  const pdfReportAsset = html.match(/data-pdf-report-asset="(\/assets\/pdf-report\.[a-f0-9]{12}\.js)"/)?.[1];
  const citationAsset = html.match(/data-citation-asset="(\/assets\/citations\.[a-f0-9]{12}\.js)"/)?.[1];
  const localPresenceAsset = html.match(/data-local-presence-asset="(\/assets\/local-presence\.[a-f0-9]{12}\.js)"/)?.[1];
  const performanceAsset = html.match(/data-performance-asset="(\/assets\/performance\.[a-f0-9]{12}\.js)"/)?.[1];
  const siteOptimizationAsset = html.match(/data-site-optimization-asset="(\/assets\/site-optimization\.[a-f0-9]{12}\.js)"/)?.[1];
  const aiVisibilityAsset = html.match(/data-ai-visibility-asset="(\/assets\/ai-visibility\.[a-f0-9]{12}\.js)"/)?.[1];
  const brandProfileAsset = html.match(/data-brand-profile-asset="(\/assets\/brand-profile\.[a-f0-9]{12}\.js)"/)?.[1];
  const ownerModeAsset = html.match(/data-owner-mode-asset="(\/assets\/owner-mode\.[a-f0-9]{12}\.js)"/)?.[1];
  const ownerViewsAsset = html.match(/data-owner-views-asset="(\/assets\/owner-views\.[a-f0-9]{12}\.js)"/)?.[1];
  const searchOpportunitiesAsset = html.match(/data-search-opportunities-asset="(\/assets\/search-opportunities\.[a-f0-9]{12}\.js)"/)?.[1];
  const settingsAsset = html.match(/data-settings-asset="(\/assets\/settings\.[a-f0-9]{12}\.js)"/)?.[1];
  assert.ok(reviewsAsset, 'reviews must have a versioned lazy asset');
  assert.ok(recordedContentAsset, 'recorded content must have a versioned lazy asset');
  assert.ok(pdfReportAsset, 'PDF reporting must have a versioned lazy asset');
  assert.ok(citationAsset, 'Citations must have a versioned lazy asset');
  assert.ok(localPresenceAsset, 'Local Presence must have a versioned lazy asset');
  assert.ok(performanceAsset, 'Progress must have a versioned lazy asset');
  assert.ok(siteOptimizationAsset, 'Site Optimization must have a versioned lazy asset');
  assert.ok(aiVisibilityAsset, 'AI Visibility must have a versioned lazy asset');
  assert.ok(brandProfileAsset, 'Brand Voice must have a versioned lazy asset');
  assert.ok(ownerModeAsset, 'Owner mode must have a versioned lazy asset');
  assert.ok(ownerViewsAsset, 'Shared Results and Business must have a versioned lazy asset');
  assert.equal(hashedAssets.includes(ownerViewsAsset), false, 'Shared views must stay off the initial script path');
  assert.ok(searchOpportunitiesAsset, 'Search opportunities must have a versioned lazy asset');
  assert.ok(settingsAsset, 'Settings must have a versioned lazy asset');
  assert.equal(hashedAssets.includes(reviewsAsset), false, 'reviews must not execute on the initial path');
  assert.equal(hashedAssets.includes(recordedContentAsset), false, 'recorded content must not execute on the initial path');
  assert.equal(hashedAssets.includes(pdfReportAsset), false, 'PDF reporting must not execute on the initial path');
  assert.equal(hashedAssets.includes(citationAsset), false, 'Citations must not execute on the initial path');
  assert.equal(hashedAssets.includes(localPresenceAsset), false, 'Local Presence must not execute on the initial path');
  assert.equal(hashedAssets.includes(performanceAsset), false, 'Progress must not execute on the initial path');
  assert.equal(hashedAssets.includes(siteOptimizationAsset), false, 'Site Optimization must not execute on the initial path');
  assert.equal(hashedAssets.includes(aiVisibilityAsset), false, 'AI Visibility must not execute on the initial path');
  assert.equal(hashedAssets.includes(brandProfileAsset), false, 'Brand Voice must not execute on the initial path');
  assert.equal(hashedAssets.includes(ownerModeAsset), false, 'Owner mode must not execute on the initial path');
  assert.equal(hashedAssets.includes(searchOpportunitiesAsset), false, 'Search opportunities must not execute on the initial path');
  assert.equal(hashedAssets.includes(settingsAsset), false, 'Settings must not execute on the initial path');
  for (const asset of hashedAssets) {
    assert.match(asset, /\.[a-f0-9]{12}\.(?:css|js)$/);
    const response = await request(asset, { auth: false, headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(response.status, 200, `${asset} must be served`);
    assert.match(response.headers.get('cache-control') || '', /max-age=31536000, immutable/);
  }
  for (const asset of [reviewsAsset, recordedContentAsset, pdfReportAsset, citationAsset, localPresenceAsset, performanceAsset, siteOptimizationAsset, aiVisibilityAsset, brandProfileAsset, ownerModeAsset, searchOpportunitiesAsset, settingsAsset]) {
    const response = await request(asset, { auth: false, headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(response.status, 200, `${asset} must be served lazily`);
    assert.match(response.headers.get('cache-control') || '', /max-age=31536000, immutable/);
  }

  const appJs = await request('/app.js', {
    auth: false,
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(appJs.status, 200);
  assert.match(appJs.headers.get('cache-control') || '', /public, max-age=300/);
  assert.match(appJs.headers.get('content-encoding') || '', /gzip/);

  const source = await (await request('/app.js', { auth: false })).text();
  assert.match(source, /setDataModeFromHealthScore\(hs\)/);
  assert.match(source, /no demo data substituted/i);
  assert.match(source, /Building 7-day baseline/);
  assert.match(source, /Live today/);
  assert.doesNotMatch(source, /SEO BUDDY ASSISTANT/);
  assert.doesNotMatch(source, /REVIEWS SITE/);
  assert.doesNotMatch(source, /Transcribe this recording|function transcribeFile/);
  assert.doesNotMatch(source, /function ensurePdfLibraries|const tiles = \[/);
  assert.doesNotMatch(source, /CITATION OUTREACH ENGINE/);
  assert.doesNotMatch(source, /LOCAL SEO TOOLS|LOCAL SEO AUTOPILOT/);
  assert.doesNotMatch(source, /PERFORMANCE \(measurement \/ ROI\)|function perfLineChart/);
  assert.doesNotMatch(source, /ON-SITE & TECHNICAL SEO|function osPost/);
  assert.doesNotMatch(source, /AI SEARCH AUDIT & SCHEMA ASSET ENGINE|MULTI-ENGINE AI VISIBILITY DASHBOARD/);
  assert.doesNotMatch(source, /const BP_FIELDS|function bpCollect/);
  assert.doesNotMatch(source, /const OW_ICON|function owCard/);
  assert.doesNotMatch(source, /GSC DATA & SYNC SYSTEM|function renderGSCTable/);
  assert.doesNotMatch(source, /settingsForm\.addEventListener|btnGscDiag\.addEventListener/);
  assert.match(source, /ensureReviewsFeature/);
  assert.match(source, /ensureRecordedContentFeature/);
  assert.match(source, /ensurePdfReportFeature/);
  assert.match(source, /ensureCitationFeature/);
  assert.match(source, /ensureLocalPresenceFeature/);
  assert.match(source, /ensurePerformanceFeature/);
  assert.match(source, /ensureSiteOptimizationFeature/);
  assert.match(source, /ensureAiVisibilityFeature/);
  assert.match(source, /ensureBrandProfileFeature/);
  assert.match(source, /ensureOwnerModeFeature/);
  assert.match(source, /ensureSearchOpportunitiesFeature/);
  assert.match(source, /ensureSettingsFeature/);
  assert.match(source, /ensureContentWorkspaceFeature/);
  assert.doesNotMatch(source, /CASE_STUDY_TEMPLATES|PUBLISHING & INDEXING EXECUTION|PERSISTENT HISTORY & AUTOPILOT CONTROLLER/);
  assert.doesNotMatch(source, /document\.createElement\('script'\)/, 'feature loading belongs to the shared core');
  assert.match(source, /migrateLegacyBrowserSecrets\(\)/);
  assert.match(source, /window\.getStoredCredentials/);
  assert.match(source, /btn-goto-brand/);
  assert.match(source, /btn-mode-switch/);
  assert.match(source, /window\.loadKeywordIntoCreator/);
  assert.match(source, /fetch\('\/api\/performance'\)\.catch/);

  const coreSource = await (await request('/modules/core.js', { auth: false })).text();
  const assistantSource = await (await request('/modules/assistant.js', { auth: false })).text();
  const reviewsSource = await (await request('/modules/reviews.js', { auth: false })).text();
  const recordedContentSource = await (await request('/modules/recorded-content.js', { auth: false })).text();
  const pdfReportSource = await (await request('/modules/pdf-report.js', { auth: false })).text();
  const citationSource = await (await request('/modules/citations.js', { auth: false })).text();
  const localPresenceSource = await (await request('/modules/local-presence.js', { auth: false })).text();
  const performanceSource = await (await request('/modules/performance.js', { auth: false })).text();
  const siteOptimizationSource = await (await request('/modules/site-optimization.js', { auth: false })).text();
  const aiVisibilitySource = await (await request('/modules/ai-visibility.js', { auth: false })).text();
  const brandProfileSource = await (await request('/modules/brand-profile.js', { auth: false })).text();
  const ownerModeSource = await (await request('/modules/owner-mode.js', { auth: false })).text();
  const ownerViewsSource = await (await request('/modules/owner-views.js', { auth: false })).text();
  const workspaceSource = await (await request('/modules/workspace.js', { auth: false })).text();
  const searchOpportunitiesSource = await (await request('/modules/search-opportunities.js', { auth: false })).text();
  const settingsSource = await (await request('/modules/settings.js', { auth: false })).text();
  const contentSource = await (await request('/modules/content-workspace.js', { auth: false })).text();
  assert.match(contentSource, /global\.SeoBuddyContent/);
  for (const endpoint of ['/api/generate-article', '/api/publish-ghl', '/api/index-url', '/api/history', '/api/autopilot-status', '/api/autopilot-run-now']) {
    assert.ok(contentSource.includes(endpoint));
  }
  assert.match(contentSource, /sanitizeHtml\(codeEditor\.value\)/);
  assert.match(contentSource, /loadKeywordIntoCreator/);
  assert.match(coreSource, /global\.SeoBuddyCore/);
  assert.match(assistantSource, /SEO BUDDY ASSISTANT/);
  assert.match(reviewsSource, /REVIEWS SITE/);
  assert.match(recordedContentSource, /global\.initializeRecordedContent/);
  assert.match(recordedContentSource, /\/api\/transcribe/);
  assert.match(recordedContentSource, /\/api\/social-pack/);
  assert.match(pdfReportSource, /global\.SeoBuddyPdfReport/);
  assert.match(pdfReportSource, /score: 'health-score'/);
  assert.match(pdfReportSource, /digest: 'performance-digest'/);
  assert.match(pdfReportSource, /automation: 'automation-status'/);
  assert.match(pdfReportSource, /readCheckedJson/);
  assert.match(citationSource, /window\.loadCitationWorklist/);
  assert.match(citationSource, /\/api\/citation-worklist/);
  assert.match(citationSource, /\/api\/citation-status/);
  assert.match(localPresenceSource, /window\.loadLocalAutopilot/);
  assert.match(localPresenceSource, /\/api\/local-autopilot/);
  assert.match(localPresenceSource, /\/api\/local-reply/);
  assert.match(localPresenceSource, /seo_local_checklist/);
  assert.match(performanceSource, /window\.loadPerformance/);
  assert.match(performanceSource, /window\.loadPerfDigest/);
  assert.match(performanceSource, /window\.loadMonthlyReport/);
  assert.match(performanceSource, /\/api\/performance-digest/);
  assert.match(performanceSource, /\/api\/monthly-report/);
  assert.match(siteOptimizationSource, /window\.loadOnsiteAutopilot/);
  assert.match(siteOptimizationSource, /\/api\/onsite-autopilot/);
  assert.match(siteOptimizationSource, /\/api\/onsite-schema/);
  assert.doesNotMatch(siteOptimizationSource, /window\._citCopy/);
  assert.match(siteOptimizationSource, /data-copy-type/);
  assert.match(aiVisibilitySource, /global\.loadAiVisibilitySuite/);
  assert.match(aiVisibilitySource, /global\.loadAiVisibility/);
  assert.match(aiVisibilitySource, /global\.loadFactCheck/);
  assert.match(aiVisibilitySource, /global\.loadCrawlers/);
  assert.match(aiVisibilitySource, /global\.loadReddit/);
  assert.match(aiVisibilitySource, /\/api\/aio-audit/);
  assert.match(aiVisibilitySource, /\/api\/ai-visibility/);
  assert.match(aiVisibilitySource, /\/api\/ai-factcheck/);
  assert.match(aiVisibilitySource, /\/api\/ai-crawlers/);
  assert.match(aiVisibilitySource, /\/api\/reddit-threads/);
  assert.match(brandProfileSource, /global\.loadBrandProfile/);
  assert.match(brandProfileSource, /\/api\/brand-profile/);
  assert.match(brandProfileSource, /\/api\/brand-profile\/reset/);
  assert.match(brandProfileSource, /seo:readiness-changed/);
  assert.doesNotMatch(brandProfileSource, /btn-goto-brand/);
  assert.doesNotMatch(brandProfileSource, /bpLoad\(\);/);
  assert.match(ownerModeSource, /global\.setOwnerMode/);
  assert.match(ownerModeSource, /global\.loadOwnerToday/);
  assert.doesNotMatch(ownerModeSource, /function loadOwnerResults|function loadOwnerBusiness/);
  assert.match(ownerViewsSource, /global\.loadOwnerResults/);
  assert.match(ownerViewsSource, /global\.loadOwnerBusiness/);
  assert.doesNotMatch(ownerViewsSource, /setOwnerMode|loadOwnerToday|data-ow="|authFetch/);
  assert.doesNotMatch(workspaceSource, /features\.length\s*!==\s*\d+/, 'Today must not break when another valid automation is added');
  assert.match(workspaceSource, /new Set\(data\.features\.map/);
  assert.match(ownerModeSource, /\/api\/next-moves/);
  assert.match(ownerViewsSource, /\/api\/performance/);
  assert.match(ownerViewsSource, /\/api\/business-profile/);
  assert.match(ownerModeSource, /seo:readiness-changed/);
  assert.doesNotMatch(ownerModeSource, /btn-mode-switch/);
  assert.doesNotMatch(ownerModeSource, /window\.loadToday|window\.loadGetStarted|window\.refreshReadinessBoard/);
  assert.match(searchOpportunitiesSource, /global\.syncGSCData/);
  assert.match(searchOpportunitiesSource, /global\.setDataMode/);
  assert.match(searchOpportunitiesSource, /payload\.source === 'live_gsc' \? 'live'/);
  assert.match(searchOpportunitiesSource, /global\.loadKeywordIntoCreator/);
  assert.match(searchOpportunitiesSource, /\/api\/gsc-data/);
  assert.match(searchOpportunitiesSource, /\/api\/onsite/);
  assert.match(searchOpportunitiesSource, /btn-fanout-trigger/);
  assert.doesNotMatch(searchOpportunitiesSource, /CASE_STUDY_TEMPLATES/);
  assert.match(settingsSource, /global\.loadSettingsWorkspace/);
  assert.match(settingsSource, /global\.getStoredCredentials/);
  assert.match(settingsSource, /global\.updateSiteUrlBadge/);
  assert.match(settingsSource, /\/api\/gsc-diagnostics/);
  assert.match(settingsSource, /\/api\/save-settings/);
  assert.match(settingsSource, /sessionStorage\.setItem\('seo_admin_password'/);
  assert.match(settingsSource, /localStorage\.setItem\('seo_site_url'/);
  assert.doesNotMatch(settingsSource, /localStorage\.setItem\('seo_gemini_key'|localStorage\.setItem\('seo_ghl_token'|localStorage\.setItem\('seo_gsc_json'/);
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
    '/api/performance-digest/send', '/api/monthly-report', '/api/monthly-report/send',
    '/api/transcribe', '/api/social-pack', '/api/storage-backups',
  ];
  for (const path of paths) {
    const response = await request(path, { method: 'POST', auth: false, body: {} });
    assert.ok([401, 429].includes(response.status), `${path} returned ${response.status}`);
  }
  const validAfterFailures = await request('/api/brand-profile', { method: 'POST', body: { brand: { tagline: 'Test' } } });
  assert.equal(validAfterFailures.status, 200, 'a valid password must not be locked out by bad attempts');
});

test('operator credentials can run workflows but cannot change owner settings', async () => {
  const operatorHeaders = { Authorization: `Bearer ${OPERATOR_PASSWORD}`, 'Content-Type': 'application/json' };
  const add = await request('/api/autopilot-queue/add', {
    method: 'POST', auth: false, headers: operatorHeaders, body: { topic: 'operator permission test' },
  });
  assert.equal(add.status, 200);
  const remove = await request('/api/autopilot-queue/remove', {
    method: 'POST', auth: false, headers: operatorHeaders, body: { index: 0 },
  });
  assert.equal(remove.status, 200);

  const settings = await request('/api/save-settings', {
    method: 'POST', auth: false, headers: operatorHeaders, body: { siteUrl: 'https://bestdayfitness.com/' },
  });
  assert.equal(settings.status, 403);
  assert.equal((await settings.json()).code, 'INSUFFICIENT_ROLE');

  const monthlyReport = await request('/api/monthly-report', {
    method: 'POST', auth: false, headers: operatorHeaders, body: { recipient: 'owner@example.com' },
  });
  assert.equal(monthlyReport.status, 403);
  assert.equal((await monthlyReport.json()).code, 'INSUFFICIENT_ROLE');
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
  const savedEnvironment = parseDotenv(envFile);
  assert.equal(savedEnvironment.ADMIN_PASSWORD, ADMIN_PASSWORD);
  assert.equal(savedEnvironment.OPERATOR_PASSWORD, OPERATOR_PASSWORD);

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
      DATABASE_URL: '',
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
  assert.equal(typeof article.quality.score, 'number');
  assert.equal(typeof article.quality.publishable, 'boolean');

  const published = await request('/api/publish-ghl', {
    method: 'POST',
    body: { title: 'Safe title', status: 'draft', content: '<h1>Hello</h1><img src=x onerror="alert(1)"><a href=java&#x73;cript:alert(1)>bad</a><script>alert(1)</script>' },
  });
  assert.equal(published.status, 200);
  const result = await published.json();
  assert.doesNotMatch(result.content, /onerror\s*=|<script>alert|javascript\s*:/i);
  assert.equal(result.quality.publishable, false, 'manual publishing stays available but returns an honest quality warning');
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

test('audit status verifies the mutation chain without retaining credentials or request bodies', async () => {
  const response = await request('/api/audit-status');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.audit.valid, true);
  assert.ok(body.audit.entries > 10);

  const log = readFileSync(join(tenantDir, 'audit-log.jsonl'), 'utf8');
  assert.match(log, /POST \/api\/save-settings/);
  assert.match(log, /POST \/api\/autopilot-queue\/add/);
  assert.doesNotMatch(log, /integration-test-(?:password|operator-password)/);
  assert.doesNotMatch(log, /operator permission test|INJECTED_KEY|BEGIN PRIVATE KEY/);
});

test('owner can create and independently verify a tenant-scoped backup', async () => {
  const created = await request('/api/storage-backups', { method: 'POST', body: { action: 'create' } });
  const createdBody = await created.json();
  assert.equal(created.status, 200);
  assert.equal(createdBody.backup.valid, true);
  assert.equal(createdBody.backup.tenantId, 'best-day-fitness');
  assert.ok(createdBody.backup.files.length > 0);

  const verified = await request('/api/storage-backups', {
    method: 'POST', body: { action: 'verify', id: createdBody.backup.id },
  });
  const verifiedBody = await verified.json();
  assert.equal(verified.status, 200);
  assert.equal(verifiedBody.backup.valid, true);

  const list = await request('/api/storage-backups');
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listBody.tenantId, 'best-day-fitness');
  assert.ok(listBody.backups.some(item => item.id === createdBody.backup.id && item.valid));
});
