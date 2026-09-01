'use strict';

function buildAioSchemas({ siteUrl, buildLocalBusinessSchema }) {
  let domain = siteUrl || 'https://bestdayfitness.com';
  domain = domain.trim();
  if (domain.startsWith('sc-domain:')) domain = `https://${domain.substring(10)}`;
  domain = domain.replace(/\/$/, '');

  const localBusiness = buildLocalBusinessSchema(domain);
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the Total Rank System?',
        answer: {
          '@type': 'Answer',
          text: 'The Total Rank System is an SEO strategy designed to find search query leaks (where pages have high impressions but zero clicks) and rapidly build dedicated, E-E-A-T rich content pages to index and capture organic traffic.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do you offer specialized personal training for seniors in St. Petersburg?',
        answer: {
          '@type': 'Answer',
          text: 'Yes, Best Day Fitness specializes in mobility, balance, strength, and posture correction programs tailored specifically for older adults and seniors in the St. Petersburg, FL area.',
        },
      },
    ],
  };
  return { localBusiness, faq };
}

function registerAioCoreRoutes(app, options) {
  const {
    requireAuth,
    hasGeminiKey,
    usageOverBudget,
    budgetBlock,
    business,
    brandDomainRoot,
    geminiGenerate,
    model,
    state,
    persistHistory,
    getSiteUrl,
    buildLocalBusinessSchema,
    now = () => new Date().toISOString(),
    logger = console,
  } = options;

  app.post('/api/aio-audit', requireAuth, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required for auditing' });

    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Real AI-search audits require a Gemini API key. Add yours in Settings to run a live, Google-grounded audit.',
        latest: null,
        history: state.history,
      });
    }
    if (usageOverBudget()) return budgetBlock(res);

    const brandName = business.name;
    try {
      const prompt = `A person searching online asks: "${query}".
Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida. Name the actual businesses and briefly say why each is a good fit. Base your answer only on current web information.`;
      const response = await geminiGenerate({
        model,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const answerText = (response.text || '').trim();
      const grounding = (response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata) || {};
      const chunks = grounding.groundingChunks || [];
      const searchQueries = grounding.webSearchQueries || [];
      const searchEntryPoint = (grounding.searchEntryPoint && grounding.searchEntryPoint.renderedContent) || '';

      const seen = new Set();
      const citedSources = [];
      for (const chunk of chunks) {
        const web = chunk.web || {};
        const title = (web.title || '').trim();
        const uri = (web.uri || '').trim();
        const key = (title || uri).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        citedSources.push({ title, uri });
      }

      const answerLower = answerText.toLowerCase();
      const brandInAnswer = answerLower.includes(brandName.toLowerCase()) || answerLower.includes(brandDomainRoot);
      const brandInSources = citedSources.some(source => {
        const haystack = `${source.title} ${source.uri}`.toLowerCase();
        return haystack.includes(brandDomainRoot) || haystack.includes(brandName.toLowerCase());
      });

      let reasons = [];
      let competitors = [];
      if (answerText) {
        try {
          const extractPrompt = `Here is an AI answer engine's response to the query "${query}":
"""
${answerText}
"""
Return ONLY raw JSON (no markdown fences) shaped exactly as:
{"reasons": ["short reasons the answer gave, if any"], "competitors": ["names of businesses OTHER THAN \\"${brandName}\\" that the answer recommends or mentions"]}`;
          const extraction = await geminiGenerate({ model, contents: extractPrompt });
          const raw = (extraction.text || '').trim()
            .replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.reasons)) reasons = parsed.reasons.filter(Boolean);
          if (Array.isArray(parsed.competitors)) {
            competitors = parsed.competitors
              .filter(Boolean)
              .filter(competitor => !competitor.toLowerCase().includes(brandName.toLowerCase()));
          }
        } catch (error) {
          logger.error('[AIO Audit] Competitor extraction failed (non-fatal):', error.message);
        }
      }

      const responseSnippet = answerText.length > 360
        ? `${answerText.slice(0, 357).trim()}…`
        : (answerText || 'The AI returned no answer text for this query.');
      const fullAudit = {
        timestamp: now(),
        query,
        source: 'live_grounded',
        engine: 'Google (Gemini + Google Search)',
        recommended: brandInAnswer || brandInSources,
        cited: brandInSources,
        responseSnippet,
        reasons,
        citedSources,
        citedUrls: citedSources.map(source => source.uri).filter(Boolean),
        competitors,
        searchQueries,
        searchEntryPoint,
      };

      state.history.unshift(fullAudit);
      if (state.history.length > 50) state.history = state.history.slice(0, 50);
      try {
        persistHistory(state.history);
      } catch (error) {
        logger.error('[AIO Audits File] Save failed:', error.message);
      }
      return res.json({ success: true, latest: fullAudit, history: state.history });
    } catch (error) {
      logger.error('[AIO Audit API] Grounded audit failed:', error.message);
      return res.status(502).json({
        success: false,
        error: `The live audit could not be completed: ${error.message}`,
      });
    }
  });

  app.get('/api/aio-history', (req, res) => res.json(state.history));

  app.get('/api/aio-schema', (req, res) => {
    const schemas = buildAioSchemas({ siteUrl: getSiteUrl(), buildLocalBusinessSchema });
    return res.json({
      localBusiness: JSON.stringify(schemas.localBusiness, null, 2),
      faq: JSON.stringify(schemas.faq, null, 2),
    });
  });
}

module.exports = { buildAioSchemas, registerAioCoreRoutes };
