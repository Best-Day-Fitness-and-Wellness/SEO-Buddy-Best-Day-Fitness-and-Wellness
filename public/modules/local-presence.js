'use strict';

(function exposeLocalPresence(global) {
  const { authFetch, showToast, uiEsc, confirmAction } = global.SeoBuddyCore;
  const citEsc = uiEsc;
  function alert(message) { showToast(message); }

  // --- LOCAL SEO TOOLS ---
  async function lrGenerate(body, outEl, btn) {
    const orig = btn.innerText;
    btn.disabled = true; btn.innerText = 'Generating…';
    try {
      const res = await authFetch('/api/local-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');
      if (data.unavailable) { alert(data.message); return; }
      outEl.value = data.text || '';
    } catch (e) { alert('Error: ' + e.message); }
    finally { btn.disabled = false; btn.innerText = orig; }
  }
  function lrCopy(el, btn) {
    if (!el.value) { alert('Nothing to copy yet.'); return; }
    navigator.clipboard.writeText(el.value);
    const o = btn.innerText; btn.innerText = 'Copied!'; setTimeout(() => btn.innerText = o, 1500);
  }

  // --- LOCAL SEO AUTOPILOT ---
  const laToggle = document.getElementById('la-toggle');
  const laMeta = document.getElementById('la-meta');
  const laNapBadge = document.getElementById('la-nap-badge');
  const laNapBody = document.getElementById('la-nap-body');
  const laGbpBadge = document.getElementById('la-gbp-badge');
  const laGbpBody = document.getElementById('la-gbp-body');
  const laRun = document.getElementById('la-run');
  const laRunNote = document.getElementById('la-run-note');
  const laReplies = document.getElementById('la-replies');
  let laPollTimer = null;
  let laGbpConfigured = false;

  function laAgo(iso) {
    if (!iso) return 'never';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const h = Math.round(mins / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  function laDue(iso, days) {
    if (!iso) return 'due now';
    const rem = (days || 7) - ((Date.now() - new Date(iso).getTime()) / 86400000);
    return rem <= 0 ? 'due now' : ('in ' + Math.ceil(rem) + 'd');
  }

  function laRenderNap(nap, isNew, exclusions = []) {
    if (!laNapBody) return;
    if (!nap) { laNapBadge.innerHTML = ''; laNapBody.innerHTML = '<div class="sb-val">Not checked yet</div><div class="sb-verdict"><i class="sb-dot" style="background:var(--ink-3)"></i>We have not compared your details across the web yet.</div>'; return; }
    const bad = (nap.listings || []).filter(l => l.phoneMatch === false || l.addrMatch === false || l.nameMatch === false);
    laNapBadge.innerHTML = bad.length
      ? `<span class="la-badge new">${isNew ? 'NEW · ' : ''}${bad.length} mismatch${bad.length > 1 ? 'es' : ''}</span>`
      : `<span class="la-badge ok">no recorded mismatches</span>`;
    const unknown = (nap.listings || []).filter(l => ![l.nameMatch, l.addrMatch, l.phoneMatch].includes(false) && [l.nameMatch, l.addrMatch, l.phoneMatch].some(value => value !== true)).length;
    if (!bad.length) laNapBody.innerHTML = `<div class="sb-val">0<u>active listings to fix</u></div><div class="sb-verdict">No mismatches recorded among ${nap.listings.length} monitored listings. ${unknown ? `${unknown} could not be fully verified. ` : ''}Checked ${laAgo(nap.checkedAt)}.</div>`;
    else laNapBody.innerHTML = `<div class="sb-val">${bad.length}<u>listing${bad.length > 1 ? 's' : ''} to fix</u></div>`
      + `<div class="sb-verdict"><i class="sb-dot" style="background:var(--p2-g)"></i>Wrong on ${bad.map(l => citEsc(l.platform || '?')).join(', ')}. Checked ${laAgo(nap.checkedAt)}.</div>`
      + `<details class="sb-disclosure"><summary>Show what differs</summary><div>` + bad.map(l => {
      const issues = []; if (l.phoneMatch === false) issues.push('phone'); if (l.addrMatch === false) issues.push('address'); if (l.nameMatch === false) issues.push('name');
      return `<div class="la-nap-line"><span><b>${citEsc(l.platform || '?')}</b><br><span class="lr-muted">${citEsc(l.phone || '')}<br>${citEsc(l.address || '')}</span><br><button type="button" class="btn btn-secondary btn-xs" data-local-platform="${citEsc(l.platform)}" data-excluded="true">Not relevant</button></span><span class="nap-bad">${issues.join(' + ')} off</span></div>`;
    }).join('') + `<div class="lr-muted" style="margin-top:8px;">Align these to ${citEsc(nap.canonical.phone)} · ${citEsc(nap.canonical.address)}.</div></div></details>`;
    if (exclusions.length) laNapBody.insertAdjacentHTML('beforeend', `<details class="sb-disclosure"><summary>Excluded listings (${exclusions.length})</summary><p class="lr-muted">Excluded from active tasks and the mismatch score, not deleted from external websites. Original scan evidence is retained.</p>${exclusions.map(item => `<div class="la-nap-line"><span><b>${citEsc(item.platform)}</b><br><span class="lr-muted">${citEsc(item.reason)}</span></span><button type="button" class="btn btn-secondary btn-xs" data-local-platform="${citEsc(item.platform)}" data-excluded="false">Restore monitoring</button></div>`).join('')}</details>`);
  }

  if (laNapBody) laNapBody.addEventListener('click', async event => {
    const button = event.target.closest('[data-local-platform]');
    if (!button) return;
    const platform = button.dataset.localPlatform, excluded = button.dataset.excluded === 'true';
    if (!await confirmAction(excluded ? `Mark ${platform} as not relevant? This excludes it from active tasks and mismatch scoring until restored. It does not correct or remove the external listing.` : `Restore monitoring for ${platform}? Recorded mismatches may return to your task list.`)) return;
    button.disabled = true;
    try {
      const response = await authFetch('/api/local-listing-preference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, excluded }) });
      const data = await response.json();
      if (!response.ok || data.success !== true || data.excluded !== excluded) throw new Error(data.error || 'The change was not confirmed.');
      laRenderNap(data.nap, false, data.exclusions);
      document.dispatchEvent(new CustomEvent('seo:readiness-changed'));
      showToast(excluded ? 'Listing excluded. The external listing was not changed.' : 'Listing monitoring restored.');
    } catch (error) { button.disabled = false; alert(error.message); }
  });

  function laRenderGbp(draft) {
    if (!laGbpBody) return;
    if (!draft) { laGbpBadge.innerHTML = ''; laGbpBody.innerHTML = '<span class="lr-muted">No post yet — one is written each week, or click Run now.</span>'; return; }
    laGbpBadge.innerHTML = draft.posted ? '<span class="la-badge ok">POSTED</span>' : (draft.isNew ? '<span class="la-badge new">NEW</span>' : '');
    const postedNote = draft.posted ? `<span class="lr-muted" style="color:var(--color-success)">Posted to Google ${laAgo(draft.postedAt)} ✓</span>`
      : (draft.postError ? `<span class="nap-bad">Auto-post failed: ${citEsc(draft.postError)}</span>` : '');
    const postBtn = (laGbpConfigured && !draft.posted) ? `<button class="btn btn-primary btn-xs" id="la-gbp-post" type="button">Post to Google now</button>` : '';
    // Manual flow (no GBP API): let the owner confirm they posted it to Google themselves.
    const markBtn = !draft.posted ? `<button class="btn btn-secondary btn-xs" id="la-gbp-mark" type="button">&#10003; Mark as posted</button>` : '';
    laGbpBody.innerHTML = `<div class="la-gbp-text">${citEsc(draft.text)}</div>`
      + `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">`
      + `<button class="btn btn-secondary btn-xs" id="la-gbp-copy" type="button">Copy post</button>`
      + postBtn
      + markBtn
      + `<span class="lr-muted">Topic: ${citEsc(draft.topic || '—')} · written ${laAgo(draft.createdAt)}</span>`
      + `</div>`
      + (!draft.posted ? `<div class="lr-muted" style="margin-top:6px;">Copy the post into your Google Business Profile, then tap <b>Mark as posted</b> to clear the reminder.</div>` : '')
      + (postedNote ? `<div style="margin-top:6px;">${postedNote}</div>` : '');
    const cp = document.getElementById('la-gbp-copy');
    if (cp) cp.onclick = () => { navigator.clipboard.writeText(draft.text); cp.innerText = 'Copied ✓'; setTimeout(() => cp.innerText = 'Copy post', 1200); };
    const mb = document.getElementById('la-gbp-mark');
    if (mb) mb.onclick = async () => {
      mb.disabled = true; mb.innerText = 'Saving…';
      try {
        const r = await authFetch('/api/gbp-mark-posted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const dd = await r.json();
        if (!r.ok || !dd.success) throw new Error(dd.error || 'failed');
        draft.posted = true; draft.postedAt = new Date().toISOString(); laRenderGbp(draft);
        if (window.loadHome) window.loadHome();
        if (window.loadGrow) window.loadGrow();
      } catch (e) { alert('Could not update: ' + e.message); mb.disabled = false; mb.innerHTML = '&#10003; Mark as posted'; }
    };
    const pb = document.getElementById('la-gbp-post');
    if (pb) pb.onclick = async () => {
      pb.disabled = true; pb.innerText = 'Posting…';
      try {
        const r = await authFetch('/api/gbp-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft.text }) });
        const dd = await r.json();
        if (dd.needsSetup) { alert(dd.message); pb.disabled = false; pb.innerText = 'Post to Google now'; return; }
        if (!r.ok || !dd.success) throw new Error(dd.error || 'Post failed');
        draft.posted = true; draft.postedAt = new Date().toISOString(); laRenderGbp(draft);
      } catch (e) { alert('Post error: ' + e.message); pb.disabled = false; pb.innerText = 'Post to Google now'; }
    };
  }

  function laRenderReplies(list) {
    if (!laReplies) return;
    if (!list || !list.length) { laReplies.innerHTML = ''; return; }
    laReplies.innerHTML = `<details><summary class="la-mini">Recent saved replies (${list.length})</summary>`
      + list.slice(0, 6).map(r => `<div style="border-top:1px solid var(--border-color);padding:8px 0;font-size:var(--font-xs);"><span class="lr-muted">${r.rating ? ('★' + citEsc(r.rating) + ' · ') : ''}${laAgo(r.createdAt)}</span><br><i>"${citEsc((r.review || '').slice(0, 110))}${(r.review || '').length > 110 ? '…' : ''}"</i><br>${citEsc(r.reply)}</div>`).join('')
      + `</details>`;
  }

  function laRender(s) {
    if (!s) return;
    if (laToggle) laToggle.checked = !!s.enabled;
    if (laMeta) laMeta.innerHTML = s.hasKey
      ? `Autopilot is <b style="color:${s.enabled ? 'var(--color-success)' : 'var(--text-muted)'}">${s.enabled ? 'ON' : 'OFF'}</b> · NAP check ${laDue(s.lastNapRun, s.napIntervalDays)} · GBP post ${laDue(s.lastGbpRun, s.gbpIntervalDays)}`
      : `<span class="nap-bad">Add your Gemini key in Settings to turn the autopilot on.</span>`;
    laRenderNap(s.nap, s.napNewMismatch, s.napExclusions || []);
    laRenderGbp(s.gbpDraft);
    laRenderReplies(s.replyHistory);
    if (s.napNewMismatch || (s.gbpDraft && s.gbpDraft.isNew)) {
      authFetch('/api/local-autopilot/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadLocalAutopilot() {
    try { const g = await (await fetch('/api/gbp-status')).json(); laGbpConfigured = !!g.configured; } catch (e) { /* default off */ }
    try {
      const res = await fetch('/api/local-autopilot');
      const s = await res.json();
      laRender(s);
      if (s.busy) laPoll();
    } catch (e) { /* leave last render */ }
  }
  window.loadLocalAutopilot = loadLocalAutopilot;

  function laPoll() {
    if (laPollTimer) return;
    let n = 0;
    if (laRun) { laRun.disabled = true; laRun.innerText = 'Working… (~1 min)'; }
    laPollTimer = setInterval(async () => {
      n++;
      try {
        const res = await fetch('/api/local-autopilot');
        const s = await res.json();
        laRender(s);
        if (!s.busy || n > 12) { clearInterval(laPollTimer); laPollTimer = null; if (laRun) { laRun.disabled = false; laRun.innerText = 'Run now'; } if (laRunNote) laRunNote.innerText = ''; }
      } catch (e) { clearInterval(laPollTimer); laPollTimer = null; if (laRun) { laRun.disabled = false; laRun.innerText = 'Run now'; } }
    }, 8000);
  }

  if (laToggle) {
    laToggle.addEventListener('change', async () => {
      try { await authFetch('/api/local-autopilot/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: laToggle.checked }) }); loadLocalAutopilot(); }
      catch (e) { alert('Could not update: ' + e.message); }
    });
  }
  if (laRun) {
    laRun.addEventListener('click', async () => {
      laRun.disabled = true; laRun.innerText = 'Starting…';
      try {
        const res = await authFetch('/api/local-autopilot/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await res.json();
        if (d.unavailable) { alert(d.message); laRun.disabled = false; laRun.innerText = 'Run now'; return; }
        if (laRunNote) laRunNote.innerText = 'Running the NAP check and writing your post…';
        setTimeout(laPoll, 1500);
      } catch (e) { alert('Run error: ' + e.message); laRun.disabled = false; laRun.innerText = 'Run now'; }
    });
  }

  // NAP consistency audit
  const btnNapCheck = document.getElementById('btn-nap-check');
  if (btnNapCheck) {
    btnNapCheck.addEventListener('click', async () => {
      const canonEl = document.getElementById('nap-canonical');
      const resEl = document.getElementById('nap-results');
      const orig = btnNapCheck.innerText;
      btnNapCheck.disabled = true; btnNapCheck.innerText = 'Checking the web… (~20–40s)';
      resEl.innerHTML = '<div class="lr-empty">Searching the major platforms for your listings…</div>';
      try {
        const res = await authFetch('/api/nap-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'NAP audit failed');
        canonEl.style.display = 'block';
        canonEl.className = 'nap-canonical';
        canonEl.innerHTML = `<b>Your official info:</b> ${citEsc(data.canonical.name)} &middot; ${citEsc(data.canonical.address)} &middot; ${citEsc(data.canonical.phone)}`;
        if (data.unavailable) { alert(data.message); resEl.innerHTML = ''; return; }
        const rows = data.listings || [];
        if (!rows.length) { resEl.innerHTML = '<div class="lr-empty">No listings came back — your citations may be sparse, which is itself a signal to build more. Try again in a moment.</div>'; return; }
        const cell = (val, match) => {
          const v = citEsc(val || '—');
          if (match === true) return `<td class="nap-ok">✓ ${v}</td>`;
          if (match === false) return `<td class="nap-bad">✗ ${v}</td>`;
          return `<td>${v}</td>`;
        };
        const mism = rows.filter(r => r.phoneMatch === false || r.addrMatch === false || r.nameMatch === false).length;
        resEl.innerHTML = `<p class="lr-muted" style="margin:12px 0 4px;">${mism > 0 ? `<span class="nap-bad">${mism} listing(s) with a mismatch</span> — align these to one consistent NAP.` : 'No mismatches detected in what we found — keep it consistent as you add citations.'}</p>` +
          `<table class="nap-table"><thead><tr><th>Platform</th><th>Name</th><th>Address</th><th>Phone</th></tr></thead><tbody>` +
          rows.map(r => `<tr><td>${citEsc(r.platform || '—')}</td>${cell(r.name, r.nameMatch)}${cell(r.address, r.addrMatch)}${cell(r.phone, r.phoneMatch)}</tr>`).join('') +
          `</tbody></table>`;
      } catch (e) { alert('NAP audit error: ' + e.message); resEl.innerHTML = ''; }
      finally { btnNapCheck.disabled = false; btnNapCheck.innerText = orig; }
    });
  }

  // Review response
  const btnLrResponse = document.getElementById('btn-lr-response');
  if (btnLrResponse) btnLrResponse.addEventListener('click', async () => {
    const review = (document.getElementById('lr-review-text').value || '').trim();
    if (!review) { alert('Paste the review first.'); return; }
    const out = document.getElementById('lr-response-out');
    const orig = btnLrResponse.innerText;
    btnLrResponse.disabled = true; btnLrResponse.innerText = 'Writing…';
    try {
      // Uses /api/local-reply so the draft is saved to the autopilot's reply history.
      const res = await authFetch('/api/local-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review, rating: document.getElementById('lr-review-rating').value }) });
      const d = await res.json();
      if (d.unavailable) { alert(d.message); }
      else if (!res.ok || !d.success) { throw new Error(d.error || 'Generation failed'); }
      else { out.value = d.reply || ''; if (window.loadLocalAutopilot) window.loadLocalAutopilot(); }
    } catch (e) { alert('Error: ' + e.message); }
    finally { btnLrResponse.disabled = false; btnLrResponse.innerText = orig; }
  });
  const btnLrRespCopy = document.getElementById('btn-lr-response-copy');
  if (btnLrRespCopy) btnLrRespCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-response-out'), btnLrRespCopy));

  // Review request
  const btnLrRequest = document.getElementById('btn-lr-request');
  if (btnLrRequest) btnLrRequest.addEventListener('click', () => {
    lrGenerate({ kind: 'review-request', clientName: document.getElementById('lr-req-name').value.trim(), reviewLink: document.getElementById('lr-req-link').value.trim() }, document.getElementById('lr-request-out'), btnLrRequest);
  });
  const btnLrReqCopy = document.getElementById('btn-lr-request-copy');
  if (btnLrReqCopy) btnLrReqCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-request-out'), btnLrReqCopy));

  // GBP post
  const btnLrPost = document.getElementById('btn-lr-post');
  if (btnLrPost) btnLrPost.addEventListener('click', () => {
    const topic = (document.getElementById('lr-post-topic').value || '').trim();
    if (!topic) { alert('Enter what the post is about.'); return; }
    lrGenerate({ kind: 'gbp-post', topic, postType: document.getElementById('lr-post-type').value }, document.getElementById('lr-post-out'), btnLrPost);
  });
  const btnLrPostCopy = document.getElementById('btn-lr-post-copy');
  if (btnLrPostCopy) btnLrPostCopy.addEventListener('click', () => lrCopy(document.getElementById('lr-post-out'), btnLrPostCopy));

  // Local SEO checklist (self-audit, saved in this browser)
  const LR_CHECKLIST = [
    { group: 'Google Business Profile', items: ['GBP claimed & verified', 'Primary + relevant secondary categories set', 'Complete, accurate hours (including holidays)', '10+ quality photos (interior, exterior, team, clients)', 'Full business description with local keywords', 'Services/products listed on the profile', 'A few Q&As seeded on the profile'] },
    { group: 'Reviews', items: ['Actively requesting reviews from happy clients', 'Responding to every review (good and bad)', 'Maintaining a 4.5★+ average', 'Earning at least one new review per week'] },
    { group: 'Name, address and phone', items: ['Name, address and phone identical on your site, Google, Yelp and Facebook', 'Listed in the top local + industry directories', 'Business name consistent (no keyword stuffing)'] },
    { group: 'On‑site Local Signals', items: ['City/service in your title tags and H1s', 'Business details code on your site', 'Google Map and your address in the footer', 'Dedicated location/service pages for key areas'] }
  ];
  const lrChecklistEl = document.getElementById('lr-checklist');
  function lrLoadChecks() { try { return JSON.parse(localStorage.getItem('seo_local_checklist') || '{}'); } catch (e) { return {}; } }
  function lrSaveChecks(o) { localStorage.setItem('seo_local_checklist', JSON.stringify(o)); }
  function lrRenderChecklist() {
    if (!lrChecklistEl) return;
    const checks = lrLoadChecks();
    let total = 0, done = 0;
    // Sentence case, one row per item, custom box so the tick is legible in
    // both themes. The count moves into the section heading, so you know where
    // you stand before reading a single line.
    lrChecklistEl.innerHTML = LR_CHECKLIST.map((g, gi) =>
      `<div class="sb-check-group">${g.group}</div>` + g.items.map((it, ii) => {
        const id = `c${gi}_${ii}`; total++; const on = !!checks[id]; if (on) done++;
        return `<label class="sb-check-item ${on ? 'done' : ''}"><input type="checkbox" data-cid="${id}" ${on ? 'checked' : ''}><span class="sb-box">&#10003;</span><span>${it}</span></label>`;
      }).join('')
    ).join('');
    const pct = total ? Math.round(done / total * 100) : 0;
    document.getElementById('lr-score').innerText = pct + '%';
    document.getElementById('lr-score-fill').style.width = pct + '%';
    document.getElementById('lr-score-label').innerText = `${done} of ${total} complete`;
  }
  if (lrChecklistEl) {
    lrChecklistEl.addEventListener('change', (e) => {
      const cb = e.target;
      if (cb && cb.dataset && cb.dataset.cid) {
        const checks = lrLoadChecks(); checks[cb.dataset.cid] = cb.checked; lrSaveChecks(checks); lrRenderChecklist();
      }
    });
    lrRenderChecklist();
  }

})(window);
