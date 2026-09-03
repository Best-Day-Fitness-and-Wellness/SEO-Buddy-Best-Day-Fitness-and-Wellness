'use strict';

(function exposePerformance(global) {
  const { authFetch, showToast, uiEsc } = global.SeoBuddyCore;
  const citEsc = uiEsc;
  const sumEsc = uiEsc;
  function alert(message) { showToast(message); }
  function switchTab(tabId) { if (global.switchTab) global.switchTab(tabId); }

  // --- PERFORMANCE (measurement / ROI) ---
  function perfLineChart(points, opts) {
    opts = opts || {};
    if (!points || !points.length) return '<div class="perf-empty">Not enough data yet — this fills in over time.</div>';
    const w = 560, h = 150, pad = 26;
    const vals = points.map(p => p.value);
    let min = opts.min != null ? opts.min : Math.min(...vals);
    let max = opts.max != null ? opts.max : Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const n = points.length;
    const x = i => pad + (n === 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad));
    const y = v => h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
    const color = opts.color || 'var(--color-secondary)';
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${color}"/>`).join('');
    const step = Math.max(1, Math.ceil(n / 8));
    const labels = points.map((p, i) => (i % step === 0 || i === n - 1) ? `<text x="${x(i).toFixed(1)}" y="${h - 6}" font-size="9" fill="var(--text-dark)" text-anchor="middle">${p.label}</text>` : '').join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-height:${h}px;"><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }

  // Paints the measurement card's verdict dot alongside the delta text, so
  // polarity is carried by colour as well as by the sentence. Rank improves as
  // it falls, which is what opts.lowerBetter is for.
  function sbDot(el, tone) {
    const card = el.closest ? el.closest('.sb-metric') : null; if (!card) return;
    const dot = card.querySelector('.sb-dot'); if (!dot) return;
    dot.style.background = tone === 'up' ? 'var(--p4-g)' : tone === 'down' ? 'var(--p2-g)' : 'var(--ink-3)';
  }
  function sbMetricEmpty(valueEl, headline, reason, action) {
    const card = valueEl.closest ? valueEl.closest('.sb-metric') : null;
    valueEl.innerText = headline;
    if (!card) return;
    card.classList.add('empty');
    const u = card.querySelector('.sb-val u'); if (u) u.style.display = 'none';
    const d = card.querySelector('.perf-delta'); if (d) { d.className = 'perf-delta flat'; d.innerText = reason || ''; }
    sbDot(card.querySelector('.sb-val'), 'flat');
    // Only one card offers the fix. Three identical buttons for one cause is
    // noise, and the empty state is meant to give a way forward, not nag.
    let act = card.querySelector('.sb-acts');
    if (action) {
      if (!act) { act = document.createElement('div'); act.className = 'sb-acts'; card.appendChild(act); }
      act.innerHTML = '<button class="btn btn-primary btn-sm" type="button">' + action.label + '</button>';
      act.querySelector('button').addEventListener('click', () => switchTab(action.tab));
    } else if (act) { act.remove(); }
  }
  function sbMetricFilled(valueEl) {
    const card = valueEl.closest ? valueEl.closest('.sb-metric') : null; if (!card) return;
    card.classList.remove('empty');
    const u = card.querySelector('.sb-val u'); if (u) u.style.display = '';
  }
  function perfDelta(el, cur, prev, opts) {
    opts = opts || {};
    if (cur == null || prev == null) { el.className = 'perf-delta flat'; el.innerText = ''; sbDot(el, 'flat'); return; }
    const diff = cur - prev;
    if (Math.abs(diff) < (opts.eps || 0.0001)) { el.className = 'perf-delta flat'; el.innerText = 'no change'; sbDot(el, 'flat'); return; }
    const improved = opts.lowerBetter ? diff < 0 : diff > 0;
    el.className = 'perf-delta ' + (improved ? 'up' : 'down');
    sbDot(el, improved ? 'up' : 'down');
    const arrow = improved ? '▲' : '▼';
    if (opts.lowerBetter) {
      el.innerText = `${arrow} ${Math.abs(diff).toFixed(1)} ${improved ? 'better' : 'worse'} (was ${prev})`;
    } else {
      const pct = prev ? Math.round(Math.abs(diff) / prev * 100) : null;
      el.innerText = `${arrow} ${pct != null ? pct + '% ' : ''}${improved ? 'up' : 'down'} (was ${Number(prev).toLocaleString()})`;
    }
  }

  // --- PERFORMANCE WEEKLY DIGEST ---
  const pdCard = document.getElementById('pd-card');
  const pdBody = document.getElementById('pd-body');
  const pdWhen = document.getElementById('pd-when');
  const pdEnabled = document.getElementById('pd-enabled');
  const pdAutoWrap = document.getElementById('pd-autoemail-wrap');
  const pdAutoEmail = document.getElementById('pd-autoemail');
  const pdRun = document.getElementById('pd-run');
  const pdEmail = document.getElementById('pd-email');
  let pdPollTimer = null;

  function pdAgo(iso) { if (!iso) return 'never'; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; }
  function pdRow(label, valHtml) { return `<div class="pd-row"><span>${label}</span><span>${valHtml}</span></div>`; }
  function pdPct(o) { return (o && o.pct != null) ? ` <span class="${o.pct >= 0 ? 'pd-up' : 'pd-down'}">${o.pct >= 0 ? '+' : ''}${o.pct}%</span>` : ''; }

  function pdRenderDigest(d) {
    if (!pdBody) return;
    if (!d) { pdBody.innerHTML = '<div class="perf-hint">No digest yet — click <b>Generate now</b> to build this week’s recap.</div>'; return; }
    let rows = '';
    if (d.clicks) rows += pdRow('Clicks', `<b>${(d.clicks.cur || 0).toLocaleString()}</b>${pdPct(d.clicks)}`);
    if (d.impressions) rows += pdRow('Impressions', `<b>${(d.impressions.cur || 0).toLocaleString()}</b>${pdPct(d.impressions)}`);
    if (d.avgPosition) rows += pdRow('Avg Google rank', `<b>${d.avgPosition.cur}</b>${d.avgPosition.prev != null ? ` <span class="perf-hint" style="display:inline">(was ${d.avgPosition.prev})</span>` : ''}`);
    if (d.aiVisibility != null) rows += pdRow('AI visibility', `<b>${d.aiVisibility}%</b>`);
    if (d.leads) rows += pdRow('New leads', `<b>${d.leads.current}</b>${d.leads.previous != null ? ` <span class="perf-hint" style="display:inline">(was ${d.leads.previous})</span>` : ''}`);
    if (!rows) rows = '<div class="perf-hint">Connect Search Console in Settings for live numbers in your digest.</div>';
    let kw = '';
    if (d.gainers && d.gainers.length) kw += `<div class="pd-kw"><span class="pd-up">&#9650; Rising:</span> ${d.gainers.map(g => sumEsc(g.query)).join(', ')}</div>`;
    if (d.losers && d.losers.length) kw += `<div class="pd-kw"><span class="pd-down">&#9660; Slipping:</span> ${d.losers.map(g => sumEsc(g.query)).join(', ')}</div>`;
    pdBody.innerHTML = rows + kw;
  }

  function pdRender(s) {
    if (!pdCard) return;
    pdCard.style.display = 'block';
    if (pdEnabled) pdEnabled.checked = !!s.enabled;
    if (pdAutoEmail) pdAutoEmail.checked = !!s.autoEmail;
    if (pdAutoWrap) pdAutoWrap.style.display = s.gmailConfigured ? 'block' : 'none';
    if (pdEmail) pdEmail.style.display = s.gmailConfigured ? 'inline-flex' : 'none';
    if (pdWhen) pdWhen.innerHTML = s.digest
      ? `Last built ${pdAgo(s.digest.generatedAt)}${s.digest.emailedAt ? ` · emailed ${pdAgo(s.digest.emailedAt)}` : ''}${!s.gmailConfigured ? ' · <span style="color:var(--color-secondary)">connect Gmail to auto-email</span>' : ''}`
      : 'A plain-English recap of your week, saved automatically.';
    pdRenderDigest(s.digest);
    const perfTabEl = document.getElementById('performance-tab');
    if (s.digest && s.digest.isNew && perfTabEl && perfTabEl.classList.contains('active')) {
      authFetch('/api/performance-digest/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    }
  }

  async function loadPerfDigest() {
    try { const s = await (await fetch('/api/performance-digest')).json(); pdRender(s); if (s.busy) pdPoll(); }
    catch (e) { /* keep last */ }
  }
  window.loadPerfDigest = loadPerfDigest;

  function pdPoll() {
    if (pdPollTimer) return;
    let n = 0;
    if (pdRun) { pdRun.disabled = true; pdRun.innerText = 'Building…'; }
    pdPollTimer = setInterval(async () => {
      n++;
      try {
        const s = await (await fetch('/api/performance-digest')).json();
        pdRender(s);
        if (!s.busy || n > 10) { clearInterval(pdPollTimer); pdPollTimer = null; if (pdRun) { pdRun.disabled = false; pdRun.innerText = 'Generate now'; } }
      } catch (e) { clearInterval(pdPollTimer); pdPollTimer = null; if (pdRun) { pdRun.disabled = false; pdRun.innerText = 'Generate now'; } }
    }, 6000);
  }

  if (pdEnabled) pdEnabled.addEventListener('change', async () => { try { await authFetch('/api/performance-digest/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: pdEnabled.checked }) }); } catch (e) { alert('Could not update: ' + e.message); } });
  if (pdAutoEmail) pdAutoEmail.addEventListener('change', async () => { try { await authFetch('/api/performance-digest/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoEmail: pdAutoEmail.checked }) }); } catch (e) { alert('Could not update: ' + e.message); } });
  if (pdRun) pdRun.addEventListener('click', async () => { pdRun.disabled = true; pdRun.innerText = 'Starting…'; try { const r = await authFetch('/api/performance-digest/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await r.json(); setTimeout(pdPoll, 1200); } catch (e) { alert('Error: ' + e.message); pdRun.disabled = false; pdRun.innerText = 'Generate now'; } });
  if (pdEmail) pdEmail.addEventListener('click', async () => { pdEmail.disabled = true; const o = pdEmail.innerText; pdEmail.innerText = 'Sending…'; try { const r = await authFetch('/api/performance-digest/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const d = await r.json(); if (d.needsSetup) { alert(d.message); } else if (!r.ok || !d.success) { throw new Error(d.error || 'Send failed'); } else { pdEmail.innerText = 'Sent ✓'; setTimeout(() => { pdEmail.innerText = o; pdEmail.disabled = false; }, 1600); return; } } catch (e) { alert('Email error: ' + e.message); } pdEmail.disabled = false; pdEmail.innerText = o; });

  // --- MONTHLY OWNER PDF ---
  const mrEnabled = document.getElementById('mr-enabled');
  const mrRecipient = document.getElementById('mr-recipient');
  const mrStatus = document.getElementById('mr-status');
  const mrSave = document.getElementById('mr-save');
  const mrSend = document.getElementById('mr-send');

  function mrRender(state) {
    if (!mrStatus) return;
    if (mrEnabled) mrEnabled.checked = !!state.enabled;
    if (mrRecipient) mrRecipient.placeholder = state.recipientMasked || 'Owner email address';
    if (!state.enabled) mrStatus.textContent = 'Paused. The manual PDF download is still available.';
    else if (!state.gmailConfigured && !state.recipientConfigured) mrStatus.textContent = 'Needs email setup: connect Gmail, then add the owner address.';
    else if (!state.gmailConfigured) mrStatus.textContent = 'Needs email setup: connect Gmail.';
    else if (!state.recipientConfigured) mrStatus.textContent = 'Needs email setup: add the owner address.';
    else mrStatus.textContent = `Ready for the 1st of each month${state.recipientMasked ? ` · ${state.recipientMasked}` : ''}${state.lastSentAt ? ` · last sent ${pdAgo(state.lastSentAt)}` : ''}.`;
    if (mrSend) mrSend.disabled = !state.ready;
  }

  async function loadMonthlyReport() {
    try { mrRender(await (await fetch('/api/monthly-report')).json()); }
    catch (_) { if (mrStatus) mrStatus.textContent = 'Could not verify monthly delivery. Refresh to retry.'; }
  }
  window.loadMonthlyReport = loadMonthlyReport;

  async function updateMonthlyReport(payload) {
    const response = await authFetch('/api/monthly-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const state = await response.json();
    if (!response.ok || !state.success) throw new Error(state.error || 'Could not save monthly delivery.');
    mrRender(state);
    return state;
  }

  if (mrEnabled) mrEnabled.addEventListener('change', async () => {
    try { await updateMonthlyReport({ enabled: mrEnabled.checked }); }
    catch (error) { mrEnabled.checked = !mrEnabled.checked; alert(error.message); }
  });
  if (mrSave) mrSave.addEventListener('click', async () => {
    const address = mrRecipient ? mrRecipient.value.trim() : '';
    if (!address) { alert('Enter the owner email address to save it.'); return; }
    mrSave.disabled = true;
    try {
      await updateMonthlyReport({ enabled: mrEnabled ? mrEnabled.checked : true, recipient: address });
      mrRecipient.value = '';
      alert('Monthly report delivery saved.');
    } catch (error) { alert(error.message); }
    finally { mrSave.disabled = false; }
  });
  if (mrSend) mrSend.addEventListener('click', async () => {
    mrSend.disabled = true; const original = mrSend.textContent; mrSend.textContent = 'Sending…';
    try {
      const response = await authFetch('/api/monthly-report/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const state = await response.json();
      if (!response.ok || !state.sent) throw new Error(state.message || state.error || 'Could not send the report.');
      mrRender(state); alert('Monthly PDF report sent.');
    } catch (error) { alert(error.message); }
    finally { mrSend.textContent = original; await loadMonthlyReport(); }
  });

  async function loadPerformance() {
    const $ = id => document.getElementById(id);
    if (!$('perf-updated')) return;
    try {
      const res = await fetch('/api/performance');
      const d = await res.json();
      $('perf-updated').innerText = new Date().toLocaleTimeString();
      const badge = $('perf-badge');
      if (d.source === 'live_gsc') { badge.className = 'perf-badge live'; badge.innerText = 'Live Search Console'; }
      else { badge.className = 'perf-badge demo'; badge.innerText = 'Search Console not connected'; }

      const cur = d.current, prev = d.previous;
      if (cur && prev) {
        ['perf-impr', 'perf-clicks', 'perf-rank'].forEach(id => sbMetricFilled($(id)));
        $('perf-impr').innerText = cur.impressions.toLocaleString(); perfDelta($('perf-impr-d'), cur.impressions, prev.impressions, {});
        $('perf-clicks').innerText = cur.clicks.toLocaleString(); perfDelta($('perf-clicks-d'), cur.clicks, prev.clicks, {});
        $('perf-rank').innerText = cur.avgPosition; perfDelta($('perf-rank-d'), cur.avgPosition, prev.avgPosition, { lowerBetter: true, eps: 0.05 });
      } else {
        // A bare em-dash told the owner nothing and offered no way forward.
        const why = 'Search Console isn\u2019t connected — about 5 minutes.';
        sbMetricEmpty($('perf-impr'), 'Not measured yet', why, { label: 'Connect it', tab: 'settings-tab' });
        sbMetricEmpty($('perf-clicks'), 'Not measured yet', why);
        sbMetricEmpty($('perf-rank'), 'Not measured yet', why);
      }

      const leads = d.leads;
      if (leads && leads.available) {
        sbMetricFilled($('perf-leads'));
        $('perf-leads').innerText = leads.current; perfDelta($('perf-leads-d'), leads.current, leads.previous, {});
        const attributed = leads.attribution && Number(leads.attribution.explicitlySearchAttributed || 0);
        $('perf-leads-note').innerText = 'all new GHL contacts' + (leads.approx ? ' (approx.)' : '') + (attributed ? ` · ${attributed} explicitly organic/AI` : ' · source not proven as SEO');
      } else {
        sbMetricEmpty($('perf-leads'), 'Not measured yet', (leads && leads.reason) ? leads.reason : 'GoHighLevel isn\u2019t connected.', { label: 'Connect it', tab: 'settings-tab' });
      }

      // Branded search — real Tier-1 AI-visibility signal (from GSC)
      const br = d.brandedSearch;
      if (br && br.available && br.current) {
        sbMetricFilled($('perf-branded'));
        $('perf-branded').innerText = (br.current.impressions || 0).toLocaleString();
        perfDelta($('perf-branded-d'), br.current.impressions, br.previous ? br.previous.impressions : null, {});
        $('perf-branded-note').innerText = `${(br.current.clicks || 0).toLocaleString()} clicks. Rising means AI is driving awareness.`;
      } else {
        sbMetricEmpty($('perf-branded'), 'Not measured yet', (br && br.reason) ? br.reason : 'Search Console isn\u2019t connected.');
        $('perf-branded-note').innerText = '';
      }

      // AI referral traffic — honest "not connected" state (needs GA4; never fabricated)
      const ar = d.aiReferral;
      if (ar && ar.available && ar.current != null) {
        sbMetricFilled($('perf-airef'));
        $('perf-airef').innerText = Number(ar.current).toLocaleString();
        $('perf-airef-note').innerText = 'Visits from ChatGPT, Perplexity & Claude.';
      } else {
        sbMetricEmpty($('perf-airef'), 'Not measured yet', '');
        $('perf-airef-note').innerText = (ar && ar.reason) ? ar.reason : 'Connect Google Analytics (GA4) to track this.';
      }

      const g = (d.movers && d.movers.gainers) || [], l = (d.movers && d.movers.losers) || [];
      $('perf-gainers').innerHTML = g.length ? g.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="up">▲ ${m.posChange} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear gainers this period yet.</div>';
      $('perf-losers').innerHTML = l.length ? l.map(m => `<div class="perf-mover"><span>${citEsc(m.query)}</span><span class="down">▼ ${Math.abs(m.posChange)} (now #${m.position})</span></div>`).join('') : '<div class="perf-empty">No clear drops this period. </div>';

      const aio = d.aioTrend || [];
      $('perf-aio-chart').innerHTML = aio.length
        ? perfLineChart(aio.map(p => ({ label: p.date.slice(5), value: p.rate })), { min: 0, max: 100, color: 'var(--color-secondary)' }) + `<div class="perf-kpi-note" style="text-align:right;">latest: ${aio[aio.length - 1].rate}% recommended</div>`
        : '<div class="perf-empty">Run AI Search Audits over time to build this trend.</div>';

      const snaps = d.snapshots || [];
      if (snaps.length >= 2) {
        $('perf-snap-chart').innerHTML = perfLineChart(snaps.map(s => ({ label: s.date.slice(5), value: s.impressions })), { color: 'var(--color-primary)' }) + `<div class="perf-kpi-note" style="text-align:right;">${snaps.length} days recorded · impressions/day</div>`;
      } else if (snaps.length === 1) {
        $('perf-snap-chart').innerHTML = `<div class="perf-empty">First snapshot captured (${snaps[0].date}). The trend line appears once there are at least two days of data — check back tomorrow.</div>`;
      } else {
        $('perf-snap-chart').innerHTML = '<div class="perf-empty">No snapshots yet. Connect Search Console, then this records automatically each day.</div>';
      }
    } catch (e) { /* silent */ }
  }
  window.loadPerformance = loadPerformance;

  const perfRefreshBtn = document.getElementById('perf-refresh');
  if (perfRefreshBtn) perfRefreshBtn.addEventListener('click', loadPerformance);

})(window);
