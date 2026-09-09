'use strict';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function articleSlug(keyword) {
  return String(keyword || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildArticlePrompt({ keyword, caseStudy, ctaText, ctaUrl, transcript, brand, date }) {
  const freshDate = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const spoken = String(transcript || '').trim();
  const sourceBlock = spoken
    ? `\n\nSOURCE MATERIAL — the business owner answering this topic out loud. This is
first-hand expertise, not research. Build the article FROM it: use their specific
stories, numbers, client examples, objections and turns of phrase. Where the
transcript gives a concrete detail, use that detail rather than a generic claim.
Do not contradict it, and do not invent client results it does not contain.
If the transcript does not cover something a section needs, write that part
generally rather than fabricating specifics.

"""
${spoken.slice(0, 60000)}
"""\n`
    : '';

  return `${brand}\n\nWrite a high-quality, professional article targeting the keyword: "${keyword}", optimized for BOTH traditional Google ranking AND Answer Engine Optimization (AEO) — so ChatGPT, Perplexity, and Google's AI Overviews can extract and cite it.${sourceBlock}
The article is for a business called "Best Day Fitness", a specialized longevity, mobility, and functional movement training gym in St. Petersburg, Florida. Their focus is adults 50+, seniors, and people recovering from injuries, with a core philosophy of: Energy = Mobility + Posture + Strength.

Follow these structural and formatting guidelines. The AEO rules (answer-first, question headers, self-contained sections) are the priority — they are what makes AI engines cite the page:
1. Return the output in structured HTML (inside a container <div class="seo-article-content">). Do NOT use markdown.
2. Start with an engaging <h1> title. When natural, phrase it as the question a reader would ask.
3. Directly under the <h1>, add a freshness line: <p class="article-meta">Updated ${freshDate} · Best Day Fitness</p>.
4. ANSWER-FIRST (critical): the very first paragraph must be <p class="aeo-answer"> that directly and completely answers the article's core question in 40–60 words — a self-contained answer an AI could quote verbatim. State the answer first, THEN expand with context below it.
5. If the topic has a key term, include one clean, standalone one-sentence definition of it early (extractable on its own).
6. Use <h2> and <h3> subheadings PHRASED AS THE REAL QUESTIONS people ask (e.g. "How does balance training help prevent falls?", "How often should seniors do mobility work?"), naturally including the keyword or synonyms. Each section must make sense on its own if read in isolation, and should open with its own 1–2 sentence direct answer before the detail.
7. QUERY FAN-OUT: identify the natural sub-questions someone has about "${keyword}" and make sure the article answers several of those related questions — the most-cited pages answer a cluster of questions, not just one.
8. Provide step-by-step instructions (ordered or unordered lists) for relevant exercises or routines.
9. Include one comparison/summary table (e.g. Traditional Gym vs Longevity Movement Center, or Mobility vs Flexibility) — tables are highly extractable.
10. INFORMATION GAIN + brand tie-in: weave in this specific, first-hand result naturally, and connect the topic back to how Best Day's program helps (so AI associates this topic with Best Day, not just the topic in general):
   "${caseStudy || 'At Best Day Fitness, our trainer-led programs have helped seniors regain functional mobility, reduce pain, and get their active lifestyles back.'}"
11. Integrate a Call to Action (CTA) banner/section highlighting this link:
   <a href="${ctaUrl || '#'}" class="article-cta-btn">${ctaText || 'Schedule a Consultation'}</a>
12. Add 2-3 internal link placeholders (formatted as [Link: Page Name], e.g. [Link: Personal Training for Seniors]).
13. End with an FAQ section: 3-4 real questions people ask, each with a clear, direct answer in the first sentence (ideal for Google's People Also Ask and AI extraction).
14. Write as an expert trainer/wellness coach — authoritative, specific, current. Avoid generic AI fluff and outdated references.${spoken ? `
15. VOICE: keep the speaker's own phrasing and first-person perspective where it reads well. Vary sentence length. Their anecdotes are the most valuable thing in this article — give them room rather than compressing them into a single line.
16. After the closing </div>, append one HTML comment listing every factual claim, number, date or client result in the article that a human must verify before publishing, in the exact form:
<!--CLAIMS: first claim | second claim | third claim-->` : ''}

Return the HTML directly. Do not include markdown block markers like \`\`\`html.`;
}

function createArticleGenerationService(options) {
  const {
    brandPrompt,
    brandViolations,
    assessArticleQuality,
    sanitizeArticleHtml,
    escapeHtml,
    safeHttpUrl,
    geminiGenerate,
    model,
    isGeminiReady,
    allowMockIntegrations,
    integrationUnavailable,
    logger = console,
    now = () => new Date(),
  } = options;

  for (const [name, dependency] of Object.entries({
    brandPrompt,
    brandViolations,
    assessArticleQuality,
    sanitizeArticleHtml,
    escapeHtml,
    safeHttpUrl,
    geminiGenerate,
    isGeminiReady,
    integrationUnavailable,
  })) {
    if (typeof dependency !== 'function') throw new TypeError(`${name} is required.`);
  }

  async function generate(keyword, caseStudy, ctaText, ctaUrl, transcript) {
    const spoken = String(transcript || '').trim();
    const prompt = buildArticlePrompt({
      keyword,
      caseStudy,
      ctaText,
      ctaUrl,
      transcript: spoken,
      brand: brandPrompt(true),
      date: now(),
    });

    let generationError = null;
    if (isGeminiReady()) {
      try {
        const response = await geminiGenerate({ model, contents: prompt }, { usageKind: 'article' });
        let htmlContent = response.text || '';
        if (htmlContent.startsWith('```html')) htmlContent = htmlContent.substring(7);
        if (htmlContent.endsWith('```')) htmlContent = htmlContent.substring(0, htmlContent.length - 3);
        htmlContent = htmlContent.trim();

        let title = `Ultimate Guide to ${keyword}`;
        const h1Match = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1Match?.[1]) title = h1Match[1].replace(/<[^>]*>/g, '').trim();

        let claimsToCheck = [];
        const claimsMatch = htmlContent.match(/<!--\s*CLAIMS:([\s\S]*?)-->/i);
        if (claimsMatch) {
          claimsToCheck = claimsMatch[1].split('|').map(claim => claim.trim()).filter(Boolean);
          htmlContent = htmlContent.replace(claimsMatch[0], '').trim();
        }
        htmlContent = sanitizeArticleHtml(htmlContent);
        const violations = brandViolations(`${htmlContent} ${title}`);
        return {
          success: true,
          source: 'live_gemini',
          title,
          slug: articleSlug(keyword),
          content: htmlContent,
          fromTranscript: !!spoken,
          claimsToCheck,
          brandViolations: violations,
          quality: assessArticleQuality(htmlContent, { claimsToCheck, brandViolations: violations }),
        };
      } catch (error) {
        logger.error('[Service Helper] Gemini generation failed:', error.message);
        generationError = error;
      }
    }

    if (!allowMockIntegrations) {
      throw integrationUnavailable(
        'gemini',
        generationError
          ? `Gemini could not generate the article: ${generationError.message}`
          : 'Gemini is not configured. Add a valid GEMINI_API_KEY before generating production content.',
        generationError,
      );
    }

    const safeKeyword = escapeHtml(keyword);
    const safeCaseStudy = escapeHtml(caseStudy || 'We helped a local client recover balance and core stability, eliminating their fear of falling.');
    const safeCtaText = escapeHtml(ctaText || 'Claim Free Consultation');
    const safeCtaUrl = escapeHtml(safeHttpUrl(ctaUrl, '#'));
    const title = `The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} | Best Day Fitness`;
    const mockHtml = `<div class="seo-article-content">
  <h1>The Ultimate Guide to ${safeKeyword.charAt(0).toUpperCase() + safeKeyword.slice(1)}</h1>
  <p>At <strong>Best Day Fitness</strong> in St. Petersburg, Florida, we believe in functional movement that extends healthspan. This guide explores targeting <strong>${safeKeyword}</strong> to improve mobility and posture.</p>
  <h2>Why ${safeKeyword.charAt(0).toUpperCase() + safeKeyword.slice(1)} Matters</h2>
  <p>Our formula: Energy = Mobility + Posture + Strength helps seniors stay active and pain-free.</p>
  <h3>Key Benefits</h3>
  <ul>
    <li>Regained Joint Mobility</li>
    <li>Improved Postural Support</li>
    <li>Foot and Balance Stabilization</li>
  </ul>
  <h2>Case Study</h2>
  <div class="case-study-box">
    <h4>Success Story</h4>
    <p>${safeCaseStudy}</p>
  </div>
  <div class="cta-section">
    <p>Get started on your custom program today.</p>
    <a href="${safeCtaUrl}" class="article-cta-btn">${safeCtaText}</a>
  </div>
  <h2>Frequently Asked Questions</h2>
  <div class="faq-item">
    <strong>Q: How long does it take to see results?</strong>
    <p>A: Most clients experience improved mobility and less stiffness within 4-6 weeks of consistent sessions.</p>
  </div>
</div>`;

    const violations = brandViolations(`${mockHtml} ${title}`);
    return {
      success: true,
      source: 'mock_generator',
      title,
      slug: articleSlug(keyword),
      content: mockHtml,
      fromTranscript: !!spoken,
      claimsToCheck: [],
      brandViolations: violations,
      quality: assessArticleQuality(mockHtml, { brandViolations: violations }),
    };
  }

  return { generate };
}

module.exports = { MONTHS, articleSlug, buildArticlePrompt, createArticleGenerationService };
