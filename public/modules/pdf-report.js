'use strict';

(function exposePdfReport(global) {
  const ENDPOINTS = Object.freeze({
    score: 'health-score', performance: 'performance', moves: 'next-moves',
    profile: 'business-profile', search: 'gsc-data', history: 'history',
    ai: 'ai-visibility', digest: 'performance-digest', automation: 'automation-status',
    reviews: 'reviews-stats', readiness: 'deploy-readiness',
  });
  const COLORS = { navy: [27, 46, 142], ink: [17, 31, 50], muted: [88, 101, 119],
    teal: [5, 116, 95], orange: [247, 148, 30], paper: [247, 246, 242],
    line: [225, 229, 235], warning: [143, 82, 0] };
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const format = value => number(value) == null ? 'Not available' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const signed = value => number(value) == null ? 'No comparison' : `${value > 0 ? '+' : ''}${format(value)}`;
  const valid = value => value && value.success !== false ? value : null;
  const list = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
  const date = value => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded';
  const range = value => value?.startDate && value?.endDate ? `${date(value.startDate)} - ${date(value.endDate)}` : 'Dates unavailable';
  // Standard PDF Latin fonts cannot render emoji/surrogates. Normalize
  // punctuation to prevent broken text streams, preserving supported accents.
  const text = value => String(value ?? '').replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '').trim();

  function publicationStatus(entry) {
    const value = `${entry.platform || ''} ${entry.status || ''}`;
    if (/mock|demo|sample/i.test(value)) return 'Demo record';
    if (/draft/i.test(value)) return 'Draft';
    if (/\bpublished\b/i.test(value)) return 'Published (recorded)';
    return 'Status unverified';
  }
  function submissionStatus(entry) {
    const status = String(entry.indexed || '');
    if (/failed|error/i.test(status)) return 'Request failed';
    if (/requested/i.test(status)) return 'Requested';
    if (/\bindexed\b/i.test(status)) return 'Indexed (recorded)';
    return 'Not confirmed';
  }

  // Normalize evidence separately from drawing. Unknown is not zero; saved
  // drafts, demos, and indexing requests are not confirmed publications.
  function buildModel(input, now = new Date()) {
    const data = Object.fromEntries(Object.keys(ENDPOINTS).map(key => [key, valid(input[key])]));
    const { score, performance, profile, search, ai, digest, readiness } = data;
    const history = Array.isArray(data.history) ? list(data.history) : null;
    const features = Array.isArray(data.automation?.features) ? list(data.automation.features) : null;
    const moves = Array.isArray(data.moves?.moves) ? list(data.moves.moves) : null;
    const day = now.toISOString().slice(0, 10);
    const start = new Date(Date.parse(day) - 27 * 86400000).toISOString().slice(0, 10);
    const rows = history?.map(entry => ({ ...entry, publication: publicationStatus(entry), submission: submissionStatus(entry) })) ?? null;
    const recent = rows?.filter(entry => {
      const stamp = entry.date || entry.publishedAt;
      if (!stamp || !Number.isFinite(Date.parse(stamp))) return false;
      const recordDay = new Date(stamp).toISOString().slice(0, 10);
      return recordDay >= start && recordDay <= day;
    }) ?? null;
    const liveSearch = search?.source === 'live_gsc' && Array.isArray(search.data);
    const livePerformance = performance?.source === 'live_gsc' && !!performance.current;
    const gscCheck = list(readiness?.checks).find(check => check.key === 'gsc');
    const searchUnavailable = /mock|demo/.test(performance?.source || '')
      ? 'Demo search data was excluded. These are not live business results.'
      : gscCheck?.ok === true ? 'Search Console is configured, but its figures could not be loaded. Retry the download; do not reconnect solely because of this report.'
        : gscCheck?.ok === false ? 'Search Console is not configured. Open Settings to connect it.'
          : 'Search figures and connection status could not be verified. This does not mean the account is disconnected.';
    const warnings = [];
    if (!score || number(score.overall) == null) warnings.push('The optimization score could not be verified. No zero score is assumed.');
    if (score && score.delta == null) warnings.push('The 28-day score comparison is still building; no change is not being claimed.');
    const stale = list(score?.pillars).filter(p => (score?.confidence?.stalePillars || []).includes(p.key));
    if (stale.length) warnings.push(`Older score evidence: ${stale.map(p => p.label).join(', ')}. Refresh these checks before relying on the score.`);
    if (!livePerformance) warnings.push(searchUnavailable);
    if (number(data.reviews?.inventory?.published) === 0) warnings.push('The reviews-page scan detected no review cards. Verify the page/parser; this is not proof that customer reviews disappeared.');
    if (digest?.digest && digest.digest.source !== 'live_gsc') warnings.push('A saved weekly summary uses demo or unverified data. It is excluded from this report.');
    const missing = Object.entries(data).filter(([, value]) => !value).map(([key]) => key);
    if (missing.length) warnings.push(`Some checks were unavailable: ${missing.join(', ')}. Available sections remain useful; retry for a complete report.`);
    return { ...data, generatedAt: now.toISOString(), businessName: profile?.profile?.name || 'Business profile unavailable',
      website: profile?.profile?.website || 'Website not recorded', rows, recent, features, moves, stale, warnings,
      activityPeriod: { startDate: start, endDate: day }, livePerformance, searchUnavailable, liveSearch,
      gaps: liveSearch ? list(search.data).filter(row => row.leak === true).sort((a, b) => (b.impressions || 0) - (a.impressions || 0)) : null,
      publishedRecent: recent ? recent.filter(entry => entry.publication === 'Published (recorded)').length : null,
      draftsRecent: recent ? recent.filter(entry => entry.publication === 'Draft').length : null,
      latestAi: ai?.latest || null,
    };
  }

  let librariesPromise = null;
  const libraryLoads = new Map();
  function loadLibrary(src, ready) {
    if (ready()) return Promise.resolve();
    if (libraryLoads.has(src)) return libraryLoads.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer); script.onload = null; script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('The report library took too long to load. Try again.')), 20000);
      script.src = src;
      script.onload = () => finish(ready() ? null : new Error('The report library did not initialize. Try again.'));
      script.onerror = () => finish(new Error('Could not load the report library. Try again.'));
      document.head.appendChild(script);
    }).catch(error => { libraryLoads.delete(src); throw error; });
    libraryLoads.set(src, promise);
    return promise;
  }
  function ensureLibraries() {
    if (!librariesPromise) librariesPromise = loadLibrary('/jspdf.umd.min.js', () => !!global.jspdf?.jsPDF)
      .then(() => loadLibrary('/jspdf.plugin.autotable.min.js', () => !!global.jspdf?.jsPDF?.API.autoTable))
      .catch(error => { librariesPromise = null; throw error; });
    return librariesPromise;
  }
  // Use the owner's existing SVG unchanged, at print resolution. An unavailable
  // logo must not prevent downloading a useful report with a text wordmark.
  function loadLogo() {
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      const timer = setTimeout(() => finish(null), 5000);
      function finish(value) {
        if (done) return;
        done = true; clearTimeout(timer); img.onload = null; img.onerror = null; resolve(value);
      }
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 480;
          canvas.getContext('2d').drawImage(img, 0, 0, 480, 480);
          finish(canvas.toDataURL('image/png'));
        } catch (_) { finish(null); }
      };
      img.onerror = () => finish(null);
      img.src = '/sb-mark.svg?v=20260903';
    });
  }

  function buildDocument(model, logo = null) {
    const doc = new global.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const L = 40, R = W - L, width = R - L, bottom = H - 56;
    let y = 0, section = '';
    const font = (size = 10, bold = false, tone = 'ink') => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...COLORS[tone]); };
    const line = () => { doc.setDrawColor(...COLORS.line); doc.setLineWidth(0.5); doc.line(L, y, R, y); };
    const header = () => {
      doc.setFillColor(...COLORS.paper); doc.rect(0, 0, W, 59, 'F');
      if (logo) doc.addImage(logo, 'PNG', L, 13, 32, 32);
      font(12, true, 'navy'); doc.text('SEO Buddy', L + (logo ? 40 : 0), 33);
      font(8, false, 'muted'); doc.text('VISIBILITY & GROWTH REPORT', R, 33, { align: 'right' });
    };
    const continuation = () => { doc.addPage(); header(); y = 86; font(12, true); doc.text(text(section) + ' / continued', L, y); y += 22; };
    const need = height => { if (y + height > bottom) continuation(); };
    const paragraph = (value, tone = 'muted', size = 9.5, bold = false) => {
      font(size, bold, tone);
      // A small inset accommodates PDF viewers' standard-font metric variance.
      const lines = doc.splitTextToSize(text(value), width - 8);
      for (const row of lines) { need(size * 1.4); font(size, bold, tone); doc.text(row, L, y); y += size * 1.4; }
      y += 8;
    };
    const h2 = title => { need(85); font(12, true); doc.text(title, L, y); y += 9; line(); y += 15; };
    const page = (index, title, subtitle) => {
      if (index > 1) doc.addPage();
      section = title; header(); y = 87;
      font(8, true, 'teal'); doc.text(`0${index} / ${title.toUpperCase()}`, L, y); y += 30;
      font(24, true); doc.text(title, L, y); y += 23;
      paragraph(subtitle); y += 4;
    };
    const table = (head, body, widths = {}) => {
      if (!body.length) return;
      need(65);
      doc.autoTable({ startY: y, head: [head.map(text)], body: body.map(row => row.map(text)),
        margin: { top: 78, bottom: 56, left: L, right: L }, theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: COLORS.ink, overflow: 'linebreak', lineColor: COLORS.line, lineWidth: { bottom: 0.5 } },
        headStyles: { fillColor: COLORS.navy, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: COLORS.paper }, columnStyles: widths, rowPageBreak: 'avoid',
        willDrawPage: data => { if (data.pageNumber > 1) header(); },
      });
      y = doc.lastAutoTable.finalY + 18;
    };
    const tiles = values => {
      need(107); const gap = 12, tileWidth = (width - gap * (values.length - 1)) / values.length;
      values.forEach(([label, value, hint], index) => {
        const x = L + index * (tileWidth + gap);
        doc.setFillColor(...COLORS.paper); doc.roundedRect(x, y, tileWidth, 98, 8, 8, 'F');
        font(8, true, 'muted'); doc.text(label.toUpperCase(), x + 12, y + 19);
        font(number(value) == null && String(value).length > 10 ? 15 : 29, true, 'navy'); doc.text(String(value), x + 12, y + 52);
        font(8, false, 'muted'); doc.text(doc.splitTextToSize(text(hint), tileWidth - 24), x + 12, y + 72);
      }); y += 114;
    };
    const { score, performance: pf, latestAi: ai, reviews, automation } = model;
    const current = model.livePerformance ? pf.current : {}, previous = model.livePerformance ? pf.previous || {} : {};
    const delta = (a, b) => number(a) == null || number(b) == null ? null : Math.round((a - b) * 100) / 100;
    const appUrl = global.location?.origin || '';
    const link = (label, slug) => {
      need(22); font(9.5, true, 'navy');
      if (/^https?:\/\//.test(appUrl)) doc.textWithLink(label, L, y, { url: `${appUrl}/#/${slug}` });
      else doc.text(label, L, y);
      y += 23;
    };

    page(1, 'Your progress, clearly.', 'Measured results. Recorded work. Your next best actions.');
    paragraph(model.businessName, 'ink', 17, true);
    paragraph(`${model.website}\nPrepared ${date(model.generatedAt)} | Snapshot at download`, 'muted', 9);
    tiles([
      ['Optimization score', number(score?.overall) ?? 'Unavailable', !score ? 'Score check unavailable' : score.delta == null ? '28-day comparison building' : `${signed(score.delta)} points vs 28-day baseline`],
      ['Google clicks', number(current.clicks) ?? 'Unavailable', 'Latest available 28-day window'],
      ['Published records', model.publishedRecent ?? 'Unavailable', 'Last 28 calendar days; drafts excluded'],
    ]);
    h2('What the numbers say');
    paragraph(model.livePerformance
      ? `Google clicks: ${format(current.clicks)} vs ${format(previous.clicks)} (${signed(delta(current.clicks, previous.clicks))}). Search appearances: ${format(current.impressions)} vs ${format(previous.impressions)}. Position: ${current.impressions ? format(current.avgPosition) : 'Not available'} vs ${previous.impressions ? format(previous.avgPosition) : 'Not available'}; lower is better. Changes alone do not establish their cause.`
      : model.searchUnavailable, 'ink');
    const top = score?.explainability?.topOpportunity;
    if (top) paragraph(`Largest measured scoring gap: ${top.label}, with ${format(top.availableScorePoints)} points of theoretical headroom. This is not a promised gain or a revenue forecast.`, 'ink');
    h2('Your next three actions');
    if (model.moves?.length) table(['Action', 'Who / where'], model.moves.slice(0, 3).map(move => [move.title || move.ownerTitle, `${move.doerLabel || 'Review needed'}\n${move.realEffort || move.effort || 'Effort not recorded'}\nApprovals or Tools`]), { 1: { cellWidth: 145 } });
    else paragraph(model.moves ? 'No action was returned by the recommendation check. This is not a guarantee that every area is complete.' : 'Recommendations could not be loaded. Open Today to retry.');
    h2('Read this before sharing');
    paragraph(model.warnings.length ? model.warnings.slice(0, 3).join('\n') : 'The score measures optimization, not revenue. Source dates and limitations are included on the following pages.', model.warnings.length ? 'warning' : 'muted', 9);
    link('Open Today to review priorities', 'today');

    page(2, 'Score & evidence', 'The app score, its inputs, and the checks behind it.');
    tiles([
      ['App score', number(score?.overall) ?? 'Unavailable', 'Smoothed optimization score / 100'],
      ['Current inputs', number(score?.liveOverall) ?? 'Unavailable', 'Unsmoothed score / 100'],
      ['Evidence confidence', number(score?.confidence?.percent) == null ? 'Unavailable' : `${score.confidence.percent}%`, 'Coverage/freshness indicator, not probability'],
    ]);
    const pillars = list(score?.pillars);
    if (pillars.length) table(['Area / weight', 'Score', 'Evidence / source date'], pillars.map(p => [
      `${p.label}\n${format(p.weight)}% weight`, p.measured && number(p.score) != null ? `${format(p.score)}/100` : 'Unknown',
      `${p.detail || 'No detail returned'}\n${date(p.sourceUpdatedAt)}${model.stale.some(s => s.key === p.key) ? ' | Older than 14 days' : ''}`,
    ]), { 0: { cellWidth: 139 }, 1: { cellWidth: 64 } });
    else paragraph('Score inputs are unavailable. No missing area is treated as zero or as passing.', 'warning');
    h2('How to interpret the score');
    paragraph(`Score version: ${format(score?.scoreVersion)}. Measured areas: ${format(score?.measuredCount)} of ${format(score?.totalPillars)}. The current-input score is a weighted average of measured areas only. Unknown areas are excluded, not passed. Connecting a source can raise or lower the score.`);
    if (score?.smoothing) paragraph(`The app score averages up to ${format(score.smoothing.windowDays)} daily records; ${format(score.smoothing.samples)} are available. Dates need not be consecutive. The 28-day comparison uses a same-version baseline at or before the target date. Without a baseline, change is unknown.`);
    paragraph('Confidence reflects weighted coverage, with a deduction for each measured source older than 14 days. It is not a statistical confidence interval. Design or software updates do not themselves improve this score.');
    h2('Latest AI visibility check');
    if (ai) {
      table(['Checked', 'Visibility', 'Sample / engines'], [[date(ai.ranAt || ai.date || model.ai.lastRun), number(ai.visibilityScore) == null ? 'Not available' : `${format(ai.visibilityScore)}%`, `${format(ai.totalAnswers)} answers\n${list(ai.perEngine).map(e => e.label).join(', ') || 'Engines not recorded'}`]], { 0: { cellWidth: 111 }, 1: { cellWidth: 90 } });
      paragraph(`Share of voice: ${number(ai.shareOfVoice) == null ? 'Not available' : format(ai.shareOfVoice) + '%'}. Sentiment score: ${format(ai.sentimentScore)}. These describe the saved test sample, not all AI searches. The scored AI pillar can use a different, older audit set; its source date appears above.`, 'muted', 9);
    } else paragraph('No latest AI visibility result is available. This is not a zero visibility score.');
    link('Inspect AI checks in the app', 'tools/ai-visibility');

    page(3, 'Search performance', 'Search Console comparisons and the terms worth reviewing.');
    paragraph(`Current: ${range(pf?.periods?.current)}\nPrevious: ${range(pf?.periods?.previous)}`, 'muted', 9);
    if (model.livePerformance) {
      table(['Measure', 'Current', 'Previous', 'Change'], [
        ['Google clicks', format(current.clicks), format(previous.clicks), signed(delta(current.clicks, previous.clicks))],
        ['Search appearances', format(current.impressions), format(previous.impressions), signed(delta(current.impressions, previous.impressions))],
        ['Average position (lower is better)', current.impressions ? format(current.avgPosition) : 'Not available', previous.impressions ? format(previous.avgPosition) : 'Not available', current.impressions && previous.impressions ? signed(delta(current.avgPosition, previous.avgPosition)) : 'No comparison'],
        ['Click-through rate', number(current.ctr) == null ? 'Not available' : `${format(current.ctr)}%`, number(previous.ctr) == null ? 'Not available' : `${format(previous.ctr)}%`, delta(current.ctr, previous.ctr) == null ? 'No comparison' : `${signed(delta(current.ctr, previous.ctr))} pp`],
      ], { 0: { cellWidth: 207 } });
      paragraph(`Two 28-day windows ending three days before the server check. Totals cover up to ${format(pf.queryRowLimit || 250)} returned query rows per window and may differ from full property totals. "pp" means percentage points.`, 'muted', 9);
    } else paragraph(model.searchUnavailable, 'warning');
    const movers = model.livePerformance ? [...list(pf.movers?.gainers).slice(0, 3), ...list(pf.movers?.losers).slice(0, 3)] : [];
    h2('Largest position changes');
    if (movers.length) table(['Search term', 'Position', 'Movement'], movers.map(m => [m.query, format(m.position), number(m.posChange) == null ? 'Not available' : `${format(Math.abs(m.posChange))} ${m.posChange > 0 ? 'better' : m.posChange < 0 ? 'worse' : 'unchanged'}`]), { 1: { cellWidth: 66 }, 2: { cellWidth: 95 } });
    else paragraph(model.livePerformance ? 'No comparable movers were returned for these windows.' : 'Position changes cannot be verified.');
    h2('Search opportunities');
    if (model.gaps?.length) table(['Search term', 'Appearances', 'Position'], model.gaps.slice(0, 5).map(row => [row.query, format(row.impressions), format(row.position)]), { 1: { cellWidth: 90 }, 2: { cellWidth: 66 } });
    else paragraph(model.gaps ? 'No zero-click opportunities met the threshold in the returned query sample.' : 'Opportunity data is unavailable; no all-clear is being claimed.');
    paragraph(`Opportunity window: ${range(model.search?.period)}. A separate 30-day lookback ending on the check date, up to ${format(model.search?.queryRowLimit || 100)} rows, flags more than 10 impressions and zero clicks. Showing up to five of ${model.gaps ? model.gaps.length : 'unknown'} opportunities; do not compare this count directly with the scoring input.`, 'muted', 9);
    link('Review search terms and matching pages', 'tools/search');

    page(4, 'Work & automation', 'A schedule is not completion. A draft is not a published page.');
    paragraph(`Automation checked: ${date(automation?.checkedAt)}. Next-run dates marked "estimated" are calculated schedules, not delivery promises.`, 'muted', 9);
    if (model.features) table(['Workflow', 'State', 'Recorded / next'], model.features.map(f => [f.title, f.label || f.status || 'Unknown',
      `Last: ${date(f.lastRecordedAt)}\nNext: ${date(f.nextRunAt)}${f.nextRunEstimated ? ' (estimated)' : ''}`]), { 0: { cellWidth: 177 }, 1: { cellWidth: 94 } });
    else paragraph('Automation status is unavailable. No workflow is assumed to be running.', 'warning');
    paragraph('Scheduled = enabled for checks. Running = not finished. Needs approval = prepared work, not published. Completed = recorded past activity, with automatic runs paused. Open Today for full explanations.', 'muted', 9);
    h2('Content activity');
    paragraph(`${range(model.activityPeriod)} (UTC calendar dates): ${format(model.publishedRecent)} published records and ${format(model.draftsRecent)} drafts. ${model.rows ? model.rows.length : 'Unknown'} saved records across all dates. Undated, demo, and unverified records are not counted as published.`, 'ink');
    if (model.rows?.length) table(['Latest saved content', 'Status', 'Google submission'], model.rows.slice().sort((a, b) => String(b.date || b.publishedAt || '').localeCompare(String(a.date || a.publishedAt || ''))).slice(0, 4).map(row => [
      `${row.title || row.keyword || 'Untitled record'}\n${date(row.date || row.publishedAt)}`, row.publication, row.submission,
    ]), { 1: { cellWidth: 103 }, 2: { cellWidth: 91 } });
    else paragraph(model.rows ? 'No saved content records were returned.' : 'Content history could not be loaded. It is not being counted as zero.');
    paragraph('Saved statuses are not a fresh live-page inspection. An indexing request is not proof of indexing, ranking, or traffic. Showing up to four recent records; the app retains the full history.', 'muted', 9);
    link('Open content history to verify publication', 'tools/content/publish');

    page(5, 'Business impact & next steps', 'Keep outcomes, attribution, and evidence limits separate.');
    const leads = pf?.leads, brand = pf?.brandedSearch;
    table(['Measure', 'Value', 'What it means'], [
      ['New GHL contacts', leads?.available === true ? format(leads.current) : 'Not available', leads?.available === true ? `Previous: ${format(leads.previous)}. All sources, not SEO-only.${leads.approx ? ' Limited to the 100-contact response; counts may be incomplete.' : ''}` : 'Contact activity could not be verified. Check Settings.'],
      ['Explicit organic / AI contacts', leads?.available === true ? format(leads.attribution?.explicitlySearchAttributed) : 'Not available', 'Only contacts with explicit source evidence. Zero does not prove search had no influence.'],
      ['Branded search', model.livePerformance && brand?.available === true ? `${format(brand.current?.impressions)} appearances\n${format(brand.current?.clicks)} clicks` : 'Not available', 'Configured brand terms in the returned search query sample.'],
      ['Visits from AI answers', pf?.aiReferral?.available === true ? format(pf.aiReferral.value) : 'Not measured', 'Separate referral analytics are required. Recommendations are not website visits.'],
      ['Review cards detected', format(reviews?.inventory?.published), 'Reviews-site parser inventory, not your total Google or platform review count.'],
      ['Average detected rating', format(reviews?.inventory?.avgRating), `Review-page health: ${format(reviews?.score)}/100. No rating trend is inferred.`],
    ], { 0: { cellWidth: 131 }, 1: { cellWidth: 107 } });
    paragraph(`Contact window: ${range(pf?.periods?.contacts)} (rolling 28 days at the server check). Search windows differ because of reporting lag. This report does not claim measured revenue or treat all contacts as SEO conversions.`, 'muted', 9);
    h2('What to do next in SEO Buddy');
    paragraph('Today: priorities and automation problems. Approvals: prepared work. Results: search comparisons. Tools: terms, listings, AI checks, reviews, and content. Business: details and brand voice. Settings: connections.');
    link('Review approvals and owner actions', 'approvals');
    h2('Evidence notes');
    paragraph(`Score calculated: ${date(score?.freshness?.calculatedAt)}. Oldest measured score source: ${date(score?.freshness?.oldestSourceAt)}. AI check: ${date(ai?.ranAt || ai?.date)}. Reviews checked: ${date(reviews?.checkedAt)}. This is a snapshot at download; data may be cached.`, 'muted', 9);
    paragraph('This report uses current app checks, not the saved weekly narrative. Older summaries may use a different score version or demo data and are not evidence for this period.', 'muted', 9);
    model.warnings.forEach(warning => paragraph(warning, 'warning', 9));

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); y = H - 39; line();
      font(8, false, 'muted'); doc.text(`SEO Buddy | ${date(model.generatedAt)} | Report v2`, L, H - 24);
      doc.text(`${i} / ${pages}`, R, H - 24, { align: 'right' });
      doc.setFillColor(...COLORS.orange); doc.rect(L, H - 40, 32, 2, 'F');
    }
    doc.setProperties({ title: `${text(model.businessName)} - Visibility & Growth Report`, author: 'SEO Buddy', subject: 'Measured progress, source evidence, and next actions', creator: 'SEO Buddy report v2' });
    return doc;
  }

  async function generate() {
    await ensureLibraries();
    const [entries, logo] = await Promise.all([
      Promise.all(Object.entries(ENDPOINTS).map(async ([key, path]) => [key, await global.SeoBuddyCore.readCheckedJson(`/api/${path}`).catch(() => null)])),
      loadLogo(),
    ]);
    const data = Object.fromEntries(entries);
    if (!data.score && !data.performance && !data.history) throw new Error('Report data could not be loaded. Please retry; no empty report was downloaded.');
    const model = buildModel(data);
    const filename = `${model.businessName.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}-Visibility-Growth-Report-${model.generatedAt.slice(0, 10)}.pdf`;
    buildDocument(model, logo).save(filename);
    return filename;
  }
  global.SeoBuddyPdfReport = Object.freeze({ generate, buildModel, buildDocument });
})(window);
