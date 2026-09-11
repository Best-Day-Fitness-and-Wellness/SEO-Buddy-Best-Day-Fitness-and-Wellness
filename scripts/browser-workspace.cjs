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
      assert.equal(await page.locator('#ws-classic').count(), 0, 'Retired recovery controls must not exist');
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
      await page.getByText('Could not load this workspace view. Refresh and try again.', { exact: true }).waitFor();
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

  await journey(`${prefix}: retired interface bookmarks resolve to the supported workspace`, async () => {
    const before = writes.length;
    await page.evaluate(() => localStorage.setItem('seo_owner_mode', '1'));
    await page.goto(base);
    await location('today');
    assert.equal(await page.locator('body.workspace-preview').count(), 1);
    assert.equal(await page.locator('#workspace-nav .nav-item:visible').count(), 4);
    assert.equal(await page.getByText('Navigation preview', { exact: true }).count(), 0);
    assert.equal(await page.locator('#ws-classic').count(), 0);
    assert.equal(await page.getByText('Previous interface', { exact: true }).count(), 0);
    await page.goto(base + '?workspace=classic');
    await page.waitForFunction(() => !!window.SeoBuddyWorkspace);
    await location('today');
    assert.equal(new URL(page.url()).searchParams.get('workspace'), 'classic');
    assert.equal(await page.locator('body.workspace-preview').count(), 1);
    assert.equal(await page.locator('script[src*="/workspace."]').count(), 1);
    assert.equal(await page.locator('#ws-return').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('seo_owner_mode')), '1');
    await page.goto(base + '?workspace=preview#/tools');
    await page.locator('#ws-tool-search').waitFor();
    assert.equal(await page.locator('#ws-nav-tools').getAttribute('aria-current'), 'page');
    assert.equal(writes.length, before, 'Changing interfaces must not send a write');
    await page.evaluate(() => localStorage.removeItem('seo_owner_mode'));
  });

  await journey(`${prefix}: failed workspace startup offers a safe reload message`, async () => {
    const before = writes.length;
    const failWorkspace = route => route.abort();
    await page.route('**/assets/workspace.*.js', failWorkspace);
    try {
      await page.goto(base);
      await page.locator('#ws-load-error:visible').waitFor();
      assert.match(await page.locator('#ws-load-error').innerText(), /reload this page/i);
      assert.equal(await page.locator('#ws-classic').count(), 0);
    } finally {
      await page.unroute('**/assets/workspace.*.js', failWorkspace);
    }
    await page.goto(base);
    await location('today');
    assert.equal(await page.locator('#ws-classic').count(), 0);
    assert.equal(await page.locator('#ws-load-error').isVisible(), false);
    assert.equal(writes.length, before, 'Recovery must not write settings or trigger provider actions');
  });

  await journey(`${prefix}: default workspace has four persistent destinations and bounded status evidence`, async () => {
    await load('today');
    await page.waitForFunction(() => document.querySelectorAll('.ws-automation').length === 7);
    assert.equal(await page.locator('#workspace-nav .nav-item:visible').count(), 4);
    assert.equal(await page.locator('#btn-mode-switch').count(), 0);
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
    assert.equal(await page.locator('#ws-tool-empty').isVisible(), true);
    await audit('tools-no-results');
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
    const savedScroll = await page.evaluate(() => { window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight)); return window.scrollY; });
    await page.evaluate(() => window.SeoBuddyWorkspace.navigate('settings-tab'));
    await location('settings');
    await page.goBack();
    await location('results/detail');
    await page.waitForFunction(expected => Math.abs(window.scrollY - expected) < 3, savedScroll);
    await page.evaluate(() => window.scrollTo(0, 0));
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

  await journey(`${prefix}: detail pages explain their evidence and advanced pages identify themselves`, async () => {
    const before = writes.length;
    await load('results', '?trust-pattern=1');
    const trust = page.locator('#ws-page-trust');
    await trust.waitFor();
    assert.equal(await trust.locator(':scope > div').count(), 4);
    assert.match(await trust.innerText(), /What SEO Buddy checks/i);
    assert.match(await trust.innerText(), /When it was checked/i);
    assert.match(await trust.innerText(), /What it found/i);
    assert.match(await trust.innerText(), /What to do next/i);
    await load('today', '?metric-source=1');
    const source = page.locator('.ws-score .ws-metric-source');
    await source.waitFor();
    await source.locator('summary').click();
    assert.match(await source.innerText(), /measured search, local listing, AI visibility/i);
    await load('results/dashboard', '?advanced-label=1');
    assert.match(await page.locator('#ws-advanced-label').innerText(), /Advanced · optional/i);
    assert.equal(await page.locator('#ws-advanced-label').isVisible(), true);
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
  });

  await journey(`${prefix}: long owner pages provide safe in-page navigation`, async () => {
    const before = writes.length;
    await load('settings', '?section-navigation=1');
    const nav = page.locator('#ws-section-nav');
    await nav.waitFor();
    assert.equal(await nav.isVisible(), true);
    assert.equal(await nav.getByRole('button').count(), 5);
    assert.match(await nav.innerText(), /Connection status/);
    assert.match(await nav.innerText(), /Credentials and APIs/);
    await nav.getByRole('button', { name: 'Credentials and APIs' }).click();
    await page.waitForFunction(() => document.getElementById('ws-connections').open && document.activeElement?.id === 'settings-connections-heading');
    assert.equal(await page.locator('#settings-connections-heading').isVisible(), true);
    assert.equal(await nav.getByRole('button', { name: 'Credentials and APIs' }).getAttribute('aria-current'), 'location');

    await load('tools/website', '?section-navigation=scroll');
    assert.equal(await nav.getByRole('button', { name: 'Running on its own' }).getAttribute('aria-current'), 'location');
    await page.evaluate(() => document.getElementById('oa-fixes').scrollIntoView());
    await page.waitForFunction(() => document.querySelector('[data-ws-section-target="oa-fixes"]')?.getAttribute('aria-current') === 'location');
    await nav.getByRole('button', { name: 'Find opportunities' }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'oa-opportunities');
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
  });

  await journey(`${prefix}: shared controls stay consistent across older feature pages`, async () => {
    const before = writes.length;
    await load('business/voice', '?shared-controls=brand');
    const brandFields = page.locator('#bp-card input:not([type="checkbox"]), #bp-card textarea');
    assert.ok(await brandFields.count() > 8);
    assert.equal(await brandFields.evaluateAll(fields => fields.every(field => field.classList.contains('form-input'))), true);
    assert.equal(await page.locator('#bp-reset').evaluate(el => el.classList.contains('btn-secondary')), true);
    assert.equal(await page.locator('#bp-tagline').evaluate(el => getComputedStyle(el).borderRadius), '10px');

    const toggleSize = async (slug, selector) => {
      await load(slug, '?shared-controls=toggle');
      return page.locator(selector).evaluate(input => {
        const style = getComputedStyle(input.parentElement);
        return [style.width, style.height];
      });
    };
    for (const [slug, selector] of [
      ['results/detail', '#pd-enabled'],
      ['tools/ai-visibility', '#av-auto'],
      ['tools/directories', '#cit-auto-toggle'],
      ['tools/local', '#la-toggle'],
      ['tools/website', '#oa-toggle'],
    ]) assert.deepEqual(await toggleSize(slug, selector), ['42px', '24px']);

    await load('tools/ai-visibility', '?shared-controls=schema');
    assert.equal(await page.locator('#schema-code-output').evaluate(el => el.classList.contains('schema-code-output')), true);
    assert.equal(await page.locator('.schema-code-box').evaluate(el => getComputedStyle(el).borderRadius), '10px');
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
  });

  await journey(`${prefix}: Tools remembers the last three destinations in this browser`, async () => {
    const before = writes.length;
    await load('tools/local', '?recent-tools=1');
    await page.evaluate(() => window.SeoBuddyWorkspace.navigate('ai-tab'));
    await location('tools/content/draft');
    await page.locator('#ws-nav-tools').click();
    await location('tools');
    const recent = page.locator('#ws-recent-tools');
    await recent.waitFor();
    assert.equal(await recent.isVisible(), true);
    assert.equal(await recent.locator('.ws-recent-tool').count() <= 3, true);
    assert.match(await recent.innerText(), /Content · draft and review/);
    assert.match(await recent.innerText(), /Local presence/);
    await recent.getByRole('button', { name: /Local presence/ }).click();
    await location('tools/local');
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
    assert.equal(await page.locator('#ws-tool-empty').isVisible(), true);
    await page.locator('#ws-tool-empty-clear').click();
    assert.equal(await page.locator('#ws-tool-search').inputValue(), '');
    assert.equal(await page.locator('#ws-tool-search').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#ws-tool-clear').isVisible(), false);
    assert.equal(await page.locator('#ws-tool-empty').isVisible(), false);
    assert.ok(await page.locator('.exp-row:visible').count() > 5);
    if (prefix === 'mobile') await page.setViewportSize({ width: 320, height: 640 });
    try {
      await page.locator('#ws-tool-search').fill('email report');
      await audit('report-search');
    } finally { if (prefix === 'mobile') await page.setViewportSize({ width: 390, height: 844 }); }
    assert.equal(writes.length, before);
  });

  await journey(`${prefix}: clearing tool search restores the layout and Escape keeps keyboard focus`, async () => {
    const before = writes.length;
    await load('tools', '?search-layout=1');
    const input = page.locator('#ws-tool-search');
    const advanced = page.locator('#exp-groups > details');
    assert.equal(await advanced.getAttribute('open'), null);
    await input.fill('dashboard');
    assert.notEqual(await advanced.getAttribute('open'), null);
    await input.fill('no-such-tool');
    assert.equal(await advanced.isVisible(), false);
    await input.press('Escape');
    assert.equal(await input.inputValue(), '');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    assert.equal(await advanced.isVisible(), true);
    assert.equal(await advanced.getAttribute('open'), null);
    assert.equal(await page.locator('#ws-tool-clear').isVisible(), false);
    await input.press('Escape');
    await location('tools');
    await advanced.locator('summary').click();
    await input.fill('dashboard');
    await page.locator('#ws-tool-clear').click();
    assert.notEqual(await advanced.getAttribute('open'), null);
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    await advanced.locator('summary').click();
    await input.fill('dashboard');
    await page.locator('#ws-tool-clear').click();
    assert.equal(await advanced.getAttribute('open'), null);
    await audit('tool-search-layout-restored');
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
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

  await journey(`${prefix}: every owner destination explains its purpose without carrying stale page copy`, async () => {
    const before = writes.length;
    const pages = [
      ['workspace-today-tab', 'What needs you, what is running, and what happens next', 'Your daily command center'],
      ['approvals-tab', 'Review prepared work before anything changes', 'Decisions waiting for you'],
      ['owner-results-tab', 'See measured progress, search visibility, reviews, and reports', 'Evidence and outcomes'],
      ['explore-tab', 'Find the right tool by the outcome you want', 'Tools for a specific job'],
      ['owner-business-tab', 'Review the facts and voice SEO Buddy uses everywhere', 'Your source of truth'],
      ['settings-tab', 'Connect accounts and manage operational preferences', 'Account and connections'],
    ];
    for (const [tab, subtitle, guide] of pages) {
      await page.evaluate(tab => window.SeoBuddyWorkspace.navigate(tab), tab);
      assert.equal(await page.locator('#page-subtitle').innerText(), subtitle);
      assert.equal(await page.locator('#ws-help-title').textContent(), guide);
      assert.ok((await page.locator('#ws-help-text').textContent()).length > 35);
    }
    assert.equal((await page.locator('#ws-help summary').textContent()).trim(), 'Help');
    await page.locator('#ws-help summary').click();
    assert.equal(await page.locator('.ws-help-menu').count(), 1);
    assert.match(await page.locator('.ws-help-menu').innerText(), /Guidance is view-only/);
    await audit('page-guide');
    await page.locator('#ws-help summary').click();
    assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
  });

  await journey(`${prefix}: an empty approval list gives the owner a useful next step`, async () => {
    const before = writes.length;
    const previous = responses.get('/api/next-moves');
    responses.set('/api/next-moves', { json: { success: true, moves: [] } });
    try {
      await load('approvals', '?empty-approvals=1');
      await page.getByRole('heading', { name: 'You’re caught up' }).waitFor();
      assert.match(await page.locator('#ws-approvals').innerText(), /does not confirm every scheduled check succeeded/);
      await audit('approvals-empty');
      await page.getByRole('button', { name: 'Review today’s status' }).click();
      await location('today');
      assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
    } finally { if (previous) responses.set('/api/next-moves', previous); else responses.delete('/api/next-moves'); }
  });

  await journey(`${prefix}: partial search results stay honest and recover through retry`, async () => {
    const before = writes.length;
    const previous = responses.get('/api/performance');
    responses.set('/api/performance', { json: { current: { avgPosition: 4 }, previous: { clicks: 12 } } });
    try {
      await load('results', '?partial-search-results=1');
      const retry = page.getByRole('button', { name: 'Retry search figures' });
      await retry.waitFor();
      const tile = label => page.locator('#ow-find .ow-tile').filter({ hasText: label }).locator('.v');
      assert.equal(await tile('Visits from Google').innerText(), '—');
      assert.equal(await tile('Times you appeared').innerText(), '—');
      assert.equal(await tile('Typical position').innerText(), '4');
      assert.match(await page.locator('#ow-worth').innerText(), /need real visit numbers/);
      assert.doesNotMatch(await page.locator('#ow-find-note').innerText(), /Holding steady|went the wrong way/);
      await audit('partial-search-results');
      responses.set('/api/performance', { json: { current: { clicks: 10, impressions: 1000, avgPosition: 4 } } });
      await retry.focus();
      await page.keyboard.press('Enter');
      await page.getByText('Not enough search history to compare yet.', { exact: true }).waitFor();
      assert.equal(await tile('Visits from Google').innerText(), '10');
      assert.equal(await retry.count(), 0);
      assert.match(await page.locator('#ow-worth').innerText(), /Estimated opportunity value/);
      // A prior report visit can finish its existing read receipt after navigation.
      assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
    } finally {
      if (previous) responses.set('/api/performance', previous); else responses.delete('/api/performance');
    }
  });

  await journey(`${prefix}: partial review figures remain explicit and retry without changing data`, async () => {
    const before = writes.length;
    const previous = responses.get('/api/reviews-stats');
    responses.set('/api/reviews-stats', { json: { inventory: { published: 20, byPlatform: { '<b>Google</b>': 20 } } } });
    try {
      await load('results', '?partial-review-results=1');
      const retry = page.getByRole('button', { name: 'Retry review figures' });
      await retry.waitFor();
      const tile = label => page.locator('#ow-rev .ow-tile').filter({ hasText: label });
      assert.equal(await tile('Shown on your reviews site').locator('.v').innerText(), '20');
      assert.match(await tile('Shown on your reviews site').innerText(), /20 <b>Google<\/b>/);
      assert.equal(await tile('Shown on your reviews site').locator('.d b').count(), 0);
      assert.equal(await tile('Average rating there').locator('.v').innerText(), '—');
      assert.match(await tile('Review page health').innerText(), /Fix count unavailable/);
      assert.doesNotMatch(await page.locator('#ow-rev').innerText(), /undefined|NaN|0 small fixes/);
      await audit('partial-review-results');
      responses.set('/api/reviews-stats', { json: { inventory: { published: 0, avgRating: null, byPlatform: {} }, score: 0, problems: 0 } });
      await retry.focus();
      await page.keyboard.press('Enter');
      await retry.waitFor({ state: 'hidden' });
      assert.equal(await tile('Shown on your reviews site').locator('.v').innerText(), '0');
      assert.match(await tile('Average rating there').innerText(), /No rating recorded yet/);
      assert.match(await tile('Review page health').innerText(), /0 small fixes suggested/);
      assert.doesNotMatch(await page.locator('#ow-rev').innerText(), /unavailable/);
      assert.deepEqual(writes.slice(before).filter(write => write.path !== '/api/performance-digest/seen'), []);
    } finally {
      if (previous) responses.set('/api/reviews-stats', previous); else responses.delete('/api/reviews-stats');
    }
  });

  await journey(`${prefix}: irrelevant listings require confirmation and can be restored`, async () => {
    const paths = ['/api/local-autopilot', '/api/local-listing-preference', '/api/assistant'];
    const previous = paths.map(path => [path, responses.get(path)]);
    const nap = { canonical: { phone: '727-334-1472', address: '6619 1st Ave S' }, checkedAt: '2026-09-04T12:00:00Z', listings: [{ platform: 'YogaFinder', phone: '727-623-9996', address: '6626 Central Avenue', nameMatch: true, phoneMatch: false, addrMatch: false }, { platform: 'Apple Maps', nameMatch: null, phoneMatch: null, addrMatch: null }], mismatchCount: 1 };
    const exclusions = [{ platform: 'YogaFinder', reason: 'Owner marked not relevant' }];
    const active = { success: true, enabled: true, hasKey: true, nap, napExclusions: [], napIntervalDays: 7, gbpIntervalDays: 7 };
    const ignoredNap = { ...nap, listings: [nap.listings[1]], excludedListings: [nap.listings[0]], mismatchCount: 0 };
    const ignored = { ...active, nap: ignoredNap, napExclusions: exclusions };
    const count = () => writes.filter(write => write.path === '/api/local-listing-preference').length;
    const before = count();
    try {
      responses.set('/api/local-autopilot', { json: active });
      await load('tools/local', '?listing-relevance=1');
      await page.locator('#la-nap-body').getByText('Show what differs', { exact: true }).click();
      const exclude = page.getByRole('button', { name: 'Not relevant', exact: true });
      await exclude.click();
      await page.locator('[data-answer="no"]').click();
      assert.equal(count(), before);
      responses.set('/api/local-listing-preference', { status: 503, json: { success: false, error: 'Could not save the listing preference.' } });
      await exclude.click();
      await page.locator('[data-answer="yes"]').click();
      await page.getByText('Could not save the listing preference.', { exact: true }).waitFor();
      assert.equal(await exclude.isEnabled(), true);
      responses.set('/api/local-listing-preference', { json: { success: true, excluded: true, nap: ignoredNap, exclusions } });
      responses.set('/api/local-autopilot', { json: ignored });
      await exclude.click();
      await page.locator('[data-answer="yes"]').click();
      await page.getByText('Excluded listings (1)', { exact: true }).waitFor();
      assert.match(await page.locator('#la-nap-body').innerText(), /could not be fully verified/);
      await load('tools/local', '?listing-relevance-reload=1');
      await page.getByText('Excluded listings (1)', { exact: true }).click();
      await audit('excluded-local-listing');
      responses.set('/api/local-listing-preference', { json: { success: true, excluded: false, nap, exclusions: [] } });
      await page.getByRole('button', { name: 'Restore monitoring', exact: true }).click();
      await page.locator('[data-answer="yes"]').click();
      await page.getByText('Show what differs', { exact: true }).waitFor();
      assert.equal(count(), before + 3);
      // The assistant proposes the same owner-confirmed operation, never a website deletion.
      const { resolveAssistantAction } = require('../lib/assistant-routes');
      const action = resolveAssistantAction('set_local_listing_relevance', { platform: 'YogaFinder', excluded: true }, { localListings: { listings: nap.listings } });
      responses.set('/api/assistant', { json: { success: true, reply: 'I can mark YogaFinder not relevant. This will not delete the external listing.', action } });
      responses.set('/api/local-listing-preference', { json: { success: true, excluded: true, nap: ignoredNap, exclusions } });
      await page.locator('#asst-fab').click();
      await page.locator('#asst-text').fill('We do not offer yoga. Please remove the YogaFinder task.');
      await page.locator('#asst-send').click();
      const confirm = page.getByRole('button', { name: 'Mark not relevant', exact: true });
      await confirm.waitFor();
      assert.equal(count(), before + 3);
      await confirm.click();
      await page.getByText(/Listing excluded from active monitoring/).waitFor();
      assert.equal(count(), before + 4);
      await page.locator('#asst-close').click();
      await page.getByText('Excluded listings (1)', { exact: true }).waitFor();
    } finally {
      for (const [path, value] of previous) { if (value) responses.set(path, value); else responses.delete(path); }
    }
  });

  await journey(`${prefix}: listing opportunities omit competitors and explain empty scans`, async () => {
    const path = '/api/citation-worklist';
    const previous = responses.get(path);
    const { buildCitationWorklist } = require('../lib/citation-eligibility');
    const state = { lastScanned: '2026-09-04T12:00:00Z', totalQueries: 3, autoEnabled: true, targets: [
      { domain: 'stpeteymca.org', type: 'competitor', listed: false, citedFor: 2 },
      { domain: 'directory.example', type: 'directory', listed: false, citedFor: 1 },
    ] };
    try {
      responses.set(path, { json: buildCitationWorklist(state) });
      await load('tools/directories', '?eligible-citations=1');
      await page.locator('.cit-card[data-domain="directory.example"]').waitFor();
      assert.equal(await page.locator('.cit-card').count(), 1);
      assert.doesNotMatch(await page.locator('#citations-results').innerText(), /stpeteymca|Why skip/);
      assert.match(await page.locator('#cit-progress').innerText(), /0 of 1 worked/);
      await audit('eligible-citations');
      responses.set(path, { json: buildCitationWorklist({ ...state, targets: state.targets.slice(0, 1) }) });
      await load('tools/directories', '?eligible-citations=empty');
      await page.getByText('No eligible listing opportunities in the latest scan. Competitor-owned sites are excluded automatically.', { exact: true }).waitFor();
      assert.equal(await page.locator('.cit-status').count(), 0);
      assert.equal(await page.locator('#cit-progress').isVisible(), false);
    } finally {
      if (previous) responses.set(path, previous); else responses.delete(path);
    }
  });

  await journey(`${prefix}: Google post badges never overlap the heading`, async () => {
    const path = '/api/local-autopilot';
    const previous = responses.get(path);
    try {
      for (const state of ['posted', 'verified', 'new', 'ordinary', 'empty']) {
        const gbpDraft = state === 'empty' ? null : { text: 'Test-only Google post. No publishing occurs.', posted: ['posted', 'verified'].includes(state), publicationSource: state === 'verified' ? 'google-api' : undefined, googlePostName: state === 'verified' ? 'accounts/test/locations/test/localPosts/test' : undefined, isNew: state === 'new', createdAt: '2026-09-04T12:00:00Z', postedAt: ['posted', 'verified'].includes(state) ? '2026-09-04T13:00:00Z' : null };
        responses.set(path, { json: { success: true, enabled: true, hasKey: true, gbpDraft, napExclusions: [] } });
        await load('tools/local', '?google-post-badge=' + state);
        await page.waitForFunction(() => typeof window.loadLocalAutopilot === 'function');
        await page.evaluate(() => window.loadLocalAutopilot());
        const title = page.locator('#la-gbp-title');
        const badge = page.locator('#la-gbp-badge .la-badge');
        if (['posted', 'verified', 'new'].includes(state)) {
          assert.equal(await badge.innerText(), state === 'posted' ? 'RECORDED MANUALLY' : state === 'verified' ? 'GOOGLE CONFIRMED' : 'NEW');
          if (state === 'posted') assert.match(await page.locator('#la-gbp-body').innerText(), /did not confirm this through the API/);
          const a = await title.boundingBox(), b = await badge.boundingBox();
          assert.ok(a && b);
          assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Status must not cover the title');
          await audit('google-post-' + state);
        } else assert.equal(await badge.count(), 0);
      }
    } finally {
      if (previous) responses.set(path, previous); else responses.delete(path);
    }
  });

  // Audit every preview route in light mode; core destinations also in dark.
  await page.evaluate(() => { if (document.body.classList.contains('dark')) document.getElementById('theme-toggle').click(); });
  await journey(`${prefix}: connection overview opens exact controls and distinguishes failed status reads`, async () => {
    const paths = ['/api/ai-engines', '/api/gbp-status', '/api/monthly-report', '/api/integration-health'];
    const prior = paths.map(path => [path, responses.get(path)]);
    const initialWrites = writes.length;
    try {
      responses.set('/api/ai-engines', { json: { success: true, engines: [{ id: 'google', configured: true }, { id: 'openai', configured: false }, { id: 'perplexity', configured: false }] } });
      responses.set('/api/gbp-status', { json: { configured: false, status: 'pending-approval', approval: { status: 'pending', caseId: '6-1234000012345', submittedAt: '2026-09-08' } } });
      responses.set('/api/monthly-report', { json: { success: true, ready: true, enabled: false } });
      responses.set('/api/integration-health', { json: { success: true, overview: {
        overall: 'healthy', alerts: [],
        systems: [
          { key: 'storage', label: 'Saved data', state: 'healthy', stateLabel: 'Persistent', detail: 'Saved work survives deployments.', lastSuccessAt: null },
          { key: 'backups', label: 'Daily backup', state: 'healthy', stateLabel: 'Verified', detail: 'The newest backup passed checksum verification.', lastSuccessAt: '2026-09-08T12:00:00.000Z', latestBackupId: '2026-09-08T12-00-00-000Z' },
        ],
        integrations: [{ key: 'gemini', label: 'Gemini', configured: true, optional: false, state: 'healthy', stateLabel: 'Working', detail: 'A successful request is recorded.', lastSuccessAt: '2026-09-08T12:00:00.000Z', credentialUpdatedAt: '2026-09-08T11:00:00.000Z' }],
      } } });
      await load('settings');
      await page.waitForFunction(() => document.getElementById('settings-connection-note').textContent.includes('checked just now'));
      assert.equal(await page.locator('.settings-connection-row').count(), 5);
      assert.match(await page.locator('#settings-connection-list').innerText(), /set up but paused/);
      assert.match(await page.locator('#settings-connection-list').innerText(), /Google reviewing/);
      assert.match(await page.locator('.settings-connection-row').first().innerText(), /Configured/);
      assert.match(await page.locator('#settings-health-badge').innerText(), /No current failures/);
      await page.locator('#settings-health-details > summary').click();
      assert.match(await page.locator('#settings-health-list').innerText(), /Daily backup/);
      assert.match(await page.locator('#settings-health-list').innerText(), /Live connection history/);
      await page.locator('.settings-provider-health > summary').click();
      assert.match(await page.locator('.settings-provider-health').innerText(), /Credential replaced/);
      await page.locator('[data-connection-key="gbp"]').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-gbp-access-status');
      assert.match(await page.locator('#settings-gbp-approval-note').innerText(), /case 6-1234000012345/);
      await page.locator('[data-connection-key="openai"]').click();
      assert.equal(await page.locator('#ws-connections').getAttribute('open'), '');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-openai-key');
      await page.locator('#settings-author-name').fill('Keep my unsaved author');
      responses.set('/api/ai-engines', { json: { success: true, engines: [{ id: 'google', configured: 'false' }] } });
      responses.set('/api/gbp-status', { status: 503, json: { error: 'test only' } });
      await page.locator('#settings-refresh-connections').click();
      await page.waitForFunction(() => document.getElementById('settings-connection-note').textContent.includes('unavailable'));
      assert.equal(await page.locator('.settings-connection-state').filter({ hasText: 'Unable to check' }).count(), 4);
      assert.equal(await page.locator('#settings-author-name').inputValue(), 'Keep my unsaved author');
      await audit('settings-connection-unavailable');
      responses.set('/api/ai-engines', { json: { engines: ['google', 'openai', 'perplexity'].map(id => ({ id, configured: true })) } });
      responses.set('/api/gbp-status', { json: { configured: true } });
      await page.locator('#settings-refresh-connections').click();
      await page.waitForFunction(() => document.getElementById('settings-connection-note').textContent.includes('checked just now'));
      await audit('settings-connection-overview');
      await page.locator('[data-connection-tab="performance-tab"]').click();
      await location('results/detail');
      assert.equal(writes.length, initialWrites);
    } finally {
      for (const [path, value] of prior) { if (value) responses.set(path, value); else responses.delete(path); }
    }
  });

  await journey(`${prefix}: Business reflects Google publishing configuration without treating a failure as disconnected`, async () => {
    const previous = responses.get('/api/gbp-status');
    try {
      for (const configured of [true, false, null]) {
        responses.set('/api/gbp-status', configured === null ? { status: 503, json: { error: 'test only' } } : { json: { configured } });
        await load('business');
        const text = configured === true ? 'Publishing configured' : configured === false ? 'Posts copied by hand' : 'Not verified';
        await page.waitForFunction(text => document.getElementById('ow-conn').textContent.includes(text), text);
        if (configured !== false) assert.doesNotMatch(await page.locator('#ow-conn').innerText(), /Posts copied by hand/);
      }
      await audit('business-google-status-unavailable');
    } finally { if (previous) responses.set('/api/gbp-status', previous); else responses.delete('/api/gbp-status'); }
  });

  await journey(`${prefix}: visual walkthrough visits and highlights real pages then restores unsaved settings`, async () => {
    await load('settings');
    await page.evaluate(() => localStorage.removeItem('seo_walkthrough_progress_v1'));
    await page.evaluate(() => window.updateSiteUrlBadge('sc-domain:bestdayfitness.com'));
    assert.equal(await page.locator('#display-site-url').innerText(), 'bestdayfitness.com');
    await page.locator('[data-connection-key="openai"]').click();
    const draft = page.locator('#settings-openai-key');
    await draft.fill('test-only-unsaved-walkthrough');
    const before = writes.length;
    const url = page.url();
    const historyLength = await page.evaluate(() => history.length);
    await page.locator('#ws-help summary').click();
    await open('#ws-start-walkthrough');
    assert.equal(await page.locator('#ws-walkthrough-back').isDisabled(), true);
    const titles = ['Today:', 'Your score:', 'Approvals:', 'Tools:', 'Results:', 'Business:', 'Connections:'];
    const slugs = ['today', 'today', 'approvals', 'tools', 'results', 'business', 'settings'];
    const targets = ['#ws-today .ws-briefing', '#ws-today .ws-score', '#ws-approvals > :first-child', '.ws-tool-search', '#ow-find-section', '#ow-basics', '#settings-connection-list > :first-child'];
    const ready = index => page.waitForFunction(target => {
      const dialog = document.getElementById('ws-walkthrough');
      return dialog.dataset.ready === 'true' && document.getElementById('ws-walkthrough-spotlight').dataset.target === target;
    }, targets[index]);
    const assertHighlight = async index => {
      await ready(index);
      assert.ok(page.url().endsWith('#/' + slugs[index]), 'Tour must visit the page it explains');
      // Read geometry in one frame; connection rows can be replaced by a late
      // status response between separate browser calls.
      await page.waitForFunction(selector => {
        const target = document.querySelector(selector)?.getBoundingClientRect();
        const light = document.getElementById('ws-walkthrough-spotlight').getBoundingClientRect();
        return target?.height > 24 && Math.abs(light.x - target.x) <= 8 && Math.abs(light.y - target.y) <= 8;
      }, targets[index]);
      const { target, light, card } = await page.evaluate(selector => ({
        target: document.querySelector(selector).getBoundingClientRect().toJSON(),
        light: document.getElementById('ws-walkthrough-spotlight').getBoundingClientRect().toJSON(),
        card: document.getElementById('ws-walkthrough-card').getBoundingClientRect().toJSON(),
      }), targets[index]);
      assert.ok(light.width > 60 && light.height > 30, 'A meaningful part of the real section must be visible: ' + JSON.stringify({ index, target, light, card }));
      assert.ok(Math.abs(light.x - target.x) <= 8 && Math.abs(light.y - target.y) <= 8, 'Spotlight must track the real section');
      assert.ok(light.x + light.width <= card.x || card.x + card.width <= light.x || light.y + light.height <= card.y || card.y + card.height <= light.y, 'Instructions must not cover the spotlight');
    };
    for (let index = 0; index < titles.length; index++) {
      await assertHighlight(index);
      assert.ok((await page.locator('#ws-walkthrough-title').innerText()).startsWith(titles[index]));
      assert.match(await page.locator('#ws-walkthrough-step').innerText(), new RegExp(`Step ${index + 1} of 7`));
      assert.equal(await page.locator('#ws-walkthrough-title').evaluate(el => el === document.activeElement), true);
      await audit('walkthrough-step-' + (index + 1));
      if (index === 1) {
        await open('#ws-walkthrough-back');
        await ready(0);
        assert.match(await page.locator('#ws-walkthrough-title').innerText(), /^Today:/);
        await open('#ws-walkthrough-next');
        await ready(1);
      }
      await open('#ws-walkthrough-next');
    }
    assert.equal(await page.locator('#ws-walkthrough').isVisible(), false);
    assert.equal(page.url(), url);
    assert.equal(await draft.inputValue(), 'test-only-unsaved-walkthrough');
    assert.equal(writes.length, before);
    assert.equal(await page.evaluate(() => history.length), historyLength, 'Tour must not add Back-button history entries');
    await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-help summary'));
    await page.locator('#ws-help summary').click();
    assert.equal(await page.locator('#ws-start-walkthrough').innerText(), 'Take the walkthrough again');
    await page.locator('#ws-help summary').click();
    // Restart begins at the beginning; Escape and Skip both restore focus.
    for (const escape of [true, false]) {
      await page.locator('#ws-help summary').click();
      await open('#ws-start-walkthrough');
      await ready(0);
      assert.match(await page.locator('#ws-walkthrough-title').innerText(), /^Today:/);
      await page.locator('#ws-walkthrough-next').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#ws-walkthrough').evaluate(el => el.contains(document.activeElement)), true, 'Tab must stay inside the modal');
      if (escape) await page.keyboard.press('Escape'); else await open('#ws-walkthrough-skip');
      await page.waitForFunction(() => !document.getElementById('ws-walkthrough').open);
      await page.waitForFunction(() => document.activeElement === document.querySelector('#ws-help summary'));
    }
    await page.locator('#ws-help summary').click();
    await open('#ws-start-walkthrough');
    await ready(0);
    await open('#ws-walkthrough-next');
    await ready(1);
    await open('#ws-walkthrough-skip');
    await page.locator('#ws-help summary').click();
    assert.match(await page.locator('#ws-start-walkthrough').innerText(), /Continue walkthrough.*step 2 of 7/);
    await open('#ws-start-walkthrough');
    await ready(1);
    await open('#ws-walkthrough-skip');
    await page.evaluate(() => localStorage.removeItem('seo_walkthrough_progress_v1'));
    await draft.fill('');
  });

  await journey(`${prefix}: visual walkthrough adapts to narrow screens and browser Back cancels it`, async () => {
    await load('today');
    await open('#ws-nav-tools');
    const viewport = page.viewportSize();
    await page.evaluate(() => window.SeoBuddyWorkspace.openWalkthrough());
    try {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForFunction(() => document.getElementById('ws-walkthrough').dataset.ready === 'true');
      await audit('walkthrough-narrow');
      const card = await page.locator('#ws-walkthrough-card').boundingBox();
      const light = await page.locator('#ws-walkthrough-spotlight').boundingBox();
      assert.ok(card.y + card.height <= 568 && card.x + card.width <= 320);
      assert.ok(light.y + light.height < card.y, 'Mobile instructions must leave the page visible above');
      await page.goBack();
      await page.waitForFunction(() => !document.getElementById('ws-walkthrough').open);
      await location('today');
    } finally {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.getElementById('ws-walkthrough').close());
    }
  });

  await journey(`${prefix}: walkthrough explains missing sections and follows late content without blocking navigation`, async () => {
    await page.evaluate(() => localStorage.removeItem('seo_walkthrough_progress_v1'));
    await load('today');
    await page.waitForSelector('#ws-today .ws-score');
    await page.evaluate(() => window.SeoBuddyWorkspace.openWalkthrough());
    await page.waitForFunction(() => document.getElementById('ws-walkthrough').dataset.ready === 'true');
    await open('#ws-walkthrough-next');
    await page.waitForFunction(() => document.getElementById('ws-walkthrough-spotlight').dataset.target === '#ws-today .ws-score');
    await page.evaluate(() => {
      window.__tourTestScore = document.querySelector('#ws-today .ws-score');
      window.__tourTestScore.remove();
    });
    await page.waitForFunction(() => document.getElementById('ws-walkthrough-spotlight').dataset.target === '#page-title');
    assert.match(await page.locator('#ws-walkthrough-status').innerText(), /loading or unavailable/);
    await audit('walkthrough-missing-section');
    await page.evaluate(() => {
      document.querySelector('#ws-today .ws-progress').prepend(window.__tourTestScore);
      delete window.__tourTestScore;
    });
    await page.waitForFunction(() => document.getElementById('ws-walkthrough-spotlight').dataset.target === '#ws-today .ws-score');
    assert.equal(await page.locator('#ws-walkthrough-status').innerText(), '');
    await open('#ws-walkthrough-skip');
    await page.waitForFunction(() => !document.getElementById('ws-walkthrough').open);
  });

  await journey(`${prefix}: assistant opens the real walkthrough locally and from an offered action`, async () => {
    await page.evaluate(() => localStorage.removeItem('seo_walkthrough_progress_v1'));
    await load('today');
    const before = writes.length;
    await open('#asst-fab');
    assert.doesNotMatch(await page.locator('#asst-msgs').innerText(), /I can see everything/);
    await page.locator('.asst-chip[data-tour]').click();
    await page.locator('#ws-walkthrough').waitFor({ state: 'visible' });
    assert.equal(writes.length, before, 'The help chip must work without an AI request or key');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ws-walkthrough').open);
    assert.equal(await page.locator('#asst-fab').evaluate(el => el === document.activeElement), true);
    const previous = responses.get('/api/assistant');
    try {
      responses.set('/api/assistant', { json: { success: true, reply: 'Start the read-only walkthrough.', action: { kind: 'help', clientAction: 'walkthrough', title: 'Get to know SEO Buddy', confirmLabel: 'Start walkthrough' } } });
      await open('#asst-fab');
      await page.locator('#asst-text').fill('Is there a walkthrough?');
      await open('#asst-send');
      await page.locator('.asst-action [data-act="go"]').last().click();
      await page.locator('#ws-walkthrough').waitFor({ state: 'visible' });
      assert.equal(writes.length, before + 1, 'Opening a proposed tour must not call an action endpoint');
      await open('#ws-walkthrough-skip');
    } finally { if (previous) responses.set('/api/assistant', previous); else responses.delete('/api/assistant'); }
  });

  const routes = await page.evaluate(() => Object.keys(window.SeoBuddyWorkspace.routes));
  for (const id of routes) {
    await page.evaluate(id => window.switchTab(id), id);
    assert.equal(await page.locator('#ws-classic').count(), 0);
    await audit('preview-' + id);
  }
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  await page.evaluate(() => window.SeoBuddyWorkspace.openWalkthrough());
  await audit('walkthrough-dark');
  await open('#ws-walkthrough-skip');
  for (const id of ['workspace-today-tab', 'approvals-tab', 'owner-results-tab', 'explore-tab', 'owner-business-tab', 'settings-tab']) {
    await page.evaluate(id => window.switchTab(id), id);
    assert.equal(await page.locator('#ws-classic').count(), 0);
    await audit('preview-dark-' + id);
  }
};
