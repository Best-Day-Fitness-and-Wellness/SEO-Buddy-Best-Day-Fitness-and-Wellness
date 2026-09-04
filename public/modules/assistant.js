'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const { authFetch } = window.SeoBuddyCore;
  // --- SEO BUDDY ASSISTANT (grounded copilot) ---
  (function () {
    const fab = document.getElementById('asst-fab');
    const panel = document.getElementById('asst-panel');
    const closeBtn = document.getElementById('asst-close');
    const msgsEl = document.getElementById('asst-msgs');
    const textEl = document.getElementById('asst-text');
    const sendBtn = document.getElementById('asst-send');
    if (!fab || !panel) return;
    const history = [];        // {role:'user'|'assistant', content}
    let greeted = false, busy = false;
    const esc = s => { const d = document.createElement('div'); d.innerText = s == null ? '' : String(s); return d.innerHTML; };
    const BOT_AV = '<span class="asst-bav"><svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg></span>';
  
    function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }
    function addUser(text) {
      const r = document.createElement('div'); r.className = 'asst-row me';
      r.innerHTML = `<div class="asst-bub">${esc(text)}</div>`;
      msgsEl.appendChild(r); scrollDown();
    }
    function fmt(text) { return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
    function addBot(html, chips, action) {
      const r = document.createElement('div'); r.className = 'asst-row bot';
      let inner = `<div class="asst-botwrap"><div class="asst-bub">${html}</div>`;
      if (chips && chips.length) inner += `<div class="asst-chips">${chips.map(c => `<button class="asst-chip" type="button" data-send="${esc(c.send || c.label)}"${c.tour ? ' data-tour="1"' : ''}>${esc(c.label)}</button>`).join('')}</div>`;
      inner += `</div>`;
      r.innerHTML = BOT_AV + inner;
      msgsEl.appendChild(r); scrollDown();
      r.querySelectorAll('.asst-chip').forEach(ch => ch.addEventListener('click', () => {
        send(ch.dataset.send);
      }));
      if (action && (action.endpoint || action.clientAction)) renderAction(r.querySelector('.asst-botwrap'), action);
    }
    function replaceBtns(card, html) { const b = card.querySelector('.asst-action-btns'); if (b) b.outerHTML = html; }
    function htmlToText(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim(); }
    // After a confirm succeeds, some actions produce a follow-up card from the response.
    const CHAIN = {
      write_article: d => (d && d.content) ? { kind: 'content', id: 'publish_article', title: `Publish “${String(d.title || 'your article').slice(0, 60)}”`, preview: htmlToText(d.content).slice(0, 220) + '…', confirmLabel: 'Publish it', endpoint: '/api/publish-ghl', method: 'POST', body: { title: d.title, content: d.content, status: 'published', keyword: d.title }, tab: 'publish-tab', done: 'Published to your site.' } : null,
      publish_article: d => (d && d.url) ? { kind: 'run', id: 'index_article', title: 'Ask Google to index it', note: `Live at ${d.url}. Request indexing so it shows up in search faster.`, confirmLabel: 'Request indexing', endpoint: '/api/index-url', method: 'POST', body: { url: d.url }, tab: 'publish-tab', done: 'Google indexing requested.' } : null,
      draft_citation_pitch: d => (d && (d.body || d.subject)) ? { kind: 'email', id: 'send_pitch', title: 'Send this pitch', to: d.email || '', subject: d.subject || '', previewBody: d.body || '', contactUrl: d.contactUrl || '', confirmLabel: 'Send via Gmail', endpoint: '/api/send-pitch', method: 'POST', body: { to: d.email || '', subject: d.subject || '', body: d.body || '' }, tab: 'citations-tab', done: 'Pitch sent via Gmail.' } : null
    };
    function renderAction(wrap, action) {
      const card = document.createElement('div'); card.className = 'asst-action';
      const icon = (action.kind === 'content' || action.kind === 'email') ? '&#9998;' : '&#9889;';
      let html = `<div class="asst-action-h">${icon} ${esc(action.title)}</div>`;
      if (action.kind === 'email') {
        html += `<div class="asst-action-body">` +
          `<div style="color:var(--text-dark);font-size:11px;">TO</div><div style="color:var(--text-main);margin-bottom:6px;">${esc(action.to || '(no address found — use the contact page)')}</div>` +
          `<div style="color:var(--text-dark);font-size:11px;">SUBJECT</div><div style="color:var(--text-main);margin-bottom:6px;">${esc(action.subject)}</div>` +
          `<div style="color:var(--text-dark);font-size:11px;">MESSAGE</div><div class="preview" style="font-style:italic;">${esc(action.previewBody)}</div></div>`;
      } else if (action.kind === 'content' && action.preview) { html += `<div class="asst-action-body preview">${esc(action.preview)}</div>`; }
      else if (action.note) { html += `<div class="asst-action-body">${esc(action.note)}</div>`; }
      const canCopy = action.kind === 'content' || action.kind === 'email';
      const contactLink = (action.kind === 'email' && action.contactUrl) ? `<a class="asst-btn" href="${esc(action.contactUrl)}" target="_blank" rel="noopener" style="text-decoration:none;">Contact page</a>` : '';
      html += `<div class="asst-action-btns"><button class="asst-btn primary" data-act="go" type="button">${esc(action.confirmLabel)}</button>${canCopy ? '<button class="asst-btn" data-act="copy" type="button">Copy</button>' : ''}${contactLink}<button class="asst-btn" data-act="cancel" type="button">Cancel</button></div>`;
      card.innerHTML = html;
      wrap.appendChild(card); scrollDown();
      card.querySelector('[data-act="cancel"]').addEventListener('click', () => replaceBtns(card, '<div class="asst-result" style="color:var(--text-dark)">Cancelled — nothing happened.</div>'));
      const copyBtn = card.querySelector('[data-act="copy"]');
      if (copyBtn) copyBtn.addEventListener('click', () => { try { navigator.clipboard.writeText(action.kind === 'email' ? (action.previewBody || '') : (action.preview || '')); } catch (e) {} copyBtn.innerText = 'Copied ✓'; });
      card.querySelector('[data-act="go"]').addEventListener('click', async (e) => {
        const go = e.currentTarget; go.disabled = true; go.innerText = 'Working…';
        try {
          // Client-side actions (e.g. build a PDF) run in the browser, no endpoint.
          if (action.clientAction === 'pdf') {
            if (window.generateSeoReportPdf) await window.generateSeoReportPdf();
            replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}</div>`);
            return;
          }
          const r = await authFetch(action.endpoint, { method: action.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.body || {}) });
          const d = await r.json().catch(() => ({}));
          if (d && d.budgetReached) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(d.message || 'Monthly usage budget reached.')}</div>`); return; }
          if (d && d.needsSetup) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(d.message || 'This needs a quick setup first.')}${canCopy ? ' Your draft is above — copy it to use it now.' : ''}</div>`); return; }
          if (!r.ok || d.success === false) throw new Error((d && d.error) || "It didn't go through.");
          if (action.id === 'set_local_listing_relevance') {
            if (d.success !== true || d.excluded !== action.body.excluded) throw new Error('The listing change was not confirmed.');
            if (window.loadLocalAutopilot) window.loadLocalAutopilot();
            document.dispatchEvent(new CustomEvent('seo:readiness-changed'));
          }
          const next = CHAIN[action.id] ? CHAIN[action.id](d) : null;
          if (next) { replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}</div>`); renderAction(card.parentElement, next); return; }
          const link = action.tab ? ` <a data-open="${esc(action.tab)}">Open the tab &rarr;</a>` : '';
          replaceBtns(card, `<div class="asst-result">&#10003; ${esc(action.done)}${link}</div>`);
          const a = card.querySelector('a[data-open]'); if (a) a.addEventListener('click', () => { close(); if (window.__switchTab) window.__switchTab(a.dataset.open); });
        } catch (err) { replaceBtns(card, `<div class="asst-result warn">&#9888; ${esc(err.message)}</div>`); }
      });
    }
    let typingRow = null;
    function showTyping() { typingRow = document.createElement('div'); typingRow.className = 'asst-row bot'; typingRow.innerHTML = BOT_AV + '<div class="asst-typing"><span></span><span></span><span></span></div>'; msgsEl.appendChild(typingRow); scrollDown(); }
    function hideTyping() { if (typingRow) { typingRow.remove(); typingRow = null; } }
  
    function greet() {
      if (greeted) return; greeted = true;
      addBot("Hi! I can see everything in your SEO Buddy. Ask me how you're doing, what to fix next, or how a tool works.", [
        { label: 'How am I doing?' },
        { label: 'Who’s beating me in AI?', send: "Who's beating me in AI search right now?" },
        { label: 'What should I fix first?' }
      ]);
    }
    async function send(text) {
      text = (text || textEl.value || '').trim();
      if (!text || busy) return;
      textEl.value = ''; textEl.style.height = 'auto';
      addUser(text); history.push({ role: 'user', content: text });
      busy = true; sendBtn.disabled = true; showTyping();
      try {
        const r = await authFetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12) }) });
        const d = await r.json();
        hideTyping();
        if (!r.ok || !d.success) throw new Error(d.error || 'Something went wrong.');
        const reply = d.reply || "I'm not sure how to answer that.";
        addBot(fmt(reply), null, d.action);
        history.push({ role: 'assistant', content: reply });
      } catch (e) {
        hideTyping();
        addBot(esc('Sorry — I hit a snag: ' + e.message + ' (If the app is password-protected, enter it in Settings.)'));
      } finally { busy = false; sendBtn.disabled = false; textEl.focus(); }
    }
    function open() { panel.classList.add('open'); document.body.classList.add('asst-open'); fab.style.display = 'none'; greet(); setTimeout(() => textEl.focus(), 50); }
    function close() { panel.classList.remove('open'); document.body.classList.remove('asst-open'); fab.style.display = 'inline-flex'; }
  
    fab.addEventListener('click', open);
    // Starter questions in the dock. They teach people what the assistant can
    // answer, which a bare bubble never did.
    document.querySelectorAll('.sb-dock-wrap .sb-chip').forEach(chip => {
      chip.addEventListener('click', () => { open(); setTimeout(() => send(chip.dataset.ask || chip.textContent.trim()), 260); });
    });
    closeBtn.addEventListener('click', close);
    sendBtn.addEventListener('click', () => send());
    textEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    textEl.addEventListener('input', () => { textEl.style.height = 'auto'; textEl.style.height = Math.min(textEl.scrollHeight, 90) + 'px'; });
  })();
});
