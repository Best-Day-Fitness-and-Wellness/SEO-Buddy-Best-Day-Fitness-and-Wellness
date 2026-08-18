'use strict';

const { upsertDailySnapshot } = require('../../../../lib/daily-snapshot');
const {
  extractPlatformTotals,
  metaContent,
  monthlyGrowth,
  parseJsonLd,
  parseReviewCards,
} = require('../domain/review-page-parser');

function createGetReviewsStats({ baseUrl, pageClient, snapshotRepository, now = Date.now }) {
  let snapshots = snapshotRepository.load();

  return async function getReviewsStats() {
    const checks = [];
    const add = (id, label, ok, detail, severity = 'error') => {
      checks.push({ id, label, status: ok === null ? 'unknown' : ok ? 'pass' : 'fail', detail, severity });
    };

    const startedAt = now();
    let html = '';
    let status = 0;
    let reachable = false;
    try {
      const response = await pageClient.fetch(baseUrl + '/');
      status = response.status;
      reachable = response.ok;
      html = await response.text();
    } catch (error) {
      return {
        url: baseUrl,
        reachable: false,
        error: error.message,
        checks: [{ id: 'reachable', label: 'Site responds', status: 'fail', detail: error.message, severity: 'error' }],
      };
    }

    const loadMs = now() - startedAt;
    add('reachable', 'Site responds', reachable, `HTTP ${status} in ${loadMs}ms`);
    add('https', 'Served over HTTPS', baseUrl.startsWith('https://'), baseUrl);
    add('speed', 'Responds under 1.5s', loadMs < 1500, `${loadMs}ms`, 'warn');

    const reviews = parseReviewCards(html);
    const byPlatform = reviews.reduce((counts, review) => ({
      ...counts,
      [review.platform]: (counts[review.platform] || 0) + 1,
    }), {});
    const rated = reviews.filter(review => review.rating);
    const avgRating = rated.length
      ? Math.round((rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) * 10) / 10
      : null;
    const dates = reviews.map(review => review.date).filter(date => /^\d{4}-\d{2}$/.test(date)).sort();

    const structuredData = parseJsonLd(html);
    if (!structuredData) {
      add('jsonld', 'JSON-LD block present', false, 'No application/ld+json script found — the page is invisible to review rich-results.');
    } else if (structuredData.__parseError) {
      add('jsonld', 'JSON-LD parses', false, structuredData.__parseError);
    } else {
      const structuredReviews = structuredData.review || [];
      add('jsonld', 'JSON-LD present and parses', true, `${structuredReviews.length} review objects`);
      add('ld-match', 'JSON-LD matches visible cards', structuredReviews.length === reviews.length,
        structuredReviews.length === reviews.length
          ? `${reviews.length} both sides`
          : `${reviews.length} cards vs ${structuredReviews.length} in JSON-LD`);

      const ratings = structuredReviews.map(review => review?.reviewRating?.ratingValue).filter(value => typeof value === 'number');
      const actualMean = ratings.length
        ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
        : null;
      const aggregate = structuredData.aggregateRating || {};
      add('agg-honest', 'aggregateRating equals the real mean', actualMean != null && aggregate.ratingValue === actualMean,
        `declared ${aggregate.ratingValue ?? '—'}, actual ${actualMean ?? '—'}`);
      add('agg-count', 'aggregateRating count is at least what is shown',
        typeof aggregate.reviewCount === 'number' && aggregate.reviewCount >= reviews.length,
        `declared ${aggregate.reviewCount ?? '—'} vs ${reviews.length} published`, 'warn');

      const belowFive = ratings.filter(value => value < 5).length;
      add('five-star', 'Every published review is 5★', belowFive === 0,
        belowFive ? `${belowFive} review(s) below 5★ are published` : `all ${ratings.length} are 5★`, 'warn');
    }

    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const description = metaContent(html, 'name', 'description') || '';
    const canonical = (html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || [])[1] || '';
    add('title', 'Title tag is a sensible length', title.length >= 30 && title.length <= 65, `${title.length} chars`, 'warn');
    add('desc', 'Meta description is a sensible length', description.length >= 70 && description.length <= 165, `${description.length} chars`, 'warn');
    add('canonical', 'Canonical URL present', Boolean(canonical), canonical || 'missing');

    const socialImage = metaContent(html, 'property', 'og:image');
    if (!socialImage) {
      add('og-image', 'Social preview image declared', false, 'no og:image meta tag');
    } else {
      try {
        const response = await pageClient.fetch(socialImage, { method: 'GET' }, 10000);
        const contentType = response.headers.get('content-type') || '';
        add('og-image', 'Social preview image resolves', response.ok && contentType.startsWith('image/'),
          response.ok ? `HTTP ${response.status}, content-type ${contentType || 'unknown'}` : `HTTP ${response.status}`);
      } catch (error) {
        add('og-image', 'Social preview image resolves', false, error.message);
      }
    }

    try {
      const response = await pageClient.fetch(baseUrl + '/sitemap.xml', {}, 8000);
      const body = response.ok ? await response.text() : '';
      const isXml = body.trim().startsWith('<?xml') || body.includes('<urlset');
      const lastModified = (body.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || null;
      add('sitemap', 'sitemap.xml served', response.ok && isXml,
        response.ok ? (isXml ? `lastmod ${lastModified || 'absent'}` : 'served, but not XML') : `HTTP ${response.status}`, 'warn');
      if (lastModified) {
        const ageDays = Math.floor((now() - new Date(lastModified).getTime()) / 86400000);
        add('sitemap-fresh', 'sitemap lastmod is recent', ageDays <= 60, `${ageDays} days old`, 'warn');
      }
    } catch (error) {
      add('sitemap', 'sitemap.xml served', false, error.message, 'warn');
    }

    try {
      const response = await pageClient.fetch(baseUrl + '/robots.txt', {}, 8000);
      const body = response.ok ? await response.text() : '';
      const blocksAll = /Disallow:\s*\/\s*$/m.test(body) && !/Allow:\s*\//m.test(body);
      add('robots', 'robots.txt allows crawling', response.ok && !blocksAll,
        response.ok ? (blocksAll ? 'Disallow: / is blocking crawlers' : 'crawlable') : `HTTP ${response.status}`);
    } catch (error) {
      add('robots', 'robots.txt allows crawling', null, error.message, 'warn');
    }

    const headerTotal = Number(((html.match(/<b id="rev-count">([\d,]+)\+?<\/b>/) || [])[1] || '').replace(/,/g, '')) || null;
    const platformTotals = extractPlatformTotals(html);
    const today = new Date(now()).toISOString().split('T')[0];
    const update = upsertDailySnapshot(snapshots, { date: today, published: reviews.length, byPlatform, headerTotal }, 365);
    snapshots = update.snapshots;
    if (update.changed) snapshotRepository.save(snapshots);

    let delta30 = null;
    const cutoff = now() - 30 * 86400000;
    const older = snapshots.filter(snapshot => new Date(snapshot.date + 'T00:00:00Z').getTime() <= cutoff);
    if (older.length) delta30 = reviews.length - older[older.length - 1].published;

    const failures = checks.filter(check => check.status === 'fail');
    const knownChecks = checks.filter(check => check.status !== 'unknown');
    const score = checks.length
      ? Math.round((checks.filter(check => check.status === 'pass').length / knownChecks.length) * 100)
      : null;

    return {
      url: baseUrl,
      reachable: true,
      checkedAt: new Date(now()).toISOString(),
      loadMs,
      score,
      inventory: {
        published: reviews.length,
        byPlatform,
        avgRating,
        newest: dates.length ? dates[dates.length - 1] : null,
        oldest: dates.length ? dates[0] : null,
        delta30,
      },
      growth: monthlyGrowth(reviews),
      platformTotals,
      headerTotal,
      checks,
      problems: failures.length,
      snapshots: snapshots.slice(-90),
      reviews,
    };
  };
}

module.exports = { createGetReviewsStats };
