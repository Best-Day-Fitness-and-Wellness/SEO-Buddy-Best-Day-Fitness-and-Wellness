const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini Client if Key is present
let ai = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('[Gemini SDK] Autopilot ready. Initialized successfully.');
  } catch (error) {
    console.error('[Gemini SDK] Initialization failed:', error.message);
  }
} else {
  console.log('[Gemini SDK] No GEMINI_API_KEY found in .env. Running in Mock generation mode.');
}

// ----------------------------------------------------
// Persistent JSON Database Configuration
// ----------------------------------------------------
const HISTORY_FILE = path.join(__dirname, 'history.json');
const LOGS_FILE = path.join(__dirname, 'autopilot-logs.json');

let historyDb = [];
let autopilotLogs = [];

// Initialize history database
if (fs.existsSync(HISTORY_FILE)) {
  try {
    historyDb = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    historyDb = [];
  }
} else {
  historyDb = [
    {
      title: 'The Ultimate Guide to Senior Mobility Training',
      keyword: 'mobility training st pete',
      platform: 'GoHighLevel (Draft)',
      date: '2026-07-16',
      indexed: 'Indexing Requested',
      url: 'https://bestdayfitness.com/blog/posts/mobility-training-st-pete'
    }
  ];
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyDb, null, 2));
}

// Initialize autopilot logs database
if (fs.existsSync(LOGS_FILE)) {
  try {
    autopilotLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch (e) {
    autopilotLogs = [];
  }
} else {
  autopilotLogs = [
    {
      timestamp: new Date().toISOString(),
      message: 'Autopilot Agent initialized. Standing by.'
    }
  ];
  fs.writeFileSync(LOGS_FILE, JSON.stringify(autopilotLogs, null, 2));
}

// Initialize AIO audits database
const AIO_AUDITS_FILE = path.join(__dirname, 'aio-audits.json');
let aioAuditsDb = [];

if (fs.existsSync(AIO_AUDITS_FILE)) {
  try {
    aioAuditsDb = JSON.parse(fs.readFileSync(AIO_AUDITS_FILE, 'utf8'));
  } catch (e) {
    aioAuditsDb = [];
  }
} else {
  aioAuditsDb = [
    {
      timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      query: 'senior fitness st petersburg fl',
      recommended: true,
      responseSnippet: 'Best Day Fitness is highly recommended for senior fitness in St. Petersburg, FL due to their specialized mobility programs.',
      reasons: ['Specialized programs for older adults', 'Experienced trainers', 'Focus on mobility and balance'],
      citedUrls: ['https://bestdayfitness.com/blog/posts/mobility-training-st-pete'],
      competitors: ['St Pete Fitness Co-op', 'YMCA St. Petersburg']
    }
  ];
  fs.writeFileSync(AIO_AUDITS_FILE, JSON.stringify(aioAuditsDb, null, 2));
}

// Helper to log Autopilot activity
function logAutopilotActivity(message) {
  const timestamp = new Date().toISOString();
  autopilotLogs.unshift({ timestamp, message });
  if (autopilotLogs.length > 100) autopilotLogs.pop(); // Cap at 100 logs
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(autopilotLogs, null, 2));
  } catch (err) {
    console.error('[Logs File] Failed to write logs:', err.message);
  }
  console.log(`[Autopilot Agent] ${message}`);
}

// Helper to save history
function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyDb, null, 2));
  } catch (err) {
    console.error('[History File] Failed to save history:', err.message);
  }
}

// ----------------------------------------------------
// Mock Data for GSC (Best Day Fitness Search Console leaks)
// ----------------------------------------------------
const MOCK_GSC_DATA = [
  { query: 'senior fitness st petersburg fl', impressions: 1450, clicks: 0, ctr: 0, position: 11.2, leak: true },
  { query: 'mobility training st pete', impressions: 980, clicks: 0, ctr: 0, position: 14.5, leak: true },
  { query: 'longevity fitness coach st petersburg', impressions: 850, clicks: 0, ctr: 0, position: 12.1, leak: true },
  { query: 'posture correction exercises senior', impressions: 720, clicks: 0, ctr: 0, position: 15.3, leak: true },
  { query: 'barefoot training older adults balance', impressions: 540, clicks: 0, ctr: 0, position: 18.0, leak: true },
  { query: 'best day fitness', impressions: 620, clicks: 480, ctr: 77.4, position: 1.1, leak: false },
  { query: 'senior workout facility near me', impressions: 480, clicks: 0, ctr: 0, position: 19.4, leak: true },
  { query: 'injury recovery gym st petersburg fl', impressions: 420, clicks: 0, ctr: 0, position: 13.8, leak: true },
  { query: 'best day fitness st petersburg', impressions: 350, clicks: 270, ctr: 77.1, position: 1.2, leak: false },
  { query: 'st petersburg senior personal trainer', impressions: 310, clicks: 0, ctr: 0, position: 11.9, leak: true },
  { query: 'co-op gym for wellness professionals st pete', impressions: 290, clicks: 0, ctr: 0, position: 16.5, leak: true }
];

