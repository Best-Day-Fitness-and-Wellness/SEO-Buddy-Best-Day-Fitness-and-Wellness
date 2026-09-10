'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function loadMigrations(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^\d{3}_[a-z0-9_-]+\.sql$/i.test(entry.name))
    .map(entry => {
      const sql = fs.readFileSync(path.join(directory, entry.name), 'utf8');
      return { name: entry.name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function runMigrations(pool, directory) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('seo-buddy-schema-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Map((await client.query('SELECT name, checksum FROM schema_migrations')).rows.map(row => [row.name, row.checksum]));
    const completed = [];
    for (const migration of loadMigrations(directory)) {
      if (applied.has(migration.name)) {
        if (applied.get(migration.name) !== migration.checksum) throw new Error(`Applied migration changed: ${migration.name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        await client.query('COMMIT');
        completed.push(migration.name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return completed;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext('seo-buddy-schema-migrations'))"); } catch (_) { /* connection cleanup releases it */ }
    client.release();
  }
}

function createPostgresStore(options) {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: Number(options.maxConnections || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: options.ssl === false ? false : { rejectUnauthorized: false },
  });

  async function migrate(directory) { return runMigrations(pool, directory); }

  async function putState(tenantId, key, value) {
    const result = await pool.query(`INSERT INTO tenant_state (tenant_id, state_key, payload, version, updated_at)
      VALUES ($1, $2, $3::jsonb, 1, now())
      ON CONFLICT (tenant_id, state_key) DO UPDATE
      SET payload = EXCLUDED.payload, version = tenant_state.version + 1, updated_at = now()
      RETURNING version, updated_at`,
    [tenantId, key, JSON.stringify(value)]);
    return result.rows[0];
  }

  async function putStates(tenantId, entries) {
    const rows = Object.entries(entries || {});
    if (!rows.length) return [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const saved = [];
      for (const [key, value] of rows) {
        const result = await client.query(`INSERT INTO tenant_state (tenant_id, state_key, payload, version, updated_at)
          VALUES ($1, $2, $3::jsonb, 1, now())
          ON CONFLICT (tenant_id, state_key) DO UPDATE
          SET payload = EXCLUDED.payload, version = tenant_state.version + 1, updated_at = now()
          RETURNING state_key, version, updated_at`, [tenantId, key, JSON.stringify(value)]);
        saved.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function getState(tenantId, key) {
    const result = await pool.query('SELECT payload, version, updated_at FROM tenant_state WHERE tenant_id = $1 AND state_key = $2', [tenantId, key]);
    return result.rows[0] || null;
  }

  async function listStates(tenantId) {
    const result = await pool.query(
      'SELECT state_key, payload, version, updated_at FROM tenant_state WHERE tenant_id = $1 ORDER BY state_key',
      [tenantId],
    );
    return result.rows;
  }

  async function syncFrom(repository) {
    const entries = {};
    for (const key of repository.listStateFiles().filter(name => name.endsWith('.json') && name !== 'migration-v1.json')) {
      entries[key] = repository.readJson(key, null);
    }
    await putStates(repository.tenantId, entries);
    return Object.keys(entries).length;
  }

  async function touchWorker(tenantId, workerId, processRole) {
    await pool.query(`INSERT INTO worker_heartbeats (tenant_id, worker_id, process_role, started_at, last_seen_at)
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (tenant_id, worker_id) DO UPDATE SET process_role = EXCLUDED.process_role, last_seen_at = now()`,
    [tenantId, workerId, processRole]);
  }

  async function activeWorkers(tenantId, maxAgeSeconds = 45) {
    const result = await pool.query(`SELECT worker_id, process_role, started_at, last_seen_at
      FROM worker_heartbeats WHERE tenant_id = $1
        AND last_seen_at >= now() - ($2 * interval '1 second')
      ORDER BY last_seen_at DESC`, [tenantId, Math.max(5, Number(maxAgeSeconds) || 45)]);
    return result.rows.map(row => ({
      workerId: row.worker_id,
      processRole: row.process_role,
      startedAt: new Date(row.started_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    }));
  }

  async function health() {
    const started = Date.now();
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  }

  return { activeWorkers, close: () => pool.end(), getState, health, listStates, migrate, pool, putState, putStates, syncFrom, touchWorker };
}

module.exports = { createPostgresStore, loadMigrations, runMigrations };
