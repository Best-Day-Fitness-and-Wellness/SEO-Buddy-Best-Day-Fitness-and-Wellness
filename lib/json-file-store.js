'use strict';

const fs = require('node:fs');

let writeSequence = 0;

/**
 * Persist JSON by replacing the destination only after the complete new file
 * has been written. The temporary file lives beside the destination so the
 * rename stays on the same filesystem and remains atomic.
 */
function writeJsonFileSync(filePath, value) {
  const serialized = JSON.stringify(value, null, 2);
  const temporaryPath = `${filePath}.${process.pid}.${++writeSequence}.tmp`;

  try {
    fs.writeFileSync(temporaryPath, serialized, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch (_) { /* best effort cleanup */ }
    throw error;
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

module.exports = { saveJsonFileSync, writeJsonFileSync };
