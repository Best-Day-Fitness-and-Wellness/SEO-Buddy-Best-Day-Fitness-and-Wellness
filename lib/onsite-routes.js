'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const ONSITE_TOOLS = new Set(['keywords', 'titlemeta', 'links', 'fanout', 'aeoReadiness']);

function isBlockedAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (net.isIP(value) === 4) {
    const parts = value.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 168))
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  if (net.isIP(value) === 6) {
    if (value.startsWith('::ffff:')) return isBlockedAddress(value.slice(7));
    return value === '::' || value === '::1' || value.startsWith('fe8') || value.startsWith('fe9')
      || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('fc')
      || value.startsWith('fd') || value.startsWith('ff') || value.startsWith('2001:db8:');
  }
  return true;
}

async function assertPublicHttpUrl(value, lookup = dns.lookup) {
  let parsed;
  try { parsed = new URL(value); } catch (error) { throw new Error('Enter a valid public page URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Only public http:// or https:// page URLs are supported.');
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    throw new Error('Only standard public website ports (80 and 443) are supported.');
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or local network addresses cannot be scanned.');
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('Private or reserved network addresses cannot be scanned.');
  } else {
    let records;
    try { records = await lookup(host, { all: true, verbatim: true }); }
    catch (error) { throw new Error('That hostname could not be resolved.'); }
    if (!records.length || records.some(record => isBlockedAddress(record.address))) {
      throw new Error('That hostname resolves to a private or reserved network address.');
    }
  }
  return parsed;
}

async function fetchPublicHtml(value, maxBytes = 2 * 1024 * 1024, options = {}) {
  const validatePublicUrl = options.validatePublicUrl || assertPublicHttpUrl;
  const fetchImpl = options.fetchImpl || fetch;
  let current = value;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const parsed = await validatePublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetchImpl(parsed, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBuddyBot/1.0)' },
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('The page redirected without a destination.');
        if (response.body) await response.body.cancel();
        current = new URL(location, parsed).toString();
        continue;
      }
      if (!response.ok) return { response, html: '', url: parsed.toString() };
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > maxBytes) throw new Error('That page is too large to scan safely (2 MB limit).');
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      if (!reader) {
        const html = await response.text();
        if (Buffer.byteLength(html) > maxBytes) throw new Error('That page is too large to scan safely (2 MB limit).');
        return { response, html, url: parsed.toString() };
      }
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        total += chunk.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error('That page is too large to scan safely (2 MB limit).');
        }
        chunks.push(Buffer.from(chunk));
      }
      return { response, html: Buffer.concat(chunks).toString('utf8'), url: parsed.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('That page redirected too many times.');
}

function extractPageContent(html) {
  const clean = value => (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? clean(titleMatch[1]) : '';
  const headings = [];
  const headingPattern = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = headingPattern.exec(html)) && headings.length < 40) {
    const text = clean(match[2]);
    if (text) headings.push(`${match[1].toUpperCase()}: ${text}`);
  }
  let bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (bodyText.length > 5000) bodyText = bodyText.slice(0, 5000);
  return { pageTitle, headings, bodyText };
}

function buildOnsiteSchemas({ siteUrl, business, authorName, authorUrl }) {
  let domain = (siteUrl || 'https://bestdayfitness.com').trim();
  if (domain.startsWith('sc-domain:')) domain = `https://${domain.substring(10)}`;
  domain = domain.replace(/\/$/, '');

  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Personal Training for Adults 50+',
    provider: { '@type': 'SportsClub', name: business.name, '@id': `${domain}/#organization` },
    areaServed: { '@type': 'City', name: 'St. Petersburg, FL' },
    description: 'Personalized personal training, integrated physical therapy, and mobility coaching for adults 50+, seniors, and people recovering from injury.',
  };
  const review = {
    '@context': 'https://schema.org',
    '@type': 'SportsClub',
    name: business.name,
    '@id': `${domain}/#organization`,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 'REPLACE_WITH_YOUR_REAL_GOOGLE_RATING',
      reviewCount: 'REPLACE_WITH_YOUR_REAL_REVIEW_COUNT',
      bestRating: '5',
    },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: domain },
      { '@type': 'ListItem', position: 2, name: 'Services', item: `${domain}/services` },
      { '@type': 'ListItem', position: 3, name: 'Personal Training', item: `${domain}/personal-training` },
    ],
  };
  const faqpage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'REPLACE with a real question people ask, e.g. Is Best Day Fitness good for adults over 65?', acceptedAnswer: { '@type': 'Answer', text: 'REPLACE with a direct 40–60 word answer that stands on its own.' } },
      { '@type': 'Question', name: 'REPLACE with a second real question, e.g. Do you help people recovering from injury?', acceptedAnswer: { '@type': 'Answer', text: 'REPLACE with a direct 40–60 word answer.' } },
    ],
  };
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'REPLACE with the article title (under 110 characters)',
    author: { '@type': 'Person', name: authorName || "REPLACE with the author's full name", url: authorUrl || "REPLACE with the author's profile or LinkedIn URL" },
    publisher: { '@type': 'Organization', name: business.name, '@id': `${domain}/#organization` },
    datePublished: 'REPLACE with YYYY-MM-DD',
    dateModified: 'REPLACE with YYYY-MM-DD',
    mainEntityOfPage: 'REPLACE with the full URL of this article',
  };
  const howto = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'REPLACE with the how-to title, e.g. How to Improve Balance for Seniors at Home',
    step: [
      { '@type': 'HowToStep', name: 'Step 1 title', text: "REPLACE with the first step's instructions." },
      { '@type': 'HowToStep', name: 'Step 2 title', text: "REPLACE with the second step's instructions." },
      { '@type': 'HowToStep', name: 'Step 3 title', text: "REPLACE with the third step's instructions." },
    ],
  };

  return { service, review, breadcrumb, faqpage, article, howto };
}

