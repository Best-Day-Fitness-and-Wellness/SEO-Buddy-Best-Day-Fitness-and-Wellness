'use strict';

function registerAutopilotRoutes(app, options) {
  const {
    requireAuth,
    state,
    startScheduler,
    saveConfig,
    runCycle,
    explainIndexError,
    now = () => new Date().toISOString(),
  } = options;

  app.get('/api/autopilot-status', (req, res) => {
    res.json({
      enabled: state.enabled,
      intervalHours: state.intervalHours,
      nextRunTime: state.nextRunTime,
      queue: state.queue,
      targets: state.targets,
      logs: state.logs,
    });
  });

  app.post('/api/autopilot-toggle', requireAuth, (req, res) => {
    const { enabled, intervalHours } = req.body;
    state.enabled = !!enabled;
    if (intervalHours) state.intervalHours = parseFloat(intervalHours);

    startScheduler();
    saveConfig();

    res.json({
      success: true,
      enabled: state.enabled,
      intervalHours: state.intervalHours,
      nextRunTime: state.nextRunTime,
      message: 'Autopilot schedule updated successfully.',
    });
  });

  app.post('/api/autopilot-queue/add', requireAuth, (req, res) => {
    const topic = String((req.body && req.body.topic) || '').trim();
    if (!topic) return res.status(400).json({ success: false, error: 'Enter a topic or keyword.' });
    if (topic.length > 120) return res.status(400).json({ success: false, error: 'Keep topics under 120 characters.' });
    if (state.queue.length >= 50) return res.status(400).json({ success: false, error: 'Queue is full (50). Remove some first.' });

    state.queue.push({ topic, addedAt: now() });
    saveConfig();
    return res.json({ success: true, queue: state.queue });
  });

  app.post('/api/autopilot-queue/remove', requireAuth, (req, res) => {
    const index = req.body && typeof req.body.index === 'number' ? req.body.index : -1;
    if (index >= 0 && index < state.queue.length) state.queue.splice(index, 1);
    saveConfig();
    return res.json({ success: true, queue: state.queue });
  });

  app.get('/api/autopilot-targets', (req, res) => {
    res.json({ success: true, targets: state.targets });
  });

  app.post('/api/autopilot-targets/add', requireAuth, (req, res) => {
    const keyword = String((req.body && req.body.keyword) || '').trim();
    if (!keyword) return res.status(400).json({ success: false, error: 'Enter a target keyword.' });
    if (keyword.length > 120) return res.status(400).json({ success: false, error: 'Keep keywords under 120 characters.' });
    if (state.targets.length >= 50) return res.status(400).json({ success: false, error: 'Target list is full (50). Remove some first.' });
    if (state.targets.some(target => target.toLowerCase() === keyword.toLowerCase())) {
      return res.json({ success: true, targets: state.targets, note: 'Already a target.' });
    }

    state.targets.push(keyword);
    saveConfig();
    return res.json({ success: true, targets: state.targets });
  });

  app.post('/api/autopilot-targets/remove', requireAuth, (req, res) => {
    const index = req.body && typeof req.body.index === 'number' ? req.body.index : -1;
    if (index >= 0 && index < state.targets.length) {
      state.targets.splice(index, 1);
      if (state.targetIndex >= state.targets.length) state.targetIndex = 0;
      saveConfig();
    }
    return res.json({ success: true, targets: state.targets });
  });

  app.post('/api/autopilot-run-now', requireAuth, async (req, res) => {
    try {
      const entry = await runCycle();
      return res.json({
        success: true,
        ran: !!entry,
        entry,
        message: entry
          ? (entry.indexWarning
              ? 'Autopilot published the article. Google Indexing was refused (service account needs Owner permission in Search Console) — see the activity log.'
              : 'Autopilot completed a run successfully!')
          : 'Autopilot checked GSC, but found no new content leaks.',
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: explainIndexError(error.message) });
    }
  });
}

module.exports = { registerAutopilotRoutes };
