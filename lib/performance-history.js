'use strict';

const { upsertDailySnapshot } = require('./daily-snapshot');

// Owns the existing in-process timeline. Provider aggregation stays in the
// performance service; filesystem/PostgreSQL outbox details stay in the adapter.
function createPerformanceHistory({ initialSnapshots, saveSnapshots }) {
  let snapshots = initialSnapshots;

  function record(snapshot) {
    const update = upsertDailySnapshot(snapshots, snapshot, 180);
    // Preserve the historical ordering and best-effort save semantics: the
    // current process sees the new rows even when durable persistence fails.
    snapshots = update.snapshots;
    if (update.changed) saveSnapshots(snapshots);
    return snapshots;
  }

  return { record, get snapshots() { return snapshots; } };
}

module.exports = { createPerformanceHistory };