function buildAeoAuditPrompt({ target, pageTitle, headings, bodyText }) {
  return `You are an AEO (Answer Engine Optimization) auditor. Score how ready this web page is to be extracted and cited by AI answer engines (ChatGPT, Perplexity, Google AI Overviews). Judge only what the page actually shows.

PAGE URL: ${target}
PAGE TITLE: ${pageTitle || '(none found)'}
HEADINGS FOUND:
${headings.length ? headings.join('\n') : '(no H1-H3 headings found)'}
PAGE TEXT (excerpt):
"""
${bodyText || '(no readable text found)'}
"""

Score the page on these 7 checklist items. For each, decide pass (true/false) and give one specific, plain-English note:
1. answerFirst - Does it lead with a direct, self-contained answer (ideally ~40-60 words) near the top, before background?
2. questionHeaders - Are H2/H3 headings phrased as the real questions people ask?
3. selfContained - Does each section make sense on its own (extractable without the rest)?
4. listsTables - Does it use lists and/or tables that are easy for AI to extract?
5. fanoutCoverage - Does it answer several related sub-questions, not just one narrow point?
6. freshness - Is there a visible publish/updated date and current, non-stale info?
7. dualAudience - Is it clear and well-structured for both humans and AI (plain language, logical order)?

Then set:
- overallScore: 0-100 (roughly the share of items passed, weighted toward answerFirst and questionHeaders).
- bucket: one of "AEO-ready", "Quick win", or "Needs rewrite" (Quick win = mostly good with a few easy fixes; Needs rewrite = several structural gaps).
- topFixes: the 2-4 most impactful, specific changes to make, in plain language for a non-technical owner.

Return ONLY raw JSON, no markdown:
{"overallScore":0,"bucket":"","checklist":[{"key":"answerFirst","label":"Answer-first opening","pass":true,"note":""},{"key":"questionHeaders","label":"Question-style headers","pass":true,"note":""},{"key":"selfContained","label":"Self-contained sections","pass":true,"note":""},{"key":"listsTables","label":"Lists & tables","pass":true,"note":""},{"key":"fanoutCoverage","label":"Covers related questions","pass":true,"note":""},{"key":"freshness","label":"Freshness / dates","pass":true,"note":""},{"key":"dualAudience","label":"Clear for AI & humans","pass":true,"note":""}],"topFixes":[""]}`;
}

