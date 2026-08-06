// Tests for the two capabilities folded out of Content Studio, plus the
// transcript path added to the existing article generator.
// Run: node test-content.mjs   (expects the server on :3000)
const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || '';
let pass = 0, fail = 0;
const H = { 'Content-Type': 'application/json', ...(PW ? { Authorization: `Bearer ${PW}` } : {}) };

function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const post = (p, b, h = H) => fetch(BASE + p, { method: 'POST', headers: h, body: JSON.stringify(b) });

console.log('\n— removed endpoints are actually gone —');
for (const p of ['/api/studio/questions', '/api/studio/blog', '/api/studio/session', '/api/studio/transcribe', '/api/studio/social']) {
  const r = await post(p, {});
  ok(`${p} -> 404`, r.status === 404, `got ${r.status}`);
}
const rs = await fetch(BASE + '/api/studio/session');
ok('GET /api/studio/session -> 404', rs.status === 404, `got ${rs.status}`);

console.log('\n— new endpoints exist and are auth-gated —');
if (PW) {
  for (const p of ['/api/transcribe', '/api/social-pack']) {
    const r = await post(p, {}, { 'Content-Type': 'application/json' });
    ok(`${p} rejects unauthenticated`, r.status === 401, `got ${r.status}`);
  }
}

console.log('\n— transcribe input validation —');
let r = await post('/api/transcribe', {});
ok('no data -> 400', r.status === 400, `got ${r.status}`);
r = await post('/api/transcribe', { data: 'AAAA', mimeType: 'application/pdf' });
ok('bad mime -> 400', r.status === 400, `got ${r.status}`);
ok('bad mime message names the type', ((await r.json()).error || '').includes('application/pdf'));
r = await post('/api/transcribe', { data: 'A'.repeat(30 * 1048576), mimeType: 'audio/m4a' });
ok('oversized -> 413 not a parser error', r.status === 413, `got ${r.status}`);
ok('413 message is plain language', /limit is 18MB/.test((await r.json()).error || ''));

console.log('\n— transcribe body limit is mounted path-first —');
r = await post('/api/social-pack', { transcript: 'x'.repeat(200 * 1024) });
ok('other routes keep the small default limit', r.status === 413, `got ${r.status}`);

console.log('\n— social pack input validation —');
r = await post('/api/social-pack', {});
ok('no transcript -> 400', r.status === 400, `got ${r.status}`);
r = await post('/api/social-pack', { transcript: 'too short' });
ok('short transcript -> 400', r.status === 400, `got ${r.status}`);

console.log('\n— article generator still accepts keyword-only (unchanged path) —');
r = await post('/api/generate-article', {});
ok('no keyword -> 400', r.status === 400, `got ${r.status}`);
ok('keyword error unchanged', ((await r.json()).error || '').includes('Keyword is required'));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
