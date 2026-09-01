'use strict';

function normalizeBudget(value) {
  if (value === null || value === '' || value === undefined) return null;
  return Math.max(0, Number(value) || 0);
}

function registerUsageRoutes(app, options) {
  const {
    requireOwner,
    currentUsage,
    usageMonthKey,
    accountKey,
    usageState,
    usageOverBudget,
    saveUsage,
  } = options;

  app.get('/api/usage', (req, res) => {
    res.json({
      month: usageMonthKey(),
      account: accountKey(),
      usage: currentUsage(),
      budgetUSD: usageState.budgetUSD,
      overBudget: usageOverBudget(),
    });
  });

  app.post('/api/usage/budget', requireOwner, (req, res) => {
    usageState.budgetUSD = normalizeBudget(req.body && req.body.budgetUSD);
    saveUsage();
    res.json({ success: true, budgetUSD: usageState.budgetUSD });
  });
}

module.exports = { normalizeBudget, registerUsageRoutes };