function registerOnsiteRoutes(app, options) {
  const {
    requireAuth,
    hasGeminiKey,
    brandPrompt,
    geminiGenerate,
    model,
    parseGeminiJson,
    getHistory,
    getSiteUrl,
    getAuthorName,
    getAuthorUrl,
    business,
    validatePublicUrl = assertPublicHttpUrl,
    fetchPage = fetchPublicHtml,
    logger = console,
  } = options;

  app.post('/api/onsite', requireAuth, async (req, res) => {
    const { tool, seed, keyword, currentTitle, url, query } = req.body || {};
    if (!ONSITE_TOOLS.has(tool)) return res.status(400).json({ success: false, error: 'Unknown tool.' });
    if (tool === 'aeoReadiness') {
      let candidate = String(url || '').trim();
      if (!candidate) return res.status(400).json({ success: false, error: 'Enter a page URL to check.' });
      if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
      try { await validatePublicUrl(candidate); }
      catch (error) {
        return res.status(400).json({ success: false, error: error.message, data: { fetchError: error.message } });
      }
    }
    if (!hasGeminiKey()) {
      return res.json({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to use the on-site tools.',
      });
    }
    const brand = brandPrompt(true);

    try {
      if (tool === 'keywords') {
        if (!seed) return res.status(400).json({ error: 'Enter a seed keyword.' });
        const prompt = `${brand}\nUsing current web information, expand the seed keyword "${seed}" into 4–5 topic clusters this business could realistically target. For each cluster give: a short theme, 4–6 specific keyword phrases people actually search (favor local and long‑tail), 2–3 real questions people ask, and one concrete blog/page content idea. Return ONLY raw JSON, no markdown: {"clusters":[{"theme":"","keywords":[],"questions":[],"contentIdea":""}]}`;
        const result = await geminiGenerate({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return res.json({ success: true, data: parseGeminiJson(result.text) });
      }
      if (tool === 'titlemeta') {
        if (!keyword) return res.status(400).json({ error: 'Enter a target keyword.' });
        const prompt = `${brand}\nWrite SEO title tags and meta descriptions targeting the keyword "${keyword}"${currentTitle ? ` (current title is: "${currentTitle}")` : ''}. Provide 3 title options (each 60 characters or fewer, compelling, naturally including the keyword) and 2 meta descriptions (each 155 characters or fewer, with a clear call to action). Return ONLY raw JSON, no markdown: {"titles":[],"metas":[]}`;
        const result = await geminiGenerate({ model, contents: prompt });
        return res.json({ success: true, data: parseGeminiJson(result.text) });
      }
      if (tool === 'links') {
        const pages = getHistory().map(item => ({ title: item.title, keyword: item.keyword, url: item.url }));
        if (pages.length < 2) {
          return res.json({
            success: true,
            data: {
              suggestions: [],
              note: 'Publish at least two pages first — then this suggests internal links between them to build topic authority.',
            },
          });
        }
        const prompt = `${brand}\nHere are the pages this website has published:\n${JSON.stringify(pages)}\nSuggest internal links between them to build topic authority (pillar/cluster style). For each suggestion give the source page title, the target page title, a natural anchor phrase, and a one‑line reason. Return ONLY raw JSON, no markdown: {"suggestions":[{"from":"","to":"","anchor":"","why":""}]}`;
        const result = await geminiGenerate({ model, contents: prompt });
        return res.json({ success: true, data: parseGeminiJson(result.text) });
      }
      if (tool === 'fanout') {
        const searchQuery = (query || '').trim();
        if (!searchQuery) return res.status(400).json({ error: 'A search query is required.' });
        const prompt = `${brand}\nA person's search is: "${searchQuery}". AI answer engines break a search like this into several related sub-questions ("query fan-out"), then answer each one. Using current web information, list the 5–7 specific, natural questions real people ask around this search — the questions a single, citable article on this topic should answer to earn AI citations. Favor questions this business's audience (adults 50+, seniors, injury recovery, local St. Petersburg) would actually ask. Phrase each as a real question. Return ONLY raw JSON, no markdown: {"questions":["",""]}`;
        const result = await geminiGenerate({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return res.json({ success: true, data: parseGeminiJson(result.text) || { questions: [] } });
      }
      if (tool === 'aeoReadiness') {
        let target = (url || '').trim();
        if (!target) return res.status(400).json({ error: 'Enter a page URL to check.' });
        if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

        let fetched;
        try {
          fetched = await fetchPage(target);
          if (!fetched.response.ok) {
            return res.json({
              success: true,
              data: { fetchError: `Couldn't load that page (HTTP ${fetched.response.status}). Double-check the URL is public and correct.` },
            });
          }
          target = fetched.url;
        } catch (error) {
          return res.status(400).json({ success: false, error: error.message, data: { fetchError: error.message } });
        }

        const page = extractPageContent(fetched.html);
        const result = await geminiGenerate({
          model,
          contents: buildAeoAuditPrompt({ target, ...page }),
        });
        const data = parseGeminiJson(result.text) || {};
        data.url = target;
        data.pageTitle = page.pageTitle;
        return res.json({ success: true, data });
      }
      return res.status(400).json({ error: 'Unknown tool.' });
    } catch (error) {
      logger.error('[On-Site] failed:', error.message);
      return res.status(502).json({ success: false, error: error.message });
    }
  });

  app.get('/api/onsite-schema', (req, res) => {
    const schemas = buildOnsiteSchemas({
      siteUrl: getSiteUrl(),
      business,
      authorName: getAuthorName(),
      authorUrl: getAuthorUrl(),
    });
    res.json(Object.fromEntries(Object.entries(schemas).map(([key, value]) => [key, JSON.stringify(value, null, 2)])));
  });
}

module.exports = {
  ONSITE_TOOLS,
  assertPublicHttpUrl,
  buildAeoAuditPrompt,
  buildOnsiteSchemas,
  extractPageContent,
  fetchPublicHtml,
  isBlockedAddress,
  registerOnsiteRoutes,
};
