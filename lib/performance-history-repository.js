'use strict';

const { saveJsonFileSync } = require('./json-file-store');
const KEY = 'performance.json';

function createPerformanceHistoryRepository(repository) {
  function load() {
    try { return repository.readJson(KEY, []); }
    catch (_) { return []; }
  }

  // A read must not seed, repair, migrate, truncate, or reorder the stored
  // history. Keep the existing parser contract and atomic writer/outbox path.
  return { load, save: rows => saveJsonFileSync(repository.pathFor(KEY), rows, 'Performance') };
}

module.exports = { createPerformanceHistoryRepository };
