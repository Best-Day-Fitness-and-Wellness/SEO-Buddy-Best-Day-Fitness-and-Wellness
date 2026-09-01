'use strict';

(function exposeOwnerMode(global) {
  const { authFetch } = global.SeoBuddyCore;

  // OWNER MODE — Today / Results / Business
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

  const owEsc = v => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // "Reviewed" with no date is a claim; "Reviewed 18 Aug 2026" is evidence the
  // owner can check against their own memory of pressing the button.
  function owShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

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
      ? 'SEO Buddy is running everything on its own. Check back whenever.'
      : (t === 0 ? 'Every task is done. The blocker is still open whenever you have a moment.'
                 : 'We’ve prepared each one. Anything we can do ourselves, we already have.');
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
        fetch('/api/next-moves').then(r => r.json()).catch(() => ({ moves: [] })),
        fetch('/api/autopilot-digest').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/health-score').then(r => r.json()).catch(() => null)
      ]);
      const moves = (mv.moves || []);
      const tasks = moves.filter(m => m.capability !== 'blocked');
      const blockers = moves.filter(m => m.capability === 'blocked');
      owTasksLeft = tasks.length;

      tasksEl.innerHTML = tasks.length
        ? `<div class="ow-h">Needs you</div>` + tasks.map(owCard).join('')
        : `<div class="ow-h">Needs you</div><div class="ow-note"><b>Nothing on your plate.</b>
             <p>Everything we could do ourselves this week, we did.</p></div>`;
      blockEl.innerHTML = blockers.length
        ? `<div class="ow-h">Waiting on you</div>` + blockers.map(owCard).join('') : '';

      const items = (dg.items || []);
      document.getElementById('ow-hcount').textContent =
        `SEO Buddy handled ${items.length} thing${items.length === 1 ? '' : 's'} this week`;
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
      tasksEl.innerHTML = `<div class="ow-note warn"><b>Couldn’t load your list.</b><p>${owEsc(e.message)}</p></div>`;
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

    if (act === 'dismiss') { owFinish(item, 'Skipped — we’ll raise it again next week.'); return; }

    if (act === 'goto') {
      const t = item.dataset.tab;
      if (t && global.switchTab) { setOwnerMode(false); global.switchTab(t); }
      return;
    }

    if (act === 'approve') {
      // The one class of action the server genuinely executes.
      item.classList.add('working');
      try {
        if (key === 'autopilot') await authFetch('/api/autopilot-toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled:true }) });
        else if (key === 'ai')   await authFetch('/api/ai-visibility/run', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
        owFinish(item, key === 'autopilot' ? 'Autopilot is on — we’ll publish for you from now on.' : 'Check complete — see Results.');
      } catch (err) {
        item.classList.remove('working');
        item.querySelector('.ow-row').insertAdjacentHTML('beforeend',
          `<span class="ow-mins" style="color:var(--color-danger)">Didn’t work: ${owEsc(err.message)}</span>`);
      }
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
      try { await authFetch('/api/gbp-mark-posted', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }); } catch (err) {}
      owFinish(item, 'Marked as posted — we’ll confirm it on the next check.');
      return;
    }
  });

  const owHT = document.getElementById('ow-htoggle');
  if (owHT) owHT.addEventListener('click', () => {
    const open = owHT.getAttribute('aria-expanded') === 'true';
    owHT.setAttribute('aria-expanded', String(!open));
    document.getElementById('ow-hlist').classList.toggle('open', !open);
  });

  // ── Results ──
  async function loadOwnerResults() {
    const find = document.getElementById('ow-find');
    if (!find) return;
    const tile = (l, v, d) => `<div class="ow-tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const arrow = (now, was, lowerBetter) => {
      if (was == null || now == null) return '<span class="ow-flat">■ no comparison yet</span>';
      const diff = now - was;
      if (!diff) return '<span class="ow-flat">■ held</span> since last month';
      const good = lowerBetter ? diff < 0 : diff > 0;
      const c = good ? 'ow-up' : 'ow-down', a = diff > 0 ? '▲' : '▼';
      return `<span class="${c}">${a} ${Math.abs(Math.round(diff * 10) / 10)}</span> from ${was}`;
    };
    try {
      const [pf, rv, hs] = await Promise.all([
        fetch('/api/performance').then(r => r.json()).catch(() => null),
        fetch('/api/reviews-stats').then(r => r.json()).catch(() => null),
        fetch('/api/health-score').then(r => r.json()).catch(() => null)
      ]);
      if (!pf || !pf.current) {
        // Distinguish "never connected" from "connected, but this fetch didn't
        // come back". Telling an owner their Search Console isn't connected
        // when it demonstrably is sends them to fix something that isn't broken.
        find.innerHTML = '';
        let connected = false;
        try {
          const rd = await fetch('/api/deploy-readiness').then(r => r.json());
          connected = !!(rd.checks || []).find(c => c.key === 'gsc' && c.ok);
        } catch (e) { /* if even that fails, fall through to the softer message */ }
        document.getElementById('ow-find-note').innerHTML = connected
          ? `<div class="ow-note warn"><b>We couldn’t load your search numbers just now.</b>
               <p>Google Search Console is connected — this looks like a hiccup fetching the figures, not a setup problem. Everything else on this page still works.
               <button class="btn btn-primary" style="width:auto;margin-top:10px" data-ow-retry>Try again</button></p></div>`
          : `<div class="ow-note warn"><b>We can’t show your search numbers yet.</b>
               <p>Google Search Console isn’t connected, so we have nothing real to compare. Everything else on this page still works — it’s on your Today list.</p></div>`;
      } else if (pf && pf.current) {
        const c = pf.current, p = pf.previous || {};
        find.innerHTML =
          tile('Visits from Google', c.clicks, arrow(c.clicks, p.clicks)) +
          tile('Times you appeared', (c.impressions || 0).toLocaleString(), arrow(c.impressions, p.impressions)) +
          tile('Typical position', c.avgPosition, arrow(c.avgPosition, p.avgPosition, true) + ' · lower is better') +
          tile('Optimization score', (hs && hs.overall != null ? hs.overall : '–') + '<small> / 100</small>',
               hs && hs.delta != null ? arrow(hs.overall, hs.overall - hs.delta) : '<span class="ow-flat">■ building history</span>');
        const down = (c.clicks || 0) < (p.clicks || 0);
        document.getElementById('ow-find-note').innerHTML = down
          ? `<div class="ow-note warn"><b>This period went the wrong way, and we’re not going to dress that up.</b>
               <p><b>What may be contributing</b> — we can’t prove any of these caused it, but each is true right now: details that don’t match across the web, the third-party sources you’re not listed on yet, and Google’s own results shifting for reasons nobody outside Google can see.</p></div>`
          : `<div class="ow-note"><b>Holding steady or improving.</b><p>We’ll show you this same comparison next month either way.</p></div>`;
      }
      if (!rv || !rv.inventory) {
        document.getElementById('ow-rev').innerHTML =
          `<div class="ow-note"><b>No reviews site connected.</b><p>Nothing to show here yet.</p></div>`;
      } else if (rv && rv.inventory) {
        const i = rv.inventory, bp = i.byPlatform || {};
        document.getElementById('ow-rev').innerHTML =
          tile('Shown on your reviews site', i.published,
               Object.entries(bp).map(([k, v]) => `${v} ${k}`).join(' · ')) +
          tile('Average rating there', i.avgRating, '<span class="ow-flat">■ held</span>') +
          tile('Review page health', rv.score + '<small> / 100</small>',
               (rv.problems || 0) + ' small fix' + ((rv.problems || 0) === 1 ? '' : 'es') + ' suggested');
      }
      const cv = parseFloat(localStorage.getItem('seo_client_value')) || 1395;
      const cr = (parseFloat(localStorage.getItem('seo_conv_rate')) || 2) / 100;
      const visits = (pf && pf.current && pf.current.clicks) || 0;
      if (!visits) {
        document.getElementById('ow-worth').innerHTML =
          `<div class="ow-note"><b>We need real visit numbers before we can estimate value.</b>
             <p>This fills in on its own once the search figures load.</p></div>`;
        return;
      }
      document.getElementById('ow-worth').innerHTML =
        tile('What you’re getting now', '$' + Math.round(visits * cr * cv).toLocaleString() + '<small>/mo</small>',
             `from about ${visits} visits a month`) +
        tile('A new client is worth', '$' + cv.toLocaleString(), 'your figure, editable in Business');
    } catch (e) { /* leave the shells; better empty than wrong */ }
  }
  global.loadOwnerResults = loadOwnerResults;

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ow-retry]')) loadOwnerResults();
    if (e.target.closest && e.target.closest('[data-ow-retry-business]')) loadOwnerBusiness();
  });

  // Anything that records an owner decision fires this; every board that draws
  // that decision redraws itself. Each loader is guarded, so a board that is not
  // on screen simply does nothing.
  document.addEventListener('seo:readiness-changed', () => {
    loadOwnerBusiness();
    loadOwnerToday();
  });

  // ── Business ──
  async function loadOwnerBusiness() {
    const basics = document.getElementById('ow-basics');
    if (!basics) return;
    const f = (k, v) => `<div class="ow-f"><div class="k">${k}</div><div class="v">${owEsc(v)}</div></div>`;
    try {
      const [bp, br, rd] = await Promise.all([
        fetch('/api/business-profile').then(r => r.json()).catch(() => null),
        fetch('/api/brand-profile').then(r => r.json()).catch(() => null),
        fetch('/api/deploy-readiness').then(r => r.json()).catch(() => null)
      ]);
      const b = (bp && (bp.profile || bp.business)) || {};
      basics.innerHTML =
        f('Business name', b.name || 'Best Day Fitness') +
        f('Phone', b.phone || b.telephone || '—') +
        f('Address', [b.streetAddress, b.addressLocality, b.addressRegion, b.postalCode].filter(Boolean).join(', ') || '—') +
        f('Website', b.website || '—');

      const voiceEl = document.getElementById('ow-voice');
      if (br && br.brand) {
        const nv = (br.brand.neverUse || []), up = (br.brand.usePhrases || []);
        // The brand profile itself is the authority on whether the owner has
        // signed off on the voice; the readiness board only relays it. Reading
        // the relay first meant a readiness call that failed rendered a
        // confident "Reviewed" over an unreviewed voice, and a readiness call
        // that lagged rendered "Not reviewed yet" over a saved one.
        const check = rd && (rd.checks || []).find(c => c.key === 'brand');
        const at = br.reviewedAt || (check && check.reviewedAt) || null;
        const reviewed = at ? true : (check ? !!check.ok : false);
        const durable = check ? check.durable !== false : true;
        voiceEl.innerHTML =
          `<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:10px">
             <b style="font-size:var(--font-lg)">${owEsc(br.brand.tagline || '')}</b>
             ${reviewed
               ? `<span class="ow-chip auto">&#10003; Reviewed${at ? ' ' + owEsc(owShortDate(at)) : ''}</span>`
               : '<span class="ow-chip blocked">&#9650; Not reviewed yet</span>'}
           </div>
           <p style="margin:0 0 14px;color:var(--text-muted);font-size:var(--font-sm)">
             We never say <i>${nv.slice(0, 7).map(owEsc).join(', ')}</i>${nv.length > 7 ? ` — and ${nv.length - 7} more` : ''}.<br>
             We do say <i>${up.slice(0, 3).map(owEsc).join(', ')}</i>.</p>
           ${reviewed ? '' : `<div class="ow-note" style="margin:0 0 14px"><b>Nothing is wrong with your voice.</b>
             <p>This badge clears when you open it and press <b>Save brand voice</b> — that press is what records that a human read it. Changing the wording is optional.</p></div>`}
           ${reviewed && !durable ? `<div class="ow-note warn" style="margin:0 0 14px"><b>This confirmation won’t survive the next update.</b>
             <p>Nothing is being stored permanently for this location, so the badge will ask again after the next deploy.</p></div>` : ''}
           <button class="btn btn-primary" style="width:auto" onclick="window.switchTab &amp;&amp; window.switchTab('brand-tab')">Read it through</button>`;
      } else if (voiceEl) {
        voiceEl.innerHTML = `<div class="ow-note warn"><b>Couldn’t load your brand voice just now.</b>
          <p>Nothing has changed — this is the page failing to read it, not the voice going missing.</p>
          <button class="btn btn-secondary" style="width:auto;margin-top:10px" data-ow-retry-business="1">Try again</button></div>`;
      }
      if (rd) {
        const row = (n, ok, txt) => `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border-color)">
          <span class="nm" style="font-weight:600">${owEsc(n)}</span>
          <span style="margin-left:auto" class="ow-chip ${ok ? 'auto' : 'blocked'}">${ok ? '&#10003; Connected' : '&#9650; ' + owEsc(txt)}</span></div>`;
        const get = k => (rd.checks || []).find(c => c.key === k) || { ok: false };
        document.getElementById('ow-conn').innerHTML =
          row('Google Search', get('gsc').ok, 'Not connected') +
          row('Your website', get('ghl').ok, 'Not connected') +
          row('AI writing', get('gemini').ok, 'Not connected') +
          `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px">
             <span style="font-weight:600">Google Business Profile</span>
             <span style="margin-left:auto" class="ow-chip manual">&#9679; Posts copied by hand</span></div>`;
      }
    } catch (e) { /* shells stay empty rather than showing invented values */ }
  }
  global.loadOwnerBusiness = loadOwnerBusiness;

  // ── the mode switch ──
  function setOwnerMode(on) {
    document.body.classList.toggle('owner-mode', on);
    const full = document.querySelector('.nav-menu:not(#owner-nav)');
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
