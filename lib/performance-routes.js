'use strict';

const { summarizeContactAttribution } = require('./attribution');
const { ttlCache } = require('./ttl-cache');

function aggregateGscRows(rows = []) {
  let impressions = 0;
  let clicks = 0;
  let positionWeightedByImpressions = 0;
  const byQuery = {};

  rows.forEach(row => {
    const query = row.keys ? row.keys[0] : '';
    impressions += row.impressions || 0;
    clicks += row.clicks || 0;
    positionWeightedByImpressions += (row.position || 0) * (row.impressions || 0);
    if (query) {
      byQuery[query] = {
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        position: row.position || 0,
      };
    }
  });

  return {
    impressions,
    clicks,
    avgPosition: impressions ? positionWeightedByImpressions / impressions : 0,
    ctr: impressions ? clicks / impressions : 0,
    byQuery,
  };
}

function createPerformanceService(options) {
  const {
    allowMockIntegrations,
    getGoogleAuth,
    getSiteUrl,
    createWebmasters,
    searchConsoleQuery,
    getSnapshots,
    recordSnapshot,
    getAioAudits,
    getGhlConfig,
    providerFetch,
    now = () => Date.now(),
    logger = console,
  } = options;

  async function queryGscRange(auth, siteUrl, startDate, endDate) {
    const response = await searchConsoleQuery(createWebmasters(auth), {
      siteUrl,
      requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 250 },
    });
    return aggregateGscRows(response.data.rows || []);
  }

  async function computePerformanceSnapshot() {
    const day = 24 * 3600 * 1000;
    const formatDate = milliseconds => new Date(milliseconds).toISOString().split('T')[0];
    const aioAudits = getAioAudits();
    const out = {
      source: allowMockIntegrations ? 'mock' : 'unavailable',
      current: null,
      previous: null,
      movers: { gainers: [], losers: [] },
      snapshots: getSnapshots(),
      aioTrend: [],
      leads: null,
      brandedSearch: {
        available: false,
        reason: 'Connect Search Console to see your branded-search volume.',
      },
      aiReferral: {
        available: false,
        reason: 'Connect Google Analytics (GA4) to track visits coming from ChatGPT, Perplexity, and Claude. These AI referrals tend to convert about 3× higher than typical search visits.',
      },
    };

    const auth = getGoogleAuth();
    const siteUrl = getSiteUrl();
    const currentTime = now();
    const endCurrent = currentTime - 3 * day;
    const startCurrent = endCurrent - 27 * day;
    const endPrevious = startCurrent - day;
    const startPrevious = endPrevious - 27 * day;
    // Report the exact query windows; exports must not guess them from the
    // browser's clock or confuse the search-data lag with contact activity.
    out.periods = {
      current: { startDate: formatDate(startCurrent), endDate: formatDate(endCurrent) },
      previous: { startDate: formatDate(startPrevious), endDate: formatDate(endPrevious) },
    };
    out.queryRowLimit = 250;

    if (auth && siteUrl) {
      try {
        const current = await queryGscRange(auth, siteUrl, formatDate(startCurrent), formatDate(endCurrent));
        const previous = await queryGscRange(auth, siteUrl, formatDate(startPrevious), formatDate(endPrevious));
        out.source = 'live_gsc';
        out.current = {
          impressions: current.impressions,
          clicks: current.clicks,
          avgPosition: +current.avgPosition.toFixed(1),
          ctr: +(current.ctr * 100).toFixed(2),
        };
        out.previous = {
          impressions: previous.impressions,
          clicks: previous.clicks,
          avgPosition: +previous.avgPosition.toFixed(1),
          ctr: +(previous.ctr * 100).toFixed(2),
        };

        const moves = [];
        Object.keys(current.byQuery).forEach(query => {
          const currentQuery = current.byQuery[query];
          const previousQuery = previous.byQuery[query];
          if (previousQuery && previousQuery.position && currentQuery.position) {
            moves.push({
              query,
              posChange: +(previousQuery.position - currentQuery.position).toFixed(1),
              position: +currentQuery.position.toFixed(1),
              clicks: currentQuery.clicks,
            });
          }
        });
        out.movers.gainers = moves
          .filter(move => move.posChange > 0.3)
          .sort((left, right) => right.posChange - left.posChange)
          .slice(0, 5);
        out.movers.losers = moves
          .filter(move => move.posChange < -0.3)
          .sort((left, right) => left.posChange - right.posChange)
          .slice(0, 5);

        const brandTerms = ['best day', 'bestdayfitness', 'best-day'];
        const isBranded = query => {
          const normalized = (query || '').toLowerCase();
          return brandTerms.some(term => normalized.includes(term));
        };
        const sumBranded = byQuery => {
          let impressions = 0;
          let clicks = 0;
          Object.keys(byQuery).forEach(query => {
            if (isBranded(query)) {
              impressions += byQuery[query].impressions || 0;
              clicks += byQuery[query].clicks || 0;
            }
          });
          return { impressions, clicks };
        };
        const brandedCurrent = sumBranded(current.byQuery);
        const brandedPrevious = sumBranded(previous.byQuery);
        out.brandedSearch = { available: true, current: brandedCurrent, previous: brandedPrevious };

        const recommendedRate = aioAudits.length
          ? Math.round(aioAudits.filter(audit => audit.recommended).length / aioAudits.length * 100)
          : null;
        const snapshot = {
          date: formatDate(now()),
          impressions: current.impressions,
          clicks: current.clicks,
          avgPosition: +current.avgPosition.toFixed(1),
          leaks: Object.values(current.byQuery).filter(query => query.clicks === 0 && query.impressions > 10).length,
          brandedImpressions: brandedCurrent.impressions,
          recommendedRate,
        };
        out.snapshots = recordSnapshot(snapshot);
      } catch (error) {
        logger.error('[Performance] GSC failed:', error.message);
      }
    }

    try {
      const byDay = {};
      aioAudits.forEach(audit => {
        const date = (audit.timestamp || '').split('T')[0];
        if (!date) return;
        if (!byDay[date]) byDay[date] = { n: 0, rec: 0 };
        byDay[date].n += 1;
        if (audit.recommended) byDay[date].rec += 1;
      });
      out.aioTrend = Object.keys(byDay).sort().map(date => ({
        date,
        rate: Math.round(byDay[date].rec / byDay[date].n * 100),
        n: byDay[date].n,
      }));
    } catch (error) { /* preserve the existing best-effort trend contract */ }

    const { token, locationId } = getGhlConfig();
    const leadsCurrentStart = now() - 28 * day;
    const leadsPreviousStart = now() - 56 * day;
    const leadsPreviousEnd = now() - 28 * day;
    out.periods.contacts = { startDate: formatDate(leadsCurrentStart), endDate: formatDate(now()) };
    if (token && locationId) {
      try {
        const response = await providerFetch(
          'gohighlevel',
          `https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
          { headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28' } },
          { retries: 1 },
        );
        const data = await response.json();
        const contacts = data.contacts || [];
        const attribution = summarizeContactAttribution(contacts, {
          currentStart: leadsCurrentStart,
          currentEnd: now(),
          previousStart: leadsPreviousStart,
          previousEnd: leadsPreviousEnd,
        });
        out.leads = {
          available: true,
          current: attribution.currentTotal,
          previous: attribution.previousTotal,
          approx: contacts.length >= 100,
          attribution,
        };
      } catch (error) {
        out.leads = { available: false, reason: `Could not reach GoHighLevel: ${error.message}` };
      }
    } else {
      out.leads = { available: false, reason: 'GoHighLevel token/location not configured in Settings.' };
    }

    return out;
  }

  return {
    computePerformanceSnapshot,
    getPerformance: ttlCache(computePerformanceSnapshot, {
      ttlMs: 60 * 1000,
      staleIfErrorMs: 5 * 60 * 1000,
    }),
    queryGscRange,
  };
}

function registerPerformanceRoutes(app, options) {
  const { getPerformance } = options;
  app.get('/api/performance', async (req, res) => {
    try {
      res.json(await getPerformance());
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

module.exports = { aggregateGscRows, createPerformanceService, registerPerformanceRoutes };
