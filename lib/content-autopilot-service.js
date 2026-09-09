'use strict';

const AUTOPILOT_CASE_STUDIES = {
  'senior fitness st petersburg fl': 'Our client Margaret (71) suffered from severe knee stiffness that prevented her from walking. Within 12 weeks of our trainer-led posture and barefoot balance mat exercises, she eliminated knee pain and walks 3 miles daily.',
  'mobility training st pete': 'We worked with Arthur (64) to resolve shoulder tightness. By combining manual massage therapy with customized range-of-motion routines, he returned to playing tennis within 6 weeks.',
  'longevity fitness coach st petersburg': 'David (82) joined Best Day Fitness to maintain his daily functional freedom. Focused exercises built foot stability and core strength, letting him comfortably carry his own groceries.',
  'posture correction exercises senior': 'Elena (69) improved her posture profile by 30% and eliminated lower back pain within 2 months through tailored core posture training and chest mobility patterns.',
};

const DEFAULT_CASE_STUDY = 'Our specialized mobility exercises help St. Pete seniors build posture, balance, and core strength, restoring independence.';

function contentBaseDomain(siteUrl) {
  let domain = String(siteUrl || 'https://bestdayfitness.com').trim();
  if (domain.startsWith('sc-domain:')) domain = 'https://' + domain.substring(10);
  return domain.replace(/\/$/, '');
}

