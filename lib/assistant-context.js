'use strict';

function scoreChangeLast28Days(currentScore, snapshots, nowMs) {
  const overall = currentScore?.overall ?? null;
  if (overall == null || snapshots.length <= 1) return null;

  const target = nowMs - 28 * 86400000;
  let best = null;
  for (const snapshot of snapshots) {
    const timestamp = new Date(`${snapshot.date}T00:00:00Z`).getTime();
    if (timestamp <= target && (!best || timestamp > new Date(`${best.date}T00:00:00Z`).getTime())) {
      best = snapshot;
    }
  }
  if (!best) best = snapshots[0];
  const latest = snapshots[snapshots.length - 1];
  return best && best.date !== latest.date ? overall - best.overall : null;
}

function createAssistantContext(options) {
  const {
    buildHealthScore,
    getBusinessProfile,
    business,
    getScoreSnapshots,
    getAiVisibilitySnapshot,
    getFactCheckSnapshot,
    getCrawlerSnapshot,
    getLocalNap,
    getNapExclusions,
    getCitationWorklist,
    getAioAudits,
    getConnections,
    getGooglePost,
    getMonthlyReport,
    getFailureAlerts,
    getOperationalHealth,
    getContentSchedule,
    getRedditSnapshot,
    getEngines,
    getUsage,
    getBudget,
    getSiteDomain,
    nowMs = () => Date.now(),
    nowIso = () => new Date().toISOString(),
  } = options || {};

  if (typeof buildHealthScore !== 'function') throw new TypeError('buildHealthScore is required.');
  if (typeof getBusinessProfile !== 'function') throw new TypeError('getBusinessProfile is required.');
  if (!business || typeof business !== 'object') throw new TypeError('business is required.');
  if (typeof getScoreSnapshots !== 'function') throw new TypeError('getScoreSnapshots is required.');
  if (typeof getCitationWorklist !== 'function') throw new TypeError('getCitationWorklist is required.');
  if (typeof getOperationalHealth !== 'function') throw new TypeError('getOperationalHealth is required.');

  return async function buildAssistantContext() {
    let currentScore = null;
    try { currentScore = await buildHealthScore(); } catch (_) { /* unavailable is not a stale score */ }
    const prof = (getBusinessProfile() && getBusinessProfile().profile) || {};
    const healthSnapshots = getScoreSnapshots();
    const lastScore = currentScore?.overall ?? null;
    const scoreDelta = scoreChangeLast28Days(currentScore, healthSnapshots, nowMs());
    const vis = getAiVisibilitySnapshot();
    const fc = getFactCheckSnapshot();
    const cr = getCrawlerSnapshot();
    const localNap = getLocalNap();
    const nap = localNap ? {
      mismatches: localNap.mismatchCount,
      checkedAt: localNap.checkedAt,
      listings: localNap.listings,
      excludedListings: getNapExclusions(),
    } : null;
    let cites = null;
    try {
      const targets = getCitationWorklist().targets || [];
      cites = {
        total: targets.length,
        listedOn: targets.filter(target => target.listed === true).length,
        stillToDo: targets.filter(target => (target.status || 'todo') === 'todo').length,
      };
    } catch (_) { /* unavailable stays explicit */ }
    const aioAudits = getAioAudits();
    const aioRec = aioAudits && aioAudits.length ? {
      checks: aioAudits.length,
      recommendedIn: aioAudits.filter(audit => audit.recommended).length,
    } : null;
    let systemHealth = null;
    try {
      const overview = await getOperationalHealth();
      systemHealth = {
        status: 'available',
        checkedAt: overview.checkedAt,
        overall: overview.overall,
        alerts: overview.alerts.map(item => ({ key: item.key, label: item.label, message: item.message })),
      };
    } catch (_) {
      systemHealth = { status: 'unavailable', checkedAt: null, overall: null, alerts: [] };
    }
    return {
      business: {
        name: prof.name || business.name,
        city: business.addressLocality,
        region: business.addressRegion,
        phone: prof.phone || business.telephone,
        website: prof.website || (`https://${getSiteDomain().replace(/^https?:\/\//, '')}`),
      },
      optimizationScore: lastScore,
      scoreChangeLast28Days: scoreDelta,
      scoreStatus: currentScore ? 'current-dashboard-calculation' : 'unavailable',
      contextCheckedAt: nowIso(),
      connections: getConnections(),
      googlePost: getGooglePost(),
      monthlyReport: getMonthlyReport(),
      failureAlerts: getFailureAlerts(),
      systemHealth,
      contentSchedule: getContentSchedule(),
      aiVisibility: vis ? {
        visibilityScorePct: vis.visibilityScore,
        shareOfVoicePct: vis.shareOfVoice,
        sentimentScore: vis.sentimentScore,
        enginesRun: vis.engines,
        leaderboard: (vis.leaderboard || []).slice(0, 6).map(item => ({
          name: item.name,
          scorePct: item.score,
          isYou: !!item.isBrand,
        })),
        byEngine: vis.perEngine,
      } : null,
      factCheck: fc ? {
        totalWrongClaims: fc.totalWrong,
        byEngine: (fc.results || []).map(result => ({
          engine: result.label,
          accuracyPct: result.accuracy,
          wrongClaims: (result.issues || []).filter(issue => !issue.correct).map(issue => ({
            aiSaid: issue.aiClaim,
            actualTruth: issue.truth,
          })),
        })),
      } : null,
      aiCrawlerAccess: cr ? {
        blockedCount: cr.blocked,
        totalChecked: cr.total,
        blockedBots: (cr.bots || []).filter(bot => bot.status === 'blocked').map(bot => bot.label),
      } : null,
      localListings: nap,
      citations: cites,
      singleSearchAudits: aioRec,
      reddit: (() => {
        const snapshot = getRedditSnapshot();
        return snapshot ? { threadsFound: (snapshot.threads || []).length } : null;
      })(),
      enginesConnected: getEngines().map(engine => ({ engine: engine.label, connected: engine.configured })),
      topCitationTargets: (() => {
        try {
          return (getCitationWorklist().targets || []).slice(0, 6).map(target => ({
            site: target.domain,
            alreadyListed: target.listed === true,
            type: target.type,
          }));
        } catch (_) { return null; }
      })(),
      usageThisMonth: (() => {
        const usage = getUsage();
        return {
          estimatedCostUSD: usage.estCostUSD,
          assistantMessages: usage.assistantMessages,
          aiChecksRun: (usage.groundedCalls || 0) + (usage.openaiCalls || 0) + (usage.perplexityCalls || 0),
          articlesWritten: usage.articles,
          monthlyBudgetUSD: getBudget(),
        };
      })(),
    };
  };
}

module.exports = { createAssistantContext, scoreChangeLast28Days };
