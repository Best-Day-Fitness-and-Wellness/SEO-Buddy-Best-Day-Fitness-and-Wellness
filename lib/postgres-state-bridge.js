'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomicSync } = require('./json-file-store');

const OUTBOX_NAME = 'postgres-outbox.pending';

function readOutbox(filePath) {
  if (!fs.existsSync(filePath)) return { version: 1, sequence: 0, entries: {} };
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
    throw new Error('PostgreSQL state outbox is malformed.');
  }
  return { version: 1, sequence: Number(parsed.sequence || 0), entries: parsed.entries };
}

function persistOutbox(filePath, state) {
  if (!Object.keys(state.entries).length) {
    try { fs.rmSync(filePath, { force: true }); } catch (_) { /* best effort cleanup */ }
    return;
  }
  writeFileAtomicSync(filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

async function replayPostgresOutbox(options) {
  const repository = options.repository;
  const store = options.store;
  const filePath = repository.pathFor(OUTBOX_NAME);
  const state = readOutbox(filePath);
  let replayed = 0;
  for (const [key, entry] of Object.entries(state.entries)) {
    await store.putState(repository.tenantId, key, entry.value);
    delete state.entries[key];
    persistOutbox(filePath, state);
    replayed += 1;
  }
  return replayed;
}

function createPostgresStateBridge(options) {
  const repository = options.repository;
  const store = options.store;
  const logger = options.logger || null;
  const filePath = repository.pathFor(OUTBOX_NAME);
  const state = readOutbox(filePath);
  let draining = null;
  let closed = false;
  let retryTimer = null;
  let lastSyncedAt = null;
  let lastError = null;

  function stateKeyFor(candidate) {
    const resolved = path.resolve(candidate);
    if (path.dirname(resolved) !== path.resolve(repository.directory)) return null;
    const key = path.basename(resolved);
    if (!key.endsWith('.json') || key === 'migration-v1.json') return null;
    return key;
  }

  function capture(candidate, value) {
    if (closed) return;
    const key = stateKeyFor(candidate);
    if (!key) return;
    state.sequence += 1;
    state.entries[key] = { sequence: state.sequence, value };
    persistOutbox(filePath, state);
    setImmediate(drain);
  }

  async function runDrain() {
    while (!closed && Object.keys(state.entries).length) {
      const key = Object.keys(state.entries)[0];
      const entry = state.entries[key];
      try {
        await store.putState(repository.tenantId, key, entry.value);
        if (state.entries[key]?.sequence === entry.sequence) delete state.entries[key];
        persistOutbox(filePath, state);
        lastSyncedAt = new Date().toISOString();
        lastError = null;
      } catch (error) {
        lastError = error.code || error.message;
        logger?.error?.('storage.postgres_write_failed', { tenantId: repository.tenantId, stateKey: key, error });
        if (!closed && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            drain();
          }, 5000);
          retryTimer.unref?.();
        }
        break;
      }
    }
  }

  function drain() {
    if (!draining) draining = runDrain().finally(() => { draining = null; });
    return draining;
  }

  async function flush() {
    await drain();
    return Object.keys(state.entries).length === 0;
  }

  function close() {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function status() {
    return {
      pendingWrites: Object.keys(state.entries).length,
      lastSyncedAt,
      lastError,
    };
  }

  return { capture, close, drain, flush, status };
}

module.exports = { OUTBOX_NAME, createPostgresStateBridge, readOutbox, replayPostgresOutbox };
