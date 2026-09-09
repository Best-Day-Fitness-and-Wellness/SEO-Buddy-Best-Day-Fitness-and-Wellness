'use strict';

function createMonthlyReportDataService(options = {}) {
  const {
    buildScore,
    getPerformance,
    getSearch,
    getReviews,
    getQueue,
    buildMoves,
    getProfile,
    getHistory,
    getAiState,
    getDigest,
    buildAutomation,
    getAutomationFeatures,
    getWorkerRunning,
    buildReadiness,
    nowIso = () => new Date().toISOString(),
    logger = console,
  } = options;

  const required = {
    buildScore,
    getPerformance,
    getSearch,
    getReviews,
    getQueue,
    buildMoves,
    getProfile,
    getHistory,
    getAiState,
    getDigest,
    buildAutomation,
    getAutomationFeatures,
    getWorkerRunning,
    buildReadiness,
    nowIso,
  };
  for (const [name, dependency] of Object.entries(required)) {
    if (typeof dependency !== 'function') throw new TypeError(`${name} is required.`);
  }
  if (!logger || typeof logger.warn !== 'function') throw new TypeError('logger.warn is required.');

  async function safe(operation) {
    try {
      return await operation();
    } catch (error) {
      logger.warn('monthly_report.source_unavailable', { error });
      return null;
    }
  }

  async function build() {
    const [score, performance, search, reviews, queue] = await Promise.all([
      safe(async () => ({ success: true, ...(await buildScore()) })),
      safe(() => getPerformance()),
      safe(() => getSearch()),
      safe(async () => ({ success: true, ...(await getReviews()) })),
      safe(() => getQueue()),
    ]);
    const ai = getAiState();
    return {
      score,
      performance,
      moves: { success: true, moves: buildMoves() },
      profile: { success: true, profile: getProfile() },
      search,
      history: getHistory(),
      ai: { latest: ai.snapshots.at(-1) || null, lastRun: ai.lastRun },
      digest: getDigest(),
      automation: queue
        ? {
          success: true,
          checkedAt: nowIso(),
          features: buildAutomation(getAutomationFeatures(), queue, getWorkerRunning()),
        }
        : null,
      reviews,
      readiness: buildReadiness(),
    };
  }

  return { build };
}

module.exports = { createMonthlyReportDataService };
