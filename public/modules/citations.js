'use strict';

(function exposeCitationFeature(global) {
  const { authFetch, showToast, uiEsc } = global.SeoBuddyCore;
  function alert(message) { showToast(message); }

  // --- CITATION OUTREACH ENGINE ---
  // The finder runs server-side and is cached; this tab shows the ACTION
  // worklist: listing kit, per-target pitch/listing assets, and a tracker.
  const citationsQueries = document.getElementById('citations-queries');
  const btnCitScan = document.getElementById('btn-find-citations');
  const btnCitSettings = document.getElementById('btn-cit-settings');
  const citSettingsPanel = document.getElementById('cit-settings-panel');
  const citLastScanned = document.getElementById('cit-last-scanned');
  const citProgress = document.getElementById('cit-progress');
  const citKit = document.getElementById('cit-kit');
  const citKitHead = document.getElementById('cit-kit-head');
  const citKitBody = document.getElementById('cit-kit-body');
  const citKitCaret = document.getElementById('cit-kit-caret');
  const citationsResults = document.getElementById('citations-results');
  const citAutoToggle = document.getElementById('cit-auto-toggle');

  let citLastData = { targets: [], brandCited: false };
  const CIT_TOTAL = { t: 0 };
  let citGmailConfigured = false;

  if (citationsQueries && !citationsQueries.value.trim()) {
    citationsQueries.value = 'senior fitness st petersburg fl\npersonal trainer st petersburg fl\nbest gym for seniors near me';
  }

  const citEsc = uiEsc;
  function citAttr(s) { return JSON.stringify(String(s == null ? '' : s)).replace(/"/g, '&quot;'); }
  window._citCopy = function (text, el) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => {
      if (el) { const o = el.innerText; el.innerText = 'Copied ✓'; setTimeout(() => { el.innerText = o; }, 1200); }
    }).catch(() => { if (el) { el.innerText = 'Copy failed'; } });
  };

  function citTimeAgo(iso) {
    if (!iso) return 'Not scanned yet';
    const then = new Date(iso).getTime();
    if (isNaN(then)) return 'Not scanned yet';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'Scanned just now';
    if (mins < 60) return 'Scanned ' + mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return 'Scanned ' + hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
    const days = Math.round(hrs / 24);
    return 'Scanned ' + days + ' day' + (days > 1 ? 's' : '') + ' ago';
  }

  function citActLabel(mode) {
    return mode === 'listing' ? '⚙ Prep listing'
      : mode === 'pitch' ? '✎ Draft & send pitch'
      : mode === 'maintain' ? 'Maintain'
      : 'Why skip?';
  }

  function citRenderProgress(counts, brandCited) {
    if (!citProgress) return;
    if (!counts || !counts.total) { citProgress.style.display = 'none'; return; }
    const worked = Math.min(counts.total, counts.inProgress + counts.live);
    const pct = counts.total ? Math.round((worked / counts.total) * 100) : 0;
    citProgress.style.display = 'grid';
    citProgress.innerHTML =
      `<div class="cit-pstat"><b>${counts.total}</b><span>sources AI cites</span></div>` +
      `<div class="cit-pstat"><b>${counts.listed}</b><span>you already appear on</span></div>` +
      `<div class="cit-pstat"><b>${counts.inProgress}</b><span>in progress</span></div>` +
      `<div class="cit-pstat live"><b>${counts.live}</b><span>listed / live</span></div>` +
      `<div class="cit-bar"><div class="cit-bar-top"><span>Citation gap progress</span><span>${worked} of ${counts.total} worked</span></div>` +
        `<div class="cit-bar-track"><div class="cit-bar-fill" style="width:${pct}%;"></div></div></div>`;
  }

  function citRenderKit(kit) {
    if (!citKit || !kit) return;
    citKit.style.display = 'block';
    const socials = (kit.socials || []).map(s => `<a href="${citEsc(s)}" target="_blank" rel="noopener" style="color:var(--color-secondary);">${citEsc(s.replace(/^https?:\/\/(www\.)?/, ''))}</a>`).join('  ·  ');
    const cats = (kit.categories || []).map(c => `<span class="cit-chip">${citEsc(c)}</span>`).join('');
    const napLine = `${kit.name} · ${kit.addressOneLine} · ${kit.phone}`;
    function kf(label, valHtml, copyText) {
      const copy = copyText != null ? `<span class="cit-copy" onclick="window._citCopy(${citAttr(copyText)}, this)">copy</span>` : '';
      return `<div class="cit-kf"><div class="kf-lbl"><span>${label}</span>${copy}</div><div class="kf-val">${valHtml}</div></div>`;
    }
    citKitBody.innerHTML =
      `<div class="cit-kit-grid">` +
        kf('Name / Address / Phone', citEsc(napLine), napLine) +
        kf('Website', `<a href="${citEsc(kit.website)}" target="_blank" rel="noopener" style="color:var(--color-secondary);">${citEsc(kit.website)}</a>`, kit.website) +
        kf('Categories', cats, (kit.categories || []).join(', ')) +
        kf('Short description (≤160 chars)', citEsc(kit.shortDesc), kit.shortDesc) +
        kf('Long description', citEsc(kit.longDesc), kit.longDesc) +
        kf('Social profiles', socials || '<span class="text-muted">—</span>', (kit.socials || []).join('  ')) +
        kf('Photo checklist', (kit.photoChecklist || []).map(p => '☐ ' + citEsc(p)).join('&nbsp;&nbsp; '), null) +
      `</div>` +
      `<div style="margin-top:12px;"><button class="cit-pa" id="btn-cit-kit-regen" type="button">↻ Regenerate descriptions with AI</button></div>` +
      `<div class="cit-hint">Paste these exact details on every site so they match everywhere — matching is what lifts your local ranking. The number we treat as correct is <b>(727) 334-1472</b>.</div>`;
    const regen = document.getElementById('btn-cit-kit-regen');
    if (regen) regen.onclick = citRegenKit;
  }

  async function citRegenKit() {
    const btn = document.getElementById('btn-cit-kit-regen');
    if (btn) { btn.disabled = true; btn.innerText = 'Regenerating…'; }
    try {
      const res = await authFetch('/api/listing-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (data.kit) citRenderKit(data.kit);
    } catch (e) { alert('Could not regenerate: ' + e.message); }
    finally { const b = document.getElementById('btn-cit-kit-regen'); if (b) { b.disabled = false; b.innerText = '↻ Regenerate descriptions with AI'; } }
  }

  function citStatusSelect(domain, cur) {
    const opts = [['todo', 'To-do'], ['submitted', 'Submitted'], ['pitched', 'Pitched'], ['live', 'Live']];
    const liveCls = cur === 'live' ? ' live' : '';
    return `<select class="cit-status${liveCls}" data-domain="${citEsc(domain)}">` +
      opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('') +
      `</select>`;
  }

  function citRecount() {
    const targets = citLastData.targets || [];
    citRenderProgress({
      total: targets.length,
      listed: targets.filter(t => t.listed === true).length,
      inProgress: targets.filter(t => ['submitted', 'pitched'].includes(t.status)).length,
      live: targets.filter(t => t.status === 'live' || t.listed === true).length
    }, citLastData.brandCited);
  }

  async function citSetStatus(domain, status, sel) {
    if (sel) sel.classList.toggle('live', status === 'live');
    const tgt = (citLastData.targets || []).find(t => t.domain === domain);
    if (tgt) tgt.status = status;
    citRecount();
    try {
      await authFetch('/api/citation-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, status }) });
    } catch (e) { /* non-fatal — UI already updated */ }
  }

  function gmailComposeUrl(to, subject, body) {
    let u = 'https://mail.google.com/mail/?view=cm&fs=1';
    if (to && to.indexOf('@') > -1) u += '&to=' + encodeURIComponent(to);
    return u + '&su=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }

  async function citDoAction(btn) {
    const card = btn.closest('.cit-card');
    const panel = card ? card.querySelector('.cit-panel') : null;
    const domain = btn.dataset.domain, type = btn.dataset.type;
    if (!panel) return;
    if (panel.style.display === 'block' && panel.dataset.loaded === '1') { panel.style.display = 'none'; panel.dataset.loaded = ''; return; }
    panel.style.display = 'block';
    panel.innerHTML = '<div class="cit-hint">Preparing…</div>';
    const tgt = (citLastData.targets || []).find(t => t.domain === domain) || {};
    try {
      const res = await authFetch('/api/citation-outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, type, queries: tgt.queries || [] })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not prepare this action.');
      panel.dataset.loaded = '1';

      if (data.kind === 'skip') { panel.innerHTML = `<div class="cit-hint">${citEsc(data.message)}</div>`; return; }

      if (data.kind === 'listing') {
        const f = data.fields || {};
        const allText = `${f.name}\n${f.address}\n${f.phone}\n${f.website}\nCategories: ${f.categories}\n\n${f.description}`;
        panel.innerHTML =
          `<div class="cit-panel-tag">✦ Ready-to-paste listing — matches your Listing Kit</div>` +
          `<div class="cit-pl">` +
            `<div class="row"><span class="k">Name</span><span>${citEsc(f.name)}</span></div>` +
            `<div class="row"><span class="k">Address</span><span>${citEsc(f.address)}</span></div>` +
            `<div class="row"><span class="k">Phone</span><span>${citEsc(f.phone)}</span></div>` +
            `<div class="row"><span class="k">Website</span><span>${citEsc(f.website)}</span></div>` +
            `<div class="row"><span class="k">Categories</span><span>${citEsc(f.categories)}</span></div>` +
            `<div class="row"><span class="k">Description</span><span>${citEsc(f.description)}</span></div>` +
          `</div>` +
          (data.howTo ? `<div class="cit-hint">${citEsc(data.howTo)}</div>` : '') +
          `<div class="cit-panel-actions">` +
            `<a class="cit-pa open" href="${citEsc(data.claimUrl)}" target="_blank" rel="noopener">↗ Open claim page</a>` +
            `<button class="cit-pa" type="button" onclick="window._citCopy(${citAttr(allText)}, this)">Copy all fields</button>` +
          `</div>`;
        return;
      }

      if (data.kind === 'pitch') {
        if (data.unavailable) { panel.innerHTML = `<div class="cit-hint">${citEsc(data.message)}</div>`; return; }
        const foundEmail = (data.email && data.email.indexOf('@') > -1) ? data.email : '';
        const contactUrl = data.contactUrl || ('https://' + domain);
        const emailText = `To: ${foundEmail || '(find recipient — see contact page)'}\nSubject: ${data.subject}\n\n${data.body}`;
        // Always give an editable, pre-addressed recipient box — prefilled with the real email we found (if any).
        const toCell = `<span style="flex:1;"><input class="cit-to-input" type="email" value="${citEsc(foundEmail)}" placeholder="name@publication.com" style="width:100%;background:rgba(0,0,0,.3);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;padding:5px 8px;font-family:inherit;font-size:13px;"></span>`;
        // Send/open action: direct Gmail send when connected, otherwise open a Gmail draft addressed to whatever's in the box.
        const sendControl = citGmailConfigured
          ? `<button class="cit-pa send cit-send-now" type="button">✉ Send now</button>`
          : `<button class="cit-pa send cit-open-gmail" type="button">✉ Open in Gmail</button>`;
        const recipientHint = foundEmail
          ? `Found this address published for ${citEsc(domain)} — double-check it’s the right desk before sending. `
          : `No public email is listed for this site, so the box is blank — open the contact page to find the right person, then paste it above. `;
        panel.innerHTML =
          `<div class="cit-panel-tag">✦ AI-drafted outreach — personalized to this source</div>` +
          `<div class="cit-eml">` +
            `<div class="row"><span class="k">To</span>${toCell}</div>` +
            `<div class="row"><span class="k">Subject</span><span>${citEsc(data.subject)}</span></div>` +
          `</div>` +
          `<div class="cit-body-txt">${citEsc(data.body)}</div>` +
          `<div class="cit-hint">${recipientHint}${citEsc(data.howToFind || '')}</div>` +
          `<div class="cit-panel-actions">` +
            sendControl +
            `<a class="cit-pa open" href="${citEsc(contactUrl)}" target="_blank" rel="noopener">↗ Contact page</a>` +
            `<button class="cit-pa" type="button" onclick="window._citCopy(${citAttr(emailText)}, this)">Copy email</button>` +
            `<button class="cit-pa cit-regen" type="button">↻ Regenerate</button>` +
          `</div>`;
        const rg = panel.querySelector('.cit-regen');
        if (rg) rg.addEventListener('click', () => { panel.dataset.loaded = ''; citDoAction(btn); });
        const og = panel.querySelector('.cit-open-gmail');
        if (og) og.addEventListener('click', () => {
          const toVal = ((panel.querySelector('.cit-to-input') || {}).value || '').trim();
          if (toVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toVal)) { alert('That doesn’t look like a valid email — fix it or leave it blank to fill in Gmail.'); return; }
          window.open(gmailComposeUrl(toVal, data.subject, data.body), '_blank', 'noopener');
        });
        const sn = panel.querySelector('.cit-send-now');
        if (sn) sn.addEventListener('click', async () => {
          const toVal = ((panel.querySelector('.cit-to-input') || {}).value || '').trim();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toVal)) { alert('Enter the recipient’s email address to send.'); return; }
          sn.disabled = true; sn.innerText = 'Sending…';
          try {
            const r = await authFetch('/api/send-pitch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: toVal, subject: data.subject, body: data.body }) });
            const dd = await r.json();
            if (dd.needsSetup) { alert(dd.message); sn.disabled = false; sn.innerText = '✉ Send now'; return; }
            if (!r.ok || !dd.success) throw new Error(dd.error || 'Send failed');
            sn.innerText = 'Sent ✓';
            const sel = card.querySelector('.cit-status'); if (sel) { sel.value = 'pitched'; citSetStatus(domain, 'pitched', sel); }
          } catch (e) { alert('Send error: ' + e.message); sn.disabled = false; sn.innerText = '✉ Send now'; }
        });
        return;
      }
      panel.innerHTML = `<div class="cit-hint">Nothing to prepare for this source.</div>`;
    } catch (e) {
      panel.innerHTML = `<div class="cit-hint">Error: ${citEsc(e.message)}</div>`;
    }
  }

  function citRenderWorklist(targets, total) {
    CIT_TOTAL.t = total || (targets && targets.length) || 0;
    if (!citationsResults) return;
    if (!targets || !targets.length) {
      citationsResults.innerHTML = '<div class="cit-empty">No worklist yet. Click <b>Scan now</b> to find the third‑party sources AI cites for your searches — then this becomes your get‑listed to‑do list.</div>';
      return;
    }
    citationsResults.innerHTML = targets.map((t, i) => {
      const listedTxt = t.listed === true ? 'You appear here' : (t.listed === false ? 'Not listed' : 'Unknown');
      const listedCls = t.listed === true ? 'yes' : (t.listed === false ? 'no' : 'unknown');
      const typeCls = ['directory', 'review', 'listicle', 'forum', 'competitor'].includes(t.type) ? ('type-' + t.type) : '';
      const actGhost = (t.mode === 'maintain' || t.mode === 'skip') ? ' ghost' : '';
      return `<div class="cit-card" data-domain="${citEsc(t.domain)}">
        <div class="cit-rank">${i + 1}</div>
        <div class="cit-body">
          <div class="cit-domain"><a href="https://${citEsc(t.domain)}" target="_blank" rel="noopener">${citEsc(t.domain)}</a></div>
          <div class="cit-meta">
            ${t.isNew ? '<span class="cit-badge cit-new">NEW</span>' : ''}
            <span class="cit-badge ${typeCls}">${citEsc(t.type)}</span>
            <span class="cit-listed ${listedCls}">${listedTxt}</span>
            <span class="cit-cited">cited in ${t.citedFor} of ${CIT_TOTAL.t} searches</span>
          </div>
          ${t.note ? `<div class="cit-note">${citEsc(t.note)}</div>` : ''}
          <div class="cit-panel" style="display:none;"></div>
        </div>
        <div class="cit-side">
          ${citStatusSelect(t.domain, t.status)}
          <button class="cit-act${actGhost}" type="button" data-domain="${citEsc(t.domain)}" data-type="${citEsc(t.type)}" data-mode="${citEsc(t.mode)}">${citActLabel(t.mode)}</button>
        </div>
      </div>`;
    }).join('');
    citationsResults.querySelectorAll('.cit-status').forEach(sel => {
      sel.addEventListener('change', () => citSetStatus(sel.dataset.domain, sel.value, sel));
    });
    citationsResults.querySelectorAll('.cit-act').forEach(b => {
      b.addEventListener('click', () => citDoAction(b));
    });
  }

  function citRenderAll(data) {
    citLastData = data || { targets: [] };
    citRenderKit(data.kit);
    if (citLastScanned) citLastScanned.innerText = citTimeAgo(data.lastScanned);
    if (citAutoToggle) citAutoToggle.checked = !!data.autoEnabled;
    citRenderProgress(data.counts, data.brandCited);
    citRenderWorklist(data.targets, data.totalQueries);
    if (data.queries && data.queries.length && citationsQueries) citationsQueries.value = data.queries.join('\n');
    // Clear NEW-target flags server-side only once the worklist is actually
    // on screen (not on the background startup load, which runs while another
    // tab is active — otherwise the badges would clear before you see them).
    const citTabEl = document.getElementById('citations-tab');
    if (data.newDomains && data.newDomains.length && citTabEl && citTabEl.classList.contains('active')) {
      authFetch('/api/citation-autopilot/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadCitationWorklist() {
    fetch('/api/gmail-status').then(r => r.json()).then(g => { citGmailConfigured = !!g.configured; }).catch(() => {});
    try {
      const res = await fetch('/api/citation-worklist');
      const data = await res.json();
      citRenderAll(data);
    } catch (e) {
      if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Could not load the worklist. ' + citEsc(e.message) + '</div>';
    }
  }
  window.loadCitationWorklist = loadCitationWorklist;

  if (btnCitSettings && citSettingsPanel) {
    btnCitSettings.addEventListener('click', () => {
      citSettingsPanel.style.display = (citSettingsPanel.style.display === 'none') ? 'block' : 'none';
    });
  }
  if (citKitHead) {
    citKitHead.addEventListener('click', () => {
      const show = citKitBody.style.display === 'none';
      citKitBody.style.display = show ? 'block' : 'none';
      if (citKitCaret) citKitCaret.innerHTML = show ? '&#9652; hide' : '&#9662; show';
    });
  }

  if (citAutoToggle) {
    citAutoToggle.addEventListener('change', async () => {
      try { await authFetch('/api/citation-autopilot/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: citAutoToggle.checked }) }); }
      catch (e) { alert('Could not update: ' + e.message); }
    });
  }

  if (btnCitScan) {
    btnCitScan.addEventListener('click', async () => {
      const queries = (citationsQueries.value || '').split('\n').map(s => s.trim()).filter(Boolean);
      if (!queries.length) { alert('Add at least one search query in Search settings (one per line).'); return; }
      btnCitScan.disabled = true;
      const orig = btnCitScan.innerText;
      btnCitScan.innerText = 'Scanning… (~30–60s)';
      if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Running live Google‑grounded searches and building your worklist… please wait.</div>';
      try {
        const res = await authFetch('/api/citation-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }) });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Scan failed');
        if (data.unavailable) { alert(data.message); return; }
        citRenderAll(data);
      } catch (e) {
        alert('Scan error: ' + e.message);
        if (citationsResults) citationsResults.innerHTML = '<div class="cit-empty">Something went wrong. ' + citEsc(e.message) + '</div>';
      } finally {
        btnCitScan.disabled = false;
        btnCitScan.innerText = orig;
      }
    });
  }

})(window);
