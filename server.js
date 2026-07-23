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

// ----------------------------------------------------
// Core Configuration
// ----------------------------------------------------
// Gemini model is now env-configurable. Default to the current stable Flash
// model. NOTE: the previous hardcoded 'gemini-3.5-flash' is not a valid model
// ID, so every live generation silently failed and fell back to mock output.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Durable data directory. Railway (and most container hosts) wipe the app
// folder on every redeploy, so the history/logs/audit JSON files must live on a
// persistent disk. On Railway: attach a Volume and set DATA_DIR to its mount
// path (e.g. /data). Defaults to the app folder for local development.
const DATA_DIR = process.env.DATA_DIR || __dirname;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.error('[Data Dir] Could not create DATA_DIR:', e.message);
}

// Optional admin password. When set, it locks down the sensitive endpoints
// (settings, publishing, indexing, autopilot, and any Gemini-spend routes).
// Leave unset only for trusted local development.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Real Best Day Fitness business info (NAP) for structured data / schema.
// Single source of truth — used by both the publisher and the schema endpoint.
const BUSINESS = {
  name: 'Best Day Fitness',
  telephone: '+1-727-334-1472',
  streetAddress: '6619 1st Ave S',
  addressLocality: 'St. Petersburg',
  addressRegion: 'FL',
  postalCode: '33707',
  addressCountry: 'US',
  latitude: 27.770167,
  longitude: -82.7291718,
  sameAs: [
    'https://www.facebook.com/bestdayfitness',
    'https://www.instagram.com/best_day_fitness/',
    'https://www.youtube.com/c/Bestdayfitness'
  ]
};

// CORS: default to same-origin only (the dashboard is served from this same
// server, so no cross-origin headers are needed). Set ALLOWED_ORIGIN to a
// comma-separated allowlist only if you must call the API from another origin.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN.split(',').map(s => s.trim()) }));
}

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// Auth middleware — protects sensitive/credential/spend endpoints.
// If ADMIN_PASSWORD is not set, endpoints stay open (local dev) but the server
// logs a loud startup warning. Provide the password from the client as either
// an "Authorization: Bearer <password>" header or an "x-admin-token" header.
// ----------------------------------------------------
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // open mode (no password configured)
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || (req.headers['x-admin-token'] || '').trim();
  if (token && token === ADMIN_PASSWORD) return next();
  return res.status(401).json({ success: false, error: 'Unauthorized. Enter the admin password in Settings to perform this action.' });
}

// Shared LocalBusiness schema builder (real NAP, single source of truth).
function buildLocalBusinessSchema(domain) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    "name": BUSINESS.name,
    "image": `${domain}/assets/logo.png`,
    "@id": `${domain}/#organization`,
    "url": domain,
    "telephone": BUSINESS.telephone,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": BUSINESS.streetAddress,
      "addressLocality": BUSINESS.addressLocality,
      "addressRegion": BUSINESS.addressRegion,
      "postalCode": BUSINESS.postalCode,
      "addressCountry": BUSINESS.addressCountry
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": BUSINESS.latitude,
      "longitude": BUSINESS.longitude
    },
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "opens": "04:00",
        "closes": "22:00"
      },
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Sunday"],
        "opens": "09:00",
        "closes": "17:00"
      }
    ],
    "sameAs": BUSINESS.sameAs
  };
}

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
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const LOGS_FILE = path.join(DATA_DIR, 'autopilot-logs.json');

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
const AIO_AUDITS_FILE = path.join(DATA_DIR, 'aio-audits.json');
let aioAuditsDb = [];

