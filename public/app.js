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
        url: 'https://bestdayfitness.com/blog/mobility-training-st-pete'
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
  const settingsGscJson = document.getElementById('settings-gsc-json');
  const displaySiteUrlBadge = document.getElementById('display-site-url');


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
      indexingUrlInput.value = `https://bestdayfitness.com/blog/${data.slug}`;

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
          blogId: credentials.ghlBlog
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
    settingsGscJson.value = creds.gscJson;

    if (creds.siteUrl) {
      displaySiteUrlBadge.innerText = creds.siteUrl.replace('https://', '').replace('http://', '');
    }
  }

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();

    localStorage.setItem('seo_gemini_key', settingsGeminiKey.value.trim());
    localStorage.setItem('seo_ghl_token', settingsGhlToken.value.trim());
    localStorage.setItem('seo_ghl_location', settingsGhlLocation.value.trim());
    localStorage.setItem('seo_ghl_blog', settingsGhlBlog.value.trim());
    
    const siteUrl = settingsSiteUrl.value.trim();
    localStorage.setItem('seo_site_url', siteUrl);
    localStorage.setItem('seo_gsc_json', settingsGscJson.value.trim());

    if (siteUrl) {
      displaySiteUrlBadge.innerText = siteUrl.replace('https://', '').replace('http://', '');
    }

    alert('Configuration saved locally in browser! Note: If you want these credentials to apply server-side automatically, write them directly into the .env file in your project folder.');
    switchTab('gsc-tab');
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
