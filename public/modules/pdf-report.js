'use strict';

(function exposePdfReport(global) {
  let pdfLibrariesPromise = null;
  function loadScriptOnce(src) {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }
  function ensurePdfLibraries() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (!pdfLibrariesPromise) {
      pdfLibrariesPromise = loadScriptOnce('/jspdf.umd.min.js')
        .then(() => loadScriptOnce('/jspdf.plugin.autotable.min.js'))
        .catch(error => { pdfLibrariesPromise = null; throw error; });
    }
    return pdfLibrariesPromise;
  }

  async function generateSeoReportPdf() {
    await ensurePdfLibraries();
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('The PDF library is still loading — try again in a moment.');
    const { jsPDF } = window.jspdf;
    const g = (u) => fetch(u).then(r => r.json()).catch(() => null);
    const [hs, av, perf, nmRaw, bp, gsc, hist, aio, dig, ap] = await Promise.all([
      g('/api/health-score'), g('/api/ai-visibility'), g('/api/performance'),
      g('/api/next-moves'), g('/api/business-profile'), g('/api/gsc-data'),
      g('/api/history'), g('/api/aio-history'), g('/api/performance-digest'),
      g('/api/autopilot-status')
    ]);

    const prof    = (bp && bp.profile) || {};
    const bizName = prof.name || 'Best Day Fitness';
    const domain  = (prof.website || 'bestdayfitness.com').replace(/^https?:\/\//, '');
    const today   = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const gscData = (gsc && Array.isArray(gsc.data)) ? gsc.data : [];
    const history = Array.isArray(hist) ? hist : [];
    const audits  = Array.isArray(aio) ? aio : [];

    // Brand palette, matching the app.
    const NAVY = [0, 0, 117], INK = [17, 31, 50], MUT = [91, 100, 114], LINE = [231, 228, 221];
    const P = { found:[34,34,155], local:[166,91,0], ai:[0,112,143], listed:[5,116,95], fresh:[138,98,0] };
    const OK = [5, 116, 95], WARN = [166, 91, 0];

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const L = 40, R = W - 40, CW = R - L;
    let y = 0;

    const need = (px) => { if (y + px > H - 56) { doc.addPage(); y = 56; } };
    const h2 = (t) => {
      // Reserve room for the heading AND the first rows under it, otherwise a
      // heading strands itself at the bottom of a page.
      need(140); y += 6;
      doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(t, L, y); y += 6;
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(1); doc.line(L, y, R, y); y += 16;
    };
    const note = (t, color) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.setTextColor.apply(doc, color || MUT);
      const lines = doc.splitTextToSize(t, CW);
      need(lines.length * 13 + 8);
      doc.text(lines, L, y); y += lines.length * 13 + 8;
    };
    const table = (head, body, opts) => {
      if (!body.length) return;
      need(60);
      doc.autoTable(Object.assign({
        startY: y, theme: 'grid', margin: { left: L, right: 40 },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: LINE, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
        alternateRowStyles: { fillColor: [250, 249, 246] }
      }, opts || {}, { head: [head], body: body }));
      y = doc.lastAutoTable.finalY + 18;
    };
    const num = (v) => (v == null ? '—' : Number(v).toLocaleString());

    // ---------------- cover band ----------------
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 104, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(21);
    doc.text('Progress report', L, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(bizName + '  ·  ' + domain, L, 68);
    doc.setFontSize(9.5);
    doc.text('Last 28 days vs the previous 28 days  ·  ' + today, L, 86);
    y = 132;

    // ---------------- at a glance ----------------
    const score    = (hs && hs.overall != null) ? hs.overall : null;
    const measured = hs ? (hs.measuredCount + ' of ' + hs.totalPillars) : '—';
    const leaks    = gscData.filter(d => d.leak);
    const leakImpr = leaks.reduce((s, d) => s + (d.impressions || 0), 0);
    const submitted = history.filter(h => /requested|indexed/i.test(h.indexed || '')).length;
    const recRate  = audits.length
      ? Math.round((audits.filter(a => a.recommended).length / audits.length) * 100) : null;

    doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('At a glance', L, y); y += 4;
    doc.setDrawColor.apply(doc, LINE); doc.line(L, y, R, y); y += 20;

    const tiles = [
      ['Visibility score', score != null ? String(score) : '—',
        (hs && hs.delta != null && hs.delta !== 0 ? (hs.delta > 0 ? '+' : '') + hs.delta + ' in 28 days' : 'no change in 28 days')],
      ['Areas measured', measured, 'the rest are unknown, not zero'],
      ['Search opportunities', String(leaks.length), leaks.length ? '~' + leakImpr.toLocaleString() + ' impressions behind' : 'none detected yet'],
      ['Pages published', String(history.length), submitted + ' sent to Google']
    ];
    const tw = CW / 4;
    tiles.forEach((t, i) => {
      const x = L + i * tw;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUT);
      doc.text(String(t[0]).toUpperCase(), x, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor.apply(doc, NAVY);
      doc.text(t[1], x, y + 24);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUT);
      doc.text(doc.splitTextToSize(t[2], tw - 10), x, y + 38);
    });
    y += 66;
    // The single most important caveat in the whole document.
    if (hs && hs.measuredCount < hs.totalPillars) {
      doc.setFillColor(253, 240, 221); doc.setDrawColor(242, 227, 200);
      const msg = 'Your score of ' + (score != null ? score : '—') + ' is an average of the '
        + hs.measuredCount + ' area' + (hs.measuredCount === 1 ? '' : 's') + ' we can currently see. '
        + (hs.totalPillars - hs.measuredCount) + ' of ' + hs.totalPillars
        + ' are unmeasured — treat them as unknown rather than as zero or as passing.';
      // Set the size BEFORE measuring. splitTextToSize wraps at the CURRENT font
      // size, and the tile loop above leaves it at 7.5pt — wrapping there and
      // then printing at 9pt overflowed the box on every line.
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const ml = doc.splitTextToSize(msg, CW - 24);
      need(ml.length * 12 + 26);
      doc.setFillColor(253, 240, 221); doc.setDrawColor(242, 227, 200);
      doc.roundedRect(L, y, CW, ml.length * 12 + 20, 6, 6, 'FD');
      doc.setTextColor(107, 77, 9);
      doc.text(ml, L + 12, y + 15); y += ml.length * 12 + 34;
    }

    // ---------------- pillars ----------------
    if (hs && Array.isArray(hs.pillars) && hs.pillars.length) {
      h2('The five areas we score');
      table(['Area', 'Weight', 'Score', 'What it says'],
        hs.pillars.map(p => [p.label, p.weight + '%',
          p.measured ? (p.score + '/100') : 'Not measured', p.detail || '']),
        { columnStyles: { 1: { cellWidth: 46 }, 2: { cellWidth: 66 } } });
    }

    // ---------------- search performance ----------------
    h2('Search performance');
    if (perf && perf.current && perf.source === 'live_gsc') {
      const c = perf.current, pv = perf.previous || {};
      const d = (a, b) => (b == null || a == null) ? '' : ((a - b >= 0 ? '+' : '') + Number(a - b).toLocaleString());
      table(['Measure', 'Last 28 days', 'Previous 28', 'Change'], [
        ['Times you appeared in search', num(c.impressions), num(pv.impressions), d(c.impressions, pv.impressions)],
        ['Clicks to your site', num(c.clicks), num(pv.clicks), d(c.clicks, pv.clicks)],
        ['Average Google rank', String(c.avgPosition), pv.avgPosition == null ? '—' : String(pv.avgPosition),
          (pv.avgPosition == null ? '' : (c.avgPosition - pv.avgPosition <= 0 ? 'improved' : 'slipped'))]
      ], { columnStyles: { 0: { fontStyle: 'bold' } } });
    } else {
      note('Not measured. Search Console is not connected, so rankings, clicks and impressions '
         + 'cannot be read. This is the biggest single area of the score at 25%, and connecting it '
         + 'takes about five minutes in Settings.', WARN);
    }

    // ---------------- business impact ----------------
    h2('Business impact');
    const impact = [];
    const row = (label, obj, fmt) => {
      if (!obj) { impact.push([label, '—', 'No data returned.']); return; }
      if (obj.available === false) impact.push([label, 'Not measured', obj.reason || '']);
      else impact.push([label, fmt ? fmt(obj) : num(obj.value), obj.note || '']);
    };
    row('All new GHL contacts', perf && perf.leads, o => num(o.current));
    if (perf && perf.leads && perf.leads.attribution) {
      row('Explicit organic / AI contacts', { value: perf.leads.attribution.explicitlySearchAttributed, note: perf.leads.attribution.note });
    }
    row('Branded searches', perf && perf.brandedSearch);
    row('Visits from AI answers', perf && perf.aiReferral);
    table(['Measure', 'Value', 'Why'], impact, { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 }, 1: { cellWidth: 78 } } });

    // ---------------- AI visibility ----------------
    h2('Where you stand in AI search');
    const vis = av && av.latest;
    if (vis) {
      table(['Measure', 'Value'], [
        ['Visibility score', vis.visibilityScore + '%'],
        ['Share of voice', vis.shareOfVoice + '%'],
        ['Sentiment', vis.sentimentScore == null ? '—' : String(vis.sentimentScore)]
      ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } } });
      const lb = (vis.leaderboard || []).slice(0, 8);
      if (lb.length) {
        table(['#', 'Who AI recommends', 'Score'],
          lb.map((l, i) => [String(i + 1), l.name + (l.isBrand ? '  (you)' : ''), l.score + '%']),
          { columnStyles: { 0: { cellWidth: 26 }, 2: { cellWidth: 56 } } });
      }
    } else if (audits.length) {
      note('Across ' + audits.length + ' audit' + (audits.length === 1 ? '' : 's') + ' so far, AI recommended '
         + bizName + ' in ' + recRate + '% of the searches checked.');
    } else {
      note('Not measured. No AI visibility audit has been run yet, so there is nothing to say about '
         + 'whether ChatGPT, Gemini or Google’s AI answers name you. An audit takes about a minute.', WARN);
    }

    // ---------------- movers ----------------
    const movers = (perf && perf.movers) || {};
    const gain = movers.gainers || [], lose = movers.losers || [];
    if (gain.length || lose.length) {
      h2('Biggest movers');
      table(['Direction', 'Search term', 'Rank change'],
        gain.slice(0, 6).map(m => ['Improved', m.query || m.term || '', String(m.change ?? m.delta ?? '')])
          .concat(lose.slice(0, 6).map(m => ['Slipped', m.query || m.term || '', String(m.change ?? m.delta ?? '')])),
        { columnStyles: { 0: { cellWidth: 62 }, 2: { cellWidth: 74 } } });
    }

    // ---------------- opportunities ----------------
    h2('Your biggest opportunities');
    if (leaks.length) {
      note('Searches where you already appear but get no clicks. These are the pages worth creating next.');
      table(['Search term', 'Monthly impressions', 'Your rank'],
        leaks.slice().sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 10)
          .map(d => [d.query || '', num(d.impressions), d.position == null ? '—' : String(Math.round(d.position))]),
        { columnStyles: { 1: { cellWidth: 108 }, 2: { cellWidth: 62 } } });
    } else {
      note('None detected. Connect Search Console to surface the searches you appear in but get nothing from.', WARN);
    }

    // ---------------- content ----------------
    h2('Content you have launched');
    if (history.length) {
      table(['Page', 'Submitted to Google'],
        history.slice(0, 12).map(h => [h.title || h.keyword || 'Untitled page',
          /requested|indexed/i.test(h.indexed || '') ? 'Yes' : 'Not yet']),
        { columnStyles: { 1: { cellWidth: 120 } } });
    } else {
      note('Nothing published through SEO Buddy yet.');
    }

    // ---------------- autopilot ----------------
    h2('What SEO Buddy handled on its own');
    if (ap) {
      const nxt = ap.nextRunTime ? new Date(ap.nextRunTime).toLocaleString('en-US',
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
      table(['Setting', 'Value'], [
        ['Autopilot', ap.enabled ? 'On' : 'Off'],
        ['Runs every', ap.intervalHours ? Math.round(ap.intervalHours / 24) + ' day(s)' : '—'],
        ['Next run', nxt],
        ['Queued jobs', String((ap.queue || []).length)],
        ['Targets being watched', String((ap.targets || []).length)]
      ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 150 } } });
      const logs = (ap.logs || []).slice(0, 8);
      if (logs.length) {
        table(['Recent activity'], logs.map(l => [String(l.message || l.text || l).slice(0, 150)]), {});
      }
    } else {
      note('Autopilot status unavailable.');
    }

    // ---------------- digest ----------------
    if (dig && dig.digest && dig.digest.text) {
      h2('This week in plain English');
      note(String(dig.digest.text).replace(/\s*\n\s*/g, '\n').trim(), INK);
    }

    // ---------------- next moves ----------------
    const moves = Array.isArray(nmRaw) ? nmRaw : (nmRaw && nmRaw.moves) || [];
    if (moves.length) {
      h2('What to do next');
      table(['Priority', 'Action', 'Why it matters'],
        moves.slice(0, 8).map(m => [(m.impact || '').toUpperCase(), m.title || '', m.why || '']),
        { columnStyles: { 0: { cellWidth: 62 } } });
    }

    // ---------------- how to read this ----------------
    h2('How to read this report');
    note('The visibility score is an average of only the areas we can currently measure, weighted by '
       + 'importance: Found on Google 25%, Local listings 20%, AI recommends you 20%, Get listed 20%, '
       + 'Fresh content 15%. An unmeasured area is not a zero and not a pass — it is unknown, and '
       + 'connecting it is usually the fastest way to move the number. Anything marked "Not measured" '
       + 'above lists the reason and what to connect.');

    // ---------------- footer ----------------
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE); doc.line(L, H - 38, R, H - 38);
      doc.setFontSize(8); doc.setTextColor.apply(doc, MUT); doc.setFont('helvetica', 'normal');
      doc.text(bizName + '  ·  generated by SEO Buddy  ·  ' + today, L, H - 24);
      doc.text('Page ' + i + ' of ' + pages, R, H - 24, { align: 'right' });
    }
    const fname = bizName.replace(/[^a-z0-9]+/gi, '-') + '-Progress-Report-'
      + new Date().toISOString().slice(0, 10) + '.pdf';
    doc.save(fname);
    return fname;
  }

  global.SeoBuddyPdfReport = Object.freeze({ generate: generateSeoReportPdf });
})(window);
