/**
 * Standalone harness for the reviews-stats block — runs the real code against
 * the live site without booting the whole server or installing googleapis.
 *
 *   node test-reviews-stats.mjs           # live site
 *   node test-reviews-stats.mjs --broken  # also runs synthetic broken pages
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { saveJsonFileSync } = require('./lib/json-file-store.js');

const src = fs.readFileSync('server.js', 'utf8');
const start = src.indexOf('// REVIEWS SITE STATS');
// End at the next top-level section banner, not at app.listen — anything added
// between the two would otherwise be dragged into the slice and evaluated here,
// where server-scope helpers like requireAuth do not exist.
const nextBanner = /\r?\n\/\/ ={20,}\r?\n\/\/ /.exec(src.slice(start + 1));
let end = nextBanner ? start + 1 + nextBanner.index : -1;
if (end === -1) end = src.indexOf('app.listen(PORT, () => {');
const block = src.slice(start, end);

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'revstats-'));
const routes = {};
const app = { get: (p, h) => { routes[p] = h; } };

const factory = new Function('fs', 'path', 'DATA_DIR', 'app', 'fetch', 'saveJsonFileSync', `
  ${block}
  return { computeReviewsStats, parseReviewCards, parseJsonLd, monthlyGrowth, routes: null };
`);
const mod = factory(fs, path, DATA_DIR, app, globalThis.fetch, saveJsonFileSync);

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => {
  if (c) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? ' — ' + extra : ''}`); }
};

console.log('\n\x1b[1mLive site: bestdayfitnessreviews.com\x1b[0m');
const r = await mod.computeReviewsStats();

ok(r.reachable, 'site reachable', r.error);
ok(r.inventory.published === 26, `published = 26`, `got ${r.inventory.published}`);
ok(r.inventory.byPlatform.google === 22, 'google = 22', JSON.stringify(r.inventory.byPlatform));
ok(r.inventory.byPlatform.facebook === 4, 'facebook = 4', JSON.stringify(r.inventory.byPlatform));
ok(r.inventory.avgRating === 5, 'avg rating = 5.0', String(r.inventory.avgRating));
ok(r.inventory.newest === '2026-01', 'newest review month detected', String(r.inventory.newest));
ok(r.growth.length > 0 && r.growth[r.growth.length - 1].total === 26, 'growth series ends at the published total',
   JSON.stringify(r.growth[r.growth.length - 1]));
ok(r.growth.every((p, i, a) => i === 0 || p.total >= a[i - 1].total), 'growth series is monotonic');
ok(r.platformTotals.google?.reviewCount === 110, 'google platform total parsed (110)', JSON.stringify(r.platformTotals.google));
ok(r.platformTotals.facebook?.reviewCount === 45, 'facebook platform total parsed (45)', JSON.stringify(r.platformTotals.facebook));
ok(r.platformTotals.yelp?.reviewCount === 18, 'yelp platform total parsed (18)', JSON.stringify(r.platformTotals.yelp));
ok(typeof r.score === 'number', 'health score computed', String(r.score));
ok(r.snapshots.length >= 1, 'snapshot persisted');

const byId = Object.fromEntries(r.checks.map(c => [c.id, c]));
console.log('\n  checks:');
for (const c of r.checks) {
  const mark = c.status === 'pass' ? '\x1b[32m✓\x1b[0m' : c.status === 'fail' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m?\x1b[0m';
  console.log(`    ${mark} ${c.label} — ${c.detail}`);
}
console.log();
ok(byId['ld-match']?.status === 'pass', 'JSON-LD matches cards on the live site');
ok(byId['og-image']?.status === 'pass', 'og:image resolves (the bug fixed today)', byId['og-image']?.detail);
ok(byId['agg-honest']?.status === 'pass', 'aggregateRating is honest', byId['agg-honest']?.detail);
ok(byId['five-star']?.status === 'pass', 'all published reviews are 5★');

if (process.argv.includes('--broken')) {
  console.log('\n\x1b[1mSynthetic regressions — the checks must actually fire\x1b[0m');
  const realHtml = await (await fetch('https://bestdayfitnessreviews.com/')).text();
  const origFetch = globalThis.fetch;

  async function withHtml(html, fn) {
    const stub = async (url, opts) => {
      const u = String(url);
      if (u.replace(/\/+$/, '') === 'https://bestdayfitnessreviews.com') return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
      return origFetch(url, opts);
    };
    const m = factory(fs, path, DATA_DIR, app, stub, saveJsonFileSync);
    return fn(await m.computeReviewsStats());
  }

  // drop one card, leave JSON-LD alone -> drift must be caught
  const dropped = realHtml.replace(/<div class="rev" data-plat="[a-z]+">[\s\S]*?<\/p><\/div>/, '');
  await withHtml(dropped, res => {
    const c = res.checks.find(x => x.id === 'ld-match');
    ok(c.status === 'fail', 'card/JSON-LD drift is caught', c.detail);
    ok(res.inventory.published === 25, 'inventory reflects the removed card', String(res.inventory.published));
  });

  // lie about the aggregate
  const lied = realHtml.replace(/"ratingValue": 5,\n\s*"reviewCount"/, '"ratingValue": 4.2,\n    "reviewCount"');
  await withHtml(lied, res => {
    const c = res.checks.find(x => x.id === 'agg-honest');
    ok(c.status === 'fail', 'dishonest aggregateRating is caught', c.detail);
  });

  // strip the JSON-LD entirely
  const noLd = realHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  await withHtml(noLd, res => {
    const c = res.checks.find(x => x.id === 'jsonld');
    ok(c.status === 'fail', 'missing JSON-LD is caught', c.detail);
  });

  // point og:image at a 404 that returns HTML — exactly today's bug
  const badOg = realHtml.replace(/(og:image" content=")[^"]*/, '$1https://bestdayfitnessreviews.com/definitely-not-there.png');
  await withHtml(badOg, res => {
    const c = res.checks.find(x => x.id === 'og-image');
    ok(c.status === 'fail', 'og:image that serves HTML instead of an image is caught', c.detail);
  });

  // sneak in a 4-star review
  const fourStar = realHtml.replace(/"ratingValue": 5,\n\s*"bestRating"/, '"ratingValue": 4,\n        "bestRating"');
  await withHtml(fourStar, res => {
    const c = res.checks.find(x => x.id === 'five-star');
    ok(c.status === 'fail', 'a sub-5★ published review is caught', c.detail);
  });
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exitCode = fail === 0 ? 0 : 1;
