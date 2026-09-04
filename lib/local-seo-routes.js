'use strict';

function buildCanonicalNap(business) {
  return {
    name: business.name,
    address: `${business.streetAddress}, ${business.addressLocality}, ${business.addressRegion} ${business.postalCode}`,
    phone: business.telephone,
  };
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeNapText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapNapListings(listings, business, canonical = buildCanonicalNap(business)) {
  const canonicalPhone = digits(canonical.phone);
  return (listings || []).map(listing => ({
    platform: listing.platform || '',
    name: listing.name || '',
    address: listing.address || '',
    phone: listing.phone || '',
    nameMatch: listing.name
      ? (normalizeNapText(listing.name).includes(normalizeNapText(business.name))
        || normalizeNapText(business.name).includes(normalizeNapText(listing.name)))
      : null,
    phoneMatch: listing.phone ? digits(listing.phone).slice(-10) === canonicalPhone.slice(-10) : null,
    addrMatch: listing.address
      ? normalizeNapText(listing.address).includes(normalizeNapText(business.streetAddress))
      : null,
  }));
}

function buildReviewReplyPrompt(brand, review, rating) {
  return `${brand}\nWrite a warm, personal, professional reply from the business to this Google review${rating ? ` (${rating} stars)` : ''}:\n"""${review}"""\nRules: reference something specific they mentioned; keep it 2–4 sentences; sound human, never templated; if it's negative, be gracious, take responsibility, and invite them to connect offline. Return only the reply text.`;
}

function parseJsonObject(text) {
  let raw = String(text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) raw = match[0];
  try { return JSON.parse(raw); } catch (error) { return null; }
}

function registerLocalSeoRoutes(app, options) {
  const {
    requireAuth,
    hasGeminiKey,
    business,
    brandPrompt,
    geminiGenerate,
    model,
    localState,
    saveLocal,
    filterNap = nap => nap,
    now = () => new Date().toISOString(),
    logger = console,
  } = options;

  app.post('/api/nap-audit', requireAuth, async (req, res) => {
    const canonical = buildCanonicalNap(business);
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to run a NAP audit (uses live Google Search grounding).',
        canonical,
        listings: [],
      });
    }

    try {
      const prompt = `Find the current online business listings for "${business.name}" located in ${business.addressLocality}, ${business.addressRegion}. For each major platform where it appears (for example Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB, and local fitness directories), report the EXACT business name, full street address, and phone number shown there, based on current web information. Reply with ONLY raw JSON, no markdown fences: {"listings":[{"platform":"","name":"","address":"","phone":""}]}. If a field isn't shown on a platform, use an empty string.`;
      const result = await geminiGenerate({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
      const parsed = parseJsonObject(result.text) || { listings: [] };
      return res.json(filterNap({
        success: true,
        canonical,
        listings: mapNapListings(parsed.listings, business, canonical),
      }));
    } catch (error) {
      logger.error('[NAP Audit] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });

  app.post('/api/local-generate', requireAuth, async (req, res) => {
    const { kind, review, rating, clientName, reviewLink, topic, postType } = req.body || {};
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to generate local content.',
        text: '',
      });
    }

    const brand = brandPrompt(true);
    let prompt;
    if (kind === 'review-response') {
      if (!review) return res.status(400).json({ error: 'Paste the review to respond to.' });
      prompt = buildReviewReplyPrompt(brand, review, rating);
    } else if (kind === 'review-request') {
      prompt = `${brand}\nWrite a short, friendly message asking a happy client${clientName ? ` named ${clientName}` : ''} to leave a Google review. Warm and low‑pressure, 2–3 sentences, thank them for training with us, and include this review link: ${reviewLink || '[YOUR GOOGLE REVIEW LINK]'}. Return only the message text.`;
    } else if (kind === 'gbp-post') {
      if (!topic) return res.status(400).json({ error: 'Enter a topic for the post.' });
      prompt = `${brand}\nWrite a Google Business Profile post of type "${postType || 'update'}" about: "${topic}". Under 1500 characters, engaging and locally relevant to St. Petersburg, with a clear call to action at the end (book a consultation / call us / visit). Return only the post text.`;
    } else {
      return res.status(400).json({ error: 'Unknown generation kind.' });
    }

    try {
      const result = await geminiGenerate({ model, contents: prompt });
      return res.json({ success: true, text: (result.text || '').trim() });
    } catch (error) {
      logger.error('[Local Generate] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });

  app.post('/api/local-reply', requireAuth, async (req, res) => {
    const { review, rating } = req.body || {};
    if (!review) return res.status(400).json({ success: false, error: 'Paste the review to respond to.' });
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to draft replies.',
      });
    }

    try {
      const prompt = buildReviewReplyPrompt(brandPrompt(true), review, rating);
      const result = await geminiGenerate({ model, contents: prompt });
      const reply = (result.text || '').trim();
      localState.replyHistory.unshift({
        review: String(review).slice(0, 500),
        rating: rating || '',
        reply,
        createdAt: now(),
      });
      localState.replyHistory = localState.replyHistory.slice(0, 20);
      saveLocal();
      return res.json({ success: true, reply });
    } catch (error) {
      logger.error('[Local Reply] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });
}

module.exports = {
  buildCanonicalNap,
  buildReviewReplyPrompt,
  mapNapListings,
  registerLocalSeoRoutes,
};
