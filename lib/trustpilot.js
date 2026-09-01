'use strict';

/**
 * Trustpilot Business Units (public API) — parsing only.
 *
 * The network call lives in reviews-routes.js; everything that can be got wrong
 * lives here, where it can be tested without a key or a live account. Trustpilot has
 * shipped more than one shape of this payload over the years, so every field is
 * read defensively and a missing one becomes null rather than a thrown request.
 */

const DEFAULT_API_BASE = 'https://api.trustpilot.com/v1';

/** Strip a domain down to the bare host Trustpilot indexes it under. */
function normalizeDomain(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

/**
 * The lookup URL. The API key is NOT placed here — it travels as a header, so
 * it never reaches a proxy log or a browser history.
 */
function findBusinessUnitUrl(domain, apiBase = DEFAULT_API_BASE) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  return `${base}/business-units/find?name=${encodeURIComponent(normalizeDomain(domain))}`;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/**
 * Turn a business-unit payload into the shape the reviews pipeline consumes.
 * Returns null for anything unrecognisable, so callers can treat "no data" and
 * "bad data" identically instead of guarding every field themselves.
 */
function normalizeBusinessUnit(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const reviews = payload.numberOfReviews || {};
  const score = payload.score || {};

  // `total` is every review; `usedForTrustScoreCalculation` excludes the ones
  // Trustpilot has filtered. Prefer the total, because that is the number a
  // visitor sees on the public profile and therefore the one a claim on our own
  // page has to match.
  const reviewCount = num(reviews.total) ?? num(reviews.usedForTrustScoreCalculation);

  const distribution = {
    5: num(reviews.fiveStars),
    4: num(reviews.fourStars),
    3: num(reviews.threeStars),
    2: num(reviews.twoStars),
    1: num(reviews.oneStar),
  };
  const hasDistribution = Object.values(distribution).some(v => v != null);

  const identifying = payload.name && typeof payload.name === 'object'
    ? payload.name.identifying
    : null;
  const domain = normalizeDomain(identifying || payload.websiteUrl || '');

  const out = {
    businessUnitId: typeof payload.id === 'string' ? payload.id : null,
    displayName: typeof payload.displayName === 'string' ? payload.displayName : null,
    domain: domain || null,
    // trustScore is the 0–5 weighted figure Trustpilot headlines; stars is that
    // value rounded to the half-star it prints. Keep both: one is for arithmetic,
    // the other is what a visitor actually sees.
    trustScore: num(score.trustScore),
    stars: num(score.stars),
    reviewCount,
    distribution: hasDistribution ? distribution : null,
    status: typeof payload.status === 'string' ? payload.status : null,
    profileUrl: domain ? `https://www.trustpilot.com/review/${domain}` : null,
  };

  // An object with an id but no score at all is a profile that exists and has
  // never been reviewed — real, reportable, and not an error.
  if (!out.businessUnitId && out.trustScore == null && out.reviewCount == null) return null;
  return out;
}

/**
 * Does the number printed on our own reviews page still match Trustpilot?
 *
 * The reviews page is hand-maintained, so any figure copied onto it starts
 * drifting the moment a new review lands. Returns null when there is nothing to
 * compare, so an absent claim is silence rather than a failure.
 */
function comparePageClaim(pageTotals, live) {
  const claimed = pageTotals && num(pageTotals.reviewCount);
  const actual = live && num(live.reviewCount);
  if (claimed == null || actual == null) return null;
  return { claimed, actual, drift: claimed - actual, matches: claimed === actual };
}

/**
 * How many reviews sit at one or two stars. This is the number that actually
 * costs money — an average creeps up slowly and drops fast, and by the time the
 * average moves the damage is done. Returns null when there is no breakdown, so
 * "we cannot see" never renders as "zero".
 */
function negativeCount(distribution) {
  if (!distribution || typeof distribution !== 'object') return null;
  const one = num(distribution[1]);
  const two = num(distribution[2]);
  if (one == null && two == null) return null;
  return (one || 0) + (two || 0);
}

/** The most recent snapshot dated on or before `isoDate`. */
function snapshotOnOrBefore(snapshots, isoDate) {
  if (!Array.isArray(snapshots)) return null;
  const eligible = snapshots
    .filter(s => s && typeof s.date === 'string' && s.date <= isoDate && s.trustpilot)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/**
 * Movement over a window, measured against the oldest reading we still hold
 * rather than a fixed date — a fortnight-old install has a real fortnight of
 * history and should say so, instead of reporting nothing for a month.
 *
 * `asOfDate` is passed in rather than read from the clock so this stays a pure
 * function and the tests do not depend on what day they run.
 */
function trustpilotTrend(snapshots, current, asOfDate, days = 30) {
  const now = {
    trustScore: current ? num(current.trustScore) : null,
    reviewCount: current ? num(current.reviewCount) : null,
    negative: current ? negativeCount(current.distribution) : null,
  };
  if (!Array.isArray(snapshots) || !snapshots.length) return { days, comparable: false, now };

  const cutoff = new Date(String(asOfDate) + 'T00:00:00Z');
  if (isNaN(cutoff.getTime())) return { days, comparable: false, now };
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().split('T')[0];

  // Prefer a reading from the window's start; fall back to the oldest we hold,
  // and report which, so the UI can say "since we started watching".
  let base = snapshotOnOrBefore(snapshots, cutoffIso);
  let partial = false;
  if (!base) {
    const withTp = snapshots.filter(s => s && s.trustpilot && typeof s.date === 'string')
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    base = withTp[0] || null;
    partial = true;
  }
  if (!base || !base.trustpilot) return { days, comparable: false, now };

  const was = {
    trustScore: num(base.trustpilot.trustScore),
    reviewCount: num(base.trustpilot.reviewCount),
    negative: num(base.trustpilot.negative),
  };
  const delta = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 100) / 100);

  return {
    days,
    comparable: true,
    partial,
    since: base.date,
    now,
    was,
    scoreDelta: delta(now.trustScore, was.trustScore),
    reviewDelta: delta(now.reviewCount, was.reviewCount),
    negativeDelta: delta(now.negative, was.negative),
  };
}

module.exports = {
  DEFAULT_API_BASE,
  normalizeDomain,
  findBusinessUnitUrl,
  normalizeBusinessUnit,
  comparePageClaim,
  negativeCount,
  trustpilotTrend,
};