if (fs.existsSync(AIO_AUDITS_FILE)) {
  try {
    aioAuditsDb = JSON.parse(fs.readFileSync(AIO_AUDITS_FILE, 'utf8'));
  } catch (e) {
    aioAuditsDb = [];
  }
} else {
  // Start with an empty, honest history — real audits populate this on demand.
  aioAuditsDb = [];
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
        model: GEMINI_MODEL,
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

  let baseDomain = siteUrl.trim();
  if (baseDomain.startsWith('sc-domain:')) {
    baseDomain = 'https://' + baseDomain.substring(10);
  }
  baseDomain = baseDomain.replace(/\/$/, '');
  
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

  // 3. Build LocalBusiness Schema (shared builder — real NAP)
  const localBusinessSchema = buildLocalBusinessSchema(baseDomain);
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

// Translate Google's terse Indexing API errors into an actionable message.
function explainIndexError(message) {
  const m = String(message || '');
  if (/ownership|Permission denied|Failed to verify|does not have .*permission/i.test(m)) {
    return `Google refused the indexing request: the service account is not a verified OWNER of the site in Search Console. `
      + `Fix: Search Console → Settings → Users and permissions → add the service-account email (the "client_email" in your Google service-account JSON) with permission = Owner. `
      + `Note: "Full" access — which is enough for the GSC data tabs — is NOT enough for the Indexing API. `
      + `Also confirm the published URL is on the same verified domain (${process.env.GSC_SITE_URL || 'your property'}). `
      + `[original: ${m}]`;
  }
  return m;
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
let autopilotQueue = []; // [{ topic, addedAt }] — covered before GSC gaps

// Durable autopilot config (cadence + enabled + topic queue) so the schedule
// and queue survive redeploys. The scheduler itself is restored at startup.
const AUTOPILOT_CONFIG_FILE = path.join(DATA_DIR, 'autopilot-config.json');
function saveAutopilotConfig() {
  try { fs.writeFileSync(AUTOPILOT_CONFIG_FILE, JSON.stringify({ enabled: autopilotEnabled, intervalHours: autopilotIntervalHours, queue: autopilotQueue }, null, 2)); }
  catch (e) { console.error('[Autopilot Config] save failed:', e.message); }
}
try {
  if (fs.existsSync(AUTOPILOT_CONFIG_FILE)) {
    const cfg = JSON.parse(fs.readFileSync(AUTOPILOT_CONFIG_FILE, 'utf8'));
    if (typeof cfg.enabled === 'boolean') autopilotEnabled = cfg.enabled;
    if (cfg.intervalHours) autopilotIntervalHours = parseFloat(cfg.intervalHours);
    if (Array.isArray(cfg.queue)) autopilotQueue = cfg.queue;
  }
} catch (e) { console.error('[Autopilot Config] load failed:', e.message); }

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

  // Pick the target: queued topics first, then an untargeted GSC gap.
  let query = null;
  let fromQueue = false;
  while (autopilotQueue.length && !query) {
    const cand = String(autopilotQueue[0].topic || '').trim();
    if (cand && !historyDb.some(h => h.keyword.toLowerCase() === cand.toLowerCase())) { query = cand; fromQueue = true; }
    else { autopilotQueue.shift(); saveAutopilotConfig(); } // drop blank or already-covered
  }

  if (!query) {
    const leakKeywords = keywords.filter(k => k.leak);
    const targetLeak = leakKeywords.find(k => !historyDb.some(h => h.keyword.toLowerCase() === k.query.toLowerCase()));
    if (!targetLeak) {
      logAutopilotActivity('Check complete. No queued topics and no new untargeted content gaps identified.');
      return null;
    }
    query = targetLeak.query;
    logAutopilotActivity(`Targeting leak query: "${query}" (Impressions: ${targetLeak.impressions})`);
  } else {
    logAutopilotActivity(`Targeting queued topic: "${query}" (${autopilotQueue.length} in queue)`);
  }

  try {
    // 1. Generate Content
    logAutopilotActivity('Generating structural SEO article via Gemini API...');
    const caseStudy = AUTOPILOT_CASE_STUDIES[query.toLowerCase()] || 
      "Our specialized mobility exercises help St. Pete seniors build posture, balance, and core strength, restoring independence.";
    
    const siteUrl = process.env.GSC_SITE_URL || 'https://bestdayfitness.com';
    let baseDomain = siteUrl.trim();
    if (baseDomain.startsWith('sc-domain:')) {
      baseDomain = 'https://' + baseDomain.substring(10);
    }
    baseDomain = baseDomain.replace(/\/$/, '');
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

    // 3. Request Google Indexing — NON-FATAL. The article is already published;
    // an indexing permission error must not discard a successful publish or
    // report the whole run as failed.
    logAutopilotActivity(`Requesting instant Google Indexing for: ${publish.url}`);
    let indexStatus = 'Indexing Requested';
    try {
      await indexUrlHelper(publish.url);
    } catch (idxErr) {
      indexStatus = 'Indexing Failed';
      logAutopilotActivity(`⚠️ Article published, but Google Indexing was refused. ${explainIndexError(idxErr.message)}`);
    }

    // 4. Update History
    const historyEntry = {
      title: article.title,
      keyword: query,
      platform: publish.source === 'mock_ghl' ? 'GHL (Mock Autopilot)' : 'GoHighLevel (Published)',
      date: new Date().toISOString().split('T')[0],
      indexed: indexStatus,
      url: publish.url
    };

    historyDb.unshift(historyEntry);
    saveHistory();

    // Remove the covered topic from the queue.
    if (fromQueue) {
      autopilotQueue = autopilotQueue.filter(q => String(q.topic || '').trim().toLowerCase() !== query.toLowerCase());
      saveAutopilotConfig();
    }

    logAutopilotActivity(indexStatus === 'Indexing Failed'
      ? `✅ Autopilot run complete — published "${article.title}" (indexing skipped; see warning above).`
      : `✅ Autopilot run complete! Deployed and Indexed: "${article.title}"`);
    return { ...historyEntry, indexWarning: indexStatus === 'Indexing Failed' };

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
app.post('/api/save-settings', requireAuth, (req, res) => {
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
app.post('/api/generate-article', requireAuth, async (req, res) => {
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
app.post('/api/publish-ghl', requireAuth, async (req, res) => {
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
app.post('/api/index-url', requireAuth, async (req, res) => {
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
    return res.status(500).json({ success: false, error: explainIndexError(err.message) });
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
    queue: autopilotQueue,
    logs: autopilotLogs
  });
});

// 7. Toggle Autopilot Agent
app.post('/api/autopilot-toggle', requireAuth, (req, res) => {
  const { enabled, intervalHours } = req.body;

  autopilotEnabled = !!enabled;
  if (intervalHours) autopilotIntervalHours = parseFloat(intervalHours);

  startAutopilotScheduler();
  saveAutopilotConfig();

  return res.json({
    success: true,
    enabled: autopilotEnabled,
    intervalHours: autopilotIntervalHours,
    nextRunTime: nextRunTime,
    message: `Autopilot schedule updated successfully.`
  });
});

// 7b. Content topic queue — autopilot covers these before finding gaps.
app.post('/api/autopilot-queue/add', requireAuth, (req, res) => {
  const topic = String((req.body && req.body.topic) || '').trim();
  if (!topic) return res.status(400).json({ success: false, error: 'Enter a topic or keyword.' });
  if (topic.length > 120) return res.status(400).json({ success: false, error: 'Keep topics under 120 characters.' });
  if (autopilotQueue.length >= 50) return res.status(400).json({ success: false, error: 'Queue is full (50). Remove some first.' });
  autopilotQueue.push({ topic, addedAt: new Date().toISOString() });
  saveAutopilotConfig();
  res.json({ success: true, queue: autopilotQueue });
});
app.post('/api/autopilot-queue/remove', requireAuth, (req, res) => {
  const idx = (req.body && typeof req.body.index === 'number') ? req.body.index : -1;
  if (idx >= 0 && idx < autopilotQueue.length) autopilotQueue.splice(idx, 1);
  saveAutopilotConfig();
  res.json({ success: true, queue: autopilotQueue });
});

// 8. Trigger Autopilot run immediately (Manual Override)
app.post('/api/autopilot-run-now', requireAuth, async (req, res) => {
  try {
    const entry = await runAutopilotCycle();
    return res.json({
      success: true,
      ran: !!entry,
      entry,
      message: entry
        ? (entry.indexWarning
            ? 'Autopilot published the article. Google Indexing was refused (service account needs Owner permission in Search Console) — see the activity log.'
            : 'Autopilot completed a run successfully!')
        : 'Autopilot checked GSC, but found no new content leaks.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: explainIndexError(err.message) });
  }
});

// 9. Run AI Search (AIO) Audit
app.post('/api/aio-audit', requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required for auditing' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  // No key → honest "unavailable" state. We do NOT fabricate audit data.
  if (!geminiKey) {
    return res.json({
      success: true,
      unavailable: true,
      message: 'Real AI-search audits require a Gemini API key. Add yours in Settings to run a live, Google-grounded audit.',
      latest: null,
      history: aioAuditsDb
    });
  }

  // Brand identity used to detect real mentions/citations.
  const brandName = BUSINESS.name;            // "Best Day Fitness"
  const brandDomainRoot = 'bestdayfitness';   // matches bestdayfitness.com in cited domains

  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });

    // --- Pass 1: REAL answer engine call, grounded in live Google Search. ---
    const prompt = `A person searching online asks: "${query}".
Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida. Name the actual businesses and briefly say why each is a good fit. Base your answer only on current web information.`;

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    const answerText = (response.text || '').trim();

    // Real grounding metadata — the actual sources Google's AI used.
    const gm = (response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata) || {};
    const chunks = gm.groundingChunks || [];
    const searchQueries = gm.webSearchQueries || [];
    const searchEntryPoint = (gm.searchEntryPoint && gm.searchEntryPoint.renderedContent) || '';

    // Build the real cited-source list. chunk.web.uri is a Google redirect link;
    // chunk.web.title is the real domain/site name — use title for identity.
    const seen = new Set();
    const citedSources = [];
    for (const c of chunks) {
      const web = c.web || {};
      const title = (web.title || '').trim();
      const uri = (web.uri || '').trim();
      const key = (title || uri).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      citedSources.push({ title, uri });
    }

    // REAL signal: brand actually mentioned in the answer, or present as a cited source.
    const answerLower = answerText.toLowerCase();
    const brandInAnswer = answerLower.includes(brandName.toLowerCase()) || answerLower.includes(brandDomainRoot);
    const brandInSources = citedSources.some(s => {
      const hay = (s.title + ' ' + s.uri).toLowerCase();
      return hay.includes(brandDomainRoot) || hay.includes(brandName.toLowerCase());
    });
    const recommended = brandInAnswer || brandInSources;

    // --- Pass 2 (best-effort): extract competitor NAMES + reasons from the REAL
    // grounded answer. This only summarizes real text; it invents nothing. ---
    let reasons = [];
    let competitors = [];
    if (answerText) {
      try {
        const extractPrompt = `Here is an AI answer engine's response to the query "${query}":
"""
${answerText}
"""
Return ONLY raw JSON (no markdown fences) shaped exactly as:
{"reasons": ["short reasons the answer gave, if any"], "competitors": ["names of businesses OTHER THAN \\"${brandName}\\" that the answer recommends or mentions"]}`;
        const extract = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: extractPrompt
        });
        let raw = (extract.text || '').trim()
          .replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.reasons)) reasons = parsed.reasons.filter(Boolean);
        if (Array.isArray(parsed.competitors)) {
          competitors = parsed.competitors
            .filter(Boolean)
            .filter(c => !c.toLowerCase().includes(brandName.toLowerCase()));
        }
      } catch (e) {
        console.error('[AIO Audit] Competitor extraction failed (non-fatal):', e.message);
      }
    }

    const responseSnippet = answerText.length > 360
      ? answerText.slice(0, 357).trim() + '…'
      : (answerText || 'The AI returned no answer text for this query.');

    const fullAudit = {
      timestamp: new Date().toISOString(),
      query,
      source: 'live_grounded',
      engine: 'Google (Gemini + Google Search)',
      recommended,
      cited: brandInSources,
      responseSnippet,
      reasons,
      citedSources,                                   // [{title, uri}] — real
      citedUrls: citedSources.map(s => s.uri).filter(Boolean),
      competitors,
      searchQueries,                                  // real queries Gemini ran
      searchEntryPoint                                // Google search-suggestions chip (HTML)
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

    return res.json({ success: true, latest: fullAudit, history: aioAuditsDb });

  } catch (err) {
    console.error('[AIO Audit API] Grounded audit failed:', err.message);
    return res.status(502).json({
      success: false,
      error: `The live audit could not be completed: ${err.message}`
    });
  }
});

// 10. Get AIO Audits History
app.get('/api/aio-history', (req, res) => {
  return res.json(aioAuditsDb);
});

// 11. Generate JSON-LD Schema Assets
app.get('/api/aio-schema', (req, res) => {
  let domain = process.env.GSC_SITE_URL || 'https://bestdayfitness.com';
  domain = domain.trim();
  if (domain.startsWith('sc-domain:')) {
    domain = 'https://' + domain.substring(10);
  }
  domain = domain.replace(/\/$/, '');

  const localBusinessSchema = buildLocalBusinessSchema(domain);

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

// 12. Citation Target Finder — the real third-party sources AI cites for your
// searches (where you need to get listed to show up in AI answers).
app.post('/api/citation-targets', requireAuth, async (req, res) => {
  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0) {
    return res.status(400).json({ error: 'At least one search query is required.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({
      success: true,
      unavailable: true,
      message: 'Add your Gemini API key in Settings to find citation targets (this uses live Google Search grounding).',
      targets: []
    });
  }

  const brandName = BUSINESS.name;
  const brandRoot = 'bestdayfitness';
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const cleanQueries = queries.map(q => String(q || '').trim()).filter(Boolean).slice(0, 8);

  try {
    // 1. For each query, run a grounded search and collect the REAL domains
    //    Google's AI cited (groundingChunks[].web.title is the source domain).
    const domainInfo = {}; // domain -> { count, queries: [] }
    let brandCited = false;

    await Promise.all(cleanQueries.map(async (q) => {
      try {
        const prompt = `A person searching online asks: "${q}". Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida, based on current web information.`;
        const resp = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { tools: [{ googleSearch: {} }] }
        });
        const gm = (resp.candidates && resp.candidates[0] && resp.candidates[0].groundingMetadata) || {};
        const chunks = gm.groundingChunks || [];
        const seen = new Set();
        for (const c of chunks) {
          const dom = ((c.web && c.web.title) || '').trim().toLowerCase();
          if (!dom || seen.has(dom)) continue;
          seen.add(dom);
          if (dom.includes(brandRoot) || dom.includes(brandName.toLowerCase())) { brandCited = true; continue; }
          if (!domainInfo[dom]) domainInfo[dom] = { count: 0, queries: [] };
          domainInfo[dom].count++;
          if (!domainInfo[dom].queries.includes(q)) domainInfo[dom].queries.push(q);
        }
      } catch (e) {
        console.error(`[Citation Targets] query failed "${q}":`, e.message);
      }
    }));

    // Rank by how often AI cited each domain; classify the top ones.
    const rankedDomains = Object.keys(domainInfo)
      .sort((a, b) => domainInfo[b].count - domainInfo[a].count)
      .slice(0, 12);

    // 2. For each domain, a grounded check: what kind of site is it, and is
    //    Best Day Fitness already listed/mentioned there?
    const targets = await Promise.all(rankedDomains.map(async (dom) => {
      const base = { domain: dom, citedFor: domainInfo[dom].count, queries: domainInfo[dom].queries };
      try {
        const p = `On the website "${dom}", is the St. Petersburg, Florida fitness studio "Best Day Fitness" listed or mentioned? Also classify what kind of site "${dom}" is. Reply with ONLY raw JSON, no markdown fences: {"listed": true or false, "type": "directory" | "review" | "listicle" | "forum" | "competitor" | "news" | "other", "note": "one short line describing the site"}`;
        const r = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: p,
          config: { tools: [{ googleSearch: {} }] }
        });
        let raw = (r.text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) raw = m[0];
        const parsed = JSON.parse(raw);
        return {
          ...base,
          type: parsed.type || 'other',
          listed: (typeof parsed.listed === 'boolean' ? parsed.listed : null),
          note: parsed.note || ''
        };
      } catch (e) {
        return { ...base, type: 'other', listed: null, note: '' };
      }
    }));

    targets.sort((a, b) => b.citedFor - a.citedFor);

    return res.json({
      success: true,
      brandCited,
      totalQueries: cleanQueries.length,
      sourcesFound: Object.keys(domainInfo).length,
      targets
    });
  } catch (err) {
    console.error('[Citation Targets] failed:', err.message);
    return res.status(502).json({ success: false, error: `Could not complete citation analysis: ${err.message}` });
  }
});

