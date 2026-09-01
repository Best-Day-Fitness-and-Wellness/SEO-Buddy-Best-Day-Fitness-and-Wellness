// SEO Buddy - Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = {
    activeTab: 'today-tab',
    gscData: [],
    filterMode: 'leaks', // 'leaks' or 'all'
    generatedArticle: null, // { title, slug, content }
    editorMode: 'visual', // 'visual' or 'code'
    history: [
      {
        title: 'The Ultimate Guide to Senior Mobility Training',
        keyword: 'mobility training st pete',
        platform: 'GoHighLevel (Draft)',
        date: '2026-07-16',
        indexed: 'Asked Google to list it',
        url: 'https://bestdayfitness.com/post/mobility-training-st-pete'
      }
    ]
  };

  // --- DOM ELEMENT SELECTORS ---
  const tabButtons = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const modeStatus = document.getElementById('mode-status');
  const modeStatusText = document.getElementById('mode-status-text');
  let reviewsFeaturePromise = null;
  let recordedContentFeaturePromise = null;
  let citationFeaturePromise = null;
  let localPresenceFeaturePromise = null;
  let performanceFeaturePromise = null;

  function ensureReviewsFeature() {
    if (window.loadReviews) return Promise.resolve();
    if (reviewsFeaturePromise) return reviewsFeaturePromise;
    const assetUrl = document.body.dataset.reviewsAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('Reviews feature asset is unavailable.'));
    reviewsFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load the Reviews feature.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      reviewsFeaturePromise = null;
      throw error;
    });
    return reviewsFeaturePromise;
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
    if (window.initializeRecordedContent) return Promise.resolve();
    if (recordedContentFeaturePromise) return recordedContentFeaturePromise;
    const assetUrl = document.body.dataset.recordedContentAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('Recorded-content feature asset is unavailable.'));
    recordedContentFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load the recorded-content feature.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      recordedContentFeaturePromise = null;
      throw error;
    });
    return recordedContentFeaturePromise;
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
    if (window.loadCitationWorklist) return Promise.resolve();
    if (citationFeaturePromise) return citationFeaturePromise;
    const assetUrl = document.body.dataset.citationAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('Citation feature asset is unavailable.'));
    citationFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load the citation feature.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      citationFeaturePromise = null;
      throw error;
    });
    return citationFeaturePromise;
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
    if (window.loadLocalAutopilot) return Promise.resolve();
    if (localPresenceFeaturePromise) return localPresenceFeaturePromise;
    const assetUrl = document.body.dataset.localPresenceAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('Local Presence asset is unavailable.'));
    localPresenceFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load Local Presence.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      localPresenceFeaturePromise = null;
      throw error;
    });
    return localPresenceFeaturePromise;
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
    if (window.loadPerformance && window.loadPerfDigest) return Promise.resolve();
    if (performanceFeaturePromise) return performanceFeaturePromise;
    const assetUrl = document.body.dataset.performanceAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('Progress asset is unavailable.'));
    performanceFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load Progress.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      performanceFeaturePromise = null;
      throw error;
    });
    return performanceFeaturePromise;
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

  function setDataMode(mode) {
    if (!modeStatus || !modeStatusText) return;
    const normalized = mode === true ? 'live' : mode === false ? 'demo' : mode;
    if (normalized === 'live') {
      modeStatus.className = 'status-indicator live';
      modeStatusText.innerText = 'Live Operations';
    } else if (normalized === 'demo') {
      modeStatus.className = 'status-indicator mock';
      modeStatusText.innerText = 'Demo Search Data';
    } else {
      modeStatus.className = 'status-indicator unavailable';
      modeStatusText.innerText = 'Live Data Unavailable';
    }
  }

  function setDataModeFromHealthScore(healthScore) {
    const pillars = healthScore && Array.isArray(healthScore.pillars) ? healthScore.pillars : [];
    const searchPillar = pillars.find(pillar => pillar && pillar.key === 'found');
    if (searchPillar) {
      const demoAllowed = !!(healthScore.runtime && healthScore.runtime.mockIntegrationsAllowed);
      setDataMode(searchPillar.measured === true ? 'live' : (demoAllowed ? 'demo' : 'unavailable'));
    }
  }

  // GSC Selectors
  const gscTableBody = document.getElementById('gsc-table-body');
  const filterLeaksBtn = document.getElementById('filter-leaks');
  const filterAllBtn = document.getElementById('filter-all');
  const syncGscBtn = document.getElementById('btn-refresh-gsc');
  const statGapCount = document.getElementById('stat-gap-count');
  const statTotalImpressions = document.getElementById('stat-total-impressions');
  const statAvgCtr = document.getElementById('stat-avg-ctr');

  // AI Creator Selectors
  const inputKeyword = document.getElementById('input-keyword');
  const inputCaseStudy = document.getElementById('input-case-study');
  const inputCtaText = document.getElementById('input-cta-text');
  const inputCtaUrl = document.getElementById('input-cta-url');
  const btnGenerate = document.getElementById('btn-generate');
  
  // Editor Selectors
  const editorEmpty = document.getElementById('editor-empty');
  const editorLoader = document.getElementById('editor-loader');
  const visualEditor = document.getElementById('visual-editor');
  const codeEditor = document.getElementById('code-editor');
  const editorTabs = document.querySelectorAll('.editor-tab');
  
  const btnCopyHtml = document.getElementById('btn-copy-html');
  const btnCopyText = document.getElementById('btn-copy-text');
  const btnProceedPublish = document.getElementById('btn-proceed-publish');

  // Publish / Index Selectors
  const deployTitle = document.getElementById('deploy-title');
  const deployStatus = document.getElementById('deploy-status');
  const btnPublishGhlNow = document.getElementById('btn-publish-ghl-now');
  const indexingUrlInput = document.getElementById('indexing-url');
  const btnIndexNow = document.getElementById('btn-index-now');
  const historyTableBody = document.getElementById('history-table-body');

  // Settings Selectors
  const settingsForm = document.getElementById('settings-form');
  const settingsGeminiKey = document.getElementById('settings-gemini-key');
  const settingsGhlToken = document.getElementById('settings-ghl-token');
  const settingsGhlLocation = document.getElementById('settings-ghl-location');
  const settingsGhlBlog = document.getElementById('settings-ghl-blog');
  const settingsSiteUrl = document.getElementById('settings-site-url');
  const settingsBlogPrefix = document.getElementById('settings-blog-prefix');
  const settingsAuthorName = document.getElementById('settings-author-name');
  const settingsAuthorUrl = document.getElementById('settings-author-url');
  const settingsGscJson = document.getElementById('settings-gsc-json');
  const settingsAdminPassword = document.getElementById('settings-admin-password');
  const settingsClientValue = document.getElementById('settings-client-value');
  const settingsConvRate = document.getElementById('settings-conv-rate');
  const settingsCaptureRate = document.getElementById('settings-capture-rate');
  const displaySiteUrlBadge = document.getElementById('display-site-url');

  // --- SHARED BROWSER CORE ---
  const { authFetch, confirmAction, safeExternalUrl, sanitizeHtml, showToast, uiEsc } = window.SeoBuddyCore;
  const citEsc = uiEsc;

  // Existing call sites intentionally use this local name; shadowing the
  // blocking browser API upgrades all of them to accessible, non-blocking UI.
  function alert(message) { showToast(message); }

  // AIO / GEO Selectors
  const aioQuerySelector = document.getElementById('aio-query-selector');
  const aioCustomQueryContainer = document.getElementById('aio-custom-query-container');
  const aioCustomQuery = document.getElementById('aio-custom-query');
  const btnRunAioAudit = document.getElementById('btn-run-aio-audit');
  
  const aioResultsPanel = document.getElementById('aio-results-panel');
  const aioStatusBadge = document.getElementById('aio-status-badge');
  const aioSovRate = document.getElementById('aio-sov-rate');
  const aioSnippetText = document.getElementById('aio-snippet-text');
  const aioCitedUrls = document.getElementById('aio-cited-urls');
  const aioCompetitors = document.getElementById('aio-competitors');
  const aioSearchQueries = document.getElementById('aio-search-queries');
  const aioSearchSuggestions = document.getElementById('aio-search-suggestions');
  
  const btnSchemaLocal = document.getElementById('btn-schema-local');
  const btnSchemaFaq = document.getElementById('btn-schema-faq');
  const btnCopySchema = document.getElementById('btn-copy-schema');
  const schemaCodeOutput = document.getElementById('schema-code-output');
  const aioHistoryTableBody = document.getElementById('aio-history-table-body');
  
  let compiledSchemas = { localBusiness: '', faq: '' };
  let activeSchemaType = 'localBusiness';


  // --- INITIALIZATION ---
  loadSettingsFromStorage();
  renderHistory();

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

  function switchTab(tabId) {
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
    if (tabId === 'today-tab') {
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
      if (window.loadOwnerToday) window.loadOwnerToday();
    } else if (tabId === 'owner-results-tab') {
      pageTitle.innerText = 'Results';
      pageSubtitle.innerText = 'The last 28 days, next to the 28 before them';
      if (window.loadOwnerResults) window.loadOwnerResults();
    } else if (tabId === 'owner-business-tab') {
      pageTitle.innerText = 'Business';
      pageSubtitle.innerText = 'Your details \u2014 not marketing settings. Just the facts we use everywhere';
      if (window.loadOwnerBusiness) window.loadOwnerBusiness();
    } else if (tabId === 'brand-tab') {
      pageTitle.innerText = 'Brand Voice';
      pageSubtitle.innerText = 'How everything SEO Buddy writes should sound \u2014 and the words it must never use';
      if (window.loadBrandProfile) window.loadBrandProfile();
    } else if (tabId === 'reviews-tab') {
      pageTitle.innerText = 'Reviews Site';
      pageSubtitle.innerText = 'How many reviews are published, how that’s growing, and whether the page is structurally sound';
      loadReviewsFeature();
    } else if (tabId === 'gsc-tab') {
      pageTitle.innerText = 'Searches You’re Missing';
      pageSubtitle.innerText = 'Search queries where you show up but get no clicks — your biggest quick wins';
      if (!state.gscData.length) syncGSCData();
    } else if (tabId === 'ai-tab') {
      pageTitle.innerText = 'Create a Post';
      pageSubtitle.innerText = 'Have AI write an authoritative, SEO-optimized article for you';
      loadRecordedContentFeature();
    } else if (tabId === 'publish-tab') {
      pageTitle.innerText = 'Publish';
      pageSubtitle.innerText = 'Publish to your site, request Google indexing, and run the content autopilot';
      fetchHistory();
      fetchAutopilotStatus();
    } else if (tabId === 'aio-tab') {
      pageTitle.innerText = 'AI Visibility Check';
      pageSubtitle.innerText = 'See whether AI assistants recommend and cite you, and build schema';
      if (window.loadAiVisibility) window.loadAiVisibility();
      if (window.loadFactCheck) window.loadFactCheck();
      if (window.loadCrawlers) window.loadCrawlers();
      if (window.loadReddit) window.loadReddit();
      fetchAioHistory();
      fetchAioSchemas();
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
      if (window.loadOnsiteAutopilot) window.loadOnsiteAutopilot();
    } else if (tabId === 'settings-tab') {
      pageTitle.innerText = 'Settings';
      pageSubtitle.innerText = 'Connect your accounts, business info, and automation preferences';
      if (window.loadUsage) window.loadUsage();
      if (window.loadStorageStatus) window.loadStorageStatus();
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

  // --- GSC DATA & SYNC SYSTEM ---
  async function syncGSCData() {
    gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Syncing with Search Console... Please wait.</td></tr>`;
    
    try {
      const res = await fetch('/api/gsc-data');
      const payload = await res.json();
      
      state.gscData = payload.data || [];
      
      // Update GSC Badge
      setDataMode(payload.source === 'live_gsc' ? 'live' : (payload.source === 'mock_data' ? 'demo' : 'unavailable'));

      calculateStats();
      renderGSCTable();
    } catch (err) {
      console.error('Error fetching GSC data:', err);
      setDataMode('unavailable');
      state.gscData = [];
      calculateStats();
      gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-500">Live Search Console data is unavailable. No demo numbers were substituted.</td></tr>`;
    }
  }

  syncGscBtn.addEventListener('click', syncGSCData);

  function calculateStats() {
    const totalImpressions = state.gscData.reduce((acc, curr) => acc + curr.impressions, 0);
    const totalClicks = state.gscData.reduce((acc, curr) => acc + curr.clicks, 0);
    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0';
    const leakCount = state.gscData.filter(item => item.leak).length;

    statGapCount.innerText = leakCount;
    statTotalImpressions.innerText = totalImpressions.toLocaleString();
    statAvgCtr.innerText = `${avgCtr}%`;
  }

  function renderGSCTable() {
    gscTableBody.innerHTML = '';
    
    const filtered = state.gscData.filter(item => {
      if (state.filterMode === 'leaks') return item.leak;
      return true;
    });

    if (filtered.length === 0) {
      gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center">No keywords match the selected filter.</td></tr>`;
      return;
    }

    filtered.forEach(row => {
      const tr = document.createElement('tr');
      
      const statusBadge = row.leak 
        ? `<span class="status-badge leak">Content Gap</span>`
        : `<span class="status-badge clean">Ranking</span>`;

      const actionBtn = row.leak
        ? `<button class="btn btn-secondary btn-xs btn-gen-trigger" data-query="${uiEsc(row.query)}">Generate Page</button><button class="btn btn-secondary btn-xs btn-fanout-trigger" data-query="${uiEsc(row.query)}" title="See the questions a citable page should answer">&#10067; Questions</button>`
        : `<button class="btn btn-secondary btn-xs" disabled>Optimized</button>`;

      tr.innerHTML = `
        <td class="font-medium">${uiEsc(row.query)}</td>
        <td>${row.impressions.toLocaleString()}</td>
        <td>${row.clicks.toLocaleString()}</td>
        <td>${row.ctr}%</td>
        <td>${row.position}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      `;
      gscTableBody.appendChild(tr);
    });

    // Add listeners to individual row "Generate Page" buttons
    document.querySelectorAll('.btn-gen-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        loadKeywordIntoCreator(query);
      });
    });

    // "❓ Questions" — reveal the query fan-out (sub-questions) for a gap.
    document.querySelectorAll('.btn-fanout-trigger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const query = btn.getAttribute('data-query');
        const tr = btn.closest('tr');
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('fanout-row')) { next.remove(); return; } // toggle off
        const detail = document.createElement('tr');
        detail.className = 'fanout-row';
        detail.innerHTML = `<td colspan="7"><div class="fanout-box"><div class="fanout-empty">Finding the questions people ask about &ldquo;${citEsc(query)}&rdquo;&hellip;</div></div></td>`;
        tr.after(detail);
        const box = detail.querySelector('.fanout-box');
        const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '&hellip;';
        try {
          const res = await authFetch('/api/onsite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'fanout', query }) });
          const d = await res.json();
          if (!res.ok || !d.success) throw new Error(d.error || 'Request failed');
          if (d.unavailable) { box.innerHTML = `<div class="fanout-empty">${citEsc(d.message || 'Add your Gemini key in Settings to use this.')}</div>`; return; }
          const qs = (d.data && d.data.questions) || [];
          box.innerHTML = qs.length
            ? `<div class="fanout-title">&#10067; Questions a citable page on &ldquo;${citEsc(query)}&rdquo; should answer:</div><ul class="fanout-list">${qs.map(x => `<li>${citEsc(x)}</li>`).join('')}</ul><div class="fanout-hint">Cover several of these in one article &mdash; AI engines cite pages that answer a cluster of related questions, not just one.</div>`
            : `<div class="fanout-empty">No related questions came back &mdash; try Generate Page instead.</div>`;
        } catch (e) {
          box.innerHTML = `<div class="fanout-empty">Couldn't load questions: ${citEsc(e.message)}</div>`;
        } finally { btn.disabled = false; btn.innerHTML = orig; }
      });
    });
  }

  // Filter Buttons
  filterLeaksBtn.addEventListener('click', () => {
    state.filterMode = 'leaks';
    filterLeaksBtn.classList.add('active');
    filterAllBtn.classList.remove('active');
    renderGSCTable();
  });

  filterAllBtn.addEventListener('click', () => {
    state.filterMode = 'all';
    filterAllBtn.classList.add('active');
    filterLeaksBtn.classList.remove('active');
    renderGSCTable();
  });

  // --- AI CREATOR LOAD & TRIGGER SYSTEM ---
  const CASE_STUDY_TEMPLATES = {
    'senior fitness st petersburg fl': "At Best Day Fitness, our personal trainers created a custom posture and mobility program for Margaret (age 71). When she started, walking upstairs caused severe knee pain. Within 12 weeks of training barefoot on our balance mats, she rebuilt joint stabilization, eliminated pain, and is now actively walking 3 miles daily barefoot on the beach.",
    'mobility training st pete': "We worked with Arthur (age 64), who suffered from shoulder stiffness that prevented him from playing tennis. Our physical therapy integration allowed us to combine myofascial release with trainer-led rotational mobility work. Arthur returned to the tennis court in 6 weeks with full range of motion.",
    'longevity fitness coach st petersburg': "One of our most inspiring clients, David (age 82), wanted to maintain his independence. We built a customized strength and gait training routine focusing on barefoot stability and posture. David successfully climbed the stairs at St. Pete pier and carries his own groceries with ease.",
    'posture correction exercises senior': "Elena (age 69) came to us with a noticeable forward-head posture and frequent lower back pain. We implemented wall-alignments, thoracic mobility rotations, and barefoot glute stabilization. Not only did her posture score improve by 30%, but her chronic back stiffness also disappeared completely.",
    'barefoot training older adults balance': "Barefoot training is a staple at Best Day Fitness. By training without thick rubber shoes, our client Richard (age 75) activated dormant sensory receptors in his feet. This directly improved his gait, posture, and balance, dropping his fall-risk profile from high to zero."
  };

  function loadKeywordIntoCreator(keyword) {
    inputKeyword.value = keyword;
    
    // Select template case study or write a custom placeholder
    const template = CASE_STUDY_TEMPLATES[keyword.toLowerCase()] || 
      `At Best Day Fitness, we helped a St. Petersburg client (age 69) recover their mobility and core posture. Through a tailored balance and strength program, they went from being fearful of falls to hiking outdoors comfortably. Our trainer-led sessions focus on joint-safety and longevity.`;
    
    inputCaseStudy.value = template;
    
    // Auto CTA Text based on query
    inputCtaText.value = 'Schedule Longevity Assessment';
    
    // Switch tabs to AI Creator
    switchTab('ai-tab');
    
    // Clean preview state
    editorEmpty.style.display = 'flex';
    visualEditor.style.display = 'none';
    codeEditor.style.display = 'none';
  }

  // Claims the model produced that a human must check. Generated copy has
  // invented a wrong phone number before now, so this renders above the preview
  // rather than somewhere the owner has to go looking for it.
  function renderClaims(claims) {
    const host = document.getElementById('visual-editor');
    const old = document.getElementById('claims-box');
    if (old) old.remove();
    if (!host || !claims || !claims.length) return;
    const box = document.createElement('div');
    box.id = 'claims-box';
    box.className = 'claims-box';
    box.innerHTML = '<h4>Check these before publishing</h4><ul>' +
      claims.map(c => '<li>' + String(c).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])) + '</li>').join('') +
      '</ul>';
    host.parentNode.insertBefore(box, host);
  }

  // Brand voice profile. Everything the AI features write reads from this, so
  // it is edited here rather than in eight places in the server source.
  // ---------------------------------------------------------------------------
  const BP_FIELDS = {
    'bp-tagline': { key: 'tagline', list: false },
    'bp-audience': { key: 'audienceDescription', list: false },
    'bp-philosophy': { key: 'philosophy', list: false },
    'bp-tone': { key: 'tone', list: false },
    'bp-traits': { key: 'voiceTraits', list: true },
    'bp-style': { key: 'writingStyle', list: true },
    'bp-use': { key: 'usePhrases', list: true },
    'bp-never': { key: 'neverUse', list: true },
    'bp-not': { key: 'notPositioning', list: true },
    'bp-keywords': { key: 'localKeywords', list: true },
    'bp-cta-label': { key: 'ctaPrimaryLabel', list: false },
    'bp-cta-url': { key: 'ctaPrimaryUrl', list: false },
  };

  // One announcement, many listeners. The review state is shown on the owner's
  // Business card, the Today board, the Explore checklist and the setup wizard;
  // wiring the save button to each of them by name is how one of them gets
  // forgotten and starts contradicting the others.
  function bpAnnounceChange(payload) {
    document.dispatchEvent(new CustomEvent('seo:readiness-changed', {
      detail: { source: 'brand', reviewedAt: (payload && payload.reviewedAt) || null },
    }));
  }

  function bpMsg(text, cls) {
    const el = document.getElementById('bp-msg');
    if (!el) return;
    el.className = 'bp-msg' + (cls ? ' ' + cls : '');
    el.textContent = text || '';
  }

  function bpFill(brand) {
    if (!brand) return;
    for (const [id, f] of Object.entries(BP_FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const v = brand[f.key];
      el.value = f.list ? (Array.isArray(v) ? v.join('\n') : '') : (v || '');
    }
  }

  function bpCollect() {
    const out = {};
    for (const [id, f] of Object.entries(BP_FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      out[f.key] = f.list
        ? el.value.split('\n').map(x => x.trim()).filter(Boolean)
        : el.value.trim();
    }
    return out;
  }

  async function bpLoad() {
    if (!document.getElementById('bp-card')) return;
    try {
      const j = await (await fetch('/api/brand-profile')).json();
      if (j && j.success) bpFill(j.brand);
    } catch (e) { bpMsg('Could not load the brand profile.', 'err'); }
  }

  const bpGoto = document.getElementById('btn-goto-brand');
  if (bpGoto) bpGoto.addEventListener('click', () => {
    const t = document.querySelector('[data-tab="brand-tab"]');
    if (t) { t.click(); return; }
    // The tab has no nav button of its own — it is reached through Explore — so
    // fall back to the same switcher the Explore cards use.
    if (window.switchTab) window.switchTab('brand-tab');
  });

  const bpSaveBtn = document.getElementById('bp-save');
  if (bpSaveBtn) bpSaveBtn.addEventListener('click', async () => {
    bpSaveBtn.disabled = true;
    bpMsg('Saving…');
    try {
      const res = await authFetch('/api/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: bpCollect() }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed.');
      bpFill(j.brand);
      // Saving is what clears the "Not reviewed yet" badge, so the badge has to
      // move now — not on the owner's next tab change. If it does not move, the
      // owner reasonably concludes the save did not happen.
      bpAnnounceChange(j);
      bpMsg(j.persisted === false
        ? 'Saved for now, but it could not be written to disk — it will reset when the server restarts.'
        : (j.durable === false
          ? 'Saved — every AI feature uses this from now on. Note: this location has no persistent storage, so it resets on the next deploy.'
          : 'Saved — every AI feature uses this from now on.'),
        j.persisted === false ? 'err' : 'ok');
    } catch (err) {
      bpMsg(err.message, 'err');
    } finally {
      bpSaveBtn.disabled = false;
    }
  });

  const bpResetBtn = document.getElementById('bp-reset');
  if (bpResetBtn) bpResetBtn.addEventListener('click', async () => {
    if (!await confirmAction('Reset the brand voice back to the defaults built from your brand docs? Your edits will be replaced.')) return;
    bpResetBtn.disabled = true;
    try {
      const res = await authFetch('/api/brand-profile/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Reset failed.');
      bpFill(j.brand);
      bpAnnounceChange(j);
      bpMsg('Reset to defaults — read it through and save to confirm it again.', 'ok');
    } catch (err) {
      bpMsg(err.message, 'err');
    } finally {
      bpResetBtn.disabled = false;
    }
  });

  window.loadBrandProfile = bpLoad;
  bpLoad();

  // Off-brand words that survived the prompt. Rendered next to the fact-check
  // list so both hazards are visible in the same glance, before publishing.
  function renderBrandViolations(violations) {
    const host = document.getElementById('visual-editor');
    const old = document.getElementById('brand-violations');
    if (old) old.remove();
    if (!host || !violations || !violations.length) return;
    const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const box = document.createElement('div');
    box.id = 'brand-violations';
    box.className = 'claims-box';
    box.style.borderColor = 'rgba(244,63,94,.45)';
    box.style.background = 'rgba(244,63,94,.08)';
    box.innerHTML = '<h4 style="color:var(--color-danger);">Off-brand language found — fix before publishing</h4><ul>' +
      violations.map(v => `<li>Uses <b>"${esc(v.found)}"</b> — on your never-use list.</li>`).join('') +
      '</ul>';
    host.parentNode.insertBefore(box, host);
  }

  // ===========================================================================
  // OWNER MODE — Today / Results / Business
  // ---------------------------------------------------------------------------
  // Reads the same endpoints the full interface uses; it has no data of its own.
  // The one rule it adds: completion is earned, never assumed. A task is only
  // struck off when the thing actually happened — the server confirms it, or the
  // owner tells us they did it. Clicking a button is not evidence.
  // ===========================================================================
  const OW_ICON = { nap:'📍', gbp:'📣', listed:'🔗', autopilot:'⚙️', ai:'🤖', gsc:'🔌' };
  const OW_CHIP = {
    automatic:['auto','&#10003; Automatic'], approve:['approve','&#9654; Needs approval'],
    manual:['manual','&#9679; You do it'],   blocked:['blocked','&#9650; Blocked'],
  };
  const NAP_SITES = ['Yelp', 'Yellow Pages', 'MapQuest', 'Foursquare'];
  let owTasksLeft = 0;

  const owEsc = v => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // "Reviewed" with no date is a claim; "Reviewed 18 Aug 2026" is evidence the
  // owner can check against their own memory of pressing the button.
  function owShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function owHeadline() {
    const blockers = document.querySelectorAll('#ow-blockers .ow-item:not(.finished)').length;
    const head = document.getElementById('ow-sum-head');
    const sub  = document.getElementById('ow-sum-sub');
    const big  = document.getElementById('ow-sum-big');
    const cnt  = document.getElementById('owner-nav-count');
    if (!head) return;
    const t = owTasksLeft, parts = [];
    parts.push(t === 1 ? '1 task' : t + ' tasks');
    if (blockers) parts.push(blockers === 1 ? '1 blocker' : blockers + ' blockers');
    head.textContent = t === 0 && !blockers ? 'Nothing needs you today' : parts.join(' · ');
    sub.textContent = t === 0 && !blockers
      ? 'SEO Buddy is running everything on its own. Check back whenever.'
      : (t === 0 ? 'Every task is done. The blocker is still open whenever you have a moment.'
                 : 'We’ve prepared each one. Anything we can do ourselves, we already have.');
    big.textContent = t;
    if (cnt) cnt.textContent = t ? String(t) : '';
  }

  // A task leaves the list only when the work genuinely happened.
  function owFinish(item, msg) {
    item.classList.remove('working', 'awaiting');
    item.classList.add('finished');
    const d = item.querySelector('.ow-done');
    if (d) d.innerHTML = '&#10003; ' + owEsc(msg);
    if (item.dataset.counts === '1') { owTasksLeft = Math.max(0, owTasksLeft - 1); item.dataset.counts = '0'; }
    owHeadline();
  }

  function owCard(m) {
    const [cls, label] = OW_CHIP[m.capability] || OW_CHIP.manual;
    const blocked = m.capability === 'blocked';
    const icon = OW_ICON[m.key] || '•';
    let controls = '';

    if (m.capability === 'approve') {
      controls = `<button class="btn btn-primary" data-ow="approve">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not now</button>`;
    } else if (m.key === 'nap') {
      controls = `<button class="btn btn-primary" data-ow="guide">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not this week</button>`;
    } else if (m.key === 'gbp') {
      controls = `<button class="btn btn-primary" data-ow="copy">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="confirm" hidden>I&rsquo;ve posted it</button>
        <button class="btn" data-ow="dismiss">Skip this week</button>`;
    } else if (blocked) {
      controls = `<button class="btn btn-primary" data-ow="goto">${owEsc(m.ownerCta)}</button>`;
    } else {
      controls = `<button class="btn btn-primary" data-ow="goto">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not now</button>`;
    }

    const steps = m.key === 'nap'
      ? `<div class="ow-steps" id="ow-nap-steps" hidden>
           <div class="pr"><b id="ow-nap-count">0 of ${NAP_SITES.length} updated</b><span>tick each one as you finish it</span></div>
           ${NAP_SITES.map(n => `<label><input type="checkbox" data-nap> ${owEsc(n)}</label>`).join('')}
         </div>` : '';

    return `<div class="ow-item${blocked ? ' is-blocked' : ''}" data-key="${owEsc(m.key)}" data-counts="${blocked ? '0' : '1'}" data-tab="${owEsc(m.tab || '')}">
      <span class="ow-ic" aria-hidden="true">${icon}</span>
      <div class="ow-b">
        <div class="ow-t"><h3>${owEsc(m.ownerTitle)}</h3><span class="ow-chip ${cls}">${label}</span></div>
        <p>${owEsc(m.ownerWhy)}</p>
        ${steps}
        <div class="ow-await">&#9679; Copied — paste it into your Google profile, then tell us</div>
        <div class="ow-work"><span class="ow-spin"></span>Working…</div>
        <div class="ow-row">${controls}<span class="ow-mins">${owEsc(m.realEffort || '')}</span></div>
        <div class="ow-done"></div>
      </div></div>`;
  }

  async function loadOwnerToday() {
    const tasksEl = document.getElementById('ow-tasks');
    const blockEl = document.getElementById('ow-blockers');
    if (!tasksEl) return;
    try {
      const [mv, dg, hs] = await Promise.all([
        fetch('/api/next-moves').then(r => r.json()).catch(() => ({ moves: [] })),
        fetch('/api/autopilot-digest').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/health-score').then(r => r.json()).catch(() => null)
      ]);
      const moves = (mv.moves || []);
      const tasks = moves.filter(m => m.capability !== 'blocked');
      const blockers = moves.filter(m => m.capability === 'blocked');
      owTasksLeft = tasks.length;

      tasksEl.innerHTML = tasks.length
        ? `<div class="ow-h">Needs you</div>` + tasks.map(owCard).join('')
        : `<div class="ow-h">Needs you</div><div class="ow-note"><b>Nothing on your plate.</b>
             <p>Everything we could do ourselves this week, we did.</p></div>`;
      blockEl.innerHTML = blockers.length
        ? `<div class="ow-h">Waiting on you</div>` + blockers.map(owCard).join('') : '';

      const items = (dg.items || []);
      document.getElementById('ow-hcount').textContent =
        `SEO Buddy handled ${items.length} thing${items.length === 1 ? '' : 's'} this week`;
      document.getElementById('ow-hsub').textContent =
        items.map(i => i.label).slice(0, 5).join(', ');
      document.getElementById('ow-hlist').innerHTML = items.map(i =>
        `<div class="ow-hrow"><span><b>${owEsc(i.label)}</b><span>${owEsc(i.text)}</span></span></div>`).join('');

      const note = document.getElementById('ow-score-note');
      if (hs && hs.overall != null) {
        const d = hs.delta != null ? hs.delta : null;
        note.innerHTML = d != null && d < 0
          ? `<div class="ow-note warn" style="margin-top:22px"><b>Your score slipped ${Math.abs(d)} points this month.</b>
               <p>Worth knowing, not worth worrying about. The full comparison is on <b>Results</b>.</p></div>`
          : `<div class="ow-note" style="margin-top:22px"><b>Your score is ${hs.overall} out of 100.</b>
               <p>The full picture is on <b>Results</b>.</p></div>`;
      }
      owHeadline();
    } catch (e) {
      tasksEl.innerHTML = `<div class="ow-note warn"><b>Couldn’t load your list.</b><p>${owEsc(e.message)}</p></div>`;
    }
  }
  window.loadOwnerToday = loadOwnerToday;

  // Per-state behaviour. Note what is deliberately absent: no path marks a
  // manual task done merely because a button was pressed.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-ow]');
    if (!btn) return;
    const item = btn.closest('.ow-item'); const act = btn.dataset.ow;
    const key = item.dataset.key;

    if (act === 'dismiss') { owFinish(item, 'Skipped — we’ll raise it again next week.'); return; }

    if (act === 'goto') {
      const t = item.dataset.tab;
      if (t && window.switchTab) { setOwnerMode(false); window.switchTab(t); }
      return;
    }

    if (act === 'approve') {
      // The one class of action the server genuinely executes.
      item.classList.add('working');
      try {
        if (key === 'autopilot') await authFetch('/api/autopilot-toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled:true }) });
        else if (key === 'ai')   await authFetch('/api/ai-visibility/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        owFinish(item, key === 'autopilot' ? 'Autopilot is on — we’ll publish for you from now on.' : 'Check complete — see Results.');
      } catch (err) {
        item.classList.remove('working');
        item.querySelector('.ow-row').insertAdjacentHTML('beforeend',
          `<span class="ow-mins" style="color:var(--color-danger)">Didn’t work: ${owEsc(err.message)}</span>`);
      }
      return;
    }

    if (act === 'guide') {
      const steps = item.querySelector('#ow-nap-steps');
      if (!steps) return;
      steps.hidden = false; btn.textContent = 'Keep going';
      const boxes = [...steps.querySelectorAll('[data-nap]')];
      boxes.forEach(cb => cb.addEventListener('change', () => {
        cb.closest('label').classList.toggle('ticked', cb.checked);
        const n = boxes.filter(b => b.checked).length;
        steps.querySelector('#ow-nap-count').textContent = `${n} of ${boxes.length} updated`;
        if (n === boxes.length) owFinish(item, 'All updated — we’ll re-check next week and tell you if any drift back.');
      }));
      return;
    }

    if (act === 'copy') {
      // We cannot see their Google profile, so we can only wait to be told.
      try {
        const d = await (await fetch('/api/local-autopilot')).json();
        const txt = (d && d.gbpDraft && d.gbpDraft.text) || '';
        if (txt && navigator.clipboard) await navigator.clipboard.writeText(txt);
      } catch (err) { /* copying is a convenience, not the point */ }
      window.open('https://business.google.com/posts', '_blank', 'noopener');
      item.classList.add('awaiting');
      btn.hidden = true;
      item.querySelector('[data-ow="confirm"]').hidden = false;
      return;
    }

    if (act === 'confirm') {
      try { await authFetch('/api/gbp-mark-posted', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch (err) {}
      owFinish(item, 'Marked as posted — we’ll confirm it on the next check.');
      return;
    }
  });

  const owHT = document.getElementById('ow-htoggle');
  if (owHT) owHT.addEventListener('click', () => {
    const open = owHT.getAttribute('aria-expanded') === 'true';
    owHT.setAttribute('aria-expanded', String(!open));
    document.getElementById('ow-hlist').classList.toggle('open', !open);
  });

  // ── Results ──
  async function loadOwnerResults() {
    const find = document.getElementById('ow-find');
    if (!find) return;
    const tile = (l, v, d) => `<div class="ow-tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const arrow = (now, was, lowerBetter) => {
      if (was == null || now == null) return '<span class="ow-flat">■ no comparison yet</span>';
      const diff = now - was;
      if (!diff) return '<span class="ow-flat">■ held</span> since last month';
      const good = lowerBetter ? diff < 0 : diff > 0;
      const c = good ? 'ow-up' : 'ow-down', a = diff > 0 ? '▲' : '▼';
      return `<span class="${c}">${a} ${Math.abs(Math.round(diff * 10) / 10)}</span> from ${was}`;
    };
    try {
      const [pf, rv, hs] = await Promise.all([
        fetch('/api/performance').then(r => r.json()).catch(() => null),
        fetch('/api/reviews-stats').then(r => r.json()).catch(() => null),
        fetch('/api/health-score').then(r => r.json()).catch(() => null)
      ]);
      if (!pf || !pf.current) {
        // Distinguish "never connected" from "connected, but this fetch didn't
        // come back". Telling an owner their Search Console isn't connected
        // when it demonstrably is sends them to fix something that isn't broken.
        find.innerHTML = '';
        let connected = false;
        try {
          const rd = await fetch('/api/deploy-readiness').then(r => r.json());
          connected = !!(rd.checks || []).find(c => c.key === 'gsc' && c.ok);
        } catch (e) { /* if even that fails, fall through to the softer message */ }
        document.getElementById('ow-find-note').innerHTML = connected
          ? `<div class="ow-note warn"><b>We couldn’t load your search numbers just now.</b>
               <p>Google Search Console is connected — this looks like a hiccup fetching the figures, not a setup problem. Everything else on this page still works.
               <button class="btn btn-primary" style="width:auto;margin-top:10px" data-ow-retry>Try again</button></p></div>`
          : `<div class="ow-note warn"><b>We can’t show your search numbers yet.</b>
               <p>Google Search Console isn’t connected, so we have nothing real to compare. Everything else on this page still works — it’s on your Today list.</p></div>`;
      } else if (pf && pf.current) {
        const c = pf.current, p = pf.previous || {};
        find.innerHTML =
          tile('Visits from Google', c.clicks, arrow(c.clicks, p.clicks)) +
          tile('Times you appeared', (c.impressions || 0).toLocaleString(), arrow(c.impressions, p.impressions)) +
          tile('Typical position', c.avgPosition, arrow(c.avgPosition, p.avgPosition, true) + ' · lower is better') +
          tile('Optimization score', (hs && hs.overall != null ? hs.overall : '–') + '<small> / 100</small>',
               hs && hs.delta != null ? arrow(hs.overall, hs.overall - hs.delta) : '<span class="ow-flat">■ building history</span>');
        const down = (c.clicks || 0) < (p.clicks || 0);
        document.getElementById('ow-find-note').innerHTML = down
          ? `<div class="ow-note warn"><b>This period went the wrong way, and we’re not going to dress that up.</b>
               <p><b>What may be contributing</b> — we can’t prove any of these caused it, but each is true right now: details that don’t match across the web, the third-party sources you’re not listed on yet, and Google’s own results shifting for reasons nobody outside Google can see.</p></div>`
          : `<div class="ow-note"><b>Holding steady or improving.</b><p>We’ll show you this same comparison next month either way.</p></div>`;
      }
      if (!rv || !rv.inventory) {
        document.getElementById('ow-rev').innerHTML =
          `<div class="ow-note"><b>No reviews site connected.</b><p>Nothing to show here yet.</p></div>`;
      } else if (rv && rv.inventory) {
        const i = rv.inventory, bp = i.byPlatform || {};
        document.getElementById('ow-rev').innerHTML =
          tile('Shown on your reviews site', i.published,
               Object.entries(bp).map(([k, v]) => `${v} ${k}`).join(' · ')) +
          tile('Average rating there', i.avgRating, '<span class="ow-flat">■ held</span>') +
          tile('Review page health', rv.score + '<small> / 100</small>',
               (rv.problems || 0) + ' small fix' + ((rv.problems || 0) === 1 ? '' : 'es') + ' suggested');
      }
      const cv = parseFloat(localStorage.getItem('seo_client_value')) || 1395;
      const cr = (parseFloat(localStorage.getItem('seo_conv_rate')) || 2) / 100;
      const visits = (pf && pf.current && pf.current.clicks) || 0;
      if (!visits) {
        document.getElementById('ow-worth').innerHTML =
          `<div class="ow-note"><b>We need real visit numbers before we can estimate value.</b>
             <p>This fills in on its own once the search figures load.</p></div>`;
        return;
      }
      document.getElementById('ow-worth').innerHTML =
        tile('What you’re getting now', '$' + Math.round(visits * cr * cv).toLocaleString() + '<small>/mo</small>',
             `from about ${visits} visits a month`) +
        tile('A new client is worth', '$' + cv.toLocaleString(), 'your figure, editable in Business');
    } catch (e) { /* leave the shells; better empty than wrong */ }
  }
  window.loadOwnerResults = loadOwnerResults;

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ow-retry]')) loadOwnerResults();
    if (e.target.closest && e.target.closest('[data-ow-retry-business]')) loadOwnerBusiness();
  });

  // Anything that records an owner decision fires this; every board that draws
  // that decision redraws itself. Each loader is guarded, so a board that is not
  // on screen simply does nothing.
  document.addEventListener('seo:readiness-changed', () => {
    if (window.loadOwnerBusiness) window.loadOwnerBusiness();
    if (window.loadOwnerToday) window.loadOwnerToday();
    if (window.loadToday) window.loadToday();
    if (window.loadGetStarted) window.loadGetStarted();
    if (window.refreshReadinessBoard) window.refreshReadinessBoard();
  });

  // ── Business ──
  async function loadOwnerBusiness() {
    const basics = document.getElementById('ow-basics');
    if (!basics) return;
    const f = (k, v) => `<div class="ow-f"><div class="k">${k}</div><div class="v">${owEsc(v)}</div></div>`;
    try {
      const [bp, br, rd] = await Promise.all([
        fetch('/api/business-profile').then(r => r.json()).catch(() => null),
        fetch('/api/brand-profile').then(r => r.json()).catch(() => null),
        fetch('/api/deploy-readiness').then(r => r.json()).catch(() => null)
      ]);
      const b = (bp && (bp.profile || bp.business)) || {};
      basics.innerHTML =
        f('Business name', b.name || 'Best Day Fitness') +
        f('Phone', b.phone || b.telephone || '—') +
        f('Address', [b.streetAddress, b.addressLocality, b.addressRegion, b.postalCode].filter(Boolean).join(', ') || '—') +
        f('Website', b.website || '—');

      const voiceEl = document.getElementById('ow-voice');
      if (br && br.brand) {
        const nv = (br.brand.neverUse || []), up = (br.brand.usePhrases || []);
        // The brand profile itself is the authority on whether the owner has
        // signed off on the voice; the readiness board only relays it. Reading
        // the relay first meant a readiness call that failed rendered a
        // confident "Reviewed" over an unreviewed voice, and a readiness call
        // that lagged rendered "Not reviewed yet" over a saved one.
        const check = rd && (rd.checks || []).find(c => c.key === 'brand');
        const at = br.reviewedAt || (check && check.reviewedAt) || null;
        const reviewed = at ? true : (check ? !!check.ok : false);
        const durable = check ? check.durable !== false : true;
        voiceEl.innerHTML =
          `<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:10px">
             <b style="font-size:var(--font-lg)">${owEsc(br.brand.tagline || '')}</b>
             ${reviewed
               ? `<span class="ow-chip auto">&#10003; Reviewed${at ? ' ' + owEsc(owShortDate(at)) : ''}</span>`
               : '<span class="ow-chip blocked">&#9650; Not reviewed yet</span>'}
           </div>
           <p style="margin:0 0 14px;color:var(--text-muted);font-size:var(--font-sm)">
             We never say <i>${nv.slice(0, 7).map(owEsc).join(', ')}</i>${nv.length > 7 ? ` — and ${nv.length - 7} more` : ''}.<br>
             We do say <i>${up.slice(0, 3).map(owEsc).join(', ')}</i>.</p>
           ${reviewed ? '' : `<div class="ow-note" style="margin:0 0 14px"><b>Nothing is wrong with your voice.</b>
             <p>This badge clears when you open it and press <b>Save brand voice</b> — that press is what records that a human read it. Changing the wording is optional.</p></div>`}
           ${reviewed && !durable ? `<div class="ow-note warn" style="margin:0 0 14px"><b>This confirmation won’t survive the next update.</b>
             <p>Nothing is being stored permanently for this location, so the badge will ask again after the next deploy.</p></div>` : ''}
           <button class="btn btn-primary" style="width:auto" onclick="window.switchTab &amp;&amp; window.switchTab('brand-tab')">Read it through</button>`;
      } else if (voiceEl) {
        voiceEl.innerHTML = `<div class="ow-note warn"><b>Couldn’t load your brand voice just now.</b>
          <p>Nothing has changed — this is the page failing to read it, not the voice going missing.</p>
          <button class="btn btn-secondary" style="width:auto;margin-top:10px" data-ow-retry-business="1">Try again</button></div>`;
      }
      if (rd) {
        const row = (n, ok, txt) => `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border-color)">
          <span class="nm" style="font-weight:600">${owEsc(n)}</span>
          <span style="margin-left:auto" class="ow-chip ${ok ? 'auto' : 'blocked'}">${ok ? '&#10003; Connected' : '&#9650; ' + owEsc(txt)}</span></div>`;
        const get = k => (rd.checks || []).find(c => c.key === k) || { ok: false };
        document.getElementById('ow-conn').innerHTML =
          row('Google Search', get('gsc').ok, 'Not connected') +
          row('Your website', get('ghl').ok, 'Not connected') +
          row('AI writing', get('gemini').ok, 'Not connected') +
          `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px">
             <span style="font-weight:600">Google Business Profile</span>
             <span style="margin-left:auto" class="ow-chip manual">&#9679; Posts copied by hand</span></div>`;
      }
    } catch (e) { /* shells stay empty rather than showing invented values */ }
  }
  window.loadOwnerBusiness = loadOwnerBusiness;

  // ── the mode switch ──
  function setOwnerMode(on) {
    document.body.classList.toggle('owner-mode', on);
    const full = document.querySelector('.nav-menu:not(#owner-nav)');
    const own = document.getElementById('owner-nav');
    if (full) full.style.display = on ? 'none' : '';
    if (own) own.style.display = on ? '' : 'none';
    const lbl = document.getElementById('mode-switch-label');
    if (lbl) lbl.textContent = on ? 'Full interface' : 'Owner mode';
    try { localStorage.setItem('seo_owner_mode', on ? '1' : '0'); } catch (e) {}
    if (on && window.switchTab) window.switchTab('owner-today-tab');
    else if (!on && window.switchTab) window.switchTab('today-tab');
  }
  window.setOwnerMode = setOwnerMode;

  const modeBtn = document.getElementById('btn-mode-switch');
  if (modeBtn) modeBtn.addEventListener('click', () =>
    setOwnerMode(!document.body.classList.contains('owner-mode')));

  // Restore the last mode, without stealing the tab on first paint.
  try {
    if (localStorage.getItem('seo_owner_mode') === '1') setOwnerMode(true);
  } catch (e) {}

  // Generate Article Trigger
  btnGenerate.addEventListener('click', async () => {
    const keyword = inputKeyword.value.trim();
    const caseStudy = inputCaseStudy.value.trim();
    const ctaText = inputCtaText.value.trim();
    const ctaUrl = inputCtaUrl.value.trim();
    const transcriptEl = document.getElementById('input-transcript');
    const transcript = transcriptEl ? transcriptEl.value.trim() : '';

    if (!keyword) {
      alert('Please enter a target keyword.');
      return;
    }

    // Enter Loading State
    editorEmpty.style.display = 'none';
    visualEditor.style.display = 'none';
    codeEditor.style.display = 'none';
    editorLoader.style.display = 'flex';
    btnGenerate.disabled = true;

    try {
      const res = await authFetch('/api/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, caseStudy, ctaText, ctaUrl, transcript })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server failed to write article');
      }

      const safeContent = sanitizeHtml(data.content);
      state.generatedArticle = {
        title: data.title,
        content: safeContent,
        slug: data.slug
      };

      // Populate preview panes
      visualEditor.innerHTML = safeContent;
      codeEditor.value = safeContent;
      renderClaims(data.claimsToCheck);
      renderBrandViolations(data.brandViolations);

      // Populate publish hub fields
      deployTitle.value = data.title;
      
      const credentials = getStoredCredentials();
      let baseSiteUrl = credentials.siteUrl ? credentials.siteUrl.trim() : 'https://bestdayfitness.com';
      if (baseSiteUrl.startsWith('sc-domain:')) {
        baseSiteUrl = 'https://' + baseSiteUrl.substring(10);
      }
      baseSiteUrl = baseSiteUrl.replace(/\/$/, '');
      const cleanBlogPrefix = credentials.blogPrefix ? (credentials.blogPrefix.startsWith('/') ? credentials.blogPrefix : `/${credentials.blogPrefix}`) : '/post';
      const formattedBlogPrefix = cleanBlogPrefix.endsWith('/') ? cleanBlogPrefix.slice(0, -1) : cleanBlogPrefix;
      indexingUrlInput.value = `${baseSiteUrl}${formattedBlogPrefix}/${data.slug}`;

      // Update visibility
      editorLoader.style.display = 'none';
      if (state.editorMode === 'visual') {
        visualEditor.style.display = 'block';
      } else {
        codeEditor.style.display = 'block';
      }

    } catch (err) {
      alert(`AI Writing failed: ${err.message}`);
      editorLoader.style.display = 'none';
      editorEmpty.style.display = 'flex';
    } finally {
      btnGenerate.disabled = false;
    }
  });

  // --- EDITOR VIEW MODES & CONTENT SYNC ---
  editorTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.getAttribute('data-editor-mode');
      setEditorMode(mode);
    });
  });

  function setEditorMode(mode) {
    state.editorMode = mode;
    
    // Toggle active tab header
    editorTabs.forEach(t => {
      if (t.getAttribute('data-editor-mode') === mode) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    if (!state.generatedArticle) return; // No content yet

    if (mode === 'visual') {
      // Sync code changes to visual preview
      const safeContent = sanitizeHtml(codeEditor.value);
      visualEditor.innerHTML = safeContent;
      codeEditor.value = safeContent;
      state.generatedArticle.content = safeContent;
      codeEditor.style.display = 'none';
      visualEditor.style.display = 'block';
    } else {
      // Sync visual changes to code preview
      codeEditor.value = visualEditor.innerHTML;
      visualEditor.style.display = 'none';
      codeEditor.style.display = 'block';
    }
  }

  // Keep both visual and code views synced during manual editing
  visualEditor.addEventListener('input', () => {
    if (state.generatedArticle) {
      state.generatedArticle.content = visualEditor.innerHTML;
      codeEditor.value = visualEditor.innerHTML;
    }
  });

  codeEditor.addEventListener('input', () => {
    if (state.generatedArticle) {
      const safeContent = sanitizeHtml(codeEditor.value);
      state.generatedArticle.content = safeContent;
      visualEditor.innerHTML = safeContent;
    }
  });

  // --- CLIPBOARD ACTIONS ---
  btnCopyHtml.addEventListener('click', () => {
    if (!state.generatedArticle) {
      alert('Generate an article first!');
      return;
    }
    const html = sanitizeHtml(codeEditor.value);
    navigator.clipboard.writeText(html).then(() => {
      showTemporaryButtonText(btnCopyHtml, 'HTML Copied!');
    });
  });

  btnCopyText.addEventListener('click', () => {
    if (!state.generatedArticle) {
      alert('Generate an article first!');
      return;
    }
    // Simple HTML strip utility
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = visualEditor.innerHTML;
    const text = tempDiv.innerText || tempDiv.textContent || '';
    
    navigator.clipboard.writeText(text).then(() => {
      showTemporaryButtonText(btnCopyText, 'Text Copied!');
    });
  });

  function showTemporaryButtonText(button, text) {
    const originalText = button.innerHTML;
    button.innerText = text;
    button.style.borderColor = 'var(--color-success)';
    button.style.color = 'var(--color-success)';
    
    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.borderColor = '';
      button.style.color = '';
    }, 1800);
  }

  // Navigation from AI Creator to Publish tab
  btnProceedPublish.addEventListener('click', () => {
    if (!state.generatedArticle) {
      alert('Please generate an article first!');
      return;
    }
    switchTab('publish-tab');
  });

  // --- PUBLISHING & INDEXING EXECUTION ---
  btnPublishGhlNow.addEventListener('click', async () => {
    if (!state.generatedArticle) {
      alert('No article loaded in publishing workspace.');
      return;
    }

    const title = deployTitle.value;
    const content = sanitizeHtml(codeEditor.value);
    codeEditor.value = content;
    const status = deployStatus.value;

    btnPublishGhlNow.disabled = true;
    btnPublishGhlNow.innerText = 'Publishing to GHL...';

    try {
      const res = await authFetch('/api/publish-ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          status
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Publish failed');
      }

      alert(data.message || 'Article deployed successfully!');

      // Add to deployment history state
      const targetUrl = indexingUrlInput.value;
      const platformName = data.source === 'mock_ghl' ? 'GHL (Mock Dev)' : `GoHighLevel (${status})`;
      
      const newEntry = {
        title,
        keyword: inputKeyword.value,
        platform: platformName,
        date: new Date().toISOString().split('T')[0],
        indexed: 'Indexing Available',
        url: targetUrl
      };

      state.history.unshift(newEntry);
      renderHistory();

    } catch (err) {
      alert(`Publishing Error: ${err.message}`);
    } finally {
      btnPublishGhlNow.disabled = false;
      btnPublishGhlNow.innerText = 'Publish to GoHighLevel';
    }
  });

  btnIndexNow.addEventListener('click', async () => {
    const url = indexingUrlInput.value.trim();

    if (!url) {
      alert('Please provide a URL to submit for indexing.');
      return;
    }

    btnIndexNow.disabled = true;
    btnIndexNow.innerText = 'Requesting Crawl...';

    try {
      const res = await authFetch('/api/index-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Indexing API call failed');
      }

      alert(data.message || 'Crawl request sent successfully!');

      // Update matches in history if any
      state.history.forEach(item => {
        if (item.url === url) {
          // Canonical stored value, matching what the server writes. Four other
          // call sites count submissions with /requested|indexed/i against it.
          item.indexed = 'Indexing Requested';
        }
      });
      renderHistory();

    } catch (err) {
      alert(`Indexing Error: ${err.message}`);
    } finally {
      btnIndexNow.disabled = false;
      btnIndexNow.innerText = 'Ask Google to list this page';
    }
  });

  function renderHistory() {
    historyTableBody.innerHTML = '';

  // Stored statuses stay machine-readable; this is the only place a person
  // sees them, so the plain-English wording lives here rather than in the data.
  function sbIndexLabel(s) {
    // The full set the server can write, read off production rather than guessed:
    // 'Indexing Requested' (13 records) and 'Indexing Available' (3). The second
    // means the page is live on the site but Google has not been told yet, which
    // is exactly why the /requested|indexed/i submission count does not match it
    // — the label has to keep that distinction, not blur it.
    return ({ 'Indexing Requested': 'Asked Google to list it',
              'Indexing Available': 'Live, not sent to Google',
              'Indexed': 'Listed on Google',
              'Not Submitted': 'Not sent yet' })[s] || s || '\u2014';
  }

    state.history.forEach(item => {
      const tr = document.createElement('tr');
      
      let statusClass = 'pending';
      if (item.indexed === 'Indexed') statusClass = 'clean';
      else statusClass = 'pending';

      tr.innerHTML = `
        <td class="font-medium">${uiEsc(item.title)}</td>
        <td><span class="keyword-tag">${uiEsc(item.keyword)}</span></td>
        <td>${uiEsc(item.platform)}</td>
        <td>${uiEsc(item.date)}</td>
        <td><span class="status-badge ${statusClass}">${uiEsc(sbIndexLabel(item.indexed))}</span></td>
        <td><a href="${uiEsc(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer" class="live-link">${uiEsc(String(item.url || '').replace(/^https?:\/\//, ''))}</a></td>
      `;
      historyTableBody.appendChild(tr);
    });
  }

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

  function loadSettingsFromStorage() {
    // Migrate away from persistent browser secret storage. Integration keys
    // now live server-side; the admin password lasts only for this tab session.
    const legacyAdmin = localStorage.getItem('seo_admin_password');
    if (legacyAdmin && !sessionStorage.getItem('seo_admin_password')) sessionStorage.setItem('seo_admin_password', legacyAdmin);
    ['seo_admin_password', 'seo_gemini_key', 'seo_ghl_token', 'seo_gsc_json'].forEach(key => localStorage.removeItem(key));
    const creds = getStoredCredentials();
    
    settingsGeminiKey.value = creds.geminiKey;
    settingsGhlToken.value = creds.ghlToken;
    settingsGhlLocation.value = creds.ghlLocation;
    settingsGhlBlog.value = creds.ghlBlog;
    settingsSiteUrl.value = creds.siteUrl || 'https://bestdayfitness.com';
    settingsBlogPrefix.value = creds.blogPrefix || '/post';
    settingsAuthorName.value = creds.authorName || '';
    settingsAuthorUrl.value = creds.authorUrl || '';
    settingsGscJson.value = creds.gscJson;
    settingsAdminPassword.value = creds.adminPassword || '';
    if (settingsClientValue) settingsClientValue.value = creds.clientValue;
    if (settingsConvRate) settingsConvRate.value = creds.convRate;
    if (settingsCaptureRate) settingsCaptureRate.value = creds.captureRate;

    if (creds.siteUrl) {
      displaySiteUrlBadge.innerText = creds.siteUrl.replace('https://', '').replace('http://', '');
    }
  }

  // --- Search Console diagnostic ---------------------------------------
  // Turns "not connected" into the actual reason. The server does the work;
  // this only renders it and puts the fix next to the thing that is wrong.
  const btnGscDiag = document.getElementById('btn-gsc-diag');
  if (btnGscDiag) btnGscDiag.addEventListener('click', async () => {
    const body = document.getElementById('gsc-diag-body');
    btnGscDiag.disabled = true;
    const label = btnGscDiag.textContent;
    btnGscDiag.textContent = 'Testing\u2026';
    body.innerHTML = '<span class="text-muted">Asking Google\u2026</span>';
    try {
      const res = await authFetch('/api/gsc-diagnostics');
      if (res.status === 401) {
        body.innerHTML = '<span class="text-muted">Enter your admin password above first \u2014 this reads your deployment settings.</span>';
        return;
      }
      const d = await res.json();
      let html = (d.checks || []).map(c =>
        '<div class="gsc-row ' + (c.ok ? 'ok' : 'bad') + '">'
        + '<span class="mk">' + (c.ok ? '\u2713' : '!') + '</span>'
        + '<span><b>' + uiEsc(c.label) + '</b><span>' + uiEsc(c.detail || '') + '</span></span></div>').join('');

      if (d.serviceAccountEmail) {
        html += '<div class="gsc-row ok"><span class="mk">\u2139</span><span><b>Service account</b>'
          + '<span>This is the address you grant access to in Search Console:<br>'
          + '<span class="gsc-email">' + uiEsc(d.serviceAccountEmail) + '</span></span></span></div>';
      }
      if (d.fix) html += '<div class="gsc-fix"><b>Do this:</b> ' + uiEsc(d.fix) + '</div>';
      else if (d.verdict === 'connected') html += '<div class="gsc-fix"><b>Connected.</b> Real rankings and clicks will replace the sample data on the next refresh.</div>';
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<span class="text-muted">Could not run the test: ' + uiEsc(err.message) + '</span>';
    } finally {
      btnGscDiag.disabled = false;
      btnGscDiag.textContent = label;
    }
  });

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const geminiKey = settingsGeminiKey.value.trim();
    const openaiKey = (document.getElementById('settings-openai-key')?.value || '').trim();
    const perplexityKey = (document.getElementById('settings-perplexity-key')?.value || '').trim();
    const ghlToken = settingsGhlToken.value.trim();
    const ghlLocation = settingsGhlLocation.value.trim();
    const ghlBlog = settingsGhlBlog.value.trim();
    const siteUrl = settingsSiteUrl.value.trim();
    const blogPrefix = settingsBlogPrefix.value.trim();
    const authorName = settingsAuthorName.value.trim();
    const authorUrl = settingsAuthorUrl.value.trim();
    const gscJson = settingsGscJson.value.trim();
    const adminPassword = settingsAdminPassword.value;

    // Store the admin password first so the save request below is authorized.
    sessionStorage.setItem('seo_admin_password', adminPassword);
    // Business-value assumptions for the Summary dashboard estimates.
    if (settingsClientValue) localStorage.setItem('seo_client_value', settingsClientValue.value.trim() || '1395');
    if (settingsConvRate) localStorage.setItem('seo_conv_rate', settingsConvRate.value.trim() || '2');
    if (settingsCaptureRate) localStorage.setItem('seo_capture_rate', settingsCaptureRate.value.trim() || '5');
    localStorage.setItem('seo_ghl_location', ghlLocation);
    localStorage.setItem('seo_ghl_blog', ghlBlog);
    localStorage.setItem('seo_site_url', siteUrl);
    localStorage.setItem('seo_blog_prefix', blogPrefix);
    localStorage.setItem('seo_author_name', authorName);
    localStorage.setItem('seo_author_url', authorUrl);

    if (siteUrl) {
      displaySiteUrlBadge.innerText = siteUrl.replace('https://', '').replace('http://', '');
    }

    try {
      const response = await authFetch('/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey, openaiKey, perplexityKey, ghlToken, ghlLocation, ghlBlog, siteUrl, blogPrefix, authorName, authorUrl, gscJson })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        settingsGeminiKey.value = '';
        settingsGhlToken.value = '';
        settingsGscJson.value = '';
        const openaiInput = document.getElementById('settings-openai-key');
        const perplexityInput = document.getElementById('settings-perplexity-key');
        if (openaiInput) openaiInput.value = '';
        if (perplexityInput) perplexityInput.value = '';
        alert(data.message || 'Configuration saved securely on the server.');
      } else {
        alert(`Server settings were not saved: ${data.error || 'Unknown server error'}`);
      }
    } catch (err) {
      alert(`Could not save server settings: ${err.message}`);
    }

    switchTab('gsc-tab');
  });

  // --- PERSISTENT HISTORY & AUTOPILOT CONTROLLER ---
  const autopilotToggle = document.getElementById('autopilot-toggle');
  const autopilotToggleLabel = document.getElementById('autopilot-toggle-label');
  const autopilotInterval = document.getElementById('autopilot-interval');
  const autopilotNextRun = document.getElementById('autopilot-next-run');
  const btnRunAutopilotNow = document.getElementById('btn-run-autopilot-now');
  const autopilotLogsContainer = document.getElementById('autopilot-logs-container');

  // Turns autopilot log lines into something an owner can act on. The single
  // most common failure in this app is the Indexing API returning 403 because
  // the service account has "Full" rather than "Owner" in Search Console — as
  // a monospace line people scroll past it, so it gets a cause and a fix.
  const SB_LOG_RULES = [
    { re: /permission denied|403|failed to verify url ownership/i, tone: 'warn', icon: '!',
      title: 'Google wouldn’t accept the indexing request',
      note: 'Your service account needs <b>Owner</b> access in Search Console, not “Full”. Everything else published fine.' },
    { re: /autopilot run complete|deployed and indexed/i, tone: 'ok', icon: '✓',
      title: 'Published a new article', note: 'Written and posted to your website on its own.' },
    { re: /requesting instant google indexing/i, tone: 'ok', icon: '✓',
      title: 'Asked Google to index it', note: '' },
    { re: /publishing article to gohighlevel/i, tone: 'ok', icon: '✓',
      title: 'Published to your website', note: '' },
    { re: /generating structural seo article|generating/i, tone: 'ok', icon: '✓',
      title: 'Wrote a new article', note: '' },
    { re: /background autopilot enabled|schedule/i, tone: '', icon: '○',
      title: 'Schedule set', note: '' },
    { re: /disabled|standing by/i, tone: '', icon: '○',
      title: 'Autopilot is off', note: 'Turn it on and it writes, publishes and indexes without you.' },
    { re: /error|failed/i, tone: 'warn', icon: '!',
      title: 'Something didn’t finish', note: '' }
  ];
  function renderAutopilotFeed(logs) {
    const host = document.getElementById('autopilot-feed'); if (!host) return;
    if (!Array.isArray(logs) || !logs.length) {
      host.innerHTML = '<div class="sb-feed-row"><span class="sb-fi">○</span><div class="sb-ft"><b>Nothing yet</b>'
        + '<span>Turn the autopilot on and it will find a gap, write the page, publish it and ask Google to list it.</span></div></div>';
      return;
    }
    const seen = new Set(), rows = [];
    for (const log of logs) {
      const msg = String(log.message || '');
      const rule = SB_LOG_RULES.find(r => r.re.test(msg));
      if (!rule) continue;
      if (seen.has(rule.title)) continue;      // one row per kind, newest wins
      seen.add(rule.title);
      rows.push('<div class="sb-feed-row ' + rule.tone + '"><span class="sb-fi">' + rule.icon + '</span>'
        + '<div class="sb-ft"><b>' + rule.title + '</b>' + (rule.note ? '<span>' + rule.note + '</span>' : '') + '</div>'
        + '<span class="sb-fw">' + tdAgo(log.timestamp) + '</span></div>');
      if (rows.length >= 5) break;
    }
    host.innerHTML = rows.length ? rows.join('')
      : '<div class="sb-feed-row"><span class="sb-fi">○</span><div class="sb-ft"><b>Running</b><span>Nothing needing your attention.</span></div></div>';
  }



  async function fetchHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      state.history = Array.isArray(data) ? data : (data && Array.isArray(data.history) ? data.history : []);
      renderHistory();
    } catch (err) {
      console.error('[History] Sync failed:', err.message);
    }
  }

  async function fetchAutopilotStatus() {
    try {
      const res = await fetch('/api/autopilot-status');
      const data = await res.json();
      
      autopilotToggle.checked = data.enabled;
      autopilotToggleLabel.innerText = `Autopilot: ${data.enabled ? 'ON' : 'OFF'}`;
      autopilotToggleLabel.style.color = data.enabled ? 'var(--color-success)' : 'var(--text-muted)';
      
      const terminalDot = document.querySelector('.terminal-dot');
      if (terminalDot) {
        if (data.enabled) terminalDot.classList.add('active');
        else terminalDot.classList.remove('active');
      }

      autopilotInterval.value = data.intervalHours;
      renderAutopilotQueue(data.queue || []);

      if (data.enabled && data.nextRunTime) {
        const nextDate = new Date(data.nextRunTime);
        autopilotNextRun.innerText = nextDate.toLocaleString();
        autopilotNextRun.style.color = 'var(--color-secondary)';
      } else {
        autopilotNextRun.innerText = 'Not Scheduled';
        autopilotNextRun.style.color = 'var(--text-muted)';
      }

      // Plain-English feed first; the raw log is unchanged behind the disclosure.
      renderAutopilotFeed(data.logs);

      // Render logs
      autopilotLogsContainer.innerHTML = '';
      if (!Array.isArray(data.logs) || data.logs.length === 0) {
        autopilotLogsContainer.innerHTML = `<div class="terminal-log-line text-sm">[System] Standing by. Enable Autopilot to schedule checks.</div>`;
      } else {
        data.logs.forEach(log => {
          const div = document.createElement('div');
          div.className = 'terminal-log-line';
          const localTime = new Date(log.timestamp).toLocaleTimeString();
          const time = document.createElement('span');
          time.className = 'timestamp';
          time.textContent = localTime;
          div.append(time, document.createTextNode(` ${String(log.message || '')}`));
          autopilotLogsContainer.appendChild(div);
        });
      }
    } catch (err) {
      console.error('[Autopilot Status] Fetch failed:', err.message);
    }
  }

  async function updateAutopilotSchedule() {
    const enabled = autopilotToggle.checked;
    const intervalHours = parseFloat(autopilotInterval.value);
    
    try {
      await authFetch('/api/autopilot-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalHours })
      });
      fetchAutopilotStatus();
    } catch (err) {
      console.error('[Autopilot Toggle] Failed:', err.message);
    }
  }

  autopilotToggle.addEventListener('change', updateAutopilotSchedule);
  autopilotInterval.addEventListener('change', updateAutopilotSchedule);

  // Content queue (topics the autopilot writes first)
  function renderAutopilotQueue(queue) {
    const el = document.getElementById('autopilot-queue-list');
    if (!el) return;
    if (!queue || !queue.length) {
      el.innerHTML = '<div class="text-muted" style="font-size:var(--font-xs);">Nothing queued — the autopilot will find the next search worth writing for.</div>';
      return;
    }
    el.innerHTML = queue.map((q, i) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 10px;background:rgba(0,0,0,.2);border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;font-size:var(--font-sm);">
      <span><span style="color:var(--color-secondary);font-weight:700;">${i + 1}.</span> ${sumEsc(q.topic)}</span>
      <button class="apq-remove" data-i="${i}" title="Remove" style="background:none;border:none;color:var(--color-accent);cursor:pointer;font-size:18px;line-height:1;padding:0 4px;">&times;</button>
    </div>`).join('');
    el.querySelectorAll('.apq-remove').forEach(b => b.addEventListener('click', () => apQueueRemove(+b.dataset.i)));
  }
  async function apQueueAdd() {
    const inp = document.getElementById('autopilot-queue-input');
    if (!inp) return;
    const topic = (inp.value || '').trim();
    if (!topic) { alert('Enter a topic or keyword.'); return; }
    try {
      const r = await authFetch('/api/autopilot-queue/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
      const d = await r.json();
      if (!r.ok || !d.success) { alert(d.error || 'Could not add.'); return; }
      inp.value = '';
      renderAutopilotQueue(d.queue);
    } catch (e) { alert('Error: ' + e.message); }
  }
  async function apQueueRemove(i) {
    try {
      const r = await authFetch('/api/autopilot-queue/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i }) });
      const d = await r.json();
      renderAutopilotQueue(d.queue);
    } catch (e) { alert('Error: ' + e.message); }
  }
  const btnApQueueAdd = document.getElementById('btn-autopilot-queue-add');
  if (btnApQueueAdd) btnApQueueAdd.addEventListener('click', apQueueAdd);
  const apQueueInput = document.getElementById('autopilot-queue-input');
  if (apQueueInput) apQueueInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apQueueAdd(); } });

  btnRunAutopilotNow.addEventListener('click', async () => {
    btnRunAutopilotNow.disabled = true;
    const originalContent = btnRunAutopilotNow.innerHTML;
    btnRunAutopilotNow.innerText = 'Agent Operating...';

    try {
      const res = await authFetch('/api/autopilot-run-now', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server error during autopilot run');
      }
      
      alert(data.message);
      
      // Update GSC gaps, history, and log viewer
      syncGSCData();
      fetchHistory();
      fetchAutopilotStatus();
    } catch (err) {
      alert(`Autopilot Run failed: ${err.message}`);
    } finally {
      btnRunAutopilotNow.disabled = false;
      btnRunAutopilotNow.innerHTML = originalContent;
    }
  });

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
      <div class="home-move-act"><button class="btn btn-primary" type="button">${sumEsc(m.cta)}</button><span class="meff">${sumEsc(m.effort || '')}</span></div>
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
  function tdAgo(iso){ const t = new Date(iso).getTime(); if (isNaN(t)) return ''; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 90) return 'just now'; const m = s / 60; if (m < 60) return Math.round(m) + ' min ago'; const h = m / 60; if (h < 24) return Math.round(h) + 'h ago'; return Math.round(h / 24) + 'd ago'; }
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
      track.scrollTo({ left: n * step(), behavior: 'smooth' });
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
    window.addEventListener('resize', () => {
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
    loadGetStarted();
    const host = document.getElementById('exp-groups'); if (!host) return;
    host.innerHTML = EXPLORE_GROUPS.map(function(grp){
      return '<div class="exp-group"><div class="exp-gl">' + grp.g + '</div><div class="exp-list">' + grp.items.map(function(it){
        const key = it.tab ? ('tab:' + it.tab) : ('act:' + it.act);
        return '<div class="exp-row" data-go="' + key + '"><div class="exp-ic">' + expIc(it.icon) + '</div><div class="exp-t"><b>' + it.b + '</b><span>' + it.s + '</span></div><div class="exp-chev">' + expIc('chev') + '</div></div>';
      }).join('') + '</div></div>';
    }).join('');
    host.querySelectorAll('.exp-row').forEach(function(row){
      row.addEventListener('click', function(){
        const go = row.getAttribute('data-go') || '';
        if (go.indexOf('tab:') === 0) { switchTab(go.slice(4)); }
        else if (go === 'act:setup') { const b = document.getElementById('btn-open-setup'); if (b) b.click(); }
        else if (go === 'act:ask') { const b = document.getElementById('asst-fab'); if (b) b.click(); }
      });
    });
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
        <div class="gmove-r"><span class="gmtag ${m.impact}">${tagLabel[m.impact] || ''}</span><button class="btn btn-primary" type="button">${sumEsc(m.cta)}</button></div>
      </div>`).join('');
      el.querySelectorAll('.gmove-r .btn').forEach((b, i) => b.addEventListener('click', () => runMoveAction(moves[i], b)));
    } catch (e) { el.innerHTML = '<div class="text-muted" style="font-size:var(--font-sm);">Couldn’t load your action list.</div>'; }
  }
  window.loadGrow = loadGrow;
  document.querySelectorAll('#grow-tab .grow-tool').forEach(c => c.addEventListener('click', () => homeGoTab(c.dataset.tab)));

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
  if (state.activeTab === 'today-tab') {
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
      fetchAutopilotStatus();
      fetchHistory();
    }
  }, 12000);

  // Summary auto-refresh (real-time while the tab is open)
  setInterval(() => {
    if (state.activeTab === 'summary-tab') loadSummary();
  }, 30000);

  // --- AI SEARCH AUDIT & SCHEMA ASSET ENGINE ---
  aioQuerySelector.addEventListener('change', () => {
    if (aioQuerySelector.value === 'custom') {
      aioCustomQueryContainer.style.display = 'block';
    } else {
      aioCustomQueryContainer.style.display = 'none';
    }
  });

  async function fetchAioHistory() {
    try {
      const res = await fetch('/api/aio-history');
      const history = await res.json();
      renderAioHistory(history);
      
      if (history.length > 0) {
        const citedCount = history.filter(item => item.recommended).length;
        const rate = Math.round((citedCount / history.length) * 100);
        aioSovRate.innerText = `${rate}%`;
      }
    } catch (err) {
      console.error('[AIO History] Sync failed:', err.message);
    }
  }

  function renderAioHistory(history) {
    aioHistoryTableBody.innerHTML = '';
    
    if (history.length === 0) {
      aioHistoryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 16px;">No historical audits found. Click audit button to start!</td></tr>`;
      return;
    }

    history.forEach(item => {
      const tr = document.createElement('tr');
      const date = new Date(item.timestamp).toLocaleString();
      
      const statusText = item.recommended ? 'Recommended' : 'Not Mentioned';
      const statusClass = item.recommended ? 'clean' : 'leak';

      // "Cited as Source?" reflects whether the brand appeared in the REAL cited
      // sources (item.cited); older records without the flag fall back to recommended.
      const citedFlag = (typeof item.cited === 'boolean') ? item.cited : item.recommended;
      const citedText = citedFlag ? 'Yes' : 'No';
      const competitorsStr = item.competitors && item.competitors.length > 0 ? item.competitors.join(', ') : 'None';

      tr.innerHTML = `
        <td>${uiEsc(date)}</td>
        <td><span class="keyword-tag">${uiEsc(item.query)}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="font-medium">${citedText}</td>
        <td>${uiEsc(competitorsStr)}</td>
      `;
      aioHistoryTableBody.appendChild(tr);
    });
  }

  async function fetchAioSchemas() {
    try {
      const res = await fetch('/api/aio-schema');
      const data = await res.json();
      compiledSchemas = data;
      renderSchemaOutput();
    } catch (err) {
      console.error('[AIO Schemas] Build failed:', err.message);
    }
  }

  function renderSchemaOutput() {
    const code = compiledSchemas[activeSchemaType] || '// Failed to load schema';
    schemaCodeOutput.value = code;
  }

  btnSchemaLocal.addEventListener('click', () => {
    btnSchemaLocal.classList.add('active');
    btnSchemaFaq.classList.remove('active');
    activeSchemaType = 'localBusiness';
    renderSchemaOutput();
  });

  btnSchemaFaq.addEventListener('click', () => {
    btnSchemaFaq.classList.add('active');
    btnSchemaLocal.classList.remove('active');
    activeSchemaType = 'faq';
    renderSchemaOutput();
  });

  btnCopySchema.addEventListener('click', () => {
    navigator.clipboard.writeText(schemaCodeOutput.value);
    btnCopySchema.innerText = 'Copied!';
    setTimeout(() => {
      btnCopySchema.innerText = 'Copy code';
    }, 2000);
  });

  btnRunAioAudit.addEventListener('click', async () => {
    let query = aioQuerySelector.value;
    if (query === 'custom') {
      query = aioCustomQuery.value.trim();
    }
    
    if (!query) {
      alert('Please select or input a search query to audit.');
      return;
    }

    btnRunAioAudit.disabled = true;
    btnRunAioAudit.innerText = 'Querying Google\'s AI (live search)…';
    aioResultsPanel.style.display = 'none';

    try {
      const res = await authFetch('/api/aio-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AIO Audit API failed');
      }

      // Honest "no Gemini key" state — never render fabricated results.
      if (data.unavailable) {
        alert(data.message || 'Add your Gemini key in Settings to run a real check.');
        renderAioHistory(data.history || []);
        return;
      }

      const latest = data.latest;

      aioResultsPanel.style.display = 'block';

      const badgeText = aioStatusBadge.querySelector('.status-text');
      if (latest.recommended) {
        aioStatusBadge.className = 'status-indicator live';
        badgeText.innerText = latest.cited ? 'Recommended + Cited' : 'Mentioned';
      } else {
        aioStatusBadge.className = 'status-indicator mock';
        badgeText.innerText = 'Not Mentioned';
      }

      aioSnippetText.innerText = latest.responseSnippet || '(no answer text returned)';

      // Cited sources — real domains from Google's grounding (title = domain, uri = link).
      aioCitedUrls.innerHTML = '';
      const sources = (latest.citedSources && latest.citedSources.length)
        ? latest.citedSources
        : (latest.citedUrls || []).map(u => ({ title: u.replace(/^https?:\/\//, ''), uri: u }));
      if (!sources.length) {
        aioCitedUrls.innerHTML = `<li style="color: var(--text-muted); padding: 4px 0;">None</li>`;
      } else {
        sources.forEach(s => {
          const li = document.createElement('li');
          li.style.marginBottom = '6px';
          const label = s.title || (s.uri || '').replace(/^https?:\/\//, '');
          if (s.uri) {
            li.innerHTML = `<a href="${uiEsc(safeExternalUrl(s.uri))}" target="_blank" rel="noopener noreferrer" class="live-link" style="text-decoration: underline;">${uiEsc(label)}</a>`;
          } else {
            li.innerText = label;
          }
          aioCitedUrls.appendChild(li);
        });
      }

      aioCompetitors.innerHTML = '';
      if (!latest.competitors || latest.competitors.length === 0) {
        aioCompetitors.innerHTML = `<li style="color: var(--text-muted); padding: 4px 0;">None</li>`;
      } else {
        latest.competitors.forEach(comp => {
          const li = document.createElement('li');
          li.style.color = 'var(--text-muted)';
          li.style.marginBottom = '6px';
          li.innerText = comp;
          aioCompetitors.appendChild(li);
        });
      }

      // Real Google Search queries used for grounding.
      if (aioSearchQueries) {
        if (latest.searchQueries && latest.searchQueries.length) {
          aioSearchQueries.style.display = 'block';
          aioSearchQueries.innerHTML = `<strong style="color: var(--text-muted);">Google searches run:</strong> ${latest.searchQueries.map(q => `<span class="keyword-tag">${uiEsc(q)}</span>`).join(' ')}`;
        } else {
          aioSearchQueries.style.display = 'none';
          aioSearchQueries.innerHTML = '';
        }
      }

      // Google-required Search Suggestions chip (from grounding metadata).
      if (aioSearchSuggestions) {
        if (latest.searchEntryPoint) {
          aioSearchSuggestions.style.display = 'block';
          aioSearchSuggestions.innerHTML = sanitizeHtml(latest.searchEntryPoint);
        } else {
          aioSearchSuggestions.style.display = 'none';
          aioSearchSuggestions.innerHTML = '';
        }
      }

      renderAioHistory(data.history);
      if (data.history.length > 0) {
        const citedCount = data.history.filter(item => item.recommended).length;
        const rate = Math.round((citedCount / data.history.length) * 100);
        aioSovRate.innerText = `${rate}%`;
      }

    } catch (err) {
      alert(`AIO Audit Error: ${err.message}`);
    } finally {
      btnRunAioAudit.disabled = false;
      btnRunAioAudit.innerText = 'Run Live Google-AI Audit';
    }
  });

  // --- MULTI-ENGINE AI VISIBILITY DASHBOARD (Phase 1/2) ---
  let avState = null;
  let avMetric = 'visibility';
  const AV_METRIC_META = {
    visibility: { label: 'Visibility Score', desc: 'Percentage of AI answers that mention your brand.' },
    shareOfVoice: { label: 'How often you are named', desc: 'Your share of all brand mentions vs competitors in AI answers.' },
    sentiment: { label: 'Sentiment', desc: 'How positively AI describes you when it mentions you (100 = all positive).' }
  };
  const avEl = id => document.getElementById(id);
  function avEsc(s) { const d = document.createElement('div'); d.innerText = s == null ? '' : String(s); return d.innerHTML; }

  function avMetricValue(snap, metric) {
    if (!snap) return null;
    if (metric === 'visibility') return snap.visibilityScore;
    if (metric === 'shareOfVoice') return snap.shareOfVoice;
    if (metric === 'sentiment') return snap.sentimentScore;
    return null;
  }
  function avDeltaVal(metric) {
    if (!avState || !avState.deltas) return null;
    return avState.deltas[metric];
  }

  function avRenderEngines() {
    const wrap = avEl('av-engines'); if (!wrap) return;
    wrap.innerHTML = (avState.engines || []).map(e =>
      `<span class="av-chip ${e.configured ? 'on' : 'off'}" title="${e.configured ? 'Connected' : 'Add ' + avEsc(e.id.toUpperCase()) + '_API_KEY in Railway to enable'}"><span class="dot"></span>${avEsc(e.label)}${e.configured ? '' : ' &middot; off'}</span>`
    ).join('');
  }

  // Simple responsive SVG multi-line chart. series=[{name,isBrand,color,points:[{date,score}]}]
  function avLineChart(series, dates) {
    const W = 640, H = 220, padL = 30, padR = 12, padT = 12, padB = 22;
    const n = dates.length;
    const maxY = 100;
    const x = i => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR) / (n - 1)));
    const y = v => padT + (H - padT - padB) * (1 - (Math.max(0, Math.min(maxY, v)) / maxY));
    let g = '';
    // horizontal gridlines at 0/25/50/75/100
    for (const gv of [0, 25, 50, 75, 100]) {
      g += `<line x1="${padL}" y1="${y(gv)}" x2="${W - padR}" y2="${y(gv)}" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
      g += `<text x="${padL - 6}" y="${y(gv) + 3}" text-anchor="end" font-size="9" fill="#64748b">${gv}</text>`;
    }
    series.forEach(s => {
      const pts = s.points.map((p, i) => `${x(i)},${y(p.score)}`);
      const col = s.color || (s.isBrand ? '#6366f1' : '#64748b');
      if (pts.length > 1) g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${s.isBrand ? 3 : 1.6}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.isBrand ? 1 : .75}"/>`;
      s.points.forEach((p, i) => { g += `<circle cx="${x(i)}" cy="${y(p.score)}" r="${s.isBrand ? 3.5 : 2.5}" fill="${col}"/>`; });
    });
    // x labels (first + last)
    if (n) {
      g += `<text x="${x(0)}" y="${H - 6}" text-anchor="start" font-size="9" fill="#64748b">${avEsc(dates[0])}</text>`;
      if (n > 1) g += `<text x="${x(n - 1)}" y="${H - 6}" text-anchor="end" font-size="9" fill="#64748b">${avEsc(dates[n - 1])}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="AI visibility trend">${g}</svg>`;
  }

  const AV_PALETTE = ['#6366f1', '#06b6d4', '#f59e0b', '#f43f5e', '#10b981', '#a855f7'];
  function avRenderChart() {
    const box = avEl('av-chart'), legend = avEl('av-legend'); if (!box) return;
    const trend = avState.trend || { series: [], dates: [], metricLines: {} };
    const dates = trend.dates || [];
    if (!dates.length) { box.innerHTML = '<div class="text-muted" style="font-size:13px;padding:20px 0;">Run a check to start the trend. It builds a line over time as checks accrue.</div>'; legend.innerHTML = ''; return; }
    if (avMetric === 'visibility') {
      // multi-brand: you vs top competitors
      const series = (trend.series || []).map((s, i) => ({ ...s, color: s.isBrand ? '#6366f1' : AV_PALETTE[(i % (AV_PALETTE.length - 1)) + 1] }));
      box.innerHTML = avLineChart(series, dates);
      legend.innerHTML = series.map(s => `<span class="lg"><i style="background:${s.color}"></i>${avEsc(s.name)}${s.isBrand ? ' (you)' : ''}</span>`).join('');
    } else {
      const line = (trend.metricLines && trend.metricLines[avMetric]) || [];
      const series = [{ name: avState.brand, isBrand: true, color: '#6366f1', points: line.map(p => ({ date: p.date, score: p.value == null ? 0 : p.value })) }];
      box.innerHTML = avLineChart(series, dates);
      legend.innerHTML = `<span class="lg"><i style="background:#6366f1"></i>${avEsc(AV_METRIC_META[avMetric].label)}</span>`;
    }
  }

  function avRenderScore() {
    const snap = avState.latest;
    const val = avMetricValue(snap, avMetric);
    avEl('av-score').innerHTML = (val == null ? '&mdash;' : val + (avMetric === 'sentiment' ? '' : '%'));
    avEl('av-metric-desc').innerText = AV_METRIC_META[avMetric].desc;
    const d = avDeltaVal(avMetric);
    const dEl = avEl('av-delta');
    if (d == null || !snap) { dEl.style.display = 'none'; }
    else {
      dEl.style.display = '';
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
      dEl.className = 'av-delta ' + cls;
      dEl.innerText = (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '± ') + d + (avMetric === 'sentiment' ? '' : '%');
    }
    // metric tab active state
    document.querySelectorAll('#aio-tab .av-mtab').forEach(b => b.classList.toggle('active', b.dataset.metric === avMetric));
  }

  function avRenderEngineBreakdown() {
    const box = avEl('av-eng-break'); if (!box) return;
    const snap = avState.latest;
    if (!snap || !snap.perEngine || !snap.perEngine.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = `<div class="av-lb-title">Visibility by engine &middot; latest check</div>` + snap.perEngine.map(pe =>
      `<div class="av-eng-row"><span>${avEsc(pe.label || pe.engine)}</span><span class="av-eng-track"><span class="av-eng-fill" style="width:${pe.score}%"></span></span><span style="text-align:right;font-weight:700;">${pe.score}%</span></div>`
    ).join('');
  }

  function avRenderLeaderboard() {
    const box = avEl('av-leaderboard'); if (!box) return;
    const snap = avState.latest;
    const lb = (snap && snap.leaderboard) || [];
    // build a prev-map for deltas
    const snaps = (avState.trend && avState.trend.series) || [];
    const prevScore = {};
    (avState.trend && avState.trend.dates || []);
    if (!lb.length) { box.innerHTML = '<div class="text-muted" style="font-size:13px;">No brands detected yet — run a check.</div>'; return; }
    box.innerHTML = lb.slice(0, 8).map((row, i) => {
      // delta from the brand's own trend line if available
      let deltaHtml = '<span class="av-lb-delta flat">—</span>';
      const sTrend = (avState.trend.series || []).find(s => s.name.toLowerCase() === row.name.toLowerCase());
      if (sTrend && sTrend.points.length > 1) {
        const dv = sTrend.points[sTrend.points.length - 1].score - sTrend.points[sTrend.points.length - 2].score;
        const cls = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
        deltaHtml = `<span class="av-lb-delta ${cls}">${dv > 0 ? '▲' : dv < 0 ? '▼' : ''}${dv === 0 ? '—' : Math.abs(dv) + '%'}</span>`;
      }
      return `<div class="av-lb-row ${row.isBrand ? 'me' : ''}">
        <span class="av-lb-rank">${i + 1}</span>
        <span class="av-lb-name">${avEsc(row.name)}${row.isBrand ? '<span class="youtag">YOU</span>' : ''}</span>
        <span class="av-lb-score">${row.score}%</span>
        ${deltaHtml}
      </div>`;
    }).join('');
  }

  function avRender() {
    if (!avState) return;
    avRenderEngines();
    const anyConfigured = avState.anyConfigured;
    const hasData = !!avState.latest;
    const emptyEl = avEl('av-empty'), mainEl = avEl('av-main');
    // auto-weekly toggle + running state
    const autoBox = avEl('av-auto'); if (autoBox) autoBox.checked = !!avState.autoEnabled;
    const runBtn = avEl('av-run');
    if (runBtn) {
      if (avState.running) { runBtn.disabled = true; runBtn.innerHTML = 'Checking engines…'; }
      else if (!runBtn.dataset.busy) { runBtn.disabled = false; runBtn.innerHTML = '&#8635; Run AI visibility check'; }
    }
    if (avState.running) avStartPolling();
    if (avEl('av-updated')) avEl('av-updated').innerText = avState.updatedAt ? ('Last check ' + avAgo(avState.updatedAt)) : 'Never run';
    if (!hasData) {
      mainEl.style.display = 'none';
      emptyEl.style.display = '';
      emptyEl.innerHTML = anyConfigured
        ? `Track how often <b>${avEsc(avState.brand)}</b> is recommended across AI answer engines. Click <b>Run AI visibility check</b> to run your tracked prompts across ${avState.engines.filter(e => e.configured).map(e => e.label).join(', ')} and build your first score.`
        : `No AI engines are connected yet. Add <b>GEMINI_API_KEY</b> in Settings/Railway to check Google's AI now — and <b>OPENAI_API_KEY</b> / <b>PERPLEXITY_API_KEY</b> to also track ChatGPT and Perplexity. Each engine lights up automatically once its key is set.`;
      return;
    }
    emptyEl.style.display = 'none';
    mainEl.style.display = '';
    avRenderScore();
    avRenderChart();
    avRenderEngineBreakdown();
    avRenderLeaderboard();
  }

  function avAgo(iso) {
    try {
      const then = new Date(iso).getTime(); const s = Math.max(0, (Date.now() - then) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
      return new Date(iso).toLocaleDateString();
    } catch (e) { return ''; }
  }

  async function loadAiVisibility() {
    try {
      const res = await fetch('/api/ai-visibility');
      avState = await res.json();
      avRender();
    } catch (e) { /* leave as-is */ }
  }
  window.loadAiVisibility = loadAiVisibility;

  // Poll while a check runs in the background (scheduled or long manual run).
  let avPollTimer = null;
  function avStartPolling() {
    if (avPollTimer) return;
    avPollTimer = setInterval(async () => {
      try {
        const r = await fetch('/api/ai-visibility'); const d = await r.json();
        if (!d.running) { clearInterval(avPollTimer); avPollTimer = null; const rb = avEl('av-run'); if (rb) delete rb.dataset.busy; avState = d; avRender(); }
      } catch (e) { clearInterval(avPollTimer); avPollTimer = null; }
    }, 5000);
  }

  document.querySelectorAll('#aio-tab .av-mtab').forEach(btn => {
    btn.addEventListener('click', () => { avMetric = btn.dataset.metric; if (avState && avState.latest) { avRenderScore(); avRenderChart(); } });
  });
  const avRunBtn = avEl('av-run');
  if (avRunBtn) avRunBtn.addEventListener('click', async () => {
    if (avState && !avState.anyConfigured) { alert('No AI engines are connected. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY) in Railway, then run again.'); return; }
    avRunBtn.disabled = true; avRunBtn.dataset.busy = '1'; avRunBtn.innerHTML = 'Checking engines…';
    try {
      const r = await authFetch('/api/ai-visibility/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Run failed');
      delete avRunBtn.dataset.busy;
      await loadAiVisibility();
    } catch (e) { delete avRunBtn.dataset.busy; alert('AI visibility check failed: ' + e.message); await loadAiVisibility(); }
  });
  // Auto-weekly toggle
  const avAutoBox = avEl('av-auto');
  if (avAutoBox) avAutoBox.addEventListener('change', async () => {
    try {
      const r = await authFetch('/api/ai-visibility/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: avAutoBox.checked }) });
      const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Toggle failed');
    } catch (e) { avAutoBox.checked = !avAutoBox.checked; alert('Could not update auto-weekly: ' + e.message); }
  });
  // Prompt editor
  const avEditBtn = avEl('av-edit-prompts'), avPromptsPanel = avEl('av-prompts-panel'), avPromptsText = avEl('av-prompts-text');
  if (avEditBtn) avEditBtn.addEventListener('click', () => {
    const open = avPromptsPanel.style.display !== 'none';
    if (open) { avPromptsPanel.style.display = 'none'; return; }
    avPromptsText.value = (avState && avState.prompts ? avState.prompts : []).join('\n');
    avPromptsPanel.style.display = 'block';
  });
  const avPromptsCancel = avEl('av-prompts-cancel');
  if (avPromptsCancel) avPromptsCancel.addEventListener('click', () => { avPromptsPanel.style.display = 'none'; });
  const avPromptsSave = avEl('av-prompts-save');
  if (avPromptsSave) avPromptsSave.addEventListener('click', async () => {
    const list = avPromptsText.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 25);
    if (!list.length) { alert('Add at least one search prompt.'); return; }
    avPromptsSave.disabled = true; avPromptsSave.innerText = 'Saving…';
    try {
      const r = await authFetch('/api/ai-visibility/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompts: list }) });
      const d = await r.json(); if (!r.ok || !d.success) throw new Error(d.error || 'Save failed');
      if (avState) avState.prompts = d.prompts;
      avPromptsPanel.style.display = 'none';
    } catch (e) { alert('Could not save prompts: ' + e.message); }
    finally { avPromptsSave.disabled = false; avPromptsSave.innerText = 'Save prompts'; }
  });

  // --- FACTCHECK / BRAND-ACCURACY MONITOR (P4a) ---
  let fcState = null, fcPollTimer = null;
  function fcAccClass(a) { return a == null ? 'na' : a >= 85 ? 'good' : a >= 50 ? 'warn' : 'bad'; }
  function fcRender() {
    if (!fcState) return;
    const upd = avEl('fc-updated'); if (upd) upd.innerText = fcState.updatedAt ? ('Checked ' + avAgo(fcState.updatedAt)) : '';
    const runBtn = avEl('fc-run');
    if (runBtn) { if (fcState.running) { runBtn.disabled = true; runBtn.innerHTML = 'Checking…'; if (!fcPollTimer) fcStartPolling(); } else if (!runBtn.dataset.busy) { runBtn.disabled = false; runBtn.innerHTML = 'Run FactCheck'; } }
    const body = avEl('fc-body'); if (!body) return;
    const latest = fcState.latest;
    if (!latest) {
      body.innerHTML = `<div class="fc-empty">${fcState.anyConfigured
        ? 'Click <b>Run FactCheck</b> to see what each AI engine believes about your business — and where it&rsquo;s wrong.'
        : 'Connect an AI engine (add <b>GEMINI_API_KEY</b> in Settings) to run FactCheck.'}</div>`;
      return;
    }
    body.innerHTML = (latest.results || []).map(r => {
      if (r.error) return `<div class="fc-engine"><div class="fc-engine-top"><span class="fc-engine-name">${avEsc(r.label)}</span><span class="fc-acc na">unavailable</span></div><div class="fc-summary">${avEsc(r.error)}</div></div>`;
      const wrong = (r.issues || []).filter(i => !i.correct);
      const right = (r.issues || []).filter(i => i.correct);
      const accTxt = r.accuracy == null ? 'No firm claims' : (r.accuracy + '% accurate');
      const wrongHtml = wrong.map(i => `<div class="fc-issue wrong"><span class="ic">&#9888;</span><span><b>${avEsc(i.aiClaim)}</b>${i.truth ? ` &rarr; <span class="truth">${avEsc(i.truth)}</span>` : ''}${i.note ? ` <span style="color:var(--text-dark)">(${avEsc(i.note)})</span>` : ''}</span></div>`).join('');
      const rightLine = right.length ? `<div class="fc-issue ok"><span class="ic">&#10003;</span><span>${right.length} claim${right.length > 1 ? 's' : ''} verified correct</span></div>` : '';
      return `<div class="fc-engine">
        <div class="fc-engine-top"><span class="fc-engine-name">${avEsc(r.label)}</span><span class="fc-acc ${fcAccClass(r.accuracy)}">${wrong.length ? wrong.length + ' issue' + (wrong.length > 1 ? 's' : '') + ' · ' : ''}${accTxt}</span></div>
        ${r.summary ? `<div class="fc-summary">${avEsc(r.summary)}</div>` : ''}
        ${wrongHtml}${rightLine}
      </div>`;
    }).join('') || '<div class="fc-empty">No engine responses.</div>';
  }
  function fcStartPolling() {
    if (fcPollTimer) return;
    fcPollTimer = setInterval(async () => {
      try { const r = await fetch('/api/ai-factcheck'); const d = await r.json(); if (!d.running) { clearInterval(fcPollTimer); fcPollTimer = null; const rb = avEl('fc-run'); if (rb) delete rb.dataset.busy; fcState = d; fcRender(); } }
      catch (e) { clearInterval(fcPollTimer); fcPollTimer = null; }
    }, 5000);
  }
  async function loadFactCheck() {
    try { const r = await fetch('/api/ai-factcheck'); fcState = await r.json(); fcRender(); } catch (e) { /* leave */ }
  }
  window.loadFactCheck = loadFactCheck;
  const fcRunBtn = avEl('fc-run');
  if (fcRunBtn) fcRunBtn.addEventListener('click', async () => {
    if (fcState && !fcState.anyConfigured) { alert('No AI engines are connected. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY) in Railway, then run again.'); return; }
    fcRunBtn.disabled = true; fcRunBtn.dataset.busy = '1'; fcRunBtn.innerHTML = 'Checking…';
    try {
      const r = await authFetch('/api/ai-factcheck/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Run failed');
      delete fcRunBtn.dataset.busy; await loadFactCheck();
    } catch (e) { delete fcRunBtn.dataset.busy; alert('FactCheck failed: ' + e.message); await loadFactCheck(); }
  });

  // --- AI CRAWLER ACCESS AUDIT (P4b) ---
  let acState = null, acPollTimer = null;
  function acPill(status) { return status === 'blocked' ? 'bad' : status === 'partial' ? 'warn' : 'good'; }
  function acPillText(status) { return status === 'blocked' ? 'Blocked' : status === 'partial' ? 'Partial' : 'Allowed'; }
  function acRender() {
    if (!acState) return;
    const upd = avEl('ac-updated'); if (upd) upd.innerText = acState.updatedAt ? ('Checked ' + avAgo(acState.updatedAt)) : '';
    const runBtn = avEl('ac-run');
    if (runBtn) { if (acState.running) { runBtn.disabled = true; runBtn.innerHTML = 'Checking…'; if (!acPollTimer) acStartPolling(); } else if (!runBtn.dataset.busy) { runBtn.disabled = false; runBtn.innerHTML = 'Check access'; } }
    const body = avEl('ac-body'); if (!body) return;
    const l = acState.latest;
    if (!l) { body.innerHTML = `<div class="fc-empty">Click <b>Check access</b> to scan <b>${avEsc(acState.site || 'your site')}/robots.txt</b> and confirm the AI engines are allowed to read your site.</div>`; return; }
    const banner = l.blocked > 0
      ? `<div class="ac-banner bad">&#9888; ${l.blocked} of ${l.total} AI crawlers are BLOCKED in robots.txt — those engines can't read your site. Fix this first.</div>`
      : `<div class="ac-banner good">&#10003; All ${l.total} major AI crawlers are allowed to read ${avEsc(l.site)}.</div>`;
    const grid = `<div class="ac-grid">` + (l.bots || []).map(b =>
      `<div class="ac-bot"><div><div class="ac-bot-name">${avEsc(b.label)}</div><div class="ac-bot-purpose">${avEsc(b.purpose)}</div></div><span class="ac-pill ${acPill(b.status)}">${acPillText(b.status)}</span></div>`
    ).join('') + `</div>`;
    const note = !l.hadRobots
      ? `<div class="ac-note">No <b>robots.txt</b> was found at ${avEsc(l.robotsUrl)} — that means the site is open to all crawlers (fine for AI visibility). ${l.fetchError ? '(' + avEsc(l.fetchError) + ')' : ''}</div>`
      : (l.blocked > 0 ? `<div class="ac-note">To unblock, remove the <code>Disallow: /</code> rule for the blocked bots in your robots.txt (in GoHighLevel site settings), or replace it with <code>Allow: /</code>.</div>` : `<div class="ac-note">Checked ${avEsc(l.robotsUrl)}. Re-run after any robots.txt change.</div>`);
    body.innerHTML = banner + grid + note;
  }
  function acStartPolling() {
    if (acPollTimer) return;
    acPollTimer = setInterval(async () => {
      try { const r = await fetch('/api/ai-crawlers'); const d = await r.json(); if (!d.running) { clearInterval(acPollTimer); acPollTimer = null; const rb = avEl('ac-run'); if (rb) delete rb.dataset.busy; acState = d; acRender(); } }
      catch (e) { clearInterval(acPollTimer); acPollTimer = null; }
    }, 4000);
  }
  async function loadCrawlers() {
    try { const r = await fetch('/api/ai-crawlers'); acState = await r.json(); acRender(); } catch (e) { /* leave */ }
  }
  window.loadCrawlers = loadCrawlers;
  const acRunBtn = avEl('ac-run');
  if (acRunBtn) acRunBtn.addEventListener('click', async () => {
    acRunBtn.disabled = true; acRunBtn.dataset.busy = '1'; acRunBtn.innerHTML = 'Checking…';
    try {
      const r = await authFetch('/api/ai-crawlers/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Check failed');
      delete acRunBtn.dataset.busy; await loadCrawlers();
    } catch (e) { delete acRunBtn.dataset.busy; alert('Crawler check failed: ' + e.message); await loadCrawlers(); }
  });

  // --- REDDIT VISIBILITY ENGINE (P4c) ---
  let rdState = null, rdPollTimer = null;
  function rdRender() {
    if (!rdState) return;
    const upd = avEl('rd-updated'); if (upd) upd.innerText = rdState.updatedAt ? ('Found ' + avAgo(rdState.updatedAt)) : '';
    const runBtn = avEl('rd-run');
    if (runBtn) { if (rdState.running) { runBtn.disabled = true; runBtn.innerHTML = 'Searching Reddit…'; if (!rdPollTimer) rdStartPolling(); } else if (!runBtn.dataset.busy) { runBtn.disabled = false; runBtn.innerHTML = 'Find Reddit threads'; } }
    const body = avEl('rd-body'); if (!body) return;
    const l = rdState.latest;
    if (!l) { body.innerHTML = `<div class="fc-empty">${rdState.anyConfigured ? 'Click <b>Find Reddit threads</b> to surface real discussions where you can add value and get cited by AI.' : 'Add your <b>Gemini key</b> in Settings — Reddit discovery uses live Google Search.'}</div>`; return; }
    if (!l.threads || !l.threads.length) { body.innerHTML = `<div class="fc-empty">No clear Reddit threads surfaced this time. Try again later — new discussions appear all the time.</div>`; return; }
    body.innerHTML = l.threads.map(t => `
      <div class="rd-thread">
        <div class="rd-thread-top">${t.subreddit ? `<span class="rd-sub">${avEsc(t.subreddit)}</span>` : ''}<a class="rd-title" href="${avEsc(t.url)}" target="_blank" rel="noopener">${avEsc(t.title)} &#8599;</a></div>
        ${t.why ? `<div class="rd-why">${avEsc(t.why)}</div>` : ''}
        ${t.angle ? `<div class="rd-angle"><b>How to add value:</b> ${avEsc(t.angle)}</div>` : ''}
      </div>`).join('') +
      `<div class="rd-note">Engage as a real person: be genuinely helpful, disclose that you run Best Day Fitness, and follow each subreddit&rsquo;s self-promotion rules. Spammy posts get removed and hurt you.</div>`;
  }
  function rdStartPolling() {
    if (rdPollTimer) return;
    rdPollTimer = setInterval(async () => {
      try { const r = await fetch('/api/reddit-threads'); const d = await r.json(); if (!d.running) { clearInterval(rdPollTimer); rdPollTimer = null; const rb = avEl('rd-run'); if (rb) delete rb.dataset.busy; rdState = d; rdRender(); } }
      catch (e) { clearInterval(rdPollTimer); rdPollTimer = null; }
    }, 5000);
  }
  async function loadReddit() {
    try { const r = await fetch('/api/reddit-threads'); rdState = await r.json(); rdRender(); } catch (e) { /* leave */ }
  }
  window.loadReddit = loadReddit;
  const rdRunBtn = avEl('rd-run');
  if (rdRunBtn) rdRunBtn.addEventListener('click', async () => {
    if (rdState && !rdState.anyConfigured) { alert('Add your Gemini key in Settings to search Reddit (this runs a live Google search).'); return; }
    rdRunBtn.disabled = true; rdRunBtn.dataset.busy = '1'; rdRunBtn.innerHTML = 'Searching Reddit…';
    try {
      const r = await authFetch('/api/reddit-threads/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Search failed');
      delete rdRunBtn.dataset.busy; await loadReddit();
    } catch (e) { delete rdRunBtn.dataset.busy; alert('Reddit search failed: ' + e.message); await loadReddit(); }
  });


  // Citation outreach is loaded only when its tab is opened.
  // Local Presence tools load only when their tab is opened.
  // Preserve the existing startup read that captures the daily performance snapshot
  // without shipping the Progress rendering and controls on the initial path.
  fetch('/api/performance').catch(() => {});
  // Progress UI loads only when its tab is opened.
  // --- ON-SITE & TECHNICAL SEO ---
  async function osPost(body, btn) {
    const orig = btn.innerText;
    btn.disabled = true; btn.innerText = 'Working…';
    try {
      const res = await authFetch('/api/onsite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Request failed');
      if (d.unavailable) { alert(d.message); return null; }
      return d.data;
    } catch (e) { alert('Error: ' + e.message); return null; }
    finally { btn.disabled = false; btn.innerText = orig; }
  }

  // --- ON-SITE SEO AUTOPILOT ---
  const oaToggle = document.getElementById('oa-toggle');
  const oaMeta = document.getElementById('oa-meta');
  const oaIdeasBadge = document.getElementById('oa-ideas-badge');
  const oaIdeasBody = document.getElementById('oa-ideas-body');
  const oaLinksBadge = document.getElementById('oa-links-badge');
  const oaLinksBody = document.getElementById('oa-links-body');
  const oaTmBadge = document.getElementById('oa-tm-badge');
  const oaTmBody = document.getElementById('oa-tm-body');
  const oaRun = document.getElementById('oa-run');
  const oaRunNote = document.getElementById('oa-run-note');
  let oaPollTimer = null;

  function oaAgo(iso) {
    if (!iso) return 'never';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const h = Math.round(mins / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  function oaDue(iso, days) {
    if (!iso) return 'due now';
    const rem = (days || 7) - ((Date.now() - new Date(iso).getTime()) / 86400000);
    return rem <= 0 ? 'due now' : ('in ' + Math.ceil(rem) + 'd');
  }

  function oaRenderIdeas(ideas) {
    if (!oaIdeasBody) return;
    if (!ideas || !ideas.clusters || !ideas.clusters.length) { oaIdeasBadge.innerHTML = ''; oaIdeasBody.innerHTML = '<span class="os-empty">No ideas yet — turn on the autopilot or click Run now.</span>'; return; }
    oaIdeasBadge.innerHTML = ideas.isNew ? '<span class="oa-badge">NEW</span>' : '';
    oaIdeasBody.innerHTML = ideas.clusters.slice(0, 4).map(c => `<div class="oa-clu"><b>${citEsc(c.theme || 'Idea')}</b><div class="oa-kw">${(c.keywords || []).slice(0, 4).map(citEsc).join(' · ')}</div>${c.contentIdea ? `<div class="oa-idea">✍ ${citEsc(c.contentIdea)}</div>` : ''}</div>`).join('')
      + `<div class="oa-idea" style="margin-top:6px;">Theme: ${citEsc(ideas.seed || '')} · ${oaAgo(ideas.generatedAt)}</div>`;
  }
  function oaRenderLinks(links) {
    if (!oaLinksBody) return;
    if (!links) { oaLinksBadge.innerHTML = ''; oaLinksBody.innerHTML = '<span class="os-empty">No suggestions yet.</span>'; return; }
    oaLinksBadge.innerHTML = links.isNew ? '<span class="oa-badge">NEW</span>' : '';
    const sug = links.suggestions || [];
    if (!sug.length) { oaLinksBody.innerHTML = `<span class="os-empty">${citEsc(links.note || 'No suggestions yet.')}</span>`; return; }
    oaLinksBody.innerHTML = sug.slice(0, 6).map(s => `<div class="oa-link"><b>${citEsc(s.from)}</b> &rarr; <span style="color:var(--color-secondary)">&ldquo;${citEsc(s.anchor)}&rdquo;</span> &rarr; <b>${citEsc(s.to)}</b><br><span class="text-muted">${citEsc(s.why)}</span></div>`).join('');
  }
  function oaRenderTm(tm) {
    if (!oaTmBody) return;
    if (!tm) { oaTmBadge.innerHTML = ''; oaTmBody.innerHTML = '<span class="os-empty">No suggestions yet.</span>'; return; }
    oaTmBadge.innerHTML = tm.isNew ? '<span class="oa-badge">NEW</span>' : '';
    const row = (t, limit) => `<div class="oa-opt"><span>${citEsc(t)}</span><span style="white-space:nowrap;"><span class="oa-count ${t.length > limit ? 'over' : ''}">${t.length}/${limit}</span> <button class="oa-cp" type="button" onclick="window._citCopy(${citAttr(t)}, this)">copy</button></span></div>`;
    oaTmBody.innerHTML = `<div class="text-muted" style="font-size:var(--font-xs);margin-bottom:6px;">For: ${citEsc(tm.page || tm.keyword || '')}</div>`
      + `<div class="os-sub">Titles</div>` + (tm.titles || []).map(t => row(t, 60)).join('')
      + `<div class="os-sub" style="margin-top:8px;">Meta descriptions</div>` + (tm.metas || []).map(m => row(m, 155)).join('')
      + `<div class="oa-idea" style="margin-top:6px;">${oaAgo(tm.generatedAt)}</div>`;
  }

  function oaRender(s) {
    if (!s) return;
    if (oaToggle) oaToggle.checked = !!s.enabled;
    if (oaMeta) oaMeta.innerHTML = s.hasKey
      ? `Autopilot is <b style="color:${s.enabled ? 'var(--color-success)' : 'var(--text-muted)'}">${s.enabled ? 'ON' : 'OFF'}</b> · next run ${oaDue(s.lastRun, s.intervalDays)}`
      : `<span style="color:var(--color-accent)">Add your Gemini key in Settings to turn the autopilot on.</span>`;
    oaRenderIdeas(s.ideas);
    oaRenderLinks(s.links);
    oaRenderTm(s.titlemeta);
    if ((s.ideas && s.ideas.isNew) || (s.links && s.links.isNew) || (s.titlemeta && s.titlemeta.isNew)) {
      authFetch('/api/onsite-autopilot/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadOnsiteAutopilot() {
    try {
      const res = await fetch('/api/onsite-autopilot');
      const s = await res.json();
      oaRender(s);
      if (s.busy) oaPoll();
    } catch (e) { /* keep last render */ }
  }
  window.loadOnsiteAutopilot = loadOnsiteAutopilot;

  function oaPoll() {
    if (oaPollTimer) return;
    let n = 0;
    if (oaRun) { oaRun.disabled = true; oaRun.innerText = 'Working… (~1–2 min)'; }
    oaPollTimer = setInterval(async () => {
      n++;
      try {
        const res = await fetch('/api/onsite-autopilot');
        const s = await res.json();
        oaRender(s);
        if (!s.busy || n > 16) { clearInterval(oaPollTimer); oaPollTimer = null; if (oaRun) { oaRun.disabled = false; oaRun.innerText = 'Run now'; } if (oaRunNote) oaRunNote.innerText = ''; }
      } catch (e) { clearInterval(oaPollTimer); oaPollTimer = null; if (oaRun) { oaRun.disabled = false; oaRun.innerText = 'Run now'; } }
    }, 8000);
  }

  if (oaToggle) {
    oaToggle.addEventListener('change', async () => {
      try { await authFetch('/api/onsite-autopilot/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: oaToggle.checked }) }); loadOnsiteAutopilot(); }
      catch (e) { alert('Could not update: ' + e.message); }
    });
  }
  if (oaRun) {
    oaRun.addEventListener('click', async () => {
      oaRun.disabled = true; oaRun.innerText = 'Starting…';
      try {
        const res = await authFetch('/api/onsite-autopilot/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await res.json();
        if (d.unavailable) { alert(d.message); oaRun.disabled = false; oaRun.innerText = 'Run now'; return; }
        if (oaRunNote) oaRunNote.innerText = 'Generating ideas, links and title/meta…';
        setTimeout(oaPoll, 1500);
      } catch (e) { alert('Run error: ' + e.message); oaRun.disabled = false; oaRun.innerText = 'Run now'; }
    });
  }

  // Keyword & topic ideas
  const btnOsKeywords = document.getElementById('btn-os-keywords');
  if (btnOsKeywords) btnOsKeywords.addEventListener('click', async () => {
    const seed = (document.getElementById('os-seed').value || '').trim();
    if (!seed) { alert('Enter a seed keyword.'); return; }
    const out = document.getElementById('os-keywords-out');
    out.innerHTML = '<div class="os-empty">Searching and building topic clusters…</div>';
    const data = await osPost({ tool: 'keywords', seed }, btnOsKeywords);
    if (!data || !data.clusters || !data.clusters.length) { out.innerHTML = '<div class="os-empty">No ideas came back — try a different seed keyword.</div>'; return; }
    out.innerHTML = data.clusters.map(c => `<div class="os-cluster">
      <h4>${citEsc(c.theme || 'Cluster')}</h4>
      <div class="os-chips">${(c.keywords || []).map(k => `<span class="os-chip">${citEsc(k)}</span>`).join('')}</div>
      ${(c.questions || []).map(q => `<div class="os-q">• ${citEsc(q)}</div>`).join('')}
      ${c.contentIdea ? `<div class="os-idea"><b>Content idea:</b> ${citEsc(c.contentIdea)}</div>` : ''}
    </div>`).join('');
  });

  // Will AI quote this page? — score a real page against the course's AEO checklist
  const btnOsAeo = document.getElementById('btn-os-aeo');
  if (btnOsAeo) btnOsAeo.addEventListener('click', async () => {
    const url = (document.getElementById('os-aeo-url').value || '').trim();
    if (!url) { alert('Enter a page URL to check.'); return; }
    const out = document.getElementById('os-aeo-out');
    out.innerHTML = '<div class="os-empty">Fetching the page and scoring it against the AEO checklist… (~10–20s)</div>';
    const data = await osPost({ tool: 'aeoReadiness', url }, btnOsAeo);
    if (!data) { out.innerHTML = ''; return; }
    if (data.fetchError) { out.innerHTML = `<div class="os-empty">${citEsc(data.fetchError)}</div>`; return; }
    const score = Math.max(0, Math.min(100, Math.round(Number(data.overallScore) || 0)));
    const bucket = data.bucket || '';
    const bl = bucket.toLowerCase();
    const scoreColor = score >= 75 ? 'var(--color-success)' : score >= 45 ? 'var(--color-warning)' : 'var(--color-accent)';
    const bucketStyle = bl.includes('ready') ? 'background:rgba(16,185,129,.15);color:var(--color-success);'
      : bl.includes('quick') ? 'background:rgba(245,158,11,.15);color:var(--color-warning);'
      : 'background:rgba(244,63,94,.15);color:var(--color-accent);';
    const checks = (data.checklist || []).map(c => `<div class="aeo-check ${c.pass ? 'ok' : 'no'}"><span class="ic">${c.pass ? '✓' : '✗'}</span><span><span class="lbl">${citEsc(c.label || c.key || '')}</span>${c.note ? ` — <span class="nt">${citEsc(c.note)}</span>` : ''}</span></div>`).join('');
    const fixes = (data.topFixes || []).filter(Boolean);
    out.innerHTML = `<div class="aeo-result">
      <div class="aeo-head">
        <div class="aeo-score" style="color:${scoreColor}">${score}<span style="font-size:1rem;color:var(--text-muted);font-weight:600;">/100</span></div>
        ${bucket ? `<span class="aeo-bucket" style="${bucketStyle}">${citEsc(bucket)}</span>` : ''}
        <div class="text-muted" style="font-size:var(--font-xs);flex:1;min-width:160px;word-break:break-word;">${citEsc(data.pageTitle || data.url || '')}</div>
      </div>
      ${checks}
      ${fixes.length ? `<div class="aeo-fixes"><b>Top fixes:</b><ul style="margin:6px 0 0;padding-left:18px;">${fixes.map(f => `<li style="margin:4px 0;">${citEsc(f)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
  });

  // Title & meta optimizer
  let osTM = { titles: [], metas: [] };
  const osTMOut = document.getElementById('os-titlemeta-out');
  const btnOsTM = document.getElementById('btn-os-titlemeta');
  if (btnOsTM) btnOsTM.addEventListener('click', async () => {
    const keyword = (document.getElementById('os-kw').value || '').trim();
    if (!keyword) { alert('Enter a target keyword.'); return; }
    const currentTitle = (document.getElementById('os-title').value || '').trim();
    osTMOut.innerHTML = '<div class="os-empty">Writing optimized options…</div>';
    const data = await osPost({ tool: 'titlemeta', keyword, currentTitle }, btnOsTM);
    if (!data) { osTMOut.innerHTML = ''; return; }
    osTM = { titles: data.titles || [], metas: data.metas || [] };
    const row = (text, limit, type, i) => `<div class="os-opt"><span>${citEsc(text)}</span><span style="display:flex;gap:8px;align-items:center;"><span class="os-count ${text.length > limit ? 'over' : ''}">${text.length}/${limit}</span><button class="os-copybtn" data-t="${type}" data-i="${i}">copy</button></span></div>`;
    osTMOut.innerHTML = `<div class="os-sub">Title tags</div>` + osTM.titles.map((t, i) => row(t, 60, 'titles', i)).join('') +
      `<div class="os-sub" style="margin-top:12px;">Meta descriptions</div>` + osTM.metas.map((m, i) => row(m, 155, 'metas', i)).join('');
  });
  if (osTMOut) osTMOut.addEventListener('click', e => {
    const b = e.target.closest('.os-copybtn'); if (!b) return;
    const v = (osTM[b.dataset.t] || [])[+b.dataset.i]; if (v == null) return;
    navigator.clipboard.writeText(v); b.innerText = '✓'; setTimeout(() => b.innerText = 'copy', 1200);
  });

  // Internal link suggestions
  const btnOsLinks = document.getElementById('btn-os-links');
  if (btnOsLinks) btnOsLinks.addEventListener('click', async () => {
    const out = document.getElementById('os-links-out');
    out.innerHTML = '<div class="os-empty">Reviewing your published pages…</div>';
    const data = await osPost({ tool: 'links' }, btnOsLinks);
    if (!data) { out.innerHTML = ''; return; }
    const sug = data.suggestions || [];
    if (!sug.length) { out.innerHTML = `<div class="os-empty">${citEsc(data.note || 'No suggestions yet.')}</div>`; return; }
    out.innerHTML = sug.map(s => `<div class="os-link"><div><b>${citEsc(s.from)}</b> &rarr; <span class="os-anchor">&ldquo;${citEsc(s.anchor)}&rdquo;</span> &rarr; <b>${citEsc(s.to)}</b></div><div class="os-why">${citEsc(s.why)}</div></div>`).join('');
  });

  // Extended schema pack
  let osSchemas = null;
  const osSchemaOut = document.getElementById('os-schema-out');
  async function osLoadSchema() {
    if (osSchemas) return true;
    try { const res = await fetch('/api/onsite-schema'); osSchemas = await res.json(); return true; }
    catch (e) { alert('Could not load schema: ' + e.message); return false; }
  }
  function osShowSchema(type, btn) {
    osLoadSchema().then(ok => { if (ok && osSchemaOut) osSchemaOut.value = osSchemas[type] || ''; });
  }
  const btnOsFaqpage = document.getElementById('btn-os-faqpage');
  const btnOsArticle = document.getElementById('btn-os-article');
  const btnOsHowto = document.getElementById('btn-os-howto');
  const btnOsService = document.getElementById('btn-os-service');
  const btnOsReview = document.getElementById('btn-os-review');
  const btnOsBreadcrumb = document.getElementById('btn-os-breadcrumb');
  if (btnOsFaqpage) btnOsFaqpage.addEventListener('click', () => osShowSchema('faqpage'));
  if (btnOsArticle) btnOsArticle.addEventListener('click', () => osShowSchema('article'));
  if (btnOsHowto) btnOsHowto.addEventListener('click', () => osShowSchema('howto'));
  if (btnOsService) btnOsService.addEventListener('click', () => osShowSchema('service'));
  if (btnOsReview) btnOsReview.addEventListener('click', () => osShowSchema('review'));
  if (btnOsBreadcrumb) btnOsBreadcrumb.addEventListener('click', () => osShowSchema('breadcrumb'));
  const btnOsSchemaCopy = document.getElementById('btn-os-schema-copy');
  if (btnOsSchemaCopy) btnOsSchemaCopy.addEventListener('click', () => {
    if (!osSchemaOut.value) { alert('Pick a schema type first.'); return; }
    navigator.clipboard.writeText(osSchemaOut.value);
    btnOsSchemaCopy.innerText = 'Copied!'; setTimeout(() => btnOsSchemaCopy.innerText = 'Copy', 1500);
  });


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
  let pdfReportFeaturePromise = null;

  function ensurePdfReportFeature() {
    if (window.SeoBuddyPdfReport && window.SeoBuddyPdfReport.generate) return Promise.resolve();
    if (pdfReportFeaturePromise) return pdfReportFeaturePromise;
    const assetUrl = document.body.dataset.pdfReportAsset;
    if (!assetUrl || !assetUrl.startsWith('/assets/')) return Promise.reject(new Error('PDF report asset is unavailable.'));
    pdfReportFeaturePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetUrl;
      script.async = true;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load the PDF report feature.')), { once: true });
      document.head.appendChild(script);
    }).catch(error => {
      pdfReportFeaturePromise = null;
      throw error;
    });
    return pdfReportFeaturePromise;
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
    function openWiz() {
      fetch('/api/business-profile').then(r => r.json()).then(d => { profile = Object.assign({}, (d && d.profile) || {}); step = 0; render(); overlay.style.display = 'flex'; })
        .catch(() => { profile = {}; step = 0; render(); overlay.style.display = 'flex'; });
    }
    function closeWiz() { overlay.style.display = 'none'; try { localStorage.setItem('seo_wizard_seen', '1'); } catch (e) {} }
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