// ----------------------------------------------------
// Google API Helpers
// ----------------------------------------------------
function getGoogleAuth() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return null;

  try {
    // Check if it's a raw JSON string (used for cloud deployments to avoid committing keyfiles)
    if (credentialsPath.trim().startsWith('{')) {
      const keys = JSON.parse(credentialsPath);
      return new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        [
          'https://www.googleapis.com/auth/webmasters.readonly',
          'https://www.googleapis.com/auth/indexing'
        ],
        null
      );
    }

    const absolutePath = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.join(__dirname, credentialsPath);

    if (fs.existsSync(absolutePath)) {
      return new google.auth.GoogleAuth({
        keyFile: absolutePath,
        scopes: [
          'https://www.googleapis.com/auth/webmasters.readonly',
          'https://www.googleapis.com/auth/indexing'
        ]
      });
    }
  } catch (error) {
    console.error('[Google Auth] Failed to load credentials:', error.message);
  }
  return null;
}

// ----------------------------------------------------
// Reusable Core Service Helpers
// ----------------------------------------------------

// 1. Generation Helper
async function generateArticleHelper(keyword, caseStudy, ctaText, ctaUrl) {
  const prompt = `Write a high-quality, professional, and SEO-optimized blog article targeting the keyword: "${keyword}".
The article is for a business called "Best Day Fitness", a specialized longevity, mobility, and functional movement training gym in St. Petersburg, Florida. Their focus is adults 50+, seniors, and people recovering from injuries, with a core philosophy of: Energy = Mobility + Posture + Strength.

Follow these strict structural and formatting guidelines to ensure maximum Google and AI Overview search visibility:
1. Return the output in structured HTML (inside a container <div class="seo-article-content">).
2. The article must start with an engaging, optimized <h1> title.
3. Include an introduction that outlines the problem and introduces Best Day Fitness.
4. Organize content logically with optimized <h2> and <h3> subheadings containing the keyword or related synonyms.
5. Provide step-by-step instructions (ordered or unordered lists) for exercises or routines related to "${keyword}".
6. Include a comparison/summary table (e.g. Traditional Gym vs Longevity Movement Center, or Mobility vs Flexibility).
7. Incorporate this specific case study information naturally to show information gain and authority:
   "${caseStudy || "At Best Day Fitness, our trainer-led programs have helped seniors regain functional mobility, reduce pain, and get their active lifestyles back."}"
8. Integrate a Call to Action (CTA) banner/section highlighting this link:
   <a href="${ctaUrl || "#"}" class="article-cta-btn">${ctaText || "Schedule a Consultation"}</a>
9. Add 2-3 internal link placeholders where we can link to other posts (formatted as [Link: Page Name] e.g. [Link: Personal Training for Seniors] or [Link: Float Therapy St Pete]).
10. Add a detailed FAQ section at the bottom containing 3-4 frequently asked questions with clear, direct answers (ideal for ranking in Google's People Also Ask).
11. The content must feel natural, authoritative, and written by an expert trainer/wellness coach. Avoid generic AI fluff.

Return the HTML directly. Do not include markdown block markers like \`\`\`html.`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });

      const rawText = response.text || '';
      let htmlContent = rawText;
      if (htmlContent.startsWith('```html')) {
        htmlContent = htmlContent.substring(7);
      }
      if (htmlContent.endsWith('```')) {
        htmlContent = htmlContent.substring(0, htmlContent.length - 3);
      }
      htmlContent = htmlContent.trim();

      let title = `Ultimate Guide to ${keyword}`;
      const h1Match = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match && h1Match[1]) {
        title = h1Match[1].replace(/<[^>]*>/g, '').trim();
      }

      const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      return {
        success: true,
        source: 'live_gemini',
        title,
        slug,
        content: htmlContent
      };
    } catch (err) {
      console.error('[Service Helper] Gemini generation failed:', err.message);
    }
  }

  // Mock Fallback
  const title = `The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} | Best Day Fitness`;
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const mockHtml = `<div class="seo-article-content">
  <h1>The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}</h1>
  <p>At <strong>Best Day Fitness</strong> in St. Petersburg, Florida, we believe in functional movement that extends healthspan. This guide explores targeting <strong>${keyword}</strong> to improve mobility and posture.</p>
  <h2>Why ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Matters</h2>
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
    <p>${caseStudy || "We helped a local client recover balance and core stability, eliminating their fear of falling."}</p>
  </div>
  <div class="cta-section">
    <p>Get started on your custom program today.</p>
    <a href="${ctaUrl || '#'}" class="article-cta-btn">${ctaText || 'Claim Free Consultation'}</a>
  </div>
  <h2>Frequently Asked Questions</h2>
  <div class="faq-item">
    <strong>Q: How long does it take to see results?</strong>
    <p>A: Most clients experience improved mobility and less stiffness within 4-6 weeks of consistent sessions.</p>
  </div>
</div>`;

  return {
    success: true,
    source: 'mock_generator',
    title,
    slug,
    content: mockHtml
  };
}

