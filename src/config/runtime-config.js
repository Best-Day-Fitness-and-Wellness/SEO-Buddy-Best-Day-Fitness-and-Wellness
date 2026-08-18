'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

/**
 * Resolve process-level configuration once at startup.
 *
 * Keeping this boundary small makes environment access explicit and prevents
 * feature modules from acquiring hidden configuration dependencies. The
 * returned object intentionally preserves the legacy defaults.
 */
function loadRuntimeConfig({ env = process.env, projectRoot, logger = console } = {}) {
  if (!projectRoot) throw new TypeError('projectRoot is required');

  const dataDir = env.DATA_DIR || projectRoot;
  dotenv.config({ path: path.join(dataDir, '.env'), processEnv: env });

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (error) {
    logger.error('[Data Dir] Could not create DATA_DIR:', error.message);
  }

  return Object.freeze({
    projectRoot,
    publicDir: path.join(projectRoot, 'public'),
    dataDir,
    port: env.PORT || 3000,
    adminPassword: env.ADMIN_PASSWORD || '',
    allowedOrigin: env.ALLOWED_ORIGIN || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-3.6-flash',
    reviewsUrl: (env.REVIEWS_URL || 'https://bestdayfitnessreviews.com').replace(/\/+$/, ''),
  });
}

module.exports = { loadRuntimeConfig };
