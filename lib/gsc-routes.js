'use strict';

const fs = require('fs');
const path = require('path');
const { ttlCache } = require('./ttl-cache');

function searchDateRange(now = () => Date.now()) {
  const end = now();
  return {
    startDate: new Date(end - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date(end).toISOString().split('T')[0],
  };
}

function mapQueryRows(rows = []) {
  const mapped = rows.map(row => {
    const impressions = row.impressions || 0;
    const clicks = row.clicks || 0;
    return {
      query: row.keys ? row.keys[0] : '',
      impressions,
      clicks,
      ctr: row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0,
      position: row.keys ? parseFloat(row.position.toFixed(1)) : 0,
      leak: clicks === 0 && impressions > 10,
    };
  });

  mapped.sort((a, b) => {
    if (a.leak && !b.leak) return -1;
    if (!a.leak && b.leak) return 1;
    return b.impressions - a.impressions;
  });
  return mapped;
}

function mapPageRows(rows = []) {
  const mapped = rows.map(row => {
    const impressions = row.impressions || 0;
    const clicks = row.clicks || 0;
    return {
      page: row.keys ? row.keys[0] : '',
      impressions,
      clicks,
      ctr: row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0,
      position: parseFloat((row.position || 0).toFixed(1)),
      leak: clicks === 0 && impressions > 10,
    };
  });
  mapped.sort((a, b) => b.impressions - a.impressions);
  return mapped;
}

function createGscService(options) {
  const {
    getGoogleAuth,
    getSiteUrl = () => process.env.GSC_SITE_URL,
    getRawCredentials = () => process.env.GOOGLE_APPLICATION_CREDENTIALS,
    createWebmasters,
    searchConsoleQuery,
    parseServiceAccountJson,
    credentialShape,
    integrationUnavailable,
    allowMockIntegrations,
    mockData,
    baseDir,
    now,
    logger = console,
  } = options;

  async function computeDashboardData() {
    const auth = getGoogleAuth();
    const siteUrl = getSiteUrl();

    if (auth && siteUrl) {
      try {
        const { startDate, endDate } = searchDateRange(now);
        const response = await searchConsoleQuery(createWebmasters(auth), {
          siteUrl,
          requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 100 },
        });
        return { source: 'live_gsc', data: mapQueryRows(response.data.rows || []) };
      } catch (error) {
        logger.error('[GSC API] Failed:', error.message);
        if (!allowMockIntegrations) {
          throw integrationUnavailable(
            'google_search_console',
            `Search Console data could not be loaded: ${error.message}`,
            error,
          );
        }
      }
    }

    if (!allowMockIntegrations) {
      return {
        source: 'unavailable',
        error: 'Search Console is not configured. Production mode will not substitute demo search data.',
        data: [],
      };
    }
    return { source: 'mock_data', data: mockData };
  }

  const getDashboardData = ttlCache(computeDashboardData, {
    ttlMs: 60 * 1000,
    staleIfErrorMs: 5 * 60 * 1000,
  });

  async function getPages(query) {
    const auth = getGoogleAuth();
    const siteUrl = getSiteUrl();
    const q = String(query || '').trim();

    if (!auth || !siteUrl) {
      return {
        source: 'unavailable',
        error: 'Search Console is not connected, so page-level data cannot be read. Settings -> Check connection will say why.',
        data: [],
      };
    }

    try {
      const { startDate, endDate } = searchDateRange(now);
      const requestBody = { startDate, endDate, dimensions: ['page'], rowLimit: 100 };
      if (q) {
        requestBody.dimensionFilterGroups = [{
          filters: [{ dimension: 'query', operator: 'equals', expression: q }],
        }];
      }

      const response = await searchConsoleQuery(createWebmasters(auth), { siteUrl, requestBody });
      return { source: 'live_gsc', query: q || null, data: mapPageRows(response.data.rows || []) };
    } catch (error) {
      logger.error('[GSC API] Page query failed:', error.message);
      return { source: 'error', query: q || null, error: error.message, data: [] };
    }
  }

  async function diagnostics() {
    // Return only configuration shape and the service-account email needed to
    // grant property access. Private keys are never included or logged.
    const out = { checks: [], verdict: null, fix: null };
    const add = (key, label, ok, detail) => out.checks.push({ key, label, ok, detail });
    const siteUrl = String(getSiteUrl() || '').trim();
    const isDomainProp = siteUrl.startsWith('sc-domain:');
    let urlShape = 'missing';
    if (siteUrl) urlShape = isDomainProp ? 'domain property' : 'URL prefix property';
    add('siteUrl', 'Site address', !!siteUrl,
      siteUrl
        ? `Set as a ${urlShape}${!isDomainProp && !siteUrl.endsWith('/') ? ' with no trailing slash' : ''}.`
        : 'GSC_SITE_URL is not set.');

    const rawCreds = String(getRawCredentials() || '');
    const looksJson = rawCreds.trim().startsWith('{');
    let creds = null;
    let credsProblem = null;
    let resolvedPath = null;
    let credsRepaired = false;
    let credsRepairs = [];
    let credsShape = null;

    if (!rawCreds) {
      credsProblem = 'GOOGLE_APPLICATION_CREDENTIALS is not set.';
    } else if (looksJson) {
      const parsed = parseServiceAccountJson(rawCreds);
      credsRepairs = parsed.repairs || [];
      if (parsed.creds) {
        creds = parsed.creds;
        if (parsed.repaired) credsRepaired = true;
      } else {
        credsShape = parsed.shape || credentialShape(rawCreds);
        credsProblem = 'The variable holds JSON, but it will not parse — usually curled "smart" quotes from pasting through a document, a truncated paste, or mangled line breaks in the private key. Parser said: ' + (parsed.error || 'unknown')
          + '. The first characters look like: ' + credsShape + ' (letters and digits masked; a healthy key reads { \\n _ _ " x x x x " : ).'
          + (credsRepairs.length ? ' Repairs tried and still unreadable: ' + credsRepairs.join(', ') + '.' : '');
      }
    } else {
      resolvedPath = path.isAbsolute(rawCreds) ? rawCreds : path.join(baseDir, rawCreds);
      if (!fs.existsSync(resolvedPath)) {
        credsProblem = `The variable points at ${resolvedPath}, and no file exists there. google-creations.json is gitignored, so it is never in the deployed image — a repo-relative path will always be empty here.`;
      } else {
        const fromFile = parseServiceAccountJson(fs.readFileSync(resolvedPath, 'utf8'));
        if (fromFile.creds) {
          creds = fromFile.creds;
          if (fromFile.repaired) credsRepaired = true;
        } else {
          credsProblem = `A file exists at ${resolvedPath} but it is not valid JSON. Parser said: ${fromFile.error || 'unknown'}`;
        }
      }
    }

    add('credentialsPresent', 'Service account file', !!creds,
      credsProblem || (looksJson ? 'Stored directly in the variable.' : `Loaded from ${resolvedPath}.`)
        + (credsRepaired ? ' Note: this needed repair (' + credsRepairs.join(', ') + ') — loaded anyway, but re-paste from a plain text editor when convenient.' : ''));
    out.credentialShape = credsShape;
    out.credentialRepairs = credsRepairs;

    const hasEmail = !!(creds && creds.client_email);
    const hasKey = !!(creds && creds.private_key);
    if (creds) {
      add('credentialsShape', 'Key contents', hasEmail && hasKey,
        hasEmail && hasKey ? 'Has client_email and private_key.'
          : `Missing ${[!hasEmail && 'client_email', !hasKey && 'private_key'].filter(Boolean).join(' and ')}.`);
    }
    out.serviceAccountEmail = hasEmail ? creds.client_email : null;

    const auth = getGoogleAuth();
    add('authClient', 'Google sign-in', !!auth,
      auth ? 'Signed in as the service account.' : 'Could not build a Google client from the above.');

    if (auth && siteUrl) {
      try {
        const response = await searchConsoleQuery(createWebmasters(auth), {
          siteUrl,
          requestBody: {
            startDate: '2024-01-01',
            endDate: '2024-01-02',
            dimensions: ['query'],
            rowLimit: 1,
          },
        });
        add('liveCall', 'Live check with Google', true,
          `Google answered for ${siteUrl}. Rows in this probe: ${(response.data.rows || []).length}.`);
        out.verdict = 'connected';
      } catch (error) {
        const code = error && (error.code || (error.response && error.response.status));
        let detail = `Google refused the request (${code || 'no status'}).`;
        let fix = null;
        if (code === 403) {
          detail = 'Google accepted the sign-in but refused this property. The service account is not a user on it.';
          fix = `In Search Console open Settings -> Users and permissions, add ${out.serviceAccountEmail || 'the service account email'} as a Full or Restricted user, then try again.`;
        } else if (code === 404) {
          detail = `Google has no property matching "${siteUrl}" for this account.`;
          fix = isDomainProp
            ? 'Check the domain property is spelled exactly as in Search Console.'
            : `URL-prefix properties are usually stored with a trailing slash. Try "${siteUrl}/" — or if it is a Domain property, use "sc-domain:${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}".`;
        } else if (code === 400) {
          detail = 'Google rejected the request as malformed — usually the site address is not in a form it recognises.';
          fix = 'Use either https://yourdomain.com/ (with the trailing slash) or sc-domain:yourdomain.com.';
        } else if (code === 401) {
          detail = 'Google rejected the credentials themselves.';
          fix = 'The service account key may have been revoked or deleted. Generate a new key and paste it into Settings.';
        }
        add('liveCall', 'Live check with Google', false, detail);
        out.verdict = 'refused';
        out.fix = fix;
      }
    } else {
      add('liveCall', 'Live check with Google', false, 'Skipped — sign-in or site address is missing.');
      out.verdict = 'not configured';
      if (!creds) {
        out.fix = 'Paste your service-account JSON into the box below and save. It is written to your persistent volume, so it survives redeploys.';
      } else if (!siteUrl) {
        out.fix = 'Add your Search Console site address above and save.';
      }
    }

    return out;
  }

  return { getDashboardData, getPages, diagnostics };
}

function registerGscRoutes(app, options) {
  const { requireAuth } = options;
  const service = createGscService(options);

  app.get('/api/gsc-data', async (req, res) => {
    try {
      res.json(await service.getDashboardData());
    } catch (error) {
      res.status(502).json({ source: 'error', error: error.message, data: [] });
    }
  });

  app.get('/api/gsc-pages', async (req, res) => {
    res.json(await service.getPages(req.query.q));
  });

  app.get('/api/gsc-diagnostics', requireAuth, async (req, res) => {
    res.json(await service.diagnostics());
  });

  return service;
}

module.exports = {
  createGscService,
  mapPageRows,
  mapQueryRows,
  registerGscRoutes,
  searchDateRange,
};