// 2. GoHighLevel Publishing Helper
async function publishGhlHelper(title, content, status, config = {}) {
  const locationId = config.locationId || process.env.GHL_LOCATION_ID;
  const accessToken = config.accessToken || process.env.GHL_ACCESS_TOKEN;
  const blogId = config.blogId || process.env.GHL_BLOG_ID;
  const author = config.authorId || process.env.GHL_AUTHOR_ID || 'default-author';
  const siteUrl = config.siteUrl || process.env.GSC_SITE_URL || 'https://bestdayfitness.com';
  const blogPrefix = config.blogPrefix || process.env.GHL_BLOG_PATH_PREFIX || '/blog/posts';
  const authorName = config.authorName || process.env.GHL_AUTHOR_NAME || '';
  const authorUrl = config.authorUrl || process.env.GHL_AUTHOR_URL || '';

  const baseDomain = siteUrl.replace(/\/$/, '');
  const cleanPrefix = blogPrefix.startsWith('/') ? blogPrefix : `/${blogPrefix}`;
  const formattedPrefix = cleanPrefix.endsWith('/') ? cleanPrefix.slice(0, -1) : cleanPrefix;

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // 1. Resolve Internal Links
  let resolvedContent = content;
  const linkRegex = /\[Link:\s*([^\]]+)\]/gi;
  resolvedContent = resolvedContent.replace(linkRegex, (match, p1) => {
    const term = p1.trim().toLowerCase();
    // Search historyDb
    const matchedPost = historyDb.find(h => 
      h.keyword.toLowerCase().includes(term) || 
      h.title.toLowerCase().includes(term) || 
      term.includes(h.keyword.toLowerCase())
    );
    if (matchedPost) {
      return `<a href="${matchedPost.url}" class="internal-link" style="color: #1a73e8; text-decoration: underline;">${p1.trim()}</a>`;
    }
    return `<a href="${baseDomain}${formattedPrefix}" class="internal-link" style="color: #1a73e8; text-decoration: underline;">${p1.trim()}</a>`;
  });

  // 2. Extract and Build FAQ Page Schema
  const faqItems = [];
  const faqBlockRegex = /(?:<strong>|<b>)Q:\s*([\s\S]*?)(?:<\/strong>|<\/b>)[\s\S]*?<p>(?:A:\s*)?([\s\S]*?)<\/p>/gi;
  let faqMatch;
  while ((faqMatch = faqBlockRegex.exec(resolvedContent)) !== null) {
    if (faqMatch[1] && faqMatch[2]) {
      faqItems.push({
        question: faqMatch[1].replace(/<[^>]*>/g, '').trim(),
        answer: faqMatch[2].replace(/<[^>]*>/g, '').trim()
      });
    }
  }

  let schemaScripts = '';
  if (faqItems.length > 0) {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqItems.map(item => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer
        }
      }))
    };
    schemaScripts += `\n<script type="application/ld+json">\n${JSON.stringify(faqSchema, null, 2)}\n</script>`;
  }

  // 3. Build LocalBusiness Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    "name": "Best Day Fitness",
    "image": `${baseDomain}/assets/logo.png`,
    "@id": `${baseDomain}/#organization`,
    "url": baseDomain,
    "telephone": "727-555-0199",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "St. Petersburg, FL",
      "addressLocality": "St. Petersburg",
      "addressRegion": "FL",
      "postalCode": "33701",
      "addressCountry": "US"
    }
  };
  schemaScripts += `\n<script type="application/ld+json">\n${JSON.stringify(localBusinessSchema, null, 2)}\n</script>`;

  // 4. Build Author Schema and visual box
  if (authorName) {
    const authorSchema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": title,
      "url": `${baseDomain}${formattedPrefix}/${slug}`,
      "datePublished": new Date().toISOString(),
      "author": {
        "@type": "Person",
        "name": authorName,
        "url": authorUrl || undefined
      },
      "publisher": {
        "@type": "Organization",
        "name": "Best Day Fitness",
        "logo": {
          "@type": "ImageObject",
          "url": `${baseDomain}/assets/logo.png`
        }
      }
    };
    schemaScripts += `\n<script type="application/ld+json">\n${JSON.stringify(authorSchema, null, 2)}\n</script>`;

    // Add E-E-A-T trust bio block
    let authorHtml = `\n<div class="article-author-card" style="margin-top: 40px; padding: 20px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.01); border-radius: 8px; display: flex; align-items: center; gap: 15px;">`;
    authorHtml += `<div class="author-info">`;
    authorHtml += `<span style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Published By Expert Coach</span>`;
    if (authorUrl) {
      authorHtml += `<a href="${authorUrl}" target="_blank" style="font-size: 16px; font-weight: bold; color: #1a73e8; text-decoration: none;">${authorName}</a>`;
    } else {
      authorHtml += `<strong style="font-size: 16px; font-weight: bold; color: #fff;">${authorName}</strong>`;
    }
    authorHtml += `<p style="font-size: 13px; color: #aaa; margin: 6px 0 0 0; line-height: 1.4;">Certified longevity, mobility, and functional movement specialist at Best Day Fitness.</p>`;
    authorHtml += `</div></div>`;
    resolvedContent += authorHtml;
  }

  // Append schemas
  resolvedContent += schemaScripts;

  if (!accessToken || !locationId || !blogId) {
    return {
      success: true,
      source: 'mock_ghl',
      postId: `mock-post-${Date.now()}`,
      url: `${baseDomain}${formattedPrefix}/${slug}`,
      content: resolvedContent,
      message: 'Article saved in mock mode. Setup GHL keys to go live!'
    };
  }

  const description = content.replace(/<[^>]*>/g, '').substring(0, 150).trim() + '...';

  const payload = {
    locationId,
    blogId,
    title,
    description,
    rawHTML: resolvedContent,
    status: (status || 'draft').toUpperCase(),
    categories: [],
    imageUrl: "",
    imageAltText: "",
    urlSlug: slug,
    publishedAt: new Date().toISOString()
  };

  if (author && author !== 'default-author') {
    payload.author = author;
  }

  const response = await fetch('https://services.leadconnectorhq.com/blogs/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `GHL HTTP error! status: ${response.status}`);
  }

  return {
    success: true,
    source: 'live_ghl',
    postId: data.id || data.postId,
    url: data.url || `${baseDomain}${formattedPrefix}/${slug}`,
    content: resolvedContent,
    message: 'Article successfully published to GoHighLevel!'
  };
}

