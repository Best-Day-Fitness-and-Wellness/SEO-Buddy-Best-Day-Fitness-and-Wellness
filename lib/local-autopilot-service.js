'use strict';

const { buildCanonicalNap, mapNapListings } = require('./local-seo-routes');
const { effectiveNap } = require('./local-listing-preferences');
const { recordGbpPublication } = require('./gbp-publication');

const GBP_TOPIC_SEED = [
  'a simple fall-prevention and balance tip for active adults 50+',
  'the benefits of strength training for seniors and injury recovery',
  'how mobility work helps you stay independent as you age',
  'why small-group coaching beats crowded gyms for adults 50+',
  'a posture and core tip for everyday movement',
  'staying active and strong in St. Petersburg this season',
  'what to expect at a first longevity assessment with us',
];

function napSignatureOf(nap) {
  if (!nap || !nap.listings) return '';
  return nap.listings
    .filter(listing => listing.phoneMatch === false || listing.addrMatch === false || listing.nameMatch === false)
    .map(listing => `${listing.platform}:${listing.phoneMatch}${listing.addrMatch}${listing.nameMatch}`)
    .sort()
    .join('|');
}

function createLocalAutopilotService(options) {
  const {
    state,
    save,
    business,
    getHistory,
    brandPrompt,
    geminiGenerate,
    model,
    parseJson,
    daysSince,
    isGbpConfigured,
    publishGbp,
    recordPublication = recordGbpPublication,
    env = process.env,
    nowIso = () => new Date().toISOString(),
    logger = console,
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('Local autopilot state is required.');
  if (typeof save !== 'function') throw new TypeError('Local autopilot save callback is required.');
  if (!business || typeof business !== 'object') throw new TypeError('Business facts are required.');
  if (typeof getHistory !== 'function') throw new TypeError('getHistory is required.');
  if (typeof brandPrompt !== 'function') throw new TypeError('brandPrompt is required.');
  if (typeof geminiGenerate !== 'function') throw new TypeError('geminiGenerate is required.');
  if (typeof parseJson !== 'function') throw new TypeError('parseJson is required.');
  if (typeof daysSince !== 'function') throw new TypeError('daysSince is required.');
  if (typeof isGbpConfigured !== 'function') throw new TypeError('isGbpConfigured is required.');
  if (typeof publishGbp !== 'function') throw new TypeError('publishGbp is required.');
  if (typeof recordPublication !== 'function') throw new TypeError('recordPublication is required.');

  let running = false;

  async function scanNap() {
    const geminiKey = env.GEMINI_API_KEY;
    const canonical = buildCanonicalNap(business);
    if (!geminiKey) return null;
    const prompt = `Find the current online business listings for "${business.name}" located in ${business.addressLocality}, ${business.addressRegion}. For each major platform (Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB, local fitness directories), report the EXACT business name, full street address, and phone number shown there, based on current web information. Reply with ONLY raw JSON, no markdown fences: {"listings":[{"platform":"","name":"","address":"","phone":""}]}. Empty string if a field isn't shown.`;
    const response = await geminiGenerate({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const parsed = parseJson(response.text) || { listings: [] };
    const listings = mapNapListings(parsed.listings, business, canonical);
    const mismatchCount = listings.filter(listing => (
      listing.phoneMatch === false || listing.addrMatch === false || listing.nameMatch === false
    )).length;
    return { canonical, listings, mismatchCount, checkedAt: nowIso() };
  }

  async function draftGbp() {
    const geminiKey = env.GEMINI_API_KEY;
    if (!geminiKey) return null;
    const history = getHistory();
    let topic;
    let topicLabel;
    if (history && history.length) {
      topicLabel = history[0].title;
      topic = `our recent article "${history[0].title}" (topic: ${history[0].keyword})`;
    } else {
      const index = state.gbpHistory.length % GBP_TOPIC_SEED.length;
      topic = GBP_TOPIC_SEED[index];
      topicLabel = topic;
    }
    const brand = brandPrompt(true);
    const prompt = `${brand}\nWrite a Google Business Profile post about: ${topic}. Under 1500 characters, engaging and locally relevant to St. Petersburg, with a clear call to action at the end (book a consultation / call us / visit). Return only the post text.`;
    const response = await geminiGenerate({ model, contents: prompt });
    return {
      text: (response.text || '').trim(),
      topic: topicLabel,
      postType: 'update',
      createdAt: nowIso(),
    };
  }

  async function maybeRun(force) {
    if (running) return;
    if (!force && !state.enabled) return;
    if (!env.GEMINI_API_KEY) return;
    const napDue = force || daysSince(state.lastNapRun) >= (state.napIntervalDays || 7);
    const gbpDue = force || daysSince(state.lastGbpRun) >= (state.gbpIntervalDays || 7);
    if (!napDue && !gbpDue) return;
    running = true;
    try {
      if (napDue) {
        try {
          const nap = await scanNap();
          if (nap) {
            const activeNap = effectiveNap(nap, state.napExclusions);
            const signature = napSignatureOf(activeNap);
            state.napNewMismatch = !!(signature && signature !== (state.napSignature || '') && activeNap.mismatchCount > 0);
            state.napSignature = signature;
            state.nap = nap;
            state.lastNapRun = nowIso();
          }
        } catch (error) {
          logger.error('[Local Autopilot] NAP scan failed:', error.message);
        }
      }
      if (gbpDue) {
        try {
          const draft = await draftGbp();
          if (draft) {
            if (state.gbpDraft) {
              state.gbpHistory.unshift({ ...state.gbpDraft, isNew: false });
              state.gbpHistory = state.gbpHistory.slice(0, 8);
            }
            state.gbpDraft = { ...draft, isNew: true };
            state.lastGbpRun = nowIso();
            try {
              if (isGbpConfigured()) {
                const receipt = await publishGbp(draft.text);
                recordPublication(state.gbpDraft, receipt);
              }
            } catch (error) {
              state.gbpDraft.postError = error.message;
              logger.error('[Local Autopilot] GBP auto-post failed:', error.message);
            }
          }
        } catch (error) {
          logger.error('[Local Autopilot] GBP draft failed:', error.message);
        }
      }
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
      napIntervalDays: state.napIntervalDays,
      gbpIntervalDays: state.gbpIntervalDays,
      lastNapRun: state.lastNapRun,
      lastGbpRun: state.lastGbpRun,
      nap: effectiveNap(state.nap, state.napExclusions),
      napExclusions: state.napExclusions || [],
      napNewMismatch: state.napNewMismatch && effectiveNap(state.nap, state.napExclusions)?.mismatchCount > 0,
      gbpDraft: state.gbpDraft,
      gbpHistory: state.gbpHistory,
      replyHistory: state.replyHistory,
      hasKey: !!env.GEMINI_API_KEY,
    };
  }

  return {
    scanNap,
    draftGbp,
    maybeRun,
    status,
    get running() { return running; },
  };
}

module.exports = { GBP_TOPIC_SEED, createLocalAutopilotService, napSignatureOf };
