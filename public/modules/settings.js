'use strict';

(function exposeSettingsWorkspace(global) {
  const { authFetch, showToast, uiEsc } = global.SeoBuddyCore;

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

  function loadSettingsWorkspace() {
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

    try {
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
        showToast(data.message || 'Configuration saved securely on the server.');
      } else {
        showToast(`Server settings were not saved: ${data.error || 'Unknown server error'}`);
      }
    } catch (error) {
      showToast(`Could not save server settings: ${error.message}`);
    }

    global.switchTab('gsc-tab');
  });

  global.loadSettingsWorkspace = loadSettingsWorkspace;
})(window);
