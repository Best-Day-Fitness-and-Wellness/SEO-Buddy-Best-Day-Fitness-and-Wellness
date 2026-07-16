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
    console.log('[Gemini SDK] Initialized successfully.');
  } catch (error) {
    console.error('[Gemini SDK] Initialization failed:', error.message);
  }
} else {
  console.log('[Gemini SDK] No GEMINI_API_KEY found in .env. Running in Mock generation mode.');
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

// Helper to check for Service Account credentials
function getGoogleAuth() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return null;

  try {
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
// Endpoints
// ----------------------------------------------------

// 1. Fetch Google Search Console Data (Mock fallback)
app.get('/api/gsc-data', async (req, res) => {
  const auth = getGoogleAuth();
  const siteUrl = process.env.GSC_SITE_URL;

  if (auth && siteUrl) {
    try {
      console.log(`[GSC API] Attempting to query site: ${siteUrl}`);
      const webmasters = google.webmasters({ version: 'v3', auth: auth });
      
      // Query Search Console data for the last 30 days
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
          
          // An SEO leak is defined as a query getting substantial impressions but 0 or near 0 clicks, 
          // ranking on page 2 or late page 1 (position > 7)
          const leak = clicks === 0 && impressions > 10;

          return { query, impressions, clicks, ctr, position, leak };
        });

        // Sort: leaks first, then highest impressions
        rows.sort((a, b) => {
          if (a.leak && !b.leak) return -1;
          if (!a.leak && b.leak) return 1;
          return b.impressions - a.impressions;
        });

        return res.json({ source: 'live_gsc', data: rows });
      }
    } catch (error) {
      console.error('[GSC API] Failed to fetch live GSC data. Falling back to Mock data. Error:', error.message);
    }
  }

  // Fallback to mock data if credentials or site URL are not set, or GSC API fails
  return res.json({ source: 'mock_data', data: MOCK_GSC_DATA });
});

