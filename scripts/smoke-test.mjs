import assert from 'node:assert/strict';

const baseUrl = String(process.argv[2] || process.env.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('Provide the deployed URL: npm run smoke -- https://your-service.example');

async function read(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const [live, ready, deployReadiness, gsc, healthScore] = await Promise.all([
  read('/health/live'),
  read('/health/ready'),
  read('/api/deploy-readiness'),
  read('/api/gsc-data'),
  read('/api/health-score'),
]);

assert.equal(live.status, 'live');
assert.equal(ready.status, 'ready');
assert.equal(deployReadiness.runtime?.mode, 'production');
assert.equal(deployReadiness.runtime?.mockIntegrationsAllowed, false);
assert.notEqual(gsc.source, 'mock', 'Production returned mock search data');
assert.equal(healthScore.runtime?.mode, 'production');
assert.equal(healthScore.runtime?.mockIntegrationsAllowed, false);
assert.ok(Number.isInteger(healthScore.scoreVersion));
if (process.env.REQUIRE_LIVE_GSC === '1') assert.equal(gsc.source, 'live_gsc');

console.log(JSON.stringify({
  success: true,
  url: baseUrl,
  readiness: `${deployReadiness.ready}/${deployReadiness.total}`,
  gscSource: gsc.source,
  score: healthScore.overall,
  scoreVersion: healthScore.scoreVersion,
}));
