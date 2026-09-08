import test from 'node:test';
import assert from 'node:assert/strict';
import providerErrors from '../lib/public-provider-error.js';

const { providerFailureKind, publicProviderError } = providerErrors;

test('provider failures classify authentication, quota, timeout, and generic outages', () => {
  assert.equal(providerFailureKind(Object.assign(new Error('private'), { status: 401 })), 'authentication');
  assert.equal(providerFailureKind(Object.assign(new Error('private'), { code: 403 })), 'authentication');
  assert.equal(providerFailureKind(new Error('ACCESS_TOKEN_TYPE_UNSUPPORTED')), 'authentication');
  assert.equal(providerFailureKind(Object.assign(new Error('private'), { response: { status: 429 } })), 'usage-limit');
  assert.equal(providerFailureKind(Object.assign(new Error('private'), { code: 'PROVIDER_TIMEOUT' })), 'timeout');
  assert.equal(providerFailureKind(Object.assign(new Error('private'), { code: 'ENETUNREACH' })), 'timeout');
  assert.equal(providerFailureKind(new Error('private')), 'unavailable');
});

test('public provider failures are actionable and never expose upstream bodies', () => {
  const upstream = Object.assign(new Error('private upstream payload access_token=secret'), { statusCode: 401 });
  const result = publicProviderError(upstream, {
    provider: 'Gemini', operation: 'The content request', setupPath: 'Settings → Your connections → Gemini',
  });
  assert.equal(result.code, 'PROVIDER_AUTHENTICATION_FAILED');
  assert.match(result.error, /Gemini rejected the saved credential/);
  assert.match(result.error, /Settings → Your connections → Gemini/);
  assert.doesNotMatch(JSON.stringify(result), /private upstream|access_token|secret/);
});

test('provider failure labels cannot inject markup or extra lines', () => {
  const result = publicProviderError(new Error('private'), {
    provider: 'Vendor\n<script>', operation: 'Request\r\nInjected', setupPath: 'Settings\nInjected',
  });
  assert.doesNotMatch(result.error, /[\r\n<>]/);
  assert.doesNotMatch(result.error, /private/);
});
