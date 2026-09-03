// SEO Buddy - Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = { activeTab: 'today-tab' };
  // Keep old preview bookmarks working; only an explicit classic link opts out.
  const workspaceEnabled = new URLSearchParams(window.location.search).get('workspace') !== 'classic';
  document.body.classList.toggle('workspace-preview', workspaceEnabled);

  // --- DOM ELEMENT SELECTORS ---
  const tabButtons = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const modeStatus = document.getElementById('mode-status');
  const modeStatusText = document.getElementById('mode-status-text');

  function ensureReviewsFeature() {
    return window.SeoBuddyCore.loadFeature('reviewsAsset', () => !!(window.loadReviews), 'Reviews');
  }

  async function loadReviewsFeature() {
    try {
      await ensureReviewsFeature();
      if (window.loadReviews) await window.loadReviews();
    } catch (error) {
      const checks = document.getElementById('rv-checks');
      if (checks) checks.innerHTML = '<li class="rv-empty">Could not load the Reviews feature. Refresh and try again.</li>';
    }
  }

  function ensureRecordedContentFeature() {
    return window.SeoBuddyCore.loadFeature('recordedContentAsset', () => !!(window.initializeRecordedContent), 'RecordedContent');
  }

  async function loadRecordedContentFeature() {
    if (window.initializeRecordedContent) {
      window.initializeRecordedContent();
      return;
    }
    const recordingDrop = document.getElementById('rec-drop');
    const socialButton = document.getElementById('btn-social-pack');
    if (recordingDrop) recordingDrop.setAttribute('aria-busy', 'true');
    if (socialButton) socialButton.disabled = true;
    try {
      await ensureRecordedContentFeature();
      if (window.initializeRecordedContent) window.initializeRecordedContent();
    } catch (error) {
      const recordingStatus = document.getElementById('rec-status');
      const socialOutput = document.getElementById('sp-out');
      if (recordingStatus) {
        recordingStatus.className = 'rec-status err';
        recordingStatus.textContent = 'Could not load recording tools. Refresh and try again.';
      }
      if (socialOutput) socialOutput.innerHTML = '<div class="sp-err">Could not load the social-pack tools. Refresh and try again.</div>';
    }
  }

  function ensureCitationFeature() {
    return window.SeoBuddyCore.loadFeature('citationAsset', () => !!(window.loadCitationWorklist), 'Citation');
  }

  async function loadCitationFeature() {
    try {
      await ensureCitationFeature();
      if (window.loadCitationWorklist) await window.loadCitationWorklist();
    } catch (error) {
      const results = document.getElementById('citations-results');
      if (results) results.innerHTML = '<div class="cit-empty">Could not load the citation worklist. Refresh and try again.</div>';
    }
  }

  function ensureLocalPresenceFeature() {
    return window.SeoBuddyCore.loadFeature('localPresenceAsset', () => !!(window.loadLocalAutopilot), 'LocalPresence');
  }

  async function loadLocalPresenceFeature() {
    try {
      await ensureLocalPresenceFeature();
      if (window.loadLocalAutopilot) await window.loadLocalAutopilot();
    } catch (error) {
      const status = document.getElementById('la-meta');
      if (status) status.textContent = 'Could not load Local Presence. Refresh and try again.';
    }
  }

  function ensurePerformanceFeature() {
    return window.SeoBuddyCore.loadFeature('performanceAsset', () => !!(window.loadPerformance && window.loadPerfDigest), 'Performance');
  }

  async function loadPerformanceFeature() {
    try {
      await ensurePerformanceFeature();
      await Promise.all([
        window.loadPerformance ? window.loadPerformance() : Promise.resolve(),
        window.loadPerfDigest ? window.loadPerfDigest() : Promise.resolve(),
      ]);
    } catch (error) {
      const updated = document.getElementById('perf-updated');
      if (updated) updated.textContent = 'Could not load Progress. Refresh and try again.';
    }
  }

  function ensureSiteOptimizationFeature() {
    return window.SeoBuddyCore.loadFeature('siteOptimizationAsset', () => !!(window.loadOnsiteAutopilot), 'SiteOptimization');
  }

  async function loadSiteOptimizationFeature() {
    try {
      await ensureSiteOptimizationFeature();
      if (window.loadOnsiteAutopilot) await window.loadOnsiteAutopilot();
    } catch (error) {
      const status = document.getElementById('oa-meta');
      if (status) status.textContent = 'Could not load Site Optimization. Refresh and try again.';
    }
  }

  function ensureAiVisibilityFeature() {
    return window.SeoBuddyCore.loadFeature('aiVisibilityAsset', () => !!(window.loadAiVisibilitySuite), 'AiVisibility');
  }

  async function loadAiVisibilityFeature() {
    try {
      await ensureAiVisibilityFeature();
      if (window.loadAiVisibilitySuite) await window.loadAiVisibilitySuite();
    } catch (error) {
      const status = document.getElementById('av-updated');
      if (status) status.textContent = 'Could not load AI Visibility. Refresh and try again.';
    }
  }

  function ensureBrandProfileFeature() {
    return window.SeoBuddyCore.loadFeature('brandProfileAsset', () => !!(window.loadBrandProfile), 'BrandProfile');
  }

  async function loadBrandProfileFeature() {
    try {
      await ensureBrandProfileFeature();
      if (window.loadBrandProfile) await window.loadBrandProfile();
    } catch (error) {
      const message = document.getElementById('bp-msg');
      if (message) {
        message.className = 'bp-msg err';
        message.textContent = 'Could not load Brand Voice. Refresh and try again.';
      }
    }
  }

  function ensureOwnerViewsFeature() {
    return window.SeoBuddyCore.loadFeature('ownerViewsAsset', () => !!(window.loadOwnerResults && window.loadOwnerBusiness), 'Results and Business');
  }

  async function ensureOwnerModeFeature() {
    // Recovery mode shares the current views, but current views never load it.
    await ensureOwnerViewsFeature();
    return window.SeoBuddyCore.loadFeature('ownerModeAsset', () => !!(window.setOwnerMode && window.loadOwnerToday), 'OwnerMode');
  }

  async function loadOwnerModeView(loaderName) {
    try {
      if (loaderName === 'loadOwnerToday') await ensureOwnerModeFeature();
      else await ensureOwnerViewsFeature();
      if (typeof window[loaderName] === 'function') await window[loaderName]();
    } catch (error) {
      showToast('Could not load Owner mode. Refresh and try again.');
    }
  }

  async function setOwnerModeFeature(on) {
    try {
      await ensureOwnerModeFeature();
      if (window.setOwnerMode) window.setOwnerMode(on);
    } catch (error) {
      showToast('Could not load Owner mode. Refresh and try again.');
    }
  }

  function ensureSearchOpportunitiesFeature() {
    return window.SeoBuddyCore.loadFeature('searchOpportunitiesAsset', () => !!(window.syncGSCData), 'SearchOpportunities');
  }

  async function loadSearchOpportunitiesFeature() {
    try {
      await ensureSearchOpportunitiesFeature();
      if (window.syncGSCData) await window.syncGSCData();
    } catch (error) {
      const table = document.getElementById('gsc-table-body');
      if (table) table.innerHTML = '<tr><td colspan="7" class="text-center text-rose-500">Could not load search opportunities. Refresh and try again.</td></tr>';
    }
  }

  function ensureSettingsFeature() {
    return window.SeoBuddyCore.loadFeature('settingsAsset', () => !!(window.loadSettingsWorkspace), 'Settings');
  }

  async function loadSettingsFeature() {
    try {
      await ensureSettingsFeature();
      if (window.loadSettingsWorkspace) window.loadSettingsWorkspace();
      if (window.loadUsage) window.loadUsage();
      if (window.loadStorageStatus) window.loadStorageStatus();
    } catch (error) {
      showToast('Could not load Settings. Refresh and try again.');
    }
  }

  async function ensureContentWorkspaceFeature() {
    await window.SeoBuddyCore.loadFeature('contentWorkspaceAsset', () => !!window.SeoBuddyContent, 'Content workspace');
  }

  async function loadContentWorkspaceFeature(publish) {
    try {
      await ensureContentWorkspaceFeature();
      if (publish) await window.SeoBuddyContent.loadPublishWorkspace();
    } catch (error) {
      showToast('Could not load the content workspace. Refresh or reopen it to try again.');
    }
  }

  window.loadKeywordIntoCreator = async keyword => {
    try {
      await ensureContentWorkspaceFeature();
      window.SeoBuddyContent.loadKeywordIntoCreator(keyword);
    } catch (error) {
      showToast('Could not open the content creator. Please try again.');
    }
  };

  function setDataMode(mode) {
    if (!modeStatus || !modeStatusText) return;
    const normalized = mode === true ? 'live' : mode === false ? 'demo' : mode;
    if (normalized === 'live') {
      modeStatus.className = 'status-indicator live';
      modeStatusText.innerText = workspaceEnabled ? 'Live Search Data' : 'Live Operations';
    } else if (normalized === 'demo') {
      modeStatus.className = 'status-indicator mock';
      modeStatusText.innerText = 'Demo Search Data';
    } else {
      modeStatus.className = 'status-indicator unavailable';
      modeStatusText.innerText = 'Live Data Unavailable';
    }
  }
  window.setDataMode = setDataMode;

  function setDataModeFromHealthScore(healthScore) {
    const pillars = healthScore && Array.isArray(healthScore.pillars) ? healthScore.pillars : [];
    const searchPillar = pillars.find(pillar => pillar && pillar.key === 'found');
    if (searchPillar) {
      const demoAllowed = !!(healthScore.runtime && healthScore.runtime.mockIntegrationsAllowed);
      setDataMode(searchPillar.measured === true ? 'live' : (demoAllowed ? 'demo' : 'unavailable'));
    }
  }


  const displaySiteUrlBadge = document.getElementById('display-site-url');

  // --- SHARED BROWSER CORE ---
  const { authFetch, bindAction, confirmAction, trapDialogFocus, showToast, uiEsc } = window.SeoBuddyCore;
  const citEsc = uiEsc;

  // Existing call sites intentionally use this local name; shadowing the
  // blocking browser API upgrades all of them to accessible, non-blocking UI.
  function alert(message) { showToast(message); }

  // AI Visibility selectors and state live in the on-demand feature module.
  // --- INITIALIZATION ---
  migrateLegacyBrowserSecrets();
  updateSiteUrlBadge(getStoredCredentials().siteUrl);

  // --- TAB SWAP SYSTEM ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
      document.body.classList.remove('nav-open'); // close mobile menu after choosing
    });
  });

  // Mobile off-canvas sidebar
  (function () {
    const ham = document.getElementById('mobile-hamburger');
    const bd = document.getElementById('mobile-backdrop');
    if (ham) ham.addEventListener('click', () => document.body.classList.toggle('nav-open'));
    if (bd) bd.addEventListener('click', () => document.body.classList.remove('nav-open'));
  })();

  // Advanced Tools collapsible group in the sidebar
  (function () {
    const at = document.getElementById('nav-adv-toggle');
    const ag = document.getElementById('nav-adv-group');
    if (at && ag) at.addEventListener('click', () => {
      const open = !ag.classList.contains('open');
      ag.classList.toggle('open', open);
      at.classList.toggle('open', open);
    });
  })();

  // Time-of-day greeting. Uses the browser clock, so it is right for whoever
  // is looking rather than for the server's timezone.
  function ownerGreeting() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    // Greet the person, not the business. The author name is the only place we
    // actually hold a human's name; without it we say the time of day and stop,
    // rather than greeting someone as "Best".
    let who = '';
    try { who = (localStorage.getItem('seo_author_name') || '').trim().split(/\s+/)[0] || ''; } catch (e) {}
    return who ? `${part}, ${who}` : part;
  }

  function switchTab(tabId, options = {}) {
    if (workspaceEnabled && window.SeoBuddyWorkspace && !options.render) return window.SeoBuddyWorkspace.navigate(tabId);
    state.activeTab = tabId;
    
    // Update active nav button
    tabButtons.forEach(button => {
      if (button.getAttribute('data-tab') === tabId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    // Update tab visibility
    tabContents.forEach(content => {
      if (content.id === tabId) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Keep "Explore" highlighted while inside any tool reached through it.
    const EXPLORE_TABS = ['gsc-tab', 'ai-tab', 'publish-tab', 'aio-tab', 'citations-tab', 'local-tab', 'onsite-tab', 'reviews-tab', 'brand-tab', 'summary-tab', 'grow-tab'];
    const navExp = document.getElementById('nav-explore');
    if (navExp && EXPLORE_TABS.includes(tabId)) navExp.classList.add('active');

    // Auto-expand the Advanced Tools group when landing on one of its tools.
    if (['gsc-tab', 'ai-tab', 'publish-tab', 'aio-tab', 'citations-tab', 'local-tab', 'onsite-tab', 'reviews-tab', 'brand-tab'].includes(tabId)) {
      const ag = document.getElementById('nav-adv-group'); const at = document.getElementById('nav-adv-toggle');
      if (ag) ag.classList.add('open'); if (at) at.classList.add('open');
    }

    // Update Header Text dynamically
    if (tabId === 'workspace-today-tab') {
      pageTitle.innerText = 'Today';
      pageSubtitle.innerText = 'What needs you, what is running, and what happens next';
      window.SeoBuddyWorkspace?.loadToday();
    } else if (tabId === 'approvals-tab') {
      pageTitle.innerText = 'Approvals';
      pageSubtitle.innerText = 'Priority decisions and your current article draft';
      window.SeoBuddyWorkspace?.loadApprovals();
    } else if (tabId === 'today-tab') {
      pageTitle.innerText = 'Today';
      pageSubtitle.innerText = 'What needs you — and what SEO Buddy handled on its own';
      if (window.loadToday) window.loadToday();
    } else if (tabId === 'explore-tab') {
      pageTitle.innerText = 'Explore';
      pageSubtitle.innerText = 'All of SEO Buddy’s tools, grouped — dip in when you want to go deeper';
      if (window.loadExplore) window.loadExplore();
    } else if (tabId === 'summary-tab') {
      pageTitle.innerText = 'Full dashboard';
      pageSubtitle.innerText = 'Your SEO & AEO at a glance — score, what we did, and what to do next';
      loadSummary();
    } else if (tabId === 'grow-tab') {
      pageTitle.innerText = 'Grow';
      pageSubtitle.innerText = 'Your prioritized to-do list, plus quick access to every tool';
      if (window.loadGrow) window.loadGrow();
    } else if (tabId === 'performance-tab') {
      pageTitle.innerText = 'Progress';
      pageSubtitle.innerText = 'Is it working? Your weekly digest, what we automated, search trends, and leads';
      loadPerformanceFeature();
      loadAutopilotDigest();
      loadSummary(); // refresh the KPI / stats / AI-standing / opportunities / content widgets that now live on Reports
    } else if (tabId === 'owner-today-tab') {
      pageTitle.innerText = ownerGreeting();
      pageSubtitle.innerText = 'SEO Buddy is handling your marketing \u2014 here\u2019s anything that needs you';
      loadOwnerModeView('loadOwnerToday');
    } else if (tabId === 'owner-results-tab') {
      pageTitle.innerText = 'Results';
      pageSubtitle.innerText = 'The last 28 days, next to the 28 before them';
      loadOwnerModeView('loadOwnerResults');
    } else if (tabId === 'owner-business-tab') {
      pageTitle.innerText = 'Business';
      pageSubtitle.innerText = 'Your details \u2014 not marketing settings. Just the facts we use everywhere';
      loadOwnerModeView('loadOwnerBusiness');
    } else if (tabId === 'brand-tab') {
      pageTitle.innerText = 'Brand Voice';
      pageSubtitle.innerText = 'How everything SEO Buddy writes should sound \u2014 and the words it must never use';
      loadBrandProfileFeature();
    } else if (tabId === 'reviews-tab') {
      pageTitle.innerText = 'Reviews Site';
      pageSubtitle.innerText = 'How many reviews are published, how that’s growing, and whether the page is structurally sound';
      loadReviewsFeature();
    } else if (tabId === 'gsc-tab') {
      pageTitle.innerText = 'Searches You’re Missing';
      pageSubtitle.innerText = 'Search queries where you show up but get no clicks — your biggest quick wins';
      loadSearchOpportunitiesFeature();
    } else if (tabId === 'ai-tab') {
      pageTitle.innerText = 'Create a Post';
      pageSubtitle.innerText = 'Have AI write an authoritative, SEO-optimized article for you';
      loadContentWorkspaceFeature(false);
      loadRecordedContentFeature();
    } else if (tabId === 'publish-tab') {
      pageTitle.innerText = 'Publish';
      pageSubtitle.innerText = 'Publish to your site, request Google indexing, and run the content autopilot';
      loadContentWorkspaceFeature(true);
    } else if (tabId === 'aio-tab') {
      pageTitle.innerText = 'AI Visibility Check';
      pageSubtitle.innerText = 'See whether AI assistants recommend and cite you, and build schema';
      loadAiVisibilityFeature();
    } else if (tabId === 'citations-tab') {
      pageTitle.innerText = 'Where to Get Listed';
      pageSubtitle.innerText = 'The sites AI pulls from — find them, prep listings, send pitches, track progress';
      loadCitationFeature();
    } else if (tabId === 'local-tab') {
      pageTitle.innerText = 'Local Presence';
      pageSubtitle.innerText = 'NAP monitoring, weekly Google posts, reviews, and your local checklist';
      loadRecordedContentFeature();
      loadLocalPresenceFeature();
    } else if (tabId === 'onsite-tab') {
      pageTitle.innerText = 'Site Optimization';
      pageSubtitle.innerText = 'Content ideas, title/meta & internal links — plus manual tools and schema';
      loadSiteOptimizationFeature();
    } else if (tabId === 'settings-tab') {
      pageTitle.innerText = 'Settings';
      pageSubtitle.innerText = 'Connect your accounts, business info, and automation preferences';
      loadSettingsFeature();
    }
  }
  // Exposed so tabs reachable only through Explore (brand-tab) can still be
  // opened from a button elsewhere, e.g. the Settings pointer.
  window.switchTab = switchTab;

  // --- Storage status badge (persistent volume vs ephemeral) ---
  window.loadStorageStatus = async function () {
    const badge = document.getElementById('storage-badge');
    const dot = document.getElementById('storage-dot');
    const label = document.getElementById('storage-label');
    const help = document.getElementById('storage-help');
    if (!badge || !dot || !label) return;
    try {
      const r = await fetch('/api/storage-status');
      const d = await r.json();
      if (d.persistent) {
        dot.style.background = 'var(--color-success)';
        badge.style.background = 'rgba(16,185,129,.12)';
        badge.style.borderColor = 'rgba(16,185,129,.35)';
        badge.style.color = 'var(--color-success)';
        label.textContent = 'Persistent ✓';
        if (help) help.textContent = 'Your history is saved to a volume and survives redeploys. You’re all set.';
      } else {
        dot.style.background = 'var(--color-warning)';
        badge.style.background = 'rgba(245,158,11,.12)';
        badge.style.borderColor = 'rgba(245,158,11,.35)';
        badge.style.color = 'var(--color-warning)';
        label.textContent = 'Ephemeral ⚠';
        if (help) help.innerHTML = 'Data resets on every redeploy. Attach a Railway volume and set <b>DATA_DIR</b> to its mount path to keep your history.';
      }
    } catch (e) {
      label.textContent = 'Unknown';
      if (help) help.textContent = 'Could not check storage status.';
    }
  };

  // Search opportunity tools load only when their tab is opened.
  // Brand Voice navigation stays available before its editor module loads.
  const bpGoto = document.getElementById('btn-goto-brand');
  if (bpGoto) bpGoto.addEventListener('click', () => switchTab('brand-tab'));
  // Brand Voice editor tools load only when their tab is opened.

  // ===========================================================================
  // Owner mode views load only when the saved preference or mode switch requests them.
  const modeBtn = document.getElementById('btn-mode-switch');
  if (modeBtn) modeBtn.addEventListener('click', () => {
    setOwnerModeFeature(!document.body.classList.contains('owner-mode'));
  });

  // Restore the saved preference through the same lazy boundary used by the
  // mode switch. Full-interface users never download the owner workspace.
  try {
    if (!workspaceEnabled && localStorage.getItem('seo_owner_mode') === '1') setOwnerModeFeature(true);
  } catch (error) {}

  // Readiness changes also refresh the always-available dashboard surfaces.
  // Owner-specific views subscribe inside their module once it is loaded.
  document.addEventListener('seo:readiness-changed', () => {
    if (!workspaceEnabled && window.loadToday) window.loadToday();
    if (!workspaceEnabled && window.loadGetStarted) window.loadGetStarted();
    if (window.refreshReadinessBoard) window.refreshReadinessBoard();
  });

  // The editor, publication history, and content autopilot share one lazy workspace.

  // --- SETTINGS STORAGE SYSTEM ---
  function getStoredCredentials() {
    return {
      geminiKey: '',
      ghlToken: '',
      ghlLocation: localStorage.getItem('seo_ghl_location') || '',
      ghlBlog: localStorage.getItem('seo_ghl_blog') || '',
      siteUrl: localStorage.getItem('seo_site_url') || '',
      blogPrefix: localStorage.getItem('seo_blog_prefix') || '/post',
      authorName: localStorage.getItem('seo_author_name') || '',
      authorUrl: localStorage.getItem('seo_author_url') || '',
      gscJson: '',
      adminPassword: sessionStorage.getItem('seo_admin_password') || '',
      clientValue: localStorage.getItem('seo_client_value') || '1395',
      convRate: localStorage.getItem('seo_conv_rate') || '2',
      captureRate: localStorage.getItem('seo_capture_rate') || '5'
    };
  }

  // Secret values from early builds must never remain in persistent browser
  // storage, even when the owner never opens Settings during this session.
  function migrateLegacyBrowserSecrets() {
    const legacyAdmin = localStorage.getItem('seo_admin_password');
    if (legacyAdmin && !sessionStorage.getItem('seo_admin_password')) sessionStorage.setItem('seo_admin_password', legacyAdmin);
    ['seo_admin_password', 'seo_gemini_key', 'seo_ghl_token', 'seo_gsc_json'].forEach(key => localStorage.removeItem(key));
  }

  function updateSiteUrlBadge(siteUrl) {
    if (displaySiteUrlBadge && siteUrl) {
      displaySiteUrlBadge.innerText = siteUrl.replace('https://', '').replace('http://', '');
    }
  }
  window.getStoredCredentials = getStoredCredentials;
  window.updateSiteUrlBadge = updateSiteUrlBadge;

  // Settings form and diagnostics load only when their tab is opened.


  // --- SUMMARY DASHBOARD (default landing tab) ---
  // Aggregates the app's existing live data into a plain-English snapshot.
  // Uses the open (view-only) GET endpoints, so it works without the admin password.
  function sumEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function sumAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime(); if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 90) return 'just now';
    const m = s / 60; if (m < 60) return Math.round(m) + ' min ago';
    const h = m / 60; if (h < 24) return Math.round(h) + 'h ago';
    const d = h / 24; return Math.round(d) + 'd ago';
  }

  async function loadAutopilotDigest() {
    const wrap = document.getElementById('sum-autopilot');
    const grid = document.getElementById('sum-ap-grid');
    const sub = document.getElementById('sum-ap-sub');
    const recapEl = document.getElementById('sum-ap-recap');
    if (!wrap || !grid) return;
    try {
      const d = await (await fetch('/api/autopilot-digest')).json();
      const items = (d && d.items) || [];
      if (!items.length && !(d && d.recap)) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      if (sub) sub.innerText = d.newCount ? `${d.newCount} new since you last looked` : 'Up to date';
      if (recapEl) {
        const la = d.lastActivityAt ? ` <span class="sum-ap-live">Last activity ${sumAgo(d.lastActivityAt)}.</span>` : '';
        recapEl.innerHTML = d.recap ? (sumEsc(d.recap) + la) : '';
        recapEl.style.display = d.recap ? 'block' : 'none';
      }
      grid.innerHTML = items.map(it => `<div class="sum-ap-item ${it.tone === 'warn' ? 'warn' : ''}" data-tab="${sumEsc(it.tab)}">
        <div class="sum-ap-label"><span>${sumEsc(it.label)}</span>${it.isNew ? '<span class="sum-ap-new">NEW</span>' : ''}</div>
        <div class="sum-ap-text">${sumEsc(it.text)}</div>
        <div class="sum-ap-arrow">Open &rarr;</div>
      </div>`).join('');
      grid.querySelectorAll('.sum-ap-item').forEach(el => {
        el.addEventListener('click', () => { if (el.dataset.tab) switchTab(el.dataset.tab); });
      });
    } catch (e) { wrap.style.display = 'none'; }
  }

  // --- HOME: score hero + pillars + next moves ---
  const HOME_TAB_MAP = { found: 'gsc-tab', local: 'local-tab', ai: 'aio-tab', listed: 'citations-tab', fresh: 'publish-tab' };
  function homeGoTab(tab) { if (tab) { switchTab(tab); try { document.body.classList.remove('nav-open'); } catch (e) {} } }
  window.__switchTab = switchTab;

  // One-tap actions from Home/Grow move cards. Falls back to navigation.
  async function runMoveAction(m, btn) {
    if (!m) return;
    if (m.action === 'enable-autopilot') {
      btn.disabled = true; const o = btn.innerText; btn.innerText = 'Turning on…';
      try {
        const r = await authFetch('/api/autopilot-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, intervalHours: 168 }) });
        const d = await r.json();
        if (d && d.success) { btn.innerText = 'Turned on ✓'; setTimeout(() => { if (window.loadHome) window.loadHome(); if (window.loadGrow) window.loadGrow(); if (window.loadToday) window.loadToday(); }, 900); return; }
        throw new Error('failed');
      } catch (e) { btn.disabled = false; btn.innerText = o; homeGoTab(m.tab); }
      return;
    }
    if (m.action === 'post-gbp') {
      btn.disabled = true; const o = btn.innerText; btn.innerText = 'Posting…';
      try {
        const r = await authFetch('/api/gbp-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await r.json();
        if (d && d.needsSetup) { btn.disabled = false; btn.innerText = o; homeGoTab(m.tab); return; }
        if (d && d.success) { btn.innerText = 'Posted ✓'; setTimeout(() => { if (window.loadHome) window.loadHome(); if (window.loadGrow) window.loadGrow(); if (window.loadToday) window.loadToday(); }, 900); return; }
        throw new Error((d && d.error) || 'failed');
      } catch (e) { btn.disabled = false; btn.innerText = o; homeGoTab(m.tab); }
      return;
    }
    homeGoTab(m.tab);
  }


  // --- SCORE RING (shared by Today and the full dashboard) ---
  // Arc length is each pillar's real weight from computeHealthScore, so the
  // ring *is* the weighting, drawn. Three dot states: lit (earned, in the
  // pillar's hue), dim (measured, not earned), hollow (not measured — reads
  // as a gap in the ring, which is exactly what it is).
  const SB_PILLAR_VAR = { found: 'p1', local: 'p2', ai: 'p3', listed: 'p4', fresh: 'p5' };
  function sbCssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }

  function sbRing(el, hs, opts) {
    if (!el) return;
    opts = opts || {};
    const size = opts.size || 'lg';
    const pillars = (hs && hs.pillars) ? hs.pillars : [];
    if (!pillars.length) { el.innerHTML = ''; return; }

    const VB = 236, cx = 118, cy = 118;
    const ringR = size === 'sm' ? 94 : 92;
    const dotR = size === 'sm' ? 6.2 : 5.4;
    const counts = pillars.map(p => Math.max(2, Math.round((p.weight || 20) / 2.5)));
    const totalDots = counts.reduce((a, b) => a + b, 0);
    const step = 360 / (totalDots + pillars.length);   // one blank slot between arcs
    const dim = sbCssVar('--unmeasured');

    let svg = '<svg viewBox="0 0 ' + VB + ' ' + VB + '" aria-hidden="true">', slot = 0;
    pillars.forEach((p, i) => {
      const hue = sbCssVar('--' + (SB_PILLAR_VAR[p.key] || 'p1') + '-g');
      const lit = p.measured && p.score != null ? Math.round(p.score / 100 * counts[i]) : 0;
      for (let d = 0; d < counts[i]; d++) {
        const a = (slot * step - 90) * Math.PI / 180;
        const x = (cx + Math.cos(a) * ringR).toFixed(1), y = (cy + Math.sin(a) * ringR).toFixed(1);
        if (!p.measured) svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (dotR - 1.1) + '" fill="none" stroke="' + dim + '" stroke-width="2"/>';
        else if (d < lit) svg += '<circle cx="' + x + '" cy="' + y + '" r="' + dotR + '" fill="' + hue + '"/>';
        else svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (dotR - 1) + '" fill="' + dim + '"/>';
        slot++;
      }
      slot++;
    });
    svg += '</svg>';

    const measured = pillars.filter(p => p.measured).length;
    const total = pillars.length;
    let mid;
    if (hs.overall == null) {
      // Never a zero. Unmeasured is not the same as failing.
      mid = opts.target === false
        ? '<div><div class="sb-ring-of" style="max-width:118px;line-height:1.35">Nothing measured yet</div></div>'
        : '<div><button class="sb-ring-start" id="sb-ring-start" type="button"><b>Start<br>here</b></button></div>';
    } else {
      const provisional = measured < total;
      let chip = '';
      if (provisional) chip = '<div><span class="sb-ring-chip">' + measured + ' of ' + total + ' measured</span></div>';
      else if (hs.delta != null && hs.delta !== 0) chip = '<div><span class="sb-ring-chip ' + (hs.delta > 0 ? 'up' : 'dn') + '">' + (hs.delta > 0 ? '▲ +' : '▼ ') + hs.delta + ' in 28 days</span></div>';
      mid = '<div><div class="sb-ring-n' + (provisional ? ' prov' : '') + '">' + hs.overall + '</div><div class="sb-ring-of">of 100</div>' + chip + '</div>';
    }
    el.className = 'sb-ring' + (size === 'sm' ? ' sm' : '');
    el.innerHTML = svg + '<div class="sb-ring-mid">' + mid + '</div>';
    const start = el.querySelector('#sb-ring-start');
    if (start) start.addEventListener('click', () => switchTab('settings-tab'));
  }

  // "How much of your score is real" — a different question from "how good is
  // it", which the single number currently conflates.
  function sbCoverage(hs) {
    if (!hs || !hs.pillars) return '';
    const measuredWeight = hs.pillars.filter(p => p.measured).reduce((s, p) => s + (p.weight || 0), 0);
    const totalWeight = hs.pillars.reduce((s, p) => s + (p.weight || 0), 0) || 100;
    const pct = Math.round(measuredWeight / totalWeight * 100);
    const bars = hs.pillars.map(p => '<i style="flex:' + (p.weight || 20) + (p.measured ? ';background:var(--' + (SB_PILLAR_VAR[p.key] || 'p1') + '-g)' : '') + '"></i>').join('');
    const unmeasured = hs.pillars.filter(p => !p.measured);
    const note = unmeasured.length
      ? 'Coloured segments are measured. Grey is what we refuse to guess — connecting ' + unmeasured[0].label + ' alone would take this to ' + Math.round((measuredWeight + unmeasured[0].weight) / totalWeight * 100) + '%.'
      : 'Every area is measured, so the score is the whole picture.';
    return '<div class="sb-coverage"><div class="t">How much of your score is real<span>' + pct + '%</span></div><div class="bar">' + bars + '</div><p>' + note + '</p></div>';
  }

  function sbScoreMeta(hs) {
    if (!hs || hs.overall == null) return '';
    const samples = hs.smoothing && Number(hs.smoothing.samples || 0);
    const stableLabel = samples > 1 ? '7-day score' : 'Building 7-day baseline';
    const live = hs.liveOverall == null ? hs.overall : hs.liveOverall;
    const confidence = hs.confidence && hs.confidence.level
      ? hs.confidence.level.charAt(0).toUpperCase() + hs.confidence.level.slice(1) + ' confidence'
      : '';
    const updated = hs.freshness && hs.freshness.calculatedAt ? 'Updated ' + tdAgo(hs.freshness.calculatedAt) : '';
    const opportunity = hs.explainability && hs.explainability.topOpportunity;
    return '<div class="sb-score-meta">'
      + '<span><b>' + stableLabel + '</b> ' + hs.overall + '</span>'
      + '<span><b>Live today</b> ' + live + '</span>'
      + (confidence ? '<span>' + sumEsc(confidence) + '</span>' : '')
      + (updated ? '<span>' + sumEsc(updated) + '</span>' : '')
      + (opportunity ? '<span><b>Largest score opportunity</b> ' + sumEsc(opportunity.label) + ' · up to +' + Number(opportunity.availableScorePoints).toFixed(1) + '</span>' : '')
      + (hs.scoreVersion ? '<span>Formula v' + Number(hs.scoreVersion) + '</span>' : '')
      + '</div>';
  }

  const SB_WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five'];
  function renderHero(hs) {
    const hero = document.getElementById('home-hero'); if (!hero) return;
    hero.style.display = 'grid';
    const g = document.getElementById('home-gauge'), sc = document.getElementById('home-score');
    const hl = document.getElementById('home-headline'), sub = document.getElementById('home-sub');
    // The conic gauge is retired; the dot ring renders into the same element.
    g.style.background = 'none';
    if (sc) sc.style.display = 'none';
    sbRing(g, hs);
    const measured = (hs.pillars || []).filter(p => p.measured).length;
    const total = (hs.pillars || []).length || 5;
    if (hs.overall == null) {
      hl.innerHTML = 'Nothing measured yet';
      sub.innerText = 'Connect Search Console first — it is 25% of the score on its own.';
      return;
    }
    // The old copy said "100% maximized" off a single measured pillar. It now
    // refuses to make that claim until every area is actually measured.
    if (measured < total) {
      hl.innerHTML = `${SB_WORDS[measured] || measured} of ${SB_WORDS[total] ? SB_WORDS[total].toLowerCase() : total} areas measured`;
      sub.innerText = `Your score is ${hs.overall} across what we can see. The rest is unknown, not zero.`;
    } else {
      const trend = (hs.delta != null && hs.delta !== 0) ? `<span class="home-trend ${hs.delta > 0 ? 'up' : 'flat'}">${hs.delta > 0 ? '+' : ''}${hs.delta} this month</span>` : '';
      hl.innerHTML = `Your SEO &amp; AEO is <em>${hs.overall}% maximized</em>${trend}`;
      sub.innerText = `All ${total} areas measured, so this is the whole picture.`;
    }
  }
  function renderPillars(hs) {
    const el = document.getElementById('home-pillars'); if (!el || !hs.pillars) return;
    el.style.display = 'grid';
    // "How good is it" and "how much of it can we see" are different questions.
    // The single number used to conflate them.
    let cov = document.getElementById('home-coverage');
    if (!cov) { cov = document.createElement('div'); cov.id = 'home-coverage'; el.parentNode.insertBefore(cov, el.nextSibling); }
    cov.innerHTML = sbCoverage(hs) + sbScoreMeta(hs);
    el.innerHTML = hs.pillars.map(p => {
      const detCls = p.status === 'warn' ? 'warnt' : (p.status === 'off' ? 'offt' : '');
      // The dot carries the pillar's own hue so the eye links a tile to its arc
      // in the ring. Unmeasured stays hollow, matching the hollow dots above.
      const v = SB_PILLAR_VAR[p.key] || 'p1';
      const dot = p.measured
        ? `<span class="pdot" style="background:var(--${v}-g)"></span>`
        : `<span class="pdot" style="background:transparent;box-shadow:inset 0 0 0 2px var(--unmeasured)"></span>`;
      const value = p.measured && p.score != null ? `<span class="pval" title="Live pillar score${p.rawScore != null ? ': ' + p.rawScore : ''}">${p.score}</span>` : '';
      const contribution = p.overallContribution != null ? `Contributes ${Number(p.overallContribution).toFixed(1)} points to today’s score; ${Number(p.headroomPoints || 0).toFixed(1)} points remain available.` : 'Not measured yet.';
      return `<div class="home-pillar" title="${sumEsc(contribution)}" data-tab="${HOME_TAB_MAP[p.key] || 'summary-tab'}">${dot}<span class="plbl">${sumEsc(p.label)}</span>${value}<div class="pdet ${detCls}">${sumEsc(p.detail)}</div></div>`;
    }).join('');
    el.querySelectorAll('.home-pillar').forEach(c => c.addEventListener('click', () => homeGoTab(c.dataset.tab)));
  }
  function renderMoves(nm) {
    const wrap = document.getElementById('home-moves-wrap'), el = document.getElementById('home-moves');
    if (!wrap || !el) return;
    const moves = (nm && nm.moves) || [];
    if (!moves.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const tagLabel = { high: 'High impact', med: 'Quick win', opportunity: 'Opportunity' };
    const shown = moves.slice(0, 3);
    el.innerHTML = shown.map(m => `<div class="home-move ${m.impact === 'high' ? 'high' : ''}">
      <div class="home-move-top"><div class="home-move-title">${sumEsc(m.title)}</div><span class="mtag ${m.impact}">${tagLabel[m.impact] || ''}</span></div>
      <div class="home-move-why">${sumEsc(m.why)}</div>
      <div class="home-move-act"><button class="btn btn-primary" type="button">${sumEsc(m.cta || 'Review')}</button><span class="meff">${sumEsc(m.effort || '')}</span></div>
    </div>`).join('');
    el.querySelectorAll('.home-move-act .btn').forEach((b, i) => b.addEventListener('click', () => runMoveAction(shown[i], b)));
  }
  async function loadHome() {
    try {
      const [hs, nm] = await Promise.all([
        fetch('/api/health-score').then(r => r.json()),
        fetch('/api/next-moves').then(r => r.json())
      ]);
      renderHero(hs); renderPillars(hs); renderMoves(nm);
    } catch (e) { /* leave hidden */ }
  }
  window.loadHome = loadHome;

  // --- TODAY: calm landing (score + "needs you" cards + running strip) ---
  const TD_ICONS = {
    edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    globe:'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    table:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
    check:'<polyline points="20 6 9 17 4 12"/>'
  };
  function tdIcn(n){ return '<svg class="td-icn" viewBox="0 0 24 24">' + (TD_ICONS[n] || TD_ICONS.edit) + '</svg>'; }
  function tdMoveIcon(m){
    const t = m.tab || '', k = m.key || '';
    if (k === 'gbp' || k === 'autopilot') return 'edit';
    if (k === 'nap') return 'phone';
    if (k === 'listed' || t === 'citations-tab') return 'link';
    if (k === 'ai' || t === 'aio-tab') return 'globe';
    if (k === 'gsc' || t === 'gsc-tab') return 'table';
    if (t === 'local-tab') return 'phone';
    return 'edit';
  }
  const tdAgo = window.SeoBuddyCore.relativeTime;
  function renderTodayHero(hs, nm){
    const hero = document.getElementById('td-hero'); if (!hero) return;
    const moves = ((nm && nm.moves) || []).slice(0, 3);
    const sec = document.getElementById('td-needs-sec');
    const pct = (hs && hs.overall != null) ? hs.overall : null;
    if (!moves.length) {
      hero.innerHTML = '<div class="td-allset"><div class="big">' + tdIcn('check') + '</div><h4>You’re all set this week</h4><p>Nothing needs you. SEO Buddy is running your marketing in the background — check back anytime.</p></div>';
      if (sec) sec.style.display = 'none';
      return;
    }
    if (sec) sec.style.display = 'flex';
    // The flat bar is retired in favour of the ring, so Today and the full
    // dashboard finally show one number with one visual identity.
    hero.innerHTML = '<div class="td-kick">Your visibility</div>'
      + '<div class="sb-ring" id="td-ring" style="width:216px"></div>'
      + sbScoreMeta(hs)
      + '<div class="td-line"><b>Everything’s handled.</b> ' + moves.length + ' quick thing' + (moves.length > 1 ? 's' : '') + ' need' + (moves.length > 1 ? '' : 's') + ' your ok below — then you’re done.</div>';
    sbRing(document.getElementById('td-ring'), hs || {});
  }
  function renderTodayNeeds(nm){
    const el = document.getElementById('td-needs'); if (!el) return;
    const moves = ((nm && nm.moves) || []).slice(0, 3);
    const cnt = document.getElementById('td-count'); if (cnt) cnt.innerText = moves.length ? moves.length + ' left' : '';
    el.innerHTML = moves.map(function(m){
      const warn = m.impact === 'high';
      return '<div class="td-card"><div class="td-card-top"><div class="td-ic' + (warn ? ' warn' : '') + '">' + tdIcn(tdMoveIcon(m)) + '</div><span class="td-tag">' + sumEsc(m.effort || '') + '</span></div><h4>' + sumEsc(m.title) + '</h4><p>' + sumEsc(m.why) + '</p><button class="td-btn" type="button">' + sumEsc(m.cta) + '</button></div>';
    }).join('');
    el.querySelectorAll('.td-btn').forEach(function(b, i){ b.addEventListener('click', function(){ runMoveAction(moves[i], b); }); });
  }
  function renderTodayRunning(dg){
    const el = document.getElementById('td-running'); if (!el) return;
    if (!dg || !dg.recap) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const la = dg.lastActivityAt ? ' <b>Last activity ' + tdAgo(dg.lastActivityAt) + '.</b>' : '';
    el.innerHTML = '<div class="td-rk"><span class="td-pulse"></span> Running on its own</div><p>' + sumEsc(dg.recap) + la + '</p><a id="td-see">See everything it did →</a>';
    const a = document.getElementById('td-see'); if (a) a.addEventListener('click', function(){ switchTab('performance-tab'); });
  }
  async function loadToday(){
    try {
      const r = await Promise.all([
        fetch('/api/health-score').then(function(x){return x.json();}).catch(function(){return {};}),
        fetch('/api/next-moves').then(function(x){return x.json();}).catch(function(){return { moves: [] };}),
        fetch('/api/autopilot-digest').then(function(x){return x.json();}).catch(function(){return {};}),
        fetch('/api/business-profile').then(function(x){return x.json();}).catch(function(){return {};}),
        fetch('/api/deploy-readiness').then(function(x){return x.json();}).catch(function(){return {};})
      ]);
      const hs = r[0], nm = r[1], dg = r[2], bp = r[3], rd = r[4];
      setDataModeFromHealthScore(hs);
      loadTodayTop({ health: hs, readiness: rd });
      if (bp && bp.profile) {
        const nmEl = document.getElementById('td-biz'); if (nmEl && bp.profile.name) nmEl.innerText = bp.profile.name;
        const locEl = document.getElementById('td-loc'); if (locEl) { const loc = [bp.profile.addressLocality, bp.profile.addressRegion].filter(Boolean).join(', '); if (loc) locEl.innerText = loc; }
      }
      renderTodayHero(hs, nm); renderTodayNeeds(nm); renderTodayRunning(dg);
    } catch (e) { /* leave as-is */ }
  }
  window.loadToday = loadToday;


  // --- GET STARTED ----------------------------------------------------------
  // One list, derived rather than authored. The readiness board and next-moves
  // both described setup and neither knew about the other; the board also spoke
  // infrastructure ("attach a Railway volume") to a gym owner.
  //
  // Ordering is value divided by effort, which the old `impact: high|med|
  // opportunity` strings could not express: Search Console is the biggest single
  // pillar AND the most expensive step, so it is no longer first. Gemini is,
  // because /api/nap-audit, /api/citation-scan and the AI visibility run all
  // read GEMINI_API_KEY — three of five pillars cannot be measured without it.
  const SB_STEPS = [
    { key:'gemini', kind:'key', icon:'&#9881;', title:'Add your Gemini key',
      why:'Three of the five things we measure need this key. It is free to create and takes about three minutes.',
      badge:'unlocks 3', minutes:3, cap:'blocked', cta:'Add the key', tab:'settings-tab' },
    { key:'autopilot', kind:'unlock', pillar:'p5', icon:'&#9998;', title:'Let SEO Buddy publish for you',
      why:'Say yes once and it finds a gap, writes the page, publishes it and asks Google to list it — repeatedly, without you.',
      points:15, minutes:0.2, cap:'approve', cta:'Turn it on', action:'enable-autopilot' },
    { key:'local', kind:'unlock', pillar:'p2', icon:'&#9679;', title:'Check your details match everywhere',
      why:'Google trusts businesses whose name, address and phone are identical across the web. One tap and Local listings stops being a guess.',
      points:20, minutes:1, cap:'approve', cta:'Run the check', tab:'local-tab', needs:'gemini' },
    { key:'ai', kind:'unlock', pillar:'p3', icon:'&#9673;', title:'Find out if AI recommends you',
      why:'We ask Google and ChatGPT what they say about gyms near you, and count how often you come up.',
      points:20, minutes:1, cap:'approve', cta:'Run the check', tab:'aio-tab', needs:'gemini' },
    { key:'listed', kind:'unlock', pillar:'p4', icon:'&#8599;', title:'Find where AI looks you up',
      why:'AI recommends businesses from a handful of third-party sources. We find which ones matter for you.',
      points:20, minutes:2, cap:'approve', cta:'Scan', tab:'citations-tab', needs:'gemini' },
    { key:'gsc', kind:'unlock', pillar:'p1', icon:'&#9678;', title:'See what people search before they find you',
      why:'This turns your biggest pillar from a guess into a measurement — real rankings, real clicks, and the searches you appear in but get nothing from.',
      points:25, minutes:5, cap:'blocked', cta:'Start', tab:'settings-tab' },
    { key:'ghl', kind:'key', icon:'&#8593;', title:'Connect your website',
      why:'GoHighLevel is where articles get published. Without it the content autopilot can write but not publish.',
      badge:'unlocks publishing', minutes:4, cap:'blocked', cta:'Connect', tab:'settings-tab' },
    { key:'business', kind:'protect', icon:'&#9873;', title:'Confirm your business details',
      why:'Your name, address and phone are used in every post, listing check and piece of business-details code. Right now we are using the starter profile.',
      minutes:2, cap:'manual', cta:'Confirm them', act:'setup' },
    { key:'brand', kind:'protect', icon:'&#9834;', title:'Read through your brand voice',
      why:'Everything we write runs on this — including the never-use list. Worth a read so it sounds like you.',
      minutes:5, cap:'manual', cta:'Review it', tab:'brand-tab' },
    { key:'admin', kind:'protect', icon:'&#128274;', title:'Lock this to you',
      why:'Without a password, anyone with the link can change settings and publish to your website.',
      minutes:1, cap:'manual', cta:'Set a password', tab:'settings-tab' },
    // Deliberately reworded. The readiness board says "Attach a Railway volume
    // and set DATA_DIR", which a gym owner cannot action and which is worth no
    // points — so it is protective, and addressed to whoever set up the hosting.
    { key:'storage', kind:'protect', icon:'&#128190;', title:'Keep your history between updates',
      why:'Your score history and schedules reset whenever the app updates. This one is for whoever set up your hosting.',
      minutes:5, cap:'manual', cta:'Show them how', tab:'settings-tab' }
  ];
  const SB_SNOOZE_DAYS = 7;
  function sbSnoozed() { try { return JSON.parse(localStorage.getItem('seo_gs_snooze') || '{}'); } catch (e) { return {}; } }
  function sbSnooze(key) {
    const o = sbSnoozed(); o[key] = Date.now();
    try { localStorage.setItem('seo_gs_snooze', JSON.stringify(o)); } catch (e) {}
  }
  function sbIsSnoozed(key) {
    const t = sbSnoozed()[key];
    // Resurfaces after a week, silently — no badge. Nothing in the old app
    // could be deferred, so everything nagged forever.
    return !!t && (Date.now() - t) < SB_SNOOZE_DAYS * 86400000;
  }

  function sbBuildSteps(rd, hs) {
    const ok = {};
    ((rd && rd.checks) || []).forEach(c => { ok[c.key] = !!c.ok; });
    const pillar = {};
    ((hs && hs.pillars) || []).forEach(p => { pillar[p.key] = p; });
    const doneMap = {
      gemini: !!ok.gemini, ghl: !!ok.ghl, gsc: !!ok.gsc, admin: !!ok.admin,
      business: !!ok.business, brand: !!ok.brand, storage: !!ok.storage,
      local:  !!(pillar.local  && pillar.local.measured),
      ai:     !!(pillar.ai     && pillar.ai.measured),
      listed: !!(pillar.listed && pillar.listed.measured),
      autopilot: !!(pillar.fresh && pillar.fresh.measured)
    };
    const deps = {};
    SB_STEPS.forEach(st => { if (st.needs) deps[st.needs] = (deps[st.needs] || 0) + 1; });
    return SB_STEPS.map(st => {
      const done = !!doneMap[st.key];
      const locked = !done && !!st.needs && !doneMap[st.needs];
      const value = st.points || 0;
      const d = deps[st.key] || 0;
      // group 0 = a gate something is actually waiting on, 1 = scoring work,
      // 2 = protective. A "key" nothing depends on is just ordinary work.
      const group = st.kind === 'protect' ? 2 : (st.kind === 'key' && d > 0 ? 0 : 1);
      return Object.assign({}, st, { done, locked, deps: d, group, rate: value / Math.max(st.minutes, 0.2) });
    }).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.group !== b.group) return a.group - b.group;
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      if (b.deps !== a.deps) return b.deps - a.deps;
      return b.rate - a.rate;
    });
  }

  // ---------------------------------------------------------------------------
  // Card artwork. Direction A: refined editorial illustration.
  //
  // Every card uses the same small visual vocabulary: warm paper, navy outlines,
  // teal fields, one restrained coral accent, dot texture and a short shadow.
  // Classes carry the palette so the drawings stay themeable and the markup
  // describes shapes instead of repeating colour values eleven times.
  //
  // Filters and patterns still need unique ids because the same card can appear
  // in Today and Explore at once. Duplicate SVG ids silently cross-wire defs.
  // ---------------------------------------------------------------------------
  let SB_ART_N = 0;

  function sbArtDefs(u) {
    return '<defs>'
      + '<pattern id="d' + u + '" width="9" height="9" patternUnits="userSpaceOnUse">'
      +   '<circle cx="2" cy="2" r="1.2" class="gfx-ink" opacity=".16"/>'
      + '</pattern>'
      + '<filter id="f' + u + '" x="-25%" y="-25%" width="150%" height="160%">'
      +   '<feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#17324d" flood-opacity=".16"/>'
      + '</filter></defs>';
  }
  // `slice` fills the panel and crops the overflow — right for a 288px card whose
  // panel is close to the 320x150 the drawings are composed in. The hero panel is
  // more than twice as wide, so slice scales to cover the width and cuts the top
  // and bottom off the subject. `meet` fits the whole drawing and lets the tint
  // show at the sides instead.
  let SB_ART_FIT = 'slice';
  function sbArtOpen(u) {
    return '<svg class="sb-editorial-art" viewBox="0 0 320 150" preserveAspectRatio="xMidYMid '
      + SB_ART_FIT + '" aria-hidden="true">';
  }

  function sbArtBackdrop(u, flip) {
    return '<path d="M' + (flip ? '-16 126 Q62 60 132 112 T336 74 V166 H-16Z' : '-16 84 Q70 42 142 98 T336 58 V166 H-16Z')
      + '" class="gfx-paper" opacity=".72"/>'
      + '<circle cx="' + (flip ? 268 : 52) + '" cy="' + (flip ? 34 : 122) + '" r="54" class="gfx-soft" opacity=".7"/>'
      + '<rect x="' + (flip ? 34 : 238) + '" y="' + (flip ? 20 : 88)
      + '" width="58" height="42" rx="4" fill="url(#d' + u + ')"/>';
  }

  function sbArtCheck(x, y) {
    return '<g transform="translate(' + x + ',' + y + ')" filter="url(#fSTATUS)">'
      + '<circle r="18" class="gfx-coral"/>'
      + '<path d="M-8 0 l6 6 11 -13" class="gfx-check"/></g>';
  }

  const SB_ART = {
    // ---- Gemini key ---------------------------------------------------
    gemini: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g filter="url(#f' + u + ')" transform="translate(156,76) rotate(-28)" class="gfx-outline">'
        +   '<circle cx="-42" cy="0" r="29" class="gfx-teal"/>'
        +   '<circle cx="-42" cy="0" r="12" class="gfx-paper"/>'
        +   '<rect x="-14" y="-10" width="84" height="20" rx="6" class="gfx-teal"/>'
        +   '<path d="M38 9v20 M56 9v15"/>'
        + '</g>'
        + '<g class="gfx-coral">'
        +   '<path d="M250 92 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/>'
        +   '<circle cx="78" cy="34" r="5"/>'
        + '</g></svg>';
    },
    // ---- a page that writes and sends itself --------------------------
    autopilot: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, true)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="68" y="18" width="112" height="116" rx="10" class="gfx-paper"/>'
        +   '<path d="M68 30a12 12 0 0 1 12-12h88a12 12 0 0 1 12 12v16H68z" class="gfx-teal"/>'
        + '</g>'
        + '<g class="gfx-ink" opacity=".28">'
        +   '<rect x="86" y="62" width="76" height="6" rx="3"/>'
        +   '<rect x="86" y="78" width="58" height="6" rx="3"/>'
        +   '<rect x="86" y="94" width="42" height="6" rx="3"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<path d="M194 84 L270 48 L240 122 L226 96 Z" class="gfx-coral"/>'
        +   '<path d="M194 84 L270 48 L226 96 Z" class="gfx-paper"/>'
        + '</g></svg>';
    },
    // ---- local listings: a pin over a street grid ---------------------
    local: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g class="gfx-grid">'
        +   '<path d="M20 106h280M20 128h280M108 18v116M214 18v116"/>'
        + '</g>'
        + '<ellipse cx="160" cy="126" rx="26" ry="6" class="gfx-ink" opacity=".14"/>'
        + '<g filter="url(#f' + u + ')" transform="translate(160,62)" class="gfx-outline">'
        +   '<path d="M0 58S34 23 34-3A34 34 0 1 0-34-3C-34 23 0 58 0 58Z" class="gfx-coral"/>'
        +   '<circle cx="0" cy="-3" r="13" class="gfx-paper"/>'
        + '</g></svg>';
    },
    // ---- AI recommends you: an answered recommendation ----------------
    ai: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, true)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<path d="M42 24h156a16 16 0 0 1 16 16v48a16 16 0 0 1-16 16h-88l-26 22v-22H42a16 16 0 0 1-16-16V40a16 16 0 0 1 16-16Z" class="gfx-paper"/>'
        +   '<path d="M42 24h40v80H42a16 16 0 0 1-16-16V40a16 16 0 0 1 16-16Z" class="gfx-teal"/>'
        + '</g>'
        + '<g class="gfx-ink" opacity=".34">'
        +   '<rect x="102" y="47" width="76" height="7" rx="3.5"/>'
        +   '<rect x="102" y="65" width="94" height="7" rx="3.5"/>'
        +   '<rect x="102" y="83" width="58" height="7" rx="3.5"/>'
        + '</g>'
        + sbArtCheck(238, 46).replace('fSTATUS', 'f' + u)
        + '</svg>';
    },
    // ---- get listed: a stack of directories, one ticked ---------------
    listed: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="74" y="90" width="164" height="32" rx="7" class="gfx-sand"/>'
        +   '<rect x="64" y="60" width="164" height="32" rx="7" class="gfx-paper"/>'
        +   '<rect x="54" y="30" width="164" height="32" rx="7" class="gfx-teal"/>'
        + '</g>'
        + '<g class="gfx-paper"><circle cx="76" cy="46" r="6"/><rect x="92" y="42" width="72" height="8" rx="4"/></g>'
        + '<g class="gfx-ink" opacity=".28">'
        +   '<circle cx="86" cy="76" r="5"/><rect x="100" y="72" width="80" height="7" rx="3.5"/>'
        + '</g>'
        + sbArtCheck(250, 104).replace('fSTATUS', 'f' + u)
        + '</svg>';
    },
    // ---- Search Console: editorial bars and a climbing signal ----------
    gsc: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, true)
        + '<path d="M54 128h184" class="gfx-grid"/>'
        + '<path d="M58 106C102 98 136 75 176 54s43-22 68-28" class="gfx-signal"/>'
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="70" y="84" width="34" height="40" rx="5" class="gfx-sand"/>'
        +   '<rect x="116" y="62" width="34" height="62" rx="5" class="gfx-teal-soft"/>'
        +   '<rect x="162" y="38" width="34" height="86" rx="5" class="gfx-teal"/>'
        + '</g>'
        + '<path d="M258 18l-14 15-5-18Z" class="gfx-coral"/>'
        + '</svg>';
    },
    // ---- connect your website: a globe and an interlocking link --------
    ghl: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<circle cx="104" cy="74" r="43" class="gfx-teal"/>'
        + '</g>'
        + '<g class="gfx-paper-line">'
        +   '<ellipse cx="104" cy="74" rx="18" ry="42"/><path d="M64 61h80M64 87h80"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')" transform="translate(210,74) rotate(-38)" class="gfx-coral-line">'
        +   '<rect x="-54" y="-15" width="58" height="30" rx="15"/>'
        +   '<rect x="-4" y="-15" width="58" height="30" rx="15"/>'
        + '</g></svg>';
    },
    // ---- business details: a checked profile card ---------------------
    business: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, true)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="72" y="28" width="176" height="98" rx="10" class="gfx-paper"/>'
        +   '<path d="M72 40a12 12 0 0 1 12-12h152a12 12 0 0 1 12 12v16H72Z" class="gfx-teal"/>'
        + '</g>'
        + '<circle cx="112" cy="86" r="20" class="gfx-teal-soft gfx-stroke"/>'
        + '<circle cx="112" cy="79" r="7" class="gfx-paper"/>'
        + '<path d="M99 101a13 13 0 0 1 26 0Z" class="gfx-paper"/>'
        + '<g class="gfx-ink" opacity=".28">'
        +   '<rect x="148" y="72" width="72" height="7" rx="3.5"/>'
        +   '<rect x="148" y="89" width="52" height="7" rx="3.5"/>'
        + '</g>'
        + sbArtCheck(234, 108).replace('fSTATUS', 'f' + u)
        + '</svg>';
    },
    // ---- brand voice: editorial quote card ----------------------------
    brand: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="70" y="26" width="178" height="88" rx="10" class="gfx-paper"/>'
        +   '<path d="M106 114l5 22 24-22Z" class="gfx-paper"/>'
        + '</g>'
        + '<g class="gfx-coral">'
        +   '<path d="M116 52q-16 7-16 23h15v20H88V70q0-21 28-29Z"/>'
        +   '<path d="M158 52q-16 7-16 23h15v20h-27V70q0-21 28-29Z"/>'
        + '</g>'
        + '<g class="gfx-ink" opacity=".24">'
        +   '<rect x="178" y="57" width="52" height="7" rx="3.5"/>'
        +   '<rect x="178" y="75" width="40" height="7" rx="3.5"/>'
        + '</g></svg>';
    },
    // ---- lock this to you: a secured padlock --------------------------
    admin: function (u) {
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, true)
        + '<g class="gfx-ink-line thick" opacity=".8">'
        +   '<path d="M134 64V48a26 26 0 0 1 52 0v16"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')" class="gfx-outline">'
        +   '<rect x="108" y="60" width="104" height="72" rx="10" class="gfx-teal"/>'
        + '</g>'
        + '<circle cx="160" cy="90" r="9" class="gfx-paper"/>'
        + '<rect x="156.5" y="96" width="7" height="19" rx="3.5" class="gfx-paper"/>'
        + '<circle cx="222" cy="38" r="7" class="gfx-coral"/></svg>';
    },
    // ---- keep your history: stacked records with a confirmation --------
    storage: function (u) {
      var band = function (y, top) {
        return '<path d="M98 ' + y + 'v-24h124v24" class="' + (top ? 'gfx-paper' : 'gfx-teal-soft') + ' gfx-stroke"/>'
          + '<ellipse cx="160" cy="' + y + '" rx="62" ry="17" class="'
          + (top ? 'gfx-paper' : 'gfx-teal-soft') + ' gfx-stroke"/>';
      };
      return sbArtOpen(u) + sbArtDefs(u) + sbArtBackdrop(u, false)
        + '<g filter="url(#f' + u + ')">'
        +   band(112, false) + band(86, false) + band(60, true)
        + '</g>'
        + sbArtCheck(230, 108).replace('fSTATUS', 'f' + u)
        + '</svg>';
    }
  };

  // Unknown keys get the neutral card rather than a hole in the layout.
  function sbArt(key, wide) {
    const f = SB_ART[key] || SB_ART.business;
    SB_ART_FIT = wide ? 'meet' : 'slice';
    const out = f('x' + (++SB_ART_N));
    SB_ART_FIT = 'slice';
    return out;
  }

  // `art` draws the illustration panel. Today's single card and the Explore
  // gallery share this builder, and only the gallery asks for artwork.
  function sbStepCard(st, hero, art) {
    const p = st.pillar || '';
    const tint = p || (st.kind === 'protect' ? 'neutral' : 'p5');
    const artPanel = art
      ? '<div class="sb-art ' + tint + '">' + sbArt(st.key, hero) + '</div>'
      : '';
    const badge = st.kind === 'unlock'
      ? '<span class="pts ' + p + '">+' + st.points + ' pts</span>'
      : (st.badge ? '<span class="pts">' + st.badge + '</span>' : '');
    const mins = st.minutes < 1 ? 'about 10 seconds' : ('about ' + st.minutes + ' minute' + (st.minutes > 1 ? 's' : ''));
    const capLabel = { automatic: '&#10003; Automatic', approve: '&#9654; Needs approval', manual: '&#9679; You do it', blocked: '&#9650; Blocked until connected' }[st.cap] || '';
    const why = st.locked
      ? 'Needs your Gemini key first — it is the step above this one.'
      : st.why;
    const notBtn = '<button class="' + (art ? 'nn' : 'gho') + '" data-not="1" type="button">Not now</button>';
    const acts = st.kind === 'protect'
      ? '<button class="gho" data-go="1" type="button">' + st.cta + '</button>'
      : '<button class="pri" data-go="1" type="button"' + (st.locked ? ' disabled' : '') + '>' + st.cta + '</button>'
        + '<button class="gho" data-how="1" type="button">Show me how</button>'
        + notBtn;
    // With artwork the icon chip is redundant — the picture already says what
    // this is — so the title row drops it and keeps the badge.
    const r1 = art
      ? '<div class="r1"><h4>' + st.title + '</h4>' + badge + '</div>'
      : '<div class="r1"><span class="ic ' + p + '">' + st.icon + '</span><h4>' + st.title + '</h4>' + badge + '</div>';
    return '<div class="sb-card is-open' + (hero ? ' hero' : '') + (art ? ' illus' : '') + (st.kind === 'protect' ? ' protect' : '') + (st.locked ? ' locked' : '') + '" data-key="' + st.key + '">'
      + artPanel
      + '<div class="sb-body">'
      +   r1
      +   '<p>' + why + '</p>'
      +   '<div class="meta"><span class="sb-cap ' + st.cap + '">' + capLabel + '</span><span class="time">' + mins + '</span></div>'
      +   '<div class="acts">' + acts + '</div>'
      + '</div></div>';
  }

  function sbWireCards(host, steps) {
    host.querySelectorAll('.sb-card').forEach(card => {
      const st = steps.find(x => x.key === card.dataset.key); if (!st) return;
      const go = card.querySelector('[data-go]');
      if (go && !st.locked) go.addEventListener('click', () => {
        if (st.action) return runMoveAction({ action: st.action, tab: st.tab }, go);
        if (st.act === 'setup') { const b = document.getElementById('btn-open-setup'); if (b) b.click(); return; }
        if (st.tab) switchTab(st.tab);
      });
      const how = card.querySelector('[data-how]');
      // The 14-step tour taught you where things are. This answers the only
      // question that matters at this moment: how do I do this one thing.
      if (how) how.addEventListener('click', () => {
        const fab = document.getElementById('asst-fab'); if (fab) fab.click();
        setTimeout(() => {
          const t = document.getElementById('asst-text'), s = document.getElementById('asst-send');
          // Phrased from the step's own title so it reads naturally for all of
          // them — "How do I add your Gemini key?" did not.
          if (t && s) { t.value = st.title + ' — how do I do this?'; s.click(); }
        }, 300);
      });
      const open = card.querySelector('[data-open]');
      if (open) open.addEventListener('click', () => {
        switchTab(st.tab || SB_DONE_TAB[st.key] || 'settings-tab');
      });
      const not = card.querySelector('[data-not]');
      if (not) not.addEventListener('click', () => { sbSnooze(st.key); if (window.loadGetStarted) window.loadGetStarted(); });
    });
  }

  async function sbFetchSteps() {
    const [rd, hs] = await Promise.all([
      fetch('/api/deploy-readiness').then(r => r.json()).catch(() => null),
      fetch('/api/health-score').then(r => r.json()).catch(() => null)
    ]);
    return sbBuildSteps(rd, hs);
  }

  async function loadGetStarted() {
    const host = document.getElementById('exp-getstarted');
    if (!host) return;
    const steps = await sbFetchSteps();
    const done    = steps.filter(s => s.done);
    const open    = steps.filter(s => !s.done && !sbIsSnoozed(s.key));
    const scoring = open.filter(s => s.kind !== 'protect');
    const protect = open.filter(s => s.kind === 'protect');

    // This used to return early with "You're set up" and render nothing else,
    // so a fully-configured install had no guide at all — the one screen the
    // whole card layout exists for went blank the moment it was earned.
    // Explore is a gallery of everything the app does, not a setup wizard, so
    // finished steps stay on the shelf as cards you can reopen.
    const mins = open.reduce((s, x) => s + x.minutes, 0);
    const taps = open.filter(x => x.minutes <= 1).length;

    const onlyProtect = open.length > 0 && scoring.length === 0;

    let head;
    if (!open.length) {
      head = '<div class="sb-gs-hdr"><div class="t"><b>You&rsquo;re all set</b>'
        + '<span>' + done.length + ' of ' + steps.length + '</span></div>'
        + '<div class="pbar">' + steps.map(() => '<i class="on"></i>').join('') + '</div>'
        + '<p>Everything is running. Below is every tool, so you can look at what '
        + 'SEO Buddy does and run any of it again whenever you want.</p></div>';
    } else {
      // With every scoring step finished, "Get started" is the wrong promise and
      // the leftover work is all of the no-points kind. Say that outright rather
      // than leaving the reader to reconcile "1 left" against a page of ticks.
      head = '<div class="sb-gs-hdr"><div class="t"><b>'
        + (onlyProtect ? 'Almost there' : 'Get started') + '</b>'
        + '<span>' + done.length + ' of ' + steps.length + ' done</span></div>'
        // Fill from the left. `steps` is sorted with completed items last, so
        // mapping over it directly put the finished segment on the right.
        + '<div class="pbar">' + steps.map((s, i) =>
            '<i class="' + (i < done.length ? 'on' : (i === done.length ? 'now' : '')) + '"></i>').join('') + '</div>'
        + '<p>' + (onlyProtect
            ? (open.length === 1 ? 'One thing left' : open.length + ' things left')
              + ', about ' + Math.round(mins) + ' minutes. '
              + (open.length === 1 ? 'It will not' : 'They will not')
              + ' change your score \u2014 ' + (open.length === 1 ? 'it protects' : 'they protect')
              + ' what is already running.'
            : open.length + ' left, about ' + Math.round(mins) + ' minutes in total'
              + (taps ? (taps === 1 ? '. One of them is a single tap.' : '. ' + taps + ' of them are a single tap.') : '.'))
        + '</p></div>';
    }

    let html = head;
    if (scoring.length) {
      html += sbCardCarousel(
        'Recommended next steps',
        'Recommended SEO Buddy setup steps',
        scoring,
        s => sbStepCard(s, true, true)
      );
    }
    if (protect.length) {
      html += sbCardCarousel(
        'Still to do',
        'Protective SEO Buddy setup steps',
        protect,
        s => sbStepCard(s, true, true),
        (protect.length === 1 ? 'this one will not' : 'these will not') + ' change your score'
      );
    }
    if (done.length) {
      html += sbCardCarousel(
        'Already running',
        'SEO Buddy tools that are already running',
        done,
        s => sbDoneCard(s, true)
      );
    }
    html += '<div class="sb-eyebrow">All tools</div>';
    host.innerHTML = html;
    sbWireCards(host, steps);
    host.querySelectorAll('.sb-explore-step').forEach(carousel => {
      sbWireStepper(carousel, Number(carousel.dataset.total));
    });
  }

  // Explore keeps every card available without stacking the whole catalogue
  // down the page. This uses the same markup and controller as Today's guided
  // setup, so swipe, arrows, dots and keyboard navigation behave identically.
  function sbCardCarousel(title, ariaLabel, items, renderCard, note) {
    const total = items.length;
    const controls = total > 1;
    return '<section class="sb-step sb-explore-step" data-total="' + total
      + '" aria-roledescription="carousel" aria-label="' + ariaLabel + '">'
      + '<div class="sb-step-hdr">'
      +   '<b>' + title + '</b>'
      +   (note ? '<span class="sb-step-note">' + note + '</span>' : '')
      +   (controls ? '<span class="sb-step-pos" aria-live="polite">1 of ' + total + '</span>' : '')
      + '</div>'
      + '<div class="sb-step-rail">'
      +   (controls ? '<button class="sb-step-nav prev" type="button" aria-label="Previous card" disabled>'
      +     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>' : '')
      +   '<div class="sb-track" tabindex="0" role="group" aria-label="' + ariaLabel + '">'
      +     items.map((item, i) => '<div class="sb-slide" role="group" aria-roledescription="slide" aria-label="'
      +       (i + 1) + ' of ' + total + '">' + renderCard(item) + '</div>').join('')
      +   '</div>'
      +   (controls ? '<button class="sb-step-nav next" type="button" aria-label="Next card">'
      +     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button>' : '')
      + '</div>'
      + (controls ? '<div class="sb-dots">'
      +   items.map((item, i) => '<button class="sb-stepdot' + (i ? '' : ' on') + '" type="button" data-i="' + i
      +     '" aria-label="Show card ' + (i + 1) + ' of ' + total + ': '
      +     item.title.replace(/["<>]/g, '') + '"></button>').join('')
      + '</div>' : '')
      + '</section>';
  }

  // A finished step, still on the shelf. Same artwork, muted, and the only
  // action is "Open" — it is a reference card now, not a task.
  // Where a finished step sends you, for the ones whose only handler was an
  // action rather than a destination.
  const SB_DONE_TAB = { autopilot: 'performance-tab', business: 'settings-tab' };

  function sbDoneCard(st, hero) {
    const p = st.pillar || '';
    const tint = p || (st.kind === 'protect' ? 'neutral' : 'p5');
    const worth = st.kind === 'unlock' ? '+' + st.points + ' pts' : (st.badge || 'done');
    return '<div class="sb-card illus is-done' + (hero ? ' hero' : '') + '" data-key="' + st.key + '">'
      + '<div class="sb-art ' + tint + '">' + sbArt(st.key, hero) + '</div>'
      + '<div class="sb-body">'
      +   '<div class="r1"><h4>' + st.title + '</h4>'
      +     '<span class="pts done"><span class="tk">&#10003;</span>' + worth + '</span></div>'
      +   '<p>' + st.why + '</p>'
      +   '<div class="acts"><button class="gho" data-open="1" type="button">Open</button></div>'
      + '</div></div>';
  }
  window.loadGetStarted = loadGetStarted;
  window.__art = sbArt;   // test hook: render one illustration in isolation
  window.SeoBuddyArtwork = Object.freeze({ render: sbArt });

  // Today shows exactly one. Nobody meets nine cards at once.
  // Today used to render exactly one card and silently swap it for the next one
  // when you finished. One at a time, but with no sense that ten more existed —
  // no position, no way back, no way to look ahead. This is the same set as the
  // Explore gallery, presented as a guided walk: one card fills the column,
  // swipe or arrow to move, dots for position. It collapses once nothing is open.
  async function loadTodayTop(prefetched) {
    const host = document.getElementById('td-getstarted'); if (!host) return;
    const steps = prefetched
      ? sbBuildSteps(prefetched.readiness, prefetched.health)
      : await sbFetchSteps();
    const done  = steps.filter(s => s.done);
    // Locked steps stay in the walk so you can see what the key unlocks; the
    // protective ones do not — they score nothing and would pad the count.
    const open  = steps.filter(s => !s.done && s.kind !== 'protect' && !sbIsSnoozed(s.key));
    if (!open.length) { host.innerHTML = ''; return; }

    const total = open.length;
    host.innerHTML =
      '<section class="sb-step" aria-roledescription="carousel" aria-label="Set up SEO Buddy">'
      + '<div class="sb-step-hdr">'
      +   '<b>Set up SEO Buddy</b>'
      +   '<span class="sb-step-pos" aria-live="polite">1 of ' + total + '</span>'
      + '</div>'
      + '<div class="sb-step-rail">'
      +   '<button class="sb-step-nav prev" type="button" aria-label="Previous step" disabled>'
      +     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19"/></svg></button>'
      +   '<div class="sb-track" tabindex="0" role="group" aria-label="Setup steps">'
      +     open.map(st => '<div class="sb-slide">' + sbStepCard(st, true, true) + '</div>').join('')
      +   '</div>'
      +   '<button class="sb-step-nav next" type="button" aria-label="Next step">'
      +     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5 L16 12 L9 19"/></svg></button>'
      + '</div>'
      + '<div class="sb-dots">'
      // NB the single `+` on the continuation line. It was doubled here, which
      // made it a unary plus on the following string literal: `i + (+'" aria-…')`
      // evaluates to NaN, so every dot rendered as data-i="NaN" with no label,
      // and clicking any of them scrolled to 0 instead of to that step.
      +   open.map((st, i) => '<button class="sb-stepdot' + (i ? '' : ' on') + '" type="button" data-i="' + i
      +     '" aria-label="Step ' + (i + 1) + ' of ' + total + ': ' + st.title.replace(/"/g, '') + '"></button>').join('')
      + '</div>'
      // Deliberately not "N of 11": the walk holds only the scoring steps that
      // are still open, so quoting the full catalogue here reads as a mismatch
      // against the "1 of 6" above it.
      + '<p class="sb-step-foot">' + done.length + ' done so far'
      +   (total > 1 ? ' &middot; swipe or use the arrows to look ahead' : '') + '</p>'
      + '</section>';

    sbWireCards(host, steps);
    sbWireStepper(host, total);
  }
  window.loadTodayTop = loadTodayTop;

  // Scroll-snap does the swiping; this only keeps the chrome in sync with it and
  // lets the arrows and dots drive the same scroll. Deriving the index from
  // scrollLeft (rather than tracking it separately) means a native swipe, an
  // arrow click and a dot click can never disagree.
  // One window listener serves the current tracks. Re-rendered carousels can be
  // collected instead of being retained by a new global listener every visit.
  window.addEventListener('resize', () => {
    document.querySelectorAll('.sb-track').forEach(track => track.dispatchEvent(new Event('sb:resize')));
  });
  function sbWireStepper(host, total) {
    const track = host.querySelector('.sb-track');
    const prev  = host.querySelector('.sb-step-nav.prev');
    const next  = host.querySelector('.sb-step-nav.next');
    const pos   = host.querySelector('.sb-step-pos');
    const dots  = Array.from(host.querySelectorAll('.sb-stepdot'));
    if (!track) return;

    const step = () => {
      const a = track.querySelector('.sb-slide');
      return a ? a.getBoundingClientRect().width + 16 : track.clientWidth;
    };
    const index = () => Math.round(track.scrollLeft / step());
    const goTo = (i) => {
      const n = Math.max(0, Math.min(total - 1, i));
      track.scrollTo({ left: n * step(), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };

    function sync() {
      const i = index();
      if (pos) pos.textContent = (i + 1) + ' of ' + total;
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= total - 1;
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
    }

    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; sync(); });
    });
    if (prev) prev.addEventListener('click', () => goTo(index() - 1));
    if (next) next.addEventListener('click', () => goTo(index() + 1));
    dots.forEach(d => d.addEventListener('click', () => goTo(+d.dataset.i)));
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index() + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(index() - 1); }
    });
    // A resize changes the slide width, so the saved scroll offset would land
    // between two cards. Re-snap to whichever one was showing.
    let rt = 0;
    track.addEventListener('sb:resize', () => {
      clearTimeout(rt);
      const i = index();
      rt = setTimeout(() => { track.scrollTo({ left: i * step() }); sync(); }, 150);
    });
    sync();
  }

  // --- EXPLORE: grouped menu of every tool (routes to existing tabs) ---
  const EXP_ICONS = {
    table:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    globe:'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    upload:'<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
    code:'<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    bars:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    todo:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    brief:'<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    compass:'<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    chat:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    chev:'<polyline points="9 6 15 12 9 18"/>'
  };
  function expIc(n){ return '<svg viewBox="0 0 24 24">' + (EXP_ICONS[n] || '') + '</svg>'; }
  const EXPLORE_GROUPS = [
    { g: 'Get found', items: [
      { icon: 'table', b: "Searches you're missing", s: 'Where you show up but get no clicks', tab: 'gsc-tab' },
      { icon: 'link', b: 'Where to get listed', s: 'Sites AI pulls from', tab: 'citations-tab' } ] },
    { g: 'Your content', items: [
      { icon: 'dollar', b: 'Create a post', s: 'Write an article — from a keyword, or from your own recording', tab: 'ai-tab' },
      { icon: 'brief', b: 'Brand voice', s: 'Your tone, phrases, and the words to never use', tab: 'brand-tab' },
      { icon: 'upload', b: 'Publish & list on Google', s: 'Push content live, ask Google to list it', tab: 'publish-tab' },
      { icon: 'code', b: 'Site optimization', s: 'Titles, links, business details', tab: 'onsite-tab' } ] },
    { g: 'Your presence', items: [
      { icon: 'pin', b: 'Local presence', s: 'Listings, reviews, Google posts', tab: 'local-tab' },
      { icon: 'globe', b: 'AI visibility', s: "Do ChatGPT & Google's AI recommend you", tab: 'aio-tab' },
      { icon: 'bars', b: 'Reviews site', s: 'Review counts, growth & structured-data health', tab: 'reviews-tab' } ] },
    { g: 'More detail', items: [
      { icon: 'bars', b: 'Full dashboard', s: 'The detailed metrics view', tab: 'summary-tab' },
      { icon: 'todo', b: 'All to-dos', s: 'Your full prioritized list', tab: 'grow-tab' } ] },
    { g: 'Setup & help', items: [
      { icon: 'brief', b: 'Setup & business info', s: 'Your details + readiness check', act: 'setup' },
      { icon: 'chat', b: 'Ask SEO Buddy', s: 'Chat with your AI assistant', act: 'ask' },
      { icon: 'gear', b: 'Settings', s: 'Connections & account', tab: 'settings-tab' } ] }
  ];
  function loadExplore(){
    if (!workspaceEnabled) loadGetStarted();
    const host = document.getElementById('exp-groups'); if (!host) return;
    host.innerHTML = EXPLORE_GROUPS.map(function(grp){
      return '<div class="exp-group"><div class="exp-gl">' + grp.g + '</div><div class="exp-list">' + grp.items.map(function(it){
        const key = it.tab ? ('tab:' + it.tab) : ('act:' + it.act);
        return '<div class="exp-row" data-go="' + key + '"><div class="exp-ic">' + expIc(it.icon) + '</div><div class="exp-t"><b>' + it.b + '</b><span>' + it.s + '</span></div><div class="exp-chev">' + expIc('chev') + '</div></div>';
      }).join('') + '</div></div>';
    }).join('');
    host.querySelectorAll('.exp-row').forEach(function(row){
      bindAction(row, function(){
        const go = row.getAttribute('data-go') || '';
        if (go.indexOf('tab:') === 0) { switchTab(go.slice(4)); }
        else if (go === 'act:setup') { const b = document.getElementById('btn-open-setup'); if (b) b.click(); }
        else if (go === 'act:ask') { const b = document.getElementById('asst-fab'); if (b) b.click(); }
      });
    });
    if (workspaceEnabled) window.SeoBuddyWorkspace?.enhanceTools();
  }
  window.loadExplore = loadExplore;

  // --- GROW: full prioritized action list + tool shortcuts ---
  async function loadGrow() {
    const el = document.getElementById('grow-moves');
    if (!el) return;
    try {
      const nm = await (await fetch('/api/next-moves')).json();
      const moves = (nm && nm.moves) || [];
      const tagLabel = { high: 'High impact', med: 'Quick win', opportunity: 'Opportunity' };
      if (!moves.length) { el.innerHTML = '<div class="text-muted" style="font-size:var(--font-sm);">You’re all caught up — nothing needs your attention right now. </div>'; return; }
      el.innerHTML = moves.map(m => `<div class="gmove ${m.impact === 'high' ? 'high' : ''}">
        <div><div class="gmove-t">${sumEsc(m.title)}</div><div class="gmove-w">${sumEsc(m.why)}</div></div>
        <div class="gmove-r"><span class="gmtag ${m.impact}">${tagLabel[m.impact] || ''}</span><button class="btn btn-primary" type="button">${sumEsc(m.cta || 'Review')}</button></div>
      </div>`).join('');
      el.querySelectorAll('.gmove-r .btn').forEach((b, i) => b.addEventListener('click', () => runMoveAction(moves[i], b)));
    } catch (e) { el.innerHTML = '<div class="text-muted" style="font-size:var(--font-sm);">Couldn’t load your action list.</div>'; }
  }
  window.loadGrow = loadGrow;
  document.querySelectorAll('#grow-tab .grow-tool').forEach(c => bindAction(c, () => homeGoTab(c.dataset.tab)));

  async function loadSummary() {
    const [aioRes, gscRes, histRes] = await Promise.allSettled([
      fetch('/api/aio-history').then(r => r.json()),
      fetch('/api/gsc-data').then(r => r.json()),
      fetch('/api/history').then(r => r.json())
    ]);

    const audits = (aioRes.status === 'fulfilled' && Array.isArray(aioRes.value)) ? aioRes.value : [];
    const gsc = (gscRes.status === 'fulfilled' && gscRes.value) ? gscRes.value : { source: '', data: [] };
    const gscData = Array.isArray(gsc.data) ? gsc.data : [];
    const history = (histRes.status === 'fulfilled' && Array.isArray(histRes.value)) ? histRes.value : [];

    const $ = id => document.getElementById(id);
    if (!$('sum-updated')) return; // summary DOM not present

    loadHome();
    $('sum-updated').innerText = new Date().toLocaleTimeString();

    // Data-source badge (the search numbers are the ones that can be demo data)
    const badge = $('sum-data-badge');
    if (gsc.source === 'live_gsc') {
      badge.className = 'sum-badge live';
      badge.innerText = 'Live Search Console data';
    } else if (gsc.source === 'mock_data') {
      badge.className = 'sum-badge demo';
      badge.innerText = 'Demo search data — connect Search Console for live numbers';
    } else {
      badge.className = 'sum-badge demo';
      badge.innerText = 'Search Console unavailable — no demo data substituted';
    }

    // ---- AI VISIBILITY ----
    const nAudits = audits.length;
    const recommended = audits.filter(a => a.recommended).length;
    const rate = nAudits ? Math.round((recommended / nAudits) * 100) : 0;
    let vColor = 'var(--text-dark)';
    if (nAudits) vColor = rate >= 60 ? 'var(--color-success)' : (rate >= 1 ? 'var(--color-warning)' : 'var(--color-accent)');
    $('sum-aiviz-pct').innerText = nAudits ? rate + '%' : '—';
    $('sum-aiviz-dot').style.background = vColor;
    $('sum-kpi-aiviz').style.setProperty('--kpi-accent', vColor);
    $('sum-aiviz-sub').innerText = nAudits
      ? `Recommended in ${recommended} of ${nAudits} AI check${nAudits > 1 ? 's' : ''} run.`
      : 'Run an AI Search Audit to start measuring this.';

    const donut = $('sum-donut');
    donut.style.background = `conic-gradient(${vColor} 0 ${rate}%, var(--gauge-track) ${rate}% 100%)`;
    $('sum-donut-num').innerText = nAudits ? rate + '%' : '—';

    const standing = $('sum-standing-text');
    if (!nAudits) standing.innerText = 'Run an AI Search Audit to see whether AI recommends you.';
    else if (rate === 0) standing.innerText = "AI isn't recommending Best Day Fitness yet for the searches you've checked — that's the gap to close with new content.";
    else standing.innerText = `AI recommended Best Day Fitness in ${rate}% of the searches you've checked so far.`;

    // ---- COMPETITORS (aggregated across audits by frequency) ----
    const compCounts = {};
    audits.forEach(a => (a.competitors || []).forEach(c => {
      const name = String(c || '').trim();
      if (name) compCounts[name] = (compCounts[name] || 0) + 1;
    }));
    const compSorted = Object.keys(compCounts).sort((a, b) => compCounts[b] - compCounts[a]);
    $('sum-comp-count').innerText = nAudits ? compSorted.length : '—';

    const compList = $('sum-comp-list');
    if (compSorted.length) {
      compList.innerHTML = compSorted.slice(0, 5).map((name, i) =>
        `<li><span class="sum-comp-rank">${i + 1}</span> ${sumEsc(name)}</li>`).join('');
    } else {
      compList.innerHTML = nAudits
        ? '<li style="border:none;color:var(--text-muted);">No competitors named in your audits yet.</li>'
        : '';
    }

    // ---- SEARCH OPPORTUNITIES ----
    const leaks = gscData.filter(d => d.leak);
    const totalImpr = leaks.reduce((s, d) => s + (d.impressions || 0), 0);
    $('sum-opps-count').innerText = leaks.length;
    $('sum-opps-extra').innerText = leaks.length ? `~${totalImpr.toLocaleString()} times a month you were shown but got nothing` : '';

    const barsWrap = $('sum-opps-bars');
    const topLeaks = leaks.slice().sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 5);
    if (topLeaks.length) {
      const maxImpr = topLeaks[0].impressions || 1;
      barsWrap.innerHTML = topLeaks.map(d => {
        const w = Math.max(6, Math.round(((d.impressions || 0) / maxImpr) * 100));
        return `<div class="sum-bar-row">
          <div class="sum-bar-top"><span>${sumEsc(d.query)}</span><span class="sum-bar-val">${(d.impressions || 0).toLocaleString()}/mo</span></div>
          <div class="sum-bar-track"><div class="sum-bar-fill" style="width:${w}%"></div></div>
        </div>`;
      }).join('');
    } else {
      barsWrap.innerHTML = '<div class="sum-empty">No search opportunities detected right now. Connect Search Console to see your real gaps.</div>';
    }

    // ---- CONTENT PUBLISHED ----
    const nContent = history.length;
    const submitted = history.filter(h => /requested|indexed/i.test(h.indexed || '')).length;
    $('sum-content-count').innerText = nContent;
    $('sum-content-extra').innerText = nContent ? `${submitted} submitted to Google for listing` : '';

    const contentList = $('sum-content-list');
    if (nContent) {
      contentList.innerHTML = history.slice(0, 5).map(h => {
        const done = /requested|indexed/i.test(h.indexed || '');
        const badgeColor = done ? 'var(--color-success)' : 'var(--text-muted)';
        const badgeText = done ? 'Sent to Google' : 'Not yet submitted';
        return `<div class="sum-content-item">
          <span class="sum-content-name">${sumEsc(h.title || h.keyword || 'Untitled page')}</span>
          <span style="font-size:var(--font-xs);color:${badgeColor};white-space:nowrap;">${badgeText}</span>
        </div>`;
      }).join('');
    } else {
      contentList.innerHTML = '<div class="sum-empty">No pages published through SEO Buddy yet. Create one from a search opportunity to get started.</div>';
    }

    // ---- MOMENTUM (AI visibility trend over time) ----
    const trendEl = $('sum-aiviz-trend');
    if (trendEl) {
      trendEl.style.display = 'inline-block';
      if (nAudits >= 2) {
        const sorted = audits.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const mid = Math.floor(sorted.length / 2);
        const rrate = arr => arr.length ? (arr.filter(a => a.recommended).length / arr.length) * 100 : 0;
        const delta = Math.round(rrate(sorted.slice(mid)) - rrate(sorted.slice(0, mid)));
        if (delta > 0) { trendEl.className = 'sum-trend up'; trendEl.innerText = `▲ ${delta} pts vs earlier`; }
        else if (delta < 0) { trendEl.className = 'sum-trend down'; trendEl.innerText = `▼ ${Math.abs(delta)} pts vs earlier`; }
        else { trendEl.className = 'sum-trend flat'; trendEl.innerText = 'No change vs earlier'; }
      } else {
        trendEl.className = 'sum-trend flat';
        trendEl.innerText = 'Run audits over time to track momentum';
      }
    }

    // ---- SECONDARY STATS ----
    const allImpr = gscData.reduce((s, d) => s + (d.impressions || 0), 0);
    $('sum-impr').innerText = allImpr.toLocaleString();
    const ranked = gscData.filter(d => (d.position || 0) > 0);
    const avgRank = ranked.length ? (ranked.reduce((s, d) => s + d.position, 0) / ranked.length) : 0;
    $('sum-rank').innerText = avgRank ? avgRank.toFixed(1) : '—';
    $('sum-keywords').innerText = gscData.length;
    $('sum-indexed').innerText = history.filter(h => /requested|indexed/i.test(h.indexed || '')).length;

    // ---- FINANCIAL ESTIMATES (owner-set assumptions, clearly labeled as estimates) ----
    const clientValue = parseFloat(localStorage.getItem('seo_client_value')) || 1395;
    const convRate = (parseFloat(localStorage.getItem('seo_conv_rate')) || 2) / 100;
    const captureRate = (parseFloat(localStorage.getItem('seo_capture_rate')) || 5) / 100;
    const valuePerVisit = clientValue * convRate;
    const money = v => '$' + Math.round(v).toLocaleString();

    const leakImprSum = leaks.reduce((s, d) => s + (d.impressions || 0), 0);
    const oppVisits = Math.round(leakImprSum * captureRate);
    const oppClients = oppVisits * convRate;
    const oppValue = oppVisits * valuePerVisit;
    const allClicks = gscData.reduce((s, d) => s + (d.clicks || 0), 0);
    const curValue = allClicks * valuePerVisit;

    $('sum-opp-value').innerText = leaks.length ? money(oppValue) + '/mo' : '$0';
    $('sum-opp-value-sub').innerText = leaks.length
      ? `Win your ${leaks.length} search gap${leaks.length > 1 ? 's' : ''}: ~${oppVisits.toLocaleString()} more visits/mo, ~${oppClients.toFixed(1)} new clients/mo.`
      : 'No open search gaps detected right now.';
    $('sum-opp-assump').innerText = `Assumes ${Math.round(captureRate * 100)}% of these searches become visits, ${(convRate * 100).toFixed(1)}% convert, at ${money(clientValue)}/client.`;

    $('sum-cur-value').innerText = money(curValue) + '/mo';
    $('sum-cur-value-sub').innerText = `Your ~${allClicks.toLocaleString()} current search clicks/mo, valued at ${money(valuePerVisit)}/visit.`;
  }

  // Load only the visible landing screen. Search Console, publish status, and
  // the full dashboard now initialize when their tabs are opened instead of
  // competing with first paint and duplicating hidden API work.
  if (workspaceEnabled) {
    window.SeoBuddyCore.loadFeature('workspaceAsset', () => !!window.SeoBuddyWorkspace, 'Owner workspace')
      .then(() => window.SeoBuddyWorkspace.start(switchTab))
      .catch(() => {
        const error = document.getElementById('ws-load-error');
        error.textContent = 'Could not load the workspace. Reload to retry, or open the recovery interface.';
        error.hidden = false;
        document.getElementById('ws-classic').hidden = false;
      });
  } else if (state.activeTab === 'today-tab') {
    loadToday();
  } else {
    fetch('/api/health-score')
      .then(r => r.json())
      .then(setDataModeFromHealthScore)
      .catch(() => setDataMode('unavailable'));
  }
  const sumRefreshBtn = document.getElementById('sum-refresh');
  if (sumRefreshBtn) sumRefreshBtn.addEventListener('click', loadSummary);
  const sumEditAssump = document.getElementById('sum-edit-assump');
  if (sumEditAssump) sumEditAssump.addEventListener('click', () => switchTab('settings-tab'));

  setInterval(() => {
    if (state.activeTab === 'publish-tab') {
      if (window.SeoBuddyContent) window.SeoBuddyContent.loadPublishWorkspace();
    }
  }, 12000);

  // Summary auto-refresh (real-time while the tab is open)
  setInterval(() => {
    if (state.activeTab === 'summary-tab') loadSummary();
  }, 30000);

  // AI Visibility tools load only when their tab is opened.
  // Citation outreach is loaded only when its tab is opened.
  // Local Presence tools load only when their tab is opened.
  // Preserve the existing startup read that captures the daily performance snapshot
  // without shipping the Progress rendering and controls on the initial path.
  fetch('/api/performance').catch(() => {});
  // Progress UI loads only when its tab is opened.
  // Site Optimization tools load only when their tab is opened.
  // The 14-step guided tour was retired in favour of the per-card
  // "Show me how" on each get-started card, which answers the only question
  // that matters at that moment. Its markup, styles and this block are gone;
  // the separate SETUP wizard (business info + readiness) is untouched.

  // --- USAGE & COST METERING (Settings card) ---
  async function loadUsage() {
    const $ = id => document.getElementById(id);
    if (!$('usage-cost')) return;
    try {
      const r = await fetch('/api/usage'); const d = await r.json(); const u = d.usage || {};
      $('usage-month').innerText = d.month || 'this month';
      $('usage-cost').innerText = '$' + (u.estCostUSD || 0).toFixed(2);
      $('usage-stats').innerHTML = [
        ['Assistant chats', u.assistantMessages || 0],
        ['AI checks run', (u.groundedCalls || 0) + (u.openaiCalls || 0) + (u.perplexityCalls || 0)],
        ['Analyses', u.geminiCalls || 0],
        ['Articles', u.articles || 0]
      ].map(x => `<div class="usage-stat"><div class="n">${x[1]}</div><div class="l">${x[0]}</div></div>`).join('');
      const bi = $('usage-budget'); if (document.activeElement !== bi) bi.value = d.budgetUSD != null ? d.budgetUSD : '';
      const wrap = $('usage-bar-wrap');
      if (d.budgetUSD != null && d.budgetUSD > 0) {
        const pct = Math.min(100, Math.round((u.estCostUSD || 0) / d.budgetUSD * 100));
        wrap.style.display = 'block'; $('usage-bar').style.width = pct + '%';
        $('usage-bar-label').innerText = `$${(u.estCostUSD || 0).toFixed(2)} of $${d.budgetUSD} cap` + (d.overBudget ? ' — reached, AI paused for the month' : '');
        $('usage-cost').className = d.overBudget ? 'usage-over' : '';
      } else { wrap.style.display = 'none'; $('usage-cost').className = ''; }
    } catch (e) { /* keep */ }
  }
  window.loadUsage = loadUsage;
  const ubSave = document.getElementById('usage-budget-save');
  if (ubSave) ubSave.addEventListener('click', async () => {
    const v = document.getElementById('usage-budget').value;
    ubSave.disabled = true; const o = ubSave.innerText; ubSave.innerText = 'Saving…';
    try {
      const r = await authFetch('/api/usage/budget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ budgetUSD: v === '' ? null : Number(v) }) });
      const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Failed');
      document.getElementById('usage-budget-note').innerText = d.budgetUSD != null ? ('✓ Cap set to $' + d.budgetUSD) : '✓ No cap';
      loadUsage();
    } catch (e) { alert('Could not save the cap: ' + e.message); }
    finally { ubSave.disabled = false; ubSave.innerText = o; }
  });

  // --- PDF REPORT (loaded only when requested) ---

  function ensurePdfReportFeature() {
    return window.SeoBuddyCore.loadFeature('pdfReportAsset', () => !!(window.SeoBuddyPdfReport && window.SeoBuddyPdfReport.generate), 'PdfReport');
  }

  async function generateSeoReportPdf() {
    await ensurePdfReportFeature();
    if (!window.SeoBuddyPdfReport || !window.SeoBuddyPdfReport.generate) {
      throw new Error('The PDF report feature is unavailable.');
    }
    return window.SeoBuddyPdfReport.generate();
  }

  window.generateSeoReportPdf = generateSeoReportPdf;
  const pdfBtn = document.getElementById('perf-download-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true; const original = pdfBtn.innerHTML; pdfBtn.innerHTML = 'Building…';
    try { await generateSeoReportPdf(); } catch (error) { alert('Could not build the PDF: ' + error.message); }
    finally { pdfBtn.disabled = false; pdfBtn.innerHTML = original; }
  });
  // --- ONBOARDING SETUP WIZARD ---
  (function () {
    const overlay = document.getElementById('setup-overlay');
    if (!overlay) return;
    const bodyEl = document.getElementById('setup-body');
    const dotsEl = document.getElementById('setup-dots');
    const backBtn = document.getElementById('setup-back');
    const nextBtn = document.getElementById('setup-next');
    const closeBtn = document.getElementById('setup-close');
    let step = 0, profile = {};
    const TOTAL = 4;
    const sEsc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
    const gv = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };

    function stepHTML(i) {
      if (i === 0) return `<div class="setup-emoji"></div><h2>Is this location ready to run on its own?</h2><p class="lead">SEO Buddy checks the six things every location needs to run hands-off. Green means it's wired up — fix anything flagged and this profile is fully self-driving. You can revisit this anytime from <b>Setup &amp; business info</b>.</p><div id="setup-readiness"><div class="rd-loading">Checking this location…</div></div>`;
      if (i === 1) return `<h2>Your business details</h2><p class="lead">Google and AI trust businesses whose name, address, and phone match everywhere online — so it's worth getting these exactly right. This is the identity SEO Buddy keeps consistent for you across the web.</p>
        <div class="setup-field"><label>Business name</label><input class="form-input" id="setup-name" value="${sEsc(profile.name)}"></div>
        <div class="setup-field"><label>Street address</label><input class="form-input" id="setup-street" value="${sEsc(profile.streetAddress)}"></div>
        <div class="setup-row"><div class="setup-field"><label>City</label><input class="form-input" id="setup-city" value="${sEsc(profile.addressLocality)}"></div><div class="setup-field"><label>State</label><input class="form-input" id="setup-state" value="${sEsc(profile.addressRegion)}"></div></div>
        <div class="setup-row"><div class="setup-field"><label>ZIP</label><input class="form-input" id="setup-zip" value="${sEsc(profile.postalCode)}"></div><div class="setup-field"><label>Phone</label><input class="form-input" id="setup-phone" value="${sEsc(profile.phone)}"></div></div>
        <div class="setup-field"><label>Website</label><input class="form-input" id="setup-website" value="${sEsc(profile.website)}"><small class="setup-hint">Use the exact name and number your customers should see — SEO Buddy will flag anywhere online that doesn't match.</small></div>`;
      if (i === 2) {
        const cv = localStorage.getItem('seo_client_value') || '1395', cr = localStorage.getItem('seo_conv_rate') || '2', cap = localStorage.getItem('seo_capture_rate') || '5';
        return `<h2>A couple of numbers</h2><p class="lead">These turn your search data into real dollars on your <b>Today</b> screen — like “this is worth about 3 new clients a month.” Rough estimates are perfectly fine, and you can tweak them anytime in Settings.</p>
        <div class="setup-field"><label>What's a new client worth to you? ($)</label><input type="number" class="form-input" id="setup-clientvalue" value="${sEsc(cv)}"><small class="setup-hint">Roughly what one new member is worth in a year. Best Day's default is your $1,395 program.</small></div>
        <div class="setup-row"><div class="setup-field"><label>How many visitors become clients? (%)</label><input type="number" class="form-input" id="setup-conv" value="${sEsc(cr)}"><small class="setup-hint">Out of 100 website visitors, how many sign up. 1–3% is typical.</small></div><div class="setup-field"><label>Share of missed searches you'd win (%)</label><input type="number" class="form-input" id="setup-capture" value="${sEsc(cap)}"><small class="setup-hint">Of the searches you show up for but get no clicks, the share you'd realistically capture. 3–8% is safe.</small></div></div>`;
      }
      return `<h2>Connect your accounts <span style="color:var(--text-dark);font-weight:400;">(optional)</span></h2><p class="lead">These bring in your live data. Connect them now, or skip and explore first — SEO Buddy runs on sample data until you're ready.</p>
        <div class="setup-connect-item"><div class="ci"></div><div><b>Google Gemini</b><span>The AI brain — writes your content, runs audits, and finds where to get listed.</span></div></div>
        <div class="setup-connect-item"><div class="ci"></div><div><b>Google Search Console</b><span>Your real Google rankings, clicks, and the searches you're missing.</span></div></div>
        <div class="setup-connect-item"><div class="ci"></div><div><b>GoHighLevel</b><span>Publishes your content and pulls your leads into Reports.</span></div></div>
        <p class="setup-hint" style="margin-top:14px;">Want to track ChatGPT &amp; Perplexity too? Add their API keys anytime under <b>Settings → Generative AI API</b>. Both are optional paid upgrades — Google's AI works on its own.</p>
        <div style="margin-top:16px;"><button class="btn btn-secondary" id="setup-open-settings" type="button" style="width:auto;">Open Settings to connect →</button></div>`;
    }
    function goSettings() { closeWiz(); const n = document.querySelector('.nav-item[data-tab="settings-tab"]'); if (n) n.click(); }
    async function loadReadinessBoard() {
      const host = document.getElementById('setup-readiness');
      if (!host) return;
      try {
        const d = await (await fetch('/api/deploy-readiness')).json();
        const checks = (d && d.checks) || [];
        const pct = d.total ? Math.round(d.ready / d.total * 100) : 0;
        const head = d.allReady
          ? `<b>Fully self-driving — ${d.ready} of ${d.total} ready</b><span>Every autopilot has what it needs. This location runs on its own.</span>`
          : `<b>${d.ready} of ${d.total} ready</b><span>${d.blockersLeft ? `${d.blockersLeft} must-fix before it's fully autonomous.` : 'Just a couple of recommendations left.'}</span>`;
        const rows = checks.map(c => {
          const cls = c.ok ? 'ok' : (c.severity === 'block' ? 'bad' : 'warn');
          const sym = c.ok ? '&#10003;' : (c.severity === 'block' ? '&#10007;' : '!');
          const badge = c.ok ? 'Ready' : (c.severity === 'block' ? 'Needed' : 'Recommended');
          const fix = c.ok ? '' : `<div class="rd-fix" data-fix="1"${c.tab ? ` data-tab-target="${sEsc(c.tab)}"` : ''}>${sEsc(c.fixLabel || 'Fix this')} &rarr;</div>`;
          return `<div class="rd-item"><div class="rd-stat ${cls}">${sym}</div><div class="rd-ic">${c.icon || ''}</div><div class="rd-main"><div class="rd-name">${sEsc(c.label)} <span class="rd-badge ${cls}">${badge}</span></div><div class="rd-sub">${sEsc(c.ok ? c.okText : c.badText)}</div>${fix}</div></div>`;
        }).join('');
        host.innerHTML = `<div class="rd-progress"><div class="rd-ring" style="--pct:${pct}"><b>${d.ready}/${d.total}</b></div><div class="rp-txt">${head}</div></div>${rows}`;
        // Most fixes are credentials, which live in Settings. A check that names
        // its own destination goes straight there instead of making the owner
        // hop through a page that only points somewhere else.
        host.querySelectorAll('.rd-fix').forEach(el => el.addEventListener('click', () => {
          const target = el.getAttribute('data-tab-target');
          if (target && window.switchTab) { closeWiz(); window.switchTab(target); return; }
          goSettings();
        }));
      } catch (e) {
        host.innerHTML = `<div class="rd-loading">Couldn’t check readiness right now — you can still continue setup.</div>`;
      }
    }
    // No-ops unless the board is actually on screen (it returns early without
    // its host element), so the global refresh can call it unconditionally.
    window.refreshReadinessBoard = loadReadinessBoard;
    function render() {
      bodyEl.innerHTML = stepHTML(step);
      bodyEl.querySelectorAll('.setup-field').forEach(field => {
        const input = field.querySelector('input'), label = field.querySelector('label');
        if (input && label) label.htmlFor = input.id;
      });
      dotsEl.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<span class="setup-dot ${i === step ? 'on' : ''}"></span>`).join('');
      backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
      nextBtn.innerText = step === TOTAL - 1 ? 'Finish' : (step === 0 ? "Let’s go" : 'Next');
      if (step === 0) loadReadinessBoard();
      const os = document.getElementById('setup-open-settings');
      if (os) os.addEventListener('click', goSettings);
    }
    function collect() {
      if (step === 1) {
        profile.name = gv('setup-name') || profile.name;
        profile.streetAddress = gv('setup-street'); profile.addressLocality = gv('setup-city'); profile.addressRegion = gv('setup-state');
        profile.postalCode = gv('setup-zip'); profile.phone = gv('setup-phone'); profile.website = gv('setup-website');
      } else if (step === 2) {
        if (gv('setup-clientvalue')) localStorage.setItem('seo_client_value', gv('setup-clientvalue'));
        if (gv('setup-conv')) localStorage.setItem('seo_conv_rate', gv('setup-conv'));
        if (gv('setup-capture')) localStorage.setItem('seo_capture_rate', gv('setup-capture'));
      }
    }
    async function finish() {
      try {
        await authFetch('/api/business-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profile.name, phone: profile.phone, streetAddress: profile.streetAddress, addressLocality: profile.addressLocality, addressRegion: profile.addressRegion, postalCode: profile.postalCode, website: profile.website }) });
      } catch (e) { /* non-fatal */ }
      try { localStorage.setItem('seo_wizard_seen', '1'); } catch (e) {}
      closeWiz();
      if (window.loadSummary) window.loadSummary();
    }
    let releaseWizardFocus;
    function showWiz(data) {
      profile = Object.assign({}, data || {}); step = 0; render();
      releaseWizardFocus?.();
      overlay.style.display = 'flex';
      releaseWizardFocus = trapDialogFocus(overlay, closeWiz);
    }
    function openWiz() {
      fetch('/api/business-profile').then(r => r.json()).then(d => showWiz(d && d.profile))
        .catch(() => showWiz());
    }
    function closeWiz() {
      overlay.style.display = 'none'; releaseWizardFocus?.(); releaseWizardFocus = null;
      try { localStorage.setItem('seo_wizard_seen', '1'); } catch (e) {}
    }
    window.openSetupWizard = openWiz;
    const btnOpen = document.getElementById('btn-open-setup');
    if (btnOpen) btnOpen.addEventListener('click', openWiz);

    nextBtn.addEventListener('click', () => { collect(); if (step < TOTAL - 1) { step++; render(); } else { finish(); } });
    backBtn.addEventListener('click', () => { collect(); if (step > 0) { step--; render(); } });
    closeBtn.addEventListener('click', closeWiz);

    // First-run: auto-open once if the business profile hasn't been set up.
    // Also populate the sidebar business chip with the saved name.
    fetch('/api/business-profile').then(r => r.json()).then(d => {
      const nm = document.getElementById('biz-chip-name');
      if (nm && d && d.profile && d.profile.name) nm.innerText = d.profile.name;
      let seen = '0'; try { seen = localStorage.getItem('seo_wizard_seen') || '0'; } catch (e) {}
      if (d && d.profile && !d.profile.configured && seen !== '1') setTimeout(openWiz, 900);
    }).catch(() => {});
  })();

});
