'use strict';

// Isolated acceptance environment: no production URL or real provider writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-buddy-browser-'));
const results = { journeys: [], screens: [], errors: [], externalRequests: [], startup: [] };
let child, browser;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, action) {
  try { await action(); results.journeys.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.journeys.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}

async function start() {
  const port = await new Promise(resolve => {
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|SECRET|PASSWORD|RAILWAY|DATABASE|GOOGLE_APPLICATION|GSC_|GHL_|TRUSTPILOT/i.test(key)));
  child = spawn(process.execPath, ['server.js'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, PORT: String(port), DATA_DIR: dataDir, APP_MODE: 'development', STATE_BACKEND: 'filesystem', DATABASE_URL: '', ADMIN_PASSWORD: 'browser-test-only', REVIEWS_URL: base },
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
  for (let i = 0; i < 150; i++) {
    if (child.exitCode != null) throw new Error(`Acceptance server exited: ${logs}`);
    try { if ((await fetch(base + '/health/ready')).ok) return base; } catch {}
    await pause(100);
  }
  throw new Error('Acceptance server did not become ready.');
}

async function exercise(base, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: 'light', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('seo_wizard_seen', '1');
    localStorage.setItem('seo_admin_password', 'browser-test-only');
    localStorage.setItem('seo_gemini_key', 'fake-legacy-test-key');
    localStorage.setItem('seo_ghl_token', 'fake-legacy-test-token');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => results.errors.push({ viewport, message: error.message }));
  const writes = [];
  const responses = new Map();
  let generationFails = false;
  let contentLoadFails = false;
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { results.externalRequests.push(url.origin); return route.abort(); }
    if (contentLoadFails && /\/assets\/content-workspace\./.test(url.pathname)) return route.abort();
    if (url.pathname === '/__acceptance__/axe.js') return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') });
    if (request.method() === 'GET') return responses.has(url.pathname) ? route.fulfill(responses.get(url.pathname)) : route.continue();
    writes.push({ path: url.pathname, body: request.postData() ? request.postDataJSON() : null });
    if (responses.has(url.pathname)) return route.fulfill(responses.get(url.pathname));
    const fulfill = (body, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === '/api/generate-article') return generationFails
      ? fulfill({ error: 'Acceptance-test provider unavailable' }, 503)
      : fulfill({ success: true, title: 'Acceptance article', slug: 'acceptance-article', content: '<h1>Acceptance article</h1><p>Test-only copy.</p><script>window.untrustedExecuted=true</script><img src="x" onerror="window.untrustedExecuted=true">', claimsToCheck: ['Verify the test source'], brandViolations: [{ found: 'test phrase' }] });
    if (url.pathname === '/api/publish-ghl') return fulfill({ success: true, source: 'mock_ghl', message: 'Test-only publication accepted' });
    if (url.pathname === '/api/index-url') return fulfill({ success: true, message: 'Test-only indexing accepted' });
    if (url.pathname === '/api/save-settings') return fulfill({ success: true, message: 'Test-only settings accepted' });
    if (url.pathname === '/api/autopilot-queue/add') return fulfill({ success: true, queue: [{ topic: request.postDataJSON().topic }] });
    if (url.pathname === '/api/autopilot-queue/remove') return fulfill({ success: true, queue: [] });
    if (url.pathname === '/api/autopilot-run-now') return fulfill({ success: true, message: 'Test-only run accepted' });
    if (url.pathname === '/api/autopilot-toggle') return fulfill({ success: true, enabled: true });
    return fulfill({ success: false, error: 'Unexpected mutation blocked by acceptance harness' }, 400);
  });
  await page.goto(base + '?workspace=classic');
  await page.waitForFunction(() => typeof window.switchTab === 'function');
  const prefix = viewport.width < 600 ? 'mobile' : 'desktop';
  const journey = async (name, action) => {
    await check(name, action);
    // Dismiss completed test notifications just as a user would before the
    // next independent journey, so earlier error fixtures do not cover it.
    await page.locator('#ui-toast-host button').evaluateAll(buttons => buttons.forEach(button => button.click()));
  };
  const nav = async id => {
    const hamburger = page.locator('#mobile-hamburger');
    if (await hamburger.isVisible() && !(await page.locator('body').evaluate(el => el.classList.contains('nav-open')))) await hamburger.click();
    await page.locator(id).click();
  };
  const tool = async id => { await nav('#nav-explore'); await page.locator(`.exp-row[data-go="tab:${id}"]`).click(); };

  if (process.env.REPORT_ONLY === '1') {
    await require('./browser-report.cjs')({ page, base, prefix, journey, writes, responses, output });
    await context.close();
    return;
  }

  await journey(`${prefix}: supplied logo loads and switches with the app theme`, async () => {
    const hamburger = page.locator('#mobile-hamburger');
    const mobile = await hamburger.isVisible();
    if (mobile) await hamburger.click();
    try {
      for (const theme of ['light', 'dark']) {
        const dark = theme === 'dark';
        if (await page.locator('body').evaluate(el => el.classList.contains('dark')) !== dark) await page.locator('#theme-toggle').click();
        const logo = page.locator(`.logo-mark-${theme}`);
        await logo.scrollIntoViewIfNeeded();
        await logo.waitFor({ state: 'visible' });
        await logo.evaluate(img => img.decode());
        assert.ok(await logo.evaluate(img => img.complete && img.naturalWidth > 0), 'Brand artwork must load');
        assert.equal(await page.locator(`.logo-mark-${dark ? 'light' : 'dark'}`).isVisible(), false);
        const bounds = await logo.boundingBox();
        assert.equal(bounds.width, 40);
        assert.equal(bounds.height, 40);
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, 'Logo must stay inside the visible navigation');
        assert.equal(await page.locator('.logo-text').innerText(), 'SEO Buddy');
        assert.equal(await page.locator('.biz-chip img').getAttribute('src'), 'bd-mark.png');
        await page.locator('.logo-area').screenshot({ path: path.join(output, `${prefix}-logo-${theme}.png`) });
      }
    } finally {
      if (await page.locator('body').evaluate(el => el.classList.contains('dark'))) await page.locator('#theme-toggle').click();
      if (mobile) await page.locator('#mobile-backdrop').click({ position: { x: viewport.width - 10, y: 20 } });
    }
  });

  await journey(`${prefix}: startup security and lazy content`, async () => {
    assert.equal(await page.locator('script[src*="content-workspace."]').count(), 0);
    const storage = await page.evaluate(() => ({ legacy: localStorage.getItem('seo_gemini_key'), token: localStorage.getItem('seo_ghl_token'), persistentPassword: localStorage.getItem('seo_admin_password'), migrated: sessionStorage.getItem('seo_admin_password') === 'browser-test-only' }));
    assert.deepEqual(storage, { legacy: null, token: null, persistentPassword: null, migrated: true });
    const startup = await page.evaluate(() => ({
      scripts: Array.from(document.scripts).filter(script => script.src).map(script => new URL(script.src).pathname),
      navigationMs: performance.getEntriesByType('navigation')[0].duration,
      scriptBytes: performance.getEntriesByType('resource').filter(entry => entry.initiatorType === 'script').reduce((sum, entry) => sum + entry.decodedBodySize, 0),
    }));
    assert.equal(startup.scripts.length, 4, 'Secondary tools must stay off the initial script path');
    assert.ok(startup.scriptBytes < 200000, 'Initial uncompressed scripts exceeded the closeout budget');
    results.startup.push({ viewport: prefix, ...startup });
  });

  await journey(`${prefix}: failed content load can be retried`, async () => {
    contentLoadFails = true;
    try {
      await tool('ai-tab');
      await page.getByText('Could not load the content workspace. Refresh or reopen it to try again.', { exact: true }).waitFor();
      assert.equal(await page.locator('script[src*="content-workspace."]').count(), 0);
    } finally { contentLoadFails = false; }
    await nav('#nav-today');
    await tool('ai-tab');
    await page.waitForFunction(() => !!window.SeoBuddyContent);
    assert.equal(await page.locator('script[src*="content-workspace."]').count(), 1);
  });

  await journey(`${prefix}: search to draft, edit, publish, and index`, async () => {
    await tool('gsc-tab');
    await page.locator('.btn-gen-trigger').first().click();
    await page.waitForFunction(() => document.getElementById('ai-tab').classList.contains('active'));
    assert.ok(await page.locator('#input-keyword').inputValue());
    await page.locator('#btn-generate').click();
    await page.locator('#claims-box').waitFor();
    assert.match(await page.locator('#brand-violations').innerText(), /test phrase/);
    assert.equal(await page.locator('#visual-editor script, #visual-editor [onerror]').count(), 0);
    await page.locator('[data-editor-mode="code"]').click();
    await page.locator('#code-editor').fill('<h1>Edited test article</h1><p>Reviewed copy.</p><script>bad()</script>');
    await page.locator('[data-editor-mode="visual"]').click();
    assert.doesNotMatch(await page.locator('#code-editor').inputValue(), /<script/);
    await page.locator('#btn-proceed-publish').click();
    await page.locator('#btn-publish-ghl-now').click();
    await page.waitForFunction(() => !document.getElementById('btn-publish-ghl-now').disabled);
    const publish = writes.find(write => write.path === '/api/publish-ghl');
    assert.ok(publish);
    assert.equal(publish.body.title, 'Acceptance article');
    assert.doesNotMatch(publish.body.content, /<script/);
    assert.match(await page.locator('#history-table-body').innerText(), /Acceptance article/);
    await page.locator('#btn-index-now').click();
    await page.waitForFunction(() => !document.getElementById('btn-index-now').disabled);
    assert.match(writes.find(write => write.path === '/api/index-url').body.url, /\/post\/acceptance-article$/);
    assert.match(await page.locator('#history-table-body').innerText(), /Asked Google to list it/);
    await tool('ai-tab');
    assert.match(await page.locator('#code-editor').inputValue(), /Edited test article/);
    assert.equal(await page.locator('script[src*="content-workspace."]').count(), 1);
  });

  await journey(`${prefix}: autopilot queue, schedule, and manual trigger`, async () => {
    await tool('publish-tab');
    await page.locator('#autopilot-queue-input').fill('Test-only topic');
    await page.locator('#btn-autopilot-queue-add').click();
    await page.locator('.apq-remove').waitFor();
    assert.equal(writes.find(write => write.path === '/api/autopilot-queue/add').body.topic, 'Test-only topic');
    await page.locator('.apq-remove').click();
    await page.locator('.apq-remove').waitFor({ state: 'detached' });
    await page.locator('#autopilot-interval').selectOption('48');
    await page.waitForTimeout(100);
    assert.equal(writes.find(write => write.path === '/api/autopilot-toggle').body.intervalHours, 48);
    await page.locator('#btn-run-autopilot-now').click();
    await page.getByText('Test-only run accepted', { exact: true }).waitFor();
    assert.equal(await page.locator('#btn-run-autopilot-now').isEnabled(), true);
    assert.equal(writes.filter(write => write.path === '/api/autopilot-run-now').length, 1);
  });

  await journey(`${prefix}: generation failure and auth rejection recover safely`, async () => {
    generationFails = true;
    await tool('ai-tab');
    await page.locator('#btn-generate').click();
    await page.getByText('AI Writing failed: Acceptance-test provider unavailable', { exact: true }).waitFor();
    assert.equal(await page.locator('#btn-generate').isEnabled(), true);
    assert.equal(await page.locator('#visual-editor').isVisible(), true);
    assert.match(await page.locator('#visual-editor').innerText(), /Edited test article/);
    assert.equal(await page.locator('#editor-empty').isVisible(), false);
    generationFails = false;
    await nav('#nav-settings');
    await page.waitForFunction(() => typeof window.loadSettingsWorkspace === 'function');
    await page.evaluate(() => sessionStorage.removeItem('seo_admin_password'));
    await page.locator('#btn-gsc-diag').click();
    await page.waitForFunction(() => document.getElementById('gsc-diag-body').textContent.includes('locked'));
    assert.equal(await page.locator('#btn-gsc-diag').isEnabled(), true);
    await page.evaluate(() => sessionStorage.setItem('seo_admin_password', 'browser-test-only'));
  });

  await journey(`${prefix}: monthly owner report setup is clear and controllable`, async () => {
    responses.set('/api/monthly-report', { json: {
      success: true, enabled: true, gmailConfigured: false, recipientConfigured: false,
      recipientMasked: '', ready: false, needsSetup: true, lastSentAt: null,
    } });
    await page.evaluate(() => window.switchTab('performance-tab'));
    await page.waitForFunction(() => typeof window.loadMonthlyReport === 'function');
    await page.evaluate(() => window.loadMonthlyReport());
    assert.match(await page.locator('#mr-status').innerText(), /Needs email setup/);
    assert.equal(await page.locator('#mr-send').isDisabled(), true);

    responses.set('/api/monthly-report', { json: {
      success: true, enabled: true, gmailConfigured: true, recipientConfigured: true,
      recipientMasked: 'o****@example.com', ready: true, needsSetup: false, lastSentAt: null,
    } });
    responses.set('/api/monthly-report/send', { json: {
      success: true, sent: true, enabled: true, gmailConfigured: true, recipientConfigured: true,
      recipientMasked: 'o****@example.com', ready: true, lastSentAt: new Date().toISOString(),
    } });
    await page.locator('#mr-recipient').fill('owner@example.com');
    await page.locator('#mr-save').click();
    await page.waitForFunction(() => !document.getElementById('mr-save').disabled);
    const save = writes.find(write => write.path === '/api/monthly-report');
    assert.deepEqual(save.body, { enabled: true, recipient: 'owner@example.com' });
    assert.match(await page.locator('#mr-status').innerText(), /Ready for the 1st/);
    await page.locator('#mr-send').click();
    await page.getByText('Monthly PDF report sent.', { exact: true }).waitFor();
    assert.equal(writes.filter(write => write.path === '/api/monthly-report/send').length, 1);
    responses.delete('/api/monthly-report');
    responses.delete('/api/monthly-report/send');
  });

  await journey(`${prefix}: settings drafts survive navigation and secrets clear on save`, async () => {
    await nav('#nav-settings');
    await page.locator('#settings-author-name').fill('Acceptance Author');
    await nav('#nav-today');
    await nav('#nav-settings');
    assert.equal(await page.locator('#settings-author-name').inputValue(), 'Acceptance Author');
    await page.locator('#settings-gemini-key').fill('fake-new-test-key');
    await page.locator('#settings-form button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById('gsc-tab').classList.contains('active'));
    assert.equal(await page.locator('#settings-gemini-key').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.getItem('seo_gemini_key')), null);
    assert.equal(writes.filter(write => write.path === '/api/save-settings').length, 1);
  });

  await journey(`${prefix}: carousel stays compact and advances`, async () => {
    await nav('#nav-explore');
    const carousel = page.locator('.sb-explore-step').first();
    await carousel.waitFor();
    // Navigation and the async readiness response can replace the shelf before
    // its first layout. Capture the usable geometry in the same browser turn;
    // a second locator read can otherwise measure a replacement before layout.
    const geometry = await page.waitForFunction(() => {
      const track = document.querySelector('.sb-explore-step .sb-track');
      if (!track || track.clientWidth <= 0 || track.scrollWidth <= track.clientWidth) return false;
      return { viewportWidth: track.clientWidth, contentWidth: track.scrollWidth };
    });
    const measured = await geometry.jsonValue();
    await geometry.dispose();
    assert.ok(measured.contentWidth > measured.viewportWidth, 'Carousel must have horizontally navigable content');
    if (await carousel.locator('.next').isVisible()) await carousel.locator('.next').click();
    else await carousel.locator('.sb-stepdot[data-i="1"]').click();
    await page.waitForFunction(() => /^2 of /.test(document.querySelector('.sb-explore-step .sb-step-pos')?.textContent || ''));
    assert.match(await carousel.locator('.sb-step-pos').innerText(), /^2 of /);
  });

  await page.addScriptTag({ url: base + '/__acceptance__/axe.js' });
  async function audit(view) {
    await page.waitForTimeout(350);
    const report = await page.evaluate(async () => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      violations: (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations
        .map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })),
    }));
    results.screens.push({ viewport: prefix, view, ...report });
    await page.screenshot({ path: path.join(output, `${prefix}-${view}.png`), fullPage: true });
  }

  await journey(`${prefix}: keyboard shortcuts and confirmation focus`, async () => {
    await nav('#nav-explore');
    const shortcut = page.locator('.exp-row[data-go="tab:ai-tab"]');
    await shortcut.focus();
    await page.keyboard.press('Enter');
    await page.locator('#ai-tab.active').waitFor();
    await page.locator('#btn-generate').focus();
    await page.evaluate(() => { window.testAnswer = null; window.SeoBuddyCore.confirmAction('Test-only confirmation').then(answer => { window.testAnswer = answer; }); });
    await page.locator('[data-answer="no"]:focus').waitFor();
    await page.keyboard.press('Shift+Tab');
    await page.locator('[data-answer="yes"]:focus').waitFor();
    await page.keyboard.press('Tab');
    await page.locator('[data-answer="no"]:focus').waitFor();
    await audit('confirmation');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.testAnswer), false);
    await page.locator('#btn-generate:focus').waitFor();
  });

  await journey(`${prefix}: setup wizard keyboard and form labels`, async () => {
    await page.evaluate(() => window.openSetupWizard());
    await page.locator('#setup-overlay').waitFor();
    for (let step = 0; step < 4; step++) {
      await audit('setup-' + step);
      if (step < 3) await page.locator('#setup-next').click();
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#setup-overlay').isVisible(), false);
  });

  await page.locator('#asst-fab').click();
  await page.locator('#asst-panel.open').waitFor();
  await audit('assistant');
  await page.locator('#asst-close').click();

  const views = ['today-tab', 'explore-tab', 'gsc-tab', 'ai-tab', 'publish-tab', 'performance-tab', 'brand-tab', 'aio-tab', 'citations-tab', 'local-tab', 'onsite-tab', 'reviews-tab', 'summary-tab', 'grow-tab', 'settings-tab'];
  for (const id of views) {
    await page.evaluate(id => window.switchTab(id), id);
    await audit(id);
  }
  // Owner views have a separate navigation model; audit them with that model active.
  await page.evaluate(() => document.getElementById('btn-mode-switch').click());
  await page.waitForFunction(() => document.body.classList.contains('owner-mode'));
  for (const id of ['owner-today-tab', 'owner-results-tab', 'owner-business-tab']) {
    await page.evaluate(id => window.switchTab(id), id);
    await audit(id);
  }
  await page.evaluate(() => document.getElementById('btn-mode-switch').click());
  await page.waitForFunction(() => !document.body.classList.contains('owner-mode'));
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  for (const id of ['today-tab', 'explore-tab', 'ai-tab', 'publish-tab', 'settings-tab']) {
    await page.evaluate(id => window.switchTab(id), id);
    await audit('dark-' + id);
  }
  await require('./browser-workspace.cjs')({ page, base, prefix, journey, audit, writes, responses });
  await require('./browser-report.cjs')({ page, base, prefix, journey, writes, responses, output });
  await context.close();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    const base = await start();
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) await exercise(base, viewport);
    const defects = results.screens.filter(screen => screen.overflow > 2 || screen.violations.some(item => ['serious', 'critical'].includes(item.impact)));
    console.log(JSON.stringify({ journeys: results.journeys.length, failedJourneys: results.journeys.filter(item => !item.passed).length, screens: results.screens.length, screensWithDefects: defects.length, runtimeErrors: results.errors.length }));
    if (defects.length || results.errors.length || results.journeys.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) { results.errors.push({ message: error.stack }); console.error(error); process.exitCode = 1; }
  finally {
    fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(results, null, 2));
    await browser?.close();
    if (child && child.exitCode == null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, pause(5000)]);
      if (child.exitCode == null) { child.kill('SIGKILL'); await exited; }
    }
    // Only the unique directory created by this runner is removed.
    if (path.dirname(dataDir) === os.tmpdir() && path.basename(dataDir).startsWith('seo-buddy-browser-')) fs.rmSync(dataDir, { recursive: true, force: true });
  }
})();
