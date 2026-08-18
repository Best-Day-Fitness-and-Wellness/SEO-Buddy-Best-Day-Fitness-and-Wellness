// SEO Buddy - Application Logic
document.addEventListener('DOMContentLoaded', () => {
  const { authFetch, escapeHtml: uiEsc, safeExternalUrl, sanitizeHtml } = window.SeoBuddyCore;

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

  function showToast(message, tone) {
    let host = document.getElementById('ui-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ui-toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const text = String(message || 'Done.');
    const kind = tone || (/error|failed|could not|locked|invalid|please|enter|add |no /i.test(text) ? 'error' : 'ok');
    const toast = document.createElement('div');
    toast.className = `ui-toast ${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const body = document.createElement('span');
    body.textContent = text;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss message');
    close.textContent = '×';
    close.addEventListener('click', () => toast.remove());
    toast.append(body, close);
    host.appendChild(toast);
    setTimeout(() => toast.remove(), kind === 'error' ? 9000 : 5000);
  }

  // Existing call sites intentionally use this local name; shadowing the
  // blocking browser API upgrades all of them to accessible, non-blocking UI.
  function alert(message) { showToast(message); }

  function confirmAction(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-confirm-overlay';
      overlay.innerHTML = `<div class="ui-confirm" role="dialog" aria-modal="true" aria-labelledby="ui-confirm-title"><h3 id="ui-confirm-title">Please confirm</h3><p>${uiEsc(message)}</p><div><button type="button" class="btn btn-secondary" data-answer="no">Cancel</button><button type="button" class="btn btn-primary" data-answer="yes">Continue</button></div></div>`;
      const finish = answer => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(answer); };
      const onKey = event => { if (event.key === 'Escape') finish(false); };
      overlay.addEventListener('click', event => {
        const answer = event.target.closest('[data-answer]');
        if (answer) finish(answer.dataset.answer === 'yes');
        else if (event.target === overlay) finish(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-answer="no"]').focus();
    });
  }

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
      loadPerformance();
      if (window.loadPerfDigest) window.loadPerfDigest();
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
      if (window.loadReviews) window.loadReviews();
    } else if (tabId === 'gsc-tab') {
      pageTitle.innerText = 'Searches You’re Missing';
      pageSubtitle.innerText = 'Search queries where you show up but get no clicks — your biggest quick wins';
      if (!state.gscData.length) syncGSCData();
    } else if (tabId === 'ai-tab') {
      pageTitle.innerText = 'Create a Post';
      pageSubtitle.innerText = 'Have AI write an authoritative, SEO-optimized article for you';
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
      if (window.loadCitationWorklist) window.loadCitationWorklist();
    } else if (tabId === 'local-tab') {
      pageTitle.innerText = 'Local Presence';
      pageSubtitle.innerText = 'NAP monitoring, weekly Google posts, reviews, and your local checklist';
      if (window.loadLocalAutopilot) window.loadLocalAutopilot();
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
      if (payload.source === 'live_gsc') {
        modeStatus.className = 'status-indicator live';
        modeStatusText.innerText = 'Live Operations';
      } else {
        modeStatus.className = 'status-indicator mock';
        modeStatusText.innerText = 'Mock Mode (Local)';
      }

      calculateStats();
      renderGSCTable();
    } catch (err) {
      console.error('Error fetching GSC data:', err);
      // Failsafe: load from mock-data.js if server fails or is offline
      if (typeof MOCK_GSC_DATA !== 'undefined') {
        state.gscData = MOCK_GSC_DATA;
        calculateStats();
        renderGSCTable();
      } else {
        gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-500">Failed to connect to backend server.</td></tr>`;
      }
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

  // ---------------------------------------------------------------------------
  // Recording -> transcript. The only way the owner's first-hand expertise gets
  // into an article; everything else here writes from the model's general
  // knowledge. Feeds the optional "Your own words" box above.
  // ---------------------------------------------------------------------------
  const recDrop = document.getElementById('rec-drop');
  const recFile = document.getElementById('rec-file');
  const recStatus = document.getElementById('rec-status');

  function recSay(msg, cls) {
    if (!recStatus) return;
    recStatus.className = 'rec-status' + (cls ? ' ' + cls : '');
    recStatus.textContent = msg || '';
  }

  async function transcribeFile(file) {
    if (!file) return;
    // Two sources writing into one box at once produces interleaved nonsense.
    if (typeof dictating !== 'undefined' && dictating) stopDictation();
    const MAX = 18 * 1048576;
    if (file.size > MAX) {
      recSay(`That file is ${(file.size / 1048576).toFixed(1)}MB — the limit is 18MB. Record audio only instead of video, or trim it.`, 'err');
      return;
    }
    recSay(`Transcribing ${file.name} (${(file.size / 1048576).toFixed(1)}MB)… this takes about as long as the recording.`);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1]);
        fr.onerror = () => reject(new Error('Could not read that file.'));
        fr.readAsDataURL(file);
      });
      const res = await authFetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: b64, mimeType: file.type }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Transcription failed.');
      const ta = document.getElementById('input-transcript');
      if (ta) {
        // Never clobber words that are already there — they may have been
        // dictated or hand-typed, and losing them silently is unforgivable.
        if (ta.value.trim()) appendTranscript(j.transcript);
        else ta.value = j.transcript;
      }
      recSay(`Transcribed — ${j.words} words added. Edit it if you like, then generate the article.`, 'ok');
    } catch (err) {
      recSay(err.message, 'err');
    }
  }

  // ---------------------------------------------------------------------------
  // Live dictation. Same idea as a system dictation app, but scoped to this box:
  // the browser's own speech engine, so it costs nothing, spends no Gemini
  // credits, and no audio leaves the machine. Upload stays for anything already
  // recorded elsewhere.
  // ---------------------------------------------------------------------------
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const dictWrap = document.getElementById('rec-dictate-wrap');
  const dictBtn = document.getElementById('btn-dictate');
  const dictLabel = document.getElementById('rec-dictate-label');
  let recog = null;
  let dictating = false;     // what the USER wants — survives the engine's own stops
  let dictRestarts = 0;      // guards against an error loop restarting forever

  // Only reveal the button where the API actually exists. Safari and Firefox
  // get the upload path with no dead control to click.
  if (SpeechRec && dictWrap) dictWrap.style.display = '';

  function dictSetLive(on) {
    if (!dictBtn) return;
    dictBtn.classList.toggle('live', on);
    if (dictLabel) dictLabel.textContent = on ? 'Stop dictating' : 'Dictate straight into the box';
  }

  function appendTranscript(text) {
    const ta = document.getElementById('input-transcript');
    if (!ta || !text) return;
    const needsSpace = ta.value && !/\s$/.test(ta.value);
    ta.value = ta.value + (needsSpace ? ' ' : '') + text;
    ta.scrollTop = ta.scrollHeight;
  }

  function stopDictation(msg, cls) {
    dictating = false;
    dictRestarts = 0;
    try { if (recog) { recog.onend = null; recog.stop(); } } catch (e) {}
    recog = null;
    dictSetLive(false);
    recSay(msg || '', cls || '');
  }

  function startDictation() {
    if (!SpeechRec) return;
    recog = new SpeechRec();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = document.documentElement.lang || 'en-US';

    recog.onstart = () => { dictRestarts = 0; recSay('Listening — just talk. Your words land in the box below.', 'live'); };

    recog.onresult = (e) => {
      let interim = '', settled = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) settled += t; else interim += t;
      }
      if (settled.trim()) appendTranscript(settled.trim());
      recSay(interim.trim() ? '… ' + interim.trim() : 'Listening — just talk. Your words land in the box below.', 'live');
    };

    recog.onerror = (e) => {
      // no-speech and aborted are routine: the engine idles out, onend restarts it.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        return stopDictation('Microphone access is blocked. Allow it for this site in your browser settings, then try again — or upload a recording instead.', 'err');
      }
      if (e.error === 'audio-capture') {
        return stopDictation('No microphone found. Plug one in, or upload a recording instead.', 'err');
      }
      if (e.error === 'network') {
        return stopDictation('Speech recognition lost its connection. Try again, or upload a recording instead.', 'err');
      }
      stopDictation('Dictation stopped: ' + e.error, 'err');
    };

    // Chrome ends the session on its own after a stretch of silence. If the user
    // never pressed stop, bring it back — but not forever, or a persistent
    // failure becomes an invisible restart loop.
    recog.onend = () => {
      if (!dictating) return;
      if (dictRestarts++ > 40) {
        return stopDictation('Dictation kept dropping out — try again, or upload a recording instead.', 'err');
      }
      try { recog.start(); } catch (e) { /* already starting; ignore */ }
    };

    try {
      recog.start();
      dictating = true;
      dictSetLive(true);
    } catch (err) {
      stopDictation('Could not start dictation: ' + err.message, 'err');
    }
  }

  if (dictBtn) dictBtn.addEventListener('click', () => {
    if (dictating) {
      const ta = document.getElementById('input-transcript');
      const words = ta && ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      stopDictation(words ? `Stopped — ${words} words. Edit it if you like, then generate the article.` : 'Stopped.', words ? 'ok' : '');
    } else {
      startDictation();
    }
  });

  // Leaving the tab mid-dictation would otherwise keep the mic hot in the
  // background with nothing visible to explain why.
  window.addEventListener('beforeunload', () => { if (dictating) stopDictation(); });

  if (recDrop && recFile) {
    recDrop.addEventListener('click', () => recFile.click());
    recFile.addEventListener('change', () => transcribeFile(recFile.files[0]));
    ['dragenter', 'dragover'].forEach(ev => recDrop.addEventListener(ev, e => {
      e.preventDefault(); recDrop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => recDrop.addEventListener(ev, e => {
      e.preventDefault(); recDrop.classList.remove('over');
    }));
    recDrop.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) transcribeFile(e.dataTransfer.files[0]);
    });
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

  // ---------------------------------------------------------------------------
  // Social pack. Lives beside the GBP post because that is the other place the
  // owner produces short posts — GBP covers Google, this covers the rest.
  // ---------------------------------------------------------------------------
  const spBtn = document.getElementById('btn-social-pack');
  const spOut = document.getElementById('sp-out');
  let spState = { transcript: '', ideaIndex: 1, hookIndex: 1 };

  function spEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function buildSocialPack(ideaIndex, hookIndex) {
    const ta = document.getElementById('sp-transcript');
    const transcript = ta ? ta.value.trim() : '';
    if (transcript.length < 200) {
      spOut.innerHTML = '<div class="sp-err">Need a transcript of at least a couple of paragraphs.</div>';
      return;
    }
    spState = { transcript, ideaIndex: ideaIndex || 1, hookIndex: hookIndex || 1 };
    spBtn.disabled = true;
    spOut.innerHTML = '<p class="text-muted" style="margin-top:14px;">Working through ideas, hooks and a script…</p>';
    try {
      const res = await authFetch('/api/social-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spState),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Could not build the pack.');
      renderSocialPack(j);
    } catch (err) {
      spOut.innerHTML = '<div class="sp-err">' + spEsc(err.message) + '</div>';
    } finally {
      spBtn.disabled = false;
    }
  }

  function renderSocialPack(p) {
    const ideas = (p.ideas || []).map((t, i) =>
      `<div class="sp-item${i + 1 === p.ideaIndex ? ' sel' : ''}" data-sp-idea="${i + 1}">${spEsc(t)}</div>`).join('');
    const hooks = (p.hooks || []).map((t, i) =>
      `<div class="sp-item${i + 1 === p.hookIndex ? ' sel' : ''}" data-sp-hook="${i + 1}">${spEsc(t)}</div>`).join('');
    const plats = (p.platforms || []).map(t => `<span class="sp-plat" data-sp-plat>${spEsc(t)}</span>`).join('');
    spOut.innerHTML =
      `<div class="sp-sec"><h4>Five angles <span class="text-muted" style="font-weight:400;">— tap one to rebuild around it</span></h4>${ideas}</div>` +
      `<div class="sp-sec"><h4>Five hooks <span class="text-muted" style="font-weight:400;">— tap one to rewrite the script</span></h4>${hooks}</div>` +
      `<div class="sp-sec"><h4>30-second script</h4><div class="sp-script">${spEsc(p.script)}</div>` +
      `<div class="sp-plats">${plats}</div>` +
      `<p class="text-muted" style="font-size:var(--font-xs);margin-top:10px;">Record it once, post the same video to each — tap a platform to tick it off.</p></div>`;
  }

  if (spBtn) spBtn.addEventListener('click', () => buildSocialPack(1, 1));

  if (spOut) spOut.addEventListener('click', (e) => {
    const idea = e.target.closest('[data-sp-idea]');
    if (idea) return buildSocialPack(Number(idea.dataset.spIdea), 1);
    const hook = e.target.closest('[data-sp-hook]');
    if (hook) return buildSocialPack(spState.ideaIndex, Number(hook.dataset.spHook));
    const plat = e.target.closest('[data-sp-plat]');
    if (plat) plat.classList.toggle('done');
  });

  // ---------------------------------------------------------------------------
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
      bpMsg('Saved — every AI feature uses this from now on.', 'ok');
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
      bpMsg('Reset to defaults.', 'ok');
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

      if (br && br.brand) {
        const nv = (br.brand.neverUse || []), up = (br.brand.usePhrases || []);
        const reviewed = rd && (rd.checks || []).find(c => c.key === 'brand');
        document.getElementById('ow-voice').innerHTML =
          `<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:10px">
             <b style="font-size:var(--font-lg)">${owEsc(br.brand.tagline || '')}</b>
             ${reviewed && !reviewed.ok ? '<span class="ow-chip blocked">&#9650; Not reviewed yet</span>' : '<span class="ow-chip auto">&#10003; Reviewed</span>'}
           </div>
           <p style="margin:0 0 14px;color:var(--text-muted);font-size:var(--font-sm)">
             We never say <i>${nv.slice(0, 7).map(owEsc).join(', ')}</i>${nv.length > 7 ? ` — and ${nv.length - 7} more` : ''}.<br>
             We do say <i>${up.slice(0, 3).map(owEsc).join(', ')}</i>.</p>
           <button class="btn btn-primary" style="width:auto" onclick="window.switchTab &amp;&amp; window.switchTab('brand-tab')">Read it through</button>`;
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
    cov.innerHTML = sbCoverage(hs);
    el.innerHTML = hs.pillars.map(p => {
      const detCls = p.status === 'warn' ? 'warnt' : (p.status === 'off' ? 'offt' : '');
      // The dot carries the pillar's own hue so the eye links a tile to its arc
      // in the ring. Unmeasured stays hollow, matching the hollow dots above.
      const v = SB_PILLAR_VAR[p.key] || 'p1';
      const dot = p.measured
        ? `<span class="pdot" style="background:var(--${v}-g)"></span>`
        : `<span class="pdot" style="background:transparent;box-shadow:inset 0 0 0 2px var(--unmeasured)"></span>`;
      return `<div class="home-pillar" data-tab="${HOME_TAB_MAP[p.key] || 'summary-tab'}">${dot}<span class="plbl">${sumEsc(p.label)}</span><div class="pdet ${detCls}">${sumEsc(p.detail)}</div></div>`;
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
  // Card artwork. Style A: rounded volumes, radial gradients, soft drop shadows.
  //
  // Every gradient and filter needs an id, and a card can appear in two tabs at
  // once (Today's hero and Explore's gallery are both in the DOM). Duplicate ids
  // in one document silently make the SECOND element reference the FIRST one's
  // gradient, so each drawing is a function of a unique suffix rather than a
  // string constant.
  // ---------------------------------------------------------------------------
  let SB_ART_N = 0;

  // Shared plumbing: a tinted wash, a drop shadow, and a two-stop gradient.
  function sbArtDefs(u, from, to, shadow) {
    return '<defs>'
      + '<radialGradient id="g' + u + '" cx=".34" cy=".28" r=".85">'
      +   '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/>'
      + '</radialGradient>'
      + '<linearGradient id="s' + u + '" x1="0" y1="0" x2="1" y2="1">'
      +   '<stop offset="0" stop-color="#fff" stop-opacity=".85"/>'
      +   '<stop offset="1" stop-color="#fff" stop-opacity=".25"/>'
      + '</linearGradient>'
      + '<filter id="f' + u + '" x="-35%" y="-35%" width="170%" height="170%">'
      +   '<feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="' + shadow + '" flood-opacity=".24"/>'
      + '</filter></defs>';
  }
  // `slice` fills the panel and crops the overflow — right for a 288px card whose
  // panel is close to the 320x150 the drawings are composed in. The hero panel is
  // more than twice as wide, so slice scales to cover the width and cuts the top
  // and bottom off the subject. `meet` fits the whole drawing and lets the tint
  // show at the sides instead.
  let SB_ART_FIT = 'slice';
  function sbArtOpen(u) {
    return '<svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid ' + SB_ART_FIT + '" aria-hidden="true">';
  }

  const SB_ART = {
    // ---- the Gemini key ----
    gemini: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffe9a8', '#f5b800', '#8a6200')
        + '<circle cx="258" cy="26" r="62" fill="#f5b800" opacity=".13"/>'
        + '<circle cx="52" cy="134" r="50" fill="#f5b800" opacity=".10"/>'
        + '<g filter="url(#f' + u + ')" transform="translate(160,76) rotate(-30)">'
        +   '<circle cx="-42" cy="0" r="29" fill="url(#g' + u + ')"/>'
        +   '<circle cx="-42" cy="0" r="12.5" fill="#fcf3d6"/>'
        +   '<rect x="-15" y="-9" width="74" height="18" rx="9" fill="url(#g' + u + ')"/>'
        +   '<rect x="30" y="6" width="11" height="20" rx="5.5" fill="url(#g' + u + ')"/>'
        +   '<rect x="47" y="6" width="11" height="15" rx="5.5" fill="url(#g' + u + ')"/>'
        +   '<ellipse cx="-42" cy="-14" rx="18" ry="7" fill="url(#s' + u + ')" opacity=".55"/>'
        + '</g>'
        + '<g fill="#8a6200" opacity=".42">'
        +   '<path d="M252 100 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5z"/>'
        +   '<path d="M74 34 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5z"/>'
        + '</g></svg>';
    },
    // ---- autopilot: a page that writes and sends itself ----
    autopilot: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffd75e', '#f5b800', '#8a6200')
        + '<circle cx="264" cy="118" r="54" fill="#f5b800" opacity=".13"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="72" y="20" width="104" height="112" rx="13" fill="#fff"/>'
        +   '<path d="M72 33 a13 13 0 0 1 13 -13 h78 a13 13 0 0 1 13 13 v13 h-104z" fill="url(#g' + u + ')"/>'
        + '</g>'
        + '<g fill="#8a6200" opacity=".26">'
        +   '<rect x="88" y="62" width="72" height="7" rx="3.5"/>'
        +   '<rect x="88" y="78" width="58" height="7" rx="3.5"/>'
        +   '<rect x="88" y="94" width="40" height="7" rx="3.5"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')">'
        +   '<path d="M196 84 L262 52 L238 116 L226 94 z" fill="url(#g' + u + ')"/>'
        +   '<path d="M196 84 L262 52 L226 94 z" fill="#fff" opacity=".35"/>'
        + '</g></svg>';
    },
    // ---- local listings: a pin over a street grid ----
    local: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffc266', '#ff9900', '#a65b00')
        + '<circle cx="44" cy="116" r="52" fill="#ff9900" opacity=".12"/>'
        + '<g stroke="#a65b00" stroke-width="2.4" opacity=".2" stroke-linecap="round">'
        +   '<path d="M22 106 h276"/><path d="M22 126 h276"/>'
        +   '<path d="M110 20 v112"/><path d="M212 20 v112"/>'
        + '</g>'
        + '<ellipse cx="160" cy="124" rx="24" ry="6" fill="#a65b00" opacity=".18"/>'
        + '<g filter="url(#f' + u + ')" transform="translate(160,62)">'
        +   '<path d="M0 54 C0 54 31 22 31 -2 A31 31 0 1 0 -31 -2 C-31 22 0 54 0 54 Z" fill="url(#g' + u + ')"/>'
        +   '<circle cx="0" cy="-2" r="12.5" fill="#fff5e6"/>'
        +   '<ellipse cx="-10" cy="-16" rx="11" ry="5" fill="url(#s' + u + ')" opacity=".5"/>'
        + '</g></svg>';
    },
    // ---- AI recommends you: a bubble that answers ----
    ai: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#5ce4ff', '#00c4e8', '#00708f')
        + '<circle cx="266" cy="118" r="50" fill="#00c4e8" opacity=".12"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<path d="M46 26 h150 a17 17 0 0 1 17 17 v44 a17 17 0 0 1 -17 17 h-86 l-25 21 v-21 h-39'
        +     ' a17 17 0 0 1 -17 -17 v-44 a17 17 0 0 1 17 -17 z" fill="url(#g' + u + ')"/>'
        +   '<ellipse cx="96" cy="42" rx="36" ry="9" fill="#fff" opacity=".3"/>'
        + '</g>'
        + '<g fill="#fff">'
        +   '<rect x="66" y="54" width="82" height="8" rx="4" opacity=".95"/>'
        +   '<rect x="66" y="70" width="112" height="8" rx="4" opacity=".68"/>'
        +   '<rect x="66" y="86" width="58" height="8" rx="4" opacity=".48"/>'
        + '</g>'
        + '<g fill="#00708f">'
        +   '<path d="M250 32 l4.5 11 11 4.5 -11 4.5 -4.5 11 -4.5 -11 -11 -4.5 11 -4.5z"/>'
        +   '<path d="M222 14 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5z" opacity=".55"/>'
        + '</g></svg>';
    },
    // ---- get listed: a stack of directories, one ticked ----
    listed: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#3ddcb8', '#05b48f', '#05745f')
        + '<circle cx="46" cy="28" r="48" fill="#05b48f" opacity=".12"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="72" y="88" width="164" height="32" rx="11" fill="url(#g' + u + ')" opacity=".45"/>'
        +   '<rect x="64" y="58" width="164" height="32" rx="11" fill="url(#g' + u + ')" opacity=".72"/>'
        +   '<rect x="56" y="28" width="164" height="32" rx="11" fill="url(#g' + u + ')"/>'
        +   '<ellipse cx="106" cy="38" rx="38" ry="7" fill="#fff" opacity=".28"/>'
        + '</g>'
        + '<g fill="#fff" opacity=".95">'
        +   '<circle cx="78" cy="44" r="6.5"/><rect x="94" y="40" width="72" height="8" rx="4"/>'
        + '</g>'
        + '<g stroke="#05745f" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round">'
        +   '<path d="M244 104 l8 8 16 -18"/>'
        + '</g></svg>';
    },
    // ---- Search Console: bars and a climbing line ----
    // The first pass drew the arrow as an L-shaped corner bracket with a hollow
    // circle at the tip, which read as a lollipop rather than an arrowhead. The
    // second drew a proper head but ran the curve straight across the face of
    // the bars, which looked like a mistake. Painting order fixes that: ground,
    // then curve, then bars on top, so the line passes BEHIND them and emerges
    // on the right. The head is drawn last, clear of everything.
    gsc: function (u) {
      return sbArtOpen(u)
        + '<defs><linearGradient id="g' + u + '" x1="0" y1="1" x2="0" y2="0">'
        +   '<stop offset="0" stop-color="#22229b"/><stop offset="1" stop-color="#4a4ad6"/></linearGradient>'
        + '<filter id="f' + u + '" x="-35%" y="-35%" width="170%" height="170%">'
        +   '<feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000075" flood-opacity=".18"/>'
        + '</filter></defs>'
        + '<circle cx="278" cy="128" r="46" fill="#22229b" opacity=".08"/>'
        + '<path d="M62 130 h156" stroke="#22229b" stroke-width="3" stroke-linecap="round"'
        +   ' opacity=".16" fill="none"/>'
        + '<path d="M60 108 C 104 100, 138 74, 176 54 S 216 33, 236 26"'
        +   ' fill="none" stroke="#000075" stroke-width="4.5" stroke-linecap="round"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="72" y="82" width="30" height="42" rx="9" fill="url(#g' + u + ')" opacity=".55"/>'
        +   '<rect x="112" y="60" width="30" height="64" rx="9" fill="url(#g' + u + ')" opacity=".78"/>'
        +   '<rect x="152" y="38" width="30" height="86" rx="9" fill="url(#g' + u + ')"/>'
        + '</g>'
        + '<path d="M254 20 L240 32 L236 18 Z" fill="#000075"/>'
        + '</svg>';
    },
    // ---- connect your website: a globe and a chain link ----
    // The link was two parallel orange capsules, which read as two loose bars
    // rather than a connection. Now the standard interlocking-link glyph: two
    // rounded capsules on the same diagonal with a bar bridging them.
    ghl: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#6f6fe0', '#22229b', '#000075')
        + '<circle cx="272" cy="124" r="46" fill="#22229b" opacity=".09"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<circle cx="104" cy="74" r="42" fill="url(#g' + u + ')"/>'
        +   '<ellipse cx="91" cy="53" rx="22" ry="9" fill="url(#s' + u + ')" opacity=".4"/>'
        + '</g>'
        + '<g stroke="#fff" stroke-width="3.2" fill="none" opacity=".78">'
        +   '<ellipse cx="104" cy="74" rx="18" ry="42"/><path d="M64 62 h80"/><path d="M64 86 h80"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')" transform="translate(206,74) rotate(-38)">'
        +   '<rect x="-52" y="-15" width="56" height="30" rx="15" fill="none"'
        +     ' stroke="#ff9900" stroke-width="9"/>'
        +   '<rect x="-4" y="-15" width="56" height="30" rx="15" fill="none"'
        +     ' stroke="#ff9900" stroke-width="9"/>'
        + '</g></svg>';
    },
    // ---- business details: a profile card ----
    // Was a storefront whose awning was an unfilled outlined trapezoid — it read
    // as a stray envelope flap hovering over the card rather than a roof. Same
    // idea, told as the thing it actually is: your details on a card, checked.
    business: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffffff', '#efede7', '#5b6472')
        + '<circle cx="272" cy="30" r="48" fill="#5b6472" opacity=".07"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="76" y="30" width="168" height="94" rx="15" fill="#fff"/>'
        +   '<path d="M76 45 a15 15 0 0 1 15 -15 h138 a15 15 0 0 1 15 15 v9 h-168z"'
        +     ' fill="#e7e4dd"/>'
        + '</g>'
        + '<circle cx="112" cy="82" r="19" fill="#d8d4cb"/>'
        + '<circle cx="112" cy="76" r="7" fill="#fff"/>'
        + '<path d="M100 95 a12 12 0 0 1 24 0 z" fill="#fff"/>'
        + '<g fill="#5b6472" opacity=".22">'
        +   '<rect x="144" y="70" width="72" height="8" rx="4"/>'
        +   '<rect x="144" y="86" width="52" height="8" rx="4"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')">'
        +   '<circle cx="228" cy="110" r="18" fill="#05b48f"/>'
        + '</g>'
        + '<path d="M220 110 l6 6 11 -13" stroke="#fff" stroke-width="4" fill="none"'
        +   ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
    },
    // ---- brand voice: a quote mark ----
    brand: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffffff', '#efede7', '#5b6472')
        + '<circle cx="52" cy="118" r="48" fill="#5b6472" opacity=".07"/>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="74" y="28" width="172" height="84" rx="16" fill="#fff"/>'
        +   '<path d="M110 112 l4 22 22 -22 z" fill="#fff"/>'
        + '</g>'
        + '<g fill="#5b6472" opacity=".55">'
        +   '<path d="M112 54 q-14 6 -14 20 h14 v18 h-24 v-22 q0 -20 24 -26 z"/>'
        +   '<path d="M150 54 q-14 6 -14 20 h14 v18 h-24 v-22 q0 -20 24 -26 z"/>'
        + '</g>'
        + '<g fill="#5b6472" opacity=".18">'
        +   '<rect x="176" y="56" width="52" height="7" rx="3.5"/>'
        +   '<rect x="176" y="72" width="40" height="7" rx="3.5"/>'
        + '</g></svg>';
    },
    // ---- lock this to you: a padlock ----
    admin: function (u) {
      return sbArtOpen(u) + sbArtDefs(u, '#ffffff', '#efede7', '#5b6472')
        + '<circle cx="262" cy="112" r="48" fill="#5b6472" opacity=".07"/>'
        + '<g stroke="#5b6472" stroke-width="12" fill="none" opacity=".45">'
        +   '<path d="M134 62 v-14 a26 26 0 0 1 52 0 v14"/>'
        + '</g>'
        + '<g filter="url(#f' + u + ')">'
        +   '<rect x="112" y="60" width="96" height="70" rx="16" fill="url(#g' + u + ')"'
        +     ' stroke="#d8d4cb" stroke-width="2"/>'
        +   '<ellipse cx="146" cy="74" rx="22" ry="7" fill="#fff" opacity=".7"/>'
        + '</g>'
        + '<circle cx="160" cy="90" r="9" fill="#5b6472" opacity=".55"/>'
        + '<rect x="156.5" y="96" width="7" height="18" rx="3.5" fill="#5b6472" opacity=".55"/></svg>';
    },
    // ---- keep your history: stacked disks ----
    // The first version was white-on-white with a hairline border and all but
    // disappeared against the neutral tint. Given real fill and edge contrast,
    // plus a green tick so it reads as "kept" rather than "storage hardware".
    storage: function (u) {
      var band = function (y, top) {
        return '<path d="M100 ' + y + ' v-24 h120 v24" fill="#e7e4dd" stroke="#c9c4b9" stroke-width="2"/>'
          + '<ellipse cx="160" cy="' + y + '" rx="60" ry="17" fill="' + (top ? '#fff' : '#e7e4dd')
          + '" stroke="#c9c4b9" stroke-width="2"/>';
      };
      return sbArtOpen(u) + sbArtDefs(u, '#ffffff', '#efede7', '#5b6472')
        + '<circle cx="52" cy="34" r="44" fill="#5b6472" opacity=".07"/>'
        + '<g filter="url(#f' + u + ')">'
        +   band(112, false) + band(86, false) + band(60, true)
        + '</g>'
        + '<g filter="url(#f' + u + ')"><circle cx="222" cy="106" r="18" fill="#05b48f"/></g>'
        + '<path d="M214 106 l6 6 11 -13" stroke="#fff" stroke-width="4" fill="none"'
        +   ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
      html += '<div class="sb-gs">' + scoring.map((s, i) => sbStepCard(s, i === 0, true)).join('') + '</div>';
    }
    if (protect.length) {
      html += '<div class="sb-eyebrow">Still to do <span class="n">'
        + (protect.length === 1 ? 'this one will not' : 'these will not')
        + ' change your score</span></div>'
        + '<div class="sb-gs">' + protect.map(s => sbStepCard(s, false, true)).join('') + '</div>';
    }
    if (done.length) {
      html += '<div class="sb-eyebrow">Already running</div>'
        + '<div class="sb-gs">' + done.map(s => sbDoneCard(s)).join('') + '</div>';
    }
    html += '<div class="sb-eyebrow">All tools</div>';
    host.innerHTML = html;
    sbWireCards(host, steps);
  }

  // A finished step, still on the shelf. Same artwork, muted, and the only
  // action is "Open" — it is a reference card now, not a task.
  // Where a finished step sends you, for the ones whose only handler was an
  // action rather than a destination.
  const SB_DONE_TAB = { autopilot: 'performance-tab', business: 'settings-tab' };

  function sbDoneCard(st) {
    const p = st.pillar || '';
    const tint = p || (st.kind === 'protect' ? 'neutral' : 'p5');
    const worth = st.kind === 'unlock' ? '+' + st.points + ' pts' : (st.badge || 'done');
    return '<div class="sb-card illus is-done" data-key="' + st.key + '">'
      + '<div class="sb-art ' + tint + '">' + sbArt(st.key) + '</div>'
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
    } else {
      badge.className = 'sum-badge demo';
      badge.innerText = 'Demo search data — connect Search Console for live numbers';
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
  if (state.activeTab === 'today-tab') loadToday();
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


  // --- CITATION OUTREACH ENGINE ---
  // The finder runs server-side and is cached; this tab shows the ACTION
  // worklist: listing kit, per-target pitch/listing assets, and a tracker.
  const citationsQueries = document.getElementById('citations-queries');
  const btnCitScan = document.getElementById('btn-find-citations');
  const btnCitSettings = document.getElementById('btn-cit-settings');
  const citSettingsPanel = document.getElementById('cit-settings-panel');
  const citLastScanned = document.getElementById('cit-last-scanned');
  const citProgress = document.getElementById('cit-progress');
  const citKit = document.getElementById('cit-kit');
  const citKitHead = document.getElementById('cit-kit-head');
  const citKitBody = document.getElementById('cit-kit-body');
  const citKitCaret = document.getElementById('cit-kit-caret');
  const citationsResults = document.getElementById('citations-results');
  const citAutoToggle = document.getElementById('cit-auto-toggle');

  let citLastData = { targets: [], brandCited: false };
  const CIT_TOTAL = { t: 0 };
  let citGmailConfigured = false;

  if (citationsQueries && !citationsQueries.value.trim()) {
    citationsQueries.value = 'senior fitness st petersburg fl\npersonal trainer st petersburg fl\nbest gym for seniors near me';
  }

  function citEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function citAttr(s) { return JSON.stringify(String(s == null ? '' : s)).replace(/"/g, '&quot;'); }
  window._citCopy = function (text, el) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => {
      if (el) { const o = el.innerText; el.innerText = 'Copied ✓'; setTimeout(() => { el.innerText = o; }, 1200); }
    }).catch(() => { if (el) { el.innerText = 'Copy failed'; } });
  };

  function citTimeAgo(iso) {
    if (!iso) return 'Not scanned yet';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return 'Not scanned yet';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'Scanned just now';
    if (mins < 60) return 'Scanned ' + mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return 'Scanned ' + hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
    const days = Math.round(hrs / 24);
    return 'Scanned ' + days + ' day' + (days > 1 ? 's' : '') + ' ago';
  }

  function citActLabel(mode) {
    return mode === 'listing' ? '⚙ Prep listing'
      : mode === 'pitch' ? '✎ Draft & send pitch'
      : mode === 'maintain' ? 'Maintain'
      : 'Why skip?';
  }

  function citRenderProgress(counts, brandCited) {
    if (!citProgress) return;
    if (!counts || !counts.total) { citProgress.style.display = 'none'; return; }
    const worked = Math.min(counts.total, counts.inProgress + counts.live);
    const pct = counts.total ? Math.round((worked / counts.total) * 100) : 0;
    citProgress.style.display = 'grid';
    citProgress.innerHTML =
      `<div class="cit-pstat"><b>${counts.total}</b><span>sources AI cites</span></div>` +
      `<div class="cit-pstat"><b>${counts.listed}</b><span>you already appear on</span></div>` +
      `<div class="cit-pstat"><b>${counts.inProgress}</b><span>in progress</span></div>` +
      `<div class="cit-pstat live"><b>${counts.live}</b><span>listed / live</span></div>` +
      `<div class="cit-bar"><div class="cit-bar-top"><span>Citation gap progress</span><span>${worked} of ${counts.total} worked</span></div>` +
        `<div class="cit-bar-track"><div class="cit-bar-fill" style="width:${pct}%;"></div></div></div>`;
  }

  function citRenderKit(kit) {
    if (!citKit || !kit) return;
    citKit.style.display = 'block';
    const socials = (kit.socials || []).map(s => `<a href="${citEsc(s)}" target="_blank" rel="noopener" style="color:var(--color-secondary);">${citEsc(s.replace(/^https?:\/\/(www\.)?/, ''))}</a>`).join('  ·  ');
    const cats = (kit.categories || []).map(c => `<span class="cit-chip">${citEsc(c)}</span>`).join('');
    const napLine = `${kit.name} · ${kit.addressOneLine} · ${kit.phone}`;
    function kf(label, valHtml, copyText) {
      const copy = copyText != null ? `<span class="cit-copy" onclick="window._citCopy(${citAttr(copyText)}, this)">copy</span>` : '';
      return `<div class="cit-kf"><div class="kf-lbl"><span>${label}</span>${copy}</div><div class="kf-val">${valHtml}</div></div>`;
    }
    citKitBody.innerHTML =
      `<div class="cit-kit-grid">` +
        kf('Name / Address / Phone', citEsc(napLine), napLine) +
        kf('Website', `<a href="${citEsc(kit.website)}" target="_blank" rel="noopener" style="color:var(--color-secondary);">${citEsc(kit.website)}</a>`, kit.website) +
        kf('Categories', cats, (kit.categories || []).join(', ')) +
        kf('Short description (≤160 chars)', citEsc(kit.shortDesc), kit.shortDesc) +
        kf('Long description', citEsc(kit.longDesc), kit.longDesc) +
        kf('Social profiles', socials || '<span class="text-muted">—</span>', (kit.socials || []).join('  ')) +
        kf('Photo checklist', (kit.photoChecklist || []).map(p => '☐ ' + citEsc(p)).join('&nbsp;&nbsp; '), null) +
      `</div>` +
      `<div style="margin-top:12px;"><button class="cit-pa" id="btn-cit-kit-regen" type="button">↻ Regenerate descriptions with AI</button></div>` +
      `<div class="cit-hint">Paste these exact details on every site so they match everywhere — matching is what lifts your local ranking. The number we treat as correct is <b>(727) 334-1472</b>.</div>`;
    const regen = document.getElementById('btn-cit-kit-regen');
    if (regen) regen.onclick = citRegenKit;
  }

  async function citRegenKit() {
    const btn = document.getElementById('btn-cit-kit-regen');
    if (btn) { btn.disabled = true; btn.innerText = 'Regenerating…'; }
    try {
      const res = await authFetch('/api/listing-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (data.kit) citRenderKit(data.kit);
    } catch (e) { alert('Could not regenerate: ' + e.message); }
    finally { const b = document.getElementById('btn-cit-kit-regen'); if (b) { b.disabled = false; b.innerText = '↻ Regenerate descriptions with AI'; } }
  }

  function citStatusSelect(domain, cur) {
    const opts = [['todo', 'To-do'], ['submitted', 'Submitted'], ['pitched', 'Pitched'], ['live', 'Live']];
    const liveCls = cur === 'live' ? ' live' : '';
    return `<select class="cit-status${liveCls}" data-domain="${citEsc(domain)}">` +
      opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('') +
      `</select>`;
  }

  function citRecount() {
    const targets = citLastData.targets || [];
    citRenderProgress({
      total: targets.length,
      listed: targets.filter(t => t.listed === true).length,
      inProgress: targets.filter(t => ['submitted', 'pitched'].includes(t.status)).length,
      live: targets.filter(t => t.status === 'live' || t.listed === true).length
    }, citLastData.brandCited);
  }

  async function citSetStatus(domain, status, sel) {
    if (sel) sel.classList.toggle('live', status === 'live');
    const tgt = (citLastData.targets || []).find(t => t.domain === domain);
    if (tgt) tgt.status = status;
    citRecount();
    try {
      await authFetch('/api/citation-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, status }) });
    } catch (e) { /* non-fatal — UI already updated */ }
  }

  function gmailComposeUrl(to, subject, body) {
    let u = 'https://mail.google.com/mail/?view=cm&fs=1';
    if (to && to.indexOf('@') > -1) u += '&to=' + encodeURIComponent(to);
    return u + '&su=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }

  async function citDoAction(btn) {
    const card = btn.closest('.cit-card');
    const panel = card ? card.querySelector('.cit-panel') : null;
    const domain = btn.dataset.domain, type = btn.dataset.type;
    if (!panel) return;
    if (panel.style.display === 'block' && panel.dataset.loaded === '1') { panel.style.display = 'none'; panel.dataset.loaded = ''; return; }
    panel.style.display = 'block';
    panel.innerHTML = '<div class="cit-hint">Preparing…</div>';
    const tgt = (citLastData.targets || []).find(t => t.domain === domain) || {};
    try {
      const res = await authFetch('/api/citation-outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, type, queries: tgt.queries || [] })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not prepare this action.');
      panel.dataset.loaded = '1';

      if (data.kind === 'skip') { panel.innerHTML = `<div class="cit-hint">${citEsc(data.message)}</div>`; return; }

      if (data.kind === 'listing') {
        const f = data.fields || {};
        const allText = `${f.name}\n${f.address}\n${f.phone}\n${f.website}\nCategories: ${f.categories}\n\n${f.description}`;
        panel.innerHTML =
          `<div class="cit-panel-tag">✦ Ready-to-paste listing — matches your Listing Kit</div>` +
          `<div class="cit-pl">` +
            `<div class="row"><span class="k">Name</span><span>${citEsc(f.name)}</span></div>` +
            `<div class="row"><span class="k">Address</span><span>${citEsc(f.address)}</span></div>` +
            `<div class="row"><span class="k">Phone</span><span>${citEsc(f.phone)}</span></div>` +
            `<div class="row"><span class="k">Website</span><span>${citEsc(f.website)}</span></div>` +
            `<div class="row"><span class="k">Categories</span><span>${citEsc(f.categories)}</span></div>` +
            `<div class="row"><span class="k">Description</span><span>${citEsc(f.description)}</span></div>` +
          `</div>` +
          (data.howTo ? `<div class="cit-hint">${citEsc(data.howTo)}</div>` : '') +
          `<div class="cit-panel-actions">` +
            `<a class="cit-pa open" href="${citEsc(data.claimUrl)}" target="_blank" rel="noopener">↗ Open claim page</a>` +
            `<button class="cit-pa" type="button" onclick="window._citCopy(${citAttr(allText)}, this)">Copy all fields</button>` +
          `</div>`;
        return;
      }

      if (data.kind === 'pitch') {
        if (data.unavailable) { panel.innerHTML = `<div class="cit-hint">${citEsc(data.message)}</div>`; return; }
        const foundEmail = (data.email && data.email.indexOf('@') > -1) ? data.email : '';
        const contactUrl = data.contactUrl || ('https://' + domain);
        const emailText = `To: ${foundEmail || '(find recipient — see contact page)'}\nSubject: ${data.subject}\n\n${data.body}`;
        // Always give an editable, pre-addressed recipient box — prefilled with the real email we found (if any).
        const toCell = `<span style="flex:1;"><input class="cit-to-input" type="email" value="${citEsc(foundEmail)}" placeholder="name@publication.com" style="width:100%;background:rgba(0,0,0,.3);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;padding:5px 8px;font-family:inherit;font-size:13px;"></span>`;
        // Send/open action: direct Gmail send when connected, otherwise open a Gmail draft addressed to whatever's in the box.
        const sendControl = citGmailConfigured
          ? `<button class="cit-pa send cit-send-now" type="button">✉ Send now</button>`
          : `<button class="cit-pa send cit-open-gmail" type="button">✉ Open in Gmail</button>`;
        const recipientHint = foundEmail
          ? `Found this address published for ${citEsc(domain)} — double-check it’s the right desk before sending. `
          : `No public email is listed for this site, so the box is blank — open the contact page to find the right person, then paste it above. `;
        panel.innerHTML =
          `<div class="cit-panel-tag">✦ AI-drafted outreach — personalized to this source</div>` +
          `<div class="cit-eml">` +
            `<div class="row"><span class="k">To</span>${toCell}</div>` +
            `<div class="row"><span class="k">Subject</span><span>${citEsc(data.subject)}</span></div>` +
          `</div>` +
          `<div class="cit-body-txt">${citEsc(data.body)}</div>` +
          `<div class="cit-hint">${recipientHint}${citEsc(data.howToFind || '')}</div>` +
          `<div class="cit-panel-actions">` +
            sendControl +
            `<a class="cit-pa open" href="${citEsc(contactUrl)}" target="_blank" rel="noopener">↗ Contact page</a>` +
            `<button class="cit-pa" type="button" onclick="window._citCopy(${citAttr(emailText)}, this)">Copy email</button>` +
            `<button class="cit-pa cit-regen" type="button">↻ Regenerate</button>` +
          `</div>`;
        const rg = panel.querySelector('.cit-regen');
        if (rg) rg.addEventListener('click', () => { panel.dataset.loaded = ''; citDoAction(btn); });
        const og = panel.querySelector('.cit-open-gmail');
        if (og) og.addEventListener('click', () => {
          const toVal = ((panel.querySelector('.cit-to-input') || {}).value || '').trim();
          if (toVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toVal)) { alert('That doesn’t look like a valid email — fix it or leave it blank to fill in Gmail.'); return; }
          window.open(gmailComposeUrl(toVal, data.subject, data.body), '_blank', 'noopener');
        });
        const sn = panel.querySelector('.cit-send-now');
        if (sn) sn.addEventListener('click', async () => {
          const toVal = ((panel.querySelector('.cit-to-input') || {}).value || '').trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toVal)) { alert('Enter the recipient’s email address to send.'); return; }
          sn.disabled = true; sn.innerText = 'Sending…';
          try {
            const r = await authFetch('/api/send-pitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: toVal, subject: data.subject, body: data.body }) });
            const dd = await r.json();
            if (dd.needsSetup) { alert(dd.message); sn.disabled = false; sn.innerText = '✉ Send now'; return; }
            if (!r.ok || !dd.success) throw new Error(dd.error || 'Send failed');
            sn.innerText = 'Sent ✓';
            const sel = card.querySelector('.cit-status'); if (sel) { sel.value = 'pitched'; citSetStatus(domain, 'pitched', sel); }
          } catch (e) { alert('Send error: ' + e.message); sn.disabled = false; sn.innerText = '✉ Send now'; }
        });
        return;
      }
      panel.innerHTML = `<div class="cit-hint">Nothing to prepare for this source.</div>`;
    } catch (e) {
      panel.innerHTML = `<div class="cit-hint">Error: ${citEsc(e.message)}</div>`;
    }
  }

  function citRenderWorklist(targets, total) {
    CIT_TOTAL.t = total || (targets && targets.length) || 0;
    if (!citationsResults) return;
    if (!targets || !targets.length) {
      citationsResults.innerHTML = '<div class="cit-empty">No worklist yet. Click <b>Scan now</b> to find the third‑party sources AI cites for your searches — then this becomes your get‑listed to‑do list.</div>';
      return;
    }
    citationsResults.innerHTML = targets.map((t, i) => {
      const listedTxt = t.listed === true ? 'You appear here' : (t.listed === false ? 'Not listed' : 'Unknown');
      const listedCls = t.listed === true ? 'yes' : (t.listed === false ? 'no' : 'unknown');
      const typeCls = ['directory', 'review', 'listicle', 'forum', 'competitor'].includes(t.type) ? ('type-' + t.type) : '';
      const actGhost = (t.mode === 'maintain' || t.mode === 'skip') ? ' ghost' : '';
      return `<div class="cit-card" data-domain="${citEsc(t.domain)}">
        <div class="cit-rank">${i + 1}</div>
        <div class="cit-body">
          <div class="cit-domain"><a href="https://${citEsc(t.domain)}" target="_blank" rel="noopener">${citEsc(t.domain)}</a></div>
          <div class="cit-meta">
            ${t.isNew ? '<span class="cit-badge cit-new">NEW</span>' : ''}
            <span class="cit-badge ${typeCls}">${citEsc(t.type)}</span>
            <span class="cit-listed ${listedCls}">${listedTxt}</span>
            <span class="cit-cited">cited in ${t.citedFor} of ${CIT_TOTAL.t} searches</span>
          </div>
          ${t.note ? `<div class="cit-note">${citEsc(t.note)}</div>` : ''}
          <div class="cit-panel" style="display:none;"></div>
        </div>
        <div class="cit-side">
          ${citStatusSelect(t.domain, t.status)}
          <button class="cit-act${actGhost}" type="button" data-domain="${citEsc(t.domain)}" data-type="${citEsc(t.type)}" data-mode="${citEsc(t.mode)}">${citActLabel(t.mode)}</button>
        </div>
      </div>`;
    }).join('');
    citationsResults.querySelectorAll('.cit-status').forEach(sel => {
      sel.addEventListener('change', () => citSetStatus(sel.dataset.domain, sel.value, sel));
    });
    citationsResults.querySelectorAll('.cit-act').forEach(b => {
      b.addEventListener('click', () => citDoAction(b));
    });
  }

  function citRenderAll(data) {
    citLastData = data || { targets: [] };
    citRenderKit(data.kit);
    if (citLastScanned) citLastScanned.innerText = citTimeAgo(data.lastScanned);
    if (citAutoToggle) citAutoToggle.checked = !!data.autoEnabled;
    citRenderProgress(data.counts, data.brandCited);
    citRenderWorklist(data.targets, data.totalQueries);
    if (data.queries && data.queries.length && citationsQueries) citationsQueries.value = data.queries.join('\n');
    // Clear NEW-target flags server-side only once the worklist is actually
    // on screen (not on the background startup load, which runs while another
    // tab is active — otherwise the badges would clear before you see them).
    const citTabEl = document.getElementById('citations-tab');
    if (data.newDomains && data.newDomains.length && citTabEl && citTabEl.classList.contains('active')) {
      authFetch('/api/citation-autopilot/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadCitationWorklist() {
    fetch('/api/gmail-status').then(r => r.json()).then(g => { citGmailConfigured = !!g.configured; }).catch(() => {});
    try {
      const res = await fetch('/api/citation-worklist');
      const data = await res.json();
      citRenderAll(data);
    } catch (e) {
      if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Could not load the worklist. ' + citEsc(e.message) + '</div>';
    }
  }
  window.loadCitationWorklist = loadCitationWorklist;

  if (btnCitSettings && citSettingsPanel) {
    btnCitSettings.addEventListener('click', () => {
      citSettingsPanel.style.display = (citSettingsPanel.style.display === 'none') ? 'block' : 'none';
    });
  }
  if (citKitHead) {
    citKitHead.addEventListener('click', () => {
      const show = citKitBody.style.display === 'none';
      citKitBody.style.display = show ? 'block' : 'none';
      if (citKitCaret) citKitCaret.innerHTML = show ? '&#9652; hide' : '&#9662; show';
    });
  }

  if (citAutoToggle) {
    citAutoToggle.addEventListener('change', async () => {
      try { await authFetch('/api/citation-autopilot/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: citAutoToggle.checked }) }); }
      catch (e) { alert('Could not update: ' + e.message); }
    });
  }

  if (btnCitScan) {
    btnCitScan.addEventListener('click', async () => {
      const queries = (citationsQueries.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      if (!queries.length) { alert('Add at least one search query in Search settings (one per line).'); return; }
      btnCitScan.disabled = true;
      const orig = btnCitScan.innerText;
      btnCitScan.innerText = 'Scanning… (~30–60s)';
      if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Running live Google‑grounded searches and building your worklist… please wait.</div>';
      try {
        const res = await authFetch('/api/citation-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }) });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Scan failed');
        if (data.unavailable) { alert(data.message); return; }
        citRenderAll(data);
      } catch (e) {
        alert('Scan error: ' + e.message);
        if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Something went wrong. ' + citEsc(e.message) + '</div>';
      } finally {
        btnCitScan.disabled = false;
        btnCitScan.innerText = orig;
      }
    });
  }

  // Load the cached worklist on startup so the tab is populated instantly.
  loadCitationWorklist();


  // --- LOCAL SEO TOOLS ---
  async function lrGenerate(body, outEl, btn) {
    const orig = btn.innerText;
    btn.disabled = true; btn.innerText = 'Generating…';
    try {
      const res = await authFetch('/api/local-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');
      if (data.unavailable) { alert(data.message); return; }
      outEl.value = data.text || '';
    } catch (e) { alert('Error: ' + e.message); }
    finally { btn.disabled = false; btn.innerText = orig; }
  }
  function lrCopy(el, btn) {
    if (!el.value) { alert('Nothing to copy yet.'); return; }
    navigator.clipboard.writeText(el.value);
    const o = btn.innerText; btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = o, 1500);
  }

  // --- LOCAL SEO AUTOPILOT ---
  const laToggle = document.getElementById('la-toggle');
  const laMeta = document.getElementById('la-meta');
  const laNapBadge = document.getElementById('la-nap-badge');
  const laNapBody = document.getElementById('la-nap-body');
  const laGbpBadge = document.getElementById('la-gbp-badge');
  const laGbpBody = document.getElementById('la-gbp-body');
  const laRun = document.getElementById('la-run');
  const laRunNote = document.getElementById('la-run-note');
  const laReplies = document.getElementById('la-replies');
  let laPollTimer = null;
  let laGbpConfigured = false;

  function laAgo(iso) {
    if (!iso) return 'never';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const h = Math.round(mins / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  function laDue(iso, days) {
    if (!iso) return 'due now';
    const rem = (days || 7) - ((Date.now() - new Date(iso).getTime()) / 86400000);
    return rem <= 0 ? 'due now' : ('in ' + Math.ceil(rem) + 'd');
  }

  function laRenderNap(nap, isNew) {
    if (!laNapBody) return;
    if (!nap) { laNapBadge.innerHTML = ''; laNapBody.innerHTML = '<div class="sb-val">Not checked yet</div><div class="sb-verdict"><i class="sb-dot" style="background:var(--ink-3)"></i>We have not compared your details across the web yet.</div>'; return; }
    const bad = (nap.listings || []).filter(l => l.phoneMatch === false || l.addrMatch === false || l.nameMatch === false);
    laNapBadge.innerHTML = bad.length
      ? `<span class="la-badge new">${isNew ? 'NEW · ' : ''}${bad.length} mismatch${bad.length > 1 ? 'es' : ''}</span>`
      : `<span class="la-badge ok">consistent</span>`;
    if (!bad.length) { laNapBody.innerHTML = `<div class="sb-val">0<u>listings to fix</u></div><div class="sb-verdict"><i class="sb-dot" style="background:var(--p4-g)"></i>All ${nap.listings.length} match your official details. Checked ${laAgo(nap.checkedAt)}.</div>`; return; }
    laNapBody.innerHTML = `<div class="sb-val">${bad.length}<u>listing${bad.length > 1 ? 's' : ''} to fix</u></div>`
      + `<div class="sb-verdict"><i class="sb-dot" style="background:var(--p2-g)"></i>Wrong on ${bad.map(l => citEsc(l.platform || '?')).join(', ')}. Checked ${laAgo(nap.checkedAt)}.</div>`
      + `<details class="sb-disclosure"><summary>Show what differs</summary><div>` + bad.map(l => {
      const issues = []; if (l.phoneMatch === false) issues.push('phone'); if (l.addrMatch === false) issues.push('address'); if (l.nameMatch === false) issues.push('name');
      return `<div class="la-nap-line"><span><b>${citEsc(l.platform || '?')}</b><br><span class="lr-muted">${citEsc(l.phone || l.address || '')}</span></span><span class="nap-bad">${issues.join(' + ')} off</span></div>`;
    }).join('') + `<div class="lr-muted" style="margin-top:8px;">Align these to ${citEsc(nap.canonical.phone)} · ${citEsc(nap.canonical.address)}.</div></div></details>`;
  }

  function laRenderGbp(draft) {
    if (!laGbpBody) return;
    if (!draft) { laGbpBadge.innerHTML = ''; laGbpBody.innerHTML = '<span class="lr-muted">No post yet — one is written each week, or click Run now.</span>'; return; }
    laGbpBadge.innerHTML = draft.posted ? '<span class="la-badge ok">POSTED</span>' : (draft.isNew ? '<span class="la-badge new">NEW</span>' : '');
    const postedNote = draft.posted ? `<span class="lr-muted" style="color:var(--color-success)">Posted to Google ${laAgo(draft.postedAt)} ✓</span>`
      : (draft.postError ? `<span class="nap-bad">Auto-post failed: ${citEsc(draft.postError)}</span>` : '');
    const postBtn = (laGbpConfigured && !draft.posted) ? `<button class="btn btn-primary btn-xs" id="la-gbp-post" type="button">Post to Google now</button>` : '';
    // Manual flow (no GBP API): let the owner confirm they posted it to Google themselves.
    const markBtn = !draft.posted ? `<button class="btn btn-secondary btn-xs" id="la-gbp-mark" type="button">&#10003; Mark as posted</button>` : '';
    laGbpBody.innerHTML = `<div class="la-gbp-text">${citEsc(draft.text)}</div>`
      + `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">`
      + `<button class="btn btn-secondary btn-xs" id="la-gbp-copy" type="button">Copy post</button>`
      + postBtn
      + markBtn
      + `<span class="lr-muted">Topic: ${citEsc(draft.topic || '—')} · written ${laAgo(draft.createdAt)}</span>`
      + `</div>`
      + (!draft.posted ? `<div class="lr-muted" style="margin-top:6px;">Copy the post into your Google Business Profile, then tap <b>Mark as posted</b> to clear the reminder.</div>` : '')
      + (postedNote ? `<div style="margin-top:6px;">${postedNote}</div>` : '');
    const cp = document.getElementById('la-gbp-copy');
    if (cp) cp.onclick = () => { navigator.clipboard.writeText(draft.text); cp.innerText = 'Copied ✓'; setTimeout(() => cp.innerText = 'Copy post', 1200); };
    const mb = document.getElementById('la-gbp-mark');
    if (mb) mb.onclick = async () => {
      mb.disabled = true; mb.innerText = 'Saving…';
      try {
        const r = await authFetch('/api/gbp-mark-posted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const dd = await r.json();
        if (!r.ok || !dd.success) throw new Error(dd.error || 'failed');
        draft.posted = true; draft.postedAt = new Date().toISOString(); laRenderGbp(draft);
        if (window.loadHome) window.loadHome();
        if (window.loadGrow) window.loadGrow();
      } catch (e) { alert('Could not update: ' + e.message); mb.disabled = false; mb.innerHTML = '&#10003; Mark as posted'; }
    };
    const pb = document.getElementById('la-gbp-post');
    if (pb) pb.onclick = async () => {
      pb.disabled = true; pb.innerText = 'Posting…';
      try {
        const r = await authFetch('/api/gbp-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft.text }) });
        const dd = await r.json();
        if (dd.needsSetup) { alert(dd.message); pb.disabled = false; pb.innerText = 'Post to Google now'; return; }
        if (!r.ok || !dd.success) throw new Error(dd.error || 'Post failed');
        draft.posted = true; draft.postedAt = new Date().toISOString(); laRenderGbp(draft);
      } catch (e) { alert('Post error: ' + e.message); pb.disabled = false; pb.innerText = 'Post to Google now'; }
    };
  }

  function laRenderReplies(list) {
    if (!laReplies) return;
    if (!list || !list.length) { laReplies.innerHTML = ''; return; }
    laReplies.innerHTML = `<details><summary class="la-mini">Recent saved replies (${list.length})</summary>`
      + list.slice(0, 6).map(r => `<div style="border-top:1px solid var(--border-color);padding:8px 0;font-size:var(--font-xs);"><span class="lr-muted">${r.rating ? ('★' + citEsc(r.rating) + ' · ') : ''}${laAgo(r.createdAt)}</span><br><i>"${citEsc((r.review || '').slice(0, 110))}${(r.review || '').length > 110 ? '…' : ''}"</i><br>${citEsc(r.reply)}</div>`).join('')
      + `</details>`;
  }

  function laRender(s) {
    if (!s) return;
    if (laToggle) laToggle.checked = !!s.enabled;
    if (laMeta) laMeta.innerHTML = s.hasKey
      ? `Autopilot is <b style="color:${s.enabled ? 'var(--color-success)' : 'var(--text-muted)'}">${s.enabled ? 'ON' : 'OFF'}</b> · NAP check ${laDue(s.lastNapRun, s.napIntervalDays)} · GBP post ${laDue(s.lastGbpRun, s.gbpIntervalDays)}`
      : `<span class="nap-bad">Add your Gemini key in Settings to turn the autopilot on.</span>`;
    laRenderNap(s.nap, s.napNewMismatch);
    laRenderGbp(s.gbpDraft);
    laRenderReplies(s.replyHistory);
    if (s.napNewMismatch || (s.gbpDraft && s.gbpDraft.isNew)) {
      authFetch('/api/local-autopilot/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadLocalAutopilot() {
    try { const g = await (await fetch('/api/gbp-status')).json(); laGbpConfigured = !!g.configured; } catch (e) { /* default off */ }
    try {
      const res = await fetch('/api/local-autopilot');
      const s = await res.json();
      laRender(s);
      if (s.busy) laPoll();
    } catch (e) { /* leave last render */ }
  }
  window.loadLocalAutopilot = loadLocalAutopilot;

  function laPoll() {
    if (laPollTimer) return;
    let n = 0;
    if (laRun) { laRun.disabled = true; laRun.innerText = 'Working… (~1 min)'; }
    laPollTimer = setInterval(async () => {
      n++;
      try {
        const res = await fetch('/api/local-autopilot');
        const s = await res.json();
        laRender(s);
        if (!s.busy || n > 12) { clearInterval(laPollTimer); laPollTimer = null; if (laRun) { laRun.disabled = false; laRun.innerText = 'Run now'; } if (laRunNote) laRunNote.innerText = ''; }
      } catch (e) { clearInterval(laPollTimer); laPollTimer = null; if (laRun) { laRun.disabled = false; laRun.innerText = 'Run now'; } }
    }, 8000);
  }

  if (laToggle) {
    laToggle.addEventListener('change', async () => {
      try { await authFetch('/api/local-autopilot/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: laToggle.checked }) }); loadLocalAutopilot(); }
      catch (e) { alert('Could not update: ' + e.message); }
    });
  }
  if (laRun) {
    laRun.addEventListener('click', async () => {
      laRun.disabled = true; laRun.innerText = 'Starting…';
      try {
        const res = await authFetch('/api/local-autopilot/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await res.json();
        if (d.unavailable) { alert(d.message); laRun.disabled = false; laRun.innerText = 'Run now'; return; }
        if (laRunNote) laRunNote.innerText = 'Running the NAP check and writing your post…';
        setTimeout(laPoll, 1500);
      } catch (e) { alert('Run error: ' + e.message); laRun.disabled = false; laRun.innerText = 'Run now'; }
    });
  }

  // NAP consistency audit
  const btnNapCheck = document.getElementById('btn-nap-check');
  if (btnNapCheck) {
    btnNapCheck.addEventListener('click', async () => {
      const canonEl = document.getElementById('nap-canonical');
      const resEl = document.getElementById('nap-results');
      const orig = btnNapCheck.innerText;
      btnNapCheck.disabled = true; btnNapCheck.innerText = 'Checking the web… (~20–40s)';
      resEl.innerHTML = '<div class="lr-empty">Searching the major platforms for your listings…</div>';
      try {
        const res = await authFetch('/api/nap-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'NAP audit failed');
        canonEl.style.display = 'block';
        canonEl.className = 'nap-canonical';
        canonEl.innerHTML = `<b>Your official info:</b> ${citEsc(data.canonical.name)} &middot; ${citEsc(data.canonical.address)} &middot; ${citEsc(data.canonical.phone)}`;
        if (data.unavailable) { alert(data.message); resEl.innerHTML = ''; return; }
        const rows = data.listings || [];
        if (!rows.length) { resEl.innerHTML = '<div class="lr-empty">No listings came back — your citations may be sparse, which is itself a signal to build more. Try again in a moment.</div>'; return; }
        const cell = (val, match) => {
          const v = citEsc(val || '—');
          if (match === true) return `<td class="nap-ok">✓ ${v}</td>`;
          if (match === false) return `<td class="nap-bad">✗ ${v}</td>`;
          return `<td>${v}</td>`;
        };
        const mism = rows.filter(r => r.phoneMatch === false || r.addrMatch === false || r.nameMatch === false).length;
        resEl.innerHTML = `<p class="lr-muted" style="margin:12px 0 4px;">${mism > 0 ? `<span class="nap-bad">${mism} listing(s) with a mismatch</span> — align these to one consistent NAP.` : 'No mismatches detected in what we found — keep it consistent as you add citations.'}</p>` +
          `<table class="nap-table"><thead><tr><th>Platform</th><th>Name</th><th>Address</th><th>Phone</th></tr></thead><tbody>` +
          rows.map(r => `<tr><td>${citEsc(r.platform || '—')}</td>${cell(r.name, r.nameMatch)}${cell(r.address, r.addrMatch)}${cell(r.phone, r.phoneMatch)}</tr>`).join('') +
          `</tbody></table>`;
      } catch (e) { alert('NAP audit error: ' + e.message); resEl.innerHTML = ''; }
      finally { btnNapCheck.disabled = false; btnNapCheck.innerText = orig; }
    });
  }

  // Review response
  const btnLrResponse = document.getElementById('btn-lr-response');
  if (btnLrResponse) btnLrResponse.addEventListener('click', async () => {
    const review = (document.getElementById('lr-review-text').value || '').trim();
    if (!review) { alert('Paste the review first.'); return; }
    const out = document.getElementById('lr-response-out');
    const orig = btnLrResponse.innerText;
    btnLrResponse.disabled = true; btnLrResponse.innerText = 'Writing…';
    try {
      // Uses /api/local-reply so the draft is saved to the autopilot's reply history.
      const res = await authFetch('/api/local-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review, rating: document.getElementById('lr-review-rating').value }) });
      const d = await res.json();
      if (d.unavailable) { alert(d.message); }
      else if (!res.ok || !d.success) { throw new Error(d.error || 'Generation failed'); }
      else { out.value = d.reply || ''; if (window.loadLocalAutopilot) window.loadLocalAutopilot(); }
    } catch (e) { alert('Error: ' + e.message); }
    finally { btnLrResponse.disabled = false; btnLrResponse.innerText = orig; }
  });
  const btnLrRespCopy = document.getElementById('btn-lr-response-copy');
  if (btnLrRespCopy) btnLrRespCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-response-out'), btnLrRespCopy));

  // Review request
  const btnLrRequest = document.getElementById('btn-lr-request');
  if (btnLrRequest) btnLrRequest.addEventListener('click', () => {
    lrGenerate({ kind: 'review-request', clientName: document.getElementById('lr-req-name').value.trim(), reviewLink: document.getElementById('lr-req-link').value.trim() }, document.getElementById('lr-request-out'), btnLrRequest);
  });
  const btnLrReqCopy = document.getElementById('btn-lr-request-copy');
  if (btnLrReqCopy) btnLrReqCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-request-out'), btnLrReqCopy));

  // GBP post
  const btnLrPost = document.getElementById('btn-lr-post');
  if (btnLrPost) btnLrPost.addEventListener('click', () => {
    const topic = (document.getElementById('lr-post-topic').value || '').trim();
    if (!topic) { alert('Enter what the post is about.'); return; }
    lrGenerate({ kind: 'gbp-post', topic, postType: document.getElementById('lr-post-type').value }, document.getElementById('lr-post-out'), btnLrPost);
  });
  const btnLrPostCopy = document.getElementById('btn-lr-post-copy');
  if (btnLrPostCopy) btnLrPostCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-post-out'), btnLrPostCopy));

  // Local SEO checklist (self-audit, saved in this browser)
  const LR_CHECKLIST = [
    { group: 'Google Business Profile', items: ['GBP claimed & verified', 'Primary + relevant secondary categories set', 'Complete, accurate hours (including holidays)', '10+ quality photos (interior, exterior, team, clients)', 'Full business description with local keywords', 'Services/products listed on the profile', 'A few Q&As seeded on the profile'] },
    { group: 'Reviews', items: ['Actively requesting reviews from happy clients', 'Responding to every review (good and bad)', 'Maintaining a 4.5★+ average', 'Earning at least one new review per week'] },
    { group: 'Name, address and phone', items: ['Name, address and phone identical on your site, Google, Yelp and Facebook', 'Listed in the top local + industry directories', 'Business name consistent (no keyword stuffing)'] },
    { group: 'On‑site Local Signals', items: ['City/service in your title tags and H1s', 'Business details code on your site', 'Google Map and your address in the footer', 'Dedicated location/service pages for key areas'] }
  ];
  const lrChecklistEl = document.getElementById('lr-checklist');
  function lrLoadChecks() { try { return JSON.parse(localStorage.getItem('seo_local_checklist') || '{}'); } catch (e) { return {}; } }
  function lrSaveChecks(o) { localStorage.setItem('seo_local_checklist', JSON.stringify(o)); }
  function lrRenderChecklist() {
    if (!lrChecklistEl) return;
    const checks = lrLoadChecks();
    let total = 0, done = 0;
    // Sentence case, one row per item, custom box so the tick is legible in
    // both themes. The count moves into the section heading, so you know where
    // you stand before reading a single line.
    lrChecklistEl.innerHTML = LR_CHECKLIST.map((g, gi) =>
      `<div class="sb-check-group">${g.group}</div>` + g.items.map((it, ii) => {
        const id = `c${gi}_${ii}`; total++; const on = !!checks[id]; if (on) done++;
        return `<label class="sb-check-item ${on ? 'done' : ''}"><input type="checkbox" data-cid="${id}" ${on ? 'checked' : ''}><span class="sb-box">&#10003;</span><span>${it}</span></label>`;
      }).join('')
    ).join('');
    const pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('lr-score').innerText = pct + '%';
    document.getElementById('lr-score-fill').style.width = pct + '%';
    document.getElementById('lr-score-label').innerText = `${done} of ${total} complete`;
  }
  if (lrChecklistEl) {
    lrChecklistEl.addEventListener('change', (e) => {
      const cb = e.target;
      if (cb && cb.dataset && cb.dataset.cid) {
        const checks = lrLoadChecks(); checks[cb.dataset.cid] = cb.checked; lrSaveChecks(checks); lrRenderChecklist();
      }
    });
    lrRenderChecklist();
  }


  // --- PERFORMANCE (measurement / ROI) ---
  function perfLineChart(points, opts) {
    opts = opts || {};
    if (!points || !points.length) return '<div class="perf-empty">Not enough data yet — this fills in over time.</div>';
    const w = 560, h = 150, pad = 26;
    const vals = points.map(p => p.value);
    let min = opts.min != null ? opts.min : Math.min(...vals);
    let max = opts.max != null ? opts.max : Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const n = points.length;
    const x = i => pad + (n === 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
    const y = v => h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
    const color = opts.color || 'var(--color-secondary)';
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${color}"/>`).join('');
    const step = Math.max(1, Math.ceil(n / 8));
    const labels = points.map((p, i) => (i % step === 0 || i === n - 1) ? `<text x="${x(i).toFixed(1)}" y="${h - 6}" font-size="9" fill="var(--text-dark)" text-anchor="middle">${p.label}</text>` : '').join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:${h}px;"><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }

  // Paints the measurement card's verdict dot alongside the delta text, so
  // polarity is carried by colour as well as by the sentence. Rank improves as
  // it falls, which is what opts.lowerBetter is for.
  function sbDot(el, tone) {
    const card = el.closest ? el.closest('.sb-metric') : null; if (!card) return;
    const dot = card.querySelector('.sb-dot'); if (!dot) return;
    dot.style.background = tone === 'up' ? 'var(--p4-g)' : tone === 'down' ? 'var(--p2-g)' : 'var(--ink-3)';
  }
  function sbMetricEmpty(valueEl, headline, reason, action) {
    const card = valueEl.closest ? valueEl.closest('.sb-metric') : null;
    valueEl.innerText = headline;
    if (!card) return;
    card.classList.add('empty');
    const u = card.querySelector('.sb-val u'); if (u) u.style.display = 'none';
    const d = card.querySelector('.perf-delta'); if (d) { d.className = 'perf-delta flat'; d.innerText = reason || ''; }
    sbDot(card.querySelector('.sb-val'), 'flat');
    // Only one card offers the fix. Three identical buttons for one cause is
    // noise, and the empty state is meant to give a way forward, not nag.
    let act = card.querySelector('.sb-acts');
    if (action) {
      if (!act) { act = document.createElement('div'); act.className = 'sb-acts'; card.appendChild(act); }
      act.innerHTML = '<button class="btn btn-primary btn-sm" type="button">' + action.label + '</button>';
      act.querySelector('button').addEventListener('click', () => switchTab(action.tab));
    } else if (act) { act.remove(); }
  }
  function sbMetricFilled(valueEl) {
    const card = valueEl.closest ? valueEl.closest('.sb-metric') : null; if (!card) return;
    card.classList.remove('empty');
    const u = card.querySelector('.sb-val u'); if (u) u.style.display = '';
  }
  function perfDelta(el, cur, prev, opts) {
    opts = opts || {};
    if (cur == null || prev == null) { el.className = 'perf-delta flat'; el.innerText = ''; sbDot(el, 'flat'); return; }
    const diff = cur - prev;
    if (Math.abs(diff) < (opts.eps || 0.0001)) { el.className = 'perf-delta flat'; el.innerText = 'no change'; sbDot(el, 'flat'); return; }
    const improved = opts.lowerBetter ? diff < 0 : diff > 0;
    el.className = 'perf-delta ' + (improved ? 'up' : 'down');
    sbDot(el, improved ? 'up' : 'down');
    const arrow = improved ? '▲' : '▼';
    if (opts.lowerBetter) {
      el.innerText = `${arrow} ${Math.abs(diff).toFixed(1)} ${improved ? 'better' : 'worse'} (was ${prev})`;
    } else {
      const pct = prev ? Math.round(Math.abs(diff) / prev * 100) : null;
      el.innerText = `${arrow} ${pct != null ? pct + '% ' : ''}${improved ? 'up' : 'down'} (was ${Number(prev).toLocaleString()})`;
    }
  }

  // --- PERFORMANCE WEEKLY DIGEST ---
  const pdCard = document.getElementById('pd-card');
  const pdBody = document.getElementById('pd-body');
  const pdWhen = document.getElementById('pd-when');
  const pdEnabled = document.getElementById('pd-enabled');
  const pdAutoWrap = document.getElementById('pd-autoemail-wrap');
  const pdAutoEmail = document.getElementById('pd-autoemail');
  const pdRun = document.getElementById('pd-run');
  const pdEmail = document.getElementById('pd-email');
  let pdPollTimer = null;

  function pdAgo(iso) { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; }
  function pdRow(label, valHtml) { return `<div class="pd-row"><span>${label}</span><span>${valHtml}</span></div>`; }
  function pdPct(o) { return (o && o.pct != null) ? ` <span class="${o.pct >= 0 ? 'pd-up' : 'pd-down'}">${o.pct >= 0 ? '+' : ''}${o.pct}%</span>` : ''; }

  function pdRenderDigest(d) {
    if (!pdBody) return;
    if (!d) { pdBody.innerHTML = '<div class="perf-hint">No digest yet — click <b>Generate now</b> to build this week’s recap.</div>'; return; }
    let rows = '';
    if (d.clicks) rows += pdRow('Clicks', `<b>${(d.clicks.cur || 0).toLocaleString()}</b>${pdPct(d.clicks)}`);
    if (d.impressions) rows += pdRow('Impressions', `<b>${(d.impressions.cur || 0).toLocaleString()}</b>${pdPct(d.impressions)}`);
    if (d.avgPosition) rows += pdRow('Avg Google rank', `<b>${d.avgPosition.cur}</b>${d.avgPosition.prev != null ? ` <span class="perf-hint" style="display:inline">(was ${d.avgPosition.prev})</span>` : ''}`);
    if (d.aiVisibility != null) rows += pdRow('AI visibility', `<b>${d.aiVisibility}%</b>`);
    if (d.leads) rows += pdRow('New leads', `<b>${d.leads.current}</b>${d.leads.previous != null ? ` <span class="perf-hint" style="display:inline">(was ${d.leads.previous})</span>` : ''}`);
    if (!rows) rows = '<div class="perf-hint">Connect Search Console in Settings for live numbers in your digest.</div>';
    let kw = '';
    if (d.gainers && d.gainers.length) kw += `<div class="pd-kw"><span class="pd-up">&#9650; Rising:</span> ${d.gainers.map(g => sumEsc(g.query)).join(', ')}</div>`;
    if (d.losers && d.losers.length) kw += `<div class="pd-kw"><span class="pd-down">&#9660; Slipping:</span> ${d.losers.map(g => sumEsc(g.query)).join(', ')}</div>`;
    pdBody.innerHTML = rows + kw;
  }

  function pdRender(s) {
    if (!pdCard) return;
    pdCard.style.display = 'block';
    if (pdEnabled) pdEnabled.checked = !!s.enabled;
    if (pdAutoEmail) pdAutoEmail.checked = !!s.autoEmail;
    if (pdAutoWrap) pdAutoWrap.style.display = s.gmailConfigured ? 'block' : 'none';
    if (pdEmail) pdEmail.style.display = s.gmailConfigured ? 'inline-flex' : 'none';
    if (pdWhen) pdWhen.innerHTML = s.digest
      ? `Last built ${pdAgo(s.digest.generatedAt)}${s.digest.emailedAt ? ` · emailed ${pdAgo(s.digest.emailedAt)}` : ''}${!s.gmailConfigured ? ' · <span style="color:var(--color-secondary)">connect Gmail to auto-email</span>' : ''}`
      : 'A plain-English recap of your week, saved automatically.';
    pdRenderDigest(s.digest);
    const perfTabEl = document.getElementById('performance-tab');
    if (s.digest && s.digest.isNew && perfTabEl && perfTabEl.classList.contains('active')) {
      authFetch('/api/performance-digest/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadPerfDigest() {
    try { const s = await (await fetch('/api/performance-digest')).json(); pdRender(s); if (s.busy) pdPoll(); }
    catch (e) { /* keep last */ }
  }
  window.loadPerfDigest = loadPerfDigest;

  function pdPoll() {
    if (pdPollTimer) return;
    let n = 0;
    if (pdRun) { pdRun.disabled = true; pdRun.innerText = 'Building…'; }
    pdPollTimer = setInterval(async () => {
      n++;
      try {
        const s = await (await fetch('/api/performance-digest')).json();
        pdRender(s);
        if (!s.busy || n > 10) { clearInterval(pdPollTimer); pdPollTimer = null; if (pdRun) { pdRun.disabled = false; pdRun.innerText = 'Generate now'; } }
      } catch (e) { clearInterval(pdPollTimer); pdPollTimer = null; if (pdRun) { pdRun.disabled = false; pdRun.innerText = 'Generate now'; } }
    }, 6000);
  }

  if (pdEnabled) pdEnabled.addEventListener('change', async () => { try { await authFetch('/api/performance-digest/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: pdEnabled.checked }) }); } catch (e) { alert('Could not update: ' + e.message); } });
  if (pdAutoEmail) pdAutoEmail.addEventListener('change', async () => { try { await authFetch('/api/performance-digest/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoEmail: pdAutoEmail.checked }) }); } catch (e) { alert('Could not update: ' + e.message); } });
  if (pdRun) pdRun.addEventListener('click', async () => { pdRun.disabled = true; pdRun.innerText = 'Starting…'; try { const r = await authFetch('/api/performance-digest/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await r.json(); setTimeout(pdPoll, 1200); } catch (e) { alert('Error: ' + e.message); pdRun.disabled = false; pdRun.innerText = 'Generate now'; } });
  if (pdEmail) pdEmail.addEventListener('click', async () => { pdEmail.disabled = true; const o = pdEmail.innerText; pdEmail.innerText = 'Sending…'; try { const r = await authFetch('/api/performance-digest/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const d = await r.json(); if (d.needsSetup) { alert(d.message); } else if (!r.ok || !d.success) { throw new Error(d.error || 'Send failed'); } else { pdEmail.innerText = 'Sent ✓'; setTimeout(() => { pdEmail.innerText = o; pdEmail.disabled = false; }, 1600); return; } } catch (e) { alert('Email error: ' + e.message); } pdEmail.disabled = false; pdEmail.innerText = o; });

  async function loadPerformance() {
    const $ = id => document.getElementById(id);
    if (!$('perf-updated')) return;
    try {
      const res = await fetch('/api/performance');
      const d = await res.json();
      $('perf-updated').innerText = new Date().toLocaleTimeString();
      const badge = $('perf-badge');
      if (d.source === 'live_gsc') { badge.className = 'perf-badge live'; badge.innerText = 'Live Search Console'; }
      else { badge.className = 'perf-badge demo'; badge.innerText = 'Search Console not connected'; }

      const cur = d.current, prev = d.previous;
      if (cur && prev) {
        ['perf-impr', 'perf-clicks', 'perf-rank'].forEach(id => sbMetricFilled($(id)));
        $('perf-impr').innerText = cur.impressions.toLocaleString(); perfDelta($('perf-impr-d'), cur.impressions, prev.impressions, {});
        $('perf-clicks').innerText = cur.clicks.toLocaleString(); perfDelta($('perf-clicks-d'), cur.clicks, prev.clicks, {});
        $('perf-rank').innerText = cur.avgPosition; perfDelta($('perf-rank-d'), cur.avgPosition, prev.avgPosition, { lowerBetter: true, eps: 0.05 });
      } else {
        // A bare em-dash told the owner nothing and offered no way forward.
        const why = 'Search Console isn\u2019t connected — about 5 minutes.';
        sbMetricEmpty($('perf-impr'), 'Not measured yet', why, { label: 'Connect it', tab: 'settings-tab' });
        sbMetricEmpty($('perf-clicks'), 'Not measured yet', why);
        sbMetricEmpty($('perf-rank'), 'Not measured yet', why);
      }

      const leads = d.leads;
      if (leads && leads.available) {
        sbMetricFilled($('perf-leads'));
        $('perf-leads').innerText = leads.current; perfDelta($('perf-leads-d'), leads.current, leads.previous, {});
        $('perf-leads-note').innerText = 'new leads' + (leads.approx ? ' (approx.)' : '');
      } else {
        sbMetricEmpty($('perf-leads'), 'Not measured yet', (leads && leads.reason) ? leads.reason : 'GoHighLevel isn\u2019t connected.', { label: 'Connect it', tab: 'settings-tab' });
      }

      // Branded search — real Tier-1 AI-visibility signal (from GSC)
      const br = d.brandedSearch;
      if (br && br.available && br.current) {
        sbMetricFilled($('perf-branded'));
        $('perf-branded').innerText = (br.current.impressions || 0).toLocaleString();
        perfDelta($('perf-branded-d'), br.current.impressions, br.previous ? br.previous.impressions : null, {});
        $('perf-branded-note').innerText = `${(br.current.clicks || 0).toLocaleString()} clicks. Rising means AI is driving awareness.`;
      } else {
        sbMetricEmpty($('perf-branded'), 'Not measured yet', (br && br.reason) ? br.reason : 'Search Console isn\u2019t connected.');
        $('perf-branded-note').innerText = '';
      }

      // AI referral traffic — honest "not connected" state (needs GA4; never fabricated)
      const ar = d.aiReferral;
      if (ar && ar.available && ar.current != null) {
        sbMetricFilled($('perf-airef'));
        $('perf-airef').innerText = Number(ar.current).toLocaleString();
        $('perf-airef-note').innerText = 'Visits from ChatGPT, Perplexity & Claude.';
      } else {
        sbMetricEmpty($('perf-airef'), 'Not measured yet', '');
        $('perf-airef-note').innerText = (ar && ar.reason) ? ar.reason : 'Connect Google Analytics (GA4) to track this.';
      }

      const g = (d.movers && d.movers.gainers) || [], l = (d.movers && d.movers.losers) || [];
      $('perf-gainers').innerHTML = g.length ? g.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="up">▲ ${m.posChange} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear gainers this period yet.</div>';
      $('perf-losers').innerHTML = l.length ? l.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="down">▼ ${Math.abs(m.posChange)} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear drops this period. </div>';

      const aio = d.aioTrend || [];
      $('perf-aio-chart').innerHTML = aio.length
        ? perfLineChart(aio.map(p => ({ label: p.date.slice(5), value: p.rate })), { min: 0, max: 100, color: 'var(--color-secondary)' }) + `<div class="perf-kpi-note" style="text-align:right;">latest: ${aio[aio.length - 1].rate}% recommended</div>`
        : '<div class="perf-empty">Run AI Search Audits over time to build this trend.</div>';

      const snaps = d.snapshots || [];
      if (snaps.length >= 2) {
        $('perf-snap-chart').innerHTML = perfLineChart(snaps.map(s => ({ label: s.date.slice(5), value: s.impressions })), { color: 'var(--color-primary)' }) + `<div class="perf-kpi-note" style="text-align:right;">${snaps.length} days recorded · impressions/day</div>`;
      } else if (snaps.length === 1) {
        $('perf-snap-chart').innerHTML = `<div class="perf-empty">First snapshot captured (${snaps[0].date}). The trend line appears once there are at least two days of data — check back tomorrow.</div>`;
      } else {
        $('perf-snap-chart').innerHTML = '<div class="perf-empty">No snapshots yet. Connect Search Console, then this records automatically each day.</div>';
      }
    } catch (e) { /* silent */ }
  }

  const perfRefreshBtn = document.getElementById('perf-refresh');
  if (perfRefreshBtn) perfRefreshBtn.addEventListener('click', loadPerformance);
  // Load once on startup too, so the daily snapshot is captured even if the
  // user stays on other tabs.
  loadPerformance();


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

  // --- SEO BUDDY ASSISTANT (grounded copilot) ---
  (function () {
    const fab = document.getElementById('asst-fab');
    const panel = document.getElementById('asst-panel');
    const closeBtn = document.getElementById('asst-close');
    const msgsEl = document.getElementById('asst-msgs');
    const textEl = document.getElementById('asst-text');
    const sendBtn = document.getElementById('asst-send');
    if (!fab || !panel) return;
    const history = [];        // {role:'user'|'assistant', content}
    let greeted = false, busy = false;
    const esc = s => { const d = document.createElement('div'); d.innerText = s == null ? '' : String(s); return d.innerHTML; };
    const BOT_AV = '<span class="asst-bav"><svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg></span>';

    function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }
    function addUser(text) {
      const r = document.createElement('div'); r.className = 'asst-row me';
      r.innerHTML = `<div class="asst-bub">${esc(text)}</div>`;
      msgsEl.appendChild(r); scrollDown();
    }
    function fmt(text) { return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
    function addBot(html, chips, action) {
      const r = document.createElement('div'); r.className = 'asst-row bot';
      let inner = `<div class="asst-botwrap"><div class="asst-bub">${html}</div>`;
      if (chips && chips.length) inner += `<div class="asst-chips">${chips.map(c => `<button class="asst-chip" type="button" data-send="${esc(c.send || c.label)}"${c.tour ? ' data-tour="1"' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
      inner += `</div>`;
      r.innerHTML = BOT_AV + inner;
      msgsEl.appendChild(r); scrollDown();
      r.querySelectorAll('.asst-chip').forEach(ch => ch.addEventListener('click', () => {
        send(ch.dataset.send);
      }));
      if (action && (action.endpoint || action.clientAction)) renderAction(r.querySelector('.asst-botwrap'), action);
    }
    function replaceBtns(card, html) { const b = card.querySelector('.asst-action-btns'); if (b) b.outerHTML = html; }
    function htmlToText(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim(); }
    // After a confirm succeeds, some actions produce a follow-up card from the response.
    const CHAIN = {
      write_article: d => (d && d.content) ? { kind: 'content', id: 'publish_article', title: `Publish “${String(d.title || 'your article').slice(0, 60)}”`, preview: htmlToText(d.content).slice(0, 220) + '…', confirmLabel: 'Publish it', endpoint: '/api/publish-ghl', method: 'POST', body: { title: d.title, content: d.content, status: 'published', keyword: d.title }, tab: 'publish-tab', done: 'Published to your site.' } : null,
      publish_article: d => (d && d.url) ? { kind: 'run', id: 'index_article', title: 'Ask Google to index it', note: `Live at ${d.url}. Request indexing so it shows up in search faster.`, confirmLabel: 'Request indexing', endpoint: '/api/index-url', method: 'POST', body: { url: d.url }, tab: 'publish-tab', done: 'Google indexing requested.' } : null,
      draft_citation_pitch: d => (d && (d.body || d.subject)) ? { kind: 'email', id: 'send_pitch', title: 'Send this pitch', to: d.email || '', subject: d.subject || '', previewBody: d.body || '', contactUrl: d.contactUrl || '', confirmLabel: 'Send via Gmail', endpoint: '/api/send-pitch', method: 'POST', body: { to: d.email || '', subject: d.subject || '', body: d.body || '' }, tab: 'citations-tab', done: 'Pitch sent via Gmail.' } : null
    };
    function renderAction(wrap, action) {
      const card = document.createElement('div'); card.className = 'asst-action';
      const icon = (action.kind === 'content' || action.kind === 'email') ? '&#9998;' : '&#9889;';
      let html = `<div class="asst-action-h">${icon} ${esc(action.title)}</div>`;
      if (action.kind === 'email') {
        html += `<div class="asst-action-body">` +
          `<div style="color:var(--text-dark);font-size:11px;">TO</div><div style="color:var(--text-main);margin-bottom:6px;">${esc(action.to || '(no address found — use the contact page)')}</div>` +
          `<div style="color:var(--text-dark);font-size:11px;">SUBJECT</div><div style="color:var(--text-main);margin-bottom:6px;">${esc(action.subject)}</div>` +
          `<div style="color:var(--text-dark);font-size:11px;">MESSAGE</div><div class="preview" style="font-style:italic;">${esc(action.previewBody)}</div></div>`;
      } else if (action.kind === 'content' && action.preview) { html += `<div class="asst-action-body preview">${esc(action.preview)}</div>`; }
      else if (action.note) { html += `<div class="asst-action-body">${esc(action.note)}</div>`; }
      const canCopy = action.kind === 'content' || action.kind === 'email';
      const contactLink = (action.kind === 'email' && action.contactUrl) ? `<a class="asst-btn" href="${esc(action.contactUrl)}" target="_blank" rel="noopener" style="text-decoration:none;">Contact page</a>` : '';
      html += `<div class="asst-action-btns"><button class="asst-btn primary" data-act="go" type="button">${esc(action.confirmLabel)}</button>${canCopy ? '<button class="asst-btn" data-act="copy" type="button">Copy</button>' : ''}${contactLink}<button class="asst-btn" data-act="cancel" type="button">Cancel</button></div>`;
      card.innerHTML = html;
      wrap.appendChild(card); scrollDown();
      card.querySelector('[data-act="cancel"]').addEventListener('click', () => replaceBtns(card, '<div class="asst-result" style="color:var(--text-dark)">Cancelled — nothing happened.</div>'));
      const copyBtn = card.querySelector('[data-act="copy"]');
      if (copyBtn) copyBtn.addEventListener('click', () => { try { navigator.clipboard.writeText(action.kind === 'email' ? (action.previewBody || '') : (action.preview || '')); } catch (e) {} copyBtn.innerText = 'Copied ✓'; });
      card.querySelector('[data-act="go"]').addEventListener('click', async (e) => {
        const go = e.currentTarget; go.disabled = true; go.innerText = 'Working…';
        try {
          // Client-side actions (e.g. build a PDF) run in the browser, no endpoint.
          if (action.clientAction === 'pdf') {
            if (window.generateSeoReportPdf) await window.generateSeoReportPdf();
            replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}</div>`);
            return;
          }
          const r = await authFetch(action.endpoint, { method: action.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.body || {}) });
          const d = await r.json().catch(() => ({}));
          if (d && d.budgetReached) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(d.message || 'Monthly usage budget reached.')}</div>`); return; }
          if (d && d.needsSetup) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(d.message || 'This needs a quick setup first.')}${canCopy ? ' Your draft is above — copy it to use it now.' : ''}</div>`); return; }
          if (!r.ok || d.success === false) throw new Error((d && d.error) || "It didn't go through.");
          const next = CHAIN[action.id] ? CHAIN[action.id](d) : null;
          if (next) { replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}</div>`); renderAction(card.parentElement, next); return; }
          const link = action.tab ? ` <a data-open="${esc(action.tab)}">Open the tab &rarr;</a>` : '';
          replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}${link}</div>`);
          const a = card.querySelector('a[data-open]'); if (a) a.addEventListener('click', () => { close(); if (window.__switchTab) window.__switchTab(a.dataset.open); });
        } catch (err) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(err.message)}</div>`); }
      });
    }
    let typingRow = null;
    function showTyping() { typingRow = document.createElement('div'); typingRow.className = 'asst-row bot'; typingRow.innerHTML = BOT_AV + '<div class="asst-typing"><span></span><span></span><span></span></div>'; msgsEl.appendChild(typingRow); scrollDown(); }
    function hideTyping() { if (typingRow) { typingRow.remove(); typingRow = null; } }

    function greet() {
      if (greeted) return; greeted = true;
      addBot("Hi! I can see everything in your SEO Buddy. Ask me how you're doing, what to fix next, or how a tool works.", [
        { label: 'How am I doing?' },
        { label: 'Who’s beating me in AI?', send: "Who's beating me in AI search right now?" },
        { label: 'What should I fix first?' }
      ]);
    }
    async function send(text) {
      text = (text || textEl.value || '').trim();
      if (!text || busy) return;
      textEl.value = ''; textEl.style.height = 'auto';
      addUser(text); history.push({ role: 'user', content: text });
      busy = true; sendBtn.disabled = true; showTyping();
      try {
        const r = await authFetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12) }) });
        const d = await r.json();
        hideTyping();
        if (!r.ok || !d.success) throw new Error(d.error || 'Something went wrong.');
        const reply = d.reply || "I'm not sure how to answer that.";
        addBot(fmt(reply), null, d.action);
        history.push({ role: 'assistant', content: reply });
      } catch (e) {
        hideTyping();
        addBot(esc('Sorry — I hit a snag: ' + e.message + ' (If the app is password-protected, enter it in Settings.)'));
      } finally { busy = false; sendBtn.disabled = false; textEl.focus(); }
    }
    function open() { panel.classList.add('open'); document.body.classList.add('asst-open'); fab.style.display = 'none'; greet(); setTimeout(() => textEl.focus(), 50); }
    function close() { panel.classList.remove('open'); document.body.classList.remove('asst-open'); fab.style.display = 'inline-flex'; }

    fab.addEventListener('click', open);
    // Starter questions in the dock. They teach people what the assistant can
    // answer, which a bare bubble never did.
    document.querySelectorAll('.sb-dock-wrap .sb-chip').forEach(chip => {
      chip.addEventListener('click', () => { open(); setTimeout(() => send(chip.dataset.ask || chip.textContent.trim()), 260); });
    });
    closeBtn.addEventListener('click', close);
    sendBtn.addEventListener('click', () => send());
    textEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    textEl.addEventListener('input', () => { textEl.style.height = 'auto'; textEl.style.height = Math.min(textEl.scrollHeight, 90) + 'px'; });
  })();

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

  // --- PDF REPORT (client-side, jsPDF) ---
  // Rewritten to mirror the Progress page rather than sample it. The old report
  // pulled five endpoints and printed four sections, so most of what the page
  // shows — autopilot activity, movers, opportunities, published content,
  // branded search, leads, AI referrals, the digest — never reached the reader.
  // It also used the pre-redesign indigo/cyan, which no longer exists anywhere
  // in the app.
  //
  // Rule for every section: never go silently blank. If a number is missing,
  // print the API's own reason for it, because "Not measured" plus the cause is
  // information and an empty space is not.
  let pdfLibrariesPromise = null;
  function loadScriptOnce(src) {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }
  function ensurePdfLibraries() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (!pdfLibrariesPromise) {
      pdfLibrariesPromise = loadScriptOnce('/jspdf.umd.min.js')
        .then(() => loadScriptOnce('/jspdf.plugin.autotable.min.js'))
        .catch(error => { pdfLibrariesPromise = null; throw error; });
    }
    return pdfLibrariesPromise;
  }

  async function generateSeoReportPdf() {
    await ensurePdfLibraries();
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('The PDF library is still loading — try again in a moment.'); return; }
    const { jsPDF } = window.jspdf;
    const g = (u) => fetch(u).then(r => r.json()).catch(() => null);
    const [hs, av, perf, nmRaw, bp, gsc, hist, aio, dig, ap] = await Promise.all([
      g('/api/health-score'), g('/api/ai-visibility'), g('/api/performance'),
      g('/api/next-moves'), g('/api/business-profile'), g('/api/gsc-data'),
      g('/api/history'), g('/api/aio-history'), g('/api/performance-digest'),
      g('/api/autopilot-status')
    ]);

    const prof    = (bp && bp.profile) || {};
    const bizName = prof.name || 'Best Day Fitness';
    const domain  = (prof.website || 'bestdayfitness.com').replace(/^https?:\/\//, '');
    const today   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const gscData = (gsc && Array.isArray(gsc.data)) ? gsc.data : [];
    const history = Array.isArray(hist) ? hist : [];
    const audits  = Array.isArray(aio) ? aio : [];

    // Brand palette, matching the app.
    const NAVY = [0, 0, 117], INK = [17, 31, 50], MUT = [91, 100, 114], LINE = [231, 228, 221];
    const P = { found:[34,34,155], local:[166,91,0], ai:[0,112,143], listed:[5,116,95], fresh:[138,98,0] };
    const OK = [5, 116, 95], WARN = [166, 91, 0];

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const L = 40, R = W - 40, CW = R - L;
    let y = 0;

    const need = (px) => { if (y + px > H - 56) { doc.addPage(); y = 56; } };
    const h2 = (t) => {
      // Reserve room for the heading AND the first rows under it, otherwise a
      // heading strands itself at the bottom of a page.
      need(140); y += 6;
      doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(t, L, y); y += 6;
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(1); doc.line(L, y, R, y); y += 16;
    };
    const note = (t, color) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, color || MUT);
      const lines = doc.splitTextToSize(t, CW);
      need(lines.length * 13 + 8);
      doc.text(lines, L, y); y += lines.length * 13 + 8;
    };
    const table = (head, body, opts) => {
      if (!body.length) return;
      need(60);
      doc.autoTable(Object.assign({
        startY: y, theme: 'grid', margin: { left: L, right: 40 },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: LINE, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
        alternateRowStyles: { fillColor: [250, 249, 246] }
      }, opts || {}, { head: [head], body: body }));
      y = doc.lastAutoTable.finalY + 18;
    };
    const num = (v) => (v == null ? '—' : Number(v).toLocaleString());

    // ---------------- cover band ----------------
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 104, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(21);
    doc.text('Progress report', L, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(bizName + '  ·  ' + domain, L, 68);
    doc.setFontSize(9.5);
    doc.text('Last 28 days vs the previous 28 days  ·  ' + today, L, 86);
    y = 132;

    // ---------------- at a glance ----------------
    const score    = (hs && hs.overall != null) ? hs.overall : null;
    const measured = hs ? (hs.measuredCount + ' of ' + hs.totalPillars) : '—';
    const leaks    = gscData.filter(d => d.leak);
    const leakImpr = leaks.reduce((s, d) => s + (d.impressions || 0), 0);
    const submitted = history.filter(h => /requested|indexed/i.test(h.indexed || '')).length;
    const recRate  = audits.length
      ? Math.round((audits.filter(a => a.recommended).length / audits.length) * 100) : null;

    doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('At a glance', L, y); y += 4;
    doc.setDrawColor.apply(doc, LINE); doc.line(L, y, R, y); y += 20;

    const tiles = [
      ['Visibility score', score != null ? String(score) : '—',
        (hs && hs.delta != null && hs.delta !== 0 ? (hs.delta > 0 ? '+' : '') + hs.delta + ' in 28 days' : 'no change in 28 days')],
      ['Areas measured', measured, 'the rest are unknown, not zero'],
      ['Search opportunities', String(leaks.length), leaks.length ? '~' + leakImpr.toLocaleString() + ' impressions behind' : 'none detected yet'],
      ['Pages published', String(history.length), submitted + ' sent to Google']
    ];
    const tw = CW / 4;
    tiles.forEach((t, i) => {
      const x = L + i * tw;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUT);
      doc.text(String(t[0]).toUpperCase(), x, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor.apply(doc, NAVY);
      doc.text(t[1], x, y + 24);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUT);
      doc.text(doc.splitTextToSize(t[2], tw - 10), x, y + 38);
    });
    y += 66;
    // The single most important caveat in the whole document.
    if (hs && hs.measuredCount < hs.totalPillars) {
      doc.setFillColor(253, 240, 221); doc.setDrawColor(242, 227, 200);
      const msg = 'Your score of ' + (score != null ? score : '—') + ' is an average of the '
        + hs.measuredCount + ' area' + (hs.measuredCount === 1 ? '' : 's') + ' we can currently see. '
        + (hs.totalPillars - hs.measuredCount) + ' of ' + hs.totalPillars
        + ' are unmeasured — treat them as unknown rather than as zero or as passing.';
      // Set the size BEFORE measuring. splitTextToSize wraps at the CURRENT font
      // size, and the tile loop above leaves it at 7.5pt — wrapping there and
      // then printing at 9pt overflowed the box on every line.
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const ml = doc.splitTextToSize(msg, CW - 24);
      need(ml.length * 12 + 26);
      doc.setFillColor(253, 240, 221); doc.setDrawColor(242, 227, 200);
      doc.roundedRect(L, y, CW, ml.length * 12 + 20, 6, 6, 'FD');
      doc.setTextColor(107, 77, 9);
      doc.text(ml, L + 12, y + 15); y += ml.length * 12 + 34;
    }

    // ---------------- pillars ----------------
    if (hs && Array.isArray(hs.pillars) && hs.pillars.length) {
      h2('The five areas we score');
      table(['Area', 'Weight', 'Score', 'What it says'],
        hs.pillars.map(p => [p.label, p.weight + '%',
          p.measured ? (p.score + '/100') : 'Not measured', p.detail || '']),
        { columnStyles: { 1: { cellWidth: 46 }, 2: { cellWidth: 66 } } });
    }

    // ---------------- search performance ----------------
    h2('Search performance');
    if (perf && perf.current && perf.source === 'live_gsc') {
      const c = perf.current, pv = perf.previous || {};
      const d = (a, b) => (b == null || a == null) ? '' : ((a - b >= 0 ? '+' : '') + Number(a - b).toLocaleString());
      table(['Measure', 'Last 28 days', 'Previous 28', 'Change'], [
        ['Times you appeared in search', num(c.impressions), num(pv.impressions), d(c.impressions, pv.impressions)],
        ['Clicks to your site', num(c.clicks), num(pv.clicks), d(c.clicks, pv.clicks)],
        ['Average Google rank', String(c.avgPosition), pv.avgPosition == null ? '—' : String(pv.avgPosition),
          (pv.avgPosition == null ? '' : (c.avgPosition - pv.avgPosition <= 0 ? 'improved' : 'slipped'))]
      ], { columnStyles: { 0: { fontStyle: 'bold' } } });
    } else {
      note('Not measured. Search Console is not connected, so rankings, clicks and impressions '
         + 'cannot be read. This is the biggest single area of the score at 25%, and connecting it '
         + 'takes about five minutes in Settings.', WARN);
    }

    // ---------------- business impact ----------------
    h2('Business impact');
    const impact = [];
    const row = (label, obj, fmt) => {
      if (!obj) { impact.push([label, '—', 'No data returned.']); return; }
      if (obj.available === false) impact.push([label, 'Not measured', obj.reason || '']);
      else impact.push([label, fmt ? fmt(obj) : num(obj.value), obj.note || '']);
    };
    row('Leads from search', perf && perf.leads);
    row('Branded searches', perf && perf.brandedSearch);
    row('Visits from AI answers', perf && perf.aiReferral);
    table(['Measure', 'Value', 'Why'], impact, { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 }, 1: { cellWidth: 78 } } });

    // ---------------- AI visibility ----------------
    h2('Where you stand in AI search');
    const vis = av && av.latest;
    if (vis) {
      table(['Measure', 'Value'], [
        ['Visibility score', vis.visibilityScore + '%'],
        ['Share of voice', vis.shareOfVoice + '%'],
        ['Sentiment', vis.sentimentScore == null ? '—' : String(vis.sentimentScore)]
      ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } } });
      const lb = (vis.leaderboard || []).slice(0, 8);
      if (lb.length) {
        table(['#', 'Who AI recommends', 'Score'],
          lb.map((l, i) => [String(i + 1), l.name + (l.isBrand ? '  (you)' : ''), l.score + '%']),
          { columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 56 } } });
      }
    } else if (audits.length) {
      note('Across ' + audits.length + ' audit' + (audits.length === 1 ? '' : 's') + ' so far, AI recommended '
         + bizName + ' in ' + recRate + '% of the searches checked.');
    } else {
      note('Not measured. No AI visibility audit has been run yet, so there is nothing to say about '
         + 'whether ChatGPT, Gemini or Google’s AI answers name you. An audit takes about a minute.', WARN);
    }

    // ---------------- movers ----------------
    const movers = (perf && perf.movers) || {};
    const gain = movers.gainers || [], lose = movers.losers || [];
    if (gain.length || lose.length) {
      h2('Biggest movers');
      table(['Direction', 'Search term', 'Rank change'],
        gain.slice(0, 6).map(m => ['Improved', m.query || m.term || '', String(m.change ?? m.delta ?? '')])
          .concat(lose.slice(0, 6).map(m => ['Slipped', m.query || m.term || '', String(m.change ?? m.delta ?? '')])),
        { columnStyles: { 0: { cellWidth: 62 }, 2: { cellWidth: 74 } } });
    }

    // ---------------- opportunities ----------------
    h2('Your biggest opportunities');
    if (leaks.length) {
      note('Searches where you already appear but get no clicks. These are the pages worth creating next.');
      table(['Search term', 'Monthly impressions', 'Your rank'],
        leaks.slice().sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10)
          .map(d => [d.query || '', num(d.impressions), d.position == null ? '—' : String(Math.round(d.position))]),
        { columnStyles: { 1: { cellWidth: 108 }, 2: { cellWidth: 62 } } });
    } else {
      note('None detected. Connect Search Console to surface the searches you appear in but get nothing from.', WARN);
    }

    // ---------------- content ----------------
    h2('Content you have launched');
    if (history.length) {
      table(['Page', 'Submitted to Google'],
        history.slice(0, 12).map(h => [h.title || h.keyword || 'Untitled page',
          /requested|indexed/i.test(h.indexed || '') ? 'Yes' : 'Not yet']),
        { columnStyles: { 1: { cellWidth: 120 } } });
    } else {
      note('Nothing published through SEO Buddy yet.');
    }

    // ---------------- autopilot ----------------
    h2('What SEO Buddy handled on its own');
    if (ap) {
      const nxt = ap.nextRunTime ? new Date(ap.nextRunTime).toLocaleString('en-US',
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
      table(['Setting', 'Value'], [
        ['Autopilot', ap.enabled ? 'On' : 'Off'],
        ['Runs every', ap.intervalHours ? Math.round(ap.intervalHours / 24) + ' day(s)' : '—'],
        ['Next run', nxt],
        ['Queued jobs', String((ap.queue || []).length)],
        ['Targets being watched', String((ap.targets || []).length)]
      ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } } });
      const logs = (ap.logs || []).slice(0, 8);
      if (logs.length) {
        table(['Recent activity'], logs.map(l => [String(l.message || l.text || l).slice(0, 150)]), {});
      }
    } else {
      note('Autopilot status unavailable.');
    }

    // ---------------- digest ----------------
    if (dig && dig.digest && dig.digest.text) {
      h2('This week in plain English');
      note(String(dig.digest.text).replace(/\s*\n\s*/g, '\n').trim(), INK);
    }

    // ---------------- next moves ----------------
    const moves = Array.isArray(nmRaw) ? nmRaw : (nmRaw && nmRaw.moves) || [];
    if (moves.length) {
      h2('What to do next');
      table(['Priority', 'Action', 'Why it matters'],
        moves.slice(0, 8).map(m => [(m.impact || '').toUpperCase(), m.title || '', m.why || '']),
        { columnStyles: { 0: { cellWidth: 62 } } });
    }

    // ---------------- how to read this ----------------
    h2('How to read this report');
    note('The visibility score is an average of only the areas we can currently measure, weighted by '
       + 'importance: Found on Google 25%, Local listings 20%, AI recommends you 20%, Get listed 20%, '
       + 'Fresh content 15%. An unmeasured area is not a zero and not a pass — it is unknown, and '
       + 'connecting it is usually the fastest way to move the number. Anything marked "Not measured" '
       + 'above lists the reason and what to connect.');

    // ---------------- footer ----------------
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE); doc.line(L, H - 38, R, H - 38);
      doc.setFontSize(8); doc.setTextColor.apply(doc, MUT); doc.setFont('helvetica', 'normal');
      doc.text(bizName + '  ·  generated by SEO Buddy  ·  ' + today, L, H - 24);
      doc.text('Page ' + i + ' of ' + pages, R, H - 24, { align: 'right' });
    }
    const fname = bizName.replace(/[^a-z0-9]+/gi, '-') + '-Progress-Report-'
      + new Date().toISOString().slice(0, 10) + '.pdf';
    doc.save(fname);
    return fname;
  }
  window.generateSeoReportPdf = generateSeoReportPdf;
  const pdfBtn = document.getElementById('perf-download-pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true; const o = pdfBtn.innerHTML; pdfBtn.innerHTML = 'Building…';
    try { await generateSeoReportPdf(); } catch (e) { alert('Could not build the PDF: ' + e.message); }
    finally { pdfBtn.disabled = false; pdfBtn.innerHTML = o; }
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

  // ===========================================================================
  // REVIEWS SITE — inventory, growth, and structured-data health
  // Everything is derived server-side from the live reviews page, so this needs
  // no extra credentials and works today.
  // ===========================================================================
  let reviewsData = null;

  function rvNum(n) { return (n == null) ? '—' : String(n); }

  function rvGrowthChart(series) {
    if (!series || series.length < 2) return '<div class="rv-empty">Not enough dated reviews to draw a trend yet.</div>';
    const W = 640, H = 210, PL = 34, PR = 10, PT = 12, PB = 26;
    const max = Math.max(...series.map(p => p.total)) || 1;
    const x = i => PL + (i * (W - PL - PR)) / Math.max(1, series.length - 1);
    const y = v => PT + (H - PT - PB) * (1 - v / max);

    const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
    const area = `${line} L${x(series.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

    // Horizontal gridlines at 0 / half / max, labelled.
    const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
    const grid = ticks.map(v =>
      `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
      `<text class="lbl" x="${PL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join('');

    // Label at most six months so the axis never turns to mush.
    const step = Math.ceil(series.length / 6);
    const xlabels = series.map((p, i) =>
      (i % step === 0 || i === series.length - 1)
        ? `<text class="lbl" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.month}</text>` : '').join('');

    const dots = series.map((p, i) => p.added
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.total).toFixed(1)}" r="3" fill="var(--color-primary)"><title>${p.month}: +${p.added} → ${p.total} total</title></circle>` : '').join('');

    return `<svg class="rv-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Cumulative published reviews by month">
      <defs><linearGradient id="rvFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity=".35"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#rvFill)"/>
      <path d="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}${xlabels}
    </svg>`;
  }

  function renderReviews(d) {
    const inv = d.inventory || {};
    const totals = d.platformTotals || {};
    const reach = ['google', 'facebook', 'yelp'].reduce((s, k) => s + (totals[k]?.reviewCount || 0), 0);

    const deltaTxt = inv.delta30 == null
      ? 'tracking starts from today'
      : (inv.delta30 > 0 ? `+${inv.delta30} in the last 30 days` : (inv.delta30 === 0 ? 'no change in 30 days' : `${inv.delta30} in the last 30 days`));

    // Measurement cards, same as Progress. Every number gets a unit, a pillar,
    // and a verdict rather than an unlabelled accent colour.
    const kpis = [
      { pillar: 'p2', label: 'Local listings', value: rvNum(inv.published), unit: 'published reviews', sub: deltaTxt,
        tone: inv.delta30 > 0 ? 'up' : (inv.delta30 < 0 ? 'down' : 'flat') },
      { pillar: 'p2', label: 'Local listings', value: inv.avgRating != null ? inv.avgRating.toFixed(1) : null, unit: 'average rating',
        sub: inv.newest ? `Newest review ${inv.newest}.` : 'No dated reviews yet.', tone: 'flat',
        empty: 'Not measured yet', why: 'No ratings found on your reviews page.' },
      { pillar: 'p4', label: 'Get listed', value: reach ? String(reach) : null, unit: 'reviews across platforms',
        sub: 'Google, Facebook and Yelp combined.', tone: 'flat',
        empty: 'Not measured yet', why: 'No platform totals available yet.' },
      { pillar: 'p1', label: 'Found on Google', value: d.score != null ? d.score : null, unit: '/ 100 page health',
        sub: d.problems ? `${d.problems} thing${d.problems === 1 ? '' : 's'} to fix.` : 'Everything is passing.',
        tone: d.problems ? 'down' : 'up', empty: 'Not measured yet', why: 'We could not read your reviews page.' }
    ];
    const dotFor = t => t === 'up' ? 'var(--p4-g)' : t === 'down' ? 'var(--p2-g)' : 'var(--ink-3)';
    document.getElementById('rv-kpis').innerHTML = kpis.map(k => k.value == null
      ? `<div class="sb-metric empty ${k.pillar}">
           <div class="sb-top"><span class="sb-pill ${k.pillar}">${k.label}</span></div>
           <div class="sb-val">${k.empty}</div>
           <div class="sb-verdict"><i class="sb-dot" style="background:var(--ink-3)"></i>${k.why}</div>
         </div>`
      : `<div class="sb-metric ${k.pillar}">
           <div class="sb-top"><span class="sb-pill ${k.pillar}">${k.label}</span></div>
           <div class="sb-val">${k.value}<u>${k.unit}</u></div>
           <div class="sb-verdict"><i class="sb-dot" style="background:${dotFor(k.tone)}"></i>${k.sub}</div>
         </div>`).join('');

    document.getElementById('rv-growth').innerHTML = rvGrowthChart(d.growth);

    const NICE = { google: 'Google', facebook: 'Facebook', yelp: 'Yelp' };
    const split = ['google', 'facebook', 'yelp'].map(k => {
      const shown = (inv.byPlatform || {})[k] || 0;
      const total = totals[k]?.reviewCount || 0;
      if (!shown && !total) return '';
      const pct = total ? Math.min(100, Math.round((shown / total) * 100)) : 0;
      const note = k === 'yelp' && !shown
        ? 'counts only — Yelp\'s API returns truncated excerpts, never full reviews'
        : `${shown} of ${total || '—'} published`;
      return `<li>
        <div class="rv-split-top"><span>${NICE[k]}</span><span class="rv-split-val">${note}</span></div>
        <div class="rv-split-track"><div class="rv-split-fill" style="width:${pct}%"></div></div>
      </li>`;
    }).join('');
    document.getElementById('rv-split').innerHTML = split || '<li class="rv-empty">No platform data found on the page.</li>';

    const order = { fail: 0, unknown: 1, pass: 2 };
    const checks = (d.checks || []).slice().sort((a, b) => order[a.status] - order[b.status]);
    document.getElementById('rv-checks').innerHTML = checks.length ? checks.map(c => {
      const cls = c.status === 'pass' ? 'pass' : c.status === 'unknown' ? 'unknown' : (c.severity === 'warn' ? 'warn' : 'fail');
      const glyph = c.status === 'pass' ? '✓' : c.status === 'unknown' ? '?' : '!';
      return `<li><div class="rv-ck ${cls}">${glyph}</div><div><div class="rv-ck-b">${uiEsc(c.label)}</div><div class="rv-ck-d">${uiEsc(c.detail || '')}</div></div></li>`;
    }).join('') : '<li class="rv-empty">No checks returned.</li>';

    const link = document.getElementById('rv-url');
    if (link) { link.href = safeExternalUrl(d.url); link.rel = 'noopener noreferrer'; link.textContent = (d.url || '').replace(/^https?:\/\//, ''); }
    const chip = document.getElementById('rv-checked');
    if (chip) {
      chip.textContent = d.checkedAt ? `checked ${new Date(d.checkedAt).toLocaleString()}` : '—';
      chip.className = 'rv-pill ' + (d.problems ? 'bad' : 'ok');
    }
  }

  async function loadReviews(force) {
    if (reviewsData && !force) { renderReviews(reviewsData); return; }
    const checks = document.getElementById('rv-checks');
    if (checks) checks.innerHTML = '<li class="rv-empty">Checking the live reviews site…</li>';
    try {
      const r = await fetch('/api/reviews-stats');
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'request failed');
      if (!j.reachable) throw new Error(j.error || 'reviews site did not respond');
      reviewsData = j;
      renderReviews(j);
    } catch (e) {
      if (checks) checks.innerHTML = `<li class="rv-empty">Couldn’t reach the reviews site — ${uiEsc(e.message)}</li>`;
      const k = document.getElementById('rv-kpis'); if (k) k.innerHTML = '';
      const g = document.getElementById('rv-growth'); if (g) g.innerHTML = '';
      const s = document.getElementById('rv-split'); if (s) s.innerHTML = '';
    }
  }
  window.loadReviews = loadReviews;

  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('#rv-refresh');
    if (b) { b.disabled = true; loadReviews(true).finally(() => { b.disabled = false; }); }
  });



});
