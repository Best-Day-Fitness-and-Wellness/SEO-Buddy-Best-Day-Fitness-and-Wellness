'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const { safeExternalUrl, uiEsc } = window.SeoBuddyCore;
  // ===========================================================================
  // REVIEWS SITE — inventory, growth, and structured-data health
  // Everything is derived server-side from the live reviews page, so this needs
  // no extra credentials and works today.
  // ===========================================================================
  let reviewsData = null;
  
  function rvNum(n) { return (n == null) ? '—' : String(n); }
  
  // Trustpilot performance. Deliberately about movement rather than level: a
  // number on its own tells the owner nothing they can act on, and the whole
  // reason to watch a review profile is to catch it turning.
  function renderTrustpilot(tp) {
    const host = document.getElementById('rv-trustpilot');
    if (!host) return;
    if (!tp || !tp.configured) { host.innerHTML = ''; return; }
  
    if (!tp.ok) {
      host.innerHTML = `<div class="content-card">
        <h3 class="rv-panel-title">Trustpilot</h3>
        <p class="rv-panel-hint">Configured, but the last check didn't get through — so these numbers are not being recorded right now.</p>
        <ul class="rv-checks"><li><div class="rv-ck warn">!</div><div>
          <div class="rv-ck-b">Couldn't reach Trustpilot</div>
          <div class="rv-ck-d">${uiEsc(tp.error || 'Unknown error.')}</div></div></li></ul>
      </div>`;
      return;
    }
  
    const t = tp.trend || {};
    const window = t.partial && t.since ? `since ${uiEsc(t.since)}` : 'in 30 days';
    // An arrow is only meaningful once there is something to compare against.
    const move = (delta, { goodWhenUp = true, plus = true } = {}) => {
      if (!t.comparable || delta == null) return `<i class="sb-dot" style="background:var(--ink-3)"></i>building history`;
      if (delta === 0) return `<i class="sb-dot" style="background:var(--ink-3)"></i>unchanged ${window}`;
      const good = goodWhenUp ? delta > 0 : delta < 0;
      const sign = delta > 0 && plus ? '+' : '';
      return `<i class="sb-dot" style="background:${good ? 'var(--p4-g)' : 'var(--p2-g)'}"></i>${sign}${delta} ${window}`;
    };
  
    const tiles = [
      { label: 'TrustScore', value: tp.trustScore != null ? tp.trustScore.toFixed(1) : null, unit: 'out of 5',
        verdict: move(t.scoreDelta) },
      { label: 'Reviews', value: tp.reviewCount != null ? String(tp.reviewCount) : null, unit: 'on Trustpilot',
        verdict: move(t.reviewDelta) },
      { label: 'Low ratings', value: t.now && t.now.negative != null ? String(t.now.negative) : null, unit: '1 & 2 star',
        verdict: move(t.negativeDelta, { goodWhenUp: false }) },
    ];
  
    const dist = tp.distribution;
    const distTotal = dist ? [5, 4, 3, 2, 1].reduce((s, k) => s + (dist[k] || 0), 0) : 0;
    const bars = dist && distTotal ? [5, 4, 3, 2, 1].map(star => {
      const n = dist[star] || 0;
      const pct = Math.round((n / distTotal) * 100);
      return `<li>
        <div class="rv-split-top"><span>${star} star</span><span class="rv-split-val">${n} · ${pct}%</span></div>
        <div class="rv-split-track"><div class="rv-split-fill" style="width:${pct}%"></div></div>
      </li>`;
    }).join('') : '';
  
    host.innerHTML = `<div class="content-card">
      <h3 class="rv-panel-title">Trustpilot performance</h3>
      <p class="rv-panel-hint">Read straight from Trustpilot, recorded once a day. Trustpilot weights recent reviews more heavily than old ones, so a profile that stops collecting slowly slides on its own.</p>
      <div class="rv-kpis">${tiles.map(k => k.value == null
        ? `<div class="sb-metric empty p2"><div class="sb-top"><span class="sb-pill p2">${k.label}</span></div>
             <div class="sb-val">Not measured yet</div>
             <div class="sb-verdict"><i class="sb-dot" style="background:var(--ink-3)"></i>Trustpilot did not return this.</div></div>`
        : `<div class="sb-metric p2"><div class="sb-top"><span class="sb-pill p2">${k.label}</span></div>
             <div class="sb-val">${uiEsc(k.value)}<u>${k.unit}</u></div>
             <div class="sb-verdict">${k.verdict}</div></div>`).join('')}</div>
      ${bars ? `<ul class="rv-split" style="margin-top:18px">${bars}</ul>` : ''}
      ${tp.profileUrl ? `<p class="rv-panel-hint" style="margin-top:14px"><a href="${safeExternalUrl(tp.profileUrl)}" target="_blank" rel="noopener noreferrer">Open the profile on Trustpilot →</a></p>` : ''}
    </div>`;
  }
  
  function rvGrowthChart(series) {
    if (!series || series.length < 2) return '<div class="rv-empty">Not enough dated reviews to draw a trend yet.</div>';
    const W = 640, H = 210, PL = 34, PR = 10, PT = 12, PB = 26;
    const max = Math.max(...series.map(p => p.total)) || 1;
    const x = i => PL + (i * (W - PL - PR)) / Math.max(1, series.length - 1);
    const y = v => PT + (H - PT - PB) * (1 - v / max);
  
    const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
    const area = `${line} L${x(series.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  
    // Horizontal gridlines at 0 / half / max, labelled.
    const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
    const grid = ticks.map(v =>
      `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
      `<text class="lbl" x="${PL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join('');
  
    // Label at most six months so the axis never turns to mush.
    const step = Math.ceil(series.length / 6);
    const xlabels = series.map((p, i) =>
      (i % step === 0 || i === series.length - 1)
        ? `<text class="lbl" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.month}</text>` : '').join('');
  
    const dots = series.map((p, i) => p.added
      ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.total).toFixed(1)}" r="3" fill="var(--color-primary)"><title>${p.month}: +${p.added} → ${p.total} total</title></circle>` : '').join('');
  
    return `<svg class="rv-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Cumulative published reviews by month">
      <defs><linearGradient id="rvFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity=".35"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}
      <path d="${area}" fill="url(#rvFill)"/>
      <path d="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}${xlabels}
    </svg>`;
  }
  
  function renderReviews(d) {
    const inv = d.inventory || {};
    const totals = d.platformTotals || {};
    // Sum whatever platforms the page actually carries. The old hardcoded trio
    // meant a fourth platform could be added to the site and silently not count
    // here, which is exactly the drift this tab exists to catch.
    const platNames = Object.keys(totals);
    const reach = platNames.reduce((s, k) => s + (totals[k]?.reviewCount || 0), 0);
    const platLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1);
    const reachSub = platNames.length
      ? (platNames.length > 1
          ? platNames.slice(0, -1).map(platLabel).join(', ') + ' and ' + platLabel(platNames[platNames.length - 1]) + ' combined.'
          : platLabel(platNames[0]) + ' only.')
      : 'No platform totals available yet.';
  
    const deltaTxt = inv.delta30 == null
      ? 'tracking starts from today'
      : (inv.delta30 > 0 ? `+${inv.delta30} in the last 30 days` : (inv.delta30 === 0 ? 'no change in 30 days' : `${inv.delta30} in the last 30 days`));
  
    // Measurement cards, same as Progress. Every number gets a unit, a pillar,
    // and a verdict rather than an unlabelled accent colour.
    const kpis = [
      { pillar: 'p2', label: 'Local listings', value: rvNum(inv.published), unit: 'published reviews', sub: deltaTxt,
        tone: inv.delta30 > 0 ? 'up' : (inv.delta30 < 0 ? 'down' : 'flat') },
      { pillar: 'p2', label: 'Local listings', value: inv.avgRating != null ? inv.avgRating.toFixed(1) : null, unit: 'average rating',
        sub: inv.newest ? `Newest review ${inv.newest}.` : 'No dated reviews yet.', tone: 'flat',
        empty: 'Not measured yet', why: 'No ratings found on your reviews page.' },
      { pillar: 'p4', label: 'Get listed', value: reach ? String(reach) : null, unit: 'reviews across platforms',
        sub: reachSub, tone: 'flat',
        empty: 'Not measured yet', why: 'No platform totals available yet.' },
      { pillar: 'p1', label: 'Found on Google', value: d.score != null ? d.score : null, unit: '/ 100 page health',
        sub: d.problems ? `${d.problems} thing${d.problems === 1 ? '' : 's'} to fix.` : 'Everything is passing.',
        tone: d.problems ? 'down' : 'up', empty: 'Not measured yet', why: 'We could not read your reviews page.' }
    ];
    const dotFor = t => t === 'up' ? 'var(--p4-g)' : t === 'down' ? 'var(--p2-g)' : 'var(--ink-3)';
    document.getElementById('rv-kpis').innerHTML = kpis.map(k => k.value == null
      ? `<div class="sb-metric empty ${k.pillar}">
           <div class="sb-top"><span class="sb-pill ${k.pillar}">${k.label}</span></div>
           <div class="sb-val">${k.empty}</div>
           <div class="sb-verdict"><i class="sb-dot" style="background:var(--ink-3)"></i>${k.why}</div>
         </div>`
      : `<div class="sb-metric ${k.pillar}">
           <div class="sb-top"><span class="sb-pill ${k.pillar}">${k.label}</span></div>
           <div class="sb-val">${k.value}<u>${k.unit}</u></div>
           <div class="sb-verdict"><i class="sb-dot" style="background:${dotFor(k.tone)}"></i>${k.sub}</div>
         </div>`).join('');
  
    document.getElementById('rv-growth').innerHTML = rvGrowthChart(d.growth);
  
    renderTrustpilot(d.trustpilot);
  
    const NICE = { google: 'Google', facebook: 'Facebook', yelp: 'Yelp', trustpilot: 'Trustpilot' };
    const splitKeys = Array.from(new Set([...Object.keys(inv.byPlatform || {}), ...platNames]));
    const split = splitKeys.map(k => {
      const shown = (inv.byPlatform || {})[k] || 0;
      const total = totals[k]?.reviewCount || 0;
      if (!shown && !total) return '';
      const pct = total ? Math.min(100, Math.round((shown / total) * 100)) : 0;
      const note = k === 'yelp' && !shown
        ? 'counts only — Yelp\'s API returns truncated excerpts, never full reviews'
        : `${shown} of ${total || '—'} published`;
      return `<li>
        <div class="rv-split-top"><span>${uiEsc(NICE[k] || (k.charAt(0).toUpperCase() + k.slice(1)))}</span><span class="rv-split-val">${note}</span></div>
        <div class="rv-split-track"><div class="rv-split-fill" style="width:${pct}%"></div></div>
      </li>`;
    }).join('');
    document.getElementById('rv-split').innerHTML = split || '<li class="rv-empty">No platform data found on the page.</li>';
  
    const order = { fail: 0, unknown: 1, pass: 2 };
    const checks = (d.checks || []).slice().sort((a, b) => order[a.status] - order[b.status]);
    document.getElementById('rv-checks').innerHTML = checks.length ? checks.map(c => {
      const cls = c.status === 'pass' ? 'pass' : c.status === 'unknown' ? 'unknown' : (c.severity === 'warn' ? 'warn' : 'fail');
      const glyph = c.status === 'pass' ? '✓' : c.status === 'unknown' ? '?' : '!';
      return `<li><div class="rv-ck ${cls}">${glyph}</div><div><div class="rv-ck-b">${uiEsc(c.label)}</div><div class="rv-ck-d">${uiEsc(c.detail || '')}</div></div></li>`;
    }).join('') : '<li class="rv-empty">No checks returned.</li>';
  
    const link = document.getElementById('rv-url');
    if (link) { link.href = safeExternalUrl(d.url); link.rel = 'noopener noreferrer'; link.textContent = (d.url || '').replace(/^https?:\/\//, ''); }
    const chip = document.getElementById('rv-checked');
    if (chip) {
      chip.textContent = d.checkedAt ? `checked ${new Date(d.checkedAt).toLocaleString()}` : '—';
      chip.className = 'rv-pill ' + (d.problems ? 'bad' : 'ok');
    }
  }
  
  async function loadReviews(force) {
    if (reviewsData && !force) { renderReviews(reviewsData); return; }
    const checks = document.getElementById('rv-checks');
    if (checks) checks.innerHTML = '<li class="rv-empty">Checking the live reviews site…</li>';
    try {
      const r = await fetch('/api/reviews-stats');
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'request failed');
      if (!j.reachable) throw new Error(j.error || 'reviews site did not respond');
      reviewsData = j;
      renderReviews(j);
    } catch (e) {
      if (checks) checks.innerHTML = `<li class="rv-empty">Couldn’t reach the reviews site — ${uiEsc(e.message)}</li>`;
      const k = document.getElementById('rv-kpis'); if (k) k.innerHTML = '';
      const g = document.getElementById('rv-growth'); if (g) g.innerHTML = '';
      const s = document.getElementById('rv-split'); if (s) s.innerHTML = '';
    }
  }
  window.loadReviews = loadReviews;
  
  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('#rv-refresh');
    if (b) { b.disabled = true; loadReviews(true).finally(() => { b.disabled = false; }); }
  });
});
