'use strict';

(function exposeSettingsWorkspace(global) {
  const { authFetch, showToast, uiEsc, readCheckedJson } = global.SeoBuddyCore;

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
  let populated = false;
  let connectionRequest = 0, saving = false;
  const connectionList = document.getElementById('settings-connection-list');
  const connectionNote = document.getElementById('settings-connection-note');
  const refreshConnections = document.getElementById('settings-refresh-connections');
  const keyControls = { gemini: 'settings-gemini-key', openai: 'settings-openai-key', perplexity: 'settings-perplexity-key' };

  async function loadConnections() {
    if (!connectionList) return;
    const request = ++connectionRequest;
    refreshConnections.disabled = true;
    connectionList.setAttribute('aria-busy', 'true');
    connectionNote.textContent = 'Checking saved configuration…';
    const [ai, gbp, report] = await Promise.all([
      readCheckedJson('/api/ai-engines').catch(() => null),
      readCheckedJson('/api/gbp-status').catch(() => null),
      readCheckedJson('/api/monthly-report').catch(() => null),
    ]);
    if (request !== connectionRequest) return;
    let unavailable = false;
    const row = (name, configured, detail, action) => {
      if (configured === null) unavailable = true;
      return `<div class="settings-connection-row"><div><strong>${uiEsc(name)}</strong><span>${uiEsc(detail)}</span></div><span class="settings-connection-state">${configured === null ? 'Unable to check' : configured ? 'Configured' : 'Not connected'}</span>${action}</div>`;
    };
    let html = ['gemini', 'openai', 'perplexity'].map(id => {
      const matches = Array.isArray(ai?.engines) ? ai.engines.filter(engine => engine?.id === (id === 'gemini' ? 'google' : id)) : [];
      const configured = matches.length === 1 && typeof matches[0].configured === 'boolean' ? matches[0].configured : null;
      return row({ gemini: 'Gemini', openai: 'OpenAI / ChatGPT', perplexity: 'Perplexity' }[id], configured,
        id === 'gemini' ? 'AI writing and assistant responses.' : 'Optional AI visibility provider. You can leave this disconnected.',
        `<button type="button" class="btn btn-secondary btn-xs" data-connection-key="${id}">${configured === null ? 'Review key' : configured ? 'Manage key' : 'Set up'}</button>`);
    }).join('');
    const gbpReady = typeof gbp?.configured === 'boolean' ? gbp.configured : null;
    html += row('Google Business Profile publishing', gbpReady,
      gbpReady === true ? 'Publishing credentials are set. A Google receipt confirms each post.' : gbpReady === false ? 'Drafts work; posting is manual until API approval and account connection are complete.' : 'Status could not be read. This does not mean your connection was removed.',
      '<button type="button" class="btn btn-secondary btn-xs" data-connection-tab="local-tab">Review posts</button>');
    const reportReady = typeof report?.ready === 'boolean' ? report.ready : null;
    html += row('Monthly report email', reportReady,
      reportReady === null ? 'Status could not be read. Review report controls or retry before changing setup.' : reportReady ? (report.enabled === true ? 'Automatic delivery is enabled. Review the recipient, schedule and delivery history.' : report.enabled === false ? 'Delivery is set up but paused. Review the report controls to resume.' : 'Delivery is set up; its automatic schedule status is unavailable.') : 'Review the recipient and Gmail setup. Opening controls does not send an email.',
      '<button type="button" class="btn btn-secondary btn-xs" data-connection-tab="performance-tab">Report controls</button>');
    connectionList.innerHTML = html;
    connectionList.setAttribute('aria-busy', 'false');
    connectionNote.textContent = unavailable ? 'Some status checks are unavailable. Refresh before changing credentials.' : 'Configuration checked just now. No scans, posts or emails were sent.';
    refreshConnections.disabled = false;
  }
  refreshConnections?.addEventListener('click', loadConnections);
  connectionList?.addEventListener('click', event => {
    const key = event.target.closest('[data-connection-key]');
    if (key && keyControls[key.dataset.connectionKey]) {
      const field = document.getElementById(keyControls[key.dataset.connectionKey]);
      const details = field?.closest('details');
      if (details) details.open = true;
      field?.scrollIntoView({ block: 'center' });
      field?.focus({ preventScroll: true });
    }
    const tab = event.target.closest('[data-connection-tab]')?.dataset.connectionTab;
    if (['local-tab', 'performance-tab'].includes(tab)) global.switchTab(tab);
  });

  function loadSettingsWorkspace() {
    loadConnections();
    // Opening another tab must not discard an unsaved connection or author edit.
    if (populated) return;
    const creds = global.getStoredCredentials();
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
    global.updateSiteUrlBadge(creds.siteUrl);
    populated = true;
  }

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
      const data = await res.json();
      let html = (data.checks || []).map(check =>
        '<div class="gsc-row ' + (check.ok ? 'ok' : 'bad') + '">'
        + '<span class="mk">' + (check.ok ? '\u2713' : '!') + '</span>'
        + '<span><b>' + uiEsc(check.label) + '</b><span>' + uiEsc(check.detail || '') + '</span></span></div>').join('');

      if (data.serviceAccountEmail) {
        html += '<div class="gsc-row ok"><span class="mk">\u2139</span><span><b>Service account</b>'
          + '<span>This is the address you grant access to in Search Console:<br>'
          + '<span class="gsc-email">' + uiEsc(data.serviceAccountEmail) + '</span></span></span></div>';
      }
      if (data.fix) html += '<div class="gsc-fix"><b>Do this:</b> ' + uiEsc(data.fix) + '</div>';
      else if (data.verdict === 'connected') html += '<div class="gsc-fix"><b>Connected.</b> Real rankings and clicks will replace the sample data on the next refresh.</div>';
      body.innerHTML = html;
    } catch (error) {
      body.innerHTML = '<span class="text-muted">Could not run the test: ' + uiEsc(error.message) + '</span>';
    } finally {
      btnGscDiag.disabled = false;
      btnGscDiag.textContent = label;
    }
  });

  if (settingsForm) settingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const submit = settingsForm.querySelector('button[type="submit"]');
    const saveStatus = document.getElementById('settings-save-status');
    submit.disabled = true;
    saveStatus.textContent = 'Saving configuration…';

    const geminiKey = settingsGeminiKey.value.trim();
    const openaiInput = document.getElementById('settings-openai-key');
    const perplexityInput = document.getElementById('settings-perplexity-key');
    const openaiKey = (openaiInput?.value || '').trim();
    const perplexityKey = (perplexityInput?.value || '').trim();
    const ghlToken = settingsGhlToken.value.trim();
    const ghlLocation = settingsGhlLocation.value.trim();
    const ghlBlog = settingsGhlBlog.value.trim();
    const siteUrl = settingsSiteUrl.value.trim();
    const blogPrefix = settingsBlogPrefix.value.trim();
    const authorName = settingsAuthorName.value.trim();
    const authorUrl = settingsAuthorUrl.value.trim();
    const gscJson = settingsGscJson.value.trim();
    const adminPassword = settingsAdminPassword.value;

    try {
      // Store the admin password first so the save request below is authorized.
      sessionStorage.setItem('seo_admin_password', adminPassword);
      if (settingsClientValue) localStorage.setItem('seo_client_value', settingsClientValue.value.trim() || '1395');
      if (settingsConvRate) localStorage.setItem('seo_conv_rate', settingsConvRate.value.trim() || '2');
      if (settingsCaptureRate) localStorage.setItem('seo_capture_rate', settingsCaptureRate.value.trim() || '5');
      localStorage.setItem('seo_ghl_location', ghlLocation);
      localStorage.setItem('seo_ghl_blog', ghlBlog);
      localStorage.setItem('seo_site_url', siteUrl);
      localStorage.setItem('seo_blog_prefix', blogPrefix);
      localStorage.setItem('seo_author_name', authorName);
      localStorage.setItem('seo_author_url', authorUrl);
      global.updateSiteUrlBadge(siteUrl);

      const response = await authFetch('/api/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiKey, openaiKey, perplexityKey, ghlToken, ghlLocation, ghlBlog, siteUrl, blogPrefix, authorName, authorUrl, gscJson }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        settingsGeminiKey.value = '';
        settingsGhlToken.value = '';
        settingsGscJson.value = '';
        if (openaiInput) openaiInput.value = '';
        if (perplexityInput) perplexityInput.value = '';
        saveStatus.textContent = 'Configuration saved. Secret fields are cleared for privacy; existing keys stay on the server.';
        loadConnections();
        showToast(data.message || 'Configuration saved securely on the server.');
      } else {
        saveStatus.textContent = 'Server settings were not saved. Your entries are still here; check the error and try again.';
        showToast(`Server settings were not saved: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      saveStatus.textContent = 'Could not confirm the save. Your entries are still here; please try again.';
      showToast(`Could not save server settings: ${error.message}`);
    } finally {
      saving = false;
      submit.disabled = false;
    }
  });

  global.loadSettingsWorkspace = loadSettingsWorkspace;
})(window);
