'use strict';

function registerAsyncAuditRoute(app, options) {
  const {
    path,
    requireAuth,
    state,
    status,
    run,
    useBudget = false,
    usageOverBudget,
    budgetBlock,
    rejectOutputError = false,
    logLabel,
    logger = console,
  } = options;

  app.get(path, (req, res) => {
    res.json(status());
  });

  app.post(path + '/run', requireAuth, async (req, res) => {
    if (state.running) return res.json({ success: true, busy: true });
    if (useBudget && usageOverBudget()) return budgetBlock(res);

    state.running = true;
    try {
      const output = await run();
      if (rejectOutputError && output.error) {
        return res.status(400).json({ success: false, error: output.error });
      }
      return res.json({ success: true, snapshot: output.snapshot });
    } catch (error) {
      logger.error(`[${logLabel} run] failed:`, error.message);
      return res.status(502).json({ success: false, error: error.message });
    } finally {
      state.running = false;
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
