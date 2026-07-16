# SEO Buddy - Total Rank System Dashboard

SEO Buddy is a premium, automated SEO content pipeline and GSC gap analysis dashboard built for **Best Day Fitness** in St. Petersburg, Florida. 

It replicates the **Total Rank System** framework to identify high-impression keywords with zero clicks (SEO leaks), generate structural, highly-authoritative SEO content using Gemini AI, deploy to GoHighLevel (GHL), and trigger instant crawling through Google's Indexing API.

---

## Features

1. **GSC Content Gap Finder:** Auto-identifies SEO "leaks" by looking at search queries with high impressions but zero clicks.
2. **AI Article Creator:** Writes structured, rich HTML pages complete with H1-H3 outlines, joint/mobility step-by-step guides, comparison tables, customized case studies, dynamic CTAs, internal links, and FAQs.
3. **GoHighLevel CMS Integration:** Publishes directly to the GoHighLevel Blogs module using Location APIs.
4. **Copy-to-Clipboard Fail-Safe:** Clean HTML and Text export buttons allow manual copying and pasting directly into GoHighLevel's visual website/funnel editor.
5. **Instant Indexing:** Submits published URLs directly to Google's Indexing API for same-day search crawler scanning.
6. **Obsidian Dark Aesthetic:** Beautiful, glassmorphic UI styled in a responsive dark layout.

---

## Quick Start (Mock Mode)

To test-drive the application immediately without configuring API keys:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm start
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
   The dashboard will automatically boot in **Mock Mode**, preloaded with GSC senior fitness search queries (e.g. `senior fitness st petersburg fl`, `mobility training st pete`) and simulated AI generation.

---

## Live Configuration

To activate live API connections, rename `.env` and fill out your credentials, or save them directly inside the **Settings** tab in the dashboard.

### 1. Generative AI (Gemini)
1. Get a free API Key from [Google AI Studio](https://aistudio.google.com/).
2. Set `GEMINI_API_KEY=your_key` in `.env`.

### 2. Google Search Console & Indexing API
1. Create a service account in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Search Console API** and the **Web Search Indexing API** for your project.
3. Download the service account JSON key file, rename it to `google-creations.json`, and place it in the root folder of this project.
4. Delegate access to your service account email inside Google Search Console (Settings -> Users and Permissions -> Add User as Owner or Full permission).
5. Set `GSC_SITE_URL=https://bestdayfitness.com` in `.env`.

### 3. GoHighLevel Publishing
1. Go to your GoHighLevel account.
2. Find your **Location ID** under `Settings -> Business Profile`.
3. Create a **Private Integration** under `Settings -> Integrations` or GHL Developer Marketplace to generate an Access Token with `blogs.readonly` and `blogs.write` scopes.
4. Set the fields in `.env` or in the dashboard **Settings** panel:
   - `GHL_LOCATION_ID`
   - `GHL_ACCESS_TOKEN`
   - `GHL_BLOG_ID`

---

## The 5-Step Total Rank System

1. **Find Gaps:** Query Search Console for keywords that show impressions but zero clicks (leaks).
2. **Fill leaks:** Write high-quality, step-by-step articles with embedded case studies and CTAs using the Gemini AI writing model.
3. **Multiply:** Repurpose the articles into script prompts for videos/podcasts.
4. **Index:** Request Google to crawl the page immediately using the Indexing API.
5. **Rank:** Capture multiple listings on Google's search result pages and inside Google AI Overviews.
