'use strict';

const { clamp, scorePillars } = require('./health-score');

function createHealthScoreService(options) {
  const {
    getPerformance,
    getLocalState,
    effectiveNap,
    getAiAudits,
    getCitationState,
    eligibleCitationState,
    getPublicationHistory,
    isAutopilotEnabled,
    calculate = scorePillars,
    now = () => Date.now(),
  } = options;

  if (typeof getPerformance !== 'function') throw new TypeError('getPerformance is required.');
  if (typeof getLocalState !== 'function') throw new TypeError('getLocalState is required.');
  if (typeof effectiveNap !== 'function') throw new TypeError('effectiveNap is required.');
  if (typeof getAiAudits !== 'function') throw new TypeError('getAiAudits is required.');
  if (typeof getCitationState !== 'function') throw new TypeError('getCitationState is required.');
  if (typeof eligibleCitationState !== 'function') throw new TypeError('eligibleCitationState is required.');
  if (typeof getPublicationHistory !== 'function') throw new TypeError('getPublicationHistory is required.');
  if (typeof isAutopilotEnabled !== 'function') throw new TypeError('isAutopilotEnabled is required.');

  async function compute() {
    const pillars = [];

    // 1. Found on Google (25%) — GSC leaks + rank.
    try {
      const performance = await getPerformance();
      if (performance.source === 'live_gsc' && performance.current) {
        const snapshot = performance.snapshots?.length ? performance.snapshots.at(-1) : null;
        const leaks = snapshot && typeof snapshot.leaks === 'number' ? snapshot.leaks : 0;
        const position = performance.current.avgPosition || 30;
        const leakScore = 100 - Math.min(leaks * 5, 40);
        const rankScore = clamp(100 - (position - 3) * (100 / 27), 0, 100);
        pillars.push({
          key: 'found', label: 'Found on Google', weight: 25, measured: true,
          score: 0.6 * leakScore + 0.4 * rankScore,
          detail: `${leaks} search${leaks === 1 ? '' : 'es'} with no clicks · avg rank ${position}`,
          inputs: { leaks, averagePosition: position },
          factors: [
            { key: 'clickGaps', label: 'Searches with impressions but no clicks', share: 60, score: Math.round(leakScore) },
            { key: 'averageRank', label: 'Average Google position', share: 40, score: Math.round(rankScore) },
          ],
          sourceUpdatedAt: snapshot?.date ? `${snapshot.date}T00:00:00.000Z` : null,
        });
      } else {
        pillars.push({ key: 'found', label: 'Found on Google', weight: 25, measured: false, score: null, detail: 'Connect Search Console to measure' });
      }
    } catch (_) {
      pillars.push({ key: 'found', label: 'Found on Google', weight: 25, measured: false, score: null, detail: 'Not measured yet' });
    }

    // 2. Local listings (20%) — NAP mismatches and GBP activity.
    const local = getLocalState();
    if (local?.nap) {
      const nap = effectiveNap(local.nap, local.napExclusions);
      const mismatches = nap.mismatchCount || 0;
      let score = clamp(100 - mismatches * 15, 0, 100);
      if (local.gbpDraft?.posted) score = clamp(score + 8, 0, 100);
      pillars.push({
        key: 'local', label: 'Local listings', weight: 20, measured: true, score,
        detail: mismatches ? `${mismatches} listing${mismatches > 1 ? 's' : ''} to fix` : 'No mismatches in monitored listings',
        inputs: { mismatches, excludedListings: nap.excludedListings?.length || 0, unverifiedListings: nap.unverifiedCount || 0, gbpPosted: !!local.gbpDraft?.posted },
        factors: [
          { key: 'napConsistency', label: 'Name, address, and phone consistency', value: mismatches, effect: `${mismatches * 15}-point mismatch penalty` },
          { key: 'gbpActivity', label: 'Current Google Business Profile activity', value: !!local.gbpDraft?.posted, effect: 'Up to 8 bonus points' },
        ],
        sourceUpdatedAt: local.lastNapRun || local.gbpDraft?.postedAt || local.gbpDraft?.createdAt || null,
      });
    } else {
      pillars.push({ key: 'local', label: 'Local listings', weight: 20, measured: false, score: null, detail: 'Run a listings check to measure' });
    }

    // 3. AI recommends you (20%) — observed recommendation rate.
    const audits = getAiAudits();
    if (audits?.length) {
      const recommended = audits.filter(audit => audit.recommended).length;
      const latestAudit = audits[0] || {};
      pillars.push({
        key: 'ai', label: 'AI recommends you', weight: 20, measured: true,
        score: recommended / audits.length * 100,
        detail: `Recommended in ${recommended} of ${audits.length} check${audits.length > 1 ? 's' : ''}`,
        inputs: { recommended, checks: audits.length },
        factors: [{ key: 'recommendationRate', label: 'Observed AI recommendation rate', numerator: recommended, denominator: audits.length }],
        sourceUpdatedAt: latestAudit.timestamp || latestAudit.createdAt || latestAudit.date || null,
      });
    } else {
      pillars.push({ key: 'ai', label: 'AI recommends you', weight: 20, measured: false, score: null, detail: 'Run an AI visibility check to measure' });
    }

    // 4. Get listed (20%) — eligible AI-cited source coverage.
    const citations = getCitationState();
    const eligible = eligibleCitationState(citations);
    if (eligible.targets.length) {
      const statuses = citations.statuses || {};
      const total = eligible.targets.length;
      const listed = eligible.targets.filter(target => target.listed === true || statuses[target.domain]?.status === 'live').length;
      pillars.push({
        key: 'listed', label: 'Get listed', weight: 20, measured: true,
        score: listed / total * 100,
        detail: `On ${listed} of ${total} eligible source${total > 1 ? 's' : ''} AI cites`,
        inputs: { listed, total, excludedCompetitors: eligible.excludedCompetitorCount },
        factors: [{ key: 'citationCoverage', label: 'Confirmed live on AI-cited sources', numerator: listed, denominator: total }],
        sourceUpdatedAt: citations.lastScanned || citations.lastRun || null,
      });
    } else {
      pillars.push({ key: 'listed', label: 'Get listed', weight: 20, measured: false, score: null, detail: citations.lastScanned ? 'No eligible listing sources in the latest scan' : 'Scan the sites AI cites to measure' });
    }

    // 5. Fresh content (15%) — publication recency and autopilot.
    const history = getPublicationHistory();
    const posts = (history || []).filter(item => item.date);
    const autopilotEnabled = !!isAutopilotEnabled();
    if (!posts.length && !autopilotEnabled) {
      pillars.push({ key: 'fresh', label: 'Fresh content', weight: 15, measured: false, score: null, detail: 'Publish your first post to measure' });
    } else {
      let days = Infinity;
      if (posts.length) days = (now() - new Date(`${posts[0].date}T00:00:00Z`).getTime()) / 86400000;
      let score = posts.length ? clamp(100 - Math.max(0, days - 7) * (100 / 38), 0, 100) : 20;
      if (autopilotEnabled) score = clamp(score + 10, 0, 100);
      pillars.push({
        key: 'fresh', label: 'Fresh content', weight: 15, measured: true, score,
        detail: posts.length ? `Last post ${Math.round(days)}d ago${autopilotEnabled ? ' · autopilot on' : ''}` : 'Autopilot on, no posts yet',
        inputs: { daysSincePost: Number.isFinite(days) ? Math.round(days * 100) / 100 : null, autopilotEnabled, postCount: posts.length },
        factors: [
          { key: 'recency', label: 'Days since latest published post', value: Number.isFinite(days) ? Math.round(days * 100) / 100 : null },
          { key: 'automation', label: 'Content autopilot enabled', value: autopilotEnabled, effect: 'Up to 10 bonus points' },
        ],
        sourceUpdatedAt: posts.length ? posts[0].publishedAt || `${posts[0].date}T00:00:00.000Z` : null,
      });
    }

    return calculate(pillars);
  }

  return { compute };
}

module.exports = { createHealthScoreService };