// 13. Local SEO — NAP (Name/Address/Phone) consistency audit
app.post('/api/nap-audit', requireAuth, async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const canonical = {
    name: BUSINESS.name,
    address: `${BUSINESS.streetAddress}, ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion} ${BUSINESS.postalCode}`,
    phone: BUSINESS.telephone
  };
  if (!geminiKey) {
    return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to run a NAP audit (uses live Google Search grounding).', canonical, listings: [] });
  }

  const client = new GoogleGenAI({ apiKey: geminiKey });
  const digits = s => String(s || '').replace(/\D/g, '');
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const canonPhone = digits(canonical.phone);

  try {
    const prompt = `Find the current online business listings for "${BUSINESS.name}" located in ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion}. For each major platform where it appears (for example Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB, and local fitness directories), report the EXACT business name, full street address, and phone number shown there, based on current web information. Reply with ONLY raw JSON, no markdown fences: {"listings":[{"platform":"","name":"","address":"","phone":""}]}. If a field isn't shown on a platform, use an empty string.`;
    const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
    let raw = (r.text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed = { listings: [] };
    try { parsed = JSON.parse(raw); } catch (e) { parsed = { listings: [] }; }

    const listings = (parsed.listings || []).map(l => ({
      platform: l.platform || '',
      name: l.name || '',
      address: l.address || '',
      phone: l.phone || '',
      nameMatch: l.name ? (norm(l.name).includes(norm(BUSINESS.name)) || norm(BUSINESS.name).includes(norm(l.name))) : null,
      phoneMatch: l.phone ? (digits(l.phone).slice(-10) === canonPhone.slice(-10)) : null,
      addrMatch: l.address ? norm(l.address).includes(norm(BUSINESS.streetAddress)) : null
    }));

    return res.json({ success: true, canonical, listings });
  } catch (err) {
    console.error('[NAP Audit] failed:', err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

// 14. Local SEO — content generation (review responses/requests, GBP posts)
app.post('/api/local-generate', requireAuth, async (req, res) => {
  const { kind, review, rating, clientName, reviewLink, topic, postType } = req.body || {};
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to generate local content.', text: '' });
  }
  const client = new GoogleGenAI({ apiKey: geminiKey });

  const brand = `Best Day Fitness is a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Voice: warm, encouraging, professional, and human — never salesy or generic. Core idea: Energy = Mobility + Posture + Strength; longevity, not quick fixes.`;

  let prompt;
  if (kind === 'review-response') {
    if (!review) return res.status(400).json({ error: 'Paste the review to respond to.' });
    prompt = `${brand}\nWrite a warm, personal, professional reply from the business to this Google review${rating ? ` (${rating} stars)` : ''}:\n"""${review}"""\nRules: reference something specific they mentioned; keep it 2–4 sentences; sound human, never templated; if it's negative, be gracious, take responsibility, and invite them to connect offline. Return only the reply text.`;
  } else if (kind === 'review-request') {
    prompt = `${brand}\nWrite a short, friendly message asking a happy client${clientName ? ` named ${clientName}` : ''} to leave a Google review. Warm and low‑pressure, 2–3 sentences, thank them for training with us, and include this review link: ${reviewLink || '[YOUR GOOGLE REVIEW LINK]'}. Return only the message text.`;
  } else if (kind === 'gbp-post') {
    if (!topic) return res.status(400).json({ error: 'Enter a topic for the post.' });
    prompt = `${brand}\nWrite a Google Business Profile post of type "${postType || 'update'}" about: "${topic}". Under 1500 characters, engaging and locally relevant to St. Petersburg, with a clear call to action at the end (book a consultation / call us / visit). Return only the post text.`;
  } else {
    return res.status(400).json({ error: 'Unknown generation kind.' });
  }

  try {
    const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    return res.json({ success: true, text: (r.text || '').trim() });
  } catch (err) {
    console.error('[Local Generate] failed:', err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

// 15. Performance — period-over-period trends, durable snapshots, and leads
const PERF_FILE = path.join(DATA_DIR, 'performance.json');
let perfSnapshots = [];
if (fs.existsSync(PERF_FILE)) {
  try { perfSnapshots = JSON.parse(fs.readFileSync(PERF_FILE, 'utf8')); } catch (e) { perfSnapshots = []; }
}
function savePerf() {
  try { fs.writeFileSync(PERF_FILE, JSON.stringify(perfSnapshots, null, 2)); } catch (e) { console.error('[Performance] save failed:', e.message); }
}

async function queryGscRange(auth, siteUrl, startDate, endDate) {
  const webmasters = google.webmasters({ version: 'v3', auth });
  const resp = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 250 }
  });
  const rows = resp.data.rows || [];
  let impressions = 0, clicks = 0, posWeighted = 0;
  const byQuery = {};
  rows.forEach(r => {
    const q = r.keys ? r.keys[0] : '';
    impressions += r.impressions || 0;
    clicks += r.clicks || 0;
    posWeighted += (r.position || 0) * (r.impressions || 0);
    if (q) byQuery[q] = { impressions: r.impressions || 0, clicks: r.clicks || 0, position: r.position || 0 };
  });
  return { impressions, clicks, avgPosition: impressions ? posWeighted / impressions : 0, ctr: impressions ? clicks / impressions : 0, byQuery };
}

async function computePerformance() {
  const day = 24 * 3600 * 1000;
  const fmt = ms => new Date(ms).toISOString().split('T')[0];
  const out = { source: 'mock', current: null, previous: null, movers: { gainers: [], losers: [] }, snapshots: perfSnapshots, aioTrend: [], leads: null };

  const auth = getGoogleAuth();
  const siteUrl = process.env.GSC_SITE_URL;

  // GSC data lags ~2–3 days, so end the "current" window a few days back.
  const endCur = Date.now() - 3 * day;
  const startCur = endCur - 27 * day;
  const endPrev = startCur - 1 * day;
  const startPrev = endPrev - 27 * day;

  if (auth && siteUrl) {
    try {
      const cur = await queryGscRange(auth, siteUrl, fmt(startCur), fmt(endCur));
      const prev = await queryGscRange(auth, siteUrl, fmt(startPrev), fmt(endPrev));
      out.source = 'live_gsc';
      out.current = { impressions: cur.impressions, clicks: cur.clicks, avgPosition: +cur.avgPosition.toFixed(1), ctr: +(cur.ctr * 100).toFixed(2) };
      out.previous = { impressions: prev.impressions, clicks: prev.clicks, avgPosition: +prev.avgPosition.toFixed(1), ctr: +(prev.ctr * 100).toFixed(2) };

      const moves = [];
      Object.keys(cur.byQuery).forEach(q => {
        const c = cur.byQuery[q], p = prev.byQuery[q];
        if (p && p.position && c.position) {
          // positive posChange = rank improved (position number went down)
          moves.push({ query: q, posChange: +(p.position - c.position).toFixed(1), position: +c.position.toFixed(1), clicks: c.clicks });
        }
      });
      out.movers.gainers = moves.filter(m => m.posChange > 0.3).sort((a, b) => b.posChange - a.posChange).slice(0, 5);
      out.movers.losers = moves.filter(m => m.posChange < -0.3).sort((a, b) => a.posChange - b.posChange).slice(0, 5);

      // Daily snapshot (idempotent per day) — durable trend history.
      const today = fmt(Date.now());
      const recRate = aioAuditsDb.length ? Math.round(aioAuditsDb.filter(a => a.recommended).length / aioAuditsDb.length * 100) : null;
      const snap = {
        date: today,
        impressions: cur.impressions,
        clicks: cur.clicks,
        avgPosition: +cur.avgPosition.toFixed(1),
        leaks: Object.values(cur.byQuery).filter(x => x.clicks === 0 && x.impressions > 10).length,
        recommendedRate: recRate
      };
      const idx = perfSnapshots.findIndex(s => s.date === today);
      if (idx >= 0) perfSnapshots[idx] = snap; else perfSnapshots.push(snap);
      if (perfSnapshots.length > 180) perfSnapshots = perfSnapshots.slice(-180);
      savePerf();
      out.snapshots = perfSnapshots;
    } catch (e) {
      console.error('[Performance] GSC failed:', e.message);
    }
  }

  // AI visibility trend from audit history (bucketed by day).
  try {
    const byDay = {};
    aioAuditsDb.forEach(a => {
      const d = (a.timestamp || '').split('T')[0];
      if (!d) return;
      if (!byDay[d]) byDay[d] = { n: 0, rec: 0 };
      byDay[d].n++; if (a.recommended) byDay[d].rec++;
    });
    out.aioTrend = Object.keys(byDay).sort().map(d => ({ date: d, rate: Math.round(byDay[d].rec / byDay[d].n * 100), n: byDay[d].n }));
  } catch (e) { /* ignore */ }

  // GHL leads (best-effort, directional). Separate windows ending now.
  const ghlToken = process.env.GHL_ACCESS_TOKEN;
  const ghlLoc = process.env.GHL_LOCATION_ID;
  const lCurStart = Date.now() - 28 * day, lPrevStart = Date.now() - 56 * day, lPrevEnd = Date.now() - 28 * day;
  if (ghlToken && ghlLoc) {
    try {
      const r = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(ghlLoc)}&limit=100`, {
        headers: { 'Authorization': `Bearer ${ghlToken}`, 'Version': '2021-07-28' }
      });
      if (r.ok) {
        const d = await r.json();
        const contacts = d.contacts || [];
        let curN = 0, prevN = 0;
        contacts.forEach(c => {
          const t = new Date(c.dateAdded || c.dateUpdated || 0).getTime();
          if (t >= lCurStart) curN++;
          else if (t >= lPrevStart && t < lPrevEnd) prevN++;
        });
        out.leads = { available: true, current: curN, previous: prevN, approx: contacts.length >= 100 };
      } else {
        out.leads = { available: false, reason: `GoHighLevel contacts API returned ${r.status} — the token may not have contacts access.` };
      }
    } catch (e) {
      out.leads = { available: false, reason: 'Could not reach GoHighLevel: ' + e.message };
    }
  } else {
    out.leads = { available: false, reason: 'GoHighLevel token/location not configured in Settings.' };
  }

  return out;
}
app.get('/api/performance', async (req, res) => {
  try { res.json(await computePerformance()); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 16. On-Site & Technical SEO tools
function parseGeminiJson(text) {
  let raw = (text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) raw = m[0];
  try { return JSON.parse(raw); } catch (e) { return null; }
}

app.post('/api/onsite', requireAuth, async (req, res) => {
  const { tool, seed, keyword, currentTitle } = req.body || {};
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to use the on-site tools.' });
  }
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const brand = `Best Day Fitness — a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Method: Energy = Mobility + Posture + Strength; longevity, not quick fixes.`;

  try {
    if (tool === 'keywords') {
      if (!seed) return res.status(400).json({ error: 'Enter a seed keyword.' });
      const prompt = `${brand}\nUsing current web information, expand the seed keyword "${seed}" into 4–5 topic clusters this business could realistically target. For each cluster give: a short theme, 4–6 specific keyword phrases people actually search (favor local and long‑tail), 2–3 real questions people ask, and one concrete blog/page content idea. Return ONLY raw JSON, no markdown: {"clusters":[{"theme":"","keywords":[],"questions":[],"contentIdea":""}]}`;
      const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
      return res.json({ success: true, data: parseGeminiJson(r.text) });
    }
    if (tool === 'titlemeta') {
      if (!keyword) return res.status(400).json({ error: 'Enter a target keyword.' });
      const prompt = `${brand}\nWrite SEO title tags and meta descriptions targeting the keyword "${keyword}"${currentTitle ? ` (current title is: "${currentTitle}")` : ''}. Provide 3 title options (each 60 characters or fewer, compelling, naturally including the keyword) and 2 meta descriptions (each 155 characters or fewer, with a clear call to action). Return ONLY raw JSON, no markdown: {"titles":[],"metas":[]}`;
      const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
      return res.json({ success: true, data: parseGeminiJson(r.text) });
    }
    if (tool === 'links') {
      const pages = historyDb.map(h => ({ title: h.title, keyword: h.keyword, url: h.url }));
      if (pages.length < 2) {
        return res.json({ success: true, data: { suggestions: [], note: 'Publish at least two pages first — then this suggests internal links between them to build topic authority.' } });
      }
      const prompt = `${brand}\nHere are the pages this website has published:\n${JSON.stringify(pages)}\nSuggest internal links between them to build topic authority (pillar/cluster style). For each suggestion give the source page title, the target page title, a natural anchor phrase, and a one‑line reason. Return ONLY raw JSON, no markdown: {"suggestions":[{"from":"","to":"","anchor":"","why":""}]}`;
      const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
      return res.json({ success: true, data: parseGeminiJson(r.text) });
    }
    return res.status(400).json({ error: 'Unknown tool.' });
  } catch (err) {
    console.error('[On-Site] failed:', err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

app.get('/api/onsite-schema', (req, res) => {
  let domain = (process.env.GSC_SITE_URL || 'https://bestdayfitness.com').trim();
  if (domain.startsWith('sc-domain:')) domain = 'https://' + domain.substring(10);
  domain = domain.replace(/\/$/, '');

  const service = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Personal Training for Adults 50+",
    "provider": { "@type": "SportsClub", "name": BUSINESS.name, "@id": `${domain}/#organization` },
    "areaServed": { "@type": "City", "name": "St. Petersburg, FL" },
    "description": "Personalized personal training, integrated physical therapy, and mobility coaching for adults 50+, seniors, and people recovering from injury."
  };
  const review = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    "name": BUSINESS.name,
    "@id": `${domain}/#organization`,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "REPLACE_WITH_YOUR_REAL_GOOGLE_RATING",
      "reviewCount": "REPLACE_WITH_YOUR_REAL_REVIEW_COUNT",
      "bestRating": "5"
    }
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": domain },
      { "@type": "ListItem", "position": 2, "name": "Services", "item": `${domain}/services` },
      { "@type": "ListItem", "position": 3, "name": "Personal Training", "item": `${domain}/personal-training` }
    ]
  };
  res.json({
    service: JSON.stringify(service, null, 2),
    review: JSON.stringify(review, null, 2),
    breadcrumb: JSON.stringify(breadcrumb, null, 2)
  });
});