// 2. Generate SEO-optimized Blog Article using Gemini API
app.post('/api/generate-article', async (req, res) => {
  const { keyword, caseStudy, ctaText, ctaUrl } = req.body;

  if (!keyword) {
    return res.status(404).json({ error: 'Keyword is required' });
  }

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

  // Check if we are running in Mock or Live mode
  if (ai) {
    try {
      console.log(`[Gemini API] Generating article for keyword: "${keyword}"`);
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const rawText = response.text || '';
      
      // Clean up markdown markers if Gemini returned them
      let htmlContent = rawText;
      if (htmlContent.startsWith('```html')) {
        htmlContent = htmlContent.substring(7);
      }
      if (htmlContent.endsWith('```')) {
        htmlContent = htmlContent.substring(0, htmlContent.length - 3);
      }
      htmlContent = htmlContent.trim();

      // Extract a Title from H1 if present, otherwise generate one
      let title = `Ultimate Guide to ${keyword}`;
      const h1Match = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match && h1Match[1]) {
        title = h1Match[1].replace(/<[^>]*>/g, '').trim();
      }

      const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      return res.json({
        success: true,
        source: 'live_gemini',
        title,
        slug,
        content: htmlContent
      });

    } catch (error) {
      console.error('[Gemini API] Generation failed. Falling back to mock generator. Error:', error.message);
    }
  }

  // Fallback / Mock article generator
  console.log(`[Mock Generator] Creating mock article for keyword: "${keyword}"`);
  const title = `The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} | Best Day Fitness`;
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  const mockHtml = `<div class="seo-article-content">
  <h1>The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}</h1>
  <p>Are you looking to improve your quality of life, regain independence, and move without pain? At <strong>Best Day Fitness</strong> in St. Petersburg, Florida, we believe that fitness isn't just about intense workouts—it's about functional movement that extends your healthspan. This guide explores how targeting <strong>${keyword}</strong> can help you achieve your wellness goals.</p>

  <h2>Understanding ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} for Longevity</h2>
  <p>As we age, our bodies experience natural shifts. However, pain, lack of balance, and stiffness do not have to be a normal part of getting older. Focus on movement quality, posture, and core strength forms the cornerstone of longevity. This is why specialized training targeting <em>${keyword}</em> is so crucial.</p>

  <h3>Our Core Philosophy: Energy = Mobility + Posture + Strength</h3>
  <p>Unlike open commercial gyms that leave you to figure exercises out on your own, our trainer-led programs ensure you perform every movement safely. Our philosophy focuses on three pillars:</p>
  <ul>
    <li><strong>Mobility:</strong> Restoring the natural range of motion in your joints.</li>
    <li><strong>Posture:</strong> Re-aligning the spine to reduce stress on your hips, knees, and back.</li>
    <li><strong>Strength:</strong> Developing functional muscles that support daily tasks like carrying groceries or standing up easily.</li>
  </ul>

  <h2>Step-by-Step Exercise Routine for ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}</h2>
  <p>Here is a basic daily routine designed by our St. Petersburg personal trainers to safely build your foundation:</p>
  <ol>
    <li><strong>Gentle Joint Mobility (5 Mins):</strong> Perform slow shoulder rolls, neck rotations, and ankle circles to warm up the joints.</li>
    <li><strong>Supported Squats (10 Reps):</strong> Hold onto a sturdy rail or chair. Slowly lower your hips as if sitting down, keeping your chest tall, then push through your heels to stand.</li>
    <li><strong>Wall Posture Alignment (2 Mins):</strong> Stand with your heels, glutes, upper back, and head gently touching a flat wall. Breathe deeply, focusing on core engagement.</li>
    <li><strong>Barefoot Balance Hold (1 Min per side):</strong> Standing near a support, lift one foot slightly and hold. Training barefoot strengthens the stabilizers in your feet and ankles, crucial for balance.</li>
  </ol>

  <h2>How Best Day Fitness Compares to Traditional Gyms</h2>
  <p>If you've been hesitant to join a gym, it helps to understand how a specialized senior mobility center differs from an open commercial fitness facility:</p>
  
  <table>
    <thead>
      <tr>
        <th>Feature</th>
        <th>Best Day Fitness Co-Op</th>
        <th>Traditional Commercial Gyms</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Environment</strong></td>
        <td>Quiet, private, specialized equipment, barefoot-friendly</td>
        <td>Loud, crowded, intimidating, heavy machines only</td>
      </tr>
      <tr>
        <td><strong>Guidance</strong></td>
        <td>100% trainer-led, small groups (max 8) or 1-on-1</td>
        <td>Self-directed, no supervision, high injury risk</td>
      </tr>
      <tr>
        <td><strong>Approach</strong></td>
        <td>Longevity, joint safety, posture, balance</td>
        <td>High-intensity, weight loss, muscle building</td>
      </tr>
      <tr>
        <td><strong>Coordinated Care</strong></td>
        <td>Integration with physical therapists & massage coaches</td>
        <td>None</td>
      </tr>
    </tbody>
  </table>

  <h2>Case Study: Success with ${keyword.charAt(0).toUpperCase() + keyword.slice(1)}</h2>
  <div class="case-study-box">
    <h4>Client Spotlight</h4>
    <p>${caseStudy || "One of our St. Pete clients, age 68, joined Best Day Fitness after recovering from hip replacement surgery. Through a tailored balance and mobility program, they went from using a cane to walking barefoot comfortably in our studio and hiking on weekends. This is the power of trainer-led movement."}</p>
  </div>

  <h2>Take the First Step to Your Best Day</h2>
  <div class="cta-section">
    <p>Ready to experience the Best Day difference? Schedule a consultation with our fitness and physical therapy experts in St. Petersburg today. We will assess your balance, gait, posture, and strength to map out a safe, custom program.</p>
    <a href="${ctaUrl || 'https://bestdayfitness.com/consultation'}" class="article-cta-btn">${ctaText || 'Claim Your Free Consultation'}</a>
  </div>

  <p>Explore more wellness insights in our articles on [Link: Senior Fitness St Petersburg] and [Link: Posture Correction Exercises].</p>

  <h2>Frequently Asked Questions</h2>
  <div class="faq-item">
    <strong>Q: How often should I practice mobility training?</strong>
    <p>A: Ideally, mobility and posture alignment exercises should be practiced daily for 10-15 minutes, or in structured sessions 2-3 times per week.</p>
  </div>
  <div class="faq-item">
    <strong>Q: Do I need fitness experience to join Best Day Fitness?</strong>
    <p>A: Not at all. Most of our clients are seniors, active adults, or people recovering from injuries who prefer a private, non-intimidating, and supervised setting.</p>
  </div>
  <div class="faq-item">
    <strong>Q: Why is training barefoot recommended?</strong>
    <p>A: Barefoot training stimulates the sensory receptors in the feet, improves ankle stability, strengthens foot arches, and significantly enhances balance, helping prevent falls.</p>
  </div>
</div>`;

  return res.json({
    success: true,
    source: 'mock_generator',
    title,
    slug,
    content: mockHtml
  });
});

