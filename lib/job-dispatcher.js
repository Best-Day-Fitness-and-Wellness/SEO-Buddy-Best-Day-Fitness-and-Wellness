'use strict';

// Scheduling policy is separate from feature handlers and HTTP composition.
// Both filesystem and PostgreSQL queues use this same enqueue contract.
function createJobDispatcher({ queue, worker, logger, timers = globalThis, now = () => Date.now() }) {
  const scheduled = new Set();
  let stopped = false;

  function key(type, windowMs, timestamp = now()) {
    return `${type}:${Math.floor(timestamp / windowMs)}`;
  }

  async function enqueue(type, payload, options) {
    if (stopped) return { created: false, job: null, error: 'Dispatcher is stopped.' };
    try {
      const queued = await queue.enqueue(type, payload, options);
      if (queued.created) {
        logger.info('job.enqueued', { jobId: queued.job.id, jobType: queued.job.type, runAt: queued.job.runAt });
        if (worker.status().running) timers.setImmediate(worker.drain);
      }
      return queued;
    } catch (error) {
      logger.error('job.enqueue_failed', { jobType: type, error });
      return { created: false, job: null, error: error.message };
    }
  }

  function track(handle) {
    handle.unref?.();
    scheduled.add(handle);
    return handle;
  }

  function timeout(callback, delay) {
    const handle = timers.setTimeout(() => { scheduled.delete(handle); callback(); }, delay);
    return track(handle);
  }

  function scheduleCheck(type, initialDelayMs, intervalMs) {
    const check = () => enqueue(type, {}, { idempotencyKey: key(type, intervalMs), maxAttempts: 5 });
    return { startup: timeout(check, initialDelayMs), recurring: track(timers.setInterval(check, intervalMs)) };
  }

  function scheduleDaily(type, initialDelayMs, utcMinute) {
    const check = () => enqueue(type, {}, {
      idempotencyKey: `${type}:${new Date(now()).toISOString().slice(0, 10)}`,
      maxAttempts: 5,
    });
    timeout(check, initialDelayMs);
    const day = 24 * 60 * 60 * 1000;
    if (utcMinute == null) return track(timers.setInterval(check, day));
    const next = new Date(now());
    next.setUTCHours(24, utcMinute, 0, 0);
    return timeout(() => { check(); track(timers.setInterval(check, day)); }, next.getTime() - now());
  }

  function stop() {
    stopped = true;
    for (const handle of scheduled) {
      timers.clearTimeout(handle);
      timers.clearInterval(handle);
    }
    scheduled.clear();
  }

  return { key, enqueue, scheduleCheck, scheduleDaily, stop };
}

module.exports = { createJobDispatcher };