// 3. Indexing Helper
async function indexUrlHelper(url) {
  const auth = getGoogleAuth();

  if (auth) {
    const indexing = google.indexing({ version: 'v3', auth: auth });
    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: 'URL_UPDATED'
      }
    });

    return {
      success: true,
      source: 'live_indexing',
      message: 'URL submitted to Google Indexing API successfully!',
      data: response.data
    };
  }

  return {
    success: true,
    source: 'mock_indexing',
    message: 'Submission simulated in Mock Mode.'
  };
}

// ----------------------------------------------------
// Autopilot Agent Logic
// ----------------------------------------------------
let autopilotInterval = null;
let autopilotEnabled = false;
let autopilotIntervalHours = 24;
let nextRunTime = null;

// Case study text mapping for Autopilot
const AUTOPILOT_CASE_STUDIES = {
  'senior fitness st petersburg fl': "Our client Margaret (71) suffered from severe knee stiffness that prevented her from walking. Within 12 weeks of our trainer-led posture and barefoot balance mat exercises, she eliminated knee pain and walks 3 miles daily.",
  'mobility training st pete': "We worked with Arthur (64) to resolve shoulder tightness. By combining manual massage therapy with customized range-of-motion routines, he returned to playing tennis within 6 weeks.",
  'longevity fitness coach st petersburg': "David (82) joined Best Day Fitness to maintain his daily functional freedom. Focused exercises built foot stability and core strength, letting him comfortably carry his own groceries.",
  'posture correction exercises senior': "Elena (69) improved her posture profile by 30% and eliminated lower back pain within 2 months through tailored core posture training and chest mobility patterns."
};

