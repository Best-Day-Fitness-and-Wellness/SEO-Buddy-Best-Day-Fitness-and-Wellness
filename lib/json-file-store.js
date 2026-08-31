'use strict';

const fs = require('node:fs');

let writeSequence = 0;
let jsonWriteObserver = null;

function setJsonWriteObserver(observer) {
  if (observer != null && typeof observer !== 'function') throw new TypeError('JSON write observer must be a function.');
  jsonWriteObserver = observer || null;
}

/**
 * Replace a file only after its complete new contents have reached disk.
 * Secret/configuration callers can pass mode 0o600; the temporary file is
 * created with that mode so sensitive contents are never briefly world-readable.
 */
function writeFileAtomicSync(filePath, contents, options = {}) {
  const encoding = options.encoding || 'utf8';
  const mode = options.mode;
  const temporaryPath = `${filePath}.${process.pid}.${++writeSequence}.tmp`;
  let descriptor = null;

  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode == null ? 0o666 : mode);
    fs.writeFileSync(descriptor, contents, { encoding });
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, filePath);
    if (mode != null) {
      try { fs.chmodSync(filePath, mode); } catch (_) { /* Windows ignores POSIX modes */ }
    }
  } catch (error) {
    if (descriptor != null) {
      try { fs.closeSync(descriptor); } catch (_) { /* best effort cleanup */ }
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch (_) { /* best effort cleanup */ }
    throw error;
  }
}

/**
 * Persist JSON by replacing the destination only after the complete new file
 * has been written. The temporary file lives beside the destination so the
 * rename stays on the same filesystem and remains atomic.
 */
function writeJsonFileSync(filePath, value) {
  const serialized = JSON.stringify(value, null, 2);
  writeFileAtomicSync(filePath, serialized);
  if (jsonWriteObserver) {
    try { jsonWriteObserver(filePath, value); }
    catch (error) { console.error('[State write observer] capture failed:', error.message); }
  }
}

/**
 * Best-effort persistence for request and scheduler paths that historically
 * logged storage failures without failing the user operation.
 */
function saveJsonFileSync(filePath, value, label) {
  try {
    writeJsonFileSync(filePath, value);
    return true;
  } catch (error) {
    console.error(`[${label}] save failed:`, error.message);
    return false;
  }
}

module.exports = { saveJsonFileSync, setJsonWriteObserver, writeFileAtomicSync, writeJsonFileSync };
