'use strict';

const { saveJsonFileSync } = require('./json-file-store');
const KEY = 'history.json';
const MISSING = Symbol('missing publication history');

function createPublicationHistoryRepository(repository) {
  function load() {
    try {
      const rows = repository.readJson(KEY, MISSING);
      if (rows !== MISSING) return rows;
    } catch (_) { return []; }

    // Legacy first-boot seed retained for strict compatibility, not evidence of
    // an actual publication/indexing operation. Never seed an existing file.
    const rows = [{
      title: 'The Ultimate Guide to Senior Mobility Training',
      keyword: 'mobility training st pete',
      platform: 'GoHighLevel (Draft)',
      date: '2026-07-16',
      indexed: 'Indexing Requested',
      url: 'https://bestdayfitness.com/post/mobility-training-st-pete',
    }];
    // Unlike later best-effort saves, initialization historically fails boot on
    // a write error. Do not silently change that contract during extraction.
    repository.writeJson(KEY, rows);
    return rows;
  }

  return { load, save: rows => saveJsonFileSync(repository.pathFor(KEY), rows, 'History File') };
}

module.exports = { createPublicationHistoryRepository };
