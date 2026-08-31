'use strict';

const STANDARD_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function createRequestMetrics(clock = () => new Date()) {
  const startedAt = clock().toISOString();
  const totals = { requests: 0, responses: 0 };
  const methods = Object.create(null);
  const statusClasses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  const latencyBuckets = { under100ms: 0, under500ms: 0, under2s: 0, over2s: 0 };
  let totalDurationMs = 0;

  function started(method) {
    totals.requests += 1;
    const candidate = String(method || '').toUpperCase();
    const key = STANDARD_METHODS.has(candidate) ? candidate : 'OTHER';
    methods[key] = (methods[key] || 0) + 1;
  }

  function finished(statusCode, durationMs) {
    totals.responses += 1;
    const statusClass = `${Math.floor(Number(statusCode) / 100)}xx`;
    if (Object.prototype.hasOwnProperty.call(statusClasses, statusClass)) statusClasses[statusClass] += 1;
    const duration = Math.max(0, Number(durationMs) || 0);
    totalDurationMs += duration;
    if (duration < 100) latencyBuckets.under100ms += 1;
    else if (duration < 500) latencyBuckets.under500ms += 1;
    else if (duration < 2000) latencyBuckets.under2s += 1;
    else latencyBuckets.over2s += 1;
  }

  function snapshot() {
    return {
      startedAt,
      totals: { ...totals },
      methods: { ...methods },
      statusClasses: { ...statusClasses },
      latencyBuckets: { ...latencyBuckets },
      averageDurationMs: totals.responses ? Math.round((totalDurationMs / totals.responses) * 10) / 10 : 0,
      inFlight: Math.max(0, totals.requests - totals.responses),
    };
  }

  return { started, finished, snapshot };
}

module.exports = { createRequestMetrics };
