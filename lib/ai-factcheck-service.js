'use strict';

const { publicProviderError } = require('./public-provider-error');

const DEFAULT_SERVICES = 'senior fitness, personal training, physical therapy, wellness for adults 50+';

function buildFactTruth({ business, listingKit, siteDomain }) {
  const kit = typeof listingKit === 'function' ? (listingKit() || {}) : {};
  const domain = typeof siteDomain === 'function' ? siteDomain() : 'bestdayfitness.com';
  return {
    name: business.name,
    city: business.addressLocality || 'St. Petersburg',
    region: business.addressRegion || 'FL',
    address: kit.addressOneLine || `${business.streetAddress || ''}, ${business.addressLocality || ''}, ${business.addressRegion || ''} ${business.postalCode || ''}`.trim(),
    phone: kit.phone || business.telephone,
    website: kit.website || `https://${domain}`,
    services: Array.isArray(kit.categories) && kit.categories.length ? kit.categories.join(', ') : DEFAULT_SERVICES,
  };
}

function createAiFactCheckService(options) {
  const {
    state,
    save,
    engines,
    engineConfigured,
    askEngine,
    meterUsage,
    getTruth,
    geminiGenerate,
    geminiModel,
    parseJson,
    env = process.env,
    nowIso = () => new Date().toISOString(),
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('FactCheck state is required.');
  if (typeof save !== 'function') throw new TypeError('FactCheck save callback is required.');
  if (!Array.isArray(engines)) throw new TypeError('FactCheck engines are required.');
  if (typeof engineConfigured !== 'function') throw new TypeError('engineConfigured is required.');
  if (typeof askEngine !== 'function') throw new TypeError('askEngine is required.');
  if (typeof meterUsage !== 'function') throw new TypeError('meterUsage is required.');
  if (typeof getTruth !== 'function') throw new TypeError('getTruth is required.');
  if (typeof geminiGenerate !== 'function') throw new TypeError('geminiGenerate is required.');
  if (typeof parseJson !== 'function') throw new TypeError('parseJson is required.');

  const engineById = new Map(engines.map(engine => [engine.id, engine]));

  async function analyzeAnswer(answerText, truth) {
    if (!env.GEMINI_API_KEY || !answerText) {
      return {
        issues: [],
        summary: env.GEMINI_API_KEY ? 'The engine gave no usable answer.' : 'Add a Gemini key to analyze answers.',
      };
    }
    try {
      const prompt = `An AI assistant said the following about our business:
"""
${answerText.slice(0, 4000)}
"""
GROUND TRUTH about the business:
${JSON.stringify(truth)}

Compare the AI's factual claims to the ground truth. Focus on: location (city/state), street address, phone number, and business type/services. Ignore hedged or "I don't know" statements. Only list claims the AI actually asserted. Return ONLY raw JSON, no markdown:
{"issues":[{"field":"location|address|phone|services|name|other","aiClaim":"what the AI asserted (short)","correct":true or false,"truth":"the correct value","note":"short note"}],"summary":"one sentence on overall accuracy"}`;
      const response = await geminiGenerate({ model: geminiModel, contents: prompt });
      const parsed = parseJson(response.text) || {};
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues.filter(issue => issue && issue.aiClaim).map(issue => ({
          field: String(issue.field || 'other'),
          aiClaim: String(issue.aiClaim),
          correct: issue.correct !== false,
          truth: String(issue.truth || ''),
          note: String(issue.note || ''),
        }))
        : [];
      return { issues, summary: String(parsed.summary || '') };
    } catch (error) {
      const failure = publicProviderError(error, {
        provider: 'Gemini',
        operation: 'The accuracy analysis',
        setupPath: 'Settings → Your connections → Gemini',
      });
      return { issues: [], summary: failure.error, errorCode: failure.code };
    }
  }

  async function run() {
    const enabled = engines.map(engine => engine.id).filter(engineConfigured);
    if (!enabled.length) {
      return { error: 'No AI engines are configured. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY).' };
    }
    const truth = getTruth();
    const question = `Tell me what you know about the business "${truth.name}" in ${truth.city}, ${truth.region}. Include: what city and state it is in, its street address if you know it, its phone number, and its main services or business type. Only state facts you are confident about; if you don't know a detail, say you don't know.`;
    const results = [];

    for (const engine of enabled) {
      const label = engineById.get(engine)?.label || engine;
      const response = await askEngine(engine, question);
      if (!response.ok) {
        results.push({
          engine,
          label,
          error: response.error || 'failed',
          accuracy: null,
          wrong: 0,
          totalClaims: 0,
          issues: [],
          summary: '',
        });
        continue;
      }
      if (engine !== 'google') meterUsage(engine);
      const analysis = await analyzeAnswer(response.answer, truth);
      const totalClaims = analysis.issues.length;
      const wrong = analysis.issues.filter(issue => !issue.correct).length;
      const accuracy = totalClaims ? Math.round(((totalClaims - wrong) / totalClaims) * 100) : null;
      results.push({
        engine,
        label,
        accuracy,
        wrong,
        totalClaims,
        issues: analysis.issues,
        summary: analysis.summary,
        snippet: response.answer.length > 400 ? `${response.answer.slice(0, 397)}…` : response.answer,
        sources: (response.sources || []).slice(0, 5),
      });
    }

    const totalWrong = results.reduce((sum, result) => sum + (result.wrong || 0), 0);
    const snapshot = { ranAt: nowIso(), truth, engines: enabled, results, totalWrong };
    state.latest = snapshot;
    state.updatedAt = snapshot.ranAt;
    save();
    return { snapshot };
  }

  return { analyzeAnswer, run };
}

module.exports = { DEFAULT_SERVICES, buildFactTruth, createAiFactCheckService };
