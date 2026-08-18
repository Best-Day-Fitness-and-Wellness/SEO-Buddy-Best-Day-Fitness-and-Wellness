'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { saveJsonFileSync } = require('../../../../lib/json-file-store');

function createReviewsSnapshotRepository({ dataDir }) {
  const filePath = path.join(dataDir, 'reviews-snapshots.json');

  return {
    load() {
      try {
        const snapshots = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return Array.isArray(snapshots) ? snapshots : [];
      } catch (_) {
        return [];
      }
    },

    save(snapshots) {
      return saveJsonFileSync(filePath, snapshots, 'Reviews snapshot');
    },
  };
}

module.exports = { createReviewsSnapshotRepository };
