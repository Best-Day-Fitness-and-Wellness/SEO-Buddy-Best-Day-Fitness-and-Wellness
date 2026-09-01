'use strict';

(function exposeSearchOpportunities(global) {
  const { authFetch, uiEsc } = global.SeoBuddyCore;
  const citEsc = uiEsc;

  const gscTableBody = document.getElementById('gsc-table-body');
  const filterLeaksBtn = document.getElementById('filter-leaks');
  const filterAllBtn = document.getElementById('filter-all');
  const syncGscBtn = document.getElementById('btn-refresh-gsc');
  const statGapCount = document.getElementById('stat-gap-count');
  const statTotalImpressions = document.getElementById('stat-total-impressions');
  const statAvgCtr = document.getElementById('stat-avg-ctr');
  let gscData = [];
  let filterMode = 'leaks';

  // --- GSC DATA & SYNC SYSTEM ---
  async function syncGSCData() {
    gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Syncing with Search Console... Please wait.</td></tr>`;

    try {
      const res = await fetch('/api/gsc-data');
      const payload = await res.json();

      gscData = payload.data || [];

      // Update GSC Badge
      global.setDataMode(payload.source === 'live_gsc' ? 'live' : (payload.source === 'mock_data' ? 'demo' : 'unavailable'));

      calculateStats();
      renderGSCTable();
    } catch (err) {
      console.error('Error fetching GSC data:', err);
      global.setDataMode('unavailable');
      gscData = [];
      calculateStats();
      gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-rose-500">Live Search Console data is unavailable. No demo numbers were substituted.</td></tr>`;
    }
  }

  if (syncGscBtn) syncGscBtn.addEventListener('click', syncGSCData);

  function calculateStats() {
    const totalImpressions = gscData.reduce((acc, curr) => acc + curr.impressions, 0);
    const totalClicks = gscData.reduce((acc, curr) => acc + curr.clicks, 0);
    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0';
    const leakCount = gscData.filter(item => item.leak).length;

    statGapCount.innerText = leakCount;
    statTotalImpressions.innerText = totalImpressions.toLocaleString();
    statAvgCtr.innerText = `${avgCtr}%`;
  }

  function renderGSCTable() {
    gscTableBody.innerHTML = '';

    const filtered = gscData.filter(item => {
      if (filterMode === 'leaks') return item.leak;
      return true;
    });

    if (filtered.length === 0) {
      gscTableBody.innerHTML = `<tr><td colspan="7" class="text-center">No keywords match the selected filter.</td></tr>`;
      return;
    }

    filtered.forEach(row => {
      const tr = document.createElement('tr');

      const statusBadge = row.leak
        ? `<span class="status-badge leak">Content Gap</span>`
        : `<span class="status-badge clean">Ranking</span>`;

      const actionBtn = row.leak
        ? `<button class="btn btn-secondary btn-xs btn-gen-trigger" data-query="${uiEsc(row.query)}">Generate Page</button><button class="btn btn-secondary btn-xs btn-fanout-trigger" data-query="${uiEsc(row.query)}" title="See the questions a citable page should answer">&#10067; Questions</button>`
        : `<button class="btn btn-secondary btn-xs" disabled>Optimized</button>`;

      tr.innerHTML = `
        <td class="font-medium">${uiEsc(row.query)}</td>
        <td>${row.impressions.toLocaleString()}</td>
        <td>${row.clicks.toLocaleString()}</td>
        <td>${row.ctr}%</td>
        <td>${row.position}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      `;
      gscTableBody.appendChild(tr);
    });

    // Add listeners to individual row "Generate Page" buttons
    document.querySelectorAll('.btn-gen-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        if (global.loadKeywordIntoCreator) global.loadKeywordIntoCreator(query);
      });
    });

    // "❓ Questions" — reveal the query fan-out (sub-questions) for a gap.
    document.querySelectorAll('.btn-fanout-trigger').forEach(btn => {
      btn.addEventListener('click', async () => {
        const query = btn.getAttribute('data-query');
        const tr = btn.closest('tr');
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('fanout-row')) { next.remove(); return; } // toggle off
        const detail = document.createElement('tr');
        detail.className = 'fanout-row';
        detail.innerHTML = `<td colspan="7"><div class="fanout-box"><div class="fanout-empty">Finding the questions people ask about &ldquo;${citEsc(query)}&rdquo;&hellip;</div></div></td>`;
        tr.after(detail);
        const box = detail.querySelector('.fanout-box');
        const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '&hellip;';
        try {
          const res = await authFetch('/api/onsite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'fanout', query }) });
          const d = await res.json();
          if (!res.ok || !d.success) throw new Error(d.error || 'Request failed');
          if (d.unavailable) { box.innerHTML = `<div class="fanout-empty">${citEsc(d.message || 'Add your Gemini key in Settings to use this.')}</div>`; return; }
          const qs = (d.data && d.data.questions) || [];
          box.innerHTML = qs.length
            ? `<div class="fanout-title">&#10067; Questions a citable page on &ldquo;${citEsc(query)}&rdquo; should answer:</div><ul class="fanout-list">${qs.map(x => `<li>${citEsc(x)}</li>`).join('')}</ul><div class="fanout-hint">Cover several of these in one article &mdash; AI engines cite pages that answer a cluster of related questions, not just one.</div>`
            : `<div class="fanout-empty">No related questions came back &mdash; try Generate Page instead.</div>`;
        } catch (e) {
          box.innerHTML = `<div class="fanout-empty">Couldn't load questions: ${citEsc(e.message)}</div>`;
        } finally { btn.disabled = false; btn.innerHTML = orig; }
      });
    });
  }

  // Filter Buttons
  filterLeaksBtn.addEventListener('click', () => {
    filterMode = 'leaks';
    filterLeaksBtn.classList.add('active');
    filterAllBtn.classList.remove('active');
    renderGSCTable();
  });

  filterAllBtn.addEventListener('click', () => {
    filterMode = 'all';
    filterAllBtn.classList.add('active');
    filterLeaksBtn.classList.remove('active');
    renderGSCTable();
  });


  global.syncGSCData = syncGSCData;
})(window);
