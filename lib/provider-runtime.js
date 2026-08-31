'use strict';

class ProviderRuntimeError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ProviderRuntimeError';
    this.code = options.code || 'PROVIDER_ERROR';
    this.provider = options.provider || null;
    this.statusCode = options.statusCode || null;
    this.retryable = Boolean(options.retryable);
  }
}

const DEFAULT_POLICY = Object.freeze({
  concurrency: 2,
  maxCallsPerWindow: 60,
  windowMs: 60 * 1000,
  timeoutMs: 45 * 1000,
  retries: 0,
  circuitFailures: 5,
  circuitCooldownMs: 60 * 1000,
});

function createProviderRuntime(options = {}) {
  const clock = options.now || (() => Date.now());
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const logger = options.logger || null;
  const guard = options.guard || null;
  const policies = options.policies || {};
  const states = new Map();
  const cache = new Map();
  const maxCacheEntries = Math.max(10, Number(options.maxCacheEntries) || 250);

  function stateFor(provider) {
    const name = String(provider || '').trim().toLowerCase();
    if (!name) throw new TypeError('Provider name is required.');
    if (!states.has(name)) {
      states.set(name, {
        provider: name,
        configured: null,
        inFlight: 0,
        waiters: [],
        callTimes: [],
        totalCalls: 0,
        successes: 0,
        failures: 0,
        retries: 0,
        cacheHits: 0,
        consecutiveFailures: 0,
        circuitOpenedAt: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastLatencyMs: null,
        lastError: null,
      });
    }
    return states.get(name);
  }

  function policyFor(provider, overrides = {}) {
    const policy = { ...DEFAULT_POLICY, ...(policies[provider] || {}), ...overrides };
    policy.concurrency = Math.max(1, Math.min(20, Number(policy.concurrency) || DEFAULT_POLICY.concurrency));
    policy.maxCallsPerWindow = Math.max(1, Number(policy.maxCallsPerWindow) || DEFAULT_POLICY.maxCallsPerWindow);
    policy.windowMs = Math.max(100, Number(policy.windowMs) || DEFAULT_POLICY.windowMs);
    policy.timeoutMs = Math.max(100, Number(policy.timeoutMs) || DEFAULT_POLICY.timeoutMs);
    policy.retries = Math.max(0, Math.min(3, Number(policy.retries) || 0));
    policy.circuitFailures = Math.max(1, Number(policy.circuitFailures) || DEFAULT_POLICY.circuitFailures);
    policy.circuitCooldownMs = Math.max(1000, Number(policy.circuitCooldownMs) || DEFAULT_POLICY.circuitCooldownMs);
    return policy;
  }

  function setConfigured(provider, configured) {
    stateFor(provider).configured = configured;
  }

  function configuredValue(state) {
    try { return typeof state.configured === 'function' ? Boolean(state.configured()) : state.configured; }
    catch (_) { return false; }
  }

  async function acquire(state, policy) {
    if (state.inFlight >= policy.concurrency) await new Promise(resolve => state.waiters.push(resolve));
    state.inFlight += 1;
    const timestamp = clock();
    state.callTimes = state.callTimes.filter(time => timestamp - time < policy.windowMs);
    if (state.callTimes.length >= policy.maxCallsPerWindow) {
      const waitMs = Math.max(1, policy.windowMs - (timestamp - state.callTimes[0]));
      await sleep(waitMs);
      const afterWait = clock();
      state.callTimes = state.callTimes.filter(time => afterWait - time < policy.windowMs);
    }
    state.callTimes.push(clock());
  }

  function release(state) {
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.waiters.shift()?.();
  }

  function isRetryable(error) {
    if (typeof error?.retryable === 'boolean') return error.retryable;
    const status = Number(error?.statusCode || error?.status || error?.response?.status || 0);
    if ([408, 425, 429].includes(status) || status >= 500) return true;
    return error?.name === 'AbortError' || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH'].includes(error?.code);
  }

  function cacheKeyFor(provider, key) {
    return key ? `${provider}:${key}` : null;
  }

  function pruneCache() {
    if (cache.size <= maxCacheEntries) return;
    const oldest = [...cache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [key] of oldest.slice(0, cache.size - maxCacheEntries)) cache.delete(key);
  }

  async function run(provider, operation, runOptions = {}) {
    if (typeof operation !== 'function') throw new TypeError('Provider operation must be a function.');
    const state = stateFor(provider);
    const policy = policyFor(state.provider, runOptions.policy);
    const cacheKey = cacheKeyFor(state.provider, runOptions.cacheKey);
    const cached = cacheKey ? cache.get(cacheKey) : null;
    const timestamp = clock();
    if (cached && timestamp - cached.storedAt <= (Number(runOptions.cacheTtlMs) || 0)) {
      state.cacheHits += 1;
      return cached.value;
    }

    if (state.circuitOpenedAt) {
      if (timestamp - state.circuitOpenedAt < policy.circuitCooldownMs) {
        throw new ProviderRuntimeError(`${state.provider} is temporarily unavailable after repeated failures.`, {
          code: 'PROVIDER_CIRCUIT_OPEN', provider: state.provider, retryable: true,
        });
      }
      state.circuitOpenedAt = null;
    }

    if (guard) await guard(state.provider);
    await acquire(state, policy);
    const startedAt = clock();
    let lastError = null;
    try {
      for (let attempt = 0; attempt <= policy.retries; attempt++) {
        state.totalCalls += 1;
        state.lastAttemptAt = new Date(clock()).toISOString();
        const controller = new AbortController();
        let timer;
        try {
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new ProviderRuntimeError(`${state.provider} timed out after ${policy.timeoutMs}ms.`, {
                code: 'PROVIDER_TIMEOUT', provider: state.provider, retryable: true,
              }));
            }, policy.timeoutMs);
            timer.unref?.();
          });
          const value = await Promise.race([operation({ signal: controller.signal, attempt }), timeout]);
          state.successes += 1;
          state.consecutiveFailures = 0;
          state.lastSuccessAt = new Date(clock()).toISOString();
          state.lastLatencyMs = Math.max(0, clock() - startedAt);
          state.lastError = null;
          if (cacheKey && Number(runOptions.cacheTtlMs) > 0) {
            cache.set(cacheKey, { value, storedAt: clock() });
            pruneCache();
          }
          return value;
        } catch (error) {
          lastError = error;
          const retry = attempt < policy.retries && isRetryable(error);
          if (!retry) break;
          state.retries += 1;
          await sleep(Math.min(5000, 250 * (2 ** attempt)));
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      state.failures += 1;
      state.consecutiveFailures += 1;
      state.lastFailureAt = new Date(clock()).toISOString();
      state.lastLatencyMs = Math.max(0, clock() - startedAt);
      state.lastError = String(lastError?.message || lastError || 'Provider call failed').slice(0, 300);
      if (state.consecutiveFailures >= policy.circuitFailures) state.circuitOpenedAt = clock();
      logger?.warn?.('provider.call_failed', {
        provider: state.provider,
        consecutiveFailures: state.consecutiveFailures,
        circuitOpen: Boolean(state.circuitOpenedAt),
        error: lastError,
      });
      if (cached && clock() - cached.storedAt <= (Number(runOptions.staleIfErrorMs) || 0)) {
        state.cacheHits += 1;
        return cached.value;
      }
      throw lastError;
    } finally {
      release(state);
    }
  }

  async function fetchWithPolicy(provider, url, init = {}, fetchOptions = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    const retries = fetchOptions.retries == null ? (['GET', 'HEAD'].includes(method) ? 1 : 0) : fetchOptions.retries;
    return run(provider, async ({ signal }) => {
      const response = await fetch(url, { ...init, signal });
      if (!response.ok && fetchOptions.throwOnHttpError !== false) {
        const body = await response.text().catch(() => '');
        throw new ProviderRuntimeError(`${provider} HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`, {
          code: 'PROVIDER_HTTP_ERROR',
          provider,
          statusCode: response.status,
          retryable: [408, 425, 429].includes(response.status) || response.status >= 500,
        });
      }
      return response;
    }, {
      ...fetchOptions,
      policy: { ...(fetchOptions.policy || {}), retries },
    });
  }

  function snapshot() {
    const providers = {};
    for (const [name, state] of states) {
      const configured = configuredValue(state);
      let status = configured === false ? 'unconfigured' : 'unknown';
      if (state.circuitOpenedAt) status = 'unavailable';
      else if (state.consecutiveFailures > 0) status = 'degraded';
      else if (state.lastSuccessAt) status = 'healthy';
      providers[name] = {
        configured,
        status,
        inFlight: state.inFlight,
        totalCalls: state.totalCalls,
        successes: state.successes,
        failures: state.failures,
        retries: state.retries,
        cacheHits: state.cacheHits,
        consecutiveFailures: state.consecutiveFailures,
        circuitOpen: Boolean(state.circuitOpenedAt),
        lastAttemptAt: state.lastAttemptAt,
        lastSuccessAt: state.lastSuccessAt,
        lastFailureAt: state.lastFailureAt,
        lastLatencyMs: state.lastLatencyMs,
        lastError: state.lastError,
      };
    }
    return { providers };
  }

  function clearCache(provider) {
    const prefix = provider ? `${String(provider).toLowerCase()}:` : null;
    for (const key of cache.keys()) if (!prefix || key.startsWith(prefix)) cache.delete(key);
  }

  return { clearCache, fetch: fetchWithPolicy, run, setConfigured, snapshot };
}

module.exports = { DEFAULT_POLICY, ProviderRuntimeError, createProviderRuntime };
