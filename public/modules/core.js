'use strict';

(function exposeCore(global) {
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

  global.SeoBuddyCore = Object.freeze({ authFetch, confirmAction, safeExternalUrl, sanitizeHtml, showToast, uiEsc });
})(window);
