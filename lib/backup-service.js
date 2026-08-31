'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomicSync, writeJsonFileSync } = require('./json-file-store');

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeBackupId(value) {
  const id = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(id)) throw new TypeError('Invalid backup id.');
  return id;
}

function createBackupService(options) {
  const repository = options.repository;
  const backupRoot = path.resolve(options.backupRoot, repository.tenantId);
  fs.mkdirSync(backupRoot, { recursive: true });

  function directoryFor(id) {
    const directory = path.resolve(backupRoot, safeBackupId(id));
    if (!directory.startsWith(backupRoot + path.sep)) throw new TypeError('Backup path escapes tenant boundary.');
    return directory;
  }

  function create() {
    const id = new Date().toISOString().replace(/:/g, '-').replace('.', '-');
    const directory = directoryFor(id);
    fs.mkdirSync(directory, { recursive: false });
    const files = repository.listStateFiles().filter(name => name !== 'migration-v1.json').map(name => {
      const source = repository.pathFor(name);
      const destination = path.join(directory, name);
      writeFileAtomicSync(destination, fs.readFileSync(source), { encoding: null, mode: name.endsWith('.jsonl') ? 0o600 : 0o666 });
      return { name, bytes: fs.statSync(destination).size, sha256: fileHash(destination) };
    });
    const manifest = { version: 1, id, tenantId: repository.tenantId, createdAt: new Date().toISOString(), files };
    writeJsonFileSync(path.join(directory, 'manifest.json'), manifest);
    return { ...manifest, valid: true };
  }

  function verify(id) {
    const directory = directoryFor(id);
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { valid: false, id, error: 'Backup manifest not found.' };
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.tenantId !== repository.tenantId || manifest.id !== id || !Array.isArray(manifest.files)) {
        return { valid: false, id, error: 'Backup manifest identity does not match.' };
      }
      for (const file of manifest.files) {
        if (!file || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(file.name || ''))) {
          return { valid: false, id, error: 'Backup manifest contains an invalid state key.' };
        }
        const candidate = path.join(directory, file.name);
        if (!fs.existsSync(candidate) || fileHash(candidate) !== file.sha256) {
          return { valid: false, id, error: `Checksum failed for ${file.name}.` };
        }
      }
      return { valid: true, id, tenantId: manifest.tenantId, createdAt: manifest.createdAt, files: manifest.files.length };
    } catch (error) {
      return { valid: false, id, error: error.message };
    }
  }

  function list() {
    return fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d{4}-/.test(entry.name))
      .map(entry => verify(entry.name))
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }

  function restore(id) {
    const check = verify(id);
    if (!check.valid) throw new Error(check.error || 'Backup verification failed.');
    const directory = directoryFor(id);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    for (const file of manifest.files) {
      writeFileAtomicSync(repository.pathFor(file.name), fs.readFileSync(path.join(directory, file.name)), {
        encoding: null,
        mode: file.name.endsWith('.jsonl') ? 0o600 : 0o666,
      });
    }
    return { restored: true, id, files: manifest.files.length, tenantId: repository.tenantId };
  }

  return { backupRoot, create, list, restore, verify };
}

module.exports = { createBackupService, safeBackupId };
