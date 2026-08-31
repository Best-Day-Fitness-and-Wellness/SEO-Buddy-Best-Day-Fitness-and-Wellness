'use strict';

function registerOperationsRoutes(app, options) {
  const {
    requireAuth,
    requireOwner,
    getRuntime,
    storageReadiness,
    requestMetrics,
    accessControl,
    auditLog,
    stateRepository,
    getPostgresStatus,
    providerRuntime,
    getBudget,
    backupService,
    durableJobQueue,
    isJobWorkerRunning,
  } = options;

  app.get('/api/diagnostics', requireAuth, (req, res) => {
    res.json({
      success: true,
      runtime: getRuntime(),
      storage: storageReadiness(),
      requests: requestMetrics.snapshot(),
      access: accessControl.configuredRoles(),
      audit: auditLog.verify(),
      repository: {
        backend: stateRepository.backend,
        tenantId: stateRepository.tenantId,
        files: stateRepository.listStateFiles().length,
      },
      postgresMirror: { ...getPostgresStatus() },
      integrations: providerRuntime.snapshot(),
    });
  });

  app.get('/api/integration-health', requireAuth, (req, res) => {
    res.json({ success: true, budget: getBudget(), ...providerRuntime.snapshot() });
  });

  app.get('/api/auth/status', (req, res) => {
    const roles = accessControl.configuredRoles();
    res.json({ success: true, roles, openMode: !roles.owner && !roles.operator });
  });

  app.get('/api/audit-status', requireOwner, (req, res) => {
    res.json({ success: true, audit: auditLog.verify() });
  });

  app.get('/api/storage-backups', requireOwner, (req, res) => {
    res.json({ success: true, tenantId: stateRepository.tenantId, backups: backupService.list() });
  });

  app.post('/api/storage-backups', requireOwner, (req, res) => {
    try {
      const action = String(req.body?.action || 'create');
      if (action === 'create') return res.json({ success: true, backup: backupService.create() });
      if (action === 'verify') {
        const backup = backupService.verify(String(req.body?.id || ''));
        return res.status(backup.valid ? 200 : 422).json({ success: backup.valid, backup });
      }
      return res.status(400).json({ success: false, error: 'Backup action must be create or verify.' });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/job-queue', requireAuth, (req, res) => {
    res.json({
      success: true,
      tenantId: stateRepository.tenantId,
      worker: { running: isJobWorkerRunning() },
      ...durableJobQueue.snapshot(),
    });
  });
}

module.exports = { registerOperationsRoutes };