// ============================================================
// 15. Citation Outreach Engine — turns the citation audit into an
// ACTION worklist. The finder runs server-side and is cached; the tab
// shows only what to do. Pieces: a cached scan, a canonical Listing Kit,
// per-target outreach assets (pitch email or listing payload), and a
// persistent status tracker that survives redeploys.
// ============================================================
const CITATIONS_FILE = path.join(DATA_DIR, 'citations.json');
let citationsDb = {
  lastScanned: null, brandCited: false, totalQueries: 0, sourcesFound: 0,
  queries: [], targets: [], statuses: {}, kit: null,
  autoEnabled: true, intervalDays: 7, newDomains: []
};
try {
  if (fs.existsSync(CITATIONS_FILE)) {
    citationsDb = Object.assign(citationsDb, JSON.parse(fs.readFileSync(CITATIONS_FILE, 'utf8')));
  }
} catch (e) { console.error('[Citations] load failed:', e.message); }
function saveCitations() {
  try { fs.writeFileSync(CITATIONS_FILE, JSON.stringify(citationsDb, null, 2)); }
  catch (e) { console.error('[Citations] save failed:', e.message); }
}

const CITATION_STATUSES = ['todo', 'submitted', 'pitched', 'live'];
// Which target types are "pitch" (outreach email) vs "listing" (claim/submit).
const PITCH_TYPES = ['listicle', 'news', 'forum', 'other'];
const LISTING_TYPES = ['directory', 'review'];

