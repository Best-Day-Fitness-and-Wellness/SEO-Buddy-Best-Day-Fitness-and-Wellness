'use strict';

const VALID_MODES = new Set(['production', 'development', 'test', 'demo']);

function resolveAppMode(env = process.env) {
  const explicit = String(env.APP_MODE || '').trim().toLowerCase();
  if (explicit) {
    if (!VALID_MODES.has(explicit)) {
      throw new Error(`APP_MODE must be one of: ${Array.from(VALID_MODES).join(', ')}`);
    }
    return explicit;
  }
  if (String(env.NODE_ENV || '').toLowerCase() === 'test') return 'test';
  if (
    String(env.NODE_ENV || '').toLowerCase() === 'production'
    || env.RAILWAY_PROJECT_ID
    || env.RAILWAY_ENVIRONMENT_ID
    || env.RAILWAY_ENVIRONMENT_NAME
  ) return 'production';
  return 'development';
}

function mocksAllowed(mode, env = process.env) {
  if (mode === 'production') return false;
  const override = String(env.ALLOW_MOCK_INTEGRATIONS || '').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(override);
}

class IntegrationUnavailableError extends Error {
  constructor(integration, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'IntegrationUnavailableError';
    this.code = 'INTEGRATION_UNAVAILABLE';
    this.integration = integration;
    this.statusCode = 503;
  }
}

function integrationUnavailable(integration, message, cause) {
  return new IntegrationUnavailableError(integration, message, cause);
}

module.exports = {
  IntegrationUnavailableError,
  mocksAllowed,
  resolveAppMode,
  integrationUnavailable,
};
