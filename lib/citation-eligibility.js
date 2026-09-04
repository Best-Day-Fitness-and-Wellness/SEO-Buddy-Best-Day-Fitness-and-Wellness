'use strict';

// Keep source evidence intact; only independent sites belong in the worklist.
function citationDomain(value) {
  try {
    const text = String(value || '').trim().toLowerCase();
    return new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch { return ''; }
}

function isCompetitor(target) {
  return String(target?.type || '').trim().toLowerCase() === 'competitor';
}

function competitorDomains(state = {}, discovered = []) {
  return [...new Set([
    ...(state.excludedCompetitorDomains || []),
    ...(state.targets || []).filter(isCompetitor).map(target => target.domain),
    ...discovered.filter(isCompetitor).map(target => target.domain),
  ].map(citationDomain).filter(Boolean))];
}

function isCompetitorDomain(domain, excluded) {
  const host = citationDomain(domain);
  return excluded.some(site => host === site || host.endsWith(`.${site}`));
}

function eligibleCitationState(state = {}) {
  const excluded = competitorDomains(state);
  const targets = (state.targets || []).filter(target => !isCompetitor(target) && !isCompetitorDomain(target.domain, excluded));
  const activeDomains = new Set(targets.map(target => target.domain));
  return {
    ...state,
    targets,
    excludedCompetitorCount: (state.targets || []).length - targets.length,
    newDomains: (state.newDomains || []).filter(domain => activeDomains.has(domain)),
  };
}

function buildCitationWorklist(state, kit) {
  const eligible = eligibleCitationState(state);
  const targets = eligible.targets.map(target => {
    const saved = state.statuses?.[target.domain] || {};
    const type = String(target.type || 'other').trim().toLowerCase();
    return {
      ...target, type, status: saved.status || 'todo', statusUpdatedAt: saved.updatedAt || null,
      mode: target.listed === true ? 'maintain' : ['directory', 'review'].includes(type) ? 'listing' : 'pitch',
      isNew: eligible.newDomains.includes(target.domain),
    };
  });
  return {
    success: true, lastScanned: state.lastScanned, brandCited: state.brandCited,
    totalQueries: state.totalQueries, sourcesFound: state.sourcesFound, queries: state.queries || [],
    autoEnabled: !!state.autoEnabled, intervalDays: state.intervalDays || 7,
    newDomains: eligible.newDomains, excludedCompetitorCount: eligible.excludedCompetitorCount, kit, targets,
    counts: {
      total: targets.length,
      listed: targets.filter(target => target.listed === true).length,
      inProgress: targets.filter(target => ['submitted', 'pitched'].includes(target.status)).length,
      live: targets.filter(target => target.status === 'live' || target.listed === true).length,
    },
  };
}

module.exports = { citationDomain, isCompetitor, competitorDomains, isCompetitorDomain, eligibleCitationState, buildCitationWorklist };