// Canonical facts pasted onto every listing + used in every pitch.
function siteDomain() {
  let domain = (process.env.GSC_SITE_URL || 'https://bestdayfitness.com').trim();
  if (domain.startsWith('sc-domain:')) domain = 'https://' + domain.substring(10);
  return domain.replace(/\/$/, '');
}
function phoneDisplay() {
  const d = (BUSINESS.telephone || '').replace(/[^0-9]/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : BUSINESS.telephone;
}
const KIT_STATIC = {
  tagline: 'Coach-led fitness in St. Petersburg for active adults 50+.',
  shortDesc: 'Best Day Fitness offers coach-led personal training, mobility and strength work in St. Petersburg for adults 50+, seniors, and injury recovery — longevity, not quick fixes.',
  longDesc: 'Best Day Fitness is a holistic health & wellness studio in St. Petersburg, FL, built for adults 50+, seniors, and people recovering from injury. Our method — Energy = Mobility + Posture + Strength — pairs personalized coaching with integrated physical-therapy principles so you move better, feel stronger, and stay independent for the long run. Small-group and one-on-one training in a welcoming, no-intimidation studio.'
};
function listingKit() {
  const cached = citationsDb.kit || {};
  return {
    name: BUSINESS.name,
    addressOneLine: `${BUSINESS.streetAddress}, ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion} ${BUSINESS.postalCode}`,
    phone: phoneDisplay(),
    website: siteDomain(),
    socials: BUSINESS.sameAs || [],
    categories: cached.categories || ['Personal Trainer', 'Fitness Center', 'Physical Therapy', 'Senior Fitness'],
    tagline: cached.tagline || KIT_STATIC.tagline,
    shortDesc: cached.shortDesc || KIT_STATIC.shortDesc,
    longDesc: cached.longDesc || KIT_STATIC.longDesc,
    photoChecklist: ['Square logo', 'Storefront / exterior', '3+ class or training shots', 'Trainer headshots', 'Interior of the studio'],
    generatedAt: cached.generatedAt || null
  };
}

// GET the canonical Listing Kit (read-only, no auth so the tab loads).
app.get('/api/listing-kit', (req, res) => {
  res.json({ success: true, kit: listingKit() });
});

// POST regenerate the kit's descriptions with Gemini (auth — spends a call).
app.post('/api/listing-kit', requireAuth, async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.json({ success: true, kit: listingKit(), note: 'Add a Gemini key to regenerate descriptions; using the built-in defaults for now.' });
  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Best Day Fitness is a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Method: Energy = Mobility + Posture + Strength; longevity over quick fixes. Write listing copy for business directories. Return ONLY raw JSON, no markdown: {"tagline":"under 70 chars","shortDesc":"<=160 chars, keyword-aware","longDesc":"2-3 sentence paragraph","categories":["4 short business categories"]}`;
    const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    const parsed = parseGeminiJson(r.text);
    if (parsed) {
      citationsDb.kit = {
        tagline: parsed.tagline || KIT_STATIC.tagline,
        shortDesc: parsed.shortDesc || KIT_STATIC.shortDesc,
        longDesc: parsed.longDesc || KIT_STATIC.longDesc,
        categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories.slice(0, 6) : undefined,
        generatedAt: new Date().toISOString()
      };
      saveCitations();
    }
    res.json({ success: true, kit: listingKit() });
  } catch (err) {
    console.error('[Listing Kit] regenerate failed:', err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

// Shared finder: grounded discovery + classification of the sources AI cites.
async function discoverCitationTargets(client, cleanQueries) {
  const brandName = BUSINESS.name;
  const brandRoot = 'bestdayfitness';
  const domainInfo = {};
  let brandCited = false;
  await Promise.all(cleanQueries.map(async (q) => {
    try {
      const prompt = `A person searching online asks: "${q}". Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida, based on current web information.`;
      const resp = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
      const gm = (resp.candidates && resp.candidates[0] && resp.candidates[0].groundingMetadata) || {};
      const chunks = gm.groundingChunks || [];
      const seen = new Set();
      for (const c of chunks) {
        const dom = ((c.web && c.web.title) || '').trim().toLowerCase();
        if (!dom || seen.has(dom)) continue;
        seen.add(dom);
        if (dom.includes(brandRoot) || dom.includes(brandName.toLowerCase())) { brandCited = true; continue; }
        if (!domainInfo[dom]) domainInfo[dom] = { count: 0, queries: [] };
        domainInfo[dom].count++;
        if (!domainInfo[dom].queries.includes(q)) domainInfo[dom].queries.push(q);
      }
    } catch (e) { console.error(`[Citation Scan] query failed "${q}":`, e.message); }
  }));
  const rankedDomains = Object.keys(domainInfo).sort((a, b) => domainInfo[b].count - domainInfo[a].count).slice(0, 12);
  const targets = await Promise.all(rankedDomains.map(async (dom) => {
    const base = { domain: dom, citedFor: domainInfo[dom].count, queries: domainInfo[dom].queries };
    try {
      const p = `On the website "${dom}", is the St. Petersburg, Florida fitness studio "Best Day Fitness" listed or mentioned? Also classify what kind of site "${dom}" is. Reply with ONLY raw JSON, no markdown fences: {"listed": true or false, "type": "directory" | "review" | "listicle" | "forum" | "competitor" | "news" | "other", "note": "one short line describing the site"}`;
      const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: p, config: { tools: [{ googleSearch: {} }] } });
      const parsed = parseGeminiJson(r.text) || {};
      return { ...base, type: parsed.type || 'other', listed: (typeof parsed.listed === 'boolean' ? parsed.listed : null), note: parsed.note || '' };
    } catch (e) { return { ...base, type: 'other', listed: null, note: '' }; }
  }));
  targets.sort((a, b) => b.citedFor - a.citedFor);
  return { brandCited, sourcesFound: Object.keys(domainInfo).length, targets };
}

// Merge cached targets with saved statuses + derive the action for each.
function worklistPayload() {
  const kit = listingKit();
  const targets = (citationsDb.targets || []).map((t) => {
    const st = (citationsDb.statuses && citationsDb.statuses[t.domain]) || {};
    const mode = t.listed === true ? 'maintain'
      : LISTING_TYPES.includes(t.type) ? 'listing'
      : t.type === 'competitor' ? 'skip'
      : 'pitch';
    return { ...t, status: st.status || 'todo', statusUpdatedAt: st.updatedAt || null, mode };
  });
  const counts = {
    total: targets.length,
    listed: targets.filter(t => t.listed === true).length,
    inProgress: targets.filter(t => ['submitted', 'pitched'].includes(t.status)).length,
    live: targets.filter(t => t.status === 'live' || t.listed === true).length
  };
  const newDomains = citationsDb.newDomains || [];
  return {
    success: true,
    lastScanned: citationsDb.lastScanned,
    brandCited: citationsDb.brandCited,
    totalQueries: citationsDb.totalQueries,
    sourcesFound: citationsDb.sourcesFound,
    queries: citationsDb.queries || [],
    autoEnabled: !!citationsDb.autoEnabled,
    intervalDays: citationsDb.intervalDays || 7,
    newDomains,
    kit, counts,
    targets: targets.map(t => ({ ...t, isNew: newDomains.includes(t.domain) }))
  };
}

// Shared scan core — runs the grounded discovery, preserves statuses, and
// flags which domains are NEW since the previous scan. Used by the manual
// endpoint and the weekly auto-scan.
async function performCitationScan(queries) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const { brandCited, sourcesFound, targets } = await discoverCitationTargets(client, queries);
  const prevDomains = new Set((citationsDb.targets || []).map(t => t.domain));
  const liveDomains = new Set(targets.map(t => t.domain));
  const keptStatuses = {};
  for (const d of Object.keys(citationsDb.statuses || {})) {
    if (liveDomains.has(d)) keptStatuses[d] = citationsDb.statuses[d];
  }
  citationsDb.statuses = keptStatuses;
  // Don't flag everything "new" on the very first scan.
  citationsDb.newDomains = prevDomains.size ? targets.filter(t => !prevDomains.has(t.domain)).map(t => t.domain) : [];
  citationsDb.targets = targets;
  citationsDb.brandCited = brandCited;
  citationsDb.sourcesFound = sourcesFound;
  citationsDb.totalQueries = queries.length;
  citationsDb.queries = queries;
  citationsDb.lastScanned = new Date().toISOString();
  saveCitations();
}

// Weekly auto-scan (same restart-safe pattern as the Local/On-Site autopilots).
let citScanRunning = false;
async function maybeRunCitationScan(force) {
  if (citScanRunning) return;
  if (!force && !citationsDb.autoEnabled) return;
  if (!process.env.GEMINI_API_KEY) return;
  const queries = (citationsDb.queries || []).map(q => String(q || '').trim()).filter(Boolean).slice(0, 8);
  if (!queries.length) return; // nothing saved to scan yet — needs a first manual scan
  if (!force && daysSince(citationsDb.lastScanned) < (citationsDb.intervalDays || 7)) return;
  citScanRunning = true;
  try { await performCitationScan(queries); }
  catch (e) { console.error('[Citation Autopilot] auto-scan failed:', e.message); }
  finally { citScanRunning = false; }
}

// GET the cached worklist (read-only). Fire-and-forget a due-check so opening
// the tab nudges the weekly schedule, but never block on a live scan.
app.get('/api/citation-worklist', (req, res) => {
  maybeRunCitationScan(false).catch(() => {});
  res.json(worklistPayload());
});

// POST run a fresh scan (auth — spends grounded searches). Preserves the
// status of any domain that is still present so progress is never lost.
app.post('/api/citation-scan', requireAuth, async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to scan for citation targets (this uses live Google Search grounding).' });
  }
  let queries = Array.isArray(req.body && req.body.queries) ? req.body.queries : (citationsDb.queries || []);
  queries = queries.map(q => String(q || '').trim()).filter(Boolean).slice(0, 8);
  if (!queries.length) return res.status(400).json({ success: false, error: 'At least one search query is required.' });
  try {
    await performCitationScan(queries);
    res.json(worklistPayload());
  } catch (err) {
    console.error('[Citation Scan] failed:', err.message);
    res.status(502).json({ success: false, error: `Could not complete the scan: ${err.message}` });
  }
});

// Toggle the weekly auto-scan on/off.
app.post('/api/citation-autopilot/toggle', requireAuth, (req, res) => {
  citationsDb.autoEnabled = !!(req.body && req.body.enabled);
  saveCitations();
  res.json({ success: true, enabled: citationsDb.autoEnabled });
});
// Clear the NEW-target flags once the worklist has been viewed.
app.post('/api/citation-autopilot/seen', requireAuth, (req, res) => {
  citationsDb.newDomains = [];
  saveCitations();
  res.json({ success: true });
});

// Background scheduler for the weekly citation auto-scan (staggered from the
// Local/On-Site autopilots so they don't all fire grounded calls at once).
setTimeout(() => { maybeRunCitationScan(false).catch(() => {}); }, 60000);
setInterval(() => { maybeRunCitationScan(false).catch(() => {}); }, 12 * 60 * 60 * 1000);

// POST update one target's status in the tracker (auth).
app.post('/api/citation-status', requireAuth, (req, res) => {
  const { domain, status } = req.body || {};
  if (!domain || !CITATION_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: `Provide a domain and a status of: ${CITATION_STATUSES.join(', ')}.` });
  }
  if (!citationsDb.statuses) citationsDb.statuses = {};
  citationsDb.statuses[domain] = { status, updatedAt: new Date().toISOString() };
  saveCitations();
  res.json({ success: true, domain, status });
});

// POST generate the action asset for one target — a pitch email (listicle/
// news/forum) or a copy-paste listing payload + claim link (directory/review).
app.post('/api/citation-outreach', requireAuth, async (req, res) => {
  const { domain, type, queries } = req.body || {};
  if (!domain) return res.status(400).json({ success: false, error: 'A target domain is required.' });
  const geminiKey = process.env.GEMINI_API_KEY;
  const t = String(type || 'other').toLowerCase();
  const qList = Array.isArray(queries) ? queries.filter(Boolean) : [];
  const kit = listingKit();

  if (t === 'competitor') {
    return res.json({ success: true, kind: 'skip', message: "This is a competitor's own site — study their positioning, but you can't get listed here." });
  }

  // Listing payload (directories + review sites): built from the canonical kit.
  if (LISTING_TYPES.includes(t)) {
    let claimUrl = `https://${domain}`;
    let howTo = 'Look for a "Claim this business", "Add your business", or "For businesses" link, then paste the fields below.';
    if (geminiKey) {
      try {
        const client = new GoogleGenAI({ apiKey: geminiKey });
        const p = `Best Day Fitness wants to claim or create a free business listing on "${domain}" (a ${t} site). Using current web information, find the exact URL where a business owner adds or claims a listing on ${domain}. Return ONLY raw JSON, no markdown: {"claimUrl":"the direct add/claim/for-business URL","howTo":"one short line on the steps"}`;
        const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: p, config: { tools: [{ googleSearch: {} }] } });
        const parsed = parseGeminiJson(r.text);
        if (parsed && parsed.claimUrl) claimUrl = parsed.claimUrl;
        if (parsed && parsed.howTo) howTo = parsed.howTo;
      } catch (e) { console.error('[Outreach listing] grounding failed:', e.message); }
    }
    return res.json({
      success: true, kind: 'listing', domain, claimUrl, howTo,
      fields: {
        name: kit.name, address: kit.addressOneLine, phone: kit.phone, website: kit.website,
        categories: kit.categories.join(' · '), description: kit.shortDesc
      }
    });
  }

  // Pitch email (editorial listicles, local news, forums): grounded + personalized.
  if (!geminiKey) {
    return res.json({ success: true, kind: 'pitch', domain, unavailable: true, message: 'Add a Gemini key in Settings to auto-draft a personalized pitch for this source.' });
  }
  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });
    const p = `You are drafting a short outreach email to get a local business included in a third-party ${t}.
Business: Best Day Fitness — a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and injury recovery. Phone ${kit.phone}. Owner's first name: Chris.
Target site: "${domain}". It shows up in AI answers for searches like: ${qList.join('; ') || 'best gyms / senior fitness in St. Petersburg'}.
Using current web information about "${domain}", write a warm, specific pitch for inclusion. Reference what the site or article actually covers so it's clearly not a template. Under 130 words, one clear ask, friendly sign-off from Chris.
Return ONLY raw JSON, no markdown: {"to":"who to contact, e.g. 'Features editor' or a real email if found","subject":"","body":"","howToFind":"one line on how to find the real recipient (byline, contact page)"}`;
    const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: p, config: { tools: [{ googleSearch: {} }] } });
    const parsed = parseGeminiJson(r.text) || {};
    return res.json({
      success: true, kind: 'pitch', domain,
      to: parsed.to || 'Editor',
      subject: parsed.subject || `Best Day Fitness — a senior-focused studio for ${domain}`,
      body: parsed.body || '',
      howToFind: parsed.howToFind || 'Check the article byline or the site’s contact/about page for the right person.'
    });
  } catch (err) {
    console.error('[Outreach pitch] failed:', err.message);
    return res.status(502).json({ success: false, error: err.message });
  }
});

// ============================================================
// 16. Local SEO Autopilot — hands-off local upkeep:
//   • NAP monitor: scheduled grounded scan, flags NEW mismatches only
//   • Weekly GBP post: auto-drafted and queued, ready to paste (Google
//     doesn't allow auto-posting without OAuth approval, so we draft)
//   • Review-reply drafter with saved history (on-demand — GBP reviews
//     can't be auto-pulled without Google OAuth)
// ============================================================
const LOCAL_FILE = path.join(DATA_DIR, 'local-autopilot.json');
let localDb = {
  enabled: true,
  napIntervalDays: 7,
  gbpIntervalDays: 7,
  lastNapRun: null,
  lastGbpRun: null,
  nap: null,               // { canonical, listings, mismatchCount, checkedAt }
  napSignature: null,      // to detect NEW mismatches vs last check
  napNewMismatch: false,
  gbpDraft: null,          // { text, topic, postType, createdAt, isNew }
  gbpHistory: [],
  replyHistory: []         // { review, rating, reply, createdAt }
};
try {
  if (fs.existsSync(LOCAL_FILE)) localDb = Object.assign(localDb, JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')));
} catch (e) { console.error('[Local Autopilot] load failed:', e.message); }
function saveLocal() {
  try { fs.writeFileSync(LOCAL_FILE, JSON.stringify(localDb, null, 2)); }
  catch (e) { console.error('[Local Autopilot] save failed:', e.message); }
}

async function localNapScan() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const canonical = { name: BUSINESS.name, address: `${BUSINESS.streetAddress}, ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion} ${BUSINESS.postalCode}`, phone: BUSINESS.telephone };
  if (!geminiKey) return null;
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const digits = s => String(s || '').replace(/\D/g, '');
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const canonPhone = digits(canonical.phone);
  const prompt = `Find the current online business listings for "${BUSINESS.name}" located in ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion}. For each major platform (Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB, local fitness directories), report the EXACT business name, full street address, and phone number shown there, based on current web information. Reply with ONLY raw JSON, no markdown fences: {"listings":[{"platform":"","name":"","address":"","phone":""}]}. Empty string if a field isn't shown.`;
  const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  const parsed = parseGeminiJson(r.text) || { listings: [] };
  const listings = (parsed.listings || []).map(l => ({
    platform: l.platform || '', name: l.name || '', address: l.address || '', phone: l.phone || '',
    nameMatch: l.name ? (norm(l.name).includes(norm(BUSINESS.name)) || norm(BUSINESS.name).includes(norm(l.name))) : null,
    phoneMatch: l.phone ? (digits(l.phone).slice(-10) === canonPhone.slice(-10)) : null,
    addrMatch: l.address ? norm(l.address).includes(norm(BUSINESS.streetAddress)) : null
  }));
  const mismatchCount = listings.filter(l => l.phoneMatch === false || l.addrMatch === false || l.nameMatch === false).length;
  return { canonical, listings, mismatchCount, checkedAt: new Date().toISOString() };
}
function napSignatureOf(nap) {
  if (!nap || !nap.listings) return '';
  return nap.listings
    .filter(l => l.phoneMatch === false || l.addrMatch === false || l.nameMatch === false)
    .map(l => `${l.platform}:${l.phoneMatch}${l.addrMatch}${l.nameMatch}`).sort().join('|');
}

