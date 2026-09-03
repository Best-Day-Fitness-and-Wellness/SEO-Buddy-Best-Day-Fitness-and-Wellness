'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomicSync, writeJsonFileSync } = require('./json-file-store');

const STATE_FILES = Object.freeze([
  'health-score.json', 'history.json', 'performance.json', 'ai-visibility.json',
  'ai-factcheck.json', 'ai-crawlers.json', 'reddit-threads.json', 'aio-audits.json',
  'citations.json', 'local-autopilot.json', 'onsite-autopilot.json',
  'autopilot-config.json', 'autopilot-logs.json', 'performance-digest.json',
  'monthly-report.json',
  'business-profile.json', 'brand-profile.json', 'usage.json',
  'reviews-snapshots.json', 'jobs.json', 'audit-log.jsonl',
]);

function normalizeTenantId(value) {
  const normalized = String(value || 'best-day-fitness').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized || normalized.length > 80) throw new TypeError('TENANT_ID must contain 1-80 letters, numbers, dashes, or underscores.');
  return normalized;
}

function checksum(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function createFileStateRepository(options) {
  const storageRoot = path.resolve(options.storageRoot);
  const tenantId = normalizeTenantId(options.tenantId);
  const directory = path.join(storageRoot, 'tenants', tenantId);
  fs.mkdirSync(directory, { recursive: true });

  function pathFor(key) {
    const name = String(key || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new TypeError(`Invalid state key: ${name}`);
    const resolved = path.resolve(directory, name);
    if (!resolved.startsWith(directory + path.sep)) throw new TypeError(`State key escapes tenant boundary: ${name}`);
    return resolved;
  }

  function migrateLegacyFiles(files = STATE_FILES) {
    const migrated = [];
    for (const name of files) {
      const source = path.join(storageRoot, name);
      const destination = pathFor(name);
      if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
      const contents = fs.readFileSync(source);
      writeFileAtomicSync(destination, contents, { encoding: null, mode: name.endsWith('.jsonl') ? 0o600 : 0o666 });
      const copied = fs.readFileSync(destination);
      if (checksum(contents) !== checksum(copied)) throw new Error(`State migration checksum failed for ${name}`);
      migrated.push(name);
    }
    if (migrated.length) {
      writeJsonFileSync(pathFor('migration-v1.json'), { migratedAt: new Date().toISOString(), tenantId, files: migrated });
    }
    return migrated;
  }

  function listStateFiles() {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl')))
      .map(entry => entry.name)
      .sort();
  }

  function readJson(key, fallback) {
    const filePath = pathFor(key);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeJson(key, value) {
    writeJsonFileSync(pathFor(key), value);
  }

  const migrated = migrateLegacyFiles();
  return {
    backend: 'filesystem',
    directory,
    migrated,
    pathFor,
    readJson,
    writeJson,
    listStateFiles,
    status: () => ({ backend: 'filesystem', tenantId, directory, files: listStateFiles().length, migrated: [...migrated] }),
    tenantId,
  };
}

module.exports = { STATE_FILES, createFileStateRepository, normalizeTenantId };
