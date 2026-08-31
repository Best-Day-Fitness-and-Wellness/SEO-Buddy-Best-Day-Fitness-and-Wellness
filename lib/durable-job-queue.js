'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { writeJsonFileSync } = require('./json-file-store');

const STATUSES = new Set(['pending', 'running', 'succeeded', 'failed']);
const NO_WRITE = Symbol('no-write');

function waitSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createDurableJobQueue(options) {
  const filePath = options.filePath;
  const lockPath = `${filePath}.lock`;
  const now = options.now || (() => Date.now());
  const createId = options.createId || (() => crypto.randomUUID());
  const maxRetained = Math.max(25, Number(options.maxRetained) || 500);

  function emptyState() {
    return { version: 1, jobs: [] };
  }

  function readState() {
    if (!fs.existsSync(filePath)) return emptyState();
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!state || state.version !== 1 || !Array.isArray(state.jobs)) {
      throw new Error('Unsupported durable job queue format.');
    }
    return state;
  }

  function acquireLock() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        return fs.openSync(lockPath, 'wx', 0o600);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
          if (ageMs > 30000) fs.rmSync(lockPath, { force: true });
        } catch (statError) {
          if (statError.code !== 'ENOENT') throw statError;
        }
        waitSync(10);
      }
    }
    throw new Error('Timed out waiting for the durable job queue lock.');
  }

  function withLock(operation) {
    const descriptor = acquireLock();
    try {
      const state = readState();
      const result = operation(state);
      if (result && result[NO_WRITE]) return result.value;
      prune(state);
      writeJsonFileSync(filePath, state);
      return result;
    } finally {
      try { fs.closeSync(descriptor); } catch (_) { /* best effort */ }
      try { fs.rmSync(lockPath, { force: true }); } catch (_) { /* best effort */ }
    }
  }

  function unchanged(value) {
    return { [NO_WRITE]: true, value };
  }

  function prune(state) {
    if (state.jobs.length <= maxRetained) return;
    const active = state.jobs.filter(job => job.status === 'pending' || job.status === 'running');
    const finished = state.jobs
      .filter(job => job.status === 'succeeded' || job.status === 'failed')
      .sort((a, b) => Date.parse(b.finishedAt || b.updatedAt) - Date.parse(a.finishedAt || a.updatedAt));
    state.jobs = [...active, ...finished.slice(0, Math.max(0, maxRetained - active.length))];
  }

  function validateType(type) {
    const normalized = String(type || '').trim();
    if (!/^[a-z][a-z0-9._-]{1,79}$/.test(normalized)) throw new TypeError('Job type must be 2-80 lowercase letters, numbers, dots, dashes, or underscores.');
    return normalized;
  }

  function enqueue(type, payload = {}, enqueueOptions = {}) {
    const jobType = validateType(type);
    const idempotencyKey = String(enqueueOptions.idempotencyKey || '').trim().slice(0, 200);
    if (!idempotencyKey) throw new TypeError('A durable job requires an idempotency key.');
    const maximumAttempts = Math.max(1, Math.min(20, Number(enqueueOptions.maxAttempts) || 5));
    const runAtMs = enqueueOptions.runAt == null ? now() : new Date(enqueueOptions.runAt).getTime();
    if (!Number.isFinite(runAtMs)) throw new TypeError('Job runAt must be a valid date.');

    return withLock(state => {
      const existing = state.jobs.find(job => job.idempotencyKey === idempotencyKey);
      if (existing) return unchanged({ job: publicJob(existing), created: false });

      const timestamp = new Date(now()).toISOString();
      const job = {
        id: createId(),
        type: jobType,
        payload,
        status: 'pending',
        attempts: 0,
        maxAttempts: maximumAttempts,
        runAt: new Date(runAtMs).toISOString(),
        leaseUntil: null,
        workerId: null,
        idempotencyKey,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        result: null,
      };
      state.jobs.push(job);
      return { job: publicJob(job), created: true };
    });
  }

  function reclaimExpired(state, timestampMs) {
    let changed = false;
    for (const job of state.jobs) {
      if (job.status !== 'running' || !job.leaseUntil || Date.parse(job.leaseUntil) > timestampMs) continue;
      job.status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
      job.workerId = null;
      job.leaseUntil = null;
      job.updatedAt = new Date(timestampMs).toISOString();
      job.lastError = 'Worker lease expired before completion.';
      if (job.status === 'failed') job.finishedAt = job.updatedAt;
      changed = true;
    }
    return changed;
  }

  function claim(workerId, claimOptions = {}) {
    const owner = String(workerId || '').trim().slice(0, 120);
    if (!owner) throw new TypeError('A worker id is required to claim a job.');
    const leaseMs = Math.max(1000, Math.min(60 * 60 * 1000, Number(claimOptions.leaseMs) || 15 * 60 * 1000));
    return withLock(state => {
      const timestampMs = now();
      const reclaimed = reclaimExpired(state, timestampMs);
      const job = state.jobs
        .filter(item => item.status === 'pending' && Date.parse(item.runAt) <= timestampMs)
        .sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt) || Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
      if (!job) return reclaimed ? null : unchanged(null);
      job.status = 'running';
      job.attempts += 1;
      job.workerId = owner;
      job.leaseUntil = new Date(timestampMs + leaseMs).toISOString();
      job.startedAt = job.startedAt || new Date(timestampMs).toISOString();
      job.updatedAt = new Date(timestampMs).toISOString();
      return { ...publicJob(job), payload: job.payload };
    });
  }

  function complete(id, result = null, completeOptions = {}) {
    return withLock(state => {
      const job = state.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running' || (completeOptions.workerId && job.workerId !== completeOptions.workerId)) return unchanged(false);
      const timestamp = new Date(now()).toISOString();
      job.status = 'succeeded';
      job.result = result;
      job.workerId = null;
      job.leaseUntil = null;
      job.updatedAt = timestamp;
      job.finishedAt = timestamp;
      return true;
    });
  }

  function renewLease(id, workerId, leaseMs = 15 * 60 * 1000) {
    const owner = String(workerId || '').trim();
    const duration = Math.max(1000, Math.min(60 * 60 * 1000, Number(leaseMs) || 15 * 60 * 1000));
    return withLock(state => {
      const job = state.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running' || job.workerId !== owner) return unchanged(false);
      const timestampMs = now();
      job.leaseUntil = new Date(timestampMs + duration).toISOString();
      job.updatedAt = new Date(timestampMs).toISOString();
      return true;
    });
  }

  function fail(id, error, failOptions = {}) {
    const baseDelayMs = Math.max(1000, Number(failOptions.baseDelayMs) || 30000);
    return withLock(state => {
      const job = state.jobs.find(item => item.id === id);
      if (!job || job.status !== 'running' || (failOptions.workerId && job.workerId !== failOptions.workerId)) return unchanged(null);
      const timestampMs = now();
      const terminal = error?.retryable === false || job.attempts >= job.maxAttempts;
      job.status = terminal ? 'failed' : 'pending';
      job.lastError = String(error && error.message ? error.message : error || 'Unknown job failure').slice(0, 1000);
      job.workerId = null;
      job.leaseUntil = null;
      job.updatedAt = new Date(timestampMs).toISOString();
      if (terminal) {
        job.finishedAt = job.updatedAt;
      } else {
        const delay = Math.min(60 * 60 * 1000, baseDelayMs * (2 ** Math.max(0, job.attempts - 1)));
        job.runAt = new Date(timestampMs + delay).toISOString();
      }
      return publicJob(job);
    });
  }

  function publicJob(job) {
    return {
      id: job.id,
      type: job.type,
      status: STATUSES.has(job.status) ? job.status : 'failed',
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAt: job.runAt,
      leaseUntil: job.leaseUntil,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      lastError: job.lastError,
      result: job.result,
    };
  }

  function snapshot(limit = 25) {
    const state = readState();
    const counts = { pending: 0, running: 0, succeeded: 0, failed: 0 };
    for (const job of state.jobs) counts[STATUSES.has(job.status) ? job.status : 'failed'] += 1;
    return {
      counts,
      recent: state.jobs
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, Math.max(1, Math.min(100, Number(limit) || 25)))
        .map(publicJob),
    };
  }

  return { claim, complete, enqueue, fail, renewLease, snapshot };
}

module.exports = { createDurableJobQueue };
