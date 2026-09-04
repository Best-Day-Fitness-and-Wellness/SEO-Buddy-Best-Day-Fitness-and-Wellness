'use strict';

// Read-only Results and Business views shared by the current workspace and recovery UI.
(function exposeOwnerViews(global) {
  const { readCheckedJson: readOwnerData, uiEsc: owEsc } = global.SeoBuddyCore;
  // Each view owns its refresh generation; late responses must not undo a retry.
  let resultsRequest = 0, businessRequest = 0;
  const measuredNumber = value => Number.isFinite(value) && value >= 0 ? value : null;
  const measuredCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function readinessCheck(readiness, key) {
    if (!Array.isArray(readiness?.checks)) return null;
    const matches = readiness.checks.filter(check => check?.key === key);
    return matches.length === 1 && typeof matches[0].ok === 'boolean' ? matches[0] : null;
  }

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
    const request = ++resultsRequest;
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
        global.SeoBuddyCore.readHealthScore().catch(() => null)
      ]);
      if (request !== resultsRequest) return;
      if (!pf || !pf.current) {
        // Distinguish "never connected" from "connected, but this fetch didn't
        // come back". Telling an owner their Search Console isn't connected
        // when it demonstrably is sends them to fix something that isn't broken.
        find.innerHTML = '';
        let connected = null;
        try {
          const rd = await readOwnerData('/api/deploy-readiness');
          const check = readinessCheck(rd, 'gsc');
          connected = check ? check.ok : null;
        } catch (e) { /* if even that fails, fall through to the softer message */ }
        if (request !== resultsRequest) return;
        document.getElementById('ow-find-note').innerHTML = connected
          ? `<div class="ow-note warn"><b>We couldn’t load your search numbers just now.</b>
               <p>Google Search Console is connected — this looks like a hiccup fetching the figures, not a setup problem. Everything else on this page still works.
               <button class="btn btn-primary" style="width:auto;margin-top:10px" data-ow-retry>Try again</button></p></div>`
          : connected === false ? `<div class="ow-note warn"><b>We can’t show your search numbers yet.</b>
               <p>Google Search Console isn’t connected, so we have nothing real to compare.</p><button type="button" class="btn btn-secondary" data-settings-section="connections">Review connection settings</button></div>`
          : `<div class="ow-note warn" role="alert"><b>Search figures and connection status are unavailable.</b><p>We could not verify the connection. This does not mean it is disconnected.</p><button class="btn btn-secondary" data-ow-retry>Try again</button></div>`;
      } else if (pf && pf.current) {
        const searchMetrics = period => Object.fromEntries(['clicks', 'impressions', 'avgPosition'].map(key => [key, measuredNumber(period?.[key])]));
        const c = searchMetrics(pf.current), p = searchMetrics(pf.previous);
        const score = measuredNumber(hs?.overall);
        const validScore = score !== null && score <= 100 ? score : null;
        const previousScore = validScore !== null && Number.isFinite(hs?.delta) ? measuredNumber(validScore - hs.delta) : null;
        find.innerHTML =
          tile('Visits from Google', c.clicks ?? '—', arrow(c.clicks, p.clicks)) +
          tile('Times you appeared', c.impressions === null ? '—' : c.impressions.toLocaleString(), arrow(c.impressions, p.impressions)) +
          tile('Typical position', c.avgPosition ?? '—', arrow(c.avgPosition, p.avgPosition, true) + ' · lower is better') +
          tile('Optimization score', (validScore ?? '–') + '<small> / 100</small>',
               previousScore !== null && previousScore <= 100 ? arrow(validScore, previousScore) : '<span class="ow-flat">■ no comparison yet</span>');
        const partial = Object.values(c).includes(null);
        document.getElementById('ow-find-note').innerHTML = partial
          ? '<div class="ow-note warn" role="status"><b>Some search figures are unavailable.</b><p>A dash means the figure could not be verified, not zero activity. Available figures are still shown.</p><button type="button" class="btn btn-secondary" data-ow-retry>Retry search figures</button></div>'
          : p.clicks === null
          ? '<div class="ow-note"><b>Not enough search history to compare yet.</b><p>Current figures are shown above. A previous-period click count is needed before we can describe the trend.</p></div>'
          : c.clicks < p.clicks
          ? `<div class="ow-note warn"><b>This period went the wrong way, and we’re not going to dress that up.</b>
               <p>This comparison does not identify the cause. Review the underlying searches and pages before deciding what to change.</p></div>`
          : `<div class="ow-note"><b>Holding steady or improving.</b><p>We’ll show you this same comparison next month either way.</p></div>`;
      }
      document.getElementById('ow-rev-note').innerHTML = '';
      if (!rv || !isRecord(rv.inventory)) {
        document.getElementById('ow-rev').innerHTML =
          `<div class="ow-note warn"><b>Review figures are unavailable.</b><p>We could not verify the review inventory. No connection or rating change is being claimed.</p><button class="btn btn-secondary" data-ow-retry>Try again</button></div>`;
      } else {
        const i = rv.inventory;
        const published = measuredCount(i.published), problems = measuredCount(rv.problems);
        const score = measuredNumber(rv.score), health = score !== null && score <= 100 ? score : null;
        const rating = Number.isFinite(i.avgRating) && i.avgRating >= 1 && i.avgRating <= 5 ? i.avgRating : null;
        // An explicit null is the API's "no rated reviews" value; omission is unknown.
        const noRating = i.avgRating === null;
        const platforms = isRecord(i.byPlatform) ? Object.entries(i.byPlatform) : [];
        const validPlatforms = platforms.filter(([name, count]) => name.trim() && measuredCount(count) !== null);
        const platformDataValid = isRecord(i.byPlatform) && validPlatforms.length === platforms.length;
        const partial = published === null || problems === null || health === null || (!noRating && rating === null) || !platformDataValid;
        document.getElementById('ow-rev').innerHTML =
          tile('Shown on your reviews site', published ?? '—',
               validPlatforms.map(([name, count]) => `${count} ${owEsc(name)}`).join(' · ') || (platformDataValid ? '' : 'Platform breakdown unavailable')) +
          tile('Average rating there', rating ?? '—', noRating ? 'No rating recorded yet' : rating === null ? 'Rating unavailable' : 'Latest inventory · no trend comparison') +
          tile('Review page health', (health ?? '—') + '<small> / 100</small>',
               problems === null ? 'Fix count unavailable' : problems + ' small fix' + (problems === 1 ? '' : 'es') + ' suggested');
        document.getElementById('ow-rev-note').innerHTML = partial
          ? '<div class="ow-note warn" role="status"><b>Some review figures are unavailable.</b><p>A dash means the figure could not be verified. Available figures are still shown.</p><button type="button" class="btn btn-secondary" data-ow-retry>Retry review figures</button></div>' : '';
      }
      const cv = parseFloat(localStorage.getItem('seo_client_value')) || 1395;
      const cr = (parseFloat(localStorage.getItem('seo_conv_rate')) || 2) / 100;
      const visits = measuredNumber(pf?.current?.clicks);
      if (visits === null) {
        document.getElementById('ow-worth').innerHTML =
          `<div class="ow-note"><b>We need real visit numbers before we can estimate value.</b>
             <p>This fills in on its own once the search figures load.</p></div>`;
        return;
      }
      if (visits === 0) {
        document.getElementById('ow-worth').innerHTML = '<div class="ow-note"><b>No search visits were recorded for this period.</b><p>There are no recorded search clicks to use for an opportunity estimate.</p></div>';
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
    const request = ++businessRequest;
    const f = (k, v) => `<div class="ow-f"><div class="k">${k}</div><div class="v">${owEsc(v)}</div></div>`;
    try {
      const [bp, br, rd] = await Promise.all([
        readOwnerData('/api/business-profile').catch(() => null),
        readOwnerData('/api/brand-profile').catch(() => null),
        readOwnerData('/api/deploy-readiness').catch(() => null)
      ]);
      if (request !== businessRequest) return;
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
        const check = readinessCheck(rd, 'brand');
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
        const row = (n, ok) => `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border-color)">
          <span class="nm" style="font-weight:600">${owEsc(n)}</span>
          <span style="margin-left:auto" class="ow-chip ${ok === true ? 'auto' : ok === false ? 'blocked' : 'manual'}">${ok === true ? '&#10003; Connected' : ok === false ? '&#9650; Not connected' : '&#9679; Not verified'}</span></div>`;
        const statuses = ['gsc', 'ghl', 'gemini'].map(key => readinessCheck(rd, key)?.ok ?? null);
        document.getElementById('ow-conn').innerHTML =
          row('Google Search', statuses[0]) +
          row('Your website', statuses[1]) +
          row('AI writing', statuses[2]) +
          `<div style="display:flex;align-items:center;gap:12px;padding:13px 16px">
             <span style="font-weight:600">Google Business Profile</span>
             <span style="margin-left:auto" class="ow-chip manual">&#9679; Posts copied by hand</span></div>` +
          (statuses.includes(null) ? '<div class="ow-note warn" role="status"><b>Some connection checks are unavailable.</b><p>Not verified does not mean disconnected. Retry before changing credentials.</p><button type="button" class="btn btn-secondary" data-ow-retry-business>Retry connection checks</button></div>' : '');
      } else document.getElementById('ow-conn').innerHTML = '<div class="ow-note warn" role="alert">Connection status is unavailable. <button class="btn btn-secondary" data-ow-retry-business>Try again</button></div>';
    } catch (e) { basics.innerHTML = '<div class="ow-note warn" role="alert">Business details are unavailable. <button class="btn btn-secondary" data-ow-retry-business>Try again</button></div>'; }
  }
  global.loadOwnerBusiness = loadOwnerBusiness;

  // Shared by workspace and classic navigation; these shortcuts never run a tool.
  const businessToolTabs = new Set(['ai-tab', 'publish-tab', 'aio-tab', 'local-tab', 'citations-tab', 'performance-tab']);
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-ow-retry]')) loadOwnerResults();
    if (e.target.closest && e.target.closest('[data-ow-retry-business]')) loadOwnerBusiness();
    if (e.target.closest && e.target.closest('[data-ow-brand]')) global.switchTab('brand-tab');
    const tool = e.target.closest && e.target.closest('[data-ow-tool]');
    if (tool && businessToolTabs.has(tool.dataset.owTool)) global.switchTab(tool.dataset.owTool);
  });

  // Preserve the existing business refresh after an owner decision.
  document.addEventListener('seo:readiness-changed', loadOwnerBusiness);
})(window);
