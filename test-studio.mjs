/**
 * Content Studio checks that don't need Gemini credits:
 * auth gating, input validation, upload limits, and the UI wiring.
 *
 *   node test-studio.mjs            # API-level
 *   node test-studio.mjs --ui       # + drive the tab in a real browser
 */
const BASE = process.env.BASE || 'http://localhost:3399';
const PW = process.env.ADMIN_PASSWORD || 'test';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => {
  if (c) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? ' — ' + extra : ''}`); }
};
const section = t => console.log(`\n\x1b[1m${t}\x1b[0m`);
const post = (p, body, auth = true) => fetch(BASE + p, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: 'Bearer ' + PW } : {}),
  body: JSON.stringify(body),
});

section('Auth gating — every studio endpoint spends Gemini credits');
for (const p of ['/api/studio/questions', '/api/studio/transcribe', '/api/studio/blog', '/api/studio/social']) {
  const r = await post(p, {}, false);
  ok(r.status === 401, `${p} rejects an unauthenticated call`, `got ${r.status}`);
}
ok((await fetch(BASE + '/api/studio/session')).status === 200, '/api/studio/session stays readable (no spend)');

section('Input validation');
let r = await post('/api/studio/blog', { transcript: 'too short', question: 'Q?' });
ok(r.status === 400, 'blog rejects a too-short transcript', `got ${r.status}`);
r = await post('/api/studio/blog', { transcript: 'x'.repeat(400) });
ok(r.status === 400, 'blog rejects a missing question', `got ${r.status}`);
r = await post('/api/studio/social', { transcript: 'nope' });
ok(r.status === 400, 'social rejects a too-short transcript', `got ${r.status}`);
r = await post('/api/studio/transcribe', {});
ok(r.status === 400, 'transcribe rejects an empty body', `got ${r.status}`);
r = await post('/api/studio/transcribe', { data: 'AAAA', mimeType: 'application/pdf' });
ok(r.status === 400 && /Unsupported file type/.test((await r.json()).error), 'transcribe rejects a non-media file');

section('Upload limits');
// ~20MB of base64 → over the 18MB decoded cap but under the 26MB parser limit,
// so the friendly 413 must come from us, not from body-parser.
const big = 'A'.repeat(Math.floor(19.5 * 1024 * 1024 * 4 / 3));
r = await post('/api/studio/transcribe', { data: big, mimeType: 'audio/mp4' });
const bigJson = await r.json().catch(() => ({}));
ok(r.status === 413, 'oversized upload returns 413, not a crash', `got ${r.status}`);
ok(/limit is 18MB/.test(bigJson.error || ''), 'the 413 explains the limit in plain language', bigJson.error);
ok(/voice memo/.test(bigJson.error || ''), 'and tells a non-technical user what to do instead');

// The raised limit must be scoped to transcribe only — everything else keeps 100kb.
r = await post('/api/studio/blog', { transcript: 'x'.repeat(300 * 1024), question: 'Q?' });
ok(r.status === 413, 'other endpoints keep the small body limit', `got ${r.status}`);

section('Session persistence');
await post('/api/studio/session', { session: { question: 'Test question?', transcript: 'x'.repeat(300) } });
const sess = await (await fetch(BASE + '/api/studio/session')).json();
ok(sess.session && sess.session.question === 'Test question?', 'session round-trips');
await post('/api/studio/session', { session: null });

if (process.argv.includes('--ui')) {
  section('UI');
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 1200 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.setItem('seo_wizard_seen', '1'); } catch (e) {} });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const o = document.getElementById('setup-overlay'); if (o) o.style.display = 'none'; });

  await p.click('[data-tab="explore-tab"]'); await p.waitForTimeout(600);
  const card = await p.$('.exp-row[data-go="tab:studio-tab"]');
  ok(!!card, 'Content Studio card appears under Explore');
  if (card) await card.click();
  await p.waitForTimeout(1200);

  const st = await p.evaluate(() => ({
    visible: document.getElementById('studio-tab')?.classList.contains('active'),
    steps: document.querySelectorAll('#studio-tab .st-step').length,
    locked: [...document.querySelectorAll('#studio-tab .st-step')].map(s => s.classList.contains('locked')),
  }));
  ok(st.visible, 'tab opens');
  ok(st.steps === 4, 'four steps render', String(st.steps));
  ok(st.locked.join() === 'false,true,true,true', 'steps 2-4 start locked until step 1 is done', st.locked.join());

  // typing a question should unlock step 2 only
  await p.fill('#st-q-custom', 'Is strength training safe after a knee replacement?');
  await p.waitForTimeout(400);
  let locked = await p.evaluate(() => [...document.querySelectorAll('#studio-tab .st-step')].map(s => s.classList.contains('locked')));
  ok(locked.join() === 'false,false,true,true', 'a question unlocks step 2 but not 3 and 4', locked.join());

  // pasting a transcript should unlock 3 and 4
  await p.fill('#st-transcript', 'x '.repeat(150));
  await p.waitForTimeout(400);
  locked = await p.evaluate(() => [...document.querySelectorAll('#studio-tab .st-step')].map(s => s.classList.contains('locked')));
  ok(locked.join() === 'false,false,false,false', 'a transcript unlocks steps 3 and 4', locked.join());
  const words = await p.textContent('#st-t-words');
  ok(/150 words/.test(words || ''), 'word count updates', words);

  ok(errs.length === 0, 'no JS errors', errs.join('; '));
  await p.screenshot({ path: '/home/claude/studio-tab.png', fullPage: true });
  await b.close();
}

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
