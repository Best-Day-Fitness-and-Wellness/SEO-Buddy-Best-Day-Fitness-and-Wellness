'use strict';

/**
 * Trustpilot Business Units (public API) — parsing only.
 *
 * The network call lives in server.js; everything that can be got wrong lives
 * here, where it can be tested without a key or a live account. Trustpilot has
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

module.exports = {
  DEFAULT_API_BASE,
  normalizeDomain,
  findBusinessUnitUrl,
  normalizeBusinessUnit,
  comparePageClaim,
};
