import assert from 'node:assert/strict';

if (process.env.RUN_VENDOR_STAGING_CONTRACTS !== '1') {
  console.log('Vendor staging contracts skipped. Set RUN_VENDOR_STAGING_CONTRACTS=1 to opt in.');
  process.exit(0);
}

const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
const ownerToken = String(process.env.STAGING_OWNER_TOKEN || '');
assert.ok(/^https:\/\//.test(baseUrl), 'STAGING_BASE_URL must be an HTTPS URL.');
assert.ok(ownerToken, 'STAGING_OWNER_TOKEN is required.');

async function read(path, { authenticated = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: authenticated ? { Authorization: `Bearer ${ownerToken}` } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${body?.error || 'unknown error'}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  return body;
}

const [ready, search, engines, gbp, health] = await Promise.all([
  read('/health/ready'),
  read('/api/gsc-data'),
  read('/api/ai-engines'),
  read('/api/gbp-status'),
  read('/api/integration-health', { authenticated: true }),
]);

assert.equal(ready.status, 'ready');
assert.equal(ready.checks?.runtime?.mode, 'production');
assert.equal(ready.checks?.runtime?.mockIntegrationsAllowed, false);
assert.equal(search.source, 'live_gsc', 'Staging Search Console must return live evidence.');
assert.ok(Array.isArray(engines.engines));
assert.equal(typeof gbp.configured, 'boolean');
assert.equal(health.success, true);
assert.ok(Array.isArray(health.overview?.integrations));

const configured = health.overview.integrations.filter(item => item.configured).map(item => item.key);
console.log(JSON.stringify({ success: true, checks: 5, searchSource: search.source, configuredProviders: configured }));
