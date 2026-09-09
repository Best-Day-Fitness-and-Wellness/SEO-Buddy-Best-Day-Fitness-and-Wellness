const fs = require('fs');
const path = require('path');
const { google: defaultGoogle } = require('googleapis');

const GOOGLE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/indexing',
]);

// Redact every letter and digit while retaining enough punctuation and Unicode
// information to diagnose credentials damaged by rich-text copy and paste.
function credentialShape(raw, len = 24) {
  return Array.from(String(raw == null ? '' : raw).slice(0, len)).map(ch => {
    const codePoint = ch.codePointAt(0);
    if (/[A-Za-z0-9]/.test(ch)) return 'x';
    if (ch === ' ') return '_';
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    if (codePoint < 0x20 || codePoint > 0x7E) {
      return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return ch;
  }).join(' ');
}

const SERVICE_ACCOUNT_JSON_REPAIRS = Object.freeze([
  ['a byte-order mark', value => value.replace(/^﻿/, '')],
  ['invisible zero-width characters', value => value.replace(/[​-‍⁠﻿]/g, '')],
  ['non-breaking spaces', value => value.replace(/[   -   　]/g, ' ')],
  ['quotes curled by a word processor', value => value.replace(/[“”„‟″‶«»＂]/g, '"')],
  ['single quotes where JSON needs double', value => /"/.test(value) ? value : value.replace(/['‘’ʼ`]/g, '"')],
  ['unquoted property names', value => value.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')],
  ['a trailing comma', value => value.replace(/,(\s*[}\]])/g, '$1')],
]);

function looksLikeServiceAccount(credentials) {
  return Boolean(credentials
    && typeof credentials === 'object'
    && credentials.client_email
    && typeof credentials.private_key === 'string'
    && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(credentials.private_key)
    && /-----END [A-Z ]*PRIVATE KEY-----/.test(credentials.private_key));
}

function parseServiceAccountJson(raw) {
  const text = String(raw == null ? '' : raw);
  try {
    const credentials = JSON.parse(text);
    if (!credentials || typeof credentials !== 'object' || !credentials.client_email || !credentials.private_key) {
      return {
        creds: null,
        repaired: false,
        repairs: [],
        error: 'This is valid JSON but not a service-account key — it has no '
          + [!(credentials && credentials.client_email) && 'client_email', !(credentials && credentials.private_key) && 'private_key']
            .filter(Boolean).join(' or ')
          + '. Download the key again from Google Cloud -> IAM -> Service accounts -> Keys.',
        shape: credentialShape(text),
      };
    }
    return { creds: credentials, repaired: false, repairs: [] };
  } catch (strictError) {
    let working = text;
    const applied = [];
    for (const [name, repair] of SERVICE_ACCOUNT_JSON_REPAIRS) {
      const next = repair(working);
      if (next === working) continue;
      working = next;
      applied.push(name);
      let credentials;
      try { credentials = JSON.parse(working); } catch { continue; }
      if (looksLikeServiceAccount(credentials)) {
        return { creds: credentials, repaired: true, repairs: applied.slice() };
      }
      return {
        creds: null,
        repaired: false,
        repairs: applied.slice(),
        error: 'The JSON was readable but is not a service-account key (no client_email, or private_key is not a PEM block).',
        shape: credentialShape(text),
      };
    }
    return {
      creds: null,
      repaired: false,
      repairs: applied,
      error: strictError.message,
      shape: credentialShape(text),
    };
  }
}

function createGoogleApiClient(options = {}) {
  const {
    google = defaultGoogle,
    providerRuntime,
    env = process.env,
    fsImpl = fs,
    pathImpl = path,
    baseDir = process.cwd(),
    logger = console,
  } = options;

  if (!google?.auth?.JWT || !google?.auth?.GoogleAuth) throw new TypeError('google auth client is required.');
  if (typeof google.webmasters !== 'function') throw new TypeError('google webmasters client is required.');
  if (typeof google.indexing !== 'function') throw new TypeError('google indexing client is required.');
  if (!providerRuntime || typeof providerRuntime.run !== 'function') throw new TypeError('providerRuntime.run is required.');

  function getGoogleAuth() {
    const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) return null;

    try {
      if (credentialsPath.trim().startsWith('{')) {
        const parsed = parseServiceAccountJson(credentialsPath);
        if (!parsed.creds) {
          logger.error('[Google Auth] Failed to load credentials:', parsed.error);
          logger.error('[Google Auth] Credential starts:', parsed.shape || credentialShape(credentialsPath));
          if (parsed.repairs?.length) {
            logger.error('[Google Auth] Repairs attempted, still unreadable:', parsed.repairs.join(', '));
          }
          return null;
        }
        if (parsed.repaired) {
          logger.warn(`[Google Auth] Credentials JSON needed repair (${(parsed.repairs || []).join(', ')}); loaded anyway. Re-paste from a plain text editor to silence this.`);
        }
        return new google.auth.JWT(
          parsed.creds.client_email,
          null,
          parsed.creds.private_key,
          GOOGLE_SCOPES.slice(),
          null,
        );
      }

      const absolutePath = pathImpl.isAbsolute(credentialsPath)
        ? credentialsPath
        : pathImpl.join(baseDir, credentialsPath);
      if (fsImpl.existsSync(absolutePath)) {
        return new google.auth.GoogleAuth({ keyFile: absolutePath, scopes: GOOGLE_SCOPES.slice() });
      }
    } catch (error) {
      logger.error('[Google Auth] Failed to load credentials:', error.message);
    }
    return null;
  }

  const createWebmasters = auth => google.webmasters({ version: 'v3', auth });
  const createIndexingClient = auth => google.indexing({ version: 'v3', auth });

  async function searchConsoleQuery(client, request) {
    return providerRuntime.run('search-console', () => client.searchanalytics.query(request), {
      policy: { retries: 1, timeoutMs: 30000 },
    });
  }

  async function publishIndexNotification(client, request) {
    return providerRuntime.run('google-indexing', () => client.urlNotifications.publish(request), {
      policy: { retries: 0, timeoutMs: 30000 },
    });
  }

  return {
    getGoogleAuth,
    createWebmasters,
    createIndexingClient,
    searchConsoleQuery,
    publishIndexNotification,
    parseServiceAccountJson,
    credentialShape,
  };
}

module.exports = {
  GOOGLE_SCOPES,
  credentialShape,
  looksLikeServiceAccount,
  parseServiceAccountJson,
  createGoogleApiClient,
};
