'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../test/fixtures/report.cjs');

module.exports = async function exerciseReport({ page, base, prefix, journey, writes, responses, output }) {
  const data = fixture();
  const previous = new Map(Object.keys(data).map(key => ['/api/' + key, responses.get('/api/' + key)]));
  const restore = () => previous.forEach((value, key) => value ? responses.set(key, value) : responses.delete(key));
  try {
    Object.entries(data).forEach(([key, value]) => responses.set('/api/' + key, { json: value }));
    await page.goto(base + '/?report-test=1#/results/detail');
    await page.locator('#perf-download-pdf').waitFor();
    const before = writes.length;
    await journey(`${prefix}: PDF library failure is retryable`, async () => {
      const fail = route => route.abort();
      await page.route('**/jspdf.umd.min.js', fail);
      try {
        const message = await page.evaluate(() => window.generateSeoReportPdf().then(() => '', e => e.message));
        assert.match(message, /Could not load the report library/);
        assert.equal(await page.locator('script[src="/jspdf.umd.min.js"]').count(), 0);
      } finally { await page.unroute('**/jspdf.umd.min.js', fail); }
    });
    await journey(`${prefix}: branded report downloads with accurate evidence and no mutations`, async () => {
      const download = page.waitForEvent('download');
      await page.locator('#perf-download-pdf').click();
      const file = await download;
      assert.match(file.suggestedFilename(), /Example-Fitness-Visibility-Growth-Report-.*\.pdf$/);
      const target = path.join(output, `${prefix}-progress-report.pdf`);
      await file.saveAs(target);
      assert.equal(fs.readFileSync(target).subarray(0, 5).toString(), '%PDF-');
      await page.waitForFunction(() => !document.getElementById('perf-download-pdf').disabled);
      const checks = await page.evaluate(data => {
        const names = { score: 'health-score', performance: 'performance', moves: 'next-moves', profile: 'business-profile', search: 'gsc-data', history: 'history', ai: 'ai-visibility', digest: 'performance-digest', automation: 'automation-status', reviews: 'reviews-stats', readiness: 'deploy-readiness' };
        const m = window.SeoBuddyPdfReport.buildModel(Object.fromEntries(Object.entries(names).map(([key, api]) => [key, data[api]])));
        const doc = window.SeoBuddyPdfReport.buildDocument(m);
        const pages = doc.internal.pages.slice(1).join('\n');
        return { published: m.publishedRecent, drafts: m.draftsRecent, pages: doc.internal.getNumberOfPages(), leakedSample: pages.includes('DO NOT REPRINT'), hasBrand: pages.includes('SEO Buddy'), hasMover: pages.includes('42 better'), hasUnknown: pages.includes('Unknown') };
      }, data);
      assert.equal(checks.published, 1); assert.equal(checks.drafts, 1);
      assert.equal(checks.leakedSample, false); assert.equal(checks.hasBrand, true);
      assert.equal(checks.hasMover, true); assert.equal(checks.hasUnknown, true);
      assert.ok(checks.pages >= 5 && checks.pages <= 7);
      assert.equal(writes.length, before, 'Report download must not publish or change settings');
    });
    await journey(`${prefix}: partial report and missing logo keep unknown data explicit`, async () => {
      responses.set('/api/health-score', { status: 503, json: { success: false } });
      responses.set('/api/history', { status: 503, json: { success: false } });
      const failLogo = route => route.abort();
      await page.route('**/sb-mark.svg?*', failLogo);
      try {
        // A fresh document avoids reusing an already-decoded Image resource.
        await page.goto(base + '/?report-partial=1#/results/detail');
        await page.locator('#perf-download-pdf').waitFor();
        const download = page.waitForEvent('download');
        await page.locator('#perf-download-pdf').click();
        await (await download).saveAs(path.join(output, `${prefix}-partial-report.pdf`));
        await page.waitForFunction(() => !document.getElementById('perf-download-pdf').disabled);
        assert.equal(writes.length, before);
      } finally { await page.unroute('**/sb-mark.svg?*', failLogo); }
    });
    await journey(`${prefix}: unavailable report data fails visibly without an empty download`, async () => {
      for (const key of Object.keys(data)) responses.set('/api/' + key, { status: 503, json: { success: false } });
      const message = await page.evaluate(() => window.generateSeoReportPdf().then(() => '', e => e.message));
      assert.match(message, /no empty report was downloaded/);
    });
  } finally { restore(); }
};
