'use strict';

function normalizedStatus(error) {
  const numericCode = Number(error?.code);
  const value = Number(error?.statusCode || error?.status || error?.response?.status
    || (Number.isFinite(numericCode) ? numericCode : 0));
  return Number.isFinite(value) ? value : 0;
}

function safeLabel(value, fallback) {
  const text = String(value || '').replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return text || fallback;
}

function providerFailureKind(error) {
  const status = normalizedStatus(error);
  const source = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if ([401, 403].includes(status) || /unauthenticated|invalid auth|api.?key.*invalid|access_token_type_unsupported|permission denied/.test(source)) return 'authentication';
  if (status === 429 || /resource_exhausted|rate.?limit|quota|billing|budget/.test(source)) return 'usage-limit';
  if (error?.name === 'AbortError' || error?.code === 'PROVIDER_TIMEOUT'
    || /timed? ?out|timeout|econnreset|econnrefused|enetunreach|enetwork|enotfound|eai_again|etimedout/.test(source)) return 'timeout';
  return 'unavailable';
}

function publicProviderError(error, options = {}) {
  const provider = safeLabel(options.provider, 'The external service');
  const operation = safeLabel(options.operation, 'This request');
  const setupPath = safeLabel(options.setupPath, 'Settings → Your connections');
  const kind = providerFailureKind(error);
  if (kind === 'authentication') return {
    code: 'PROVIDER_AUTHENTICATION_FAILED',
    error: `${provider} rejected the saved credential. Open ${setupPath}, replace it, save, and try again.`,
  };
  if (kind === 'usage-limit') return {
    code: 'PROVIDER_USAGE_LIMIT_REACHED',
    error: `${provider} is not accepting more requests because its usage limit was reached. Check its billing and usage limits, then try again.`,
  };
  if (kind === 'timeout') return {
    code: 'PROVIDER_TIMEOUT',
    error: `${provider} did not respond in time. Your saved data was not changed; try again in a moment.`,
  };
  return {
    code: 'PROVIDER_UNAVAILABLE',
    error: `${operation} could not be completed because ${provider} is temporarily unavailable. Your saved data was not changed; try again.`,
  };
}

module.exports = { normalizedStatus, providerFailureKind, publicProviderError };
