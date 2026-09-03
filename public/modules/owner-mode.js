'use strict';

(function exposeOwnerMode(global) {
  const { authFetch, readCheckedJson: readOwnerData, uiEsc: owEsc } = global.SeoBuddyCore;

  // RECOVERY OWNER MODE — legacy Today and mode switching
  // ---------------------------------------------------------------------------
  // Reads the same endpoints the full interface uses; it has no data of its own.
  // The one rule it adds: completion is earned, never assumed. A task is only
  // struck off when the thing actually happened — the server confirms it, or the
  // owner tells us they did it. Clicking a button is not evidence.
  // ===========================================================================
  const OW_ICON = { nap:'📍', gbp:'📣', listed:'🔗', autopilot:'⚙️', ai:'🤖', gsc:'🔌' };
  const OW_CHIP = {
    automatic:['auto','&#10003; Automatic'], approve:['approve','&#9654; Needs approval'],
    manual:['manual','&#9679; You do it'],   blocked:['blocked','&#9650; Blocked'],
  };
  const NAP_SITES = ['Yelp', 'Yellow Pages', 'MapQuest', 'Foursquare'];
  let owTasksLeft = 0;

  function owHeadline() {
    const blockers = document.querySelectorAll('#ow-blockers .ow-item:not(.finished)').length;
    const head = document.getElementById('ow-sum-head');
    const sub  = document.getElementById('ow-sum-sub');
    const big  = document.getElementById('ow-sum-big');
    const cnt  = document.getElementById('owner-nav-count');
    if (!head) return;
    const t = owTasksLeft, parts = [];
    parts.push(t === 1 ? '1 task' : t + ' tasks');
    if (blockers) parts.push(blockers === 1 ? '1 blocker' : blockers + ' blockers');
    head.textContent = t === 0 && !blockers ? 'Nothing needs you today' : parts.join(' · ');
    sub.textContent = t === 0 && !blockers
      ? 'No tasks were returned. This does not confirm that every automation ran.'
      : (t === 0 ? 'No tasks remain in this view. The setup blocker is still open.'
                 : 'Review these decisions. A prepared draft is not a completed publication.');
    big.textContent = t;
    if (cnt) cnt.textContent = t ? String(t) : '';
  }

  // A task leaves the list only when the work genuinely happened.
  function owFinish(item, msg) {
    item.classList.remove('working', 'awaiting');
    item.classList.add('finished');
    const d = item.querySelector('.ow-done');
    if (d) d.innerHTML = '&#10003; ' + owEsc(msg);
    if (item.dataset.counts === '1') { owTasksLeft = Math.max(0, owTasksLeft - 1); item.dataset.counts = '0'; }
    owHeadline();
  }

  function owCard(m) {
    const [cls, label] = OW_CHIP[m.capability] || OW_CHIP.manual;
    const blocked = m.capability === 'blocked';
    const icon = OW_ICON[m.key] || '•';
    let controls = '';

    if (m.capability === 'approve') {
      controls = `<button class="btn btn-primary" data-ow="approve">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not now</button>`;
    } else if (m.key === 'nap') {
      controls = `<button class="btn btn-primary" data-ow="guide">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not this week</button>`;
    } else if (m.key === 'gbp') {
      controls = `<button class="btn btn-primary" data-ow="copy">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="confirm" hidden>I&rsquo;ve posted it</button>
        <button class="btn" data-ow="dismiss">Skip this week</button>`;
    } else if (blocked) {
      controls = `<button class="btn btn-primary" data-ow="goto">${owEsc(m.ownerCta)}</button>`;
    } else {
      controls = `<button class="btn btn-primary" data-ow="goto">${owEsc(m.ownerCta)}</button>
        <button class="btn" data-ow="dismiss">Not now</button>`;
    }

    const steps = m.key === 'nap'
      ? `<div class="ow-steps" id="ow-nap-steps" hidden>
           <div class="pr"><b id="ow-nap-count">0 of ${NAP_SITES.length} updated</b><span>tick each one as you finish it</span></div>
           ${NAP_SITES.map(n => `<label><input type="checkbox" data-nap> ${owEsc(n)}</label>`).join('')}
         </div>` : '';

    return `<div class="ow-item${blocked ? ' is-blocked' : ''}" data-key="${owEsc(m.key)}" data-counts="${blocked ? '0' : '1'}" data-tab="${owEsc(m.tab || '')}">
      <span class="ow-ic" aria-hidden="true">${icon}</span>
      <div class="ow-b">
        <div class="ow-t"><h3>${owEsc(m.ownerTitle)}</h3><span class="ow-chip ${cls}">${label}</span></div>
        <p>${owEsc(m.ownerWhy)}</p>
        ${steps}
        <div class="ow-await">&#9679; Copied — paste it into your Google profile, then tell us</div>
        <div class="ow-work"><span class="ow-spin"></span>Working…</div>
        <div class="ow-row">${controls}<span class="ow-mins">${owEsc(m.realEffort || '')}</span></div>
        <div class="ow-done"></div>
      </div></div>`;
  }

  async function loadOwnerToday() {
    const tasksEl = document.getElementById('ow-tasks');
    const blockEl = document.getElementById('ow-blockers');
    if (!tasksEl) return;
    try {
      const [mv, dg, hs] = await Promise.all([
        readOwnerData('/api/next-moves'),
        readOwnerData('/api/autopilot-digest'),
        readOwnerData('/api/health-score')
      ]);
      if (!Array.isArray(mv.moves) || !Array.isArray(dg.items)) throw new Error('The task or activity list is unavailable.');
      const moves = (mv.moves || []);
      const tasks = moves.filter(m => m.capability !== 'blocked');
      const blockers = moves.filter(m => m.capability === 'blocked');
      owTasksLeft = tasks.length;

      tasksEl.innerHTML = tasks.length
        ? `<div class="ow-h">Needs you</div>` + tasks.map(owCard).join('')
        : `<div class="ow-h">Needs you</div><div class="ow-note"><b>Nothing on your plate.</b>
             <p>No tasks were returned. Check the activity records before assuming work completed.</p></div>`;
      blockEl.innerHTML = blockers.length
        ? `<div class="ow-h">Waiting on you</div>` + blockers.map(owCard).join('') : '';

      const items = (dg.items || []);
      document.getElementById('ow-hcount').textContent =
        `${items.length} activity record${items.length === 1 ? '' : 's'} available`;
      document.getElementById('ow-hsub').textContent =
        items.map(i => i.label).slice(0, 5).join(', ');
      document.getElementById('ow-hlist').innerHTML = items.map(i =>
        `<div class="ow-hrow"><span><b>${owEsc(i.label)}</b><span>${owEsc(i.text)}</span></span></div>`).join('');

      const note = document.getElementById('ow-score-note');
      if (hs && hs.overall != null) {
        const d = hs.delta != null ? hs.delta : null;
        note.innerHTML = d != null && d < 0
          ? `<div class="ow-note warn" style="margin-top:22px"><b>Your score slipped ${Math.abs(d)} points this month.</b>
               <p>Worth knowing, not worth worrying about. The full comparison is on <b>Results</b>.</p></div>`
          : `<div class="ow-note" style="margin-top:22px"><b>Your score is ${hs.overall} out of 100.</b>
               <p>The full picture is on <b>Results</b>.</p></div>`;
      }
      owHeadline();
    } catch (e) {
      document.getElementById('ow-sum-head').textContent = 'Unable to check what needs you';
      document.getElementById('ow-sum-sub').textContent = 'This is not an all-clear. Try loading the checks again.';
      document.getElementById('ow-sum-big').textContent = '?';
      document.getElementById('owner-nav-count').textContent = '?';
      document.getElementById('ow-hcount').textContent = 'Activity not verified';
      document.getElementById('ow-hsub').textContent = '';
      document.getElementById('ow-hlist').innerHTML = '';
      document.getElementById('ow-score-note').innerHTML = '';
      blockEl.innerHTML = '';
      tasksEl.innerHTML = `<div class="ow-note warn" role="alert"><b>Couldn’t load your list.</b><p>${owEsc(e.message)}</p><button class="btn btn-secondary" data-ow-retry-today>Try again</button></div>`;
    }
  }
  global.loadOwnerToday = loadOwnerToday;

  // Per-state behaviour. Note what is deliberately absent: no path marks a
  // manual task done merely because a button was pressed.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-ow]');
    if (!btn) return;
    const item = btn.closest('.ow-item'); const act = btn.dataset.ow;
    const key = item.dataset.key;

    if (act === 'dismiss') { owFinish(item, 'Hidden for this visit. No work was completed.'); return; }

    if (act === 'goto') {
      const t = item.dataset.tab;
      if (t && global.switchTab) { setOwnerMode(false); global.switchTab(t); }
      return;
    }

    if (act === 'approve') {
      // The one class of action the server genuinely executes.
      item.classList.add('working');
      btn.disabled = true;
      try {
        let response;
        if (key === 'autopilot') response = await authFetch('/api/autopilot-toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled:true }) });
        else if (key === 'ai') response = await authFetch('/api/ai-visibility/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        else throw new Error('Open the tool to review this action.');
        const result = await response.json();
        if (!response.ok || !result.success || result.budgetReached || result.needsSetup || (key === 'ai' && !result.snapshot) || (key === 'autopilot' && result.enabled !== true)) throw new Error(result.error || result.message || 'Completion was not confirmed.');
        owFinish(item, key === 'autopilot' ? 'Schedule enabled. No publication is being claimed.' : 'Check completed — open AI visibility for the recorded result.');
      } catch (err) {
        item.classList.remove('working');
        item.querySelector('.ow-row').insertAdjacentHTML('beforeend',
          `<span class="ow-mins" style="color:var(--color-danger)">Didn’t work: ${owEsc(err.message)}</span>`);
      } finally { btn.disabled = false; }
      return;
    }

    if (act === 'guide') {
      const steps = item.querySelector('#ow-nap-steps');
      if (!steps) return;
      steps.hidden = false; btn.textContent = 'Keep going';
      const boxes = [...steps.querySelectorAll('[data-nap]')];
      boxes.forEach(cb => cb.addEventListener('change', () => {
        cb.closest('label').classList.toggle('ticked', cb.checked);
        const n = boxes.filter(b => b.checked).length;
        steps.querySelector('#ow-nap-count').textContent = `${n} of ${boxes.length} updated`;
        if (n === boxes.length) owFinish(item, 'All updated — we’ll re-check next week and tell you if any drift back.');
      }));
      return;
    }

    if (act === 'copy') {
      // We cannot see their Google profile, so we can only wait to be told.
      try {
        const d = await (await fetch('/api/local-autopilot')).json();
        const txt = (d && d.gbpDraft && d.gbpDraft.text) || '';
        if (txt && navigator.clipboard) await navigator.clipboard.writeText(txt);
      } catch (err) { /* copying is a convenience, not the point */ }
      window.open('https://business.google.com/posts', '_blank', 'noopener');
      item.classList.add('awaiting');
      btn.hidden = true;
      item.querySelector('[data-ow="confirm"]').hidden = false;
      return;
    }

    if (act === 'confirm') {
      btn.disabled = true;
      try {
        const response = await authFetch('/api/gbp-mark-posted', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Your confirmation was not saved.');
        owFinish(item, 'Saved as posted based on your confirmation; not independently verified.');
      } catch (err) { global.SeoBuddyCore.showToast(err.message); }
      finally { btn.disabled = false; }
      return;
    }
  });

  const owHT = document.getElementById('ow-htoggle');
  if (owHT) owHT.addEventListener('click', () => {
    const open = owHT.getAttribute('aria-expanded') === 'true';
    owHT.setAttribute('aria-expanded', String(!open));
    document.getElementById('ow-hlist').classList.toggle('open', !open);
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ow-retry-today]')) loadOwnerToday();
  });

  document.addEventListener('seo:readiness-changed', () => {
    if (!document.body.classList.contains('workspace-preview')) loadOwnerToday();
  });

  // ── the mode switch ──
  function setOwnerMode(on) {
    if (document.body.classList.contains('workspace-preview')) return global.switchTab('workspace-today-tab');
    document.body.classList.toggle('owner-mode', on);
    const full = document.querySelector('.nav-menu:not(#owner-nav):not(#workspace-nav)');
    const own = document.getElementById('owner-nav');
    if (full) full.style.display = on ? 'none' : '';
    if (own) own.style.display = on ? '' : 'none';
    const lbl = document.getElementById('mode-switch-label');
    if (lbl) lbl.textContent = on ? 'Full interface' : 'Owner mode';
    try { localStorage.setItem('seo_owner_mode', on ? '1' : '0'); } catch (e) {}
    if (on && global.switchTab) global.switchTab('owner-today-tab');
    else if (!on && global.switchTab) global.switchTab('today-tab');
  }
  global.setOwnerMode = setOwnerMode;


})(window);
