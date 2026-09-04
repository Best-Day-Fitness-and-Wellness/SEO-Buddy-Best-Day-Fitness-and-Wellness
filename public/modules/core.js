'use strict';

(function exposeCore(global) {
  const featureLoads = new Map();

  // One in-flight request per hashed feature. Failed loads are retryable, and
  // a successful HTTP response is not ready until its public API is present.
  function loadFeature(assetKey, isReady, label = 'Feature') {
    if (isReady()) return Promise.resolve();
    const asset = document.body.dataset[assetKey];
    if (!/^\/assets\/[a-z0-9-]+\.[a-f0-9]{12}\.js$/.test(asset || '')) {
      return Promise.reject(new Error(`${label} asset is unavailable.`));
    }
    if (featureLoads.has(asset)) return featureLoads.get(asset);
    const request = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve();
      };
      const timeout = setTimeout(() => finish(new Error(`${label} took too long to load.`)), 20000);
      script.src = asset;
      script.async = true;
      script.onload = () => {
        try { finish(isReady() ? null : new Error(`${label} did not initialize.`)); }
        catch (error) { finish(error); }
      };
      script.onerror = () => finish(new Error(`Could not load ${label}.`));
      document.head.appendChild(script);
    }).catch(error => { featureLoads.delete(asset); throw error; });
    featureLoads.set(asset, request);
    return request;
  }

  // Shared read boundary for owner-facing views. Preserve the existing timeout
  // and failure semantics; callers decide how to present unavailable data.
  async function readCheckedJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('The server could not complete this check.');
    const data = await response.json();
    if (!data || data.success === false) throw new Error('The check returned no verified data.');
    return data;
  }

  function healthScoreDataMode(score) {
    const search = Array.isArray(score?.pillars) ? score.pillars.find(pillar => pillar?.key === 'found') : null;
    if (score?.success === false || !search || typeof search.measured !== 'boolean') return 'unavailable';
    if (search.measured) return 'live';
    return score.runtime?.mockIntegrationsAllowed === true ? 'demo' : 'unavailable';
  }

  let healthScoreRequest = null;
  // The shell and visible view share concurrent checks, not a cached success.
  // Publish as soon as search evidence arrives, independent of other checks.
  function readHealthScore() {
    if (!healthScoreRequest) {
      healthScoreRequest = readCheckedJson('/api/health-score')
        .then(score => { global.setDataMode?.(healthScoreDataMode(score)); return score; })
        .catch(error => { global.setDataMode?.('unavailable'); throw error; })
        .finally(() => { healthScoreRequest = null; });
    }
    return healthScoreRequest;
  }

  function relativeTime(iso) {
    const timestamp = new Date(iso).getTime();
    if (Number.isNaN(timestamp)) return '';
    const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
    if (seconds < 90) return 'just now';
    const minutes = seconds / 60;
    if (minutes < 60) return Math.round(minutes) + ' min ago';
    const hours = minutes / 60;
    if (hours < 24) return Math.round(hours) + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }
  // --- AUTH HELPERS ---
  // The server protects sensitive endpoints when ADMIN_PASSWORD is set.
  // Send the stored admin password as a Bearer token on protected calls.
  function getAdminToken() {
    return sessionStorage.getItem('seo_admin_password') || '';
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
    if (res.status === 403) {
      throw new Error('This action requires the owner password. The operator password cannot change security or integration settings.');
    }
    return res;
  }
  
  // Treat everything returned by integrations and AI as untrusted. These
  // helpers are shared by table/card renderers and by the article preview.
  function uiEsc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  
  function safeExternalUrl(value) {
    try {
      const parsed = new URL(String(value || ''), window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '#';
    } catch (e) { return '#'; }
  }
  
  function sanitizeHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    const blocked = template.content.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,option,meta,link,base,svg,math');
    blocked.forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const raw = attr.value.trim();
        if (name.startsWith('on') || name === 'srcdoc') node.removeAttribute(attr.name);
        else if (['href', 'src', 'action', 'formaction'].includes(name)) {
          if (!['http:', 'https:'].includes((() => { try { return new URL(raw, window.location.origin).protocol; } catch (e) { return ''; } })())) {
            node.removeAttribute(attr.name);
          }
        } else if (name === 'style' && /(expression\s*\(|url\s*\(|@import|javascript:)/i.test(raw)) {
          node.removeAttribute(attr.name);
        }
      });
      if (node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer');
        if (node.getAttribute('target') === '_blank') node.setAttribute('target', '_blank');
      }
    });
    return template.innerHTML;
  }
  
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
  
  function bindAction(element, action) {
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    element.addEventListener('click', action);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        element.click();
      }
    });
  }

  function trapDialogFocus(dialog, onEscape) {
    const previous = document.activeElement;
    const focusable = () => Array.from(dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'))
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onEscape(); }
      else if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    focusable()[0]?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }

  function confirmAction(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-confirm-overlay';
      overlay.innerHTML = `<div class="ui-confirm" role="dialog" aria-modal="true" aria-labelledby="ui-confirm-title"><h3 id="ui-confirm-title">Please confirm</h3><p>${uiEsc(message)}</p><div><button type="button" class="btn btn-secondary" data-answer="no">Cancel</button><button type="button" class="btn btn-primary" data-answer="yes">Continue</button></div></div>`;
      let releaseFocus;
      const finish = answer => { overlay.remove(); releaseFocus?.(); resolve(answer); };
      overlay.addEventListener('click', event => {
        const answer = event.target.closest('[data-answer]');
        if (answer) finish(answer.dataset.answer === 'yes');
        else if (event.target === overlay) finish(false);
      });
      document.body.appendChild(overlay);
      releaseFocus = trapDialogFocus(overlay, () => finish(false));
    });
  }

  global.SeoBuddyCore = Object.freeze({ authFetch, bindAction, confirmAction, trapDialogFocus, safeExternalUrl, sanitizeHtml, showToast, uiEsc, loadFeature, relativeTime, readCheckedJson, readHealthScore, healthScoreDataMode });
})(window);
