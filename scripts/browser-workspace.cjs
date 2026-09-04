'use strict';
const assert = require('node:assert/strict');

// Runs inside the existing isolated acceptance server and request firewall.
// All mutations are fixtures; never point this harness at a live deployment.
module.exports = async function exerciseWorkspace({ page, base, prefix, journey, audit, writes, responses }) {
  const moves = { success: true, moves: [
    { key: 'autopilot', title: 'Let SEO Buddy publish for you', why: 'Review the ongoing publication permission.', capability: 'approve', tab: 'publish-tab' },
    { key: 'brand', title: 'Review your brand voice', why: 'Confirm the language before it is used.', capability: 'manual', tab: 'brand-tab' },
  ] };
  const features = [
    ['content', 'Content publishing', 'scheduled', 'Scheduled', 'publish-tab'],
    ['ai', 'AI visibility checks', 'running', 'Running', 'aio-tab'],
    ['local', 'Local listings and Google posts', 'needs-approval', 'Needs approval', 'local-tab'],
    ['citations', 'Directory discovery', 'failed', 'Failed', 'citations-tab'],
    ['onsite', 'Website improvement ideas', 'completed', 'Completed', 'onsite-tab'],
    ['digest', 'Results summary', 'needs-setup', 'Needs setup', 'performance-tab'],
    ['monthly-report', 'Monthly owner report', 'needs-setup', 'Needs setup', 'performance-tab'],
  ].map(([key, title, status, label, tab]) => ({ key, title, status, label, tab, reason: 'Test-only recorded status. No publication is being claimed.', lastRecordedAt: '2026-09-01T12:00:00Z', nextRunAt: null }));
  responses.set('/api/next-moves', { json: moves });
  responses.set('/api/automation-status', { json: { success: true, checkedAt: '2026-09-02T12:00:00Z', features } });
  const open = async id => { await page.locator(id).click(); };
  const location = slug => page.waitForFunction(slug => location.hash === '#/' + slug, slug);
  const load = async (slug, search = '') => {
    await page.goto(base + '/' + search + '#/' + slug);
    await page.waitForFunction(() => !!window.SeoBuddyWorkspace);
    await location(slug);
    await page.addScriptTag({ url: base + '/__acceptance__/axe.js' });
  };
  const tool = async (term, tab) => {
    await open('#ws-nav-tools');
    await page.locator('#ws-tool-search').fill(term);
    await page.locator(`.exp-row[data-go="tab:${tab}"]`).click();
  };

  await journey(`${prefix}: direct links resolve search status and failed checks recover truthfully`, async () => {
    const previous = responses.get('/api/health-score');
    const score = measured => ({ overall: 70, pillars: [{ key: 'found', measured }], runtime: { mockIntegrationsAllowed: false } });
    const badge = text => page.waitForFunction(text => document.getElementById('mode-status-text').textContent === text, text);
    try {
      responses.set('/api/health-score', { json: score(true) });
      for (const slug of ['today', 'approvals', 'results', 'results/detail', 'tools', 'business', 'settings']) {
        await load(slug, '?status-check=' + slug);
        await badge('Live Search Data');
      }
      responses.set('/api/health-score', { status: 503, json: { success: false } });
      await load('results', '?status-check=failed');
      await badge('Live Data Unavailable');
      responses.set('/api/health-score', { json: { runtime: { mockIntegrationsAllowed: true } } });
      await load('tools', '?status-check=missing');
      await badge('Live Data Unavailable');
      responses.set('/api/health-score', { json: { ...score(false), runtime: { mockIntegrationsAllowed: true } } });
      await load('approvals', '?status-check=demo');
      await badge('Demo Search Data');
      responses.set('/api/health-score', { json: score(true) });
      await open('#ws-nav-results');
      await badge('Live Search Data');
      await audit('search-status-recovered');
    } finally {
      if (previous) responses.set('/api/health-score', previous); else responses.delete('/api/health-score');
    }
  });

  await journey(`${prefix}: refresh leaves headings unfocused while keyboard navigation keeps its focus cue`, async () => {
    const heading = page.locator('#page-title');
    const assertNoStartupFocus = async () => {
      // The router restores scroll/focus on the next animation frame.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await heading.evaluate(el => el === document.activeElement), false, 'Startup must not autofocus the heading');
      assert.equal(await heading.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Refresh must not draw a heading box');
      assert.equal(await page.locator('#ws-classic').isVisible(), false, 'Recovery must not appear during normal startup or refresh');
    };
    for (const slug of ['today', 'tools']) {
      // A different query forces a fresh document on the app's own origin;
      // hash-only changes are navigation, and blank pages cannot use storage.
      await load(slug, '?refresh-check=' + slug);
      await assertNoStartupFocus();
      await page.reload();
      await page.waitForFunction(() => !!window.SeoBuddyWorkspace);
      await location(slug);
      await assertNoStartupFocus();
    }
    await page.locator('#ws-nav-today').focus();
    await page.keyboard.press('Enter');
    await location('today');
    await page.locator('#page-title:focus-visible').waitFor();
    assert.notEqual(await heading.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Keyboard navigation must retain its focus cue');
  });

  await journey(`${prefix}: Results and Business retry and share one module without loading legacy controls`, async () => {
    const before = writes.length;
    const fail = route => route.abort();
    await page.route('**/assets/owner-views.*.js', fail);
    try {
      await load('results', '?shared-views-check=1');
      await page.getByText('Could not load Owner mode. Refresh and try again.', { exact: true }).waitFor();
      assert.equal(await page.locator('script[src*="/owner-mode."]').count(), 0);
    } finally {
      await page.unroute('**/assets/owner-views.*.js', fail);
    }
    await page.locator('#ui-toast-host button').evaluateAll(buttons => buttons.forEach(button => button.click()));
    await page.locator('#ws-nav-results').click();
    await page.waitForFunction(() => typeof window.loadOwnerResults === 'function');
    await page.waitForFunction(() => document.getElementById('ow-find-note').textContent.trim().length > 0);
    if (prefix === 'mobile') await page.locator('#mobile-hamburger').click();
    await page.locator('#ws-nav-business').click();
    await location('business');
    await page.waitForFunction(() => document.getElementById('ow-basics').textContent.trim().length > 0);
    await page.locator('#ws-nav-results').click();
    await location('results');
    assert.equal(await page.locator('script[src*="/owner-views."]').count(), 1);
    assert.equal(await page.locator('script[src*="/owner-mode."]').count(), 0);
    assert.equal(await page.evaluate(() => typeof window.setOwnerMode), 'undefined');
    assert.equal(writes.length, before, 'Reading shared views must not send mutations');
  });

  await journey(`${prefix}: normal navigation hides legacy entry while emergency and preview bookmarks still work`, async () => {
    const before = writes.length;
    await page.evaluate(() => localStorage.setItem('seo_owner_mode', '1'));
    await page.goto(base);
    await location('today');
    assert.equal(await page.locator('body.workspace-preview:not(.owner-mode)').count(), 1);
    assert.equal(await page.locator('#workspace-nav .nav-item:visible').count(), 4);
    assert.equal(await page.getByText('Navigation preview', { exact: true }).count(), 0);
    assert.equal(await page.locator('#ws-classic').isVisible(), false);
    assert.equal(await page.getByText('Previous interface', { exact: true }).count(), 0);
    await page.goto(base + '?workspace=classic');
    await page.waitForFunction(() => document.body.classList.contains('owner-mode'));
    assert.equal(new URL(page.url()).searchParams.get('workspace'), 'classic');
    assert.equal(await page.locator('body.workspace-preview').count(), 0);
    assert.equal(await page.locator('script[src*="/workspace."]').count(), 0);
    if (prefix === 'mobile') await page.locator('#mobile-hamburger').click();
    await page.locator('#ws-return').click();
    await location('today');
    assert.notEqual(new URL(page.url()).searchParams.get('workspace'), 'classic');
    assert.equal(await page.locator('#ws-classic').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('seo_owner_mode')), '1');
    await page.goto(base + '?workspace=preview#/tools');
    await page.locator('#ws-tool-search').waitFor();
    assert.equal(await page.locator('#ws-nav-tools').getAttribute('aria-current'), 'page');
    assert.equal(writes.length, before, 'Changing interfaces must not send a write');
    await page.evaluate(() => localStorage.removeItem('seo_owner_mode'));
  });

  await journey(`${prefix}: failed default workspace still offers a working classic recovery link`, async () => {
    const before = writes.length;
    const failWorkspace = route => route.abort();
    await page.route('**/assets/workspace.*.js', failWorkspace);
    try {
      await page.goto(base);
      await page.locator('#ws-load-error:visible').waitFor();
      assert.match(await page.locator('#ws-load-error').innerText(), /recovery interface/);
      assert.equal(await page.getByRole('link', { name: 'Open recovery interface' }).isVisible(), true);
      await page.locator('#ws-classic').click();
      await page.waitForFunction(() => document.getElementById('td-hero').textContent.trim().length > 0);
      assert.equal(new URL(page.url()).searchParams.get('workspace'), 'classic');
      assert.equal(await page.locator('body.workspace-preview').count(), 0);
    } finally {
      await page.unroute('**/assets/workspace.*.js', failWorkspace);
    }
    await page.goto(base);
    await location('today');
    assert.equal(await page.locator('#ws-classic').isVisible(), false, 'Recovery must disappear after a successful reload');
    assert.equal(await page.locator('#ws-load-error').isVisible(), false);
    assert.equal(writes.length, before, 'Recovery must not write settings or trigger provider actions');
  });

  await journey(`${prefix}: default workspace has four persistent destinations and bounded status evidence`, async () => {
    await load('today');
    await page.waitForFunction(() => document.querySelectorAll('.ws-automation').length === 7);
    assert.equal(await page.locator('#workspace-nav .nav-item:visible').count(), 4);
    assert.equal(await page.locator('#btn-mode-switch').isVisible(), false);
    assert.equal(await page.locator('.nav-menu:not(#workspace-nav):visible').count(), 0);
    assert.match(await page.locator('#ws-today').innerText(), /There are things to review/);
    assert.equal(await page.locator('.ws-automation details[open]').count(), 0);
    assert.equal(await page.locator('.ws-overview .btn-primary').count(), 1, 'Briefing must have one clear primary action');
    assert.equal(await page.locator('.ws-overview .sb-editorial-art[aria-hidden="true"]').count(), 1);
    const listBounds = await page.locator('.ws-automations').boundingBox();
    assert.ok(listBounds.height <= 430, 'Seven collapsed automation rows must stay compact');
    await page.locator('.ws-automation summary').first().click();
    assert.match(await page.locator('.ws-automation').first().innerText(), /No publication is being claimed/);
    await audit('preview-today');
    if (prefix === 'mobile') {
      const bounds = await page.locator('#workspace-nav').boundingBox();
      assert.ok(bounds.y + bounds.height <= page.viewportSize().height + 1);
      await page.locator('#asst-fab').click();
      const panel = await page.locator('#asst-panel').boundingBox();
      assert.ok(panel.y + panel.height <= bounds.y, 'Assistant must not cover primary navigation');
      await audit('preview-assistant');
      await page.locator('#asst-close').click();
      await page.setViewportSize({ width: 861, height: 1000 });
      await page.waitForFunction(() => document.querySelector('.sidebar #workspace-nav'));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('body > #workspace-nav'));
    }
  });

  await journey(`${prefix}: menu controls and overlay dismissal stay above primary navigation`, async () => {
    await load('today');
    const originalViewport = page.viewportSize();
    const viewports = prefix === 'mobile'
      ? [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]
      : [originalViewport];
    const assertClickable = async selector => {
      const control = page.locator(selector);
      await control.scrollIntoViewIfNeeded();
      assert.ok(await control.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      }), `${selector} must not be covered by navigation or another overlay`);
    };
    try {
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const mobile = viewport.width <= 860;
        if (mobile) await page.locator('#mobile-hamburger').click();
        for (const selector of ['#ws-nav-business', '#nav-settings', '#theme-toggle']) await assertClickable(selector);
        if (await page.locator('body').evaluate(el => el.classList.contains('dark'))) await page.locator('#theme-toggle').click();
        await page.locator('#theme-toggle').click();
        await page.locator('body.dark').waitFor();
        assert.equal(await page.locator('.logo-mark-dark').isVisible(), true);
        await audit(`menu-dark-${viewport.width}x${viewport.height}`);
        await assertClickable('#theme-toggle');
        await page.locator('#theme-toggle').click();
        await page.locator('body:not(.dark)').waitFor();
        if (mobile) {
          const sidebar = await page.locator('.sidebar').boundingBox();
          assert.ok(sidebar.y >= -1 && sidebar.y + sidebar.height <= viewport.height + 1, 'Drawer must fit the visible viewport');
          const before = page.url();
          // The lower outside edge used to hit the bottom navigation instead.
          await page.mouse.click(viewport.width - 10, viewport.height - 15);
          assert.equal(await page.locator('body.nav-open').count(), 0);
          assert.equal(page.url(), before, 'Backdrop dismissal must not navigate');
        }
        await page.locator('#ws-nav-tools').click();
        await location('tools');
        await page.locator('#ws-nav-today').click();
        await location('today');
      }
    } finally {
      await page.setViewportSize(originalViewport);
      await page.evaluate(() => {
        if (document.body.classList.contains('dark')) document.getElementById('theme-toggle').click();
        document.body.classList.remove('nav-open');
      });
    }
  });

  await journey(`${prefix}: polished layout stays readable at narrow widths and keyboard-operable`, async () => {
    await open('#ws-nav-today');
    await page.waitForFunction(() => document.querySelectorAll('.ws-automation').length === 7 && !document.getElementById('ws-today').hasAttribute('aria-busy'));
    assert.equal(await page.locator('.ws-automation details[open]').count(), 0);
    await page.locator('.ws-automation summary').first().focus();
    await page.locator('.ws-automation summary:focus').waitFor();
    await page.keyboard.press('Enter');
    await page.locator('.ws-automation details[open]').waitFor();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.ws-automation details[open]').count(), 0);
    if (prefix === 'mobile') {
      await page.setViewportSize({ width: 320, height: 640 });
      const primary = await page.locator('.ws-overview .btn-primary').boundingBox();
      assert.ok(primary.y + primary.height < 565, 'Primary action must be visible before scrolling on a small phone');
      await audit('preview-320-today');
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await open('#ws-nav-tools');
    await page.locator('#ws-tool-search').fill('');
    await audit('preview-tools-directory');
    const first = page.locator('.exp-row:visible').first();
    await first.focus();
    await page.keyboard.press('Enter');
    await location('tools/search');
  });

  await journey(`${prefix}: unavailable preview checks never become an all-clear`, async () => {
    responses.set('/api/next-moves', { status: 503, json: { success: false } });
    responses.set('/api/automation-status', { status: 503, json: { success: false } });
    await open('#ws-nav-today');
    await page.getByText('Some checks are unavailable', { exact: true }).waitFor();
    assert.equal(await page.locator('#ws-approval-count').innerText(), '?');
    await open('#ws-nav-approvals');
    await page.getByText('Could not check approvals', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-ws-enable-content]').count(), 0);
    await audit('preview-unavailable');
    responses.set('/api/next-moves', { json: moves });
    responses.set('/api/automation-status', { json: { success: true, checkedAt: '2026-09-02T12:00:00Z', features } });
    await page.locator('[data-ws-retry="approvals"]').click();
    await page.locator('[data-ws-enable-content]').waitFor();
  });

  await journey(`${prefix}: approvals require permission and verified server acknowledgement`, async () => {
    await open('#ws-nav-approvals');
    await page.locator('[data-ws-enable-content]').click();
    const before = writes.length;
    await page.keyboard.press('Escape');
    assert.equal(writes.length, before, 'Cancel must not send a write');
    responses.set('/api/autopilot-toggle', { json: { success: false, error: 'Test-only refusal' } });
    await page.locator('[data-ws-enable-content]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.getByText('The server did not confirm the schedule change.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-ws-enable-content]').isEnabled(), true);
    await page.locator('#ui-toast-host button').evaluateAll(buttons => buttons.forEach(button => button.click()));
    responses.delete('/api/autopilot-toggle');
    await page.locator('[data-ws-enable-content]').click();
    await page.locator('[data-answer="yes"]').click();
    await page.getByText('Schedule enabled. This does not mean an article has been published.', { exact: true }).waitFor();
    assert.equal(writes.at(-1).path, '/api/autopilot-toggle');
    assert.equal(writes.at(-1).body.enabled, true);
    await audit('preview-approvals');
  });

  await journey(`${prefix}: searchable tools, direct links and browser history preserve orientation`, async () => {
    await open('#ws-nav-tools');
    await page.locator('#ws-tool-count').getByText(/destination/).waitFor();
    assert.equal(await page.locator('#exp-getstarted').isVisible(), false);
    await page.locator('#ws-tool-search').fill('zzzz-no-such-tool');
    assert.match(await page.locator('#ws-tool-count').innerText(), /No matching tools/);
    assert.equal(await page.locator('.exp-row:visible').count(), 0);
    await page.locator('#ws-tool-search').fill('reviews');
    await audit('preview-tools');
    await page.locator('.exp-row[data-go="tab:reviews-tab"]').focus();
    await page.keyboard.press('Enter');
    await location('tools/reviews');
    assert.equal(await page.locator('#ws-nav-tools').getAttribute('aria-current'), 'page');
    await page.goBack();
    await location('tools');
    await page.goForward();
    await location('tools/reviews');
    await load('tools/reviews');
    assert.equal(await page.locator('#reviews-tab.active').count(), 1);
    await page.locator('#ws-back').click();
    await location('today');
    await open('#ws-nav-tools');
    await page.locator('#ws-tool-search').fill('dashboard');
    assert.equal(await page.locator('#exp-groups details[open]').count(), 1);
    await page.locator('.exp-row[data-go="tab:summary-tab"]').click();
    await location('results/dashboard');
  });

  await journey(`${prefix}: estimate links focus the existing Settings controls without saving or losing drafts`, async () => {
    const before = writes.length;
    await load('results', '?estimate-navigation=1');
    const edit = page.locator('#owner-results-tab [data-settings-section="value"]');
    await edit.focus();
    await page.keyboard.press('Enter');
    await location('settings');
    await page.locator('#settings-value-heading:focus').waitFor();
    await page.waitForFunction(() => typeof window.loadSettingsWorkspace === 'function' && document.getElementById('settings-client-value').value !== '');
    assert.equal(await page.locator('#ws-connections').getAttribute('open'), null);
    assert.equal(await page.locator('#settings-gemini-key').isVisible(), false);
    await page.locator('#settings-client-value').fill('777');
    await page.goBack();
    await location('results');
    await edit.click();
    await page.locator('#settings-value-heading:focus').waitFor();
    assert.equal(await page.locator('#settings-client-value').inputValue(), '777');
    await audit('estimate-settings-navigation');
    await load('results/dashboard', '?estimate-dashboard=1');
    const dashboardEdit = page.getByRole('button', { name: 'Edit estimate assumptions', exact: true });
    await dashboardEdit.focus();
    await page.keyboard.press('Enter');
    await location('settings');
    await page.locator('#settings-value-heading:focus').waitFor();
    assert.deepEqual(writes.slice(before), []);
  });

  await journey(`${prefix}: disconnected search links open connection controls without claiming a repair`, async () => {
    const before = writes.length;
    const previous = ['/api/performance', '/api/deploy-readiness'].map(path => [path, responses.get(path)]);
    responses.set('/api/performance', { status: 503, json: { success: false } });
    responses.set('/api/deploy-readiness', { json: { checks: [{ key: 'gsc', ok: false }] } });
    try {
      await load('results', '?connection-navigation=1');
      await page.getByRole('button', { name: 'Review connection settings' }).click();
      await location('settings');
      await page.locator('#ws-connections > summary:focus').waitFor();
      assert.equal(await page.locator('#settings-gemini-key').isVisible(), true);
      await audit('connection-settings-navigation');
      await page.goBack();
      await location('results');
      await page.getByRole('button', { name: 'Review connection settings' }).waitFor();
      assert.deepEqual(writes.slice(before), []);
    } finally {
      for (const [path, value] of previous) { if (value) responses.set(path, value); else responses.delete(path); }
    }
  });

  await journey(`${prefix}: reports are prominent in Results and parent breadcrumbs work with history`, async () => {
    const before = writes.length;
    await load('results', '?report-navigation=1');
    const entry = page.locator('.ws-report-entry');
    await entry.waitFor();
    assert.equal(await entry.evaluate(el => el.parentElement.firstElementChild === el), true);
    const bounds = await entry.boundingBox();
    assert.ok(bounds.y + bounds.height < page.viewportSize().height - (prefix === 'mobile' ? 80 : 0), 'Report entry must fit above the fold');
    await audit('reports-entry');
    await entry.getByRole('button', { name: 'Open reports & email' }).click();
    await location('results/detail');
    await page.locator('#perf-download-pdf').waitFor();
    assert.match(await page.locator('#page-subtitle').innerText(), /manage email delivery/);
    const parent = page.locator('#ws-location').getByRole('button', { name: 'Results', exact: true });
    await parent.focus();
    await page.keyboard.press('Enter');
    await location('results');
    await page.goBack();
    await location('results/detail');
    assert.equal(await page.locator('#ws-nav-results').getAttribute('aria-current'), 'page');
    await load('business/voice', '?parent-navigation=1');
    await page.locator('#ws-location').getByRole('button', { name: 'Business', exact: true }).click();
    await location('business');
    // Existing digest read receipts are intentional; navigation must never
    // send email, generate content, or save configuration.
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
  });

  await journey(`${prefix}: tool search understands report and Google post requests and can be cleared`, async () => {
    const before = writes.length;
    await load('tools', '?search-words=1');
    for (const [term, tab] of [['email my monthly report', 'performance-tab'], ['download a PDF', 'performance-tab'], ['write a Google post', 'local-tab'], ['write a post', 'ai-tab']]) {
      await page.locator('#ws-tool-search').fill(term);
      assert.equal(await page.locator(`.exp-row[data-go="tab:${tab}"]`).isVisible(), true, term);
    }
    await page.locator('#ws-tool-search').fill('email my monthly report');
    await page.locator('.exp-row[data-go="tab:performance-tab"]').click();
    await location('results/detail');
    await page.goBack();
    await location('tools');
    await page.locator('#ws-tool-search').fill('no-such-destination');
    assert.equal(await page.locator('.exp-row:visible').count(), 0);
    await page.locator('#ws-tool-clear').click();
    assert.equal(await page.locator('#ws-tool-search').inputValue(), '');
    assert.equal(await page.locator('#ws-tool-search').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#ws-tool-clear').isVisible(), false);
    assert.ok(await page.locator('.exp-row:visible').count() > 5);
    if (prefix === 'mobile') await page.setViewportSize({ width: 320, height: 640 });
    try {
      await page.locator('#ws-tool-search').fill('email report');
      await audit('report-search');
    } finally { if (prefix === 'mobile') await page.setViewportSize({ width: 390, height: 844 }); }
    assert.equal(writes.length, before);
  });

  await journey(`${prefix}: missing report setup opens report controls instead of unrelated settings`, async () => {
    const before = writes.length;
    await load('today', '?report-setup-navigation=1');
    const row = page.locator('.ws-automation').filter({ hasText: 'Monthly owner report' });
    await row.locator('summary').click();
    await row.getByRole('button', { name: 'Review report setup' }).click();
    await location('results/detail');
    assert.equal(writes.length, before);
  });

  await journey(`${prefix}: draft survives navigation and publication is distinct from indexing`, async () => {
    await tool('search', 'gsc-tab');
    await page.locator('.btn-gen-trigger').first().click();
    await location('tools/content/draft');
    await page.locator('#btn-generate').click();
    await page.locator('#claims-box').waitFor();
    await page.locator('[data-editor-mode="code"]').click();
    await page.locator('#code-editor').fill('<h1>Preview draft</h1><p>Still here after navigating.</p>');
    await open('#ws-nav-approvals');
    await page.getByRole('button', { name: 'Review article', exact: true }).click();
    await location('tools/content/draft');
    assert.match(await page.locator('#code-editor').inputValue(), /Still here/);
    await page.locator('#ws-journey [data-ws-tab="publish-tab"]').click();
    await page.locator('#deploy-status').selectOption('published');
    await page.locator('#btn-publish-ghl-now').click();
    await page.getByText('Demo publication only. No live website change was confirmed.', { exact: true }).waitFor();
    responses.set('/api/publish-ghl', { json: { success: true, source: 'live_ghl', message: 'Test-only publication confirmed' } });
    await page.locator('#deploy-status').selectOption('draft');
    await page.locator('#btn-publish-ghl-now').click();
    await page.getByText('Saved as a website draft. It is not live yet.', { exact: true }).waitFor();
    await open('#ws-nav-approvals');
    await page.getByRole('button', { name: 'Review article', exact: true }).click();
    await page.locator('#ws-journey [data-ws-tab="publish-tab"]').click();
    await page.locator('#deploy-status').selectOption('published');
    await page.locator('#btn-publish-ghl-now').click();
    await page.getByText('Publication confirmed. Indexing and business results are separate checks.', { exact: true }).waitFor();
    await page.locator('#btn-index-now').click();
    await page.getByText('Indexing requested. Google decides whether and when to include the page.', { exact: true }).waitFor();
    await page.locator('#ws-journey [data-ws-tab="ai-tab"]').click();
    await page.locator('[data-editor-mode="visual"]').click();
    await page.locator('#visual-editor').fill('An edited version needs review again.');
    await page.getByText(/Draft kept in this browser tab/, { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.SeoBuddyContent.getDraftSummary().publicationStatus), null);
    await audit('preview-content');
    await page.locator('#ws-journey [data-ws-tab="owner-results-tab"]').click();
    await location('results');
    responses.delete('/api/publish-ghl');
  });

  await journey(`${prefix}: business and technical details stay accessible without switching modes`, async () => {
    const hamburger = page.locator('#mobile-hamburger');
    if (await hamburger.isVisible()) await hamburger.click();
    await open('#ws-nav-business');
    await location('business');
    await page.locator('#ow-voice [data-ow-brand]').waitFor();
    await page.locator('#ow-voice [data-ow-brand]').click();
    await location('business/voice');
    await page.locator('#ws-back').click();
    await location('business');
    await page.getByRole('button', { name: 'Manage connections', exact: true }).click();
    await location('settings');
    await page.locator('#ws-connections > summary:focus').waitFor();
    assert.equal(await page.locator('#settings-gemini-key').isVisible(), true);
    await page.locator('#ws-connections > summary').click();
    assert.equal(await page.locator('#ws-connections').getAttribute('open'), null);
    assert.equal(await page.locator('#settings-gemini-key').isVisible(), false);
    await page.locator('#ws-connections > summary').click();
    assert.equal(await page.locator('#settings-gemini-key').isVisible(), true);
    await audit('preview-settings-expanded');
  });

  await journey(`${prefix}: missing result and business data never masquerade as disconnections`, async () => {
    for (const route of ['/api/performance', '/api/reviews-stats', '/api/deploy-readiness', '/api/business-profile', '/api/brand-profile']) responses.set(route, { status: 503, json: { success: false } });
    try {
      await open('#ws-nav-results');
      await page.getByText('Search figures and connection status are unavailable.', { exact: true }).waitFor();
      assert.doesNotMatch(await page.locator('#ow-rev').innerText(), /No reviews site connected/);
      await page.evaluate(() => window.switchTab('owner-business-tab'));
      await page.locator('#ow-basics').getByText(/could not be loaded/).waitFor();
      assert.match(await page.locator('#ow-conn').innerText(), /unavailable/);
    } finally { for (const route of ['/api/performance', '/api/reviews-stats', '/api/deploy-readiness', '/api/business-profile', '/api/brand-profile']) responses.delete(route); }
  });

  await journey(`${prefix}: partial connection checks remain unverified and retry without changing settings`, async () => {
    const before = writes.length;
    const previous = responses.get('/api/deploy-readiness');
    responses.set('/api/deploy-readiness', { json: { checks: [{ key: 'gsc', ok: true }, { key: 'ghl', ok: false }] } });
    try {
      await load('business', '?partial-connections=1');
      const retry = page.getByRole('button', { name: 'Retry connection checks' });
      await retry.waitFor();
      const rows = page.locator('#ow-conn > div');
      assert.match(await rows.filter({ hasText: 'Google Search' }).innerText(), /Connected/i);
      assert.match(await rows.filter({ hasText: 'Your website' }).innerText(), /Not connected/i);
      assert.match(await rows.filter({ hasText: 'AI writing' }).innerText(), /Not verified/i);
      assert.match(await page.locator('#ow-conn').innerText(), /does not mean disconnected/);
      await audit('partial-connection-checks');
      responses.set('/api/deploy-readiness', { json: { checks: ['gsc', 'ghl', 'gemini'].map(key => ({ key, ok: true })) } });
      await retry.click();
      await retry.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#ow-conn .ow-chip.auto').count(), 3);
      assert.doesNotMatch(await page.locator('#ow-conn').innerText(), /Not verified|Not connected/i);
      assert.deepEqual(writes.slice(before), []);
    } finally {
      if (previous) responses.set('/api/deploy-readiness', previous); else responses.delete('/api/deploy-readiness');
    }
  });

  await journey(`${prefix}: compact business guide opens tools without running them`, async () => {
    const before = writes.length;
    await load('business', '?business-tool-guide=1');
    const guide = page.locator('#ow-tool-guide');
    assert.equal(await guide.getAttribute('open'), null);
    assert.equal(await guide.locator('button:visible').count(), 0);
    const summary = guide.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await guide.getAttribute('open'), null);
    assert.equal(await guide.locator('button:visible').count(), 6);
    await audit('business-tool-guide-expanded');
    const destinations = [
      ['ai-tab', 'tools/content/draft'], ['publish-tab', 'tools/content/publish'],
      ['aio-tab', 'tools/ai-visibility'], ['local-tab', 'tools/local'],
      ['citations-tab', 'tools/directories'], ['performance-tab', 'results/detail'],
    ];
    for (const [tab, slug] of destinations) {
      await guide.locator(`[data-ow-tool="${tab}"]`).click();
      await location(slug);
      await page.goBack();
      await location('business');
      assert.notEqual(await guide.getAttribute('open'), null);
    }
    await summary.focus();
    await page.keyboard.press('Space');
    assert.equal(await guide.getAttribute('open'), null);
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
    // Leave expanded for the following light/dark route audits.
    await summary.click();
  });

  await journey(`${prefix}: setup links reveal the right controls without saving settings`, async () => {
    const before = writes.length;
    const paths = ['/api/next-moves', '/api/automation-status'];
    const previous = paths.map(path => [path, responses.get(path)]);
    responses.set('/api/next-moves', { json: { success: true, moves: [] } });
    try {
      for (const key of ['content', 'monthly-report', 'digest']) {
        const feature = { ...features.find(item => item.key === key), status: 'needs-setup', label: 'Needs setup' };
        responses.set('/api/automation-status', { json: { success: true, features: [feature] } });
        await load('today', `?contextual-setup=${key}`);
        await page.getByRole('button', { name: 'Review flagged area' }).click();
        const destination = key === 'content' ? 'settings' : 'results/detail';
        await location(destination);
        if (key === 'content') {
          await page.locator('#ws-connections > summary:focus').waitFor();
          assert.equal(await page.locator('#settings-gemini-key').isVisible(), true);
          await page.locator('#settings-gemini-key').fill('unsaved-browser-test-only');
          await page.locator('#ws-connections > summary').click();
        }
        await page.goBack();
        await location('today');
        const row = page.locator('.ws-automation').filter({ hasText: feature.title });
        await row.locator('summary').click();
        const link = row.getByRole('button', { name: key === 'content' ? 'Review connections' : 'Review report setup' });
        await link.focus();
        await page.keyboard.press('Enter');
        await location(destination);
        if (key === 'content') {
          await page.locator('#ws-connections > summary:focus').waitFor();
          assert.equal(await page.locator('#settings-gemini-key').inputValue(), 'unsaved-browser-test-only');
        }
      }
      assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
    } finally {
      for (const [path, value] of previous) { if (value) responses.set(path, value); else responses.delete(path); }
    }
  });

  // Audit every preview route in light mode; core destinations also in dark.
  await page.evaluate(() => { if (document.body.classList.contains('dark')) document.getElementById('theme-toggle').click(); });
  const routes = await page.evaluate(() => Object.keys(window.SeoBuddyWorkspace.routes));
  for (const id of routes) {
    await page.evaluate(id => window.switchTab(id), id);
    assert.equal(await page.locator('#ws-classic').isVisible(), false);
    await audit('preview-' + id);
  }
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  for (const id of ['workspace-today-tab', 'approvals-tab', 'owner-results-tab', 'explore-tab', 'owner-business-tab', 'settings-tab']) {
    await page.evaluate(id => window.switchTab(id), id);
    assert.equal(await page.locator('#ws-classic').isVisible(), false);
    await audit('preview-dark-' + id);
  }
};
