'use strict';

(function exposeWorkspace(global) {
  const { uiEsc: esc, authFetch, confirmAction, showToast } = global.SeoBuddyCore;
  const ROUTES = Object.freeze({
    'workspace-today-tab': ['today', 'Today', 'today'],
    'approvals-tab': ['approvals', 'Approvals', 'approvals'],
    'owner-results-tab': ['results', 'Results', 'results'],
    'explore-tab': ['tools', 'Tools', 'tools'],
    'owner-business-tab': ['business', 'Business', 'business'],
    'settings-tab': ['settings', 'Settings', 'settings'],
    'gsc-tab': ['tools/search', 'Search opportunities', 'tools'],
    'ai-tab': ['tools/content/draft', 'Content · draft and review', 'tools'],
    'publish-tab': ['tools/content/publish', 'Content · publish and verify', 'tools'],
    'performance-tab': ['results/detail', 'Detailed results', 'results'],
    'brand-tab': ['business/voice', 'Brand voice', 'business'],
    'aio-tab': ['tools/ai-visibility', 'AI visibility', 'tools'],
    'citations-tab': ['tools/directories', 'Directory listings', 'tools'],
    'local-tab': ['tools/local', 'Local presence', 'tools'],
    'onsite-tab': ['tools/website', 'Website improvements', 'tools'],
    'reviews-tab': ['tools/reviews', 'Reviews', 'tools'],
    'summary-tab': ['results/dashboard', 'Advanced dashboard', 'results'],
    'grow-tab': ['tools/actions', 'All recommended actions', 'tools'],
  });
  const aliases = { 'today-tab': 'workspace-today-tab', 'owner-today-tab': 'workspace-today-tab' };
  const PARENTS = { tools: 'explore-tab', results: 'owner-results-tab', business: 'owner-business-tab' };
  const SEARCH_TERMS = Object.freeze({
    'performance-tab': 'report reports pdf download email monthly weekly digest delivery progress results',
    'ai-tab': 'write create draft article blog post recording',
    'local-tab': 'google business profile gbp post write reply review address phone nap listings',
    'publish-tab': 'publish article blog autopilot automation schedule indexing',
    'gsc-tab': 'google search keywords rankings traffic opportunities',
    'citations-tab': 'directories directory citations listings sources',
    'settings-tab': 'connections connect credentials account password api key',
  });
  const searchWords = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(word => word && !['a', 'an', 'the', 'to', 'my', 'our', 'your', 'for', 'and', 'i', 'want', 'need', 'please'].includes(word));
  // Keep contextual setup links consistent in both the briefing and status rows.
  const needsConnections = feature => feature.status === 'needs-setup' && !['digest', 'monthly-report'].includes(feature.key);
  const featureNavigation = feature => needsConnections(feature) ? 'data-settings-section="connections"' : `data-ws-tab="${esc(feature.tab)}"`;
  let renderTab, current = null, depth = 0, todayRequest = 0, approvalsRequest = 0;
  const $ = id => document.getElementById(id);
  const pendingDraft = () => { const draft = global.SeoBuddyContent?.getDraftSummary?.(); return draft?.title && draft.publicationStatus !== 'published' ? draft : null; };
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded';
  const ICONS = {
    today: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    approvals: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
    results: '<path d="M4 4v16h16M8 15v-4m5 4V7m5 8V4"/>',
    tools: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    content: '<path d="M14 3H5v18h14V8Z M14 3v5h5M8 12h8M8 16h6"/>',
    ai: '<path d="M12 3 9 9l-6 3 6 3 3 6 3-6 6-3-6-3Z"/>',
    local: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    citations: '<path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"/>',
    onsite: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6h.1M10 6h.1m-2 7-2 2 2 2m8-4 2 2-2 2"/>',
  };
  const icon = key => `<svg class="ws-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[key] || ICONS.results}</svg>`;
  const art = key => `<div class="ws-art" aria-hidden="true">${global.SeoBuddyArtwork.render(key, true)}</div>`;
  const button = (tab, label) => `<button type="button" class="btn btn-secondary" data-ws-tab="${esc(tab)}">${esc(label)}</button>`;
  const errorBox = (label, retry) => `<div class="ow-note warn" role="alert"><b>${esc(label)}</b><p>This is a missing check, not an all-clear. No changes were made.</p><button class="btn btn-secondary" type="button" data-ws-retry="${retry}">Try again</button></div>`;

  async function read(path, field) {
    const response = await fetch(path, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load ' + path);
    const data = await response.json();
    if (!data || data.success === false || (field && !Array.isArray(data[field]))) throw new Error('Invalid response');
    if (field && data[field].some(item => !item || typeof item !== 'object')) throw new Error('Invalid entries');
    if (field === 'features') {
      const keys = new Set(data.features.map(item => item.key));
      if (!data.features.length || keys.size !== data.features.length || data.features.some(item => !item.key || !ROUTES[item.tab] || !item.label)) {
        throw new Error('Incomplete status checks');
      }
    }
    return data;
  }

  function tabFromHash() {
    return Object.keys(ROUTES).find(tab => '#/' + ROUTES[tab][0] === global.location.hash) || 'workspace-today-tab';
  }

  function navigate(requested, options = {}) {
    const tab = aliases[requested] || requested;
    if (!ROUTES[tab] || !document.getElementById(tab)) return false;
    if (!options.tour && walkthroughDialog?.open) {
      walkthroughOrigin = null;
      walkthroughDialog.close();
    }
    const replay = options.replay === true;
    const moveFocus = current !== null;
    if (!options.tour && !replay && current) {
      history.replaceState({ ...history.state, seoWorkspace: { tab: current, depth, scroll: global.scrollY } }, '', global.location.href);
    }
    if (options.tour) {
      history.replaceState(history.state, '', global.location.pathname + global.location.search + '#/' + ROUTES[tab][0]);
    } else if (!replay && tab !== current) {
      depth = current ? depth + 1 : 0;
      const state = { ...history.state, seoWorkspace: { tab, depth, scroll: 0 } };
      const url = global.location.pathname + global.location.search + '#/' + ROUTES[tab][0];
      if (current) history.pushState(state, '', url);
      else history.replaceState(state, '', url);
    } else if (replay) depth = history.state?.seoWorkspace?.depth || 0;
    current = tab;
    renderTab(tab, { render: true });
    document.body.classList.remove('nav-open', 'owner-mode');
    const [slug, title, group] = ROUTES[tab];
    document.title = title + ' · SEO Buddy';
    $('page-title').textContent = title;
    if (tab === 'explore-tab') $('page-subtitle').textContent = 'Find the tool you need. Everyday decisions live in Today and Approvals.';
    if (tab === 'performance-tab') $('page-subtitle').textContent = 'Download your report, manage email delivery, and inspect search trends and leads.';
    document.querySelectorAll('#workspace-nav .nav-item, #ws-nav-business, #nav-settings').forEach(item => {
      const target = ROUTES[item.dataset.tab];
      const active = target && target[2] === group;
      item.classList.toggle('active', !!active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    const parent = slug.includes('/') && PARENTS[group];
    $('ws-location').innerHTML = parent
      ? `<button type="button" class="ws-parent" data-ws-tab="${parent}">${esc(ROUTES[parent][1])}</button><span aria-hidden="true">/</span><span aria-current="page">${esc(title)}</span>`
      : `<span aria-current="page">${esc(title)}</span>`;
    $('ws-back').hidden = tab === 'workspace-today-tab' && depth === 0;
    updateJourney();
    const previousFocus = document.activeElement;
    requestAnimationFrame(() => {
      if (current !== tab || options.tour) return;
      global.scrollTo({ top: replay ? history.state?.seoWorkspace?.scroll || 0 : 0, behavior: 'instant' });
      // Let the browser own focus on initial load/reload. Move it to the heading
      // only for in-app navigation, without interrupting a quick keyboard user.
      if (moveFocus && (document.activeElement === previousFocus || document.activeElement === document.body)) $('page-title').focus({ preventScroll: true });
    });
    return true;
  }

  function updateJourney() {
    const host = $('ws-journey');
    const visible = ['gsc-tab', 'ai-tab', 'publish-tab'].includes(current);
    host.hidden = !visible;
    if (!visible) return;
    const draft = global.SeoBuddyContent?.getDraftSummary?.();
    const steps = [['gsc-tab', '1. Find an opportunity'], ['ai-tab', '2. Draft & review'], ['publish-tab', '3. Publish & verify'], ['owner-results-tab', '4. See results']];
    host.innerHTML = `<div class="ws-workflow-head"><b>Content workspace</b><span>${draft?.title ? esc(draft.title) : 'Start from a search opportunity or your own idea'}</span></div>
      <nav aria-label="Content workflow">${steps.map(([tab, label]) => `<button type="button" class="btn ${tab === current ? 'btn-primary' : 'btn-secondary'}" data-ws-tab="${tab}"${tab === current ? ' aria-current="step"' : ''}>${label}</button>`).join('')}</nav>
      <p class="text-muted">${esc(draft?.indexRequested ? 'Indexing requested. Google decides whether and when to include the page.' : draft?.publicationStatus === 'simulated' ? 'Demo publication only. No live website change was confirmed.' : draft?.publicationStatus === 'published' ? 'Publication confirmed. Indexing and business results are separate checks.' : draft?.publicationStatus ? 'Saved as a website draft. It is not live yet.' : draft?.title ? 'Draft kept in this browser tab. Review the claims before publishing; reloads do not save this draft.' : 'No draft in this browser tab yet.')}</p>`;
  }

  function statusCard(feature) {
    const reason = feature.reason || 'Open the tool for details.';
    return `<article class="ws-automation"><details><summary><span class="ws-row-icon">${icon(feature.key)}</span><span class="ws-row-title">${esc(feature.title)}</span><span class="ws-status ${esc(feature.status)}">${esc(feature.label)}</span><span class="ws-chevron" aria-hidden="true">›</span></summary>
      <div class="ws-evidence"><h3>Evidence &amp; controls</h3><p>${esc(reason)}</p><dl><dt>Last recorded activity</dt><dd>${esc(date(feature.lastRecordedAt))}</dd>
      <dt>${feature.nextRunEstimated ? 'Next eligible check (estimated)' : 'Next scheduled check'}</dt><dd>${feature.nextRunAt ? esc(date(feature.nextRunAt)) : 'Not confirmed'}</dd></dl>
      <button type="button" class="btn btn-secondary" ${featureNavigation(feature)}>${feature.status === 'needs-setup' ? (needsConnections(feature) ? 'Review connections' : 'Review report setup') : 'View details'}</button></div></details></article>`;
  }

  async function loadToday() {
    const request = ++todayRequest;
    $('ws-today').setAttribute('aria-busy', 'true');
    const data = await Promise.allSettled([read('/api/next-moves', 'moves'), read('/api/automation-status', 'features'), global.SeoBuddyCore.readHealthScore(), read('/api/autopilot-digest', 'items')]);
    if (request !== todayRequest) return;
    const [movesResult, automationResult, scoreResult, activityResult] = data;
    const moves = movesResult.status === 'fulfilled' ? movesResult.value.moves : null;
    const automation = automationResult.status === 'fulfilled' ? automationResult.value : null;
    const score = scoreResult.status === 'fulfilled' && Number.isInteger(scoreResult.value.overall) ? scoreResult.value : null;
    const features = automation?.features || [];
    const attention = features.filter(item => ['failed', 'needs-setup', 'unknown'].includes(item.status));
    const decisions = moves?.filter(move => move.capability !== 'blocked') || [];
    const decisionCount = decisions.length + (pendingDraft() ? 1 : 0);
    const verified = moves && automation && score;
    const headline = !verified ? 'Some checks are unavailable' : attention.length ? 'There are things to review' : decisionCount ? `${decisionCount} decision${decisionCount === 1 ? ' needs' : 's need'} you` : 'No decisions are waiting';
    $('ws-approval-count').textContent = moves ? (decisionCount || '') : '?';
    const priority = !verified ? '<button type="button" class="btn btn-primary" data-ws-retry="today">Retry checks <span aria-hidden="true">↗</span></button>'
      : decisionCount ? `<button type="button" class="btn btn-primary" data-ws-tab="approvals-tab">Review ${decisionCount} decision${decisionCount === 1 ? '' : 's'} <span aria-hidden="true">↗</span></button>`
      : attention.length ? `<button type="button" class="btn btn-primary" ${featureNavigation(attention[0])}>Review flagged area <span aria-hidden="true">↗</span></button>`
      : '<button type="button" class="btn btn-primary" data-ws-tab="owner-results-tab">Explore your results <span aria-hidden="true">↗</span></button>';
    $('ws-today').innerHTML = `<div class="ws-overview"><div class="ws-briefing"><span class="ws-eyebrow"><span class="ws-eyebrow-line" aria-hidden="true"></span>Your daily briefing</span><h2>${headline}</h2>
      <p>${!verified ? 'Some checks did not load. Retry before relying on the status below.' : decisionCount ? 'Your next step is ready. Review what needs a decision, then see what is scheduled below.' : attention.length ? 'A recent check needs attention. Open the flagged area to see the evidence.' : 'Your decision list is clear. Review the latest evidence and see how your results are moving.'}</p>
      ${priority}</div>${art('autopilot')}</div>
      ${!moves ? errorBox('Could not check your decisions', 'today') : ''}
      ${!automation ? errorBox('Could not verify automations', 'today') : ''}
      ${!score ? errorBox('Could not load your score', 'today') : ''}
      <div class="ws-dashboard"><section class="ws-operations" aria-label="Automation status"><div class="ws-section-heading"><div><h2>What happens next</h2><span>${automation ? 'Checked ' + esc(date(automation.checkedAt)) : 'Status unverified'}</span></div><button type="button" class="btn btn-secondary" data-ws-retry="today">Refresh checks</button></div>
      <div class="ws-automations">${features.map(statusCard).join('')}</div><p class="ws-footnote">Open a row for evidence and controls. Scheduled does not mean completed.</p></section>
      <aside class="ws-progress" aria-label="Score and activity"><div class="ws-score"><span class="ws-eyebrow">Your progress</span><div class="ws-score-reading"><div class="ws-score-ring" style="--ws-score:${Math.max(0, Math.min(100, score?.overall || 0))}"><div><strong>${score?.overall ?? '—'}</strong><small>/ 100</small></div></div><div><h2>Optimization score</h2><p>Measured SEO signals.<br>Not a ranking guarantee.</p></div></div>${button('owner-results-tab', 'See measured results')}</div>
      <details class="ws-details"><summary>Recent recorded work — drafts and completed actions</summary>${activityResult.status === 'fulfilled'
        ? `<p class="text-muted">These records can be older than this week. A draft or suggestion is not a published change.</p>${activityResult.value.items.map(item => `<div class="ws-activity"><div><b>${esc(item.label)}</b><p>${esc(item.text)}</p></div>${button(item.tab, 'Inspect record')}</div>`).join('') || '<p>No activity records were returned.</p>'}`
        : errorBox('Could not load activity records', 'today')}</details></aside></div>`;
    $('ws-today').removeAttribute('aria-busy');
  }

  async function loadApprovals() {
    const request = ++approvalsRequest;
    $('ws-approvals').setAttribute('aria-busy', 'true');
    try {
      const data = await read('/api/next-moves', 'moves');
      if (request !== approvalsRequest) return;
      const decisions = data.moves.filter(move => move.capability !== 'blocked');
      const blockers = data.moves.filter(move => move.capability === 'blocked');
      const draft = pendingDraft();
      $('ws-approval-count').textContent = (decisions.length + (draft ? 1 : 0)) || '';
      $('ws-approvals').innerHTML = `${draft ? `<article class="ws-decision"><span class="ws-status needs-approval">Needs approval</span><h2>${esc(draft.title)}</h2><p>Your current browser-tab draft is ready for review. This version has not been published.</p>${button('ai-tab', 'Review article')}</article>` : ''}
        ${decisions.length ? decisions.map(move => `<article class="ws-decision"><span class="ws-status needs-approval">${move.capability === 'manual' ? 'Action needed' : 'Needs approval'}</span>
          <h2>${esc(move.title)}</h2><p>${esc(move.why)}</p><p class="text-muted">${esc(move.realEffort || move.effort || '')}</p>
          ${move.key === 'autopilot' ? '<button class="btn btn-primary" type="button" data-ws-enable-content>Review permission</button>' : button(move.tab, move.key === 'gbp' ? 'Review prepared Google post' : 'Review & continue')}</article>`).join('') : '<div class="ow-note"><b>No server-side decisions are waiting.</b><p>This is not a statement that all automations are healthy. Today shows their current status.</p></div>'}
        ${blockers.length ? '<h2>Setup needed</h2>' + blockers.map(move => `<article class="ws-decision"><h3>${esc(move.title)}</h3><p>${esc(move.why)}</p>${button(move.tab, 'Review setup')}</article>`).join('') : ''}`;
    } catch (_) {
      if (request !== approvalsRequest) return;
      $('ws-approval-count').textContent = '?';
      $('ws-approvals').innerHTML = errorBox('Could not check approvals', 'approvals');
    } finally { if (request === approvalsRequest) $('ws-approvals').removeAttribute('aria-busy'); }
  }

  function enhanceTools() {
    const host = $('exp-groups');
    if (!host) return;
    // Advanced reports stay available, but do not compete with daily actions.
    const advanced = Array.from(host.querySelectorAll('.exp-group')).find(group => group.querySelector('.exp-gl')?.textContent === 'More detail');
    if (advanced) {
      const details = document.createElement('details'); details.className = 'ws-details';
      const summary = document.createElement('summary'); summary.textContent = 'Advanced reports and all actions';
      advanced.before(details); details.append(summary, advanced);
      host.append(details);
    }
    filterTools();
  }

  // Search can reveal advanced matches temporarily without changing the owner's layout.
  const toolSearchExpansion = new WeakMap();
  function filterTools() {
    const query = $('ws-tool-search').value.trim().toLowerCase();
    const words = searchWords(query);
    $('ws-tool-clear').hidden = !query;
    let count = 0;
    document.querySelectorAll('#exp-groups .exp-group').forEach(group => {
      let shown = 0;
      group.querySelectorAll('.exp-row').forEach(row => {
        const tab = (row.dataset.go || '').replace('tab:', '');
        const text = searchWords(`${row.textContent} ${ROUTES[tab]?.[1] || ''} ${SEARCH_TERMS[tab] || ''}`).join(' ');
        row.hidden = !words.every(word => text.includes(word));
        if (!row.hidden) { count++; shown++; }
      });
      group.hidden = shown === 0;
      if (group.parentElement.matches('details')) {
        const details = group.parentElement;
        details.hidden = shown === 0;
        if (query) {
          if (!toolSearchExpansion.has(details)) toolSearchExpansion.set(details, details.open);
          if (shown) details.open = true;
        } else if (toolSearchExpansion.has(details)) {
          details.open = toolSearchExpansion.get(details);
          toolSearchExpansion.delete(details);
        }
      }
    });
    $('ws-tool-count').textContent = count ? `${count} destination${count === 1 ? '' : 's'} available` : 'No matching tools. Try “post”, “reviews”, “search”, or “listings”.';
  }

  function clearToolSearch() {
    $('ws-tool-search').value = '';
    filterTools();
    $('ws-tool-search').focus();
  }

  // Visit real read-only pages, without clicking their business-action controls.
  // Tour navigation replaces one history entry and restores it when dismissed.
  const WALKTHROUGH = Object.freeze([
    { title: 'Today: start here', tab: 'workspace-today-tab', target: '#ws-today .ws-briefing', where: 'Today · Your daily briefing',
      text: 'This is your daily briefing. It points to decisions or checks that need your attention.',
      takeaway: 'Below it, “What happens next” shows automation status. Scheduled means planned—not completed.' },
    { title: 'Your score: what it means', tab: 'workspace-today-tab', target: '#ws-today .ws-score', where: 'Today · Your progress',
      text: 'This is your current optimization score, based on measured SEO signals. Missing measurements should stay explicit.',
      takeaway: 'This is not your position on Google. Use “See measured results” to look beyond the score.' },
    { title: 'Approvals: your decisions', tab: 'approvals-tab', target: '#ws-approvals > :first-child', where: 'Approvals · Review before acting',
      text: 'Review the decisions or setup needs shown here. If the list is empty, there is nothing here to approve.',
      takeaway: 'A draft is not live. Read each permission: enabling autopilot can authorize ongoing publishing.' },
    { title: 'Results: see the evidence', tab: 'owner-results-tab', target: '#ow-find-section', where: 'Results · People finding you',
      text: 'These measurements show how people find you. Check the dates and compare matching periods; unavailable data is not zero.',
      takeaway: 'The “Open reports & email” button at the top of this page opens downloads and monthly delivery controls.' },
    { title: 'Connections: what is ready', tab: 'settings-tab', target: '#settings-connection-list > :first-child', where: 'Settings · Your connections',
      text: 'This is the first service in your connection list. Each row shows its setup status and where to manage it.',
      takeaway: 'Configured is not a successful live test. Optional providers can stay disconnected. Finish returns you to your starting page.' },
  ]);
  let walkthroughDialog, walkthroughStep = 0, walkthroughReturnFocus, releaseWalkthroughFocus;
  let walkthroughOrigin, walkthroughObserver, walkthroughResize, walkthroughTarget, walkthroughFrame = 0;

  function positionWalkthrough() {
    if (!walkthroughDialog?.open) return;
    cancelAnimationFrame(walkthroughFrame);
    walkthroughFrame = requestAnimationFrame(() => {
      if (!walkthroughDialog?.open) return;
      const moveFocus = walkthroughDialog.dataset.ready !== 'true';
      const step = WALKTHROUGH[walkthroughStep];
      const candidate = document.querySelector(step.target);
      const bounds = candidate?.getBoundingClientRect();
      const found = bounds?.width > 0 && bounds.height > 24 ? candidate : null;
      const target = found || $('page-title');
      const changed = walkthroughTarget !== target;
      walkthroughTarget = target;
      $('ws-walkthrough-status').textContent = found ? '' : 'This section is loading or unavailable. The page heading is highlighted; you can continue or skip.';
      $('ws-walkthrough-context').textContent = 'Highlighted page content: ' + target.textContent.trim().slice(0, 1200);
      if (changed) {
        walkthroughResize.disconnect();
        walkthroughResize.observe(target);
        walkthroughResize.observe($('ws-walkthrough-card'));
        global.scrollTo({ top: Math.max(0, global.scrollY + target.getBoundingClientRect().top - 32), behavior: 'instant' });
      }
      const panel = $('ws-walkthrough-card'), light = $('ws-walkthrough-spotlight');
      const width = document.documentElement.clientWidth, height = global.innerHeight;
      const mobile = width < 760;
      const rect = target.getBoundingClientRect();
      const panelWidth = Math.min(360, width - 24);
      panel.style.width = panelWidth + 'px';
      panel.style.maxHeight = (mobile ? Math.min(height * .48, height - 140) : height - 32) + 'px';
      const panelHeight = panel.getBoundingClientRect().height;
      let left = Math.max(12, Math.min(width - panelWidth - 12, rect.left));
      let top;
      const besideRight = !mobile && width - rect.right >= panelWidth + 32;
      const besideLeft = !mobile && rect.left >= panelWidth + 32;
      if (besideRight || besideLeft) {
        left = besideRight ? rect.right + 20 : rect.left - panelWidth - 20;
        top = Math.max(16, Math.min(rect.top, height - panelHeight - 16));
      } else {
        top = height - panelHeight - 12;
        // Keep the actual target above the guide, even after a resize or a late
        // response changes its position. A tall section is spotlighted in part.
        if (rect.top > top - 90 || rect.top < 16) {
          global.scrollTo({ top: Math.max(0, global.scrollY + rect.top - 32), behavior: 'instant' });
        }
        if (mobile) left = (width - panelWidth) / 2;
      }
      panel.style.left = left + 'px'; panel.style.top = top + 'px';
      const actual = target.getBoundingClientRect();
      const x = Math.max(8, actual.left - 6), y = Math.max(8, actual.top - 6);
      const bottom = Math.min(actual.bottom + 6, besideRight || besideLeft ? height - 8 : top - 14);
      Object.assign(light.style, { left: x + 'px', top: y + 'px', width: Math.max(0, Math.min(width - 8, actual.right + 6) - x) + 'px', height: Math.max(0, bottom - y) + 'px' });
      light.dataset.target = found ? step.target : '#page-title';
      walkthroughDialog.dataset.ready = 'true';
      if (moveFocus) $('ws-walkthrough-title').focus({ preventScroll: true });
    });
  }

  function renderWalkthrough() {
    walkthroughDialog.dataset.ready = 'false';
    walkthroughObserver?.disconnect();
    walkthroughTarget = null;
    const step = WALKTHROUGH[walkthroughStep];
    if (current !== step.tab) navigate(step.tab, { tour: true });
    $('ws-walkthrough-step').textContent = `Step ${walkthroughStep + 1} of ${WALKTHROUGH.length} · About 2 minutes`;
    $('ws-walkthrough-progress').value = walkthroughStep + 1;
    $('ws-walkthrough-title').textContent = step.title;
    $('ws-walkthrough-where').textContent = step.where;
    $('ws-walkthrough-text').textContent = step.text;
    $('ws-walkthrough-takeaway').textContent = step.takeaway;
    $('ws-walkthrough-back').disabled = walkthroughStep === 0;
    $('ws-walkthrough-next').textContent = walkthroughStep === WALKTHROUGH.length - 1 ? 'Finish' : 'Next →';
    $('ws-walkthrough-title').focus({ preventScroll: true });
    $('ws-walkthrough-card').scrollTop = 0;
    walkthroughObserver.observe($(step.tab), { childList: true, subtree: true, characterData: true });
    positionWalkthrough();
  }

  function openWalkthrough() {
    if (!walkthroughDialog || walkthroughDialog.open) return false;
    // A button inside a closed <details> can still report layout rectangles.
    // Remember its visible summary instead of trying to focus hidden content.
    walkthroughReturnFocus = $('ws-help').contains(document.activeElement)
      ? $('ws-help').querySelector('summary') : document.activeElement;
    $('ws-help').open = false;
    walkthroughOrigin = { tab: current, state: history.state, url: global.location.href, scroll: global.scrollY };
    walkthroughStep = 0;
    walkthroughDialog.showModal();
    document.body.classList.add('ws-walkthrough-open');
    releaseWalkthroughFocus = global.SeoBuddyCore.trapDialogFocus($('ws-walkthrough-card'), () => walkthroughDialog.close());
    renderWalkthrough();
    return true;
  }

  function setupWalkthrough() {
    $('ws-orientation').insertAdjacentHTML('beforeend', `<details id="ws-help" class="ws-help"><summary>Help</summary><div class="ws-help-menu"><p>New to SEO Buddy?</p><button type="button" class="btn btn-secondary" id="ws-start-walkthrough">Walkthrough — start here</button></div></details>`);
    walkthroughDialog = document.createElement('dialog');
    walkthroughDialog.id = 'ws-walkthrough';
    walkthroughDialog.className = 'ws-walkthrough';
    walkthroughDialog.setAttribute('aria-labelledby', 'ws-walkthrough-title');
    walkthroughDialog.setAttribute('aria-describedby', 'ws-walkthrough-text ws-walkthrough-context');
    walkthroughDialog.innerHTML = `<div id="ws-walkthrough-spotlight" aria-hidden="true"></div><section id="ws-walkthrough-card"><div class="ws-walkthrough-top"><span id="ws-walkthrough-step"></span><button type="button" class="btn btn-secondary" id="ws-walkthrough-skip">Skip tour</button></div>
      <progress id="ws-walkthrough-progress" max="5" value="1" aria-label="Walkthrough progress"></progress>
      <p class="ws-eyebrow" id="ws-walkthrough-where"></p>
      <h2 id="ws-walkthrough-title" tabindex="-1"></h2><p id="ws-walkthrough-text"></p>
      <p id="ws-walkthrough-takeaway" class="ws-walkthrough-note"></p><p id="ws-walkthrough-status" role="status"></p><span id="ws-walkthrough-context" class="sr-only"></span>
      <p class="ws-walkthrough-safe">View-only tour. No publishing or settings changes.</p>
      <div class="ws-walkthrough-actions"><button type="button" class="btn btn-secondary" id="ws-walkthrough-back">← Back</button><button type="button" class="btn btn-primary" id="ws-walkthrough-next">Next →</button></div></section>`;
    document.body.append(walkthroughDialog);
    walkthroughObserver = new MutationObserver(positionWalkthrough);
    walkthroughResize = new ResizeObserver(positionWalkthrough);
    global.addEventListener('resize', positionWalkthrough);
    global.addEventListener('scroll', positionWalkthrough, { passive: true });
    $('ws-start-walkthrough').addEventListener('click', openWalkthrough);
    $('ws-walkthrough-skip').addEventListener('click', () => walkthroughDialog.close());
    $('ws-walkthrough-back').addEventListener('click', () => { if (walkthroughStep > 0) { walkthroughStep--; renderWalkthrough(); } });
    $('ws-walkthrough-next').addEventListener('click', () => {
      if (walkthroughStep === WALKTHROUGH.length - 1) walkthroughDialog.close();
      else { walkthroughStep++; renderWalkthrough(); }
    });
    // Native modal inertness blocks background interaction; the shared focus
    // guard also stops Tab from leaving the last control for browser chrome.
    walkthroughDialog.addEventListener('close', () => {
      walkthroughObserver.disconnect();
      walkthroughResize.disconnect();
      cancelAnimationFrame(walkthroughFrame);
      releaseWalkthroughFocus?.();
      releaseWalkthroughFocus = null;
      document.body.classList.remove('ws-walkthrough-open');
      const origin = walkthroughOrigin;
      walkthroughOrigin = null;
      if (origin && current !== origin.tab) {
        navigate(origin.tab, { tour: true });
      }
      if (origin) {
        history.replaceState(origin.state, '', origin.url);
        global.scrollTo({ top: origin.scroll, behavior: 'instant' });
      }
      const target = walkthroughReturnFocus?.isConnected && walkthroughReturnFocus.getClientRects().length
        ? walkthroughReturnFocus : $('ws-help').querySelector('summary');
      target.focus({ preventScroll: true });
    });
  }

  function start(render) {
    renderTab = render;
    // Move, do not duplicate, the same four primary controls on phones.
    const primaryNav = $('workspace-nav'), sidebar = document.querySelector('.sidebar');
    primaryNav.querySelectorAll('.nav-item').forEach(item => item.insertAdjacentHTML('afterbegin', icon(ROUTES[item.dataset.tab][2])));
    const assistant = $('asst-fab'), assistantDock = assistant.parentElement;
    const mobile = global.matchMedia('(max-width: 860px)');
    const positionNav = () => {
      if (mobile.matches) {
        document.body.append(primaryNav);
        document.querySelector('.header-actions').append(assistant);
      } else {
        sidebar.querySelector('.biz-chip').after(primaryNav);
        assistantDock.append(assistant);
      }
    };
    positionNav(); mobile.addEventListener('change', positionNav);
    const bar = $('ws-orientation');
    bar.insertAdjacentHTML('afterbegin', '<button type="button" id="ws-back" class="btn btn-secondary">← Back</button><nav id="ws-location" aria-label="Your location"></nav>');
    const journey = document.createElement('section'); journey.id = 'ws-journey'; journey.className = 'ws-journey'; journey.setAttribute('aria-label', 'Content workspace'); bar.after(journey);
    // Keep the same form and controls; tuck occasional technical settings
    // behind a native, keyboard-accessible disclosure without changing saves.
    const form = $('settings-form');
    const first = $('settings-gemini-key').closest('.form-group').previousElementSibling;
    const last = $('gsc-diag');
    const connectionDetails = document.createElement('details'); connectionDetails.className = 'ws-details'; connectionDetails.id = 'ws-connections';
    const connectionSummary = document.createElement('summary'); connectionSummary.textContent = 'Connections, credentials and technical options';
    first.before(connectionDetails); connectionDetails.append(connectionSummary);
    let node = first;
    while (node) { const next = node.nextSibling; connectionDetails.append(node); if (node === last) break; node = next; }
    form.addEventListener('invalid', event => { if (connectionDetails.contains(event.target)) connectionDetails.open = true; }, true);
    form.closest('.content-card').querySelector('h2').textContent = 'Account and connections';
    form.closest('.content-card').querySelector('h2 + p').textContent = 'Manage access and value assumptions. Open technical options when a connection needs attention.';
    $('ws-back').addEventListener('click', () => depth > 0 ? history.back() : navigate('workspace-today-tab'));
    $('ws-tool-search').addEventListener('input', filterTools);
    $('ws-tool-clear').addEventListener('click', clearToolSearch);
    $('ws-tool-search').addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !$('ws-tool-search').value) return;
      event.preventDefault();
      event.stopPropagation();
      clearToolSearch();
    });
    global.addEventListener('popstate', () => navigate(tabFromHash(), { replay: true }));
    global.addEventListener('hashchange', () => { const tab = tabFromHash(); if (tab !== current) navigate(tab, { replay: true }); });
    document.addEventListener('seo:content-changed', updateJourney);
    document.addEventListener('seo:readiness-changed', () => {
      if (current === 'workspace-today-tab') loadToday();
      if (current === 'approvals-tab') loadApprovals();
    });
    document.addEventListener('click', async event => {
      const target = event.target.closest('[data-ws-tab], [data-ws-retry], [data-ws-enable-content]');
      if (!target) return;
      if (target.dataset.wsTab) return void navigate(target.dataset.wsTab);
      if (target.dataset.wsRetry) return void (target.dataset.wsRetry === 'today' ? loadToday() : loadApprovals());
      const approved = await confirmAction('Enable content autopilot? This gives SEO Buddy ongoing permission to generate and publish articles on the existing schedule. You can pause it in Content → Publish.');
      if (!approved) return;
      target.disabled = true;
      try {
        const response = await authFetch('/api/autopilot-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
        const data = await response.json();
        if (!response.ok || !data.success || data.enabled !== true) throw new Error('The server did not confirm the schedule change.');
        showToast('Schedule enabled. This does not mean an article has been published.');
        await loadApprovals();
      } catch (error) { showToast(error.message); target.disabled = false; }
    });
    // Summary-level destinations link to detail without changing the navigation.
    $('owner-results-tab').insertAdjacentHTML('afterbegin', `<section class="ws-report-entry" aria-label="Reports and email delivery"><div><h2>Reports &amp; email delivery</h2><p>Download your progress report or manage the monthly owner email.</p></div>${button('performance-tab', 'Open reports & email')}</section>`);
    $('owner-results-tab').insertAdjacentHTML('beforeend', `<div class="ws-result-links">${button('summary-tab', 'Advanced dashboard')}</div>`);
    $('owner-business-tab').insertAdjacentHTML('afterbegin', `<div class="ws-result-links"><button class="btn btn-secondary" type="button" id="ws-edit-business">Edit business details</button>${button('brand-tab', 'Edit brand voice')}<button class="btn btn-secondary" type="button" data-settings-section="connections">Manage connections</button></div>`);
    $('ws-edit-business').addEventListener('click', () => global.openSetupWizard());
    navigate(tabFromHash());
    setupWalkthrough();
  }

  global.SeoBuddyWorkspace = Object.freeze({ start, navigate, loadToday, loadApprovals, enhanceTools, openWalkthrough, routes: ROUTES });
})(window);
