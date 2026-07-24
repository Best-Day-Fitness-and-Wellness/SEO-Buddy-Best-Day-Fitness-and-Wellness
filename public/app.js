// SEO Buddy - Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = {
    activeTab: 'summary-tab',
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
        indexed: 'Indexing Requested',
        url: 'https://bestdayfitness.com/blog/posts/mobility-training-st-pete'
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

  // --- AUTH HELPERS ---
  // The server protects sensitive endpoints when ADMIN_PASSWORD is set.
  // Send the stored admin password as a Bearer token on protected calls.
  function getAdminToken() {
    return localStorage.getItem('seo_admin_password') || '';
  }

  function authHeaders(base) {
    const headers = Object.assign({}, base || {});
    const token = getAdminToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // Wraps fetch and surfaces a clear message if the server rejects auth.
  async function authFetch(url, options) {
    const opts = Object.assign({}, options || {});
    opts.headers = authHeaders(opts.headers);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      throw new Error('This action is locked. Enter the admin password in the Settings tab, then try again.');
    }
    return res;
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
  syncGSCData();
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

    // Auto-expand the Advanced Tools group when landing on one of its tools.
    if (['gsc-tab', 'ai-tab', 'publish-tab', 'aio-tab', 'citations-tab', 'local-tab', 'onsite-tab'].includes(tabId)) {
      const ag = document.getElementById('nav-adv-group'); const at = document.getElementById('nav-adv-toggle');
      if (ag) ag.classList.add('open'); if (at) at.classList.add('open');
    }

    // Update Header Text dynamically
    if (tabId === 'summary-tab') {
      pageTitle.innerText = 'Home';
      pageSubtitle.innerText = 'Your SEO & AEO at a glance — score, what we did, and what to do next';
      loadSummary();
    } else if (tabId === 'grow-tab') {
      pageTitle.innerText = 'Grow';
      pageSubtitle.innerText = 'Your prioritized to-do list, plus quick access to every tool';
      if (window.loadGrow) window.loadGrow();
    } else if (tabId === 'performance-tab') {
      pageTitle.innerText = 'Reports';
      pageSubtitle.innerText = 'Is it working? Your weekly digest, what we automated, search trends, and leads';
      loadPerformance();
      if (window.loadPerfDigest) window.loadPerfDigest();
      loadAutopilotDigest();
      loadSummary(); // refresh the KPI / stats / AI-standing / opportunities / content widgets that now live on Reports
    } else if (tabId === 'gsc-tab') {
      pageTitle.innerText = 'Searches You’re Missing';
      pageSubtitle.innerText = 'Search queries where you show up but get no clicks — your biggest quick wins';
    } else if (tabId === 'ai-tab') {
      pageTitle.innerText = 'Create a Post';
      pageSubtitle.innerText = 'Have AI write an authoritative, SEO-optimized article for you';
    } else if (tabId === 'publish-tab') {
      pageTitle.innerText = 'Publish';
      pageSubtitle.innerText = 'Publish to your site, request Google indexing, and run the content autopilot';
    } else if (tabId === 'aio-tab') {
      pageTitle.innerText = 'AI Visibility Check';
      pageSubtitle.innerText = 'See whether AI assistants recommend and cite you, and build schema';
      if (window.loadAiVisibility) window.loadAiVisibility();
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
    }
  }

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
        ? `<button class="btn btn-primary btn-xs btn-gen-trigger" data-query="${row.query}">Generate Page</button>`
        : `<button class="btn btn-secondary btn-xs" disabled>Optimized</button>`;

      tr.innerHTML = `
        <td class="font-medium">${row.query}</td>
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

  // Generate Article Trigger
  btnGenerate.addEventListener('click', async () => {
    const keyword = inputKeyword.value.trim();
    const caseStudy = inputCaseStudy.value.trim();
    const ctaText = inputCtaText.value.trim();
    const ctaUrl = inputCtaUrl.value.trim();

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
        body: JSON.stringify({ keyword, caseStudy, ctaText, ctaUrl })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server failed to write article');
      }

      state.generatedArticle = {
        title: data.title,
        content: data.content,
        slug: data.slug
      };

      // Populate preview panes
      visualEditor.innerHTML = data.content;
      codeEditor.value = data.content;

      // Populate publish hub fields
      deployTitle.value = data.title;
      
      const credentials = getStoredCredentials();
      let baseSiteUrl = credentials.siteUrl ? credentials.siteUrl.trim() : 'https://bestdayfitness.com';
      if (baseSiteUrl.startsWith('sc-domain:')) {
        baseSiteUrl = 'https://' + baseSiteUrl.substring(10);
      }
      baseSiteUrl = baseSiteUrl.replace(/\/$/, '');
      const cleanBlogPrefix = credentials.blogPrefix ? (credentials.blogPrefix.startsWith('/') ? credentials.blogPrefix : `/${credentials.blogPrefix}`) : '/blog/posts';
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
      visualEditor.innerHTML = codeEditor.value;
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
      state.generatedArticle.content = codeEditor.value;
      visualEditor.innerHTML = codeEditor.value;
    }
  });

  // --- CLIPBOARD ACTIONS ---
  btnCopyHtml.addEventListener('click', () => {
    if (!state.generatedArticle) {
      alert('Generate an article first!');
      return;
    }
    const html = codeEditor.value;
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
    const content = codeEditor.value;
    const status = deployStatus.value;

    btnPublishGhlNow.disabled = true;
    btnPublishGhlNow.innerText = 'Publishing to GHL...';

    // Retrieve storage credentials
    const credentials = getStoredCredentials();

    try {
      const res = await authFetch('/api/publish-ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          status,
          locationId: credentials.ghlLocation,
          accessToken: credentials.ghlToken,
          blogId: credentials.ghlBlog,
          siteUrl: credentials.siteUrl,
          blogPrefix: credentials.blogPrefix,
          authorName: credentials.authorName,
          authorUrl: credentials.authorUrl
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
          item.indexed = 'Indexing Requested';
        }
      });
      renderHistory();

    } catch (err) {
      alert(`Indexing Error: ${err.message}`);
    } finally {
      btnIndexNow.disabled = false;
      btnIndexNow.innerText = 'Submit URL for Indexing';
    }
  });

  function renderHistory() {
    historyTableBody.innerHTML = '';

    state.history.forEach(item => {
      const tr = document.createElement('tr');
      
      let statusClass = 'pending';
      if (item.indexed === 'Indexing Requested') statusClass = 'pending';
      else if (item.indexed === 'Indexed') statusClass = 'clean';
      else statusClass = 'pending';

      tr.innerHTML = `
        <td class="font-medium">${item.title}</td>
        <td><span class="keyword-tag">${item.keyword}</span></td>
        <td>${item.platform}</td>
        <td>${item.date}</td>
        <td><span class="status-badge ${statusClass}">${item.indexed}</span></td>
        <td><a href="${item.url}" target="_blank" class="live-link">${item.url.replace('https://', '')}</a></td>
      `;
      historyTableBody.appendChild(tr);
    });
  }

  // --- SETTINGS STORAGE SYSTEM ---
  function getStoredCredentials() {
    return {
      geminiKey: localStorage.getItem('seo_gemini_key') || '',
      ghlToken: localStorage.getItem('seo_ghl_token') || '',
      ghlLocation: localStorage.getItem('seo_ghl_location') || '',
      ghlBlog: localStorage.getItem('seo_ghl_blog') || '',
      siteUrl: localStorage.getItem('seo_site_url') || '',
      blogPrefix: localStorage.getItem('seo_blog_prefix') || '/blog/posts',
      authorName: localStorage.getItem('seo_author_name') || '',
      authorUrl: localStorage.getItem('seo_author_url') || '',
      gscJson: localStorage.getItem('seo_gsc_json') || '',
      adminPassword: localStorage.getItem('seo_admin_password') || '',
      clientValue: localStorage.getItem('seo_client_value') || '1395',
      convRate: localStorage.getItem('seo_conv_rate') || '2',
      captureRate: localStorage.getItem('seo_capture_rate') || '5'
    };
  }

  function loadSettingsFromStorage() {
    const creds = getStoredCredentials();
    
    settingsGeminiKey.value = creds.geminiKey;
    settingsGhlToken.value = creds.ghlToken;
    settingsGhlLocation.value = creds.ghlLocation;
    settingsGhlBlog.value = creds.ghlBlog;
    settingsSiteUrl.value = creds.siteUrl || 'https://bestdayfitness.com';
    settingsBlogPrefix.value = creds.blogPrefix || '/blog/posts';
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

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const geminiKey = settingsGeminiKey.value.trim();
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
    localStorage.setItem('seo_admin_password', adminPassword);
    // Business-value assumptions for the Summary dashboard estimates.
    if (settingsClientValue) localStorage.setItem('seo_client_value', settingsClientValue.value.trim() || '1395');
    if (settingsConvRate) localStorage.setItem('seo_conv_rate', settingsConvRate.value.trim() || '2');
    if (settingsCaptureRate) localStorage.setItem('seo_capture_rate', settingsCaptureRate.value.trim() || '5');
    localStorage.setItem('seo_gemini_key', geminiKey);
    localStorage.setItem('seo_ghl_token', ghlToken);
    localStorage.setItem('seo_ghl_location', ghlLocation);
    localStorage.setItem('seo_ghl_blog', ghlBlog);
    localStorage.setItem('seo_site_url', siteUrl);
    localStorage.setItem('seo_blog_prefix', blogPrefix);
    localStorage.setItem('seo_author_name', authorName);
    localStorage.setItem('seo_author_url', authorUrl);
    localStorage.setItem('seo_gsc_json', gscJson);

    if (siteUrl) {
      displaySiteUrlBadge.innerText = siteUrl.replace('https://', '').replace('http://', '');
    }

    try {
      const response = await authFetch('/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey, ghlToken, ghlLocation, ghlBlog, siteUrl, blogPrefix, authorName, authorUrl, gscJson })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        alert('Configuration saved successfully in browser and synced to backend server!');
      } else {
        alert(`Saved locally, but failed to sync to server: ${data.error || 'Unknown server error'}`);
      }
    } catch (err) {
      alert(`Saved locally, but connection to server failed: ${err.message}`);
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

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      state.history = data;
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
      renderAutopilotQueue(data.queue);

      if (data.enabled && data.nextRunTime) {
        const nextDate = new Date(data.nextRunTime);
        autopilotNextRun.innerText = nextDate.toLocaleString();
        autopilotNextRun.style.color = 'var(--color-secondary)';
      } else {
        autopilotNextRun.innerText = 'Not Scheduled';
        autopilotNextRun.style.color = 'var(--text-muted)';
      }

      // Render logs
      autopilotLogsContainer.innerHTML = '';
      if (data.logs.length === 0) {
        autopilotLogsContainer.innerHTML = `<div class="terminal-log-line text-sm">[System] Standing by. Enable Autopilot to schedule checks.</div>`;
      } else {
        data.logs.forEach(log => {
          const div = document.createElement('div');
          div.className = 'terminal-log-line';
          const localTime = new Date(log.timestamp).toLocaleTimeString();
          div.innerHTML = `<span class="timestamp">${localTime}</span> ${log.message}`;
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
      el.innerHTML = '<div class="text-muted" style="font-size:var(--font-xs);">Queue is empty — the autopilot will find content gaps automatically.</div>';
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

  async function loadAutopilotDigest() {
    const wrap = document.getElementById('sum-autopilot');
    const grid = document.getElementById('sum-ap-grid');
    const sub = document.getElementById('sum-ap-sub');
    if (!wrap || !grid) return;
    try {
      const d = await (await fetch('/api/autopilot-digest')).json();
      const items = (d && d.items) || [];
      if (!items.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      if (sub) sub.innerText = d.newCount ? `${d.newCount} new since you last looked` : 'Up to date';
      grid.innerHTML = items.map(it => `<div class="sum-ap-item ${it.tone === 'warn' ? 'warn' : ''}" data-tab="${sumEsc(it.tab)}">
        <div class="sum-ap-label"><span>${it.icon || ''} ${sumEsc(it.label)}</span>${it.isNew ? '<span class="sum-ap-new">NEW</span>' : ''}</div>
        <div class="sum-ap-text">${sumEsc(it.text)}</div>
        <div class="sum-ap-arrow">Open &rarr;</div>
      </div>`).join('');
      grid.querySelectorAll('.sum-ap-item').forEach(el => {
        el.addEventListener('click', () => {
          const nav = document.querySelector('.nav-item[data-tab="' + el.dataset.tab + '"]');
          if (nav) nav.click();
        });
      });
    } catch (e) { wrap.style.display = 'none'; }
  }

  // --- HOME: score hero + pillars + next moves ---
  const HOME_TAB_MAP = { found: 'gsc-tab', local: 'local-tab', ai: 'aio-tab', listed: 'citations-tab', fresh: 'publish-tab' };
  function homeGoTab(tab) { const n = document.querySelector('.nav-item[data-tab="' + tab + '"]'); if (n) n.click(); }

  // One-tap actions from Home/Grow move cards. Falls back to navigation.
  async function runMoveAction(m, btn) {
    if (!m) return;
    if (m.action === 'enable-autopilot') {
      btn.disabled = true; const o = btn.innerText; btn.innerText = 'Turning on…';
      try {
        const r = await authFetch('/api/autopilot-toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, intervalHours: 168 }) });
        const d = await r.json();
        if (d && d.success) { btn.innerText = 'Turned on ✓'; setTimeout(() => { if (window.loadHome) window.loadHome(); if (window.loadGrow) window.loadGrow(); }, 900); return; }
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
        if (d && d.success) { btn.innerText = 'Posted ✓'; setTimeout(() => { if (window.loadHome) window.loadHome(); if (window.loadGrow) window.loadGrow(); }, 900); return; }
        throw new Error((d && d.error) || 'failed');
      } catch (e) { btn.disabled = false; btn.innerText = o; homeGoTab(m.tab); }
      return;
    }
    homeGoTab(m.tab);
  }

  function renderHero(hs) {
    const hero = document.getElementById('home-hero'); if (!hero) return;
    hero.style.display = 'grid';
    const g = document.getElementById('home-gauge'), sc = document.getElementById('home-score');
    const hl = document.getElementById('home-headline'), sub = document.getElementById('home-sub');
    if (hs.overall == null) {
      sc.innerText = '—';
      g.style.background = 'conic-gradient(var(--text-dark) 0% 0%, var(--gauge-track) 0% 100%)';
      hl.innerHTML = 'Let’s measure your SEO &amp; AEO';
      sub.innerText = 'Complete the quick setup and the moves below to light up your score.';
      return;
    }
    const pct = hs.overall;
    const color = pct >= 75 ? 'var(--color-success)' : (pct >= 50 ? 'var(--color-warning)' : 'var(--color-accent)');
    g.style.background = `conic-gradient(${color} 0% ${pct}%, var(--gauge-track) ${pct}% 100%)`;
    sc.innerText = pct;
    const trend = (hs.delta != null && hs.delta !== 0) ? `<span class="home-trend ${hs.delta > 0 ? 'up' : 'flat'}">${hs.delta > 0 ? '+' : ''}${hs.delta} this month</span>` : '';
    hl.innerHTML = `Your SEO &amp; AEO is <em>${pct}% maximized</em>${trend}`;
    sub.innerText = hs.measuredCount < hs.totalPillars
      ? `${hs.measuredCount} of ${hs.totalPillars} areas measured — finish setup to measure them all.`
      : `All ${hs.totalPillars} areas measured. Keep the momentum with your next moves below.`;
  }
  function renderPillars(hs) {
    const el = document.getElementById('home-pillars'); if (!el || !hs.pillars) return;
    el.style.display = 'grid';
    el.innerHTML = hs.pillars.map(p => {
      const detCls = p.status === 'warn' ? 'warnt' : (p.status === 'off' ? 'offt' : '');
      return `<div class="home-pillar" data-tab="${HOME_TAB_MAP[p.key] || 'summary-tab'}"><span class="pdot ${p.status}"></span><span class="plbl">${sumEsc(p.label)}</span><div class="pdet ${detCls}">${sumEsc(p.detail)}</div></div>`;
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

  // --- GROW: full prioritized action list + tool shortcuts ---
  async function loadGrow() {
    const el = document.getElementById('grow-moves');
    if (!el) return;
    try {
      const nm = await (await fetch('/api/next-moves')).json();
      const moves = (nm && nm.moves) || [];
      const tagLabel = { high: 'High impact', med: 'Quick win', opportunity: 'Opportunity' };
      if (!moves.length) { el.innerHTML = '<div class="text-muted" style="font-size:var(--font-sm);">You’re all caught up — nothing needs your attention right now. 🎉</div>'; return; }
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
    $('sum-opps-extra').innerText = leaks.length ? `~${totalImpr.toLocaleString()} monthly impressions behind them` : '';

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

  // Background sync loops
  fetchHistory();
  fetchAutopilotStatus();
  loadSummary();
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
        <td>${date}</td>
        <td><span class="keyword-tag">${item.query}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="font-medium">${citedText}</td>
        <td>${competitorsStr}</td>
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
      btnCopySchema.innerText = 'Copy Schema';
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
        alert(data.message || 'Add your Gemini API key in Settings to run a real audit.');
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
            li.innerHTML = `<a href="${s.uri}" target="_blank" class="live-link" style="text-decoration: underline;">${label}</a>`;
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
          aioSearchQueries.innerHTML = `<strong style="color: var(--text-muted);">Google searches run:</strong> ${latest.searchQueries.map(q => `<span class="keyword-tag">${q}</span>`).join(' ')}`;
        } else {
          aioSearchQueries.style.display = 'none';
          aioSearchQueries.innerHTML = '';
        }
      }

      // Google-required Search Suggestions chip (from grounding metadata).
      if (aioSearchSuggestions) {
        if (latest.searchEntryPoint) {
          aioSearchSuggestions.style.display = 'block';
          aioSearchSuggestions.innerHTML = latest.searchEntryPoint;
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
    shareOfVoice: { label: 'Share of Voice', desc: 'Your share of all brand mentions vs competitors in AI answers.' },
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
      `<div class="cit-hint">Paste these exact fields on every site so your NAP stays identical — which also lifts your Local SEO score. Phone is your canonical <b>(727) 334-1472</b>.</div>`;
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
    if (!nap) { laNapBadge.innerHTML = ''; laNapBody.innerHTML = '<span class="lr-muted">Not checked yet — turn on the autopilot or click Run now.</span>'; return; }
    const bad = (nap.listings || []).filter(l => l.phoneMatch === false || l.addrMatch === false || l.nameMatch === false);
    laNapBadge.innerHTML = bad.length
      ? `<span class="la-badge new">${isNew ? 'NEW · ' : ''}${bad.length} mismatch${bad.length > 1 ? 'es' : ''}</span>`
      : `<span class="la-badge ok">consistent</span>`;
    if (!bad.length) { laNapBody.innerHTML = `<span class="lr-muted">All ${nap.listings.length} listings match your canonical NAP. Checked ${laAgo(nap.checkedAt)}.</span>`; return; }
    laNapBody.innerHTML = bad.map(l => {
      const issues = []; if (l.phoneMatch === false) issues.push('phone'); if (l.addrMatch === false) issues.push('address'); if (l.nameMatch === false) issues.push('name');
      return `<div class="la-nap-line"><span><b>${citEsc(l.platform || '?')}</b><br><span class="lr-muted">${citEsc(l.phone || l.address || '')}</span></span><span class="nap-bad">${issues.join(' + ')} off</span></div>`;
    }).join('') + `<div class="lr-muted" style="margin-top:8px;">Align these to ${citEsc(nap.canonical.phone)} · ${citEsc(nap.canonical.address)}. Checked ${laAgo(nap.checkedAt)}.</div>`;
  }

  function laRenderGbp(draft) {
    if (!laGbpBody) return;
    if (!draft) { laGbpBadge.innerHTML = ''; laGbpBody.innerHTML = '<span class="lr-muted">No post yet — one is written each week, or click Run now.</span>'; return; }
    laGbpBadge.innerHTML = draft.posted ? '<span class="la-badge ok">POSTED</span>' : (draft.isNew ? '<span class="la-badge new">NEW</span>' : '');
    const postedNote = draft.posted ? `<span class="lr-muted" style="color:var(--color-success)">Posted to Google ${laAgo(draft.postedAt)} ✓</span>`
      : (draft.postError ? `<span class="nap-bad">Auto-post failed: ${citEsc(draft.postError)}</span>` : '');
    const postBtn = (laGbpConfigured && !draft.posted) ? `<button class="btn btn-primary btn-xs" id="la-gbp-post" type="button">Post to Google now</button>` : '';
    laGbpBody.innerHTML = `<div class="la-gbp-text">${citEsc(draft.text)}</div>`
      + `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">`
      + `<button class="btn btn-secondary btn-xs" id="la-gbp-copy" type="button">Copy post</button>`
      + postBtn
      + `<span class="lr-muted">Topic: ${citEsc(draft.topic || '—')} · written ${laAgo(draft.createdAt)}</span>`
      + `</div>`
      + (postedNote ? `<div style="margin-top:6px;">${postedNote}</div>` : '');
    const cp = document.getElementById('la-gbp-copy');
    if (cp) cp.onclick = () => { navigator.clipboard.writeText(draft.text); cp.innerText = 'Copied ✓'; setTimeout(() => cp.innerText = 'Copy post', 1200); };
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
      : `<span class="nap-bad">Add your Gemini API key in Settings to enable the autopilot.</span>`;
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
    { group: 'NAP & Citations', items: ['NAP identical on website, Google, Yelp, Facebook', 'Listed in the top local + industry directories', 'Business name consistent (no keyword stuffing)'] },
    { group: 'On‑site Local Signals', items: ['City/service in your title tags and H1s', 'LocalBusiness schema on the site', 'Embedded Google Map + NAP in the footer', 'Dedicated location/service pages for key areas'] }
  ];
  const lrChecklistEl = document.getElementById('lr-checklist');
  function lrLoadChecks() { try { return JSON.parse(localStorage.getItem('seo_local_checklist') || '{}'); } catch (e) { return {}; } }
  function lrSaveChecks(o) { localStorage.setItem('seo_local_checklist', JSON.stringify(o)); }
  function lrRenderChecklist() {
    if (!lrChecklistEl) return;
    const checks = lrLoadChecks();
    let total = 0, done = 0;
    lrChecklistEl.innerHTML = LR_CHECKLIST.map((g, gi) =>
      `<div class="lr-check-group"><h4>${g.group}</h4>` + g.items.map((it, ii) => {
        const id = `c${gi}_${ii}`; total++; const on = !!checks[id]; if (on) done++;
        return `<label class="lr-check-item ${on ? 'done' : ''}"><input type="checkbox" data-cid="${id}" ${on ? 'checked' : ''}> <span>${it}</span></label>`;
      }).join('') + `</div>`
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

  function perfDelta(el, cur, prev, opts) {
    opts = opts || {};
    if (cur == null || prev == null) { el.className = 'perf-delta flat'; el.innerText = ''; return; }
    const diff = cur - prev;
    if (Math.abs(diff) < (opts.eps || 0.0001)) { el.className = 'perf-delta flat'; el.innerText = 'no change'; return; }
    const improved = opts.lowerBetter ? diff < 0 : diff > 0;
    el.className = 'perf-delta ' + (improved ? 'up' : 'down');
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
        $('perf-impr').innerText = cur.impressions.toLocaleString(); perfDelta($('perf-impr-d'), cur.impressions, prev.impressions, {});
        $('perf-clicks').innerText = cur.clicks.toLocaleString(); perfDelta($('perf-clicks-d'), cur.clicks, prev.clicks, {});
        $('perf-rank').innerText = cur.avgPosition; perfDelta($('perf-rank-d'), cur.avgPosition, prev.avgPosition, { lowerBetter: true, eps: 0.05 });
      } else {
        $('perf-impr').innerText = '—'; $('perf-clicks').innerText = '—'; $('perf-rank').innerText = '—';
      }

      const leads = d.leads;
      if (leads && leads.available) {
        $('perf-leads').innerText = leads.current; perfDelta($('perf-leads-d'), leads.current, leads.previous, {});
        $('perf-leads-note').innerText = 'new GHL leads' + (leads.approx ? ' (approx.)' : '');
      } else {
        $('perf-leads').innerText = '—'; $('perf-leads-d').innerText = ''; $('perf-leads-d').className = 'perf-delta flat';
        $('perf-leads-note').innerText = (leads && leads.reason) ? leads.reason : 'GoHighLevel not connected';
      }

      const g = (d.movers && d.movers.gainers) || [], l = (d.movers && d.movers.losers) || [];
      $('perf-gainers').innerHTML = g.length ? g.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="up">▲ ${m.posChange} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear gainers this period yet.</div>';
      $('perf-losers').innerHTML = l.length ? l.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="down">▼ ${Math.abs(m.posChange)} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear drops this period. 👍</div>';

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
      : `<span style="color:var(--color-accent)">Add your Gemini API key in Settings to enable the autopilot.</span>`;
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
  const btnOsService = document.getElementById('btn-os-service');
  const btnOsReview = document.getElementById('btn-os-review');
  const btnOsBreadcrumb = document.getElementById('btn-os-breadcrumb');
  if (btnOsService) btnOsService.addEventListener('click', () => osShowSchema('service'));
  if (btnOsReview) btnOsReview.addEventListener('click', () => osShowSchema('review'));
  if (btnOsBreadcrumb) btnOsBreadcrumb.addEventListener('click', () => osShowSchema('breadcrumb'));
  const btnOsSchemaCopy = document.getElementById('btn-os-schema-copy');
  if (btnOsSchemaCopy) btnOsSchemaCopy.addEventListener('click', () => {
    if (!osSchemaOut.value) { alert('Pick a schema type first.'); return; }
    navigator.clipboard.writeText(osSchemaOut.value);
    btnOsSchemaCopy.innerText = 'Copied!'; setTimeout(() => btnOsSchemaCopy.innerText = 'Copy', 1500);
  });


  // --- INTERACTIVE ONBOARDING WIZARD ---
  const wizardSteps = [
    {
      tab: 'summary-tab',
      highlight: '#home-hero',
      title: 'Step 1 · Home — your one-glance snapshot',
      text: 'Your <b>Optimization Score</b> up top shows how maximized your SEO &amp; AEO is right now. The five pillars beneath it are quick health checks — <span style="color:var(--color-success)">green</span> is good, <span style="color:var(--color-warning)">amber</span> needs a look. Just under those, <b>Your next moves</b> lists the highest-impact fixes, many with a one-tap button.'
    },
    {
      tab: 'grow-tab',
      highlight: '#grow-moves',
      title: 'Step 2 · Grow — your to-do list',
      text: 'Grow is your full, prioritized action list: everything worth doing, ranked by impact. Work top to bottom and your score climbs. Below it are shortcuts straight into any tool.'
    },
    {
      tab: 'performance-tab',
      highlight: '.perf-kpis',
      title: 'Step 3 · Reports — is it working?',
      text: 'Reports proves the payoff: impressions, clicks and Google rank this period vs last, your AI-visibility trend, new leads, and a plain-English <b>Weekly Digest</b>. This is where you confirm the work is paying off.'
    },
    {
      tab: 'gsc-tab',
      highlight: '#gsc-table',
      title: 'Step 4 · Searches You’re Missing',
      text: 'The next tools live under <b>Advanced Tools</b> in the sidebar. This one shows searches where Google already displays you but you get no clicks — your quickest wins. Pick one and click <b>Generate Page</b>.'
    },
    {
      tab: 'ai-tab',
      highlight: '.creator-form-panel',
      title: 'Step 5 · Create a Post',
      text: 'Have AI write a structured, SEO-ready article for you. Add a <b>real client story</b> for extra credibility, then preview it and either copy the HTML or send it straight to <b>Publish</b>.'
    },
    {
      tab: 'publish-tab',
      highlight: '.deploy-controls-card',
      title: 'Step 6 · Publish',
      text: 'Push a page live, then paste its URL to request a Google crawl within hours. You can also switch on the <b>content autopilot</b> here to publish fresh pages on a schedule — hands-off.'
    },
    {
      tab: 'aio-tab',
      highlight: '#btn-run-aio-audit',
      title: 'Step 7 · AI Visibility Check',
      text: 'See whether AI assistants actually recommend you. Pick a local search and run a live audit — you’ll see if you’re cited, who’s recommended instead, and the real sources behind the answer.'
    },
    {
      tab: 'citations-tab',
      highlight: '#btn-find-citations',
      title: 'Step 8 · Where to Get Listed',
      text: 'AI trusts directories, review sites and “best-of” lists more than your own pages. This finds the exact sources AI pulls from and tells you where to get listed to win those answers.'
    },
    {
      tab: 'local-tab',
      highlight: '#btn-nap-check',
      title: 'Step 9 · Local Presence',
      text: 'Checks that your Name, Address &amp; Phone match everywhere, drafts review replies and requests, creates Google Business Profile posts, and scores your local fundamentals.'
    },
    {
      tab: 'onsite-tab',
      highlight: '#btn-os-keywords',
      title: 'Step 10 · Site Optimization',
      text: 'The technical polish: fresh keyword ideas, sharper title tags and meta descriptions, internal-link suggestions, and richer schema — the details that help you rank.'
    }
  ];

  let currentWizardStep = 0;
  const wizardWidget = document.getElementById('wizard-widget');
  const btnStartWizard = document.getElementById('btn-start-wizard');
  const btnCloseWizard = document.getElementById('btn-close-wizard');
  const btnWizardBack = document.getElementById('btn-wizard-back');
  const btnWizardNext = document.getElementById('btn-wizard-next');
  const wizardStepText = document.getElementById('wizard-step-text');
  const wizardProgressDots = document.getElementById('wizard-progress-dots');

  btnStartWizard.addEventListener('click', startTour);
  btnCloseWizard.addEventListener('click', endTour);
  btnWizardBack.addEventListener('click', previousStep);
  btnWizardNext.addEventListener('click', nextStep);

  let tourFinished = false;
  function startTour() {
    currentWizardStep = 0;
    tourFinished = false;
    btnWizardBack.style.display = '';
    wizardWidget.style.display = 'block';
    btnStartWizard.style.display = 'none';
    renderStep();
  }

  function endTour() {
    wizardWidget.style.display = 'none';
    btnStartWizard.style.display = 'flex';
    clearHighlights();
  }

  function renderStep() {
    clearHighlights();
    const step = wizardSteps[currentWizardStep];
    
    // Switch to target tab
    switchTab(step.tab);

    // Build text
    wizardStepText.innerHTML = `
      <h4>${step.title}</h4>
      <p style="font-size: 13px; color: var(--text-muted); margin-top: 5px;">${step.text}</p>
    `;

    // Render progress dots
    wizardProgressDots.innerHTML = wizardSteps.map((_, idx) => 
      `<span class="wizard-dot ${idx === currentWizardStep ? 'active' : ''}"></span>`
    ).join('');

    // Highlight target element if it exists
    setTimeout(() => {
      const el = document.querySelector(step.highlight);
      if (el) {
        el.classList.add('wizard-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    // Update buttons
    btnWizardBack.disabled = (currentWizardStep === 0);
    btnWizardNext.innerText = (currentWizardStep === wizardSteps.length - 1) ? 'Finish' : 'Next';
  }

  function nextStep() {
    if (tourFinished) { endTour(); return; }
    if (currentWizardStep < wizardSteps.length - 1) {
      currentWizardStep++;
      renderStep();
    } else {
      finishTour();
    }
  }

  function finishTour() {
    tourFinished = true;
    clearHighlights();
    switchTab('summary-tab');
    wizardStepText.innerHTML = `
      <h4>You’re all set &#127881;</h4>
      <p style="font-size: 13px; color: var(--text-muted); margin-top: 5px;">That’s the tour. Start on <b>Home</b>, work through <b>Your next moves</b>, then check <b>Reports</b> to watch it pay off. You can reopen this anytime with the <b>Quick Guide</b> button.</p>
    `;
    wizardProgressDots.innerHTML = '';
    btnWizardBack.style.display = 'none';
    btnWizardNext.innerText = 'Done';
  }

  function previousStep() {
    if (currentWizardStep > 0) {
      currentWizardStep--;
      renderStep();
    }
  }

  function clearHighlights() {
    document.querySelectorAll('.wizard-highlight').forEach(el => {
      el.classList.remove('wizard-highlight');
    });
  }

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
      if (i === 0) return `<div class="setup-emoji">👋</div><h2>Welcome to SEO Buddy</h2><p class="lead">Let’s get you set up in about a minute — confirm your business details, your numbers, and connect the accounts that bring your data to life. Then you’re off to the races.</p>`;
      if (i === 1) return `<h2>Your business</h2><p class="lead">This is the identity we keep consistent everywhere — Google, directories, and every AI answer. Getting it exactly right matters.</p>
        <div class="setup-field"><label>Business name</label><input class="form-input" id="setup-name" value="${sEsc(profile.name)}"></div>
        <div class="setup-field"><label>Street address</label><input class="form-input" id="setup-street" value="${sEsc(profile.streetAddress)}"></div>
        <div class="setup-row"><div class="setup-field"><label>City</label><input class="form-input" id="setup-city" value="${sEsc(profile.addressLocality)}"></div><div class="setup-field"><label>State</label><input class="form-input" id="setup-state" value="${sEsc(profile.addressRegion)}"></div></div>
        <div class="setup-row"><div class="setup-field"><label>ZIP</label><input class="form-input" id="setup-zip" value="${sEsc(profile.postalCode)}"></div><div class="setup-field"><label>Phone</label><input class="form-input" id="setup-phone" value="${sEsc(profile.phone)}"></div></div>
        <div class="setup-field"><label>Website</label><input class="form-input" id="setup-website" value="${sEsc(profile.website)}"></div>`;
      if (i === 2) {
        const cv = localStorage.getItem('seo_client_value') || '1395', cr = localStorage.getItem('seo_conv_rate') || '2', cap = localStorage.getItem('seo_capture_rate') || '5';
        return `<h2>Your numbers</h2><p class="lead">These power your value estimates on Home — “worth X new clients.” Use your real figures; you can change them anytime in Settings.</p>
        <div class="setup-field"><label>Value of a new client ($)</label><input type="number" class="form-input" id="setup-clientvalue" value="${sEsc(cv)}"></div>
        <div class="setup-row"><div class="setup-field"><label>Visitor → client conversion (%)</label><input type="number" class="form-input" id="setup-conv" value="${sEsc(cr)}"></div><div class="setup-field"><label>Search capture (%)</label><input type="number" class="form-input" id="setup-capture" value="${sEsc(cap)}"></div></div>`;
      }
      return `<h2>Connect your accounts</h2><p class="lead">These unlock your live data. Do it now in Settings, or later — SEO Buddy runs in demo mode until then.</p>
        <div class="setup-connect-item"><div class="ci">🔑</div><div><b>Google Gemini</b><span>Powers AI content, audits, and citation finding.</span></div></div>
        <div class="setup-connect-item"><div class="ci">🔍</div><div><b>Google Search Console</b><span>Your real rankings, clicks, and content gaps.</span></div></div>
        <div class="setup-connect-item"><div class="ci">📇</div><div><b>GoHighLevel</b><span>Publish content and pull in your leads.</span></div></div>
        <div style="margin-top:16px;"><button class="btn btn-secondary" id="setup-open-settings" type="button" style="width:auto;">Open Settings to connect →</button></div>`;
    }
    function render() {
      bodyEl.innerHTML = stepHTML(step);
      dotsEl.innerHTML = Array.from({ length: TOTAL }, (_, i) => `<span class="setup-dot ${i === step ? 'on' : ''}"></span>`).join('');
      backBtn.style.visibility = step === 0 ? 'hidden' : 'visible';
      nextBtn.innerText = step === TOTAL - 1 ? 'Finish' : (step === 0 ? "Let’s go" : 'Next');
      const os = document.getElementById('setup-open-settings');
      if (os) os.addEventListener('click', () => { closeWiz(); const n = document.querySelector('.nav-item[data-tab="settings-tab"]'); if (n) n.click(); });
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
    fetch('/api/business-profile').then(r => r.json()).then(d => {
      let seen = '0'; try { seen = localStorage.getItem('seo_wizard_seen') || '0'; } catch (e) {}
      if (d && d.profile && !d.profile.configured && seen !== '1') setTimeout(openWiz, 900);
    }).catch(() => {});
  })();
});
