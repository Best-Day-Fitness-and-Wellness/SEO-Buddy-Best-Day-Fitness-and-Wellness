'use strict';

const { saveJsonFileSync } = require('./json-file-store');
const { normalizeUsageState } = require('./usage-meter');
const KEY = 'usage.json';
const MISSING = Symbol('missing usage file');

// Uses the existing tenant cache and atomic writer, including its PostgreSQL
// outbox observer. No second state file, schema change, or authority cutover.
function createUsageRepository(repository) {
  function load() {
    try {
      const value = repository.readJson(KEY, MISSING);
      if (value !== MISSING) return value;
    } catch (_) {
      // Preserve a corrupt/unreadable file for diagnosis rather than replacing
      // it during boot. The meter retains the historical in-memory fallback.
      return null;
    }
    const initial = normalizeUsageState();
    try { repository.writeJson(KEY, initial); } catch (_) { /* Historical best-effort initialization. */ }
    return initial;
  }

  return { load, save: value => saveJsonFileSync(repository.pathFor(KEY), value, 'Usage') };
}

module.exports = { createUsageRepository };
