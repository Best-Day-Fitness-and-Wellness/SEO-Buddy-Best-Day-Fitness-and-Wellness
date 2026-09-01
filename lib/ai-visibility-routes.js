'use strict';

function buildVisibilityDeltas(latest, previous) {
  if (!latest) return null;
  const delta = (current, prior) => current == null || prior == null ? null : current - prior;
  return {
    visibility: previous ? delta(latest.visibilityScore, previous.visibilityScore) : null,
    shareOfVoice: previous ? delta(latest.shareOfVoice, previous.shareOfVoice) : null,
    sentiment: previous ? delta(latest.sentimentScore, previous.sentimentScore) : null,
  };
}

function normalizePrompts(prompts, defaults) {
  if (!Array.isArray(prompts)) return null;
  const clean = prompts.map(prompt => String(prompt || '').trim()).filter(Boolean).slice(0, 25);
  return clean.length ? clean : defaults.slice();
}

function registerAiVisibilityRoutes(app, options) {
  const {
    requireAuth,
    state,
    nudgeSchedule,
    brandName,
    enginesStatus,
    trend,
    anyConfigured,
    runVisibility,
    usageOverBudget,
    budgetBlock,
    save,
    defaultPrompts,
    logger = console,
  } = options;

  app.get('/api/ai-visibility', (req, res) => {
    nudgeSchedule();
    const snapshots = state.snapshots;
    const latest = snapshots[snapshots.length - 1] || null;
    const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
    return res.json({
      brand: brandName(),
      engines: enginesStatus(),
      prompts: state.prompts,
      latest,
      deltas: buildVisibilityDeltas(latest, previous),
      trend: trend(),
      updatedAt: state.updatedAt,
      anyConfigured: anyConfigured(),
      autoEnabled: !!state.autoEnabled,
      intervalDays: state.intervalDays || 7,
      lastRun: state.lastRun,
      running: state.running,
    });
  });

  app.post('/api/ai-visibility/run', requireAuth, async (req, res) => {
    if (state.running) {
      return res.json({ success: true, busy: true, message: 'A visibility check is already running — hang tight.' });
    }
    if (usageOverBudget()) return budgetBlock(res);

    const { engines } = req.body || {};
    state.running = true;
    try {
      const output = await runVisibility(Array.isArray(engines) ? engines : null);
      if (output.error) return res.status(400).json({ success: false, error: output.error });
      return res.json({ success: true, snapshot: output.snapshot });
    } catch (error) {
      logger.error('[AI Visibility run] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    } finally {
      state.running = false;
    }
  });

  app.post('/api/ai-visibility/toggle', requireAuth, (req, res) => {
    state.autoEnabled = !!(req.body && req.body.enabled);
    save();
    res.json({ success: true, enabled: state.autoEnabled });
  });

  app.post('/api/ai-visibility/prompts', requireAuth, (req, res) => {
    const prompts = normalizePrompts(req.body && req.body.prompts, defaultPrompts);
    if (!prompts) {
      return res.status(400).json({ success: false, error: 'prompts must be an array of strings.' });
    }
    state.prompts = prompts;
    save();
    return res.json({ success: true, prompts: state.prompts });
  });
}

module.exports = { buildVisibilityDeltas, normalizePrompts, registerAiVisibilityRoutes };