const GBP_TOPIC_SEED = [
  'a simple fall-prevention and balance tip for active adults 50+',
  'the benefits of strength training for seniors and injury recovery',
  'how mobility work helps you stay independent as you age',
  'why small-group coaching beats crowded gyms for adults 50+',
  'a posture and core tip for everyday movement',
  'staying active and strong in St. Petersburg this season',
  'what to expect at a first longevity assessment with us'
];
async function localGbpDraft() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const client = new GoogleGenAI({ apiKey: geminiKey });
  let topic, topicLabel;
  if (historyDb && historyDb.length) {
    topicLabel = historyDb[0].title;
    topic = `our recent article "${historyDb[0].title}" (topic: ${historyDb[0].keyword})`;
  } else {
    const idx = (localDb.gbpHistory.length) % GBP_TOPIC_SEED.length;
    topic = GBP_TOPIC_SEED[idx];
    topicLabel = topic;
  }
  const brand = `Best Day Fitness is a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Voice: warm, encouraging, professional, and human — never salesy or generic.`;
  const prompt = `${brand}\nWrite a Google Business Profile post about: ${topic}. Under 1500 characters, engaging and locally relevant to St. Petersburg, with a clear call to action at the end (book a consultation / call us / visit). Return only the post text.`;
  const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  return { text: (r.text || '').trim(), topic: topicLabel, postType: 'update', createdAt: new Date().toISOString() };
}

function daysSince(iso) { if (!iso) return Infinity; return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24); }

let localRunning = false;
async function maybeRunLocalAutopilot(force) {
  if (localRunning) return;
  if (!force && !localDb.enabled) return;
  if (!process.env.GEMINI_API_KEY) return;
  const napDue = force || daysSince(localDb.lastNapRun) >= (localDb.napIntervalDays || 7);
  const gbpDue = force || daysSince(localDb.lastGbpRun) >= (localDb.gbpIntervalDays || 7);
  if (!napDue && !gbpDue) return;
  localRunning = true;
  try {
    if (napDue) {
      try {
        const nap = await localNapScan();
        if (nap) {
          const sig = napSignatureOf(nap);
          localDb.napNewMismatch = !!(sig && sig !== (localDb.napSignature || '') && nap.mismatchCount > 0);
          localDb.napSignature = sig;
          localDb.nap = nap;
          localDb.lastNapRun = new Date().toISOString();
        }
      } catch (e) { console.error('[Local Autopilot] NAP scan failed:', e.message); }
    }
    if (gbpDue) {
      try {
        const draft = await localGbpDraft();
        if (draft) {
          if (localDb.gbpDraft) { localDb.gbpHistory.unshift({ ...localDb.gbpDraft, isNew: false }); localDb.gbpHistory = localDb.gbpHistory.slice(0, 8); }
          localDb.gbpDraft = { ...draft, isNew: true };
          localDb.lastGbpRun = new Date().toISOString();
          // If GBP posting is connected, publish it automatically; otherwise it stays a ready-to-paste draft.
          try {
            if (typeof gbpConfigured === 'function' && gbpConfigured()) {
              await postGbpLocalPost(draft.text);
              localDb.gbpDraft.posted = true;
              localDb.gbpDraft.postedAt = new Date().toISOString();
            }
          } catch (gbpErr) { localDb.gbpDraft.postError = gbpErr.message; console.error('[Local Autopilot] GBP auto-post failed:', gbpErr.message); }
        }
      } catch (e) { console.error('[Local Autopilot] GBP draft failed:', e.message); }
    }
    saveLocal();
  } finally { localRunning = false; }
}

function localState() {
  return {
    success: true,
    enabled: localDb.enabled,
    busy: localRunning,
    napIntervalDays: localDb.napIntervalDays,
    gbpIntervalDays: localDb.gbpIntervalDays,
    lastNapRun: localDb.lastNapRun,
    lastGbpRun: localDb.lastGbpRun,
    nap: localDb.nap,
    napNewMismatch: localDb.napNewMismatch,
    gbpDraft: localDb.gbpDraft,
    gbpHistory: localDb.gbpHistory,
    replyHistory: localDb.replyHistory,
    hasKey: !!process.env.GEMINI_API_KEY
  };
}

// GET state (read-only). Fire-and-forget a due-check so opening the tab nudges
// the schedule, but never block the response on a live scan.
app.get('/api/local-autopilot', (req, res) => {
  maybeRunLocalAutopilot(false).catch(() => {});
  res.json(localState());
});
app.post('/api/local-autopilot/toggle', requireAuth, (req, res) => {
  localDb.enabled = !!(req.body && req.body.enabled);
  saveLocal();
  res.json({ success: true, enabled: localDb.enabled });
});
app.post('/api/local-autopilot/run', requireAuth, (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to run the Local SEO Autopilot.' });
  maybeRunLocalAutopilot(true).catch(() => {});   // non-blocking; frontend polls GET for busy/results
  res.json({ success: true, started: true });
});
app.post('/api/local-autopilot/seen', requireAuth, (req, res) => {
  localDb.napNewMismatch = false;
  if (localDb.gbpDraft) localDb.gbpDraft.isNew = false;
  saveLocal();
  res.json({ success: true });
});

