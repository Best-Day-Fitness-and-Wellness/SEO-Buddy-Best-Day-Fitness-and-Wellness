'use strict';

const { competitorDomains, isCompetitorDomain, eligibleCitationState } = require('./citation-eligibility');

function createCitationScanService(options) {
  const {
    state,
    save,
    business,
    geminiGenerate,
    model,
    parseJson,
    daysSince,
    env = process.env,
    nowIso = () => new Date().toISOString(),
    logger = console,
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('Citation state is required.');
  if (typeof save !== 'function') throw new TypeError('Citation save callback is required.');
  if (!business || typeof business !== 'object') throw new TypeError('Business facts are required.');
  if (typeof geminiGenerate !== 'function') throw new TypeError('geminiGenerate is required.');
  if (typeof parseJson !== 'function') throw new TypeError('parseJson is required.');
  if (typeof daysSince !== 'function') throw new TypeError('daysSince is required.');

  let running = false;

  async function discoverTargets(cleanQueries) {
    const brandName = business.name;
    const brandRoot = 'bestdayfitness';
    const domainInfo = {};
    let brandCited = false;
    await Promise.all(cleanQueries.map(async query => {
      try {
        const prompt = `A person searching online asks: "${query}". Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida, based on current web information.`;
        const response = await geminiGenerate({
          model,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
        const grounding = (response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata) || {};
        const chunks = grounding.groundingChunks || [];
        const seen = new Set();
        for (const chunk of chunks) {
          const domain = ((chunk.web && chunk.web.title) || '').trim().toLowerCase();
          if (!domain || seen.has(domain)) continue;
          seen.add(domain);
          if (domain.includes(brandRoot) || domain.includes(brandName.toLowerCase())) {
            brandCited = true;
            continue;
          }
          if (!domainInfo[domain]) domainInfo[domain] = { count: 0, queries: [] };
          domainInfo[domain].count++;
          if (!domainInfo[domain].queries.includes(query)) domainInfo[domain].queries.push(query);
        }
      } catch (error) {
        logger.error(`[Citation Scan] query failed "${query}":`, error.message);
      }
    }));

    const rankedDomains = Object.keys(domainInfo)
      .sort((a, b) => domainInfo[b].count - domainInfo[a].count)
      .slice(0, 12);
    const targets = await Promise.all(rankedDomains.map(async domain => {
      const base = { domain, citedFor: domainInfo[domain].count, queries: domainInfo[domain].queries };
      if (isCompetitorDomain(domain, competitorDomains(state))) {
        return { ...base, type: 'competitor', listed: null, note: 'Previously identified as a competitor-owned site.' };
      }
      try {
        const prompt = `On the website "${domain}", is the St. Petersburg, Florida fitness studio "Best Day Fitness" listed or mentioned? Also classify what kind of site "${domain}" is. Use "competitor" for another fitness, training or wellness provider's own website, including its blog or best-of articles: those are not independent listing opportunities. Independent directories, review sites and publications covering multiple businesses are not competitors just because they mention competing businesses. Reply with ONLY raw JSON, no markdown fences: {"listed": true or false, "type": "directory" | "review" | "listicle" | "forum" | "competitor" | "news" | "other", "note": "one short line describing the site"}`;
        const response = await geminiGenerate({
          model,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] },
        });
        const parsed = parseJson(response.text) || {};
        return {
          ...base,
          type: parsed.type || 'other',
          listed: typeof parsed.listed === 'boolean' ? parsed.listed : null,
          note: parsed.note || '',
        };
      } catch (_) {
        return { ...base, type: 'other', listed: null, note: '' };
      }
    }));
    targets.sort((a, b) => b.citedFor - a.citedFor);
    return { brandCited, sourcesFound: Object.keys(domainInfo).length, targets };
  }

  async function performScan(queries) {
    const { brandCited, sourcesFound, targets } = await discoverTargets(queries);
    state.excludedCompetitorDomains = competitorDomains(state, targets);
    const previousDomains = new Set((state.targets || []).map(target => target.domain));
    const liveDomains = new Set(targets.map(target => target.domain));
    const keptStatuses = {};
    for (const domain of Object.keys(state.statuses || {})) {
      if (liveDomains.has(domain)) keptStatuses[domain] = state.statuses[domain];
    }
    state.statuses = keptStatuses;
    state.newDomains = previousDomains.size
      ? eligibleCitationState({ ...state, targets }).targets
        .filter(target => !previousDomains.has(target.domain))
        .map(target => target.domain)
      : [];
    state.targets = targets;
    state.brandCited = brandCited;
    state.sourcesFound = sourcesFound;
    state.totalQueries = queries.length;
    state.queries = queries;
    state.lastScanned = nowIso();
    save();
  }

  async function maybeRun(force) {
    if (running) return;
    if (!force && !state.autoEnabled) return;
    if (!env.GEMINI_API_KEY) return;
    const queries = (state.queries || []).map(query => String(query || '').trim()).filter(Boolean).slice(0, 8);
    if (!queries.length) return;
    if (!force && daysSince(state.lastScanned) < (state.intervalDays || 7)) return;
    running = true;
    try {
      await performScan(queries);
    } catch (error) {
      logger.error('[Citation Autopilot] auto-scan failed:', error.message);
    } finally {
      running = false;
    }
  }

  function filterTargets(targets) {
    return eligibleCitationState({
      ...state,
      targets,
      excludedCompetitorDomains: competitorDomains(state, targets),
    }).targets;
  }

  function isExcludedDomain(domain) {
    return isCompetitorDomain(domain, competitorDomains(state));
  }

  return {
    discoverTargets,
    performScan,
    maybeRun,
    filterTargets,
    isExcludedDomain,
    get running() { return running; },
  };
}

module.exports = { createCitationScanService };
