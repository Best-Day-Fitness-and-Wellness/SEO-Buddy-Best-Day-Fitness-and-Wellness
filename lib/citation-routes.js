'use strict';
const { isCompetitor, eligibleCitationState } = require('./citation-eligibility');

const CITATION_STATUSES = ['todo', 'submitted', 'pitched', 'live'];
const LISTING_TYPES = ['directory', 'review'];

function normalizeCitationQueries(queries) {
  return (Array.isArray(queries) ? queries : [])
    .map(query => String(query || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function registerCitationRoutes(app, options) {
  const {
    requireAuth,
    hasGeminiKey,
    usageOverBudget,
    budgetBlock,
    getSavedQueries,
    performScan,
    worklist,
    enqueueScanCheck,
    setAutoEnabled,
    clearNewDomains,
    updateStatus,
    listingKit,
    discoverTargets,
    filterTargets = targets => eligibleCitationState({ targets }).targets,
    isExcludedDomain = () => false,
    updateListingKit,
    geminiGenerate,
    model,
    parseGeminiJson,
    brandPrompt,
    logger = console,
  } = options;

  app.post('/api/citation-targets', requireAuth, async (req, res) => {
    const { queries } = req.body;
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: 'At least one search query is required.' });
    }
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini key in Settings to find the sites AI cites (this runs a live Google search).',
        targets: [],
      });
    }

    const cleanQueries = normalizeCitationQueries(queries);
    try {
      const { brandCited, sourcesFound, targets } = await discoverTargets(cleanQueries);
      return res.json({
        success: true,
        brandCited,
        totalQueries: cleanQueries.length,
        sourcesFound,
        targets: filterTargets(targets),
      });
    } catch (error) {
      logger.error('[Citation Targets] failed:', error.message);
      return res.status(502).json({
        success: false,
        error: `Could not complete citation analysis: ${error.message}`,
      });
    }
  });

  app.get('/api/listing-kit', (req, res) => {
    res.json({ success: true, kit: listingKit() });
  });

  app.post('/api/listing-kit', requireAuth, async (req, res) => {
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        kit: listingKit(),
        note: 'Add a Gemini key to regenerate descriptions; using the built-in defaults for now.',
      });
    }
    try {
      const prompt = `${brandPrompt(true)}\n\nWrite listing copy for business directories. Return ONLY raw JSON, no markdown: {"tagline":"under 70 chars","shortDesc":"<=160 chars, keyword-aware","longDesc":"2-3 sentence paragraph","categories":["4 short business categories"]}`;
      const response = await geminiGenerate({ model, contents: prompt });
      const parsed = parseGeminiJson(response.text);
      if (parsed) updateListingKit(parsed);
      return res.json({ success: true, kit: listingKit() });
    } catch (error) {
      logger.error('[Listing Kit] regenerate failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });

  app.get('/api/citation-worklist', (req, res) => {
    enqueueScanCheck();
    res.json(worklist());
  });

  app.post('/api/citation-scan', requireAuth, async (req, res) => {
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini key in Settings to scan the sites AI cites (this runs a live Google search).',
      });
    }
    if (usageOverBudget()) return budgetBlock(res);
    const requested = Array.isArray(req.body && req.body.queries) ? req.body.queries : getSavedQueries();
    const queries = normalizeCitationQueries(requested);
    if (!queries.length) {
      return res.status(400).json({ success: false, error: 'At least one search query is required.' });
    }
    try {
      await performScan(queries);
      return res.json(worklist());
    } catch (error) {
      logger.error('[Citation Scan] failed:', error.message);
      return res.status(502).json({ success: false, error: `Could not complete the scan: ${error.message}` });
    }
  });

  app.post('/api/citation-autopilot/toggle', requireAuth, (req, res) => {
    const enabled = setAutoEnabled(!!(req.body && req.body.enabled));
    res.json({ success: true, enabled });
  });

  app.post('/api/citation-autopilot/seen', requireAuth, (req, res) => {
    clearNewDomains();
    res.json({ success: true });
  });

  app.post('/api/citation-status', requireAuth, (req, res) => {
    const { domain, status } = req.body || {};
    if (!domain || !CITATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Provide a domain and a status of: ${CITATION_STATUSES.join(', ')}.`,
      });
    }
    if (isExcludedDomain(domain)) {
      return res.status(409).json({ success: false, error: 'Competitor-owned sites are excluded from listing tasks.' });
    }
    updateStatus(domain, status);
    res.json({ success: true, domain, status });
  });

  app.post('/api/citation-outreach', requireAuth, async (req, res) => {
    const { domain, type, queries } = req.body || {};
    if (!domain) return res.status(400).json({ success: false, error: 'A target domain is required.' });
    const t = String(type || 'other').toLowerCase();
    const qList = Array.isArray(queries) ? queries.filter(Boolean) : [];
    const kit = listingKit();

    if (isCompetitor({ type: t }) || isExcludedDomain(domain)) {
      return res.json({
        success: true,
        kind: 'skip',
        message: "This competitor-owned site is excluded from listing tasks. No outreach is needed.",
      });
    }

    if (LISTING_TYPES.includes(t)) {
      let claimUrl = `https://${domain}`;
      let howTo = 'Look for a "Claim this business", "Add your business", or "For businesses" link, then paste the fields below.';
      if (hasGeminiKey()) {
        try {
          const prompt = `Best Day Fitness wants to claim or create a free business listing on "${domain}" (a ${t} site). Using current web information, find the exact URL where a business owner adds or claims a listing on ${domain}. Return ONLY raw JSON, no markdown: {"claimUrl":"the direct add/claim/for-business URL","howTo":"one short line on the steps"}`;
          const response = await geminiGenerate({
            model,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] },
          });
          const parsed = parseGeminiJson(response.text);
          if (parsed && parsed.claimUrl) claimUrl = parsed.claimUrl;
          if (parsed && parsed.howTo) howTo = parsed.howTo;
        } catch (error) {
          logger.error('[Outreach listing] grounding failed:', error.message);
        }
      }
      return res.json({
        success: true,
        kind: 'listing',
        domain,
        claimUrl,
        howTo,
        fields: {
          name: kit.name,
          address: kit.addressOneLine,
          phone: kit.phone,
          website: kit.website,
          categories: kit.categories.join(' · '),
          description: kit.shortDesc,
        },
      });
    }

    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        kind: 'pitch',
        domain,
        unavailable: true,
        message: 'Add a Gemini key in Settings to auto-draft a personalized pitch for this source.',
      });
    }
    try {
      const prompt = `You are helping a local business get included in a third-party ${t}.
Business: ${brandPrompt()}
Phone ${kit.phone}. Owner's first name: Chris.
Target site: "${domain}". It shows up in AI answers for searches like: ${qList.join('; ') || 'best gyms / senior fitness in St. Petersburg'}.
Do BOTH of the following using current web information about "${domain}":
1) Find the single best REAL way to reach them to pitch inclusion: an actual publicly-listed email address if one exists (prefer editorial / tips / news / submissions / contact / info in that order), and the URL of the page where a pitch or listing submission is made (their contact, "submit a tip", "write for us", or about page). Only return an email you can actually find published — never invent one.
2) Write a warm, specific pitch for inclusion. Reference what the site or article actually covers so it's clearly not a template. Under 130 words, one clear ask, friendly sign-off from Chris.
Return ONLY raw JSON, no markdown: {"email":"the best real, publicly-listed email address, or empty string if none is published","contactUrl":"the URL to submit/pitch or the site's contact page (empty if none)","to":"a short human label for who this reaches, e.g. 'Features editor'","subject":"","body":"","howToFind":"one short line on how to reach or confirm the right recipient"}`;
      const response = await geminiGenerate({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const parsed = parseGeminiJson(response.text) || {};
      const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const foundEmail = parsed.email && emailPattern.test(String(parsed.email).trim())
        ? String(parsed.email).trim()
        : '';
      const contactUrl = parsed.contactUrl && /^https?:\/\//i.test(String(parsed.contactUrl).trim())
        ? String(parsed.contactUrl).trim()
        : `https://${domain}`;
      return res.json({
        success: true,
        kind: 'pitch',
        domain,
        email: foundEmail,
        contactUrl,
        to: parsed.to || (foundEmail || 'Editor'),
        subject: parsed.subject || `Best Day Fitness — a senior-focused studio for ${domain}`,
        body: parsed.body || '',
        howToFind: parsed.howToFind || 'Check the article byline or the site’s contact/about page for the right person.',
      });
    } catch (error) {
      logger.error('[Outreach pitch] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });
}

module.exports = { CITATION_STATUSES, LISTING_TYPES, normalizeCitationQueries, registerCitationRoutes };
