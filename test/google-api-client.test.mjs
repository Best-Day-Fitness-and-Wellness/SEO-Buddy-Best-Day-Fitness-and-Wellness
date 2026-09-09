import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  GOOGLE_SCOPES,
  credentialShape,
  looksLikeServiceAccount,
  parseServiceAccountJson,
  createGoogleApiClient,
} = require('../lib/google-api-client');

const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----';

function fixture(overrides = {}) {
  const calls = [];
  class JWT {
    constructor(...args) {
      this.args = args;
      calls.push({ type: 'jwt', args });
    }
  }
  class GoogleAuth {
    constructor(options) {
      this.options = options;
      calls.push({ type: 'file-auth', options });
    }
  }
  const google = {
    auth: { JWT, GoogleAuth },
    webmasters: options => {
      calls.push({ type: 'webmasters', options });
      return { searchanalytics: { query: async request => ({ data: { request } }) } };
    },
    indexing: options => {
      calls.push({ type: 'indexing', options });
      return { urlNotifications: { publish: async request => ({ data: { request } }) } };
    },
  };
  const providerRuntime = {
    run: async (provider, operation, options) => {
      calls.push({ type: 'provider', provider, options });
      return operation();
    },
  };
  const logger = {
    error: (...args) => calls.push({ type: 'error', args }),
    warn: (...args) => calls.push({ type: 'warn', args }),
  };
  const env = {};
  const client = createGoogleApiClient({ google, providerRuntime, logger, env, ...overrides });
  return { client, calls, env };
}

test('credential diagnostics redact values while retaining damaged character shape', () => {
  const shape = credentialShape('“Secret 123”\n');
  assert.match(shape, /U\+201C/);
  assert.match(shape, /\\n/);
  assert.equal(shape.includes('Secret'), false);
  assert.equal(shape.includes('123'), false);
});

test('service-account parser preserves strict JSON and reports missing required fields', () => {
  const valid = parseServiceAccountJson(JSON.stringify({ client_email: 'robot@example.test', private_key: PRIVATE_KEY }));
  assert.equal(valid.repaired, false);
  assert.equal(valid.creds.client_email, 'robot@example.test');

  const wrongFile = parseServiceAccountJson(JSON.stringify({ project_id: 'wrong-file' }));
  assert.equal(wrongFile.creds, null);
  assert.match(wrongFile.error, /client_email or private_key/);
  assert.equal(wrongFile.shape.includes('wrong-file'), false);
});

test('service-account parser repairs common rich-text damage only for a valid PEM key', () => {
  const damaged = `﻿{“client_email”:“robot@example.test”,“private_key”:“${PRIVATE_KEY.replaceAll('\n', '\\n')}”,}`;
  const repaired = parseServiceAccountJson(damaged);
  assert.equal(repaired.repaired, true);
  assert.deepEqual(repaired.repairs, ['a byte-order mark', 'quotes curled by a word processor', 'a trailing comma']);
  assert.equal(repaired.creds.private_key, PRIVATE_KEY);
  assert.equal(looksLikeServiceAccount(repaired.creds), true);

  const malformed = parseServiceAccountJson('{“client_email”:“robot@example.test”,}');
  assert.equal(malformed.creds, null);
  assert.match(malformed.error, /not a service-account key/);
});

test('raw credentials create the same scoped JWT and are read dynamically', () => {
  const { client, calls, env } = fixture();
  assert.equal(client.getGoogleAuth(), null);

  env.GOOGLE_APPLICATION_CREDENTIALS = JSON.stringify({ client_email: 'robot@example.test', private_key: PRIVATE_KEY });
  const auth = client.getGoogleAuth();
  assert.deepEqual(auth.args, ['robot@example.test', null, PRIVATE_KEY, GOOGLE_SCOPES, null]);
  assert.equal(calls.filter(call => call.type === 'jwt').length, 1);
});

test('file credentials resolve relative to the app root and missing files remain unconfigured', () => {
  const checked = [];
  const fsImpl = { existsSync: file => { checked.push(file); return file.endsWith('service-account.json'); } };
  const pathImpl = { isAbsolute: value => value.startsWith('ABS:'), join: (...parts) => parts.join('|') };
  const { client, env } = fixture({ fsImpl, pathImpl, baseDir: 'APP' });

  env.GOOGLE_APPLICATION_CREDENTIALS = 'config/service-account.json';
  const auth = client.getGoogleAuth();
  assert.equal(auth.options.keyFile, 'APP|config/service-account.json');
  assert.deepEqual(auth.options.scopes, GOOGLE_SCOPES);
  assert.deepEqual(checked, ['APP|config/service-account.json']);

  env.GOOGLE_APPLICATION_CREDENTIALS = 'missing.json';
  assert.equal(client.getGoogleAuth(), null);
});

test('Search Console and Indexing calls retain exact clients, payloads, and provider policies', async () => {
  const { client, calls } = fixture();
  const auth = { account: 'service' };
  const search = client.createWebmasters(auth);
  const indexing = client.createIndexingClient(auth);
  const searchRequest = { siteUrl: 'sc-domain:example.test', requestBody: { rowLimit: 10 } };
  const indexRequest = { requestBody: { url: 'https://example.test/post', type: 'URL_UPDATED' } };

  assert.deepEqual(await client.searchConsoleQuery(search, searchRequest), { data: { request: searchRequest } });
  assert.deepEqual(await client.publishIndexNotification(indexing, indexRequest), { data: { request: indexRequest } });
  assert.deepEqual(calls.find(call => call.type === 'webmasters').options, { version: 'v3', auth });
  assert.deepEqual(calls.find(call => call.type === 'indexing').options, { version: 'v3', auth });
  assert.deepEqual(calls.filter(call => call.type === 'provider').map(call => ({ provider: call.provider, policy: call.options.policy })), [
    { provider: 'search-console', policy: { retries: 1, timeoutMs: 30000 } },
    { provider: 'google-indexing', policy: { retries: 0, timeoutMs: 30000 } },
  ]);
});

test('adapter validates every required integration boundary at composition time', () => {
  assert.throws(() => createGoogleApiClient({ google: {} }), /google auth client is required/);
  assert.throws(() => createGoogleApiClient({ google: { auth: { JWT() {}, GoogleAuth() {} } } }), /google webmasters client is required/);
  assert.throws(() => createGoogleApiClient({
    google: { auth: { JWT() {}, GoogleAuth() {} }, webmasters() {}, indexing() {} },
  }), /providerRuntime\.run is required/);
});
