import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createProviderRuntime } = require('../lib/provider-runtime.js');

async function withHttpServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

test('provider HTTP contract retries a transient GET and returns the successful response', async () => {
  let calls = 0;
  await withHttpServer((req, res) => {
    calls += 1;
    res.writeHead(calls === 1 ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(calls === 1 ? { error: 'temporary' } : { ok: true }));
  }, async baseUrl => {
    const runtime = createProviderRuntime({ sleep: async () => {} });
    const response = await runtime.fetch('contract-get', `${baseUrl}/resource`, {}, { retries: 1 });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls, 2);
    assert.equal(runtime.snapshot().providers['contract-get'].retries, 1);
  });
});

test('provider HTTP contract never retries a non-idempotent POST by default', async () => {
  let calls = 0;
  await withHttpServer((req, res) => {
    calls += 1;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'temporary' }));
  }, async baseUrl => {
    const runtime = createProviderRuntime({ sleep: async () => {} });
    await assert.rejects(
      runtime.fetch('contract-post', `${baseUrl}/publish`, { method: 'POST', body: '{}' }),
      error => error.code === 'PROVIDER_HTTP_ERROR' && error.statusCode === 503,
    );
    assert.equal(calls, 1);
    assert.equal(runtime.snapshot().providers['contract-post'].retries, 0);
  });
});

test('provider HTTP contract does not retry permanent client errors', async () => {
  let calls = 0;
  await withHttpServer((req, res) => {
    calls += 1;
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad request' }));
  }, async baseUrl => {
    const runtime = createProviderRuntime({ sleep: async () => {} });
    await assert.rejects(
      runtime.fetch('contract-client-error', `${baseUrl}/resource`, {}, { retries: 2 }),
      error => error.code === 'PROVIDER_HTTP_ERROR' && error.retryable === false,
    );
    assert.equal(calls, 1);
  });
});

test('provider HTTP contract aborts a slow upstream at its configured deadline', async () => {
  await withHttpServer((req, res) => {
    setTimeout(() => {
      if (!res.destroyed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ late: true }));
      }
    }, 500).unref?.();
  }, async baseUrl => {
    const runtime = createProviderRuntime();
    const startedAt = Date.now();
    await assert.rejects(
      runtime.fetch('contract-timeout', `${baseUrl}/slow`, {}, { retries: 0, policy: { timeoutMs: 100 } }),
      error => error.code === 'PROVIDER_TIMEOUT' && error.retryable === true,
    );
    assert.ok(Date.now() - startedAt < 450, 'provider deadline was not enforced promptly');
    assert.equal(runtime.snapshot().providers['contract-timeout'].failures, 1);
  });
});
