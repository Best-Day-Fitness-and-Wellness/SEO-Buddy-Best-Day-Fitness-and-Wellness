'use strict';

const crypto = require('node:crypto');

const STATUSES = ['pending', 'running', 'succeeded', 'failed'];

function validateType(type) {
  const normalized = String(type || '').trim();
  if (!/^[a-z][a-z0-9._-]{1,79}$/.test(normalized)) throw new TypeError('Job type must be 2-80 lowercase letters, numbers, dots, dashes, or underscores.');
  return normalized;
}

function publicJob(row) {
  if (!row) return null;
  return {
    id: row.job_id,
    type: row.job_type,
    status: STATUSES.includes(row.status) ? row.status : 'failed',
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    runAt: new Date(row.run_at).toISOString(),
    leaseUntil: row.lease_until ? new Date(row.lease_until).toISOString() : null,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    lastError: row.last_error,
    result: row.result,
  };
}

function createPostgresJobQueue(options) {
  const pool = options.pool;
  const tenantId = options.tenantId;
  const createId = options.createId || (() => crypto.randomUUID());
  const maxRetained = Math.max(25, Number(options.maxRetained) || 500);

  async function enqueue(type, payload = {}, enqueueOptions = {}) {
    const jobType = validateType(type);
    const idempotencyKey = String(enqueueOptions.idempotencyKey || '').trim().slice(0, 200);
    if (!idempotencyKey) throw new TypeError('A durable job requires an idempotency key.');
    const maxAttempts = Math.max(1, Math.min(20, Number(enqueueOptions.maxAttempts) || 5));
    const runAt = enqueueOptions.runAt == null ? new Date() : new Date(enqueueOptions.runAt);
    if (Number.isNaN(runAt.getTime())) throw new TypeError('Job runAt must be a valid date.');
    const inserted = await pool.query(`INSERT INTO durable_jobs
      (tenant_id, job_id, job_type, payload, status, attempts, max_attempts, run_at, idempotency_key)
      VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, $5, $6, $7)
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING *`, [tenantId, createId(), jobType, JSON.stringify(payload || {}), maxAttempts, runAt.toISOString(), idempotencyKey]);
    if (inserted.rows[0]) return { created: true, job: publicJob(inserted.rows[0]) };
    const existing = await pool.query('SELECT * FROM durable_jobs WHERE tenant_id = $1 AND idempotency_key = $2', [tenantId, idempotencyKey]);
    return { created: false, job: publicJob(existing.rows[0]) };
  }

  async function claim(workerId, claimOptions = {}) {
    const owner = String(workerId || '').trim().slice(0, 120);
    if (!owner) throw new TypeError('A worker id is required to claim a job.');
    const leaseMs = Math.max(1000, Math.min(60 * 60 * 1000, Number(claimOptions.leaseMs) || 15 * 60 * 1000));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE durable_jobs SET
        status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        worker_id = NULL, lease_until = NULL, updated_at = now(),
        finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE finished_at END,
        last_error = 'Worker lease expired before completion.'
        WHERE tenant_id = $1 AND status = 'running' AND lease_until <= now()`, [tenantId]);
      const selected = await client.query(`SELECT job_id FROM durable_jobs
        WHERE tenant_id = $1 AND status = 'pending' AND run_at <= now()
        ORDER BY run_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1`, [tenantId]);
      if (!selected.rows[0]) {
        await client.query('COMMIT');
        return null;
      }
      const claimed = await client.query(`UPDATE durable_jobs SET status = 'running', attempts = attempts + 1,
        worker_id = $3, lease_until = now() + ($4 * interval '1 millisecond'),
        started_at = COALESCE(started_at, now()), updated_at = now()
        WHERE tenant_id = $1 AND job_id = $2 RETURNING *`, [tenantId, selected.rows[0].job_id, owner, leaseMs]);
      await client.query('COMMIT');
      return { ...publicJob(claimed.rows[0]), payload: claimed.rows[0].payload };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function complete(id, result = null, completeOptions = {}) {
    const params = [tenantId, id, completeOptions.workerId || null, JSON.stringify(result)];
    const completed = await pool.query(`UPDATE durable_jobs SET status = 'succeeded', result = $4::jsonb,
      worker_id = NULL, lease_until = NULL, updated_at = now(), finished_at = now()
      WHERE tenant_id = $1 AND job_id = $2 AND status = 'running'
        AND ($3::text IS NULL OR worker_id = $3) RETURNING job_id`, params);
    await prune();
    return completed.rowCount > 0;
  }

  async function renewLease(id, workerId, leaseMs = 15 * 60 * 1000) {
    const duration = Math.max(1000, Math.min(60 * 60 * 1000, Number(leaseMs) || 15 * 60 * 1000));
    const renewed = await pool.query(`UPDATE durable_jobs SET lease_until = now() + ($4 * interval '1 millisecond'), updated_at = now()
      WHERE tenant_id = $1 AND job_id = $2 AND status = 'running' AND worker_id = $3`, [tenantId, id, String(workerId || ''), duration]);
    return renewed.rowCount > 0;
  }

  async function fail(id, error, failOptions = {}) {
    const baseDelayMs = Math.max(1000, Number(failOptions.baseDelayMs) || 30000);
    const terminal = error?.retryable === false;
    const message = String(error?.message || error || 'Unknown job failure').slice(0, 1000);
    const failed = await pool.query(`UPDATE durable_jobs SET
      status = CASE WHEN $4::boolean OR attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      last_error = $5, worker_id = NULL, lease_until = NULL, updated_at = now(),
      finished_at = CASE WHEN $4::boolean OR attempts >= max_attempts THEN now() ELSE NULL END,
      run_at = CASE WHEN $4::boolean OR attempts >= max_attempts THEN run_at
        ELSE now() + (LEAST(3600000, $6 * power(2, GREATEST(0, attempts - 1))) * interval '1 millisecond') END
      WHERE tenant_id = $1 AND job_id = $2 AND status = 'running'
        AND ($3::text IS NULL OR worker_id = $3) RETURNING *`,
    [tenantId, id, failOptions.workerId || null, terminal, message, baseDelayMs]);
    await prune();
    return publicJob(failed.rows[0]);
  }

  async function prune() {
    await pool.query(`DELETE FROM durable_jobs WHERE tenant_id = $1 AND job_id IN (
      SELECT job_id FROM durable_jobs WHERE tenant_id = $1 AND status IN ('succeeded', 'failed')
      ORDER BY finished_at DESC NULLS LAST OFFSET $2
    )`, [tenantId, maxRetained]);
  }

  async function snapshot(limit = 25) {
    const bounded = Math.max(1, Math.min(100, Number(limit) || 25));
    const [countsResult, recentResult] = await Promise.all([
      pool.query('SELECT status, count(*)::integer AS count FROM durable_jobs WHERE tenant_id = $1 GROUP BY status', [tenantId]),
      pool.query('SELECT * FROM durable_jobs WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2', [tenantId, bounded]),
    ]);
    const counts = { pending: 0, running: 0, succeeded: 0, failed: 0 };
    for (const row of countsResult.rows) if (Object.hasOwn(counts, row.status)) counts[row.status] = Number(row.count);
    return { counts, recent: recentResult.rows.map(publicJob) };
  }

  async function importJobs(jobs) {
    let imported = 0;
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (!job?.id || !job?.idempotencyKey) continue;
      const result = await pool.query(`INSERT INTO durable_jobs
        (tenant_id, job_id, job_type, payload, status, attempts, max_attempts, run_at, lease_until, worker_id,
         idempotency_key, last_error, result, created_at, updated_at, finished_at)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`, [tenantId, job.id, job.type, JSON.stringify(job.payload || {}),
        job.status, job.attempts, job.maxAttempts, job.runAt, job.leaseUntil, job.workerId, job.idempotencyKey,
        job.lastError, JSON.stringify(job.result), job.createdAt, job.updatedAt, job.finishedAt]);
      imported += result.rowCount;
    }
    return imported;
  }

  return { claim, complete, enqueue, fail, importJobs, renewLease, snapshot };
}

module.exports = { createPostgresJobQueue, publicJob, validateType };
