'use strict';
const { publicProviderError } = require('./public-provider-error');

function registerAsyncAuditRoute(app, options) {
  const {
    path,
    requireAuth,
    status,
    run,
    useBudget = false,
    usageOverBudget,
    budgetBlock,
    rejectOutputError = false,
    logLabel,
    logger = console,
  } = options;

  let running = false;

  app.get(path, (req, res) => {
    res.json({ ...status(), running });
  });

  app.post(path + '/run', requireAuth, async (req, res) => {
    if (running) return res.json({ success: true, busy: true });
    if (useBudget && usageOverBudget()) return budgetBlock(res);

    running = true;
    try {
      const output = await run();
      if (rejectOutputError && output.error) {
        return res.status(400).json({ success: false, error: output.error });
      }
      return res.json({ success: true, snapshot: output.snapshot });
    } catch (error) {
      const failure = publicProviderError(error, { provider: 'Gemini', operation: logLabel, setupPath: 'Settings → Your connections → Gemini' });
      logger.error(`[${logLabel} run] failed:`, failure.code);
      return res.status(502).json({ success: false, error: failure.error });
    } finally {
      running = false;
    }
  });
}

function registerAiAuditRoutes(app, options) {
  const { requireAuth, usageOverBudget, budgetBlock, audits, logger = console } = options;
  for (const audit of audits) {
    registerAsyncAuditRoute(app, {
      ...audit,
      requireAuth,
      usageOverBudget,
      budgetBlock,
      logger,
    });
  }
}

module.exports = { registerAiAuditRoutes, registerAsyncAuditRoute };
