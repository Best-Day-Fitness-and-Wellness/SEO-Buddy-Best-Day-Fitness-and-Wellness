'use strict';

const crypto = require('node:crypto');

const DEFAULT_POLICY = Object.freeze({
  maxFailures: 8,
  windowMs: 15 * 60 * 1000,
  cleanupThreshold: 5000,
  hardLimit: 10000,
});

/**
 * Build the admin authentication middleware with process-local rate limiting.
 * The dependency injection points make the policy independently testable while
 * retaining the original HTTP behavior and response payloads.
 */
function createAdminAuth({ password = '', now = Date.now, policy = DEFAULT_POLICY } = {}) {
  const failures = new Map();

  return function requireAuth(req, res, next) {
    if (!password) return next();

    const currentTime = now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const prior = failures.get(key);
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || (req.headers['x-admin-token'] || '').trim();
    const supplied = Buffer.from(token);
    const expected = Buffer.from(password);

    if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)) {
      failures.delete(key);
      return next();
    }

    if (prior && prior.resetAt > currentTime && prior.count >= policy.maxFailures) {
      res.setHeader('Retry-After', String(Math.ceil((prior.resetAt - currentTime) / 1000)));
      return res.status(429).json({
        success: false,
        error: 'Too many incorrect password attempts. Wait a few minutes, then try again.',
      });
    }

    if (prior && prior.resetAt <= currentTime) failures.delete(key);
    const nextFailure = prior && prior.resetAt > currentTime
      ? { count: prior.count + 1, resetAt: prior.resetAt }
      : { count: 1, resetAt: currentTime + policy.windowMs };

    if (failures.size > policy.cleanupThreshold) {
      for (const [address, entry] of failures) {
        if (entry.resetAt <= currentTime) failures.delete(address);
      }
      if (failures.size > policy.hardLimit) failures.clear();
    }

    failures.set(key, nextFailure);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Enter the admin password in Settings to perform this action.',
    });
  };
}

module.exports = { createAdminAuth, DEFAULT_POLICY };
