'use strict';

const { publicProviderError } = require('./public-provider-error');

function normalizeRedditThreads(value) {
  const parsedThreads = Array.isArray(value) ? value : [];
  const threads = parsedThreads
    .filter(thread => thread && thread.url && /reddit\.com/i.test(thread.url))
    .map(thread => ({
      title: String(thread.title || 'Reddit thread').slice(0, 200),
      subreddit: String(thread.subreddit || '').replace(/^\/?r?\/?/i, 'r/').slice(0, 40),
      url: String(thread.url).trim(),
      why: String(thread.why || '').slice(0, 240),
      angle: String(thread.angle || '').slice(0, 300),
    }));
  const seen = new Set();
  return threads.filter(thread => {
    if (seen.has(thread.url)) return false;
    seen.add(thread.url);
    return true;
  }).slice(0, 12);
}

function createRedditDiscoveryService(options) {
  const {
    state,
    save,
    business,
    getListingKit,
    geminiGenerate,
    geminiModel,
    parseJson,
    env = process.env,
    nowIso = () => new Date().toISOString(),
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('Reddit discovery state is required.');
  if (typeof save !== 'function') throw new TypeError('Reddit discovery save callback is required.');
  if (!business || typeof business !== 'object') throw new TypeError('Business facts are required.');
  if (typeof getListingKit !== 'function') throw new TypeError('getListingKit is required.');
  if (typeof geminiGenerate !== 'function') throw new TypeError('geminiGenerate is required.');
  if (typeof parseJson !== 'function') throw new TypeError('parseJson is required.');

  async function run() {
    if (!env.GEMINI_API_KEY) {
      return { error: 'Reddit discovery uses live Google Search grounding — add your Gemini API key in Settings.' };
    }
    const kit = getListingKit() || {};
    const brand = business.name;
    const city = business.addressLocality || 'St. Petersburg';
    const region = business.addressRegion || 'FL';
    const description = kit.shortDesc || 'a senior-focused fitness & wellness studio for adults 50+';
    try {
      const prompt = `Using current web information, find real, active Reddit threads where a business like "${brand}" — ${description} in ${city}, ${region} — could genuinely help by participating.
Look for people asking for recommendations about: senior fitness, personal trainers for adults over 50, mobility/balance/strength for older adults, injury recovery, physical therapy, or gyms in ${city} or the Tampa Bay FL area — plus broader relevant discussions people ask AI about.
Only include REAL reddit.com thread URLs you actually find in search. For each, give a short authentic, helpful, NON-spammy way to add value (be a real participant, disclose the affiliation, never hard-sell).
Return ONLY raw JSON, no markdown: {"threads":[{"title":"the thread title","subreddit":"r/...","url":"https://www.reddit.com/...","why":"one line on why it's relevant","angle":"a short, genuine way to contribute value"}]}`;
      const response = await geminiGenerate({
        model: geminiModel,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const parsed = parseJson(response.text) || {};
      const snapshot = { ranAt: nowIso(), threads: normalizeRedditThreads(parsed.threads) };
      state.latest = snapshot;
      state.updatedAt = snapshot.ranAt;
      save();
      return { snapshot };
    } catch (error) {
      const failure = publicProviderError(error, {
        provider: 'Gemini',
        operation: 'The Reddit discovery scan',
        setupPath: 'Settings → Your connections → Gemini',
      });
      return { code: failure.code, error: failure.error };
    }
  }

  return { run };
}

module.exports = { createRedditDiscoveryService, normalizeRedditThreads };
