'use strict';

// Read-only Results and Business views shared by the current workspace and recovery UI.
(function exposeOwnerViews(global) {
  const { readCheckedJson: readOwnerData, uiEsc: owEsc } = global.SeoBuddyCore;

  // "Reviewed" with no date is a claim; "Reviewed 18 Aug 2026" is evidence the
  // owner can check against their own memory of pressing the button.
  function owShortDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

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
        readOwnerData('/api/performance').catch(() => null),
        readOwnerData('/api/reviews-stats').catch(() => null),
        readOwnerData('/api/health-score').catch(() => null)
      ]);
      if (!pf || !pf.current) {
        // Distinguish "never connected" from "connected, but this fetch didn't
        // come back". Telling an owner their Search Console isn't connected
        // when it demonstrably is sends them to fix something that isn't broken.
        find.innerHTML = '';
        let connected = null;
        try {
          const rd = await readOwnerData('/api/deploy-readiness');
          const check = (rd.checks || []).find(c => c.key === 'gsc');
          connected = check ? !!check.ok : null;
        } catch (e) { /* if even that fails, fall through to the softer message */ }
        document.getElementById('ow-find-note').innerHTML = connected
          ? `<div class="ow-note warn"><b>We couldn’t load your search numbers just now.</b>
               <p>Google Search Console is connected — this looks like a hiccup fetching the figures, not a setup problem. Everything else on this page still works.
               <button class="btn btn-primary" style="width:auto;margin-top:10px" data-ow-retry>Try again</button></p></div>`
          : connected === false ? `<div class="ow-note warn"><b>We can’t show your search numbers yet.</b>
               <p>Google Search Console isn’t connected, so we have nothing real to compare. Review your connections in Settings.</p></div>`
          : `<div class="ow-note warn" role="alert"><b>Search figures and connection status are unavailable.</b><p>We could not verify the connection. This does not mean it is disconnected.</p><button class="btn btn-secondary" data-ow-retry>Try again</button></div>`;
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
               <p>This comparison does not identify the cause. Review the underlying searches and pages before deciding what to change.</p></div>`
          : `<div class="ow-note"><b>Holding steady or improving.</b><p>We’ll show you this same comparison next month either way.</p></div>`;
      }
      if (!rv || !rv.inventory) {
        document.getElementById('ow-rev').innerHTML =
          `<div class="ow-note warn"><b>Review figures are unavailable.</b><p>We could not verify the review inventory. No connection or rating change is being claimed.</p><button class="btn btn-secondary" data-ow-retry>Try again</button></div>`;
      } else if (rv && rv.inventory) {
        const i = rv.inventory, bp = i.byPlatform || {};
        document.getElementById('ow-rev').innerHTML =
          tile('Shown on your reviews site', i.published,
               Object.entries(bp).map(([k, v]) => `${v} ${k}`).join(' · ')) +
          tile('Average rating there', i.avgRating, 'Latest inventory · no trend comparison') +
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
        tile('Estimated opportunity value', '$' + Math.round(visits * cr * cv).toLocaleString() + '<small>/mo</small>',
             `Modelled from ${visits} search clicks and a ${Math.round(cr * 1000) / 10}% conversion assumption. Not measured revenue.`) +
        tile('Assumed new-client value', '$' + cv.toLocaleString(), 'editable in Settings');
    } catch (e) { /* leave the shells; better empty than wrong */ }
  }
  global.loadOwnerResults = loadOwnerResults;

  // ── Business ──
  async function loadOwnerBusiness() {
    const basics = document.getElementById('ow-basics');
    if (!basics) return;
    const f = (k, v) => `<div class="ow-f"><div class="k">${k}</div><div class="v">${owEsc(v)}</div></div>`;
    try {
      const [bp, br, rd] = await Promise.all([
        readOwnerData('/api/business-profile').catch(() => null),
        readOwnerData('/api/brand-profile').catch(() => null),
        readOwnerData('/api/deploy-readiness').catch(() => null)
      ]);
      const b = (bp && (bp.profile || bp.business)) || {};
      basics.innerHTML = !bp ? '<div class="ow-note warn" role="alert">Business details could not be loaded. <button class="btn btn-secondary" data-ow-retry-business>Try again</button></div>' :
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
           <button class="btn btn-primary" style="width:auto" data-ow-brand>Read it through</button>`;
      } else if (voiceEl) {
        voiceEl.innerHTML = `<div class="ow-note warn"><b>Couldn’t load your brand voice just now.</b>
          <p>Nothing has changed — this is the page failing to read it, not the voice going missing.</p>
          <button class="btn btn-secondary" style="width:auto;margin-top:10px" data-ow-retry-business="1">Try again</button></div>`;
      }
      if (rd && Array.isArray(rd.checks)) {
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
      } else document.getElementById('ow-conn').innerHTML = '<div class="ow-note warn" role="alert">Connection status is unavailable. <button class="btn btn-secondary" data-ow-retry-business>Try again</button></div>';
    } catch (e) { basics.innerHTML = '<div class="ow-note warn" role="alert">Business details are unavailable. <button class="btn btn-secondary" data-ow-retry-business>Try again</button></div>'; }
  }
  global.loadOwnerBusiness = loadOwnerBusiness;

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ow-retry]')) loadOwnerResults();
    if (e.target.closest && e.target.closest('[data-ow-retry-business]')) loadOwnerBusiness();
    if (e.target.closest && e.target.closest('[data-ow-brand]')) global.switchTab('brand-tab');
  });

  // Preserve the existing business refresh after an owner decision.
  document.addEventListener('seo:readiness-changed', loadOwnerBusiness);
})(window);
