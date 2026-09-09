'use strict';

const ONSITE_SEEDS = [
  'senior fitness st petersburg',
  'personal trainer for seniors',
  'balance and fall prevention exercises',
  'strength training for adults over 50',
  'physical therapy and mobility st petersburg',
  'injury recovery exercise programs',
  'functional fitness for older adults',
];

function createOnsiteAutopilotService(options) {
  const {
    state,
    save,
    getHistory,
    brandPrompt,
    geminiGenerate,
    model,
    parseJson,
    daysSince,
    env = process.env,
    nowIso = () => new Date().toISOString(),
    logger = console,
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('On-site autopilot state is required.');
  if (typeof save !== 'function') throw new TypeError('On-site autopilot save callback is required.');
  if (typeof getHistory !== 'function') throw new TypeError('getHistory is required.');
  if (typeof brandPrompt !== 'function') throw new TypeError('brandPrompt is required.');
  if (typeof geminiGenerate !== 'function') throw new TypeError('geminiGenerate is required.');
  if (typeof parseJson !== 'function') throw new TypeError('parseJson is required.');
  if (typeof daysSince !== 'function') throw new TypeError('daysSince is required.');

  let running = false;

  async function scanKeywords(seed) {
    if (!env.GEMINI_API_KEY) return null;
    const prompt = `${brandPrompt(true)}\nUsing current web information, expand the seed keyword "${seed}" into 4–5 topic clusters this business could realistically target. For each cluster give: a short theme, 4–6 specific keyword phrases people actually search (favor local and long‑tail), 2–3 real questions people ask, and one concrete blog/page content idea. Return ONLY raw JSON, no markdown: {"clusters":[{"theme":"","keywords":[],"questions":[],"contentIdea":""}]}`;
    const response = await geminiGenerate({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const data = parseJson(response.text) || { clusters: [] };
    return { seed, clusters: data.clusters || [], generatedAt: nowIso() };
  }

  async function scanLinks() {
    if (!env.GEMINI_API_KEY) return null;
    const pages = (getHistory() || []).map(item => ({
      title: item.title,
      keyword: item.keyword,
      url: item.url,
    }));
    if (pages.length < 2) {
      return {
        suggestions: [],
        note: 'Publish at least two pages first — then this suggests internal links between them.',
        generatedAt: nowIso(),
      };
    }
    const prompt = `${brandPrompt(true)}\nHere are the pages this website has published:\n${JSON.stringify(pages)}\nSuggest internal links between them to build topic authority (pillar/cluster style). For each suggestion give the source page title, the target page title, a natural anchor phrase, and a one‑line reason. Return ONLY raw JSON, no markdown: {"suggestions":[{"from":"","to":"","anchor":"","why":""}]}`;
    const response = await geminiGenerate({ model, contents: prompt });
    const data = parseJson(response.text) || { suggestions: [] };
    return { suggestions: data.suggestions || [], note: '', generatedAt: nowIso() };
  }

  async function scanTitleMeta(keyword, page) {
    if (!env.GEMINI_API_KEY) return null;
    const prompt = `${brandPrompt(true)}\nWrite SEO title tags and meta descriptions targeting the keyword "${keyword}". Provide 3 title options (each 60 characters or fewer, compelling, naturally including the keyword) and 2 meta descriptions (each 155 characters or fewer, with a clear call to action). Return ONLY raw JSON, no markdown: {"titles":[],"metas":[]}`;
    const response = await geminiGenerate({ model, contents: prompt });
    const data = parseJson(response.text) || { titles: [], metas: [] };
    return {
      page: page || keyword,
      keyword,
      titles: data.titles || [],
      metas: data.metas || [],
      generatedAt: nowIso(),
    };
  }

  async function maybeRun(force) {
    if (running) return;
    if (!force && !state.enabled) return;
    if (!env.GEMINI_API_KEY) return;
    if (!force && daysSince(state.lastRun) < (state.intervalDays || 7)) return;
    running = true;
    try {
      const seed = ONSITE_SEEDS[(state.seedIndex || 0) % ONSITE_SEEDS.length];
      state.seedIndex = ((state.seedIndex || 0) + 1) % ONSITE_SEEDS.length;
      try {
        const ideas = await scanKeywords(seed);
        if (ideas) state.ideas = { ...ideas, isNew: true };
      } catch (error) {
        logger.error('[On-Site Autopilot] keywords failed:', error.message);
      }
      try {
        const links = await scanLinks();
        if (links) state.links = { ...links, isNew: true };
      } catch (error) {
        logger.error('[On-Site Autopilot] links failed:', error.message);
      }
      try {
        const history = getHistory();
        const latest = history && history.length ? history[0] : null;
        const keyword = latest ? latest.keyword : seed;
        const page = latest ? latest.title : 'Your homepage';
        const titlemeta = await scanTitleMeta(keyword, page);
        if (titlemeta) state.titlemeta = { ...titlemeta, isNew: true };
      } catch (error) {
        logger.error('[On-Site Autopilot] titlemeta failed:', error.message);
      }
      state.lastRun = nowIso();
      save();
    } finally {
      running = false;
    }
  }

  function status() {
    return {
      success: true,
      enabled: state.enabled,
      busy: running,
      intervalDays: state.intervalDays,
      lastRun: state.lastRun,
      ideas: state.ideas,
      links: state.links,
      titlemeta: state.titlemeta,
      hasKey: !!env.GEMINI_API_KEY,
    };
  }

  function setEnabled(value) {
    state.enabled = !!value;
    save();
    return { success: true, enabled: state.enabled };
  }

  function markSeen() {
    if (state.ideas) state.ideas.isNew = false;
    if (state.links) state.links.isNew = false;
    if (state.titlemeta) state.titlemeta.isNew = false;
    save();
  }

  return {
    scanKeywords,
    scanLinks,
    scanTitleMeta,
    maybeRun,
    status,
    setEnabled,
    markSeen,
    get running() { return running; },
  };
}

module.exports = { ONSITE_SEEDS, createOnsiteAutopilotService };
