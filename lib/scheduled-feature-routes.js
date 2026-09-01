'use strict';

function registerScheduledFeatureRoute(app, options) {
  const {
    path,
    requireAuth,
    status,
    nudge,
    toggle,
    start,
    availability,
    markSeen,
  } = options;

  app.get(path, (req, res) => {
    if (nudge) nudge();
    res.json(status());
  });

  app.post(path + '/toggle', requireAuth, (req, res) => {
    res.json(toggle(req.body || {}));
  });

  app.post(path + '/run', requireAuth, (req, res) => {
    const unavailable = availability ? availability() : null;
    if (unavailable) return res.json(unavailable);
    start();
    return res.json({ success: true, started: true });
  });

  app.post(path + '/seen', requireAuth, (req, res) => {
    markSeen();
    res.json({ success: true });
  });
}

function registerScheduledFeatureRoutes(app, options) {
  const { requireAuth, features } = options;
  for (const feature of features) {
    registerScheduledFeatureRoute(app, { ...feature, requireAuth });
  }
}

module.exports = { registerScheduledFeatureRoute, registerScheduledFeatureRoutes };