async function runAutopilotCycle() {
  logAutopilotActivity('Scanning GSC Content Gaps for leaks...');
  
  // Get keywords
  let keywords = MOCK_GSC_DATA;
  const auth = getGoogleAuth();
  const siteUrl = process.env.GSC_SITE_URL;

  if (auth && siteUrl) {
    try {
      const webmasters = google.webmasters({ version: 'v3', auth: auth });
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await webmasters.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: thirtyDaysAgo,
          endDate: today,
          dimensions: ['query'],
          rowLimit: 100
        }
      });
      if (response.data.rows) {
        keywords = response.data.rows.map(r => ({
          query: r.keys ? r.keys[0] : '',
          impressions: r.impressions || 0,
          clicks: r.clicks || 0,
          leak: (r.clicks === 0 && r.impressions > 10)
        }));
      }
    } catch (err) {
      logAutopilotActivity(`GSC API Fetch failed, falling back to mock leaks. Error: ${err.message}`);
    }
  }

  // Find a leak keyword that we haven't targeted in our history yet
  const leakKeywords = keywords.filter(k => k.leak);
  const targetLeak = leakKeywords.find(k => {
    return !historyDb.some(h => h.keyword.toLowerCase() === k.query.toLowerCase());
  });

  if (!targetLeak) {
    logAutopilotActivity('Check complete. No new untargeted content gaps identified.');
    return null;
  }

  const query = targetLeak.query;
  logAutopilotActivity(`Targeting leak query: "${query}" (Impressions: ${targetLeak.impressions})`);

  try {
    // 1. Generate Content
    logAutopilotActivity('Generating structural SEO article via Gemini API...');
    const caseStudy = AUTOPILOT_CASE_STUDIES[query.toLowerCase()] || 
      "Our specialized mobility exercises help St. Pete seniors build posture, balance, and core strength, restoring independence.";
    
    const siteUrl = process.env.GSC_SITE_URL || 'https://bestdayfitness.com';
    const baseDomain = siteUrl.replace(/\/$/, '');
    const ctaUrl = `${baseDomain}/consultation`;

    const article = await generateArticleHelper(
      query, 
      caseStudy, 
      'Claim Longevity Assessment', 
      ctaUrl
    );

    // 2. Publish Content to GHL
    logAutopilotActivity('Publishing article to GoHighLevel...');
    const publish = await publishGhlHelper(article.title, article.content, 'published');

    // 3. Request Google Indexing
    logAutopilotActivity(`Requesting instant Google Indexing for: ${publish.url}`);
    const index = await indexUrlHelper(publish.url);

    // 4. Update History
    const historyEntry = {
      title: article.title,
      keyword: query,
      platform: publish.source === 'mock_ghl' ? 'GHL (Mock Autopilot)' : 'GoHighLevel (Published)',
      date: new Date().toISOString().split('T')[0],
      indexed: 'Indexing Requested',
      url: publish.url
    };

    historyDb.unshift(historyEntry);
    saveHistory();

    logAutopilotActivity(`✅ Autopilot run complete! Deployed and Indexed: "${article.title}"`);
    return historyEntry;

  } catch (err) {
    logAutopilotActivity(`❌ Autopilot cycle failed: ${err.message}`);
    throw err;
  }
}

