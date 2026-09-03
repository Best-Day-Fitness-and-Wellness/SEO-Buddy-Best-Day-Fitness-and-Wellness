'use strict';

// Synthetic, non-production examples shared by PDF and browser tests.
module.exports = function reportFixture(day = new Date().toISOString().slice(0, 10)) {
  return {
    'business-profile': { success: true, profile: { name: 'Example Fitness', website: 'https://example.test' } },
    'health-score': { success: true, overall: 69, liveOverall: 68, scoreVersion: 2, delta: null,
      measuredCount: 2, totalPillars: 3, smoothing: { windowDays: 7, samples: 4 },
      confidence: { percent: 65, stalePillars: ['ai'] },
      freshness: { calculatedAt: day, oldestSourceAt: '2026-07-01' },
      explainability: { topOpportunity: { label: 'Found on Google', availableScorePoints: 9.5 } },
      pillars: [
        { key: 'found', label: 'Found on Google', weight: 25, measured: true, score: 62, detail: '15 zero-click searches', sourceUpdatedAt: day },
        { key: 'ai', label: 'AI recommends you', weight: 20, measured: true, score: 100, detail: '4 of 4 recorded checks', sourceUpdatedAt: '2026-07-01' },
        { key: 'listed', label: 'Get listed', weight: 20, measured: false, score: null, detail: 'No check recorded' },
      ] },
    'performance': { source: 'live_gsc', queryRowLimit: 250,
      periods: { current: { startDate: '2026-08-04', endDate: '2026-08-31' }, previous: { startDate: '2026-07-07', endDate: '2026-08-03' }, contacts: { startDate: '2026-08-06', endDate: day } },
      current: { clicks: 37, impressions: 2217, avgPosition: 12.7, ctr: 1.67 },
      previous: { clicks: 34, impressions: 1894, avgPosition: 11.9, ctr: 1.8 },
      movers: { gainers: [{ query: 'fitness near me', position: 9, posChange: 42 }], losers: [{ query: 'mobility training', position: 21, posChange: -20 }] },
      leads: { available: true, current: 40, previous: 60, approx: true, attribution: { explicitlySearchAttributed: 0 } },
      brandedSearch: { available: true, current: { impressions: 84, clicks: 28 } }, aiReferral: { available: false } },
    'gsc-data': { source: 'live_gsc', period: { startDate: '2026-08-04', endDate: day }, queryRowLimit: 100,
      data: [{ query: 'fitness coaching', impressions: 35, clicks: 0, position: 11, leak: true }] },
    'history': [
      { title: 'Prepared draft', date: day, platform: 'GoHighLevel (draft)', indexed: 'Indexing Available' },
      { title: 'Published guide', date: day, platform: 'GoHighLevel (Published)', indexed: 'Indexing Requested' },
      { title: 'Demo guide', date: day, platform: 'GHL (Mock Autopilot)', indexed: 'Indexing Requested' },
      { title: 'Unverified record', date: day, platform: 'GoHighLevel', indexed: 'Indexing Failed' },
    ],
    'ai-visibility': { latest: { ranAt: day, visibilityScore: 40, totalAnswers: 5, shareOfVoice: 6, sentimentScore: 100, perEngine: [{ label: 'Google (Gemini)' }] } },
    'next-moves': { success: true, moves: [{ title: 'Check your business listing', doerLabel: 'You do it', realEffort: 'About 15 minutes' }] },
    'automation-status': { success: true, checkedAt: day, features: [
      { title: 'Content publishing', status: 'scheduled', label: 'Scheduled', lastRecordedAt: day, nextRunAt: day, nextRunEstimated: true },
      { title: 'Local presence', status: 'needs-approval', label: 'Needs approval', lastRecordedAt: day },
    ] },
    'reviews-stats': { success: true, checkedAt: day, inventory: { published: 0, avgRating: null }, score: 86 },
    'performance-digest': { success: true, digest: { source: 'mock', text: 'DO NOT REPRINT SAMPLE SCORE 75 AND LEADS 48' } },
    'deploy-readiness': { success: true, checks: [{ key: 'gsc', ok: true }] },
  };
};
