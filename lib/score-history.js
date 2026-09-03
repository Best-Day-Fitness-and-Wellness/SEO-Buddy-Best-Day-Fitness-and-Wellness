'use strict';

const { SCORE_VERSION, scoreDelta, snapshotFromScore, stabilizeScore } = require('./health-score');
const { upsertDailySnapshot } = require('./daily-snapshot');

// Owns the in-process timeline, not the scoring formula or database authority.
// Existing limits and single-flight behavior are deliberately unchanged.
function createScoreHistory({ initialSnapshots, computeScore, saveSnapshots, getRuntime, now = () => new Date().toISOString() }) {
  let snapshots = initialSnapshots;
  let snapshotPromise = null;

  async function buildResponse(recordedAt = now()) {
    const score = await computeScore();
    const candidate = snapshotFromScore(score, recordedAt);
    const smoothing = stabilizeScore(snapshots, candidate);
    const current = candidate ? { ...candidate, overall: smoothing.overall } : null;
    const preview = current ? upsertDailySnapshot(snapshots, current, 180).snapshots : snapshots;
    return {
      ...score,
      runtime: getRuntime(),
      overall: smoothing.overall,
      liveOverall: score.liveOverall,
      rawOverall: score.rawOverall,
      smoothing,
      delta: scoreDelta(snapshots, current),
      history: preview.slice(-60),
    };
  }

  async function recordDaily(recordedAt = now()) {
    if (snapshotPromise) return snapshotPromise;
    snapshotPromise = (async () => {
      const today = recordedAt.slice(0, 10);
      const existing = snapshots.find(snapshot => snapshot.date === today && snapshot.version === SCORE_VERSION);
      if (existing) return existing;
      const score = await computeScore();
      const candidate = snapshotFromScore(score, recordedAt);
      if (!candidate) return null;
      const smoothing = stabilizeScore(snapshots, candidate);
      const row = { ...candidate, overall: smoothing.overall };
      const update = upsertDailySnapshot(snapshots, row, 180);
      snapshots = update.snapshots;
      if (update.changed) saveSnapshots(snapshots);
      return row;
    })().finally(() => { snapshotPromise = null; });
    return snapshotPromise;
  }

  return { buildResponse, recordDaily, get snapshots() { return snapshots; } };
}

module.exports = { createScoreHistory };
