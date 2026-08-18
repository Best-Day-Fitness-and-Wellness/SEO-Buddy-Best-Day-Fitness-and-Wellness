'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function safeHttpUrl(value, fallback = '') {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? parsed.toString()
      : fallback;
  } catch (_) {
    return fallback;
  }
}

function sanitizeArticleHtml(value) {
  const safeActiveAttribute = (_match, name, quote, quotedValue, bareValue) => {
    const raw = String(quotedValue == null ? bareValue : quotedValue);
    const decoded = raw
      .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (_, decimal) => String.fromCharCode(parseInt(decimal, 10)))
      .replace(/&colon;/gi, ':')
      .replace(/[\u0000-\u0020]+/g, '')
      .toLowerCase();
    if (/^(?:javascript|vbscript|data):/.test(decoded)) return '';
    return quotedValue == null ? ` ${name}=${bareValue}` : ` ${name}=${quote}${quotedValue}${quote}`;
  };

  return String(value || '')
    .replace(/<(script|iframe|object|embed|form|style|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|form|style|svg|math)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction)\s*=\s*(["'])([\s\S]*?)\2/gi, safeActiveAttribute)
    .replace(/\s(href|src|action|formaction)\s*=\s*([^\s>]+)/gi,
      (match, name, bareValue) => safeActiveAttribute(match, name, '', null, bareValue))
    .replace(/\sstyle\s*=\s*(["'])[^"']*(?:expression\s*\(|url\s*\(|@import|javascript:)[^"']*\1/gi, '');
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

module.exports = { escapeHtml, jsonForHtml, safeHttpUrl, sanitizeArticleHtml };
