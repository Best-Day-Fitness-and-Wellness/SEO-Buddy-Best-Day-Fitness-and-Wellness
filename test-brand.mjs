// Brand profile: persistence, single-source propagation, and the never-use scanner.
const BASE = process.env.BASE || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || '';
let pass = 0, fail = 0;
const H = { 'Content-Type': 'application/json', ...(PW ? { Authorization: `Bearer ${PW}` } : {}) };
const ok = (n, c, x) => c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n}${x ? ' — ' + x : ''}`));
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b, h = H) => fetch(BASE + p, { method: 'POST', headers: h, body: JSON.stringify(b) });

console.log('\n— profile loads with the real brand seeded —');
let j = await get('/api/brand-profile');
ok('GET returns a profile', j.success && !!j.brand);
ok('tagline is from the brand docs', j.brand.tagline === 'Move Better. Feel Stronger. Live Longer.', j.brand.tagline);
ok('never-use list is populated', (j.brand.neverUse || []).length >= 10, String((j.brand.neverUse||[]).length));
ok('never-use includes "anti-aging"', (j.brand.neverUse || []).includes('anti-aging'));
ok('never-use includes "quick fix"', (j.brand.neverUse || []).includes('quick fix'));
ok('local keywords carried over', (j.brand.localKeywords || []).length >= 8);
ok('CTA points at /consult', String(j.brand.ctaPrimaryUrl || '').includes('/consult'), j.brand.ctaPrimaryUrl);

console.log('\n— canonical phone is the one the owner confirmed —');
const kit = await get('/api/listing-kit');
ok('listing kit phone is (727) 334-1472', kit.kit.phone === '(727) 334-1472', kit.kit.phone);
ok('listing kit copy derives from the profile', String(kit.kit.tagline).includes('Move Better'), kit.kit.tagline);

console.log('\n— writes are auth-gated —');
if (PW) {
  let r = await post('/api/brand-profile', { brand: { tagline: 'hax' } }, { 'Content-Type': 'application/json' });
  ok('POST rejects unauthenticated', r.status === 401, `got ${r.status}`);
  r = await post('/api/brand-profile/reset', {}, { 'Content-Type': 'application/json' });
  ok('reset rejects unauthenticated', r.status === 401, `got ${r.status}`);
}
let r = await post('/api/brand-profile', {});
ok('empty body -> 400', r.status === 400, `got ${r.status}`);

console.log('\n— edits persist and partial saves never blank the voice —');
r = await post('/api/brand-profile', { brand: { tagline: 'TEST TAGLINE' } });
ok('partial save accepted', r.ok);
j = await get('/api/brand-profile');
ok('edited field changed', j.brand.tagline === 'TEST TAGLINE', j.brand.tagline);
ok('untouched fields survive a partial save', (j.brand.neverUse || []).length >= 10, 'never-use was blanked!');
ok('listing kit follows the edit immediately', String((await get('/api/listing-kit')).kit.tagline).includes('TEST TAGLINE'));

console.log('\n— never-use scanner catches what the prompt misses —');
r = await post('/api/brand-profile', { brand: { neverUse: ['anti-aging', 'quick fix', 'crush it'] } });
const gen = await (await post('/api/generate-article', { keyword: 'balance training for seniors' })).json();
ok('article returns a brandViolations array', Array.isArray(gen.brandViolations), typeof gen.brandViolations);

console.log('\n— reset restores the seeded profile —');
r = await post('/api/brand-profile/reset', {});
j = await get('/api/brand-profile');
ok('reset restores tagline', j.brand.tagline === 'Move Better. Feel Stronger. Live Longer.', j.brand.tagline);
ok('reset restores full never-use list', (j.brand.neverUse || []).length >= 10);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
