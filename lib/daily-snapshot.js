'use strict';

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Insert or replace one date-keyed snapshot without mutating the current
 * collection. Callers can skip an expensive durable write when `changed` is
 * false, which matters for read endpoints hit repeatedly throughout the day.
 */
function upsertDailySnapshot(current, row, maxEntries) {
  if (!Array.isArray(current)) throw new TypeError('current snapshots must be an array');
  if (!row || typeof row.date !== 'string' || !row.date) throw new TypeError('snapshot requires a date');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be a positive integer');

  const index = current.findIndex(snapshot => snapshot && snapshot.date === row.date);
  if (index >= 0 && sameSnapshot(current[index], row) && current.length <= maxEntries) {
    return { snapshots: current, changed: false };
  }

  const snapshots = current.slice();
  if (index >= 0) snapshots[index] = row;
  else snapshots.push(row);

  return {
    snapshots: snapshots.length > maxEntries ? snapshots.slice(-maxEntries) : snapshots,
    changed: true,
  };
}

module.exports = { upsertDailySnapshot };
