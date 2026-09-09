'use strict';

function percentageChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return Math.round((current - previous) / previous * 100);
}

function renderPerformanceDigest(digest, businessName) {
  const signed = value => (value >= 0 ? '+' : '') + value;
  const lines = [`${businessName} — Weekly SEO Performance`, ''];
  if (digest.score != null) lines.push(`Optimization Score: ${digest.score}/100`, '');
  if (digest.clicks) lines.push(`Clicks: ${digest.clicks.cur}${digest.clicks.pct != null ? ` (${signed(digest.clicks.pct)}% vs the previous 4 weeks)` : ''}`);
  if (digest.impressions) lines.push(`Impressions: ${digest.impressions.cur}${digest.impressions.pct != null ? ` (${signed(digest.impressions.pct)}%)` : ''}`);
  if (digest.avgPosition) lines.push(`Average Google rank: ${digest.avgPosition.cur}${digest.avgPosition.prev != null ? ` (was ${digest.avgPosition.prev})` : ''}`);
  if (digest.aiVisibility != null) lines.push(`AI visibility: ${digest.aiVisibility}% of audits recommend you`);
  if (digest.leads) lines.push(`New leads: ${digest.leads.current}${digest.leads.previous != null ? ` (was ${digest.leads.previous})` : ''}`);
  if (digest.gainers && digest.gainers.length) {
    lines.push('', 'Top rising keywords:');
    digest.gainers.forEach(item => lines.push(`  • ${item.query} — up ${item.posChange} spots, now #${item.position}`));
  }
  if (digest.losers && digest.losers.length) {
    lines.push('', 'Slipping keywords (worth a look):');
    digest.losers.forEach(item => lines.push(`  • ${item.query} — down ${Math.abs(item.posChange)} spots, now #${item.position}`));
  }
  if (digest.source !== 'live_gsc') lines.push('', '(Sample data — connect Search Console for live numbers.)');
  lines.push('', '— SEO Buddy');
  return lines.join('\n');
}

function createPerformanceDigestService(options) {
  const {
    state,
    save,
    getPerformance,
    getHealthScore,
    businessName,
    gmailClient,
    sendGmail,
    daysSince,
    env = process.env,
    nowIso = () => new Date().toISOString(),
    logger = console,
  } = options || {};

  if (!state || typeof state !== 'object') throw new TypeError('Performance digest state is required.');
  if (typeof save !== 'function') throw new TypeError('Performance digest save callback is required.');
  if (typeof getPerformance !== 'function') throw new TypeError('getPerformance is required.');
  if (typeof getHealthScore !== 'function') throw new TypeError('getHealthScore is required.');
  if (typeof gmailClient !== 'function') throw new TypeError('gmailClient is required.');
  if (typeof sendGmail !== 'function') throw new TypeError('sendGmail is required.');
  if (typeof daysSince !== 'function') throw new TypeError('daysSince is required.');

  let running = false;

  function deliveryRecipient() {
    return env.DIGEST_EMAIL || env.GMAIL_SENDER || '';
  }

  async function build() {
    const performance = await getPerformance();
    const current = performance.current;
    const previous = performance.previous;
    let score = null;
    try {
      const health = await getHealthScore();
      score = health.overall;
    } catch (error) {
      // The digest remains useful when the optional score cannot be calculated.
    }
    const digest = {
      generatedAt: nowIso(),
      source: performance.source,
      score,
      clicks: current ? {
        cur: current.clicks,
        prev: previous ? previous.clicks : null,
        pct: previous ? percentageChange(current.clicks, previous.clicks) : null,
      } : null,
      impressions: current ? {
        cur: current.impressions,
        prev: previous ? previous.impressions : null,
        pct: previous ? percentageChange(current.impressions, previous.impressions) : null,
      } : null,
      avgPosition: current ? {
        cur: current.avgPosition,
        prev: previous ? previous.avgPosition : null,
      } : null,
      gainers: ((performance.movers && performance.movers.gainers) || []).slice(0, 3),
      losers: ((performance.movers && performance.movers.losers) || []).slice(0, 3),
      aiVisibility: performance.aioTrend && performance.aioTrend.length
        ? performance.aioTrend[performance.aioTrend.length - 1].rate
        : null,
      leads: performance.leads && performance.leads.available
        ? { current: performance.leads.current, previous: performance.leads.previous }
        : null,
    };
    digest.text = renderPerformanceDigest(digest, businessName);
    return digest;
  }

  function saveNewDigest(digest) {
    state.digest = { ...digest, isNew: true };
    state.lastRun = nowIso();
    save();
  }

  async function maybeRun(force) {
    if (running) return;
    if (!force && !state.enabled) return;
    if (!force && daysSince(state.lastRun) < (state.intervalDays || 7)) return;
    running = true;
    try {
      const digest = await build();
      saveNewDigest(digest);
      if (state.autoEmail) {
        const to = deliveryRecipient();
        if (to && gmailClient()) {
          try {
            await sendGmail(to, 'Your weekly SEO performance — Best Day Fitness', digest.text);
            state.digest.emailedAt = nowIso();
            save();
          } catch (error) {
            logger.error('[Perf Digest] auto-email failed:', error.message);
          }
        }
      }
    } catch (error) {
      logger.error('[Perf Digest] build failed:', error.message);
    } finally {
      running = false;
    }
  }

  function status() {
    return {
      success: true,
      enabled: state.enabled,
      autoEmail: state.autoEmail,
      intervalDays: state.intervalDays,
      lastRun: state.lastRun,
      digest: state.digest,
      busy: running,
      gmailConfigured: !!gmailClient(),
      emailTo: deliveryRecipient(),
    };
  }

  function setPreferences(body = {}) {
    if (typeof body.enabled === 'boolean') state.enabled = body.enabled;
    if (typeof body.autoEmail === 'boolean') state.autoEmail = body.autoEmail;
    save();
    return { success: true, enabled: state.enabled, autoEmail: state.autoEmail };
  }

  function markSeen() {
    if (state.digest) state.digest.isNew = false;
    save();
  }

  return {
    build,
    deliveryRecipient,
    saveNewDigest,
    maybeRun,
    status,
    setPreferences,
    markSeen,
    get running() { return running; },
  };
}

module.exports = {
  createPerformanceDigestService,
  percentageChange,
  renderPerformanceDigest,
};
