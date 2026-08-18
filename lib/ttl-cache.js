'use strict';

/**
 * Cache one asynchronous dashboard computation for a short period while also
 * coalescing concurrent callers. A previously successful value can be served
 * during a brief upstream outage instead of turning a dependency hiccup into
 * a dashboard-wide failure.
 */
function ttlCache(operation, options = {}) {
  if (typeof operation !== 'function') throw new TypeError('ttlCache requires a function');

  const ttlMs = Number(options.ttlMs);
  const staleIfErrorMs = Number(options.staleIfErrorMs || 0);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new TypeError('ttlMs must be a non-negative number');
  if (!Number.isFinite(staleIfErrorMs) || staleIfErrorMs < 0) throw new TypeError('staleIfErrorMs must be a non-negative number');

  let cachedValue;
  let hasValue = false;
  let expiresAt = 0;
  let staleUntil = 0;
  let inFlight = null;

  function run(...args) {
    const startedAt = now();
    if (hasValue && startedAt < expiresAt) return Promise.resolve(cachedValue);
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(() => operation.apply(this, args))
      .then(value => {
        const completedAt = now();
        cachedValue = value;
        hasValue = true;
        expiresAt = completedAt + ttlMs;
        staleUntil = expiresAt + staleIfErrorMs;
        return value;
      })
      .catch(error => {
        if (hasValue && now() < staleUntil) return cachedValue;
        throw error;
      })
      .finally(() => { inFlight = null; });

    return inFlight;
  }

  run.clear = () => {
    cachedValue = undefined;
    hasValue = false;
    expiresAt = 0;
    staleUntil = 0;
  };

  return run;
}

module.exports = { ttlCache };
