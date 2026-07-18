// SEO Buddy - Application Logic
document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  const state = {
    activeTab: 'gsc-tab',
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
  const displaySiteUrlBadge = document.getElementById('display-site-url');

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
    });
  });

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

    // Update Header Text dynamically
    if (tabId === 'gsc-tab') {
      pageTitle.innerText = 'GSC Content Gaps';
      pageSubtitle.innerText = 'Analyze Search Console impressions and find low-click authority loops';
    } else if (tabId === 'ai-tab') {
      pageTitle.innerText = 'AI Article Creator';
      pageSubtitle.innerText = 'Generate highly authoritative, structural SEO pages targeting search leaks';
    } else if (tabId === 'publish-tab') {
      pageTitle.innerText = 'Publish & Index Hub';
      pageSubtitle.innerText = 'Deploy formatted pages to GoHighLevel and request Google indexing';
    } else if (tabId === 'aio-tab') {
      pageTitle.innerText = 'AI Search (AIO) Audit';
      pageSubtitle.innerText = 'Verify recommendations on AI Search platforms and build schema graphs';
      fetchAioHistory();
      fetchAioSchemas();
    } else if (tabId === 'settings-tab') {
      pageTitle.innerText = 'System Configuration';
      pageSubtitle.innerText = 'Connect live APIs, GHL tokens, and Search Console keys';
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
      const res = await fetch('/api/generate-article', {
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
      const res = await fetch('/api/publish-ghl', {
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
      const res = await fetch('/api/index-url', {
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
      gscJson: localStorage.getItem('seo_gsc_json') || ''
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
      const response = await fetch('/api/save-settings', {
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
      await fetch('/api/autopilot-toggle', {
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

  btnRunAutopilotNow.addEventListener('click', async () => {
    btnRunAutopilotNow.disabled = true;
    const originalContent = btnRunAutopilotNow.innerHTML;
    btnRunAutopilotNow.innerText = 'Agent Operating...';

    try {
      const res = await fetch('/api/autopilot-run-now', { method: 'POST' });
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

  // Background sync loops
  fetchHistory();
  fetchAutopilotStatus();

  setInterval(() => {
    if (state.activeTab === 'publish-tab') {
      fetchAutopilotStatus();
      fetchHistory();
    }
  }, 12000);

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
      
      const statusText = item.recommended ? 'Recommended' : 'Not Cited';
      const statusClass = item.recommended ? 'clean' : 'leak';
      
      const rate = item.recommended ? '100%' : '0%';
      const competitorsStr = item.competitors && item.competitors.length > 0 ? item.competitors.join(', ') : 'None';

      tr.innerHTML = `
        <td>${date}</td>
        <td><span class="keyword-tag">${item.query}</span></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td class="font-medium">${rate}</td>
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
    btnRunAioAudit.innerText = 'AI Agent Auditing Platforms...';
    aioResultsPanel.style.display = 'none';

    try {
      const res = await fetch('/api/aio-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AIO Audit API failed');
      }

      const latest = data.latest;
      
      aioResultsPanel.style.display = 'block';
      
      const badgeText = aioStatusBadge.querySelector('.status-text');
      if (latest.recommended) {
        aioStatusBadge.className = 'status-indicator live';
        badgeText.innerText = 'Recommended / Cited';
      } else {
        aioStatusBadge.className = 'status-indicator mock';
        badgeText.innerText = 'Not Recommended';
      }

      aioSnippetText.innerText = latest.responseSnippet;

      aioCitedUrls.innerHTML = '';
      if (!latest.citedUrls || latest.citedUrls.length === 0) {
        aioCitedUrls.innerHTML = `<li style="color: var(--text-muted); padding: 4px 0;">None</li>`;
      } else {
        latest.citedUrls.forEach(url => {
          const li = document.createElement('li');
          li.style.marginBottom = '6px';
          li.innerHTML = `<a href="${url}" target="_blank" class="live-link" style="text-decoration: underline;">${url.replace('https://', '')}</a>`;
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

      renderAioHistory(data.history);
      if (data.history.length > 0) {
        const citedCount = data.history.filter(item => item.recommended).length;
        const rate = Math.round((citedCount / data.history.length) * 100);
        aioSovRate.innerText = `${rate}%`;
      }

      alert('AI Platforms Audited Successfully!');

    } catch (err) {
      alert(`AIO Audit Error: ${err.message}`);
    } finally {
      btnRunAioAudit.disabled = false;
      btnRunAioAudit.innerText = 'Audit AI Platforms Now';
    }
  });


  // --- INTERACTIVE ONBOARDING WIZARD ---
  const wizardSteps = [
    {
      tab: 'gsc-tab',
      highlight: '#gsc-table',
      title: 'Step 1: Spot the Content Gaps',
      text: 'Google is testing your site on searches but you get 0 clicks because you lack a dedicated page. Find a keyword labeled <span class="status-badge leak" style="padding: 1px 4px; font-size: 10px;">Content Gap</span> and click <b>Generate Page</b>.'
    },
    {
      tab: 'ai-tab',
      highlight: '.creator-form-panel',
      title: 'Step 2: Add Case Studies (E-E-A-T)',
      text: 'Customize the <b>Information Gain / Case Study</b> box with a real client story. This tells Google’s algorithms your page is unique and highly authoritative, rather than generic AI fluff.'
    },
    {
      tab: 'ai-tab',
      highlight: '.preview-panel',
      title: 'Step 3: Copy or Edit HTML',
      text: 'Check the live generated draft. Toggle between <b>Visual Preview</b> and <b>Source HTML</b>. When satisfied, click <b>Copy HTML</b> and paste it directly into your GoHighLevel page builder.'
    },
    {
      tab: 'publish-tab',
      highlight: '.deploy-controls-card',
      title: 'Step 4: Same-Day Google Indexing',
      text: 'Once the page is live in GoHighLevel, paste its URL in the Indexing block and click <b>Submit URL for Indexing</b> to request a Google crawler scan within hours!'
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

  function startTour() {
    currentWizardStep = 0;
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
    if (currentWizardStep < wizardSteps.length - 1) {
      currentWizardStep++;
      renderStep();
    } else {
      endTour();
      alert('System tour complete! You are ready to rank your keywords!');
    }
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
});
