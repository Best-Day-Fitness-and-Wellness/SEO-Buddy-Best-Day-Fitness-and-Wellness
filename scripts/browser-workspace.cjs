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
  ].map(([key, title, status, label, tab]) => ({ key, title, status, label, tab, reason: 'Test-only recorded status. No publication is being claimed.', lastRecordedAt: '2026-09-01T12:00:00Z', nextRunAt: null }));
  responses.set('/api/next-moves', { json: moves });
  responses.set('/api/automation-status', { json: { success: true, checkedAt: '2026-09-02T12:00:00Z', features } });
  const open = async id => { await page.locator(id).click(); };
  const location = slug => page.waitForFunction(slug => location.hash === '#/' + slug, slug);
  const load = async slug => {
    await page.goto(base + '?workspace=preview#/' + slug);
    await page.waitForFunction(() => !!window.SeoBuddyWorkspace);
    await location(slug);
    await page.addScriptTag({ url: base + '/__acceptance__/axe.js' });
  };
  const tool = async (term, tab) => {
    await open('#ws-nav-tools');
    await page.locator('#ws-tool-search').fill(term);
    await page.locator(`.exp-row[data-go="tab:${tab}"]`).click();
  };

  await journey(`${prefix}: preview has four persistent destinations and bounded status evidence`, async () => {
    await load('today');
    await page.waitForFunction(() => document.querySelectorAll('.ws-automation').length === 6);
    assert.equal(await page.locator('#workspace-nav .nav-item:visible').count(), 4);
    assert.equal(await page.locator('#btn-mode-switch').isVisible(), false);
    assert.equal(await page.locator('.nav-menu:not(#workspace-nav):visible').count(), 0);
    assert.match(await page.locator('#ws-today').innerText(), /There are things to review/);
    assert.equal(await page.locator('.ws-automation details[open]').count(), 0);
    assert.equal(await page.locator('.ws-overview .btn-primary').count(), 1, 'Briefing must have one clear primary action');
    assert.equal(await page.locator('.ws-overview .sb-editorial-art[aria-hidden="true"]').count(), 1);
    const listBounds = await page.locator('.ws-automations').boundingBox();
    assert.ok(listBounds.height <= 430, 'Six collapsed automation rows must stay compact');
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

  await journey(`${prefix}: polished layout stays readable at narrow widths and keyboard-operable`, async () => {
    await open('#ws-nav-today');
    await page.waitForFunction(() => document.querySelectorAll('.ws-automation').length === 6 && !document.getElementById('ws-today').hasAttribute('aria-busy'));
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
    await page.locator('[data-ws-tab="settings-tab"]').last().click();
    await location('settings');
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

  // Audit every preview route in light mode; core destinations also in dark.
  await page.evaluate(() => { if (document.body.classList.contains('dark')) document.getElementById('theme-toggle').click(); });
  const routes = await page.evaluate(() => Object.keys(window.SeoBuddyWorkspace.routes));
  for (const id of routes) { await page.evaluate(id => window.switchTab(id), id); await audit('preview-' + id); }
  await page.evaluate(() => document.getElementById('theme-toggle').click());
  for (const id of ['workspace-today-tab', 'approvals-tab', 'owner-results-tab', 'explore-tab', 'owner-business-tab', 'settings-tab']) {
    await page.evaluate(id => window.switchTab(id), id); await audit('preview-dark-' + id);
  }
};