// 3. Publish to GoHighLevel Blog API
app.post('/api/publish-ghl', async (req, res) => {
  const { title, content, status } = req.body;
  const locationId = process.env.GHL_LOCATION_ID || req.body.locationId;
  const accessToken = process.env.GHL_ACCESS_TOKEN || req.body.accessToken;
  const blogId = process.env.GHL_BLOG_ID || req.body.blogId;
  const authorId = process.env.GHL_AUTHOR_ID || req.body.authorId || 'default-author';

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  // If GHL API credentials are not set, return a simulated successful response (Mock Mode)
  if (!accessToken || !locationId || !blogId) {
    console.log('[GHL API] Running in Mock Mode. Credentials missing in .env');
    return res.json({
      success: true,
      source: 'mock_ghl',
      postId: `mock-post-${Date.now()}`,
      url: `https://gohighlevel.com/mock-blog/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      message: 'Article saved and published in MOCK MODE. Setup GHL credentials in Settings to publish live!'
    });
  }

  try {
    console.log(`[GHL API] Sending request to publish blog post: "${title}"`);
    // GHL API V2 Blog Post creation
    // Endpoint: POST https://services.leadconnectorhq.com/blogs/posts
    const response = await fetch('https://services.leadconnectorhq.com/blogs/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-04-15', // Standard GHL Version header
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title,
        content: content,
        blogId: blogId,
        locationId: locationId,
        authorId: authorId,
        status: status || 'draft'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `GHL HTTP error! status: ${response.status}`);
    }

    return res.json({
      success: true,
      source: 'live_ghl',
      postId: data.id || data.postId,
      url: data.url || `https://services.leadconnectorhq.com/blogs/posts/${data.id}`,
      message: 'Article successfully published to GoHighLevel!'
    });

  } catch (error) {
    console.error('[GHL API] Publish failed:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to publish to GoHighLevel API. Please check your credentials and token scope.'
    });
  }
});

// 4. Request Google Indexing API Submission
app.post('/api/index-url', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const auth = getGoogleAuth();

  if (auth) {
    try {
      console.log(`[Indexing API] Submitting URL: ${url}`);
      // Initialize the Indexing API client
      const indexing = google.indexing({ version: 'v3', auth: auth });

      const response = await indexing.urlNotifications.publish({
        requestBody: {
          url: url,
          type: 'URL_UPDATED' // URL_UPDATED triggers crawl, URL_DELETED requests removal
        }
      });

      console.log('[Indexing API] Response data:', response.data);
      return res.json({
        success: true,
        source: 'live_indexing',
        message: 'URL submitted to Google Indexing API successfully!',
        data: response.data
      });
    } catch (error) {
      console.error('[Indexing API] Live submission failed. Falling back to Mock indexer. Error:', error.message);
    }
  }

  // Fallback / Mock indexing response
  console.log(`[Mock Indexer] Indexing requested for: ${url}`);
  return res.json({
    success: true,
    source: 'mock_indexing',
    message: 'Submission simulated! Setup Google Indexing credentials (JSON key) in Settings to index live.',
    url: url,
    timestamp: new Date().toISOString()
  });
});

// Start the Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SEO Buddy - Total Rank System Dashboard is running!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
