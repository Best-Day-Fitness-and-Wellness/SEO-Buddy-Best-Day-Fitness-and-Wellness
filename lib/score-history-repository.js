'use strict';

const { migrateSnapshots } = require('./health-score');
const { saveJsonFileSync } = require('./json-file-store');
const KEY = 'health-score.json';

function createScoreHistoryRepository(repository) {
  function load() {
    try { return migrateSnapshots(repository.readJson(KEY, [])); }
    catch (_) { return []; }
  }

  // Loading never initializes, repairs, or writes the file. Only the existing
  // daily recorder persists, through the same atomic writer/outbox observer.
  return { load, save: rows => saveJsonFileSync(repository.pathFor(KEY), rows, 'Health') };
}

module.exports = { createScoreHistoryRepository };
