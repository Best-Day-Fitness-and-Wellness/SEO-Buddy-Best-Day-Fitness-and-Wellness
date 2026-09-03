import assert from 'node:assert/strict';

const baseUrl = String(process.argv[2] || process.env.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('Provide the deployed URL: npm run smoke -- https://your-service.example');

async function read(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return { body, response };
}

const [liveResult, readyResult, deployResult, gscResult, scoreResult, storageResult, automationResult] = await Promise.all([
  read('/health/live'),
  read('/health/ready'),
  read('/api/deploy-readiness'),
  read('/api/gsc-data'),
  read('/api/health-score'),
  read('/api/storage-status'),
  read('/api/automation-status'),
]);

const live = liveResult.body;
const ready = readyResult.body;
const deployReadiness = deployResult.body;
const gsc = gscResult.body;
const healthScore = scoreResult.body;
const storage = storageResult.body;

assert.equal(live.status, 'live');
assert.equal(ready.status, 'ready');
assert.equal(ready.checks?.storage?.ok, true);
assert.equal(ready.checks?.storage?.persistent, true);
assert.equal(deployReadiness.runtime?.mode, 'production');
assert.equal(deployReadiness.runtime?.mockIntegrationsAllowed, false);
assert.equal(deployReadiness.ready, deployReadiness.total, 'Deployment readiness checks are incomplete');
assert.notEqual(gsc.source, 'mock', 'Production returned mock search data');
assert.equal(healthScore.runtime?.mode, 'production');
assert.equal(healthScore.runtime?.mockIntegrationsAllowed, false);
assert.ok(Number.isInteger(healthScore.scoreVersion));
assert.ok(Number.isInteger(healthScore.overall));
assert.equal(healthScore.explainability?.method, 'weighted-average-of-measured-pillars');
assert.ok(Array.isArray(healthScore.explainability?.opportunities));
assert.equal(storage.persistent, true);
assert.equal(typeof storage.backend, 'string');
assert.equal(typeof storage.tenantId, 'string');
assert.equal(automationResult.body.success, true);
assert.equal(automationResult.body.features.length, 7);
assert.ok(automationResult.body.features.some(item => item.key === 'monthly-report'));
assert.ok(automationResult.body.features.every(item => ['needs-setup', 'scheduled', 'running', 'needs-approval', 'completed', 'failed', 'paused', 'unknown'].includes(item.status)));

for (const result of [liveResult, readyResult, deployResult, gscResult, scoreResult, storageResult, automationResult]) {
  assert.match(result.response.headers.get('cache-control') || '', /no-store/);
  assert.match(result.response.headers.get('x-content-type-options') || '', /nosniff/);
  assert.match(result.response.headers.get('x-frame-options') || '', /DENY/);
  assert.match(result.response.headers.get('x-request-id') || '', /^[A-Za-z0-9._:-]{8,128}$/);
}

const indexResponse = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(15000) });
const indexHtml = await indexResponse.text();
assert.equal(indexResponse.ok, true);
assert.match(indexResponse.headers.get('content-security-policy') || '', /default-src 'self'/);
assert.match(indexResponse.headers.get('strict-transport-security') || '', /max-age=31536000/);
assert.doesNotMatch(indexHtml, /{{[A-Z0-9_]+}}/, 'Browser asset placeholders were not replaced');
const browserAssets = [...indexHtml.matchAll(/(?:href|src)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
assert.equal(browserAssets.length, 5, 'Expected five initial content-hashed browser assets');
assert.ok(browserAssets.every(asset => /\.[a-f0-9]{12}\.(?:css|js)$/.test(asset)));
const reviewsAsset = indexHtml.match(/data-reviews-asset="(\/assets\/reviews\.[a-f0-9]{12}\.js)"/)?.[1];
assert.ok(reviewsAsset, 'Expected a content-hashed lazy Reviews asset');
assert.equal(browserAssets.includes(reviewsAsset), false, 'Reviews must stay off the initial script path');
const lazyAssets = [...indexHtml.matchAll(/data-[a-z-]+-asset="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
assert.equal(new Set(lazyAssets).size, lazyAssets.length, 'Lazy feature assets must be unique');
assert.ok(lazyAssets.some(asset => /\/content-workspace\./.test(asset)), 'Content workspace must be available');
assert.ok(lazyAssets.some(asset => /\/workspace\./.test(asset)), 'Navigation preview must be available');
assert.ok(lazyAssets.some(asset => /\/owner-views\./.test(asset)), 'Shared Results and Business views must be available');
assert.ok(lazyAssets.every(asset => /\.[a-f0-9]{12}\.js$/.test(asset) && !browserAssets.includes(asset)));
await Promise.all([...browserAssets, ...lazyAssets].map(async asset => {
  const response = await fetch(`${baseUrl}${asset}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.ok, true, `${asset} failed to load`);
  assert.match(response.headers.get('cache-control') || '', /immutable/);
  assert.ok((await response.arrayBuffer()).byteLength > 0, `${asset} was empty`);
}));
if (process.env.REQUIRE_LIVE_GSC === '1') assert.equal(gsc.source, 'live_gsc');

console.log(JSON.stringify({
  success: true,
  url: baseUrl,
  readiness: `${deployReadiness.ready}/${deployReadiness.total}`,
  gscSource: gsc.source,
  score: healthScore.overall,
  scoreVersion: healthScore.scoreVersion,
  storage: storage.backend,
  assetCount: browserAssets.length + lazyAssets.length,
  initialAssetCount: browserAssets.length,
  lazyAssetCount: lazyAssets.length,
}));
