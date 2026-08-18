(function exposeContentSafety(global) {
  'use strict';

  const core = global.SeoBuddyCore = global.SeoBuddyCore || {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function safeExternalUrl(value) {
    try {
      const parsed = new URL(String(value || ''), global.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
        ? parsed.href
        : '#';
    } catch (_) {
      return '#';
    }
  }

  function sanitizeHtml(value) {
    const template = global.document.createElement('template');
    template.innerHTML = String(value || '');
    template.content
      .querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,option,meta,link,base,svg,math')
      .forEach(node => node.remove());

    template.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const raw = attribute.value.trim();
        if (name.startsWith('on') || name === 'srcdoc') {
          node.removeAttribute(attribute.name);
        } else if (['href', 'src', 'action', 'formaction'].includes(name)) {
          let protocol = '';
          try { protocol = new URL(raw, global.location.origin).protocol; } catch (_) { /* invalid URL */ }
          if (!['http:', 'https:'].includes(protocol)) node.removeAttribute(attribute.name);
        } else if (name === 'style' && /(expression\s*\(|url\s*\(|@import|javascript:)/i.test(raw)) {
          node.removeAttribute(attribute.name);
        }
      });

      if (node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer');
        if (node.getAttribute('target') === '_blank') node.setAttribute('target', '_blank');
      }
    });

    return template.innerHTML;
  }

  Object.assign(core, { escapeHtml, safeExternalUrl, sanitizeHtml });
})(window);