function createContentAutopilotService(options) {
  const {
    state,
    getHistory,
    saveHistory,
    saveConfig,
    logActivity,
    getGoogleAuth,
    getSiteUrl,
    createWebmasters,
    searchConsoleQuery,
    generateArticle,
    publishArticle,
    indexUrl,
    explainIndexError,
    mockData = [],
    allowMockIntegrations = false,
    caseStudies = AUTOPILOT_CASE_STUDIES,
    now = () => new Date(),
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('Content autopilot state is required.');
  if (typeof getHistory !== 'function') throw new TypeError('getHistory is required.');
  if (typeof saveHistory !== 'function') throw new TypeError('saveHistory is required.');
  if (typeof saveConfig !== 'function') throw new TypeError('saveConfig is required.');
  if (typeof logActivity !== 'function') throw new TypeError('logActivity is required.');
  if (typeof getGoogleAuth !== 'function') throw new TypeError('getGoogleAuth is required.');
  if (typeof getSiteUrl !== 'function') throw new TypeError('getSiteUrl is required.');
  if (typeof createWebmasters !== 'function') throw new TypeError('createWebmasters is required.');
  if (typeof searchConsoleQuery !== 'function') throw new TypeError('searchConsoleQuery is required.');
  if (typeof generateArticle !== 'function') throw new TypeError('generateArticle is required.');
  if (typeof publishArticle !== 'function') throw new TypeError('publishArticle is required.');
  if (typeof indexUrl !== 'function') throw new TypeError('indexUrl is required.');
  if (typeof explainIndexError !== 'function') throw new TypeError('explainIndexError is required.');

  async function discoverKeywords() {
    let keywords = allowMockIntegrations ? mockData : [];
    const auth = getGoogleAuth();
    const siteUrl = getSiteUrl();

    if (auth && siteUrl) {
      try {
        const current = now();
        const today = current.toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(current.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const response = await searchConsoleQuery(createWebmasters(auth), {
          siteUrl,
          requestBody: {
            startDate: thirtyDaysAgo,
            endDate: today,
            dimensions: ['query'],
            rowLimit: 100,
          },
        });
        if (response.data.rows) {
          keywords = response.data.rows.map(row => ({
            query: row.keys ? row.keys[0] : '',
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            leak: row.clicks === 0 && row.impressions > 10,
          }));
        }
      } catch (error) {
        logActivity(allowMockIntegrations
          ? `GSC API fetch failed; development demo searches will be used. Error: ${error.message}`
          : `GSC API fetch failed; no fabricated search opportunities will be used. Error: ${error.message}`);
      }
    } else if (!allowMockIntegrations) {
      logActivity('Search Console is not configured; continuing only with owner-queued or proactive target topics.');
    }

    return keywords;
  }

  function chooseTopic(keywords) {
    const history = getHistory();
    let query = null;
    let fromQueue = false;
    let fromTarget = false;

    while (state.queue.length && !query) {
      const candidate = String(state.queue[0].topic || '').trim();
      if (candidate && !history.some(entry => entry.keyword.toLowerCase() === candidate.toLowerCase())) {
        query = candidate;
        fromQueue = true;
      } else {
        state.queue.shift();
        saveConfig();
      }
    }

    if (!query && state.targets.length) {
      for (let indexOffset = 0; indexOffset < state.targets.length && !query; indexOffset++) {
        const index = (state.targetIndex + indexOffset) % state.targets.length;
        const candidate = String(state.targets[index] || '').trim();
        if (candidate && !history.some(entry => entry.keyword.toLowerCase() === candidate.toLowerCase())) {
          query = candidate;
          fromTarget = true;
          state.targetIndex = (index + 1) % state.targets.length;
          saveConfig();
        }
      }
    }

    if (!query) {
      const leakKeywords = keywords.filter(keyword => keyword.leak);
      const targetLeak = leakKeywords.find(keyword => !history.some(entry => entry.keyword.toLowerCase() === keyword.query.toLowerCase()));
      if (!targetLeak) return null;
      query = targetLeak.query;
      logActivity(`Targeting leak query: "${query}" (Impressions: ${targetLeak.impressions})`);
    } else if (fromQueue) {
      logActivity(`Targeting queued topic: "${query}" (${state.queue.length} in queue)`);
    } else if (fromTarget) {
      logActivity(`Targeting core target keyword: "${query}"`);
    }

    return { query, fromQueue };
  }

  async function runCycle() {
    logActivity('Looking for searches you appear in but get no clicks from...');
    const keywords = await discoverKeywords();
    const selected = chooseTopic(keywords);
    if (!selected) {
      logActivity('Check complete. No queued topics, target keywords, or new content gaps left to cover.');
      return null;
    }

    const { query, fromQueue } = selected;
    try {
      logActivity('Generating structural SEO article via Gemini API...');
      const caseStudy = caseStudies[query.toLowerCase()] || DEFAULT_CASE_STUDY;
      const baseDomain = contentBaseDomain(getSiteUrl());
      const article = await generateArticle(query, caseStudy, 'Claim Longevity Assessment', `${baseDomain}/consultation`);
      if (!article.quality?.publishable) {
        const reason = article.quality?.blockingIssues?.join(' ') || 'Generated article did not pass the content quality gate.';
        const qualityError = new Error(`Content quality gate stopped automatic publishing. ${reason}`);
        qualityError.code = 'CONTENT_QUALITY_FAILED';
        qualityError.retryable = false;
        throw qualityError;
      }

      logActivity('Publishing article to GoHighLevel...');
      const publish = await publishArticle(article.title, article.content, 'published');

      logActivity(`Asking Google to list: ${publish.url}`);
      let indexStatus = 'Indexing Requested';
      try {
        await indexUrl(publish.url);
      } catch (error) {
        indexStatus = 'Indexing Failed';
        logActivity(`⚠️ Article published, but Google Indexing was refused. ${explainIndexError(error.message)}`);
      }

      const completedAt = now();
      const historyEntry = {
        title: article.title,
        keyword: query,
        platform: publish.source === 'mock_ghl' ? 'GHL (Mock Autopilot)' : 'GoHighLevel (Published)',
        date: completedAt.toISOString().split('T')[0],
        indexed: indexStatus,
        url: publish.url,
        qualityScore: article.quality.score,
        qualityVersion: article.quality.version,
      };

      getHistory().unshift(historyEntry);
      saveHistory();
      state.lastRun = now().toISOString();
      saveConfig();

      if (fromQueue) {
        state.queue = state.queue.filter(item => String(item.topic || '').trim().toLowerCase() !== query.toLowerCase());
        saveConfig();
      }

      logActivity(indexStatus === 'Indexing Failed'
        ? `✅ Autopilot run complete — published "${article.title}" (indexing skipped; see warning above).`
        : `✅ Autopilot run complete! Deployed and Indexed: "${article.title}"`);
      return { ...historyEntry, indexWarning: indexStatus === 'Indexing Failed' };
    } catch (error) {
      logActivity(`❌ Autopilot cycle failed: ${error.message}`);
      throw error;
    }
  }

  return { chooseTopic, discoverKeywords, runCycle };
}

module.exports = {
  AUTOPILOT_CASE_STUDIES,
  DEFAULT_CASE_STUDY,
  contentBaseDomain,
  createContentAutopilotService,
};
