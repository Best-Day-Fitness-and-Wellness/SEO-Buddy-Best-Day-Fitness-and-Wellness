'use strict';

function createBackgroundRuntime(options) {
  const {
    role, worker, dispatcher, handlers, featureHandlers,
    startContentSchedule, stopContentSchedule,
    scheduleHealthSnapshots, recurringChecks = [], logger, reindexRepairedPosts,
  } = options;
  let started = false;

  function registerHandlers() {
    for (const [type, handler] of Object.entries(featureHandlers)) handlers.set(type, handler);
  }

  function startSchedules() {
    startContentSchedule();
    scheduleHealthSnapshots();
    dispatcher.scheduleDaily('storage.backup', 2 * 60 * 1000);
    dispatcher.scheduleDaily('report.monthly-email', 150000, 13 * 60);
    dispatcher.scheduleCheck('operations.alert-check', 5 * 60 * 1000, 60 * 60 * 1000);
    for (const check of recurringChecks) dispatcher.scheduleCheck(check.type, check.initialDelayMs, check.intervalMs);
  }

  function start() {
    if (started) return;
    started = true;
    registerHandlers();
    if (role.worksJobs) worker.start();
    if (role.schedules) {
      startSchedules();
      reindexRepairedPosts().catch(error => logger.error('indexing.repair_batch_failed', { error }));
    }
    logger.info('background.started', { processRole: role.name, schedules: role.schedules, worksJobs: role.worksJobs });
  }

  async function stop() {
    stopContentSchedule();
    dispatcher.stop();
    if (role.worksJobs) await worker.stop();
  }

  return { registerHandlers, start, stop };
}

module.exports = { createBackgroundRuntime };