// Draft a reply to a pasted review AND save it to history.
app.post('/api/local-reply', requireAuth, async (req, res) => {
  const { review, rating } = req.body || {};
  if (!review) return res.status(400).json({ success: false, error: 'Paste the review to respond to.' });
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to draft replies.' });
  try {
    const client = new GoogleGenAI({ apiKey: geminiKey });
    const brand = `Best Day Fitness is a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Voice: warm, encouraging, professional, and human — never salesy or generic.`;
    const prompt = `${brand}\nWrite a warm, personal, professional reply from the business to this Google review${rating ? ` (${rating} stars)` : ''}:\n"""${review}"""\nRules: reference something specific they mentioned; keep it 2–4 sentences; sound human, never templated; if it's negative, be gracious, take responsibility, and invite them to connect offline. Return only the reply text.`;
    const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    const reply = (r.text || '').trim();
    localDb.replyHistory.unshift({ review: String(review).slice(0, 500), rating: rating || '', reply, createdAt: new Date().toISOString() });
    localDb.replyHistory = localDb.replyHistory.slice(0, 20);
    saveLocal();
    res.json({ success: true, reply });
  } catch (err) {
    console.error('[Local Reply] failed:', err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

// Background scheduler: catch up shortly after boot, then check twice a day.
setTimeout(() => { maybeRunLocalAutopilot(false).catch(() => {}); }, 30000);
setInterval(() => { maybeRunLocalAutopilot(false).catch(() => {}); }, 12 * 60 * 60 * 1000);

// ============================================================
// 17. On-Site SEO Autopilot — a weekly content & optimization pipeline:
//   • Content Ideas: grounded keyword/topic clusters (rotating seed)
//   • Internal Links: suggested links between your published pages
//   • Title/Meta: optimized tags for your most recent page
// Runs on the same weekly, restart-safe schedule as the Local autopilot.
// ============================================================
const ONSITE_FILE = path.join(DATA_DIR, 'onsite-autopilot.json');
let onsiteDb = {
  enabled: true, intervalDays: 7, lastRun: null, seedIndex: 0,
  ideas: null, links: null, titlemeta: null
};
try {
  if (fs.existsSync(ONSITE_FILE)) onsiteDb = Object.assign(onsiteDb, JSON.parse(fs.readFileSync(ONSITE_FILE, 'utf8')));
} catch (e) { console.error('[On-Site Autopilot] load failed:', e.message); }
function saveOnsite() {
  try { fs.writeFileSync(ONSITE_FILE, JSON.stringify(onsiteDb, null, 2)); }
  catch (e) { console.error('[On-Site Autopilot] save failed:', e.message); }
}

const ONSITE_BRAND = `Best Day Fitness — a holistic health & wellness studio in St. Petersburg, FL for adults 50+, seniors, and people recovering from injury. Method: Energy = Mobility + Posture + Strength; longevity, not quick fixes.`;
const ONSITE_SEEDS = [
  'senior fitness st petersburg',
  'personal trainer for seniors',
  'balance and fall prevention exercises',
  'strength training for adults over 50',
  'physical therapy and mobility st petersburg',
  'injury recovery exercise programs',
  'functional fitness for older adults'
];

async function onsiteKeywordScan(seed) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const prompt = `${ONSITE_BRAND}\nUsing current web information, expand the seed keyword "${seed}" into 4–5 topic clusters this business could realistically target. For each cluster give: a short theme, 4–6 specific keyword phrases people actually search (favor local and long‑tail), 2–3 real questions people ask, and one concrete blog/page content idea. Return ONLY raw JSON, no markdown: {"clusters":[{"theme":"","keywords":[],"questions":[],"contentIdea":""}]}`;
  const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  const data = parseGeminiJson(r.text) || { clusters: [] };
  return { seed, clusters: data.clusters || [], generatedAt: new Date().toISOString() };
}
async function onsiteLinkScan() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const pages = (historyDb || []).map(h => ({ title: h.title, keyword: h.keyword, url: h.url }));
  if (pages.length < 2) return { suggestions: [], note: 'Publish at least two pages first — then this suggests internal links between them.', generatedAt: new Date().toISOString() };
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const prompt = `${ONSITE_BRAND}\nHere are the pages this website has published:\n${JSON.stringify(pages)}\nSuggest internal links between them to build topic authority (pillar/cluster style). For each suggestion give the source page title, the target page title, a natural anchor phrase, and a one‑line reason. Return ONLY raw JSON, no markdown: {"suggestions":[{"from":"","to":"","anchor":"","why":""}]}`;
  const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  const data = parseGeminiJson(r.text) || { suggestions: [] };
  return { suggestions: data.suggestions || [], note: '', generatedAt: new Date().toISOString() };
}
async function onsiteTitleMetaScan(keyword, page) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const client = new GoogleGenAI({ apiKey: geminiKey });
  const prompt = `${ONSITE_BRAND}\nWrite SEO title tags and meta descriptions targeting the keyword "${keyword}". Provide 3 title options (each 60 characters or fewer, compelling, naturally including the keyword) and 2 meta descriptions (each 155 characters or fewer, with a clear call to action). Return ONLY raw JSON, no markdown: {"titles":[],"metas":[]}`;
  const r = await client.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  const data = parseGeminiJson(r.text) || { titles: [], metas: [] };
  return { page: page || keyword, keyword, titles: data.titles || [], metas: data.metas || [], generatedAt: new Date().toISOString() };
}

let onsiteRunning = false;
async function maybeRunOnsiteAutopilot(force) {
  if (onsiteRunning) return;
  if (!force && !onsiteDb.enabled) return;
  if (!process.env.GEMINI_API_KEY) return;
  if (!force && daysSince(onsiteDb.lastRun) < (onsiteDb.intervalDays || 7)) return;
  onsiteRunning = true;
  try {
    const seed = ONSITE_SEEDS[(onsiteDb.seedIndex || 0) % ONSITE_SEEDS.length];
    onsiteDb.seedIndex = ((onsiteDb.seedIndex || 0) + 1) % ONSITE_SEEDS.length;
    try { const ideas = await onsiteKeywordScan(seed); if (ideas) onsiteDb.ideas = { ...ideas, isNew: true }; }
    catch (e) { console.error('[On-Site Autopilot] keywords failed:', e.message); }
    try { const links = await onsiteLinkScan(); if (links) onsiteDb.links = { ...links, isNew: true }; }
    catch (e) { console.error('[On-Site Autopilot] links failed:', e.message); }
    try {
      const latest = (historyDb && historyDb.length) ? historyDb[0] : null;
      const kw = latest ? latest.keyword : seed;
      const pg = latest ? latest.title : 'Your homepage';
      const tm = await onsiteTitleMetaScan(kw, pg);
      if (tm) onsiteDb.titlemeta = { ...tm, isNew: true };
    } catch (e) { console.error('[On-Site Autopilot] titlemeta failed:', e.message); }
    onsiteDb.lastRun = new Date().toISOString();
    saveOnsite();
  } finally { onsiteRunning = false; }
}

function onsiteState() {
  return {
    success: true,
    enabled: onsiteDb.enabled,
    busy: onsiteRunning,
    intervalDays: onsiteDb.intervalDays,
    lastRun: onsiteDb.lastRun,
    ideas: onsiteDb.ideas,
    links: onsiteDb.links,
    titlemeta: onsiteDb.titlemeta,
    hasKey: !!process.env.GEMINI_API_KEY
  };
}

app.get('/api/onsite-autopilot', (req, res) => {
  maybeRunOnsiteAutopilot(false).catch(() => {});
  res.json(onsiteState());
});
app.post('/api/onsite-autopilot/toggle', requireAuth, (req, res) => {
  onsiteDb.enabled = !!(req.body && req.body.enabled);
  saveOnsite();
  res.json({ success: true, enabled: onsiteDb.enabled });
});
app.post('/api/onsite-autopilot/run', requireAuth, (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.json({ success: true, unavailable: true, message: 'Add your Gemini API key in Settings to run the On-Site SEO Autopilot.' });
  maybeRunOnsiteAutopilot(true).catch(() => {});
  res.json({ success: true, started: true });
});
app.post('/api/onsite-autopilot/seen', requireAuth, (req, res) => {
  if (onsiteDb.ideas) onsiteDb.ideas.isNew = false;
  if (onsiteDb.links) onsiteDb.links.isNew = false;
  if (onsiteDb.titlemeta) onsiteDb.titlemeta.isNew = false;
  saveOnsite();
  res.json({ success: true });
});

setTimeout(() => { maybeRunOnsiteAutopilot(false).catch(() => {}); }, 45000);
setInterval(() => { maybeRunOnsiteAutopilot(false).catch(() => {}); }, 12 * 60 * 60 * 1000);

// ============================================================
// 18. OAuth integrations — Gmail direct send + Google Business Profile
// auto-post. Both are PROGRESSIVE ENHANCEMENTS: if the env vars aren't
// set, the endpoints report needsSetup and the UI falls back to the
// existing compose-link / paste flow. Nothing breaks when unconfigured.
// ============================================================
function gmailClient() {
  const id = process.env.GMAIL_CLIENT_ID, secret = process.env.GMAIL_CLIENT_SECRET, refresh = process.env.GMAIL_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;
  const o = new google.auth.OAuth2(id, secret, 'https://developers.google.com/oauthplayground');
  o.setCredentials({ refresh_token: refresh });
  return google.gmail({ version: 'v1', auth: o });
}

app.get('/api/gmail-status', (req, res) => {
  res.json({ configured: !!gmailClient(), from: process.env.GMAIL_SENDER || '' });
});

// Shared Gmail sender (used by pitch send + the performance digest email).
async function sendGmail(to, subject, body) {
  const gmail = gmailClient();
  if (!gmail) throw new Error('Gmail is not connected.');
  const headers = [
    `To: ${String(to).trim()}`,
    process.env.GMAIL_SENDER ? `From: ${process.env.GMAIL_SENDER}` : null,
    `Subject: ${subject || ''}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8'
  ].filter(Boolean).join('\r\n');
  const raw = Buffer.from(`${headers}\r\n\r\n${body || ''}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  return r.data && r.data.id;
}

// Send a pitch email directly through the owner's Gmail (silent send).
app.post('/api/send-pitch', requireAuth, async (req, res) => {
  const { to, subject, body } = req.body || {};
  if (!gmailClient()) return res.json({ success: true, needsSetup: true, message: 'Gmail direct-send isn’t connected yet — use the compose window. Add GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN in Railway to enable one-click send.' });
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to).trim())) {
    return res.status(400).json({ success: false, error: 'Enter a valid recipient email address to send.' });
  }
  try {
    const id = await sendGmail(to, subject, body);
    return res.json({ success: true, sent: true, id });
  } catch (err) {
    console.error('[Gmail send] failed:', err.message);
    return res.status(502).json({ success: false, error: `Gmail send failed: ${err.message}` });
  }
});

// --- Google Business Profile auto-post (requires APPROVED Business Profile
// API access — apply via Google's form; can take days/weeks). Pre-built so
// it flips on the moment access + GBP_* env vars are in place. ---
function gbpAuth() {
  const id = process.env.GBP_CLIENT_ID || process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GBP_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET;
  const refresh = process.env.GBP_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;
  const o = new google.auth.OAuth2(id, secret, 'https://developers.google.com/oauthplayground');
  o.setCredentials({ refresh_token: refresh });
  return o;
}
function gbpConfigured() {
  return !!(gbpAuth() && process.env.GBP_ACCOUNT_ID && process.env.GBP_LOCATION_ID);
}
async function postGbpLocalPost(text) {
  const auth = gbpAuth();
  if (!auth || !process.env.GBP_ACCOUNT_ID || !process.env.GBP_LOCATION_ID) return { posted: false, needsSetup: true };
  const tokenObj = await auth.getAccessToken();
  const token = (tokenObj && tokenObj.token) || tokenObj;
  const url = `https://mybusiness.googleapis.com/v4/accounts/${process.env.GBP_ACCOUNT_ID}/locations/${process.env.GBP_LOCATION_ID}/localPosts`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      languageCode: 'en-US',
      summary: String(text || '').slice(0, 1500),
      topicType: 'STANDARD',
      callToAction: { actionType: 'LEARN_MORE', url: siteDomain() }
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error && data.error.message ? data.error.message : `GBP API HTTP ${resp.status}`);
  return { posted: true, name: data.name, searchUrl: data.searchUrl };
}

app.get('/api/gbp-status', (req, res) => {
  res.json({ configured: gbpConfigured() });
});
app.post('/api/gbp-post', requireAuth, async (req, res) => {
  const text = (req.body && req.body.text) || (localDb.gbpDraft && localDb.gbpDraft.text);
  if (!text) return res.status(400).json({ success: false, error: 'No post text to publish.' });
  if (!gbpConfigured()) return res.json({ success: true, needsSetup: true, message: 'Google Business Profile posting isn’t connected. It needs approved Business Profile API access plus the GBP_* env vars.' });
  try {
    const result = await postGbpLocalPost(text);
    if (localDb.gbpDraft && localDb.gbpDraft.text === text) { localDb.gbpDraft.posted = true; localDb.gbpDraft.postedAt = new Date().toISOString(); saveLocal(); }
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[GBP post] failed:', err.message);
    return res.status(502).json({ success: false, error: `GBP post failed: ${err.message}` });
  }
});

