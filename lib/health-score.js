'use strict';

const SCORE_VERSION = 2;
const SMOOTHING_DAYS = 7;
const STALE_AFTER_DAYS = 14;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function isoDay(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function scorePillars(pillars, calculatedAt = new Date().toISOString()) {
  const normalized = (Array.isArray(pillars) ? pillars : []).map(pillar => {
    if (!pillar || !pillar.measured || !Number.isFinite(Number(pillar.score))) {
      return { ...pillar, measured: false, score: null, rawScore: null, status: 'off' };
    }
    const rawScore = clamp(Number(pillar.score), 0, 100);
    return {
      ...pillar,
      score: Math.round(rawScore),
      rawScore: roundTo(rawScore),
      status: rawScore >= 75 ? 'ok' : 'warn',
    };
  });

  const measured = normalized.filter(pillar => pillar.measured);
  const measuredWeight = measured.reduce((sum, pillar) => sum + Number(pillar.weight || 0), 0);
  const totalWeight = normalized.reduce((sum, pillar) => sum + Number(pillar.weight || 0), 0) || 100;
  const rawOverall = measuredWeight
    ? measured.reduce((sum, pillar) => sum + pillar.rawScore * Number(pillar.weight || 0), 0) / measuredWeight
    : null;

  const timestamps = measured
    .map(pillar => pillar.sourceUpdatedAt)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(value => !Number.isNaN(value.getTime()));
  const calculatedMs = new Date(calculatedAt).getTime();
  const stalePillars = measured.filter(pillar => {
    if (!pillar.sourceUpdatedAt) return false;
    const sourceMs = new Date(pillar.sourceUpdatedAt).getTime();
    return Number.isFinite(sourceMs) && calculatedMs - sourceMs > STALE_AFTER_DAYS * 86400000;
  }).map(pillar => pillar.key);
  const coveragePercent = Math.round(measuredWeight / totalWeight * 100);
  const confidencePercent = Math.max(0, coveragePercent - stalePillars.length * 10);
  const confidenceLevel = confidencePercent >= 90 ? 'high' : confidencePercent >= 60 ? 'medium' : 'low';
  const explainedPillars = normalized.map(pillar => {
    if (!pillar.measured) return { ...pillar, weightedPoints: null, overallContribution: null, headroomPoints: null };
    const weight = Number(pillar.weight || 0);
    return {
      ...pillar,
      weightedPoints: roundTo(pillar.rawScore * weight / 100),
      overallContribution: measuredWeight ? roundTo(pillar.rawScore * weight / measuredWeight) : null,
      headroomPoints: measuredWeight ? roundTo((100 - pillar.rawScore) * weight / measuredWeight) : null,
    };
  });
  const opportunities = explainedPillars
    .filter(pillar => pillar.measured && pillar.headroomPoints > 0)
    .sort((a, b) => b.headroomPoints - a.headroomPoints)
    .map(pillar => ({ key: pillar.key, label: pillar.label, availableScorePoints: pillar.headroomPoints }));
  const missingSources = explainedPillars
    .filter(pillar => !pillar.measured)
    .map(pillar => ({ key: pillar.key, label: pillar.label, weight: Number(pillar.weight || 0), detail: pillar.detail }));
  const earnedWeightedPoints = roundTo(explainedPillars.reduce((sum, pillar) => sum + Number(pillar.weightedPoints || 0), 0));

  return {
    scoreVersion: SCORE_VERSION,
    overall: rawOverall == null ? null : Math.round(rawOverall),
    liveOverall: rawOverall == null ? null : Math.round(rawOverall),
    rawOverall: rawOverall == null ? null : roundTo(rawOverall),
    measuredCount: measured.length,
    totalPillars: normalized.length,
    pillars: explainedPillars,
    explainability: {
      method: 'weighted-average-of-measured-pillars',
      formula: 'sum(pillar raw score × pillar weight) ÷ measured weight',
      earnedWeightedPoints,
      measuredWeight,
      unmeasuredWeight: Math.max(0, totalWeight - measuredWeight),
      topOpportunity: opportunities[0] || null,
      opportunities,
      missingSources,
      bands: { healthyAt: 75, maximum: 100 },
    },
    confidence: {
      level: confidenceLevel,
      percent: confidencePercent,
      measuredWeight,
      totalWeight,
      stalePillars,
    },
    freshness: {
      calculatedAt,
      dataAsOf: timestamps.length
        ? new Date(Math.max(...timestamps.map(value => value.getTime()))).toISOString()
        : null,
      oldestSourceAt: timestamps.length
        ? new Date(Math.min(...timestamps.map(value => value.getTime()))).toISOString()
        : null,
    },
  };
}

function migrateSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .filter(snapshot => snapshot && snapshot.date && Number.isFinite(Number(snapshot.overall)))
    .map(snapshot => ({
      ...snapshot,
      version: Number(snapshot.version || snapshot.scoreVersion || 1),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function snapshotFromScore(score, recordedAt = new Date().toISOString()) {
  if (!score || score.liveOverall == null) return null;
  return {
    date: isoDay(recordedAt),
    version: SCORE_VERSION,
    recordedAt,
    overall: score.liveOverall,
    liveOverall: score.liveOverall,
    rawOverall: score.rawOverall,
    confidence: score.confidence,
    freshness: score.freshness,
    pillars: score.pillars.map(pillar => ({
      key: pillar.key,
      label: pillar.label,
      weight: pillar.weight,
      measured: pillar.measured,
      score: pillar.score,
      rawScore: pillar.rawScore,
      detail: pillar.detail,
      inputs: pillar.inputs || null,
      factors: pillar.factors || null,
      sourceUpdatedAt: pillar.sourceUpdatedAt || null,
      weightedPoints: pillar.weightedPoints,
      overallContribution: pillar.overallContribution,
      headroomPoints: pillar.headroomPoints,
    })),
  };
}

function stabilizeScore(snapshots, currentSnapshot, days = SMOOTHING_DAYS) {
  if (!currentSnapshot) {
    return { overall: null, rawOverall: null, samples: 0, windowDays: days, method: 'daily-average' };
  }
  const compatible = migrateSnapshots(snapshots)
    .filter(snapshot => snapshot.version === SCORE_VERSION && snapshot.date !== currentSnapshot.date)
    .concat(currentSnapshot)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-days);
  const values = compatible
    .map(snapshot => Number(snapshot.rawOverall ?? snapshot.liveOverall ?? snapshot.overall))
    .filter(Number.isFinite);
  const rawOverall = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    overall: rawOverall == null ? null : Math.round(rawOverall),
    rawOverall: rawOverall == null ? null : roundTo(rawOverall),
    samples: values.length,
    windowDays: days,
    method: 'daily-average',
  };
}

function scoreDelta(snapshots, currentSnapshot, days = 28) {
  if (!currentSnapshot) return null;
  const compatible = migrateSnapshots(snapshots)
    .filter(snapshot => snapshot.version === SCORE_VERSION && snapshot.date !== currentSnapshot.date)
    .concat(currentSnapshot)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const targetMs = new Date(currentSnapshot.date + 'T00:00:00Z').getTime() - days * 86400000;
  let baseline = null;
  for (const snapshot of compatible) {
    const snapshotMs = new Date(snapshot.date + 'T00:00:00Z').getTime();
    if (snapshotMs <= targetMs) baseline = snapshot;
  }
  return baseline ? currentSnapshot.overall - baseline.overall : null;
}

module.exports = {
  SCORE_VERSION,
  SMOOTHING_DAYS,
  clamp,
  migrateSnapshots,
  scoreDelta,
  scorePillars,
  snapshotFromScore,
  stabilizeScore,
};
