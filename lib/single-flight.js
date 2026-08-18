'use strict';

/**
 * Coalesce overlapping calls to an asynchronous operation.
 *
 * This intentionally caches only the in-flight promise. Once the operation
 * settles, the next caller starts fresh work, so callers never receive stale
 * data.
 */
function singleFlight(operation) {
  if (typeof operation !== 'function') {
    throw new TypeError('singleFlight requires a function');
  }

  let inFlight = null;

  return function runSingleFlight(...args) {
    if (inFlight) return inFlight;

    inFlight = Promise.resolve().then(() => operation.apply(this, args));
    inFlight = inFlight.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

module.exports = { singleFlight };
