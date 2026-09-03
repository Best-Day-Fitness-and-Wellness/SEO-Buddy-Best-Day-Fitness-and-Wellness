import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import fixture from './fixtures/report.cjs';

const source = fs.readFileSync(new URL('../public/modules/pdf-report.js', import.meta.url), 'utf8');
const keys = ['score', 'performance', 'moves', 'profile', 'search', 'history', 'ai', 'digest', 'automation', 'reviews', 'readiness'];
const paths = ['health-score', 'performance', 'next-moves', 'business-profile', 'gsc-data', 'history', 'ai-visibility', 'performance-digest', 'automation-status', 'reviews-stats', 'deploy-readiness'];
const data = () => { const f = fixture('2026-09-03'); return Object.fromEntries(keys.map((key, i) => [key, f[paths[i]]])); };
function api() {
  const context = { window: {}, Date, console, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);
  return context.window.SeoBuddyPdfReport;
}
const model = input => api().buildModel(input, new Date('2026-09-03T12:00:00Z'));

test('report distinguishes recorded publications, drafts, demos and unknown status', () => {
  const m = model(data());
  assert.equal(m.publishedRecent, 1);
  assert.equal(m.draftsRecent, 1);
  assert.equal(m.rows[0].publication, 'Draft');
  assert.equal(m.rows[1].submission, 'Requested');
  assert.equal(m.rows[2].publication, 'Demo record');
  assert.equal(m.rows[3].publication, 'Status unverified');
  assert.equal(m.rows[3].submission, 'Request failed');
});
test('report excludes old, future, undated and invalid dated records from the period', () => {
  const input = data();
  input.history = ['2026-08-06', '2026-08-07', '2026-09-03', '2026-09-04', null, 'not-a-date'].map(date => ({ date, platform: 'GoHighLevel (published)' }));
  assert.equal(model(input).publishedRecent, 2);
});
test('report preserves unavailable versus genuine zero counts and absent profile', () => {
  const missing = model({});
  assert.equal(missing.publishedRecent, null);
  assert.equal(missing.gaps, null);
  assert.equal(missing.businessName, 'Business profile unavailable');
  const zero = model({ history: [], search: { source: 'live_gsc', data: [] } });
  assert.equal(zero.publishedRecent, 0);
  assert.equal(zero.gaps.length, 0);
});
test('report identifies a configured connection without inventing a disconnect', () => {
  const input = data(); input.performance = null;
  assert.match(model(input).searchUnavailable, /configured, but/);
  input.readiness = null;
  assert.match(model(input).searchUnavailable, /could not be verified/);
  input.readiness = { checks: [{ key: 'gsc', ok: false }] };
  assert.match(model(input).searchUnavailable, /not configured/);
});
test('report excludes mock search figures and saved sample narrative', () => {
  const input = data(); input.performance.source = 'mock'; input.search.source = 'mock_data';
  const m = model(input);
  assert.equal(m.livePerformance, false);
  assert.equal(m.gaps, null);
  assert.ok(m.warnings.some(w => /saved weekly summary uses demo/.test(w)));
  assert.doesNotMatch(source, /paragraph\([^\n]*digest\.text/);
});
test('report uses score v2 evidence without recalculating or comparing incompatible scores', () => {
  const m = model(data());
  assert.equal(m.score.overall, 69);
  assert.equal(m.score.liveOverall, 68);
  assert.equal(m.score.delta, null);
  assert.equal(m.stale[0].key, 'ai');
  assert.ok(m.warnings.some(w => /comparison is still building/.test(w)));
  assert.ok(m.warnings.some(w => /Older score evidence/.test(w)));
  const input = data(); input.score.delta = 0;
  assert.equal(model(input).warnings.some(w => /comparison is still building/.test(w)), false);
});
test('report does not turn failure envelopes into successful empty sections', () => {
  const m = model({ history: { success: false }, score: { success: false, overall: 0 }, search: { success: false, source: 'live_gsc', data: [] } });
  assert.equal(m.score, null);
  assert.equal(m.rows, null);
  assert.equal(m.gaps, null);
});
test('report preserves branded metrics, actual rank-change field and review-scan warning', () => {
  const m = model(data());
  assert.equal(m.performance.brandedSearch.current.impressions, 84);
  assert.equal(m.performance.movers.gainers[0].posChange, 42);
  assert.ok(m.warnings.some(w => /not proof that customer reviews disappeared/.test(w)));
  assert.match(source, /m\.posChange/);
  assert.match(source, /brand\.current\?\.impressions/);
});
test('report builder is read-only and lazily loads print assets with retry and timeout', () => {
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|DELETE|PATCH)/i);
  assert.match(source, /readCheckedJson/);
  assert.match(source, /libraryLoads\.delete\(src\)/);
  assert.match(source, /script\.remove\(\)/);
  assert.match(source, /20000/);
  assert.match(source, /no empty report was downloaded/);
});
