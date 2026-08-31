'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function digest(payload, signingKey) {
  return signingKey
    ? crypto.createHmac('sha256', signingKey).update(payload).digest('hex')
    : crypto.createHash('sha256').update(payload).digest('hex');
}

function createAuditLog(options) {
  const filePath = options.filePath;
  const signingKey = String(options.signingKey || '');
  const clock = options.clock || (() => new Date());
  let previousHash = 'GENESIS';

  if (fs.existsSync(filePath)) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      if (lines.length) previousHash = JSON.parse(lines[lines.length - 1]).hash || previousHash;
    } catch (_) { /* verification reports corruption; new records still append */ }
  }

  function record(event) {
    const entry = {
      timestamp: clock().toISOString(),
      requestId: event.requestId || null,
      actorId: event.actorId || 'anonymous',
      role: event.role || 'anonymous',
      action: event.action,
      statusCode: Number(event.statusCode),
      outcome: event.outcome || (Number(event.statusCode) < 400 ? 'success' : 'failure'),
      previousHash,
    };
    const payload = JSON.stringify(entry);
    entry.hash = digest(payload, signingKey);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* Windows ignores POSIX modes */ }
    previousHash = entry.hash;
    return entry;
  }

  function verify() {
    if (!fs.existsSync(filePath)) return { valid: true, entries: 0, signed: Boolean(signingKey) };
    try {
      const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      let prior = 'GENESIS';
      for (let index = 0; index < lines.length; index++) {
        const entry = JSON.parse(lines[index]);
        const hash = entry.hash;
        const unsigned = { ...entry };
        delete unsigned.hash;
        if (entry.previousHash !== prior || digest(JSON.stringify(unsigned), signingKey) !== hash) {
          return { valid: false, entries: lines.length, invalidAt: index + 1, signed: Boolean(signingKey) };
        }
        prior = hash;
      }
      return { valid: true, entries: lines.length, signed: Boolean(signingKey), head: prior };
    } catch (error) {
      return { valid: false, entries: 0, error: error.code || 'INVALID_AUDIT_LOG', signed: Boolean(signingKey) };
    }
  }

  return { record, verify };
}

module.exports = { createAuditLog };
