'use strict';

(function exposeContentWorkspace(global) {
  const { authFetch, sanitizeHtml, safeExternalUrl, showToast, uiEsc, relativeTime } = global.SeoBuddyCore;
  const alert = showToast;
  const sumEsc = uiEsc;
  const tdAgo = relativeTime;
  const switchTab = tab => global.switchTab(tab);
  const getStoredCredentials = () => global.getStoredCredentials();

  const state = {
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
      // A failed replacement must not hide the last reviewed draft or leave
      // its warnings floating over the empty-state illustration.
      editorEmpty.style.display = state.generatedArticle ? 'none' : 'flex';
      if (state.generatedArticle) {
        visualEditor.style.display = state.editorMode === 'visual' ? 'block' : 'none';
        codeEditor.style.display = state.editorMode === 'code' ? 'block' : 'none';
      }
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
      if (window.syncGSCData) window.syncGSCData();
      fetchHistory();
      fetchAutopilotStatus();
    } catch (err) {
      alert(`Autopilot Run failed: ${err.message}`);
    } finally {
      btnRunAutopilotNow.disabled = false;
      btnRunAutopilotNow.innerHTML = originalContent;
    }
  });

  async function loadPublishWorkspace() {
    await Promise.all([fetchHistory(), fetchAutopilotStatus()]);
  }

  global.SeoBuddyContent = Object.freeze({ loadKeywordIntoCreator, loadPublishWorkspace });
  renderHistory();
})(window);
