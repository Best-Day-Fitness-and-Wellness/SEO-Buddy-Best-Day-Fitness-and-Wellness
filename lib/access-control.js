'use strict';

const crypto = require('node:crypto');

const ROLE_LEVEL = Object.freeze({ operator: 1, owner: 2 });

function constantTimeEqual(left, right) {
  const supplied = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function tokenFingerprint(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 12);
}

function createAccessControl(options = {}) {
  const ownerToken = String(options.ownerToken || '');
  const operatorToken = String(options.operatorToken || '');
  const now = options.now || Date.now;
  const failures = new Map();
  const maxFailures = options.maxFailures || 8;
  const windowMs = options.windowMs || 15 * 60 * 1000;

  function credentials(req) {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    return bearer || String(req.headers['x-admin-token'] || '').trim();
  }

  function authenticate(token) {
    if (ownerToken && constantTimeEqual(token, ownerToken)) return { role: 'owner', actorId: `owner:${tokenFingerprint(token)}` };
    if (operatorToken && constantTimeEqual(token, operatorToken)) return { role: 'operator', actorId: `operator:${tokenFingerprint(token)}` };
    return null;
  }

  function requireRole(minimumRole = 'operator') {
    if (!ROLE_LEVEL[minimumRole]) throw new TypeError(`Unknown access role: ${minimumRole}`);
    return function authorize(req, res, next) {
      // Preserve the established local-development workflow. Production
      // readiness still reports an unset owner password as a security warning.
      if (!ownerToken && !operatorToken) {
        req.auth = { role: 'owner', actorId: 'local-open-mode', openMode: true };
        return next();
      }

      const timestamp = now();
      const key = req.ip || req.socket.remoteAddress || 'unknown';
      const token = credentials(req);
      const identity = authenticate(token);
      if (identity) {
        failures.delete(key);
        req.auth = identity;
        if (ROLE_LEVEL[identity.role] < ROLE_LEVEL[minimumRole]) {
          return res.status(403).json({ success: false, code: 'INSUFFICIENT_ROLE', error: 'This action requires the owner password.' });
        }
        return next();
      }

      const prior = failures.get(key);
      if (prior && prior.resetAt > timestamp && prior.count >= maxFailures) {
        res.setHeader('Retry-After', String(Math.ceil((prior.resetAt - timestamp) / 1000)));
        return res.status(429).json({ success: false, code: 'AUTH_RATE_LIMITED', error: 'Too many incorrect password attempts. Wait a few minutes, then try again.' });
      }
      if (prior && prior.resetAt <= timestamp) failures.delete(key);
      failures.set(key, prior && prior.resetAt > timestamp
        ? { count: prior.count + 1, resetAt: prior.resetAt }
        : { count: 1, resetAt: timestamp + windowMs });
      if (failures.size > 5000) {
        for (const [address, entry] of failures) if (entry.resetAt <= timestamp) failures.delete(address);
        if (failures.size > 10000) failures.clear();
      }
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Unauthorized. Enter the admin password in Settings to perform this action.' });
    };
  }

  return {
    configuredRoles: () => ({ owner: Boolean(ownerToken), operator: Boolean(operatorToken) }),
    requireRole,
  };
}

module.exports = { ROLE_LEVEL, constantTimeEqual, createAccessControl, tokenFingerprint };