// ============================================================
// 19. Performance weekly digest — a scheduled snapshot of search performance
// (clicks/impressions/rank vs last period, top movers, AI visibility, leads),
// saved for the Performance tab and auto-emailed via Gmail when connected.
// ============================================================
const PERF_DIGEST_FILE = path.join(DATA_DIR, 'performance-digest.json');
let perfDigestDb = { enabled: true, intervalDays: 7, autoEmail: false, lastRun: null, digest: null };
try {
  if (fs.existsSync(PERF_DIGEST_FILE)) perfDigestDb = Object.assign(perfDigestDb, JSON.parse(fs.readFileSync(PERF_DIGEST_FILE, 'utf8')));
} catch (e) { console.error('[Perf Digest] load failed:', e.message); }
function savePerfDigest() {
  try { fs.writeFileSync(PERF_DIGEST_FILE, JSON.stringify(perfDigestDb, null, 2)); }
  catch (e) { console.error('[Perf Digest] save failed:', e.message); }
}
function perfPct(cur, prev) { if (prev == null || prev === 0) return null; return Math.round((cur - prev) / prev * 100); }
function perfDigestText(d) {
  const sign = n => (n >= 0 ? '+' : '') + n;
  const lines = ['Best Day Fitness — Weekly SEO Performance', ''];
  if (d.clicks) lines.push(`Clicks: ${d.clicks.cur}${d.clicks.pct != null ? ` (${sign(d.clicks.pct)}% vs the previous 4 weeks)` : ''}`);
  if (d.impressions) lines.push(`Impressions: ${d.impressions.cur}${d.impressions.pct != null ? ` (${sign(d.impressions.pct)}%)` : ''}`);
  if (d.avgPosition) lines.push(`Average Google rank: ${d.avgPosition.cur}${d.avgPosition.prev != null ? ` (was ${d.avgPosition.prev})` : ''}`);
  if (d.aiVisibility != null) lines.push(`AI visibility: ${d.aiVisibility}% of audits recommend you`);
  if (d.leads) lines.push(`New leads: ${d.leads.current}${d.leads.previous != null ? ` (was ${d.leads.previous})` : ''}`);
  if (d.gainers && d.gainers.length) { lines.push('', 'Top rising keywords:'); d.gainers.forEach(g => lines.push(`  • ${g.query} — up ${g.posChange} spots, now #${g.position}`)); }
  if (d.losers && d.losers.length) { lines.push('', 'Slipping keywords (worth a look):'); d.losers.forEach(g => lines.push(`  • ${g.query} — down ${Math.abs(g.posChange)} spots, now #${g.position}`)); }
  if (d.source !== 'live_gsc') lines.push('', '(Sample data — connect Search Console for live numbers.)');
  lines.push('', '— SEO Buddy');
  return lines.join('\n');
}
async function buildPerfDigest() {
  const p = await computePerformance();
  const cur = p.current, prev = p.previous;
  const d = {
    generatedAt: new Date().toISOString(),
    source: p.source,
    clicks: cur ? { cur: cur.clicks, prev: prev ? prev.clicks : null, pct: prev ? perfPct(cur.clicks, prev.clicks) : null } : null,
    impressions: cur ? { cur: cur.impressions, prev: prev ? prev.impressions : null, pct: prev ? perfPct(cur.impressions, prev.impressions) : null } : null,
    avgPosition: cur ? { cur: cur.avgPosition, prev: prev ? prev.avgPosition : null } : null,
    gainers: ((p.movers && p.movers.gainers) || []).slice(0, 3),
    losers: ((p.movers && p.movers.losers) || []).slice(0, 3),
    aiVisibility: (p.aioTrend && p.aioTrend.length) ? p.aioTrend[p.aioTrend.length - 1].rate : null,
    leads: (p.leads && p.leads.available) ? { current: p.leads.current, previous: p.leads.previous } : null
  };
  d.text = perfDigestText(d);
  return d;
}
let perfDigestRunning = false;
async function maybeRunPerfDigest(force) {
  if (perfDigestRunning) return;
  if (!force && !perfDigestDb.enabled) return;
  if (!force && daysSince(perfDigestDb.lastRun) < (perfDigestDb.intervalDays || 7)) return;
  perfDigestRunning = true;
  try {
    const d = await buildPerfDigest();
    perfDigestDb.digest = { ...d, isNew: true };
    perfDigestDb.lastRun = new Date().toISOString();
    savePerfDigest();
    if (perfDigestDb.autoEmail) {
      const to = process.env.DIGEST_EMAIL || process.env.GMAIL_SENDER;
      if (to && gmailClient()) {
        try { await sendGmail(to, 'Your weekly SEO performance — Best Day Fitness', d.text); perfDigestDb.digest.emailedAt = new Date().toISOString(); savePerfDigest(); }
        catch (e) { console.error('[Perf Digest] auto-email failed:', e.message); }
      }
    }
  } catch (e) { console.error('[Perf Digest] build failed:', e.message); }
  finally { perfDigestRunning = false; }
}
function perfDigestState() {
  return {
    success: true,
    enabled: perfDigestDb.enabled,
    autoEmail: perfDigestDb.autoEmail,
    intervalDays: perfDigestDb.intervalDays,
    lastRun: perfDigestDb.lastRun,
    digest: perfDigestDb.digest,
    busy: perfDigestRunning,
    gmailConfigured: !!gmailClient(),
    emailTo: process.env.DIGEST_EMAIL || process.env.GMAIL_SENDER || ''
  };
}
app.get('/api/performance-digest', (req, res) => {
  maybeRunPerfDigest(false).catch(() => {});
  res.json(perfDigestState());
});
app.post('/api/performance-digest/toggle', requireAuth, (req, res) => {
  const b = req.body || {};
  if (typeof b.enabled === 'boolean') perfDigestDb.enabled = b.enabled;
  if (typeof b.autoEmail === 'boolean') perfDigestDb.autoEmail = b.autoEmail;
  savePerfDigest();
  res.json({ success: true, enabled: perfDigestDb.enabled, autoEmail: perfDigestDb.autoEmail });
});
app.post('/api/performance-digest/run', requireAuth, (req, res) => {
  maybeRunPerfDigest(true).catch(() => {});
  res.json({ success: true, started: true });
});
app.post('/api/performance-digest/seen', requireAuth, (req, res) => {
  if (perfDigestDb.digest) perfDigestDb.digest.isNew = false;
  savePerfDigest();
  res.json({ success: true });
});
app.post('/api/performance-digest/send', requireAuth, async (req, res) => {
  const to = ((req.body && req.body.to) || process.env.DIGEST_EMAIL || process.env.GMAIL_SENDER || '').trim();
  if (!gmailClient()) return res.json({ success: true, needsSetup: true, message: 'Connect Gmail (see the OAuth setup guide) to email the digest.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ success: false, error: 'No recipient email. Set GMAIL_SENDER or DIGEST_EMAIL in Railway, or enter one.' });
  try {
    let d = perfDigestDb.digest;
    if (!d) { d = await buildPerfDigest(); perfDigestDb.digest = { ...d, isNew: true }; perfDigestDb.lastRun = new Date().toISOString(); savePerfDigest(); }
    const id = await sendGmail(to, 'Your weekly SEO performance — Best Day Fitness', d.text);
    res.json({ success: true, sent: true, id, to });
  } catch (e) { res.status(502).json({ success: false, error: e.message }); }
});
setTimeout(() => { maybeRunPerfDigest(false).catch(() => {}); }, 75000);
setInterval(() => { maybeRunPerfDigest(false).catch(() => {}); }, 12 * 60 * 60 * 1000);

// Consolidated autopilot digest for the Summary dashboard — one glance at
// what every autopilot produced, with links back to each tab.
app.get('/api/autopilot-digest', (req, res) => {
  const items = [];
  if (onsiteDb && onsiteDb.ideas && onsiteDb.ideas.clusters && onsiteDb.ideas.clusters.length) {
    const n = onsiteDb.ideas.clusters.length;
    items.push({ key: 'onsite', tab: 'onsite-tab', icon: '💡', label: 'Content ideas', text: `${n} fresh topic cluster${n > 1 ? 's' : ''} to write about`, isNew: !!onsiteDb.ideas.isNew, tone: 'info' });
  }
  if (onsiteDb && onsiteDb.links && onsiteDb.links.suggestions && onsiteDb.links.suggestions.length) {
    const n = onsiteDb.links.suggestions.length;
    items.push({ key: 'onsite-links', tab: 'onsite-tab', icon: '🔗', label: 'Internal links', text: `${n} link suggestion${n > 1 ? 's' : ''} to add`, isNew: !!onsiteDb.links.isNew, tone: 'info' });
  }
  if (localDb && localDb.nap) {
    const mm = localDb.nap.mismatchCount || 0;
    items.push({ key: 'local-nap', tab: 'local-tab', icon: '📍', label: 'NAP monitor', text: mm ? `${mm} listing${mm > 1 ? 's' : ''} to fix` : 'All listings consistent', isNew: !!localDb.napNewMismatch, tone: mm ? 'warn' : 'info' });
  }
  if (localDb && localDb.gbpDraft) {
    const g = localDb.gbpDraft;
    items.push({ key: 'local-gbp', tab: 'local-tab', icon: '📝', label: 'Weekly GBP post', text: g.posted ? 'Posted to Google ✓' : 'Ready to post', isNew: !!g.isNew, tone: 'info' });
  }
  if (citationsDb && citationsDb.targets && citationsDb.targets.length) {
    const total = citationsDb.targets.length;
    const statuses = citationsDb.statuses || {};
    const notDone = citationsDb.targets.filter(t => t.listed !== true && ((statuses[t.domain] && statuses[t.domain].status) || 'todo') === 'todo').length;
    const newN = (citationsDb.newDomains || []).length;
    const text = newN ? `${newN} new source${newN > 1 ? 's' : ''} AI now cites` : (notDone ? `${notDone} source${notDone > 1 ? 's' : ''} to get listed on` : `${total} sources tracked`);
    items.push({ key: 'citations', tab: 'citations-tab', icon: '🎯', label: 'Citation targets', text, isNew: newN > 0, tone: 'info' });
  }
  if (perfDigestDb && perfDigestDb.digest) {
    const dg = perfDigestDb.digest;
    const cl = dg.clicks;
    const text = cl ? `${cl.cur} clicks this week${cl.pct != null ? ` (${cl.pct >= 0 ? '+' : ''}${cl.pct}%)` : ''}` : 'Weekly digest ready';
    items.push({ key: 'perf', tab: 'performance-tab', icon: '📈', label: 'Weekly digest', text, isNew: !!dg.isNew, tone: 'info' });
  }
  res.json({ success: true, items, newCount: items.filter(i => i.isNew).length, generatedAt: new Date().toISOString() });
});

// Restore the autopilot schedule if it was enabled before a redeploy.
if (autopilotEnabled) {
  try { startAutopilotScheduler(); } catch (e) { console.error('[Autopilot] restore failed:', e.message); }
}

// Start the Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SEO Buddy - Total Rank System Dashboard is running!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  console.log(`🤖 Gemini model: ${GEMINI_MODEL}`);
  console.log(`💾 Data dir: ${DATA_DIR}${process.env.DATA_DIR ? ' (persistent)' : ' (ephemeral — set DATA_DIR to a Railway volume to persist history)'}`);
  if (ADMIN_PASSWORD) {
    console.log(`🔒 Admin lock: ON (settings/publish/index/autopilot require the password)`);
  } else {
    console.log(`⚠️  SECURITY WARNING: ADMIN_PASSWORD is not set.`);
    console.log(`⚠️  Settings, publishing, indexing and Gemini-spend endpoints are OPEN.`);
    console.log(`⚠️  Set ADMIN_PASSWORD in your environment before exposing this publicly.`);
  }
  console.log(`=======================================================`);
});
