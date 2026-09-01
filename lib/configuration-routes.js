'use strict';

const path = require('node:path');
const { normalizeSecretInput } = require('./secrets');
const { serializeDotenv } = require('./dotenv-store');
const { writeFileAtomicSync } = require('./json-file-store');

const PRESERVED_SETTINGS = [
  'GEMINI_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY',
  'GHL_ACCESS_TOKEN', 'GHL_LOCATION_ID', 'GHL_BLOG_ID',
  'GSC_SITE_URL', 'GHL_BLOG_PATH_PREFIX', 'GHL_AUTHOR_NAME',
  'GHL_AUTHOR_URL', 'GOOGLE_APPLICATION_CREDENTIALS',
  'ADMIN_PASSWORD', 'OPERATOR_PASSWORD', 'AUDIT_SIGNING_KEY',
  'TRUSTPILOT_API_KEY', 'TRUSTPILOT_DOMAIN', 'REVIEWS_URL',
];

function cleanSettingValue(value, max = 10000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeSettings(input, environment) {
  const saved = {};
  for (const key of PRESERVED_SETTINGS) {
    if (environment[key]) saved[key] = environment[key];
  }
  const replacements = {
    GEMINI_API_KEY: normalizeSecretInput(input.geminiKey, 'Gemini API key'),
    OPENAI_API_KEY: normalizeSecretInput(input.openaiKey, 'OpenAI API key'),
    PERPLEXITY_API_KEY: normalizeSecretInput(input.perplexityKey, 'Perplexity API key'),
    GHL_ACCESS_TOKEN: normalizeSecretInput(input.ghlToken, 'GoHighLevel access token'),
    GHL_LOCATION_ID: cleanSettingValue(input.ghlLocation, 500),
    GHL_BLOG_ID: cleanSettingValue(input.ghlBlog, 500),
    GSC_SITE_URL: cleanSettingValue(input.siteUrl, 2000),
    GHL_BLOG_PATH_PREFIX: cleanSettingValue(input.blogPrefix, 500),
    GHL_AUTHOR_NAME: cleanSettingValue(input.authorName, 500),
    GHL_AUTHOR_URL: cleanSettingValue(input.authorUrl, 2000),
  };
  for (const [key, value] of Object.entries(replacements)) {
    if (value) saved[key] = value;
  }
  return saved;
}

function validateSavedSettings(saved) {
  if (saved.GSC_SITE_URL) {
    if (saved.GSC_SITE_URL.startsWith('sc-domain:')) {
      if (!/^sc-domain:[a-z0-9.-]+$/i.test(saved.GSC_SITE_URL)) {
        return 'Search Console domain properties must look like sc-domain:example.com.';
      }
    } else {
      let parsed;
      try { parsed = new URL(saved.GSC_SITE_URL); } catch (error) { /* handled below */ }
      if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
        return 'The site URL must start with http:// or https://.';
      }
    }
  }
  if (saved.GHL_BLOG_PATH_PREFIX && !saved.GHL_BLOG_PATH_PREFIX.startsWith('/')) {
    saved.GHL_BLOG_PATH_PREFIX = `/${saved.GHL_BLOG_PATH_PREFIX}`;
  }
  if (saved.GHL_AUTHOR_URL) {
    let parsed;
    try { parsed = new URL(saved.GHL_AUTHOR_URL); } catch (error) { /* handled below */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      return 'The author URL must start with http:// or https://.';
    }
  }
  return null;
}

function registerConfigurationRoutes(app, options) {
  const {
    requireOwner,
    configDir,
    environment,
    parseServiceAccountJson,
    reloadEnvironment,
    reinitializeGemini,
    clearCaches,
    getStorageStatus,
    writePrivateFile = writeFileAtomicSync,
    serializeSettings = serializeDotenv,
    logger = console,
  } = options;

  app.post('/api/save-settings', requireOwner, (req, res) => {
    const input = req.body || {};
    try {
      const saved = normalizeSettings(input, environment);
      const validationError = validateSavedSettings(saved);
      if (validationError) return res.status(400).json({ success: false, error: validationError });

      if (cleanSettingValue(input.gscJson, 2 * 1024 * 1024)) {
        try {
          const parsedKey = parseServiceAccountJson(input.gscJson);
          if (!parsedKey.creds) {
            return res.status(400).json({
              success: false,
              error: `The Google credentials field must contain valid service-account JSON. ${parsedKey.error || ''}`,
            });
          }
          const credentials = parsedKey.creds;
          if (!credentials || typeof credentials !== 'object' || !credentials.client_email || !credentials.private_key) {
            return res.status(400).json({ success: false, error: 'The Google credentials JSON is missing client_email or private_key.' });
          }
          const credentialsPath = path.join(configDir, 'google-creations.json');
          writePrivateFile(credentialsPath, JSON.stringify(credentials), { mode: 0o600 });
          saved.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
        } catch (error) {
          logger.error('[Settings] Invalid GSC JSON key:', error.message);
          return res.status(400).json({ success: false, error: 'The Google credentials field must contain valid service-account JSON.' });
        }
      }

      const inheritedRaw = saved.GOOGLE_APPLICATION_CREDENTIALS || '';
      if (inheritedRaw.trim().startsWith('{')) {
        const inherited = parseServiceAccountJson(inheritedRaw);
        if (inherited.creds) {
          const inheritedPath = path.join(configDir, 'google-creations.json');
          writePrivateFile(inheritedPath, JSON.stringify(inherited.creds), { mode: 0o600 });
          saved.GOOGLE_APPLICATION_CREDENTIALS = inheritedPath;
          environment.GOOGLE_APPLICATION_CREDENTIALS = inheritedPath;
          logger.log('[Settings] Moved the service-account key out of the environment variable and onto the volume; .env now stores the path.');
        } else {
          delete saved.GOOGLE_APPLICATION_CREDENTIALS;
          logger.warn('[Settings] Service-account JSON in the environment is unreadable; leaving it out of .env.', inherited.shape || '');
        }
      }

      const settingsPath = path.join(configDir, '.env');
      writePrivateFile(settingsPath, serializeSettings(saved), { mode: 0o600 });
      reloadEnvironment(settingsPath);
      if (environment.GEMINI_API_KEY) reinitializeGemini(environment.GEMINI_API_KEY);
      clearCaches();

      return res.json({
        success: true,
        persistent: !!environment.DATA_DIR,
        message: environment.DATA_DIR
          ? 'Configuration saved to the persistent server volume and activated.'
          : 'Configuration activated. Set DATA_DIR to a persistent volume before production so it survives redeploys.',
      });
    } catch (error) {
      logger.error('[Settings] Failed to save server settings:', error.message);
      return res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/storage-status', (req, res) => res.json(getStorageStatus()));
}

module.exports = {
  PRESERVED_SETTINGS,
  cleanSettingValue,
  normalizeSettings,
  registerConfigurationRoutes,
  validateSavedSettings,
};
