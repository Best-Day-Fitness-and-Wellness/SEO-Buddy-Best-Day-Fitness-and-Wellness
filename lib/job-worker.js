'use strict';

function createJobWorker(options) {
  const queue = options.queue;
  const handlers = options.handlers;
  const logger = options.logger;
  const workerId = String(options.workerId || '').trim();
  const isShuttingDown = options.isShuttingDown || (() => false);
  const intervalMs = Math.max(250, Number(options.intervalMs) || 5000);
  const leaseMs = Math.max(1000, Number(options.leaseMs) || 15 * 60 * 1000);
  const heartbeatMs = Math.max(250, Math.min(leaseMs / 2, Number(options.heartbeatMs) || 60 * 1000));
  const maxPerDrain = Math.max(1, Math.min(100, Number(options.maxPerDrain) || 20));
  if (!workerId) throw new TypeError('A job worker id is required.');

  let timer = null;
  let running = false;
  let draining = false;
  let activeJob = null;

  async function drain() {
    if (!running || draining || isShuttingDown()) return;
    draining = true;
    try {
      for (let processed = 0; processed < maxPerDrain && !isShuttingDown(); processed++) {
        const job = await queue.claim(workerId, { leaseMs });
        if (!job) break;
        activeJob = job;
        logger.info('job.started', { jobId: job.id, jobType: job.type, attempt: job.attempts });
        const heartbeat = setInterval(async () => {
          try { await queue.renewLease(job.id, workerId, leaseMs); }
          catch (error) { logger.error('job.lease_renewal_failed', { jobId: job.id, jobType: job.type, error }); }
        }, heartbeatMs);
        heartbeat.unref?.();
        try {
          const handler = handlers.get(job.type);
          if (!handler) throw new Error(`No handler registered for job type ${job.type}.`);
          const result = await handler(job.payload || {});
          await queue.complete(job.id, result || { completed: true }, { workerId });
          logger.info('job.completed', { jobId: job.id, jobType: job.type, attempt: job.attempts });
        } catch (error) {
          const failed = await queue.fail(job.id, error, { workerId });
          logger.error('job.failed', {
            jobId: job.id,
            jobType: job.type,
            attempt: job.attempts,
            terminal: failed?.status === 'failed',
            retryAt: failed?.runAt || null,
            error,
          });
        } finally {
          clearInterval(heartbeat);
          activeJob = null;
        }
      }
    } catch (error) {
      logger.error('job.worker_failed', { workerId, error });
    } finally {
      draining = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    timer = setInterval(drain, intervalMs);
    timer.unref?.();
    setImmediate(drain);
  }

  async function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (activeJob) {
      const job = activeJob;
      try { await queue.fail(job.id, new Error('Worker stopped during deployment.'), { baseDelayMs: 1000, workerId }); }
      catch (error) { logger.warn('job.shutdown_requeue_failed', { jobId: job.id, error }); }
    }
  }

  function status() {
    return { running, draining, workerId, activeJobId: activeJob?.id || null };
  }

  return { drain, start, status, stop };
}

module.exports = { createJobWorker };
