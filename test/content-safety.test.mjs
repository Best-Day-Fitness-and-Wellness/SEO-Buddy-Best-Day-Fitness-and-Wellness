import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { escapeHtml, safeHttpUrl, sanitizeArticleHtml } = require('../lib/content-safety');

test('HTML escaping covers every text-interpolation metacharacter', () => {
  assert.equal(escapeHtml(`<a title="Tom & Jerry's">`), '&lt;a title=&quot;Tom &amp; Jerry&#39;s&quot;&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
});

test('URL validation accepts only credential-free HTTP and HTTPS URLs', () => {
  assert.equal(safeHttpUrl('https://example.test/path?q=1'), 'https://example.test/path?q=1');
  assert.equal(safeHttpUrl('http://example.test'), 'http://example.test/');
  assert.equal(safeHttpUrl('https://user:secret@example.test', '#'), '#');
  assert.equal(safeHttpUrl('javascript:alert(1)', '#'), '#');
  assert.equal(safeHttpUrl('not a url', '/fallback'), '/fallback');
});

test('sanitization removes active and embedded elements while preserving useful formatting', () => {
  const input = '<h2>Keep me</h2><script>alert(1)</script><iframe src="https://bad.test"></iframe><p><strong>Safe</strong></p>';
  assert.equal(sanitizeArticleHtml(input), '<h2>Keep me</h2><p><strong>Safe</strong></p>');
});

test('sanitization removes event handlers and srcdoc attributes', () => {
  const result = sanitizeArticleHtml('<img src="https://example.test/a.jpg" onerror="alert(1)" srcdoc="bad"><p onclick=run()>Text</p>');
  assert.equal(result, '<img src="https://example.test/a.jpg"><p>Text</p>');
});

test('sanitization blocks quoted and bare executable URL schemes', () => {
  const result = sanitizeArticleHtml('<a href="javascript:alert(1)">One</a><img src=data:text/html,bad><formaction action=vbscript:bad>Two</formaction>');
  assert.equal(result, '<a>One</a><img><formaction>Two</formaction>');
});

test('sanitization detects encoded schemes and keeps normal link attributes', () => {
  const result = sanitizeArticleHtml('<a href=" java&#x73;cript&colon;alert(1)">Bad</a><a href="https://example.test/page">Good</a>');
  assert.equal(result, '<a>Bad</a><a href="https://example.test/page">Good</a>');
});

test('sanitization removes executable styles without stripping normal styles', () => {
  const result = sanitizeArticleHtml('<p style="color: red">Safe</p><p style="background:url(https://bad.test)">Bad</p><p style="width:expression(run())">Bad</p>');
  assert.equal(result, '<p style="color: red">Safe</p><p>Bad</p><p>Bad</p>');
});

test('sanitization coerces empty and non-string inputs consistently', () => {
  assert.equal(sanitizeArticleHtml(null), '');
  assert.equal(sanitizeArticleHtml(undefined), '');
  assert.equal(sanitizeArticleHtml(123), '123');
});