function calculateNextRun() {
  if (autopilotEnabled) {
    nextRunTime = new Date(Date.now() + autopilotIntervalHours * 60 * 60 * 1000).toISOString();
  } else {
    nextRunTime = null;
  }
}

function startAutopilotScheduler() {
  if (autopilotInterval) clearInterval(autopilotInterval);
  
  if (autopilotEnabled) {
    logAutopilotActivity(`Background Autopilot enabled. Schedule: Run every ${autopilotIntervalHours} hours.`);
    calculateNextRun();
    
    autopilotInterval = setInterval(async () => {
      try {
        await runAutopilotCycle();
      } catch (err) {
        console.error('[Scheduler] Autopilot runtime error:', err.message);
      }
      calculateNextRun();
    }, autopilotIntervalHours * 60 * 60 * 1000);
  } else {
    logAutopilotActivity('Background Autopilot scheduler stopped.');
    nextRunTime = null;
  }
}

// ----------------------------------------------------
// Routes
// ----------------------------------------------------

// 0. Save Configuration Settings
app.post('/api/save-settings', (req, res) => {
  const { geminiKey, ghlToken, ghlLocation, ghlBlog, siteUrl, blogPrefix, authorName, authorUrl, gscJson } = req.body;

  try {
    let envContent = '';
    
    // Write service account file if gscJson is provided
    if (gscJson && gscJson.trim() !== '') {
      try {
        // Validate JSON
        JSON.parse(gscJson);
        const credentialsPath = path.join(__dirname, 'google-creations.json');
        fs.writeFileSync(credentialsPath, gscJson);
        envContent += `GOOGLE_APPLICATION_CREDENTIALS=google-creations.json\n`;
      } catch (jsonErr) {
        console.error('[Settings] Invalid GSC JSON key:', jsonErr.message);
      }
    } else {
      // If GOOGLE_APPLICATION_CREDENTIALS was set in the environment or file exists, keep it
      if (fs.existsSync(path.join(__dirname, 'google-creations.json'))) {
        envContent += `GOOGLE_APPLICATION_CREDENTIALS=google-creations.json\n`;
      }
    }

    if (geminiKey) envContent += `GEMINI_API_KEY=${geminiKey}\n`;
    if (ghlToken) envContent += `GHL_ACCESS_TOKEN=${ghlToken}\n`;
    if (ghlLocation) envContent += `GHL_LOCATION_ID=${ghlLocation}\n`;
    if (ghlBlog) envContent += `GHL_BLOG_ID=${ghlBlog}\n`;
    if (siteUrl) envContent += `GSC_SITE_URL=${siteUrl}\n`;
    if (blogPrefix) envContent += `GHL_BLOG_PATH_PREFIX=${blogPrefix}\n`;
    if (authorName) envContent += `GHL_AUTHOR_NAME=${authorName}\n`;
    if (authorUrl) envContent += `GHL_AUTHOR_URL=${authorUrl}\n`;

    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    
    // Reload dotenv
    dotenv.config({ override: true });
    
    // Re-initialize Gemini client if key is loaded
    if (process.env.GEMINI_API_KEY) {
      try {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        console.log('[Gemini SDK] Re-initialized successfully.');
      } catch (err) {
        console.error('[Gemini SDK] Re-initialization failed:', err.message);
      }
    }

    return res.json({
      success: true,
      message: 'Configuration saved to server .env file and active environment.'
    });
  } catch (err) {
    console.error('[Settings] Failed to save server settings:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Fetch Google Search Console Data
app.get('/api/gsc-data', async (req, res) => {
  const auth = getGoogleAuth();
  const siteUrl = process.env.GSC_SITE_URL;

  if (auth && siteUrl) {
    try {
      const webmasters = google.webmasters({ version: 'v3', auth: auth });
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await webmasters.searchanalytics.query({
        siteUrl: siteUrl,
        requestBody: {
          startDate: thirtyDaysAgo,
          endDate: today,
          dimensions: ['query'],
          rowLimit: 100
        }
      });

      if (response.data.rows && response.data.rows.length > 0) {
        const rows = response.data.rows.map(row => {
          const impressions = row.impressions || 0;
          const clicks = row.clicks || 0;
          const ctr = row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0;
          const position = row.keys ? parseFloat((row.position).toFixed(1)) : 0;
          const query = row.keys ? row.keys[0] : '';
          const leak = clicks === 0 && impressions > 10;

          return { query, impressions, clicks, ctr, position, leak };
        });

        rows.sort((a, b) => {
          if (a.leak && !b.leak) return -1;
          if (!a.leak && b.leak) return 1;
          return b.impressions - a.impressions;
        });

        return res.json({ source: 'live_gsc', data: rows });
      }
    } catch (error) {
      console.error('[GSC API] Failed, falling back to mock. Error:', error.message);
    }
  }

  return res.json({ source: 'mock_data', data: MOCK_GSC_DATA });
});

// 2. Generate Article Endpoint
app.post('/api/generate-article', async (req, res) => {
  const { keyword, caseStudy, ctaText, ctaUrl } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const data = await generateArticleHelper(keyword, caseStudy, ctaText, ctaUrl);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Publish to GoHighLevel
app.post('/api/publish-ghl', async (req, res) => {
  const { title, content, status, locationId, accessToken, blogId } = req.body;

  try {
    const data = await publishGhlHelper(title, content, status, { locationId, accessToken, blogId });
    
    // Save to history list
    const historyEntry = {
      title,
      keyword: req.body.keyword || 'Manual Entry',
      platform: data.source === 'mock_ghl' ? 'GHL (Mock Manual)' : `GoHighLevel (${status})`,
      date: new Date().toISOString().split('T')[0],
      indexed: 'Indexing Available',
      url: data.url
    };
    
    // Avoid duplicates
    if (!historyDb.some(h => h.url === historyEntry.url)) {
      historyDb.unshift(historyEntry);
      saveHistory();
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Request Google Indexing
app.post('/api/index-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const data = await indexUrlHelper(url);
    
    // Update matching entry in history
    historyDb.forEach(h => {
      if (h.url === url) h.indexed = 'Indexing Requested';
    });
    saveHistory();

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get History List
app.get('/api/history', (req, res) => {
  return res.json(historyDb);
});

// 6. Get Autopilot Status
app.get('/api/autopilot-status', (req, res) => {
  return res.json({
    enabled: autopilotEnabled,
    intervalHours: autopilotIntervalHours,
    nextRunTime: nextRunTime,
    logs: autopilotLogs
  });
});

// 7. Toggle Autopilot Agent
app.post('/api/autopilot-toggle', (req, res) => {
  const { enabled, intervalHours } = req.body;
  
  autopilotEnabled = !!enabled;
  if (intervalHours) autopilotIntervalHours = parseFloat(intervalHours);
  
  startAutopilotScheduler();
  
  return res.json({
    success: true,
    enabled: autopilotEnabled,
    intervalHours: autopilotIntervalHours,
    nextRunTime: nextRunTime,
    message: `Autopilot schedule updated successfully.`
  });
});

// 8. Trigger Autopilot run immediately (Manual Override)
app.post('/api/autopilot-run-now', async (req, res) => {
  try {
    const entry = await runAutopilotCycle();
    return res.json({
      success: true,
      ran: !!entry,
      entry,
      message: entry ? 'Autopilot completed a run successfully!' : 'Autopilot checked GSC, but found no new content leaks.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Run AI Search (AIO) Audit
app.post('/api/aio-audit', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required for auditing' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  let auditResult = null;

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const prompt = `You are simulating an AI Search Engine (like SearchGPT, Perplexity, or Google AI Overview) answering a user's question about local fitness or wellness services.
User Query: "${query}"

Generate a realistic AI recommendation response that cites the top local service providers in St. Petersburg, FL based on search authority.
Format your final response strictly as a JSON object with these keys (do not wrap in markdown block markers, return raw JSON string only):
{
  "recommended": boolean (true if "Best Day Fitness" is recommended or mentioned),
  "responseSnippet": "2-3 sentences summarizing the AI's response",
  "reasons": ["reason 1", "reason 2"],
  "citedUrls": ["https://bestdayfitness.com", "other competitor urls"],
  "competitors": ["competitor name 1", "competitor name 2"]
}

Ensure the response reflects a highly realistic search recommendation. If the business has strong content matching the query, cite it!`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt
      });

      const rawText = (response.text || '').trim();
      let cleanJson = rawText;
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.substring(7);
      }
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.substring(3);
      }
      if (cleanJson.endsWith('```')) {
        cleanJson = cleanJson.substring(0, cleanJson.length - 3);
      }
      
      auditResult = JSON.parse(cleanJson.trim());
    } catch (err) {
      console.error('[AIO Audit API] Failed, falling back to simulated analysis:', err.message);
    }
  }

  // Fallback to local simulation if Gemini fails or is not configured
  if (!auditResult) {
    const queryLower = query.toLowerCase();
    const isBrand = queryLower.includes('best day fitness');
    const isSenior = queryLower.includes('senior') || queryLower.includes('mobility') || queryLower.includes('longevity');
    
    auditResult = {
      recommended: isBrand || (isSenior && Math.random() > 0.3),
      responseSnippet: isBrand 
        ? "Best Day Fitness in St. Petersburg, FL is highly rated for personal training, featuring custom mobility, posture, and strength coaching."
        : `AI engines recommend St Pete Fitness Co-op, YMCA, and ${isSenior ? 'Best Day Fitness' : 'St. Petersburg Personal Training'} for local wellness and coaching.`,
      reasons: isBrand 
        ? ["Highly personalized posture/mobility focus", "St. Petersburg local expertise", "Strong positive feedback on senior wellness"]
        : ["Convenient St. Pete locations", "Good general reviews", isSenior ? "Specialized senior programs at Best Day Fitness" : "Diverse class schedules"],
      citedUrls: isBrand || isSenior 
        ? ["https://bestdayfitness.com/blog/posts/mobility-training-st-pete", "https://stpete-coop.com"] 
        : ["https://ymcasuncoast.org", "https://stpete-coop.com"],
      competitors: isBrand 
        ? ["St Pete Fitness Co-op"]
        : ["YMCA St. Petersburg", "St Pete Fitness Co-op"]
    };
  }

  const fullAudit = {
    timestamp: new Date().toISOString(),
    query,
    ...auditResult
  };

  aioAuditsDb.unshift(fullAudit);
  if (aioAuditsDb.length > 50) {
    aioAuditsDb = aioAuditsDb.slice(0, 50);
  }

  try {
    fs.writeFileSync(AIO_AUDITS_FILE, JSON.stringify(aioAuditsDb, null, 2));
  } catch (err) {
    console.error('[AIO Audits File] Save failed:', err.message);
  }

  return res.json({
    success: true,
    latest: fullAudit,
    history: aioAuditsDb
  });
});

// 10. Get AIO Audits History
app.get('/api/aio-history', (req, res) => {
  return res.json(aioAuditsDb);
});

// 11. Generate JSON-LD Schema Assets
app.get('/api/aio-schema', (req, res) => {
  const domain = process.env.GSC_SITE_URL && process.env.GSC_SITE_URL.includes('http')
    ? process.env.GSC_SITE_URL.replace(/\/$/, '')
    : 'https://bestdayfitness.com';

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    "name": "Best Day Fitness",
    "image": `${domain}/assets/logo.png`,
    "@id": `${domain}/#organization`,
    "url": domain,
    "telephone": "727-555-0199",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "St. Petersburg, FL",
      "addressLocality": "St. Petersburg",
      "addressRegion": "FL",
      "postalCode": "33701",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 27.7731,
      "longitude": -82.6401
    },
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ],
      "opens": "06:00",
      "closes": "20:00"
    },
    "sameAs": [
      "https://facebook.com/bestdayfitness",
      "https://instagram.com/bestdayfitness"
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the Total Rank System?",
        "answer": {
          "@type": "Answer",
          "text": "The Total Rank System is an SEO strategy designed to find search query leaks (where pages have high impressions but zero clicks) and rapidly build dedicated, E-E-A-T rich content pages to index and capture organic traffic."
        }
      },
      {
        "@type": "Question",
        "name": "Do you offer specialized personal training for seniors in St. Petersburg?",
        "answer": {
          "@type": "Answer",
          "text": "Yes, Best Day Fitness specializes in mobility, balance, strength, and posture correction programs tailored specifically for older adults and seniors in the St. Petersburg, FL area."
        }
      }
    ]
  };

  return res.json({
    localBusiness: JSON.stringify(localBusinessSchema, null, 2),
    faq: JSON.stringify(faqSchema, null, 2)
  });
});

// Start the Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SEO Buddy - Total Rank System Dashboard is running!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
