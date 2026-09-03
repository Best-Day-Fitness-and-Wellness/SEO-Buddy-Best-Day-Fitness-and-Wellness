'use strict';

// Local-only PDF preview. Optional input is a saved, read-only endpoint snapshot
// keyed by API path suffix. No requests are sent to production or providers.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const fixture = require('../test/fixtures/report.cjs');
const root = path.resolve(__dirname, '..');
const snapshot = process.argv[2] ? JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8')) : fixture();
const assets = new Map([
  ['/modules/core.js', 'application/javascript'], ['/modules/pdf-report.js', 'application/javascript'],
  ['/jspdf.umd.min.js', 'application/javascript'], ['/jspdf.plugin.autotable.min.js', 'application/javascript'],
  ['/sb-mark.svg', 'image/svg+xml'],
]);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><title>Local PDF preview</title></head><body><script src="/modules/core.js"></script><script src="/modules/pdf-report.js"></script></body></html>');
  } else if (assets.has(url.pathname)) {
    res.setHeader('Content-Type', assets.get(url.pathname));
    res.end(fs.readFileSync(path.join(root, 'public', url.pathname)));
  } else if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    const value = snapshot[url.pathname.slice(5)];
    res.statusCode = value ? 200 : 503;
    res.end(JSON.stringify(value || { success: false }));
  } else res.writeHead(404).end();
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
    await page.goto(base);
    const download = page.waitForEvent('download');
    await page.evaluate(() => window.SeoBuddyPdfReport.generate());
    const output = path.join(root, 'test-results', 'report-preview.pdf');
    await (await download).saveAs(output);
    console.log(`Preview saved: ${output}`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
