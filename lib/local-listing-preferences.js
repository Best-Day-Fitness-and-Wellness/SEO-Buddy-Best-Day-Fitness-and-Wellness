'use strict';

function platformKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').replace(/\.(com|org|net)$/, '').replace(/[^a-z0-9]/g, '') : '';
}
const hasMismatch = listing => ['nameMatch', 'addrMatch', 'phoneMatch'].some(key => listing[key] === false);

function effectiveNap(nap, exclusions = []) {
  if (!nap || !Array.isArray(nap.listings)) return nap;
  const excluded = new Set((Array.isArray(exclusions) ? exclusions : []).map(item => platformKey(item.platform)).filter(Boolean));
  const listings = nap.listings.filter(item => !excluded.has(platformKey(item.platform)));
  const excludedListings = nap.listings.filter(item => excluded.has(platformKey(item.platform)));
  return { ...nap, listings, excludedListings, mismatchCount: listings.filter(hasMismatch).length,
    unverifiedCount: listings.filter(item => !hasMismatch(item) && ['nameMatch', 'addrMatch', 'phoneMatch'].some(key => item[key] !== true)).length };
}

function registerLocalListingRoutes(app, { requireOwner, state, save }) {
  app.post('/api/local-listing-preference', requireOwner, (req, res) => {
    const { platform, excluded, reason } = req.body || {};
    const key = platformKey(platform);
    if (typeof platform !== 'string' || platform.length > 100 || !key || typeof excluded !== 'boolean' || (reason !== undefined && (typeof reason !== 'string' || reason.length > 300))) {
      return res.status(400).json({ success: false, error: 'Provide a listing platform, an excluded boolean, and an optional short reason.' });
    }
    const previous = state.napExclusions;
    const current = Array.isArray(previous) ? previous : [];
    const known = [...(state.nap?.listings || []), ...current].find(item => platformKey(item.platform) === key);
    if (!known) return res.status(404).json({ success: false, error: 'That platform is not in the recorded listings. Refresh the listing details first.' });
    const next = current.filter(item => platformKey(item.platform) !== key);
    if (excluded) next.push(current.find(item => platformKey(item.platform) === key) || { platform: known.platform, reason: reason?.trim() || 'Owner marked not relevant', excludedAt: new Date().toISOString() });
    state.napExclusions = next;
    try {
      if (save() === false) throw new Error('Not saved');
    } catch (_) {
      state.napExclusions = previous;
      return res.status(503).json({ success: false, error: 'Could not save the listing preference. Nothing was changed; please retry.' });
    }
    return res.json({ success: true, platform: known.platform, excluded, nap: effectiveNap(state.nap, next), exclusions: next });
  });
}

module.exports = { platformKey, effectiveNap, registerLocalListingRoutes };
