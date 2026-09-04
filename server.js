const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const { google } = require('googleapis');
const { GoogleGenAI } = require('@google/genai');
const { saveJsonFileSync, setJsonWriteObserver, writeJsonFileSync } = require('./lib/json-file-store');
const {
  clamp: hClamp,
  scorePillars,
} = require('./lib/health-score');
const { createScoreHistory } = require('./lib/score-history');
const { createScoreHistoryRepository } = require('./lib/score-history-repository');
const { createPublicationHistoryRepository } = require('./lib/publication-history-repository');
const { createPerformanceHistory } = require('./lib/performance-history');
const { createPerformanceHistoryRepository } = require('./lib/performance-history-repository');
const { integrationUnavailable, mocksAllowed, resolveAppMode } = require('./lib/runtime-mode');
const { createLogger } = require('./lib/logger');
const { createRequestMetrics } = require('./lib/request-metrics');
const { buildBrowserAssets, renderAssetIndex } = require('./lib/browser-assets');
const { createAccessControl } = require('./lib/access-control');
const { createAuditLog } = require('./lib/audit-log');
const { createFileStateRepository } = require('./lib/state-repository');
const { createBackupService } = require('./lib/backup-service');
const { createPostgresStore } = require('./lib/postgres-store');
const { createPostgresStateBridge } = require('./lib/postgres-state-bridge');
const { createDurableJobQueue } = require('./lib/durable-job-queue');
const { createSwitchableJobQueue } = require('./lib/job-queue');
const { createPostgresJobQueue } = require('./lib/postgres-job-queue');
const { createJobWorker } = require('./lib/job-worker');
const { createJobDispatcher } = require('./lib/job-dispatcher');
const { buildAutomationStatus, registerAutomationStatusRoute } = require('./lib/automation-status');
const { ProviderRuntimeError, createProviderRuntime } = require('./lib/provider-runtime');
const { assessArticleQuality } = require('./lib/content-quality');
const { registerOperationsRoutes } = require('./lib/operations-routes');
const { registerProfileRoutes } = require('./lib/profile-routes');
const { registerUsageRoutes } = require('./lib/usage-routes');
const { createUsageMeter } = require('./lib/usage-meter');
const { createUsageRepository } = require('./lib/usage-repository');
const { registerGscRoutes } = require('./lib/gsc-routes');
const { registerAutopilotRoutes } = require('./lib/autopilot-routes');
const { createContentScheduler } = require('./lib/content-scheduler');
const { recordGbpPublication, gbpPublicationStatus } = require('./lib/gbp-publication');
const { registerContentRoutes } = require('./lib/content-routes');
const { registerAiVisibilityRoutes } = require('./lib/ai-visibility-routes');
const { registerAiAuditRoutes } = require('./lib/ai-audit-routes');
const { registerScheduledFeatureRoutes } = require('./lib/scheduled-feature-routes');
const { createGoogleDelivery } = require('./lib/google-delivery');
const { registerDeliveryRoutes } = require('./lib/delivery-routes');
const { createMonthlyReportService, registerMonthlyReportRoutes } = require('./lib/monthly-report');
const { createServerPdfReport } = require('./lib/server-pdf-report');
const { registerCitationRoutes } = require('./lib/citation-routes');
const { competitorDomains, isCompetitorDomain, eligibleCitationState, buildCitationWorklist } = require('./lib/citation-eligibility');
const { buildCanonicalNap, mapNapListings, registerLocalSeoRoutes } = require('./lib/local-seo-routes');
const { effectiveNap, registerLocalListingRoutes } = require('./lib/local-listing-preferences');
const { createPerformanceService, registerPerformanceRoutes } = require('./lib/performance-routes');
const { registerOnsiteRoutes } = require('./lib/onsite-routes');
const { registerAioCoreRoutes } = require('./lib/aio-core-routes');
const { registerAssistantRoutes } = require('./lib/assistant-routes');
const { registerRecordedContentRoutes } = require('./lib/recorded-content-routes');
const { buildDeployReadiness, buildNextMoves, registerDashboardRoutes } = require('./lib/dashboard-routes');
const { createReviewsService, registerReviewsRoutes } = require('./lib/reviews-routes');
const { registerConfigurationRoutes } = require('./lib/configuration-routes');

// Load UI-saved secrets from the durable storage root. Tenant state is isolated
// below this root after configuration is loaded; host-provided variables still
// win unless a user explicitly saves a replacement through Settings.
const CONFIG_DIR = process.env.DATA_DIR || __dirname;
dotenv.config({ path: path.join(CONFIG_DIR, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const APP_MODE = resolveAppMode(process.env);
const STATE_BACKEND_MODE = String(process.env.STATE_BACKEND || 'filesystem').trim().toLowerCase();
if (!['filesystem', 'postgres'].includes(STATE_BACKEND_MODE)) throw new Error('STATE_BACKEND must be filesystem or postgres.');
if (STATE_BACKEND_MODE === 'postgres' && !process.env.DATABASE_URL) throw new Error('STATE_BACKEND=postgres requires DATABASE_URL.');
const ALLOW_MOCK_INTEGRATIONS = mocksAllowed(APP_MODE, process.env);
const BOOTED_AT = new Date().toISOString();
const logger = createLogger({ service: 'seo-buddy', environment: APP_MODE });
const requestMetrics = createRequestMetrics();
const AI_PROVIDER_NAMES = new Set(['gemini', 'openai', 'perplexity']);
const providerRuntime = createProviderRuntime({
  logger,
  guard: async provider => {
    if (AI_PROVIDER_NAMES.has(provider) && usageOverBudget()) {
      throw new ProviderRuntimeError(`Monthly AI budget of $${usageMeter.budgetUSD} has been reached.`, {
        code: 'PROVIDER_BUDGET_EXCEEDED', provider, retryable: false,
      });
    }
  },
  policies: {
    gemini: { concurrency: 2, maxCallsPerWindow: 50, timeoutMs: 60000 },
    openai: { concurrency: 2, maxCallsPerWindow: 30, timeoutMs: 45000 },
    perplexity: { concurrency: 2, maxCallsPerWindow: 30, timeoutMs: 45000 },
    gohighlevel: { concurrency: 3, maxCallsPerWindow: 60, timeoutMs: 30000 },
    'search-console': { concurrency: 3, maxCallsPerWindow: 60, timeoutMs: 30000 },
    'google-indexing': { concurrency: 2, maxCallsPerWindow: 30, timeoutMs: 30000 },
    trustpilot: { concurrency: 2, maxCallsPerWindow: 60, timeoutMs: 20000 },
  },
});
let isShuttingDown = false;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BROWSER_ASSETS = buildBrowserAssets(PUBLIC_DIR, [
  { token: 'STYLE_ASSET', file: 'style.css' },
  { token: 'THEME_ASSET', file: 'modules/theme.js' },
  { token: 'CORE_ASSET', file: 'modules/core.js' },
  { token: 'APP_ASSET', file: 'app.js' },
  { token: 'ASSISTANT_ASSET', file: 'modules/assistant.js' },
  { token: 'REVIEWS_ASSET', file: 'modules/reviews.js' },
  { token: 'RECORDED_CONTENT_ASSET', file: 'modules/recorded-content.js' },
  { token: 'PDF_REPORT_ASSET', file: 'modules/pdf-report.js' },
  { token: 'CITATION_ASSET', file: 'modules/citations.js' },
  { token: 'LOCAL_PRESENCE_ASSET', file: 'modules/local-presence.js' },
  { token: 'PERFORMANCE_ASSET', file: 'modules/performance.js' },
  { token: 'SITE_OPTIMIZATION_ASSET', file: 'modules/site-optimization.js' },
  { token: 'AI_VISIBILITY_ASSET', file: 'modules/ai-visibility.js' },
  { token: 'BRAND_PROFILE_ASSET', file: 'modules/brand-profile.js' },
  { token: 'OWNER_MODE_ASSET', file: 'modules/owner-mode.js' },
  { token: 'OWNER_VIEWS_ASSET', file: 'modules/owner-views.js' },
  { token: 'SEARCH_OPPORTUNITIES_ASSET', file: 'modules/search-opportunities.js' },
  { token: 'SETTINGS_ASSET', file: 'modules/settings.js' },
  { token: 'CONTENT_WORKSPACE_ASSET', file: 'modules/content-workspace.js' },
  { token: 'WORKSPACE_ASSET', file: 'modules/workspace.js' },
]);
const INDEX_HTML = renderAssetIndex(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8'), BROWSER_ASSETS);

function integrationErrorStatus(error) {
  return error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
}

// ----------------------------------------------------
// Core Configuration
// ----------------------------------------------------
// Gemini model is now env-configurable. Default to the current stable Flash
// model. NOTE: the previous hardcoded 'gemini-3.5-flash' is not a valid model
// ID, so every live generation silently failed and fell back to mock output.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

async function geminiGenerate(request, options = {}) {
  if (!process.env.GEMINI_API_KEY) {
    throw integrationUnavailable('gemini', 'Gemini is not configured. Add GEMINI_API_KEY before running AI features.');
  }
  const response = await providerRuntime.run('gemini', async () => {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai.models.generateContent(request);
  }, { policy: { retries: 0, timeoutMs: options.timeoutMs || 60000 } });
  const grounded = Array.isArray(request?.config?.tools) && request.config.tools.some(tool => tool && tool.googleSearch);
  meterUsage(options.usageKind || (grounded ? 'grounded' : 'gemini'));
  return response;
}

async function searchConsoleQuery(client, request) {
  return providerRuntime.run('search-console', () => client.searchanalytics.query(request), {
    policy: { retries: 1, timeoutMs: 30000 },
  });
}

async function publishIndexNotification(client, request) {
  return providerRuntime.run('google-indexing', () => client.urlNotifications.publish(request), {
    policy: { retries: 0, timeoutMs: 30000 },
  });
}

// State is isolated by tenant below the durable storage root. On first boot the
// repository copies legacy root-level files into the tenant boundary, verifies
// checksums, and leaves the originals untouched for rollback.
const stateRepository = createFileStateRepository({
  storageRoot: CONFIG_DIR,
  tenantId: process.env.TENANT_ID || 'best-day-fitness',
});
const DATA_DIR = stateRepository.directory;
// Without DATA_DIR the files sit on the container filesystem, which the host
// replaces on every deploy. Anything the owner confirms through the UI is then
// true until the next deploy and false afterwards, so endpoints that record an
// owner decision say which of the two they just did.
const STORAGE_IS_PERSISTENT = !!process.env.DATA_DIR;
const backupService = createBackupService({ repository: stateRepository, backupRoot: path.join(CONFIG_DIR, 'backups') });
const durableJobQueue = createSwitchableJobQueue(
  createDurableJobQueue({ filePath: stateRepository.pathFor('jobs.json') }),
  'filesystem',
);
const jobHandlers = new Map();
const JOB_WORKER_ID = `${process.env.RAILWAY_REPLICA_ID || 'local'}:${process.pid}`;
const jobWorker = createJobWorker({
  queue: durableJobQueue,
  handlers: jobHandlers,
  logger,
  workerId: JOB_WORKER_ID,
  isShuttingDown: () => isShuttingDown,
});

const jobDispatcher = createJobDispatcher({ queue: durableJobQueue, worker: jobWorker, logger });
const { key: durableJobKey, enqueue: enqueueDurableJob, scheduleCheck: scheduleDurableCheck } = jobDispatcher;
let postgresMirror = null;
let postgresStateBridge = null;
const postgresStatus = {
  configured: Boolean(process.env.DATABASE_URL),
  mode: STATE_BACKEND_MODE,
  ready: false,
  lastSyncAt: null,
  syncedFiles: 0,
  pendingWrites: 0,
  error: null,
};

async function syncPostgresMirror() {
  if (!postgresMirror) return;
  try {
    postgresStatus.syncedFiles = await postgresMirror.syncFrom(stateRepository);
    postgresStatus.lastSyncAt = new Date().toISOString();
    postgresStatus.pendingWrites = postgresStateBridge?.status().pendingWrites || 0;
    postgresStatus.ready = true;
    postgresStatus.error = null;
  } catch (error) {
    postgresStatus.ready = false;
    postgresStatus.error = error.code || error.message;
    logger.error('storage.postgres_sync_failed', { tenantId: stateRepository.tenantId, error });
  }
}

async function initializePostgresMirror() {
  if (!process.env.DATABASE_URL) return;
  postgresMirror = createPostgresStore({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL !== 'disable' });
  const migrations = await postgresMirror.migrate(path.join(__dirname, 'migrations'));
  if (STATE_BACKEND_MODE === 'postgres') {
    durableJobQueue.setBackend(createPostgresJobQueue({ pool: postgresMirror.pool, tenantId: stateRepository.tenantId }), 'postgres');
  }
  postgresStateBridge = createPostgresStateBridge({ repository: stateRepository, store: postgresMirror, logger });
  setJsonWriteObserver(postgresStateBridge.capture);
  await syncPostgresMirror();
  await postgresStateBridge.flush();
  postgresStatus.pendingWrites = postgresStateBridge.status().pendingWrites;
  logger.info('storage.postgres_ready', { tenantId: stateRepository.tenantId, migrations, syncedFiles: postgresStatus.syncedFiles });
  const timer = setInterval(syncPostgresMirror, 5 * 60 * 1000);
  timer.unref?.();
}

// Optional admin password. When set, it locks down the sensitive endpoints
// (settings, publishing, indexing, autopilot, and any Gemini-spend routes).
// Leave unset only for trusted local development.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || '';
const accessControl = createAccessControl({ ownerToken: ADMIN_PASSWORD, operatorToken: OPERATOR_PASSWORD });
const requireAuth = accessControl.requireRole('operator');
const requireOwner = accessControl.requireRole('owner');
const auditLog = createAuditLog({
  filePath: stateRepository.pathFor('audit-log.jsonl'),
  signingKey: process.env.AUDIT_SIGNING_KEY || '',
});

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

// ===========================================================================
// BRAND PROFILE  —  the single source of truth for every AI feature
// ---------------------------------------------------------------------------
// Before this existed, eight separate one-sentence brand blurbs were hand-copied
// through this file. They drifted, none of them carried the real voice guidance,
// and changing the brand meant editing eight strings and redeploying.
//
// Seeded from the owner's own brand docs (brand-context.md and the Brand Voice
// guide). Editable in Settings, persisted to DATA_DIR, and rendered into every
// prompt by brandPrompt(). Change it once, every feature follows.
//
// NOTE ON THE PHONE: brand-context.md and the site homepage both carry
// (727) 677-9770, but the owner confirmed (727) 334-1472 is canonical. The
// seed below uses the canonical number deliberately — do not "correct" it back.
// ===========================================================================

const BRAND_FILE = path.join(DATA_DIR, 'brand-profile.json');

const BRAND_DEFAULT = {
  name: 'Best Day Fitness',
  tagline: 'Move Better. Feel Stronger. Live Longer.',
  supportingLine: 'Personal Training, Physical Therapy, Massage, and Wellness — All under one roof. All working together.',
  audienceDescription: 'Designed for adults 50+, seniors, and anyone recovering from injury who wants to stay active, independent, and strong.',
  philosophy: 'Energy = Mobility + Posture + Strength. When mobility improves, posture improves. When posture improves, strength improves. When all three improve, energy comes back.',
  tone: "Science-backed, credible, warm. Peter Attia's depth and evidence-based authority, delivered with the warmth of a trusted advisor who knows your name.",
  voiceTraits: [
    'Confident but not cocky — share expertise without bragging',
    'Educational but not academic — make complex health topics accessible',
    'Caring but not soft — genuine concern without patronizing',
    'Direct but not salesy — state facts and let people decide',
    'Intentional but not rigid — purposeful, adaptable to the person',
  ],
  writingStyle: [
    'Use "we" for Best Day Fitness as a team; use "I" when Christopher shares a personal insight or story',
    'Speak TO the audience, not AT them',
    'Lead with empathy, follow with evidence',
    'Short sentences for impact. Longer ones for explanation.',
    'Never talk down to seniors or use infantilizing language',
    'Treat aging as a natural process to optimize, not a disease to fight',
  ],
  usePhrases: [
    'Move better. Feel stronger. Live longer.',
    'Intentional movement',
    'Smart, supervised training',
    'The whole person, not just one problem',
    'Your body is adaptable — at any age',
    'Understanding your body first',
    'Progress, not perfection',
    'A clear, personalized path forward',
    'Not intense — intentional',
    'Results that go beyond the gym',
  ],
  // Scanned for in generated copy, not merely requested in the prompt.
  neverUse: [
    'anti-aging', 'elderly', 'quick fix', 'shred', 'tone up', 'no excuses',
    'push through the pain', 'no pain no gain', 'crush it', 'beast mode',
    'transform your body', 'beach body', 'melt fat', 'bikini body',
  ],
  values: ['Human-Centered', 'Collaborative', 'Intentional', 'Progressive'],
  services: [
    'Personal Training — private & semi-private (up to 8), trainer-led, scaled to each body and history',
    'Physical Therapy — integrated with training, for injury recovery, post-surgical rehab, chronic pain, balance concerns',
    'Massage Therapy — medical, deep tissue, recovery-focused; part of the plan, not just relaxation',
    'Wellness & Coaching — fall prevention, lifestyle habits, nutrition guidance, long-term strategy',
  ],
  differentiators: [
    'Integrated approach — training, PT, massage and wellness under one roof, all communicating',
    'Not a regular gym — no open gym, no assembly lines, no one-size-fits-all',
    'Whole person care — no conflicting advice, no bouncing between locations',
    'Trust-based — listening before prescribing, assessing before training',
    'Longevity focus — building for decades, not 6-week transformations',
    '3D body scanning for precision assessment',
  ],
  audiencePainPoints: [
    'You want to reduce pain, not ignore it',
    'You care more about mobility, balance, posture and strength than quick fixes',
    'You want to stay active with your kids, grandkids or hobbies',
    "You've tried gyms, PT clinics or massage places — and felt like something was missing",
  ],
  notPositioning: ['a big-box gym', 'a CrossFit box', 'a standalone PT clinic', 'a spa or relaxation massage place', 'a weight loss center'],
  localKeywords: [
    'Older adult fitness St. Petersburg', 'Senior personal training Tampa Bay',
    'Physical therapy St. Pete', 'Longevity fitness Florida', '50+ fitness St. Petersburg',
    'Fall prevention training Tampa Bay', 'Post-rehab fitness St. Pete',
    'Senior wellness St. Petersburg FL', 'Massage therapy St. Pete FL',
  ],
  ctaPrimaryLabel: 'Book a Consultation',
  ctaPrimaryUrl: 'https://bestdayfitness.com/consult',
};

let brandDb = JSON.parse(JSON.stringify(BRAND_DEFAULT));
let brandReviewedAt = null;
try {
  const loaded = JSON.parse(fs.readFileSync(BRAND_FILE, 'utf8'));
  if (loaded && typeof loaded === 'object') {
    const { _reviewedAt, ...loadedBrand } = loaded;
    brandDb = { ...BRAND_DEFAULT, ...loadedBrand };
    // Older profile files predate the explicit review marker. Such a file could
    // only be created by Save or Reset, so preserve that completed owner action
    // when upgrading instead of showing "Not reviewed yet" again.
    brandReviewedAt = Object.prototype.hasOwnProperty.call(loaded, '_reviewedAt')
      ? (typeof _reviewedAt === 'string' && _reviewedAt ? _reviewedAt : null)
      : fs.statSync(BRAND_FILE).mtime.toISOString();
  }
} catch (e) { /* first run — defaults stand */ }

// Returns whether the write actually reached disk. The caller reports that to
// the owner: a confirmation that cannot be stored is a warning that comes back
// after the next redeploy, and silently pretending otherwise is how a fixed
// badge looks broken.
function saveBrand() {
  return saveJsonFileSync(BRAND_FILE, { ...brandDb, _reviewedAt: brandReviewedAt }, 'Brand');
}

const bList = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);

// Rendered into every AI prompt. `full` carries the whole guide for long-form
// work; the short form keeps token cost sane on small generations like a
// review reply, where the voice rules matter but the service list does not.
function brandPrompt(full) {
  const b = brandDb;
  const lines = [
    `${b.name} — ${b.audienceDescription}`,
    b.tagline ? `Tagline: "${b.tagline}"` : '',
    b.philosophy ? `Philosophy: ${b.philosophy}` : '',
    b.tone ? `TONE: ${b.tone}` : '',
    bList(b.voiceTraits).length ? `VOICE:\n- ${bList(b.voiceTraits).join('\n- ')}` : '',
    bList(b.writingStyle).length ? `STYLE:\n- ${bList(b.writingStyle).join('\n- ')}` : '',
    bList(b.usePhrases).length ? `PHRASES THAT ARE OURS (use naturally, do not force):\n- ${bList(b.usePhrases).join('\n- ')}` : '',
    bList(b.neverUse).length ? `NEVER USE THESE WORDS OR PHRASES — this is a hard rule and the copy is checked for them afterwards:\n${bList(b.neverUse).map(w => `"${w}"`).join(', ')}` : '',
  ];
  if (full) {
    lines.push(
      bList(b.services).length ? `SERVICES:\n- ${bList(b.services).join('\n- ')}` : '',
      bList(b.differentiators).length ? `WHAT MAKES US DIFFERENT:\n- ${bList(b.differentiators).join('\n- ')}` : '',
      bList(b.audiencePainPoints).length ? `WHAT THE READER IS FEELING:\n- ${bList(b.audiencePainPoints).join('\n- ')}` : '',
      bList(b.notPositioning).length ? `WE ARE NOT: ${bList(b.notPositioning).join(', ')}. Never imply otherwise.` : '',
    );
  }
  return lines.filter(Boolean).join('\n');
}

// Models routinely ignore negative instructions, so the never-use list is
// enforced after generation as well as requested before it. Word-boundary
// matched so "shred" does not fire on "shredded lettuce" inside a longer word.
function brandViolations(text) {
  const t = String(text || '');
  if (!t) return [];
  const hits = [];
  for (const phrase of bList(brandDb.neverUse)) {
    const esc = String(phrase).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!esc) continue;
    const re = new RegExp(`\\b${esc.replace(/\s+/g, '\\s+')}\\b`, 'i');
    const m = t.match(re);
    if (m) hits.push({ phrase, found: m[0] });
  }
  return hits;
}



// ----------------------------------------------------
// Editable, LOCATION-STAMPED business profile (franchise seed).
// A saved profile overrides the hardcoded defaults above, so business
// identity is configurable per location instead of baked into code.
// Loading merges saved identity INTO the BUSINESS object, so every existing
// BUSINESS.xxx reference automatically uses the saved values — no refactor.
// ----------------------------------------------------
const BUSINESS_PROFILE_FILE = path.join(DATA_DIR, 'business-profile.json');
let businessProfileSaved = false;
let businessLocationId = 'loc-bestday-stpete';
let businessWebsite = 'https://bestdayfitness.com';
(function loadBusinessProfile() {
  try {
    if (fs.existsSync(BUSINESS_PROFILE_FILE)) {
      const s = JSON.parse(fs.readFileSync(BUSINESS_PROFILE_FILE, 'utf8'));
      if (s.locationId) businessLocationId = s.locationId;
      if (s.website) businessWebsite = s.website;
      const map = { name: 'name', phone: 'telephone', streetAddress: 'streetAddress', addressLocality: 'addressLocality', addressRegion: 'addressRegion', postalCode: 'postalCode' };
      Object.keys(map).forEach(k => { if (s[k]) BUSINESS[map[k]] = s[k]; });
      if (Array.isArray(s.socials)) BUSINESS.sameAs = s.socials;
      businessProfileSaved = true;
    }
  } catch (e) { console.error('[Business Profile] load failed:', e.message); }
})();
function businessProfile() {
  return {
    locationId: businessLocationId,
    configured: businessProfileSaved,
    name: BUSINESS.name,
    phone: BUSINESS.telephone,
    streetAddress: BUSINESS.streetAddress,
    addressLocality: BUSINESS.addressLocality,
    addressRegion: BUSINESS.addressRegion,
    postalCode: BUSINESS.postalCode,
    website: businessWebsite,
    socials: BUSINESS.sameAs || []
  };
}
function saveBusinessProfileFromBody(b) {
  const set = (k, v) => { if (typeof v === 'string' && v.trim()) BUSINESS[k] = v.trim(); };
  set('name', b.name); set('telephone', b.phone); set('streetAddress', b.streetAddress);
  set('addressLocality', b.addressLocality); set('addressRegion', b.addressRegion); set('postalCode', b.postalCode);
  if (typeof b.website === 'string' && b.website.trim()) businessWebsite = b.website.trim();
  if (Array.isArray(b.socials)) BUSINESS.sameAs = b.socials.filter(s => typeof s === 'string' && s.trim());
  if (typeof b.locationId === 'string' && b.locationId.trim()) businessLocationId = b.locationId.trim();
  businessProfileSaved = true;
  writeJsonFileSync(BUSINESS_PROFILE_FILE, businessProfile());
}

// CORS: default to same-origin only (the dashboard is served from this same
// server, so no cross-origin headers are needed). Set ALLOWED_ORIGIN to a
// comma-separated allowlist only if you must call the API from another origin.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
if (ALLOWED_ORIGIN) {
  app.use(cors({ origin: ALLOWED_ORIGIN.split(',').map(s => s.trim()) }));
}

// Baseline browser hardening without adding another runtime dependency. API
// responses may contain business history and configuration state, so prevent
// intermediary/browser caches from retaining them.
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (APP_MODE === 'production') contentSecurityPolicy.push('upgrade-insecure-requests');
  res.setHeader('Content-Security-Policy', contentSecurityPolicy.join('; '));
  if (req.path.startsWith('/api/') || req.path.startsWith('/health/')) res.setHeader('Cache-Control', 'no-store');
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Give every request a stable correlation ID and retain bounded, low-cardinality
// process metrics. No URLs, query strings, credentials, or request bodies are
// retained in the metrics snapshot.
app.use((req, res, next) => {
  const incomingId = String(req.get('x-request-id') || '');
  const requestId = /^[A-Za-z0-9._:-]{8,128}$/.test(incomingId) ? incomingId : crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestMetrics.started(req.method);
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    requestMetrics.finished(res.statusCode, durationMs);
    if (!req.path.startsWith('/health/') || res.statusCode >= 400) {
      logger.info('http.request', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    }
  });
  next();
});

// Compress HTML, JavaScript, CSS, and JSON over the wire. The dashboard ships
// sizeable hand-authored assets, so this removes most transfer bytes without a
// build step or extra copies in memory.
app.use(compression({ threshold: 1024 }));

function storageReadiness() {
  try {
    fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    const databaseRequired = STATE_BACKEND_MODE === 'postgres';
    const databaseReady = !databaseRequired || postgresStatus.ready;
    return {
      ok: databaseReady,
      persistent: databaseRequired ? postgresStatus.ready : STORAGE_IS_PERSISTENT,
      backend: STATE_BACKEND_MODE,
      ...(databaseReady ? {} : { error: postgresStatus.error || 'POSTGRES_NOT_READY' }),
    };
  } catch (error) {
    return { ok: false, persistent: false, backend: STATE_BACKEND_MODE, error: error.code || 'STORAGE_UNAVAILABLE' };
  }
}

// Kubernetes-, Railway-, and load-balancer-friendly lifecycle probes. Liveness
// is deliberately cheap; readiness verifies only conditions required to serve
// safely and does not take the app offline for an optional provider outage.
app.get('/health/live', (req, res) => {
  res.status(isShuttingDown ? 503 : 200).json({
    status: isShuttingDown ? 'shutting_down' : 'live',
    uptimeSeconds: Math.floor(process.uptime()),
    bootedAt: BOOTED_AT,
  });
});

app.get('/health/ready', (req, res) => {
  const storage = storageReadiness();
  const checks = {
    acceptingTraffic: !isShuttingDown,
    storage,
    runtime: { ok: true, mode: APP_MODE, mockIntegrationsAllowed: ALLOW_MOCK_INTEGRATIONS },
  };
  const ready = checks.acceptingTraffic && storage.ok;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

// Recording uploads need far more than the default 100kb. Mounted path-first so
// every other endpoint keeps the small limit.
// Mounted path-first so the global limit below still protects every other route.
app.use('/api/transcribe', bodyParser.json({ limit: '34mb' }));
app.use(bodyParser.json());

// Record every state-changing API request after the response finishes. Audit
// entries deliberately exclude query strings, headers, and bodies so secrets
// and generated content never enter the log.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.once('finish', () => {
    try {
      auditLog.record({
        requestId: req.requestId,
        actorId: req.auth?.actorId,
        role: req.auth?.role,
        action: `${req.method} ${req.path}`,
        statusCode: res.statusCode,
      });
    } catch (error) {
      logger.error('audit.write_failed', { requestId: req.requestId, error });
    }
  });
  next();
});

// The HTML is rendered with content-hashed asset URLs at process start. A new
// deployment therefore gets new URLs while unchanged assets remain safely
// cacheable for a year; browsers can no longer mix old JS with new server code.
for (const asset of BROWSER_ASSETS) {
  app.get(asset.url, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(asset.filePath);
  });
}
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(INDEX_HTML);
});

app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // HTML must revalidate so a deployment can point at the newest un-hashed
    // assets. Other static files can be reused briefly and revalidated in the
    // background, cutting repeat-visit bandwidth without long-lived staleness.
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    }
  },
}));

// Profile routes live below the body parser on purpose — registered above it,
// req.body is undefined and every save fails with a confusing 400.
registerProfileRoutes(app, {
  requireOwner,
  brandDefaults: BRAND_DEFAULT,
  brandState: {
    get profile() { return brandDb; },
    set profile(value) { brandDb = value; },
    get reviewedAt() { return brandReviewedAt; },
    set reviewedAt(value) { brandReviewedAt = value; },
  },
  saveBrand,
  storageReadiness,
  businessProfile,
  saveBusinessProfile: saveBusinessProfileFromBody,
});

// ----------------------------------------------------
// Auth middleware — protects sensitive/credential/spend endpoints.
// If ADMIN_PASSWORD is not set, endpoints stay open (local dev) but the server
// logs a loud startup warning. Provide the password from the client as either
// an "Authorization: Bearer <password>" header or an "x-admin-token" header.
// ----------------------------------------------------
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
  console.log(ALLOW_MOCK_INTEGRATIONS
    ? '[Gemini SDK] No GEMINI_API_KEY found. Demo generation is available outside production.'
    : '[Gemini SDK] No GEMINI_API_KEY found. Live generation is unavailable; production will not fabricate output.');
}

providerRuntime.setConfigured('gemini', () => Boolean(process.env.GEMINI_API_KEY));
providerRuntime.setConfigured('openai', () => Boolean(process.env.OPENAI_API_KEY));
providerRuntime.setConfigured('perplexity', () => Boolean(process.env.PERPLEXITY_API_KEY));
providerRuntime.setConfigured('gohighlevel', () => Boolean(process.env.GHL_ACCESS_TOKEN && process.env.GHL_LOCATION_ID));
providerRuntime.setConfigured('search-console', () => Boolean(process.env.GSC_SITE_URL && getGoogleAuth()));
providerRuntime.setConfigured('google-indexing', () => Boolean(getGoogleAuth()));
providerRuntime.setConfigured('gmail', () => Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN));
providerRuntime.setConfigured('google-business-profile', () => Boolean(process.env.GBP_REFRESH_TOKEN && process.env.GBP_ACCOUNT_ID && process.env.GBP_LOCATION_ID));
providerRuntime.setConfigured('reviews-site', true);
providerRuntime.setConfigured('web-audit', true);
providerRuntime.setConfigured('trustpilot', () => Boolean(process.env.TRUSTPILOT_API_KEY && process.env.TRUSTPILOT_DOMAIN));

registerOperationsRoutes(app, {
  requireAuth,
  requireOwner,
  getRuntime: () => ({
    mode: APP_MODE,
    mockIntegrationsAllowed: ALLOW_MOCK_INTEGRATIONS,
    nodeVersion: process.version,
    bootedAt: BOOTED_AT,
    uptimeSeconds: Math.floor(process.uptime()),
    shuttingDown: isShuttingDown,
  }),
  storageReadiness,
  requestMetrics,
  accessControl,
  auditLog,
  stateRepository,
  getPostgresStatus: () => postgresStatus,
  providerRuntime,
  getBudget: () => ({
    limitUSD: usageMeter.budgetUSD,
    usedUSD: currentUsage().estCostUSD,
    reached: usageOverBudget(),
  }),
  backupService,
  durableJobQueue,
  isJobWorkerRunning: () => jobWorker.status().running,
});

// ----------------------------------------------------
// Persistent JSON Database Configuration
// ----------------------------------------------------
const LOGS_FILE = path.join(DATA_DIR, 'autopilot-logs.json');

const historyRepository = createPublicationHistoryRepository(stateRepository);
const historyDb = historyRepository.load();
let autopilotLogs = [];

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
  writeJsonFileSync(LOGS_FILE, autopilotLogs);
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
  writeJsonFileSync(AIO_AUDITS_FILE, aioAuditsDb);
}

// ============================================================
// Multi-engine AI Visibility store (Phase 1). Tracks brand visibility
// across several answer engines over time, plus a competitor leaderboard.
// Shape: { prompts:[str], snapshots:[snapshot], updatedAt }
//   snapshot = { date, engines:[str], visibilityScore, shareOfVoice,
//     sentimentScore, brandMentions, totalAnswers, perEngine:[{engine,score}],
//     leaderboard:[{name,isBrand,mentions,score}], answers:[{engine,prompt,recommended,sentiment,competitors,snippet}] }
const AI_VIS_FILE = path.join(DATA_DIR, 'ai-visibility.json');
const DEFAULT_VIS_PROMPTS = [
  'best senior fitness in St. Petersburg FL',
  'personal trainer for adults over 50 in St. Petersburg',
  'senior gym St. Petersburg Florida',
  'best fitness studio for injury recovery in St. Petersburg',
  'balance and mobility training for older adults St. Petersburg'
];
let aiVisDb = { prompts: DEFAULT_VIS_PROMPTS.slice(), snapshots: [], updatedAt: null, autoEnabled: true, intervalDays: 7, lastRun: null };
if (fs.existsSync(AI_VIS_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(AI_VIS_FILE, 'utf8'));
    if (loaded && typeof loaded === 'object') {
      aiVisDb = {
        prompts: Array.isArray(loaded.prompts) && loaded.prompts.length ? loaded.prompts : DEFAULT_VIS_PROMPTS.slice(),
        snapshots: Array.isArray(loaded.snapshots) ? loaded.snapshots : [],
        updatedAt: loaded.updatedAt || null,
        autoEnabled: !!loaded.autoEnabled,
        intervalDays: loaded.intervalDays || 7,
        lastRun: loaded.lastRun || null
      };
    }
  } catch (e) { /* keep defaults */ }
} else {
  try { writeJsonFileSync(AI_VIS_FILE, aiVisDb); } catch (e) {}
}
let aiVisRunning = false;   // guards against overlapping manual + scheduled runs
function saveAiVis() {
  saveJsonFileSync(AI_VIS_FILE, aiVisDb, 'AI Visibility');
}

// Helper to log Autopilot activity
function logAutopilotActivity(message) {
  const timestamp = new Date().toISOString();
  autopilotLogs.unshift({ timestamp, message });
  if (autopilotLogs.length > 100) autopilotLogs.pop(); // Cap at 100 logs
  saveJsonFileSync(LOGS_FILE, autopilotLogs, 'Logs File');
  console.log(`[Autopilot Agent] ${message}`);
}

// Helper to save history
function saveHistory() {
  historyRepository.save(historyDb);
}

// One-time repair (idempotent, runs every boot): older builds stored blog URLs
// with a hard-coded "/blog/posts" prefix that does NOT resolve on GoHighLevel-
// hosted sites — those posts live at "/post/<slug>". A stale URL silently
// redirects visitors to the homepage AND is the URL we hand to Google's Indexing
// API, so the article never gets indexed. Rewrite any stale stored URLs to the
// currently-configured prefix and flag them so they can be re-submitted.
function migrateStalePostUrls() {
  let prefix = (process.env.GHL_BLOG_PATH_PREFIX || '/post').trim();
  if (!prefix.startsWith('/')) prefix = '/' + prefix;
  prefix = prefix.replace(/\/+$/, '');
  const OLD = '/blog/posts';
  if (prefix === OLD) return; // still configured to the old path — nothing to do
  let changed = 0;
  historyDb.forEach(h => {
    if (h && typeof h.url === 'string' && h.url.includes(OLD + '/')) {
      h.url = h.url.replace(OLD + '/', prefix + '/');
      h.needsReindex = true;
      changed++;
    }
  });
  if (changed) {
    saveHistory();
    console.log(`[URL Migration] Rewrote ${changed} stale blog URL(s): ${OLD}/ -> ${prefix}/`);
  }
}
migrateStalePostUrls();

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
// Service-account JSON almost never arrives clean. It gets copied through a
// document, an email or a chat window on its way to a hosting dashboard, and
// those all silently curl the quotes: "type" becomes “type”, and JSON.parse
// dies at position 4 — the exact character where the first property name of a
// downloaded key file begins.
//
// Strict parse first, always. The repair is a fallback, it only runs when the
// strict parse has already failed, and its result is only accepted if it
// yields a usable key. Verified against a fully-curled key: it parses and the
// private_key comes back byte-identical.
// A redacted fingerprint of a credential's opening bytes.
//
// Every Google service-account key opens with the same boilerplate — `{`,
// newline, two spaces, `"type"` — so the SHAPE of those bytes is not secret.
// The value might not be a key at all, though, so every letter and digit is
// masked to `x` before this is ever logged. Only structural punctuation and
// unexpected code points survive, which is precisely what we need to see: a
// paste that has been through a word processor shows up here as U+201C where
// a straight quote belongs.
function credentialShape(raw, len = 24) {
  return Array.from(String(raw == null ? '' : raw).slice(0, len)).map(ch => {
    const cp = ch.codePointAt(0);
    if (/[A-Za-z0-9]/.test(ch)) return 'x';
    if (ch === ' ') return '_';
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    if (cp < 0x20 || cp > 0x7E) return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    return ch;
  }).join(' ');
}

// Ordered, cumulative repairs. Each is named so the diagnostic can tell the
// owner what was wrong with their paste rather than just that it failed, and
// each is narrow enough to be safe on a key that did not need it.
const SA_JSON_REPAIRS = [
  ['a byte-order mark', s => s.replace(/^﻿/, '')],
  ['invisible zero-width characters', s => s.replace(/[​-‍⁠﻿]/g, '')],
  ['non-breaking spaces', s => s.replace(/[   -   　]/g, ' ')],
  ['quotes curled by a word processor', s => s.replace(/[“”„‟″‶«»＂]/g, '"')],
  // Only when there is not a single straight double quote left to lose: this is
  // the "retyped it by hand in a smart editor" case, not a key with an
  // apostrophe somewhere inside it.
  ['single quotes where JSON needs double', s => /"/.test(s) ? s : s.replace(/['‘’ʼ`]/g, '"')],
  // Unquoted property names, as a JavaScript object literal would have. Anchored
  // to a brace or comma so it cannot reach inside an already-quoted value.
  ['unquoted property names', s => s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')],
  ['a trailing comma', s => s.replace(/,(\s*[}\]])/g, '$1')]
];

// A repair is only trusted if it yields something that is actually a usable
// service-account key. The PEM check is the real safety net: no mangling
// survives it, so a repair that "succeeds" into nonsense is still rejected.
function looksLikeServiceAccount(creds) {
  return !!(creds
    && typeof creds === 'object'
    && creds.client_email
    && typeof creds.private_key === 'string'
    && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(creds.private_key)
    && /-----END [A-Z ]*PRIVATE KEY-----/.test(creds.private_key));
}

function parseServiceAccountJson(raw) {
  const text = String(raw == null ? '' : raw);
  try {
    const creds = JSON.parse(text);
    // Readable JSON is not the same as a usable key. Without this, a wrong-file
    // paste sails through here and fails much later inside Google's client with
    // an error that names none of this.
    if (!creds || typeof creds !== 'object' || !creds.client_email || !creds.private_key) {
      return {
        creds: null, repaired: false, repairs: [],
        error: 'This is valid JSON but not a service-account key — it has no '
          + [!(creds && creds.client_email) && 'client_email', !(creds && creds.private_key) && 'private_key']
              .filter(Boolean).join(' or ')
          + '. Download the key again from Google Cloud -> IAM -> Service accounts -> Keys.',
        shape: credentialShape(text)
      };
    }
    return { creds, repaired: false, repairs: [] };
  } catch (strictErr) {
    let working = text;
    const applied = [];
    for (const [name, fix] of SA_JSON_REPAIRS) {
      const next = fix(working);
      if (next === working) continue;
      working = next;
      applied.push(name);
      let creds;
      try { creds = JSON.parse(working); } catch (e) { continue; }
      if (looksLikeServiceAccount(creds)) {
        return { creds, repaired: true, repairs: applied.slice() };
      }
      // Parsed but is not a key — a later repair will not rescue that.
      return {
        creds: null, repaired: false, repairs: applied.slice(),
        error: 'The JSON was readable but is not a service-account key (no client_email, or private_key is not a PEM block).',
        shape: credentialShape(text)
      };
    }
    return {
      creds: null, repaired: false, repairs: applied,
      error: strictErr.message,
      shape: credentialShape(text)
    };
  }
}

function getGoogleAuth() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return null;

  try {
    // Check if it's a raw JSON string (used for cloud deployments to avoid committing keyfiles)
    if (credentialsPath.trim().startsWith('{')) {
      const parsed = parseServiceAccountJson(credentialsPath);
      if (!parsed.creds) {
        // The shape is a redacted fingerprint - letters and digits masked - so
        // this line names the offending character without ever printing key
        // material. Guessing at the corruption cost us a day; now it says.
        console.error('[Google Auth] Failed to load credentials:', parsed.error);
        console.error('[Google Auth] Credential starts:', parsed.shape || credentialShape(credentialsPath));
        if (parsed.repairs && parsed.repairs.length) {
          console.error('[Google Auth] Repairs attempted, still unreadable:', parsed.repairs.join(', '));
        }
        return null;
      }
      if (parsed.repaired) {
        console.warn('[Google Auth] Credentials JSON needed repair (' + (parsed.repairs || []).join(', ') + '); loaded anyway. Re-paste from a plain text editor to silence this.');
      }
      const keys = parsed.creds;
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

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function safeHttpUrl(value, fallback = '') {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.toString() : fallback;
  } catch (e) { return fallback; }
}

// The article editor intentionally accepts useful formatting, but scripts,
// event handlers and active embedded content never belong in a blog post.
function sanitizeArticleHtml(value) {
  const safeActiveAttribute = (match, name, quote, quotedValue, bareValue) => {
    const raw = String(quotedValue == null ? bareValue : quotedValue);
    const decoded = raw
      .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&colon;/gi, ':')
      .replace(/[\u0000-\u0020]+/g, '')
      .toLowerCase();
    if (/^(?:javascript|vbscript|data):/.test(decoded)) return '';
    return quotedValue == null ? ` ${name}=${bareValue}` : ` ${name}=${quote}${quotedValue}${quote}`;
  };
  return String(value || '')
    .replace(/<(script|iframe|object|embed|form|style|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|form|style|svg|math)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|action|formaction)\s*=\s*(["'])([\s\S]*?)\2/gi, safeActiveAttribute)
    .replace(/\s(href|src|action|formaction)\s*=\s*([^\s>]+)/gi, (match, name, bareValue) => safeActiveAttribute(match, name, '', null, bareValue))
    .replace(/\sstyle\s*=\s*(["'])[^"']*(?:expression\s*\(|url\s*\(|@import|javascript:)[^"']*\1/gi, '');
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

// 1. Generation Helper
// `transcript` is optional. When present it is the owner speaking in their own
// words — the one input a competitor cannot copy and the strongest source of
// information gain we have. It changes where the article's substance comes from
// (the model stops inventing and starts reporting) but NOT its structure: every
// AEO rule below still applies. Keyword-only calls behave exactly as before.
async function generateArticleHelper(keyword, caseStudy, ctaText, ctaUrl, transcript) {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const _now = new Date();
  const freshDate = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
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

  const prompt = `${brandPrompt(true)}\n\nWrite a high-quality, professional article targeting the keyword: "${keyword}", optimized for BOTH traditional Google ranking AND Answer Engine Optimization (AEO) — so ChatGPT, Perplexity, and Google's AI Overviews can extract and cite it.${sourceBlock}
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
   "${caseStudy || "At Best Day Fitness, our trainer-led programs have helped seniors regain functional mobility, reduce pain, and get their active lifestyles back."}"
11. Integrate a Call to Action (CTA) banner/section highlighting this link:
   <a href="${ctaUrl || "#"}" class="article-cta-btn">${ctaText || "Schedule a Consultation"}</a>
12. Add 2-3 internal link placeholders (formatted as [Link: Page Name], e.g. [Link: Personal Training for Seniors]).
13. End with an FAQ section: 3-4 real questions people ask, each with a clear, direct answer in the first sentence (ideal for Google's People Also Ask and AI extraction).
14. Write as an expert trainer/wellness coach — authoritative, specific, current. Avoid generic AI fluff and outdated references.${spoken ? `
15. VOICE: keep the speaker's own phrasing and first-person perspective where it reads well. Vary sentence length. Their anecdotes are the most valuable thing in this article — give them room rather than compressing them into a single line.
16. After the closing </div>, append one HTML comment listing every factual claim, number, date or client result in the article that a human must verify before publishing, in the exact form:
<!--CLAIMS: first claim | second claim | third claim-->` : ''}

Return the HTML directly. Do not include markdown block markers like \`\`\`html.`;

  let generationError = null;
  if (ai) {
    try {
      const response = await geminiGenerate({
        model: GEMINI_MODEL,
        contents: prompt,
      }, { usageKind: 'article' });

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

      // Pull the claims list out of the trailing comment and strip it from the
      // body, so the editor shows a clean article and the claims surface as a
      // checklist instead. Generated copy has invented a wrong phone number
      // before now — this is the guard against publishing the next one.
      let claimsToCheck = [];
      const claimsMatch = htmlContent.match(/<!--\s*CLAIMS:([\s\S]*?)-->/i);
      if (claimsMatch) {
        claimsToCheck = claimsMatch[1].split('|').map(c => c.trim()).filter(Boolean);
        htmlContent = htmlContent.replace(claimsMatch[0], '').trim();
      }
      htmlContent = sanitizeArticleHtml(htmlContent);
      const violations = brandViolations(htmlContent + ' ' + title);
      const quality = assessArticleQuality(htmlContent, { claimsToCheck, brandViolations: violations });

      return {
        success: true,
        source: 'live_gemini',
        title,
        slug,
        content: htmlContent,
        fromTranscript: !!spoken,
        claimsToCheck,
        // The never-use list is requested in the prompt AND checked here. Models
        // drop negative instructions routinely; trusting the prompt alone would
        // let "transform your body" reach a published page.
        brandViolations: violations,
        quality,
      };
    } catch (err) {
      console.error('[Service Helper] Gemini generation failed:', err.message);
      generationError = err;
    }
  }

  if (!ALLOW_MOCK_INTEGRATIONS) {
    throw integrationUnavailable(
      'gemini',
      generationError
        ? `Gemini could not generate the article: ${generationError.message}`
        : 'Gemini is not configured. Add a valid GEMINI_API_KEY before generating production content.',
      generationError
    );
  }

  // Explicit development/demo fallback. Production exits above and never
  // presents fabricated copy as a successful AI generation.
  const safeKeyword = escapeHtml(keyword);
  const safeCaseStudy = escapeHtml(caseStudy || 'We helped a local client recover balance and core stability, eliminating their fear of falling.');
  const safeCtaText = escapeHtml(ctaText || 'Claim Free Consultation');
  const safeCtaUrl = escapeHtml(safeHttpUrl(ctaUrl, '#'));
  const title = `The Ultimate Guide to ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} | Best Day Fitness`;
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

  const mockViolations = brandViolations(mockHtml + ' ' + title);
  return {
    success: true,
    source: 'mock_generator',
    title,
    slug,
    content: mockHtml,
    // Keep the response shape identical to the live path so the front-end
    // never has to branch on which one produced the article.
    fromTranscript: !!spoken,
    claimsToCheck: [],
    brandViolations: mockViolations,
    quality: assessArticleQuality(mockHtml, { brandViolations: mockViolations }),
  };
}

// 2. GoHighLevel Publishing Helper
async function publishGhlHelper(title, content, status, config = {}) {
  const locationId = config.locationId || process.env.GHL_LOCATION_ID;
  const accessToken = config.accessToken || process.env.GHL_ACCESS_TOKEN;
  const blogId = config.blogId || process.env.GHL_BLOG_ID;
  const author = config.authorId || process.env.GHL_AUTHOR_ID || 'default-author';
  const siteUrl = config.siteUrl || process.env.GSC_SITE_URL || 'https://bestdayfitness.com';
  const blogPrefix = config.blogPrefix || process.env.GHL_BLOG_PATH_PREFIX || '/post';
  const authorName = config.authorName || process.env.GHL_AUTHOR_NAME || '';
  const authorUrl = config.authorUrl || process.env.GHL_AUTHOR_URL || '';

  let baseDomain = String(siteUrl || '').trim();
  if (baseDomain.startsWith('sc-domain:')) {
    baseDomain = 'https://' + baseDomain.substring(10);
  }
  baseDomain = (safeHttpUrl(baseDomain, 'https://bestdayfitness.com') || 'https://bestdayfitness.com').replace(/\/$/, '');
  
  const cleanPrefix = blogPrefix.startsWith('/') ? blogPrefix : `/${blogPrefix}`;
  const formattedPrefix = cleanPrefix.endsWith('/') ? cleanPrefix.slice(0, -1) : cleanPrefix;

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // 1. Resolve Internal Links
  let resolvedContent = sanitizeArticleHtml(content);
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
      return `<a href="${escapeHtml(safeHttpUrl(matchedPost.url, `${baseDomain}${formattedPrefix}`))}" class="internal-link" style="color: #1a73e8; text-decoration: underline;">${escapeHtml(p1.trim())}</a>`;
    }
    return `<a href="${escapeHtml(baseDomain + formattedPrefix)}" class="internal-link" style="color: #1a73e8; text-decoration: underline;">${escapeHtml(p1.trim())}</a>`;
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
    schemaScripts += `\n<script type="application/ld+json">\n${jsonForHtml(faqSchema)}\n</script>`;
  }

  // 3. Build LocalBusiness Schema (shared builder — real NAP)
  const localBusinessSchema = buildLocalBusinessSchema(baseDomain);
  schemaScripts += `\n<script type="application/ld+json">\n${jsonForHtml(localBusinessSchema)}\n</script>`;

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
    schemaScripts += `\n<script type="application/ld+json">\n${jsonForHtml(authorSchema)}\n</script>`;

    // Add E-E-A-T trust bio block
    let authorHtml = `\n<div class="article-author-card" style="margin-top: 40px; padding: 20px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.01); border-radius: 8px; display: flex; align-items: center; gap: 15px;">`;
    authorHtml += `<div class="author-info">`;
    authorHtml += `<span style="font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Published By Expert Coach</span>`;
    if (authorUrl) {
      authorHtml += `<a href="${escapeHtml(safeHttpUrl(authorUrl, baseDomain))}" target="_blank" rel="noopener noreferrer" style="font-size: 16px; font-weight: bold; color: #1a73e8; text-decoration: none;">${escapeHtml(authorName)}</a>`;
    } else {
      authorHtml += `<strong style="font-size: 16px; font-weight: bold; color: #fff;">${escapeHtml(authorName)}</strong>`;
    }
    authorHtml += `<p style="font-size: 13px; color: #aaa; margin: 6px 0 0 0; line-height: 1.4;">Certified longevity, mobility, and functional movement specialist at Best Day Fitness.</p>`;
    authorHtml += `</div></div>`;
    resolvedContent += authorHtml;
  }

  // Reviews backlink — every published article links to the brand's reviews hub
  // so Google discovers/indexes it (and AI due-diligence can find it). This is
  // the "link to your reviews site from your own website" step. Configurable per
  // location via REVIEWS_URL; defaults to Best Day's reviews site.
  const reviewsUrl = safeHttpUrl(process.env.REVIEWS_URL || 'https://bestdayfitnessreviews.com');
  if (reviewsUrl) {
    resolvedContent += `\n<p style="margin-top: 28px; font-size: 15px;">Curious what our clients say? <a href="${escapeHtml(reviewsUrl)}" style="color: #1a73e8; text-decoration: underline;">Read ${escapeHtml(BUSINESS.name)} reviews</a>.</p>`;
  }

  // Append schemas
  resolvedContent += schemaScripts;

  if (!accessToken || !locationId || !blogId) {
    if (!ALLOW_MOCK_INTEGRATIONS) {
      throw integrationUnavailable(
        'gohighlevel',
        'GoHighLevel publishing is not fully configured. GHL_ACCESS_TOKEN, GHL_LOCATION_ID, and GHL_BLOG_ID are required.'
      );
    }
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

  const response = await providerRuntime.fetch('gohighlevel', 'https://services.leadconnectorhq.com/blogs/posts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, { retries: 0 });

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
    const response = await publishIndexNotification(indexing, {
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

  if (!ALLOW_MOCK_INTEGRATIONS) {
    throw integrationUnavailable(
      'google_indexing',
      'Google Indexing is not configured. Add valid service-account credentials before requesting production indexing.'
    );
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
let contentScheduler = null;
let autopilotEnabled = true;   // default ON so fresh franchise installs publish content hands-off
let autopilotIntervalHours = 24;
let nextRunTime = null;
let lastAutopilotRun = null;   // ISO timestamp of the last successful content cycle (for redeploy catch-up)
let autopilotQueue = []; // [{ topic, addedAt }] — covered before GSC gaps
// Proactive Target Keywords: core money terms the autopilot pursues on rotation
// EVEN WHEN they generate no GSC impressions yet. The leak strategy only
// reinforces terms you already rank for; targets let you deliberately break into
// the searches you want to win. Seeded per-location (franchise-general).
let autopilotTargets = []; // [string]
let autopilotTargetIndex = 0; // rotation cursor

// Durable autopilot config (cadence + enabled + topic queue) so the schedule
// and queue survive redeploys. The scheduler itself is restored at startup.
const AUTOPILOT_CONFIG_FILE = path.join(DATA_DIR, 'autopilot-config.json');
function saveAutopilotConfig() {
  return saveJsonFileSync(AUTOPILOT_CONFIG_FILE, { enabled: autopilotEnabled, intervalHours: autopilotIntervalHours, nextRunTime, queue: autopilotQueue, targets: autopilotTargets, targetIndex: autopilotTargetIndex, lastRun: lastAutopilotRun }, 'Autopilot Config');
}
// Build sensible default target terms from the business location + niche so a
// fresh franchise install pursues its own "[service] [city]" money terms.
function defaultAutopilotTargets() {
  const city = (BUSINESS.addressLocality || '').trim();
  if (!city) return [];
  return [
    `senior fitness ${city}`,
    `fitness for adults over 50 ${city}`,
    `balance and mobility training for seniors ${city}`,
    `personal trainer for seniors ${city}`,
    `best gym for seniors ${city}`
  ];
}
try {
  if (fs.existsSync(AUTOPILOT_CONFIG_FILE)) {
    const cfg = JSON.parse(fs.readFileSync(AUTOPILOT_CONFIG_FILE, 'utf8'));
    if (typeof cfg.enabled === 'boolean') autopilotEnabled = cfg.enabled;
    if (cfg.intervalHours) autopilotIntervalHours = parseFloat(cfg.intervalHours);
    if (Array.isArray(cfg.queue)) autopilotQueue = cfg.queue;
    if (Array.isArray(cfg.targets)) autopilotTargets = cfg.targets.filter(t => typeof t === 'string' && t.trim());
    if (Number.isInteger(cfg.targetIndex)) autopilotTargetIndex = cfg.targetIndex;
    if (cfg.lastRun) lastAutopilotRun = cfg.lastRun;
    if (Number.isFinite(Date.parse(cfg.nextRunTime))) nextRunTime = cfg.nextRunTime;
  }
} catch (e) { console.error('[Autopilot Config] load failed:', e.message); }
// Seed defaults on first run (empty targets) so the autopilot proactively
// pursues the location's core terms without waiting for manual setup.
if (!autopilotTargets.length) {
  autopilotTargets = defaultAutopilotTargets();
  if (autopilotTargets.length) { try { saveAutopilotConfig(); } catch (e) {} }
}

// Case study text mapping for Autopilot
const AUTOPILOT_CASE_STUDIES = {
  'senior fitness st petersburg fl': "Our client Margaret (71) suffered from severe knee stiffness that prevented her from walking. Within 12 weeks of our trainer-led posture and barefoot balance mat exercises, she eliminated knee pain and walks 3 miles daily.",
  'mobility training st pete': "We worked with Arthur (64) to resolve shoulder tightness. By combining manual massage therapy with customized range-of-motion routines, he returned to playing tennis within 6 weeks.",
  'longevity fitness coach st petersburg': "David (82) joined Best Day Fitness to maintain his daily functional freedom. Focused exercises built foot stability and core strength, letting him comfortably carry his own groceries.",
  'posture correction exercises senior': "Elena (69) improved her posture profile by 30% and eliminated lower back pain within 2 months through tailored core posture training and chest mobility patterns."
};

async function runAutopilotCycle() {
  logAutopilotActivity('Looking for searches you appear in but get no clicks from...');
  
  // Get keywords
  let keywords = ALLOW_MOCK_INTEGRATIONS ? MOCK_GSC_DATA : [];
  const auth = getGoogleAuth();
  const siteUrl = process.env.GSC_SITE_URL;

  if (auth && siteUrl) {
    try {
      const webmasters = google.webmasters({ version: 'v3', auth: auth });
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await searchConsoleQuery(webmasters, {
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
      logAutopilotActivity(ALLOW_MOCK_INTEGRATIONS
        ? `GSC API fetch failed; development demo searches will be used. Error: ${err.message}`
        : `GSC API fetch failed; no fabricated search opportunities will be used. Error: ${err.message}`);
    }
  } else if (!ALLOW_MOCK_INTEGRATIONS) {
    logAutopilotActivity('Search Console is not configured; continuing only with owner-queued or proactive target topics.');
  }

  // Pick the target, in priority order:
  //   1) queued topics (owner-specified)  2) proactive target keywords (core
  //   money terms, pursued even with 0 impressions)  3) an untargeted GSC leak.
  let query = null;
  let fromQueue = false, fromTarget = false;
  while (autopilotQueue.length && !query) {
    const cand = String(autopilotQueue[0].topic || '').trim();
    if (cand && !historyDb.some(h => h.keyword.toLowerCase() === cand.toLowerCase())) { query = cand; fromQueue = true; }
    else { autopilotQueue.shift(); saveAutopilotConfig(); } // drop blank or already-covered
  }

  // Proactive target keywords — rotate, skipping any already covered.
  if (!query && autopilotTargets.length) {
    for (let i = 0; i < autopilotTargets.length && !query; i++) {
      const idx = (autopilotTargetIndex + i) % autopilotTargets.length;
      const cand = String(autopilotTargets[idx] || '').trim();
      if (cand && !historyDb.some(h => h.keyword.toLowerCase() === cand.toLowerCase())) {
        query = cand; fromTarget = true;
        autopilotTargetIndex = (idx + 1) % autopilotTargets.length;
        saveAutopilotConfig();
      }
    }
  }

  if (!query) {
    const leakKeywords = keywords.filter(k => k.leak);
    const targetLeak = leakKeywords.find(k => !historyDb.some(h => h.keyword.toLowerCase() === k.query.toLowerCase()));
    if (!targetLeak) {
      logAutopilotActivity('Check complete. No queued topics, target keywords, or new content gaps left to cover.');
      return null;
    }
    query = targetLeak.query;
    logAutopilotActivity(`Targeting leak query: "${query}" (Impressions: ${targetLeak.impressions})`);
  } else if (fromQueue) {
    logAutopilotActivity(`Targeting queued topic: "${query}" (${autopilotQueue.length} in queue)`);
  } else if (fromTarget) {
    logAutopilotActivity(`Targeting core target keyword: "${query}"`);
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
    if (!article.quality?.publishable) {
      const reason = article.quality?.blockingIssues?.join(' ') || 'Generated article did not pass the content quality gate.';
      const qualityError = new Error(`Content quality gate stopped automatic publishing. ${reason}`);
      qualityError.code = 'CONTENT_QUALITY_FAILED';
      qualityError.retryable = false;
      throw qualityError;
    }

    // 2. Publish Content to GHL
    logAutopilotActivity('Publishing article to GoHighLevel...');
    const publish = await publishGhlHelper(article.title, article.content, 'published');

    // 3. Request Google Indexing — NON-FATAL. The article is already published;
    // an indexing permission error must not discard a successful publish or
    // report the whole run as failed.
    logAutopilotActivity(`Asking Google to list: ${publish.url}`);
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
      url: publish.url,
      qualityScore: article.quality.score,
      qualityVersion: article.quality.version,
    };

    historyDb.unshift(historyEntry);
    saveHistory();
    lastAutopilotRun = new Date().toISOString();
    saveAutopilotConfig();

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

function startAutopilotScheduler(options) {
  if (!contentScheduler) contentScheduler = createContentScheduler({
    state: {
      get enabled() { return autopilotEnabled; },
      get intervalHours() { return autopilotIntervalHours; },
      get lastRun() { return lastAutopilotRun; },
      get nextRunTime() { return nextRunTime; },
      set nextRunTime(value) { nextRunTime = value; },
    },
    save: saveAutopilotConfig, enqueue: enqueueDurableJob,
  });
  contentScheduler.start(options);
  logAutopilotActivity(autopilotEnabled ? `Content schedule restored. Next check: ${nextRunTime}.` : 'Background Autopilot scheduler stopped.');
}

// ----------------------------------------------------
// Routes
// ----------------------------------------------------

registerConfigurationRoutes(app, {
  requireOwner,
  configDir: CONFIG_DIR,
  environment: process.env,
  parseServiceAccountJson,
  reloadEnvironment: settingsPath => dotenv.config({ path: settingsPath, override: true }),
  reinitializeGemini: apiKey => {
    try {
      ai = new GoogleGenAI({ apiKey });
      console.log('[Gemini SDK] Re-initialized successfully.');
    } catch (error) {
      console.error('[Gemini SDK] Re-initialization failed:', error.message);
    }
  },
  clearCaches: () => {
    getGscDashboardData.clear();
    computePerformance.clear();
    providerRuntime.clearCache();
  },
  getStorageStatus: () => {
    const storage = storageReadiness();
    return {
      persistent: storage.persistent,
      backend: STATE_BACKEND_MODE,
      tenantId: stateRepository.tenantId,
      postgresMirror: { ...postgresStatus },
    };
  },
  logger: console,
});

// Search Console stays behind one service boundary so query construction,
// caching, diagnostics, and live-vs-mock behavior cannot drift across routes.
const gscService = registerGscRoutes(app, {
  requireAuth,
  getGoogleAuth,
  getSiteUrl: () => process.env.GSC_SITE_URL,
  getRawCredentials: () => process.env.GOOGLE_APPLICATION_CREDENTIALS,
  createWebmasters: auth => google.webmasters({ version: 'v3', auth }),
  searchConsoleQuery,
  parseServiceAccountJson,
  credentialShape,
  integrationUnavailable,
  allowMockIntegrations: ALLOW_MOCK_INTEGRATIONS,
  mockData: MOCK_GSC_DATA,
  baseDir: __dirname,
  logger: console,
});
const getGscDashboardData = gscService.getDashboardData;

// Manual article delivery shares one boundary for validation, quality,
// history persistence, and Search Console property containment.
registerContentRoutes(app, {
  requireAuth,
  state: { get history() { return historyDb; } },
  generateArticle: generateArticleHelper,
  publishGhl: publishGhlHelper,
  indexUrl: indexUrlHelper,
  safeHttpUrl,
  sanitizeArticleHtml,
  assessArticleQuality,
  brandViolations,
  usageOverBudget,
  budgetBlock,
  integrationErrorStatus,
  explainIndexError,
  saveHistory,
  getSearchConsoleProperty: () => process.env.GSC_SITE_URL,
});

// Autopilot HTTP contracts use an adapter over the existing scheduler state.
// This keeps behavior stable now and creates a seam for transactional state later.
const autopilotRouteState = {
  get enabled() { return autopilotEnabled; },
  set enabled(value) { autopilotEnabled = value; },
  get intervalHours() { return autopilotIntervalHours; },
  set intervalHours(value) { autopilotIntervalHours = value; },
  get nextRunTime() { return nextRunTime; },
  get queue() { return autopilotQueue; },
  get targets() { return autopilotTargets; },
  get targetIndex() { return autopilotTargetIndex; },
  set targetIndex(value) { autopilotTargetIndex = value; },
  get logs() { return autopilotLogs; },
};
registerAutopilotRoutes(app, {
  requireAuth,
  state: autopilotRouteState,
  startScheduler: startAutopilotScheduler,
  saveConfig: saveAutopilotConfig,
  runCycle: runAutopilotCycle,
  explainIndexError,
});

const aioCoreRouteState = {
  get history() { return aioAuditsDb; },
  set history(value) { aioAuditsDb = value; },
};
registerAioCoreRoutes(app, {
  requireAuth,
  hasGeminiKey: () => !!process.env.GEMINI_API_KEY,
  usageOverBudget,
  budgetBlock,
  business: BUSINESS,
  brandDomainRoot: 'bestdayfitness',
  geminiGenerate,
  model: GEMINI_MODEL,
  state: aioCoreRouteState,
  persistHistory: history => writeJsonFileSync(AIO_AUDITS_FILE, history),
  getSiteUrl: () => process.env.GSC_SITE_URL,
  buildLocalBusinessSchema,
  logger: console,
});

// ============================================================
// MULTI-ENGINE AI VISIBILITY (Phase 1)
// Runs the same brand-recommendation prompts across several answer engines,
// scores Visibility / Share of Voice / Sentiment, builds a competitor
// leaderboard, and snapshots it over time. Google works with the existing
// Gemini key; ChatGPT + Perplexity light up when their keys are added.
// ============================================================
const AI_ENGINES = [
  { id: 'google',     label: 'Google (Gemini)', env: 'GEMINI_API_KEY',     color: '#6366f1' },
  { id: 'openai',     label: 'ChatGPT',         env: 'OPENAI_API_KEY',     color: '#10b981' },
  { id: 'perplexity', label: 'Perplexity',      env: 'PERPLEXITY_API_KEY', color: '#06b6d4' }
];
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
function engineConfigured(id) {
  const e = AI_ENGINES.find(x => x.id === id);
  return !!(e && process.env[e.env]);
}
function enginesStatus() {
  return AI_ENGINES.map(e => ({ id: e.id, label: e.label, color: e.color, configured: engineConfigured(e.id) }));
}
const visBrandName = () => BUSINESS.name;                 // "Best Day Fitness"
const visBrandRoot = 'bestdayfitness';
function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function isBrandName(s) {
  const n = normName(s);
  return n.includes(normName(visBrandName())) || n.includes('bestdayfitness') || n.includes('best day fitness');
}

function visPrompt(query) {
  return `A person searching online asks: "${query}".
Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida. Name the actual businesses and briefly say why each is a good fit.`;
}

// --- Providers: each returns { ok, answer, sources:[{title,uri}], error } ---
async function askGoogleEngine(promptText) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, answer: '', sources: [], error: 'no key' };
  try {
    const r = await geminiGenerate({
      model: GEMINI_MODEL, contents: promptText, config: { tools: [{ googleSearch: {} }] }
    });
    const answer = (r.text || '').trim();
    const gm = (r.candidates && r.candidates[0] && r.candidates[0].groundingMetadata) || {};
    const sources = (gm.groundingChunks || []).map(c => ({ title: (c.web && c.web.title) || '', uri: (c.web && c.web.uri) || '' })).filter(s => s.title || s.uri);
    return { ok: true, answer, sources };
  } catch (e) { return { ok: false, answer: '', sources: [], error: e.message }; }
}
async function askOpenAiEngine(promptText) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, answer: '', sources: [], error: 'no key' };
  try {
    const resp = await providerRuntime.fetch('openai', 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: OPENAI_MODEL, messages: [{ role: 'user', content: promptText }], temperature: 0.3 }),
    }, { retries: 0 });
    const j = await resp.json();
    const answer = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    return { ok: true, answer, sources: [] };
  } catch (e) { return { ok: false, answer: '', sources: [], error: e.code === 'PROVIDER_TIMEOUT' ? 'timeout' : e.message }; }
}
async function askPerplexityEngine(promptText) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { ok: false, answer: '', sources: [], error: 'no key' };
  try {
    const resp = await providerRuntime.fetch('perplexity', 'https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: PERPLEXITY_MODEL, messages: [{ role: 'user', content: promptText }] }),
    }, { retries: 0 });
    const j = await resp.json();
    const answer = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    const sources = Array.isArray(j.citations) ? j.citations.map(u => ({ title: '', uri: u })) : [];
    return { ok: true, answer, sources };
  } catch (e) { return { ok: false, answer: '', sources: [], error: e.code === 'PROVIDER_TIMEOUT' ? 'timeout' : e.message }; }
}
async function askEngine(id, promptText) {
  if (id === 'google') return askGoogleEngine(promptText);
  if (id === 'openai') return askOpenAiEngine(promptText);
  if (id === 'perplexity') return askPerplexityEngine(promptText);
  return { ok: false, answer: '', sources: [], error: 'unknown engine' };
}

// --- Analyzer: use Gemini to read any engine's answer and extract, uniformly,
// whether the brand is recommended, the sentiment toward it, and competitor names. ---
async function analyzeVisAnswer(query, answerText, sources) {
  const brand = visBrandName();
  const hay = (answerText + ' ' + (sources || []).map(s => s.title + ' ' + s.uri).join(' ')).toLowerCase();
  const stringHit = hay.includes(brand.toLowerCase()) || hay.includes(visBrandRoot);
  const key = process.env.GEMINI_API_KEY;
  if (!key || !answerText) {
    return { recommended: stringHit, sentiment: stringHit ? 'neutral' : 'absent', competitors: [] };
  }
  try {
    const p = `An AI answer engine responded to the query "${query}" with:
"""
${answerText.slice(0, 4000)}
"""
The brand we care about is "${brand}". Return ONLY raw JSON, no markdown:
{"mentioned": true or false (does the answer recommend or mention ${brand}?), "sentiment": "positive" | "neutral" | "negative" (tone toward ${brand}; use "neutral" if merely listed; ignore if not mentioned), "competitors": ["names of OTHER businesses the answer recommends or mentions, excluding ${brand}"]}`;
    const r = await geminiGenerate({ model: GEMINI_MODEL, contents: p });
    const parsed = parseGeminiJson(r.text) || {};
    const mentioned = typeof parsed.mentioned === 'boolean' ? parsed.mentioned : stringHit;
    let competitors = Array.isArray(parsed.competitors) ? parsed.competitors.filter(Boolean).filter(c => !isBrandName(c)) : [];
    // de-dupe by normalized name, keep display
    const seen = new Set(); competitors = competitors.filter(c => { const n = normName(c); if (!n || seen.has(n)) return false; seen.add(n); return true; });
    let sentiment = ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral';
    if (!mentioned) sentiment = 'absent';
    return { recommended: !!mentioned, sentiment, competitors };
  } catch (e) {
    return { recommended: stringHit, sentiment: stringHit ? 'neutral' : 'absent', competitors: [] };
  }
}

function sentimentToScore(s) { return s === 'positive' ? 100 : s === 'negative' ? 0 : 50; }

// Orchestrator: run every enabled engine × prompt, score, and snapshot.
async function runAiVisibility(engineIds) {
  const enabled = (engineIds && engineIds.length ? engineIds : AI_ENGINES.map(e => e.id)).filter(engineConfigured);
  if (!enabled.length) return { error: 'No AI engines are configured. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY).' };
  const prompts = (aiVisDb.prompts && aiVisDb.prompts.length ? aiVisDb.prompts : DEFAULT_VIS_PROMPTS).slice(0, 25);
  const brand = visBrandName();

  const answers = [];
  for (const engine of enabled) {
    for (const prompt of prompts) {
      const res = await askEngine(engine, visPrompt(prompt));
      if (!res.ok) { answers.push({ engine, prompt, recommended: false, sentiment: 'error', competitors: [], snippet: '', error: res.error || 'failed' }); continue; }
      if (engine !== 'google') meterUsage(engine);
      const analysis = await analyzeVisAnswer(prompt, res.answer, res.sources);
      answers.push({
        engine, prompt,
        recommended: analysis.recommended,
        sentiment: analysis.sentiment,
        competitors: analysis.competitors,
        snippet: res.answer.length > 320 ? res.answer.slice(0, 317) + '…' : res.answer,
        sources: (res.sources || []).slice(0, 6)
      });
    }
  }

  const scored = answers.filter(a => a.sentiment !== 'error');   // only answers we actually got
  const totalAnswers = scored.length;
  const brandMentions = scored.filter(a => a.recommended).length;
  const visibilityScore = totalAnswers ? Math.round(brandMentions / totalAnswers * 100) : 0;

  // Mention tally for share of voice + leaderboard (brand + competitors)
  const mentions = {};       // normalized -> { name, count, isBrand }
  const bump = (name, isBrand) => { const n = normName(name); if (!n) return; if (!mentions[n]) mentions[n] = { name: name, count: 0, isBrand: !!isBrand }; mentions[n].count++; };
  scored.forEach(a => { if (a.recommended) bump(brand, true); a.competitors.forEach(c => bump(c, false)); });
  const totalMentions = Object.values(mentions).reduce((s, m) => s + m.count, 0);
  const shareOfVoice = totalMentions ? Math.round(brandMentions / totalMentions * 100) : 0;

  const brandAnswers = scored.filter(a => a.recommended);
  const sentimentScore = brandAnswers.length ? Math.round(brandAnswers.reduce((s, a) => s + sentimentToScore(a.sentiment), 0) / brandAnswers.length) : null;

  const leaderboard = Object.values(mentions)
    .map(m => ({ name: m.name, isBrand: m.isBrand, mentions: m.count, score: totalAnswers ? Math.round(m.count / totalAnswers * 100) : 0 }))
    .sort((a, b) => b.mentions - a.mentions);
  // ensure brand present in leaderboard even at 0
  if (!leaderboard.some(l => l.isBrand)) leaderboard.push({ name: brand, isBrand: true, mentions: 0, score: 0 });

  const perEngine = enabled.map(engine => {
    const es = scored.filter(a => a.engine === engine);
    const em = es.filter(a => a.recommended).length;
    return { engine, label: (AI_ENGINES.find(e => e.id === engine) || {}).label || engine, score: es.length ? Math.round(em / es.length * 100) : 0, answers: es.length };
  });

  const today = new Date().toISOString().slice(0, 10);
  const snapshot = { date: today, ranAt: new Date().toISOString(), engines: enabled, prompts, visibilityScore, shareOfVoice, sentimentScore, brandMentions, totalAnswers, perEngine, leaderboard, answers };

  // replace same-day snapshot, else append; keep last 60
  const idx = aiVisDb.snapshots.findIndex(s => s.date === today);
  if (idx >= 0) aiVisDb.snapshots[idx] = snapshot; else aiVisDb.snapshots.push(snapshot);
  aiVisDb.snapshots = aiVisDb.snapshots.slice(-60);
  aiVisDb.updatedAt = snapshot.ranAt;
  aiVisDb.lastRun = snapshot.ranAt;
  saveAiVis();
  return { snapshot };
}

// Scheduled auto-run: fills the trend on a cadence without the user clicking.
async function maybeRunAiVisibility(force) {
  if (aiVisRunning) return;
  if (!force && !aiVisDb.autoEnabled) return;
  if (!AI_ENGINES.some(e => engineConfigured(e.id))) return;   // nothing to query
  if (!force && daysSince(aiVisDb.lastRun) < (aiVisDb.intervalDays || 7)) return;
  aiVisRunning = true;
  try { await runAiVisibility(null); }
  catch (e) { console.error('[AI Visibility Autopilot] auto-run failed:', e.message); }
  finally { aiVisRunning = false; }
}

// Build the trend series the dashboard chart needs: one line per brand
// (you + top competitors) across snapshots, plus your metric lines.
function visTrend() {
  const snaps = aiVisDb.snapshots.slice(-24);
  const brandKey = normName(visBrandName());
  // pick top competitors by latest leaderboard
  const latest = snaps[snaps.length - 1];
  const topNames = latest ? latest.leaderboard.slice(0, 6).map(l => l.name) : [visBrandName()];
  const series = topNames.map(name => {
    const nk = normName(name);
    return {
      name, isBrand: nk === brandKey,
      points: snaps.map(s => {
        const row = (s.leaderboard || []).find(l => normName(l.name) === nk);
        return { date: s.date, score: row ? row.score : 0 };
      })
    };
  });
  const metricLines = {
    visibility: snaps.map(s => ({ date: s.date, value: s.visibilityScore })),
    shareOfVoice: snaps.map(s => ({ date: s.date, value: s.shareOfVoice })),
    sentiment: snaps.map(s => ({ date: s.date, value: s.sentimentScore }))
  };
  return { series, metricLines, dates: snaps.map(s => s.date) };
}

// AI Visibility HTTP contracts use a state adapter so provider orchestration
// and persistence remain independently replaceable.
const aiVisibilityRouteState = {
  get prompts() { return aiVisDb.prompts; },
  set prompts(value) { aiVisDb.prompts = value; },
  get snapshots() { return aiVisDb.snapshots; },
  get updatedAt() { return aiVisDb.updatedAt; },
  get autoEnabled() { return aiVisDb.autoEnabled; },
  set autoEnabled(value) { aiVisDb.autoEnabled = value; },
  get intervalDays() { return aiVisDb.intervalDays; },
  get lastRun() { return aiVisDb.lastRun; },
  get running() { return aiVisRunning; },
  set running(value) { aiVisRunning = value; },
};
registerAiVisibilityRoutes(app, {
  requireAuth,
  state: aiVisibilityRouteState,
  nudgeSchedule: () => enqueueDurableJob('ai.visibility', {}, {
    idempotencyKey: durableJobKey('ai.visibility', 12 * 60 * 60 * 1000),
    maxAttempts: 5,
  }),
  brandName: visBrandName,
  enginesStatus,
  trend: visTrend,
  anyConfigured: () => AI_ENGINES.some(engine => engineConfigured(engine.id)),
  runVisibility: runAiVisibility,
  usageOverBudget,
  budgetBlock,
  save: saveAiVis,
  defaultPrompts: DEFAULT_VIS_PROMPTS,
  logger: console,
});

// Staggered startup catch-up + 12h heartbeat so the trend fills on schedule.
scheduleDurableCheck('ai.visibility', 90000, 12 * 60 * 60 * 1000);

// ============================================================
// P4a — FACTCHECK / BRAND-ACCURACY MONITOR
// Asks each engine what it "knows" about the business, then compares against
// the canonical business identity and flags inaccurate/outdated claims.
// ============================================================
const FACTCHECK_FILE = path.join(DATA_DIR, 'ai-factcheck.json');
let factCheckDb = { latest: null, updatedAt: null };
if (fs.existsSync(FACTCHECK_FILE)) {
  try { const l = JSON.parse(fs.readFileSync(FACTCHECK_FILE, 'utf8')); if (l && typeof l === 'object') factCheckDb = { latest: l.latest || null, updatedAt: l.updatedAt || null }; }
  catch (e) { /* keep default */ }
} else { try { writeJsonFileSync(FACTCHECK_FILE, factCheckDb); } catch (e) {} }
let factCheckRunning = false;
function saveFactCheck() { saveJsonFileSync(FACTCHECK_FILE, factCheckDb, 'FactCheck'); }

function factTruth() {
  const kit = (typeof listingKit === 'function') ? listingKit() : {};
  return {
    name: BUSINESS.name,
    city: BUSINESS.addressLocality || 'St. Petersburg',
    region: BUSINESS.addressRegion || 'FL',
    address: kit.addressOneLine || `${BUSINESS.streetAddress || ''}, ${BUSINESS.addressLocality || ''}, ${BUSINESS.addressRegion || ''} ${BUSINESS.postalCode || ''}`.trim(),
    phone: kit.phone || BUSINESS.telephone,
    website: kit.website || ('https://' + (typeof siteDomain === 'function' ? siteDomain() : 'bestdayfitness.com')),
    services: Array.isArray(kit.categories) && kit.categories.length ? kit.categories.join(', ') : 'senior fitness, personal training, physical therapy, wellness for adults 50+'
  };
}

async function analyzeFactAnswer(answerText, truth) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !answerText) return { issues: [], summary: key ? 'The engine gave no usable answer.' : 'Add a Gemini key to analyze answers.' };
  try {
    const p = `An AI assistant said the following about our business:
"""
${answerText.slice(0, 4000)}
"""
GROUND TRUTH about the business:
${JSON.stringify(truth)}

Compare the AI's factual claims to the ground truth. Focus on: location (city/state), street address, phone number, and business type/services. Ignore hedged or "I don't know" statements. Only list claims the AI actually asserted. Return ONLY raw JSON, no markdown:
{"issues":[{"field":"location|address|phone|services|name|other","aiClaim":"what the AI asserted (short)","correct":true or false,"truth":"the correct value","note":"short note"}],"summary":"one sentence on overall accuracy"}`;
    const r = await geminiGenerate({ model: GEMINI_MODEL, contents: p });
    const parsed = parseGeminiJson(r.text) || {};
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter(i => i && i.aiClaim).map(i => ({
      field: String(i.field || 'other'), aiClaim: String(i.aiClaim), correct: i.correct !== false, truth: String(i.truth || ''), note: String(i.note || '')
    })) : [];
    return { issues, summary: String(parsed.summary || '') };
  } catch (e) { return { issues: [], summary: 'Analysis failed: ' + e.message }; }
}

async function runFactCheck() {
  const enabled = AI_ENGINES.map(e => e.id).filter(engineConfigured);
  if (!enabled.length) return { error: 'No AI engines are configured. Add GEMINI_API_KEY (and optionally OPENAI_API_KEY / PERPLEXITY_API_KEY).' };
  const truth = factTruth();
  const q = `Tell me what you know about the business "${truth.name}" in ${truth.city}, ${truth.region}. Include: what city and state it is in, its street address if you know it, its phone number, and its main services or business type. Only state facts you are confident about; if you don't know a detail, say you don't know.`;
  const results = [];
  for (const engine of enabled) {
    const label = (AI_ENGINES.find(e => e.id === engine) || {}).label || engine;
    const res = await askEngine(engine, q);
    if (!res.ok) { results.push({ engine, label, error: res.error || 'failed', accuracy: null, wrong: 0, totalClaims: 0, issues: [], summary: '' }); continue; }
    if (engine !== 'google') meterUsage(engine);
    const analysis = await analyzeFactAnswer(res.answer, truth);
    const totalClaims = analysis.issues.length;
    const wrong = analysis.issues.filter(i => !i.correct).length;
    const accuracy = totalClaims ? Math.round((totalClaims - wrong) / totalClaims * 100) : null;
    results.push({ engine, label, accuracy, wrong, totalClaims, issues: analysis.issues, summary: analysis.summary, snippet: res.answer.length > 400 ? res.answer.slice(0, 397) + '…' : res.answer, sources: (res.sources || []).slice(0, 5) });
  }
  const totalWrong = results.reduce((s, r) => s + (r.wrong || 0), 0);
  const snapshot = { ranAt: new Date().toISOString(), truth, engines: enabled, results, totalWrong };
  factCheckDb.latest = snapshot; factCheckDb.updatedAt = snapshot.ranAt; saveFactCheck();
  return { snapshot };
}

// ============================================================
// P4b — AI CRAWLER ACCESS AUDIT
// AI crawlers are server-side bots (they don't run JS), and GHL doesn't expose
// server logs — so we can't count hits. What we CAN do (and what actually
// matters) is verify the site's robots.txt lets the AI bots read it at all.
// A blocked GPTBot = invisible to ChatGPT no matter how good the content is.
// ============================================================
const AI_CRAWLERS = [
  { ua: 'GPTBot', label: 'GPTBot', purpose: 'OpenAI — trains & feeds ChatGPT' },
  { ua: 'OAI-SearchBot', label: 'OAI-SearchBot', purpose: 'ChatGPT Search index' },
  { ua: 'ChatGPT-User', label: 'ChatGPT-User', purpose: 'ChatGPT live browsing' },
  { ua: 'PerplexityBot', label: 'PerplexityBot', purpose: 'Perplexity index' },
  { ua: 'ClaudeBot', label: 'ClaudeBot', purpose: 'Anthropic Claude' },
  { ua: 'Google-Extended', label: 'Google-Extended', purpose: 'Gemini / Google AI' },
  { ua: 'Applebot-Extended', label: 'Applebot-Extended', purpose: 'Apple Intelligence' },
  { ua: 'Amazonbot', label: 'Amazonbot', purpose: 'Amazon (Alexa / Rufus)' },
  { ua: 'meta-externalagent', label: 'Meta-ExternalAgent', purpose: 'Meta AI' },
  { ua: 'Bytespider', label: 'Bytespider', purpose: 'ByteDance / TikTok AI' },
  { ua: 'CCBot', label: 'CCBot', purpose: 'Common Crawl — feeds many LLMs' }
];
const AI_CRAWLERS_FILE = path.join(DATA_DIR, 'ai-crawlers.json');
let crawlersDb = { latest: null, updatedAt: null };
if (fs.existsSync(AI_CRAWLERS_FILE)) {
  try { const l = JSON.parse(fs.readFileSync(AI_CRAWLERS_FILE, 'utf8')); if (l && typeof l === 'object') crawlersDb = { latest: l.latest || null, updatedAt: l.updatedAt || null }; } catch (e) {}
} else { try { writeJsonFileSync(AI_CRAWLERS_FILE, crawlersDb); } catch (e) {} }
let crawlersRunning = false;
function saveCrawlers() { saveJsonFileSync(AI_CRAWLERS_FILE, crawlersDb, 'AI Crawlers'); }

function parseRobots(txt) {
  const groups = []; let cur = null;
  (txt || '').split(/\r?\n/).forEach(line => {
    const l = line.replace(/#.*$/, '').trim(); if (!l) return;
    const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) return;
    const field = m[1].toLowerCase(), val = m[2].trim();
    if (field === 'user-agent') { if (!cur || cur._started) { cur = { agents: [], allow: [], disallow: [], _started: false }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if (field === 'disallow' && cur) { cur._started = true; cur.disallow.push(val); }
    else if (field === 'allow' && cur) { cur._started = true; cur.allow.push(val); }
  });
  return groups;
}
function crawlerVerdict(groups, ua) {
  const lua = ua.toLowerCase();
  let g = groups.find(gr => gr.agents.some(a => a !== '*' && (a === lua || lua.includes(a) || a.includes(lua))));
  let matchedBy = g ? 'specific rule' : '';
  if (!g) { g = groups.find(gr => gr.agents.includes('*')); matchedBy = g ? 'the * (all bots) rule' : ''; }
  if (!g) return { status: 'allowed', reason: 'not restricted', matchedBy: 'no matching rule' };
  const blocksAll = g.disallow.includes('/');
  const allowsRoot = g.allow.includes('/');
  if (blocksAll && !allowsRoot) return { status: 'blocked', reason: 'Disallow: /', matchedBy };
  const somePaths = g.disallow.filter(d => d && d !== '/').length;
  return { status: 'allowed', reason: somePaths ? 'allowed (some paths blocked)' : 'allowed', matchedBy };
}
async function runCrawlerAudit() {
  const base = siteDomain();
  const url = base + '/robots.txt';
  let robotsText = '', hadRobots = false, status = 0, fetchError = '';
  try {
    const resp = await providerRuntime.fetch('web-audit', url, { headers: { 'User-Agent': 'SEO-Buddy-AI-Readiness/1.0' } }, {
      throwOnHttpError: false,
      retries: 1,
      policy: { timeoutMs: 15000 },
    });
    status = resp.status;
    if (resp.ok) { robotsText = await resp.text(); hadRobots = true; }
  } catch (e) { fetchError = e.code === 'PROVIDER_TIMEOUT' ? 'timeout' : e.message; }
  const groups = parseRobots(robotsText);
  const bots = AI_CRAWLERS.map(b => {
    const v = hadRobots ? crawlerVerdict(groups, b.ua) : { status: 'allowed', reason: 'no robots.txt found (site is open to all)', matchedBy: 'none' };
    return { ...b, ...v };
  });
  const blocked = bots.filter(b => b.status === 'blocked').length;
  const snapshot = { ranAt: new Date().toISOString(), site: base, robotsUrl: url, hadRobots, status, fetchError, blocked, total: bots.length, bots, robotsSnippet: robotsText.slice(0, 1500) };
  crawlersDb.latest = snapshot; crawlersDb.updatedAt = snapshot.ranAt; saveCrawlers();
  return { snapshot };
}
// ============================================================
// P4c — REDDIT VISIBILITY ENGINE
// AI answer engines cite Reddit heavily. This finds real, high-intent Reddit
// threads where the business can add genuine value (and get mentioned), with
// an authentic, non-spammy engagement angle for each.
// ============================================================
const REDDIT_FILE = path.join(DATA_DIR, 'reddit-threads.json');
let redditDb = { latest: null, updatedAt: null };
if (fs.existsSync(REDDIT_FILE)) {
  try { const l = JSON.parse(fs.readFileSync(REDDIT_FILE, 'utf8')); if (l && typeof l === 'object') redditDb = { latest: l.latest || null, updatedAt: l.updatedAt || null }; } catch (e) {}
} else { try { writeJsonFileSync(REDDIT_FILE, redditDb); } catch (e) {} }
let redditRunning = false;
function saveReddit() { saveJsonFileSync(REDDIT_FILE, redditDb, 'Reddit'); }

async function runRedditScan() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: 'Reddit discovery uses live Google Search grounding — add your Gemini API key in Settings.' };
  const kit = (typeof listingKit === 'function') ? listingKit() : {};
  const brand = BUSINESS.name;
  const city = BUSINESS.addressLocality || 'St. Petersburg';
  const region = BUSINESS.addressRegion || 'FL';
  const desc = kit.shortDesc || 'a senior-focused fitness & wellness studio for adults 50+';
  try {
    const p = `Using current web information, find real, active Reddit threads where a business like "${brand}" — ${desc} in ${city}, ${region} — could genuinely help by participating.
Look for people asking for recommendations about: senior fitness, personal trainers for adults over 50, mobility/balance/strength for older adults, injury recovery, physical therapy, or gyms in ${city} or the Tampa Bay FL area — plus broader relevant discussions people ask AI about.
Only include REAL reddit.com thread URLs you actually find in search. For each, give a short authentic, helpful, NON-spammy way to add value (be a real participant, disclose the affiliation, never hard-sell).
Return ONLY raw JSON, no markdown: {"threads":[{"title":"the thread title","subreddit":"r/...","url":"https://www.reddit.com/...","why":"one line on why it's relevant","angle":"a short, genuine way to contribute value"}]}`;
    const r = await geminiGenerate({ model: GEMINI_MODEL, contents: p, config: { tools: [{ googleSearch: {} }] } });
    const parsed = parseGeminiJson(r.text) || {};
    let threads = Array.isArray(parsed.threads) ? parsed.threads : [];
    threads = threads
      .filter(t => t && t.url && /reddit\.com/i.test(t.url))
      .map(t => ({
        title: String(t.title || 'Reddit thread').slice(0, 200),
        subreddit: String(t.subreddit || '').replace(/^\/?r?\/?/i, 'r/').slice(0, 40),
        url: String(t.url).trim(),
        why: String(t.why || '').slice(0, 240),
        angle: String(t.angle || '').slice(0, 300)
      }));
    // de-dupe by url
    const seen = new Set(); threads = threads.filter(t => { if (seen.has(t.url)) return false; seen.add(t.url); return true; }).slice(0, 12);
    const snapshot = { ranAt: new Date().toISOString(), threads };
    redditDb.latest = snapshot; redditDb.updatedAt = snapshot.ranAt; saveReddit();
    return { snapshot };
  } catch (e) { return { error: e.message }; }
}
// These three read/run features share one concurrency, budget, and error
// boundary while retaining their distinct status payloads.
registerAiAuditRoutes(app, {
  requireAuth,
  usageOverBudget,
  budgetBlock,
  logger: console,
  audits: [
    {
      path: '/api/ai-factcheck',
      state: {
        get running() { return factCheckRunning; },
        set running(value) { factCheckRunning = value; },
      },
      status: () => ({
        latest: factCheckDb.latest,
        updatedAt: factCheckDb.updatedAt,
        engines: enginesStatus(),
        anyConfigured: AI_ENGINES.some(engine => engineConfigured(engine.id)),
        running: factCheckRunning,
      }),
      run: runFactCheck,
      useBudget: true,
      rejectOutputError: true,
      logLabel: 'FactCheck',
    },
    {
      path: '/api/ai-crawlers',
      state: {
        get running() { return crawlersRunning; },
        set running(value) { crawlersRunning = value; },
      },
      status: () => ({
        latest: crawlersDb.latest,
        updatedAt: crawlersDb.updatedAt,
        running: crawlersRunning,
        site: siteDomain(),
      }),
      run: runCrawlerAudit,
      logLabel: 'AI Crawlers',
    },
    {
      path: '/api/reddit-threads',
      state: {
        get running() { return redditRunning; },
        set running(value) { redditRunning = value; },
      },
      status: () => ({
        latest: redditDb.latest,
        updatedAt: redditDb.updatedAt,
        running: redditRunning,
        anyConfigured: !!process.env.GEMINI_API_KEY,
      }),
      run: runRedditScan,
      useBudget: true,
      rejectOutputError: true,
      logLabel: 'Reddit',
    },
  ],
});

// ============================================================
// SEO BUDDY ASSISTANT — current dashboard data and confirmed action proposals
// A plain-English copilot that answers from the owner's REAL stored data.
// Reuses the dashboard score calculation and configured connection metadata.
// External actions still require the owner's confirmation.
// ============================================================
async function assistantContext() {
  let currentScore = null;
  try { currentScore = await buildHealthScoreResponse(); } catch (_) { /* unavailable is not a stale score */ }
  const prof = (businessProfile() && businessProfile().profile) || {};
  const healthSnapshots = scoreHistory.snapshots;
  const lastScore = currentScore?.overall ?? null;
  let scoreDelta = null;
  if (lastScore != null && healthSnapshots.length > 1) {
    const target = Date.now() - 28 * 86400000; let best = null;
    for (const s of healthSnapshots) { const t = new Date(s.date + 'T00:00:00Z').getTime(); if (t <= target && (!best || t > new Date(best.date + 'T00:00:00Z').getTime())) best = s; }
    if (!best) best = healthSnapshots[0];
    if (best && best.date !== healthSnapshots[healthSnapshots.length - 1].date) scoreDelta = lastScore - best.overall;
  }
  const vis = aiVisDb.snapshots[aiVisDb.snapshots.length - 1] || null;
  const fc = factCheckDb.latest;
  const cr = crawlersDb.latest;
  const localNap = effectiveNap(localDb.nap, localDb.napExclusions);
  const nap = localNap ? { mismatches: localNap.mismatchCount, checkedAt: localNap.checkedAt, listings: localNap.listings, excludedListings: localDb.napExclusions || [] } : null;
  let cites = null;
  try { const w = worklistPayload(); const ts = w.targets || []; cites = { total: ts.length, listedOn: ts.filter(t => t.listed === true).length, stillToDo: ts.filter(t => (t.status || 'todo') === 'todo').length }; } catch (e) {}
  const aioRec = (aioAuditsDb && aioAuditsDb.length) ? { checks: aioAuditsDb.length, recommendedIn: aioAuditsDb.filter(a => a.recommended).length } : null;
  return {
    business: { name: prof.name || BUSINESS.name, city: BUSINESS.addressLocality, region: BUSINESS.addressRegion, phone: prof.phone || BUSINESS.telephone, website: prof.website || ('https://' + siteDomain().replace(/^https?:\/\//, '')) },
    optimizationScore: lastScore, scoreChangeLast28Days: scoreDelta,
    scoreStatus: currentScore ? 'current-dashboard-calculation' : 'unavailable',
    contextCheckedAt: new Date().toISOString(),
    connections: { googleBusinessProfilePublishing: gbpConfigured(), gmail: !!gmailClient(), websitePublishing: !!process.env.GHL_ACCESS_TOKEN && !!process.env.GHL_LOCATION_ID, searchConsole: !!(process.env.GSC_SITE_URL && getGoogleAuth()) },
    googlePost: { status: gbpPublicationStatus(localDb.gbpDraft), recordedAt: localDb.gbpDraft?.postedAt || localDb.gbpDraft?.createdAt || null },
    monthlyReport: monthlyReportService ? monthlyReportService.status() : { ready: false },
    contentSchedule: { enabled: autopilotEnabled, nextRunAt: autopilotEnabled ? nextRunTime : null, lastSuccessfulRunAt: lastAutopilotRun },
    aiVisibility: vis ? { visibilityScorePct: vis.visibilityScore, shareOfVoicePct: vis.shareOfVoice, sentimentScore: vis.sentimentScore, enginesRun: vis.engines, leaderboard: (vis.leaderboard || []).slice(0, 6).map(l => ({ name: l.name, scorePct: l.score, isYou: !!l.isBrand })), byEngine: vis.perEngine } : null,
    factCheck: fc ? { totalWrongClaims: fc.totalWrong, byEngine: (fc.results || []).map(r => ({ engine: r.label, accuracyPct: r.accuracy, wrongClaims: (r.issues || []).filter(i => !i.correct).map(i => ({ aiSaid: i.aiClaim, actualTruth: i.truth })) })) } : null,
    aiCrawlerAccess: cr ? { blockedCount: cr.blocked, totalChecked: cr.total, blockedBots: (cr.bots || []).filter(b => b.status === 'blocked').map(b => b.label) } : null,
    localListings: nap,
    citations: cites,
    singleSearchAudits: aioRec,
    reddit: redditDb.latest ? { threadsFound: (redditDb.latest.threads || []).length } : null,
    enginesConnected: enginesStatus().map(e => ({ engine: e.label, connected: e.configured })),
    topCitationTargets: (() => { try { const w = worklistPayload(); return (w.targets || []).slice(0, 6).map(t => ({ site: t.domain, alreadyListed: t.listed === true, type: t.type })); } catch (e) { return null; } })(),
    usageThisMonth: (() => { const u = currentUsage(); return { estimatedCostUSD: u.estCostUSD, assistantMessages: u.assistantMessages, aiChecksRun: (u.groundedCalls || 0) + (u.openaiCalls || 0) + (u.perplexityCalls || 0), articlesWritten: u.articles, monthlyBudgetUSD: usageMeter.budgetUSD }; })()
  };
}
// ============================================================
// USAGE / COST METERING — single-process compatibility boundary.
// Account/month accounting is separate from storage and HTTP. A transactional
// reservation design is still required before adding application replicas.
// ============================================================
const usageRepository = createUsageRepository(stateRepository);
const usageMeter = createUsageMeter({
  initialState: usageRepository.load(),
  saveState: usageRepository.save,
  getAccountKey: () => businessLocationId,
});
// Hoisted callbacks preserve earlier route registrations without moving boot
// initialization ahead of tenant hydration, write observers, or business setup.
function saveUsage() { return usageMeter.save(); }
function accountKey() { return usageMeter.accountKey(); }
function usageMonthKey() { return usageMeter.monthKey(); }
function currentUsage() { return usageMeter.current(); }
function meterUsage(kind, n) { return usageMeter.record(kind, n); }
function usageOverBudget() { return usageMeter.overBudget(); }
function budgetBlock(res) { res.json({ success: true, budgetReached: true, message: `You've reached your monthly usage budget of $${usageMeter.budgetUSD}. Raise or clear it in Settings to keep running AI features this month.` }); return true; }

registerUsageRoutes(app, {
  requireOwner,
  currentUsage,
  usageMonthKey,
  accountKey,
  usageState: usageMeter,
  usageOverBudget,
  saveUsage,
});
registerAssistantRoutes(app, {
  requireAuth,
  hasGeminiKey: () => !!process.env.GEMINI_API_KEY,
  usageOverBudget,
  getBudget: () => usageMeter.budgetUSD,
  getContext: assistantContext,
  geminiGenerate,
  model: GEMINI_MODEL,
  logger: console,
});

// 15. Performance — period-over-period trends, durable snapshots, and leads
const performanceHistoryRepository = createPerformanceHistoryRepository(stateRepository);
const performanceHistory = createPerformanceHistory({
  initialSnapshots: performanceHistoryRepository.load(),
  saveSnapshots: performanceHistoryRepository.save,
});

const performanceService = createPerformanceService({
  allowMockIntegrations: ALLOW_MOCK_INTEGRATIONS,
  getGoogleAuth,
  getSiteUrl: () => process.env.GSC_SITE_URL,
  createWebmasters: auth => google.webmasters({ version: 'v3', auth }),
  searchConsoleQuery,
  getSnapshots: () => performanceHistory.snapshots,
  recordSnapshot: performanceHistory.record,
  getAioAudits: () => aioAuditsDb,
  getGhlConfig: () => ({ token: process.env.GHL_ACCESS_TOKEN, locationId: process.env.GHL_LOCATION_ID }),
  providerFetch: (...args) => providerRuntime.fetch(...args),
  logger: console,
});
const computePerformance = performanceService.getPerformance;

registerPerformanceRoutes(app, { getPerformance: computePerformance });

// 16. On-Site & Technical SEO tools
function parseGeminiJson(text) {
  let raw = (text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) raw = m[0];
  try { return JSON.parse(raw); } catch (e) { return null; }
}

registerOnsiteRoutes(app, {
  requireAuth,
  hasGeminiKey: () => !!process.env.GEMINI_API_KEY,
  brandPrompt,
  geminiGenerate,
  model: GEMINI_MODEL,
  parseGeminiJson,
  getHistory: () => historyDb,
  getSiteUrl: () => process.env.GSC_SITE_URL,
  getAuthorName: () => process.env.GHL_AUTHOR_NAME,
  getAuthorUrl: () => process.env.GHL_AUTHOR_URL,
  business: BUSINESS,
  logger: console,
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
  queries: [], targets: [], statuses: {}, kit: null, excludedCompetitorDomains: [],
  autoEnabled: true, intervalDays: 7, newDomains: []
};
try {
  if (fs.existsSync(CITATIONS_FILE)) {
    citationsDb = Object.assign(citationsDb, JSON.parse(fs.readFileSync(CITATIONS_FILE, 'utf8')));
  }
} catch (e) { console.error('[Citations] load failed:', e.message); }
function saveCitations() {
  saveJsonFileSync(CITATIONS_FILE, citationsDb, 'Citations');
}

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
// Fallback directory copy, derived from the brand profile rather than frozen in
// code — edit the voice in Settings and these follow. This is the text the owner
// is told to paste onto every directory, so it must never drift from the brand.
function kitStatic() {
  const b = brandDb;
  return {
    tagline: b.tagline || 'Coach-led fitness in St. Petersburg for active adults 50+.',
    shortDesc: `${b.name}. ${b.audienceDescription}`.slice(0, 160),
    longDesc: [b.name + ' — ' + (b.supportingLine || ''), b.audienceDescription, b.philosophy]
      .filter(Boolean).join(' ').trim(),
  };
}
function listingKit() {
  const cached = citationsDb.kit || {};
  return {
    name: BUSINESS.name,
    addressOneLine: `${BUSINESS.streetAddress}, ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion} ${BUSINESS.postalCode}`,
    phone: phoneDisplay(),
    website: siteDomain(),
    socials: BUSINESS.sameAs || [],
    categories: cached.categories || ['Personal Trainer', 'Fitness Center', 'Physical Therapy', 'Senior Fitness'],
    tagline: cached.tagline || kitStatic().tagline,
    shortDesc: cached.shortDesc || kitStatic().shortDesc,
    longDesc: cached.longDesc || kitStatic().longDesc,
    photoChecklist: ['Square logo', 'Storefront / exterior', '3+ class or training shots', 'Trainer headshots', 'Interior of the studio'],
    generatedAt: cached.generatedAt || null
  };
}

// Shared finder: grounded discovery + classification of the sources AI cites.
async function discoverCitationTargets(cleanQueries) {
  const brandName = BUSINESS.name;
  const brandRoot = 'bestdayfitness';
  const domainInfo = {};
  let brandCited = false;
  await Promise.all(cleanQueries.map(async (q) => {
    try {
      const prompt = `A person searching online asks: "${q}". Acting as a helpful AI answer engine, recommend the best specific local businesses that fit this search in and around St. Petersburg, Florida, based on current web information.`;
      const resp = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
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
    if (isCompetitorDomain(dom, competitorDomains(citationsDb))) {
      return { ...base, type: 'competitor', listed: null, note: 'Previously identified as a competitor-owned site.' };
    }
    try {
      const p = `On the website "${dom}", is the St. Petersburg, Florida fitness studio "Best Day Fitness" listed or mentioned? Also classify what kind of site "${dom}" is. Use "competitor" for another fitness, training or wellness provider's own website, including its blog or best-of articles: those are not independent listing opportunities. Independent directories, review sites and publications covering multiple businesses are not competitors just because they mention competing businesses. Reply with ONLY raw JSON, no markdown fences: {"listed": true or false, "type": "directory" | "review" | "listicle" | "forum" | "competitor" | "news" | "other", "note": "one short line describing the site"}`;
      const r = await geminiGenerate({ model: GEMINI_MODEL, contents: p, config: { tools: [{ googleSearch: {} }] } });
      const parsed = parseGeminiJson(r.text) || {};
      return { ...base, type: parsed.type || 'other', listed: (typeof parsed.listed === 'boolean' ? parsed.listed : null), note: parsed.note || '' };
    } catch (e) { return { ...base, type: 'other', listed: null, note: '' }; }
  }));
  targets.sort((a, b) => b.citedFor - a.citedFor);
  return { brandCited, sourcesFound: Object.keys(domainInfo).length, targets };
}

// Merge cached targets with saved statuses + derive the action for each.
function worklistPayload() {
  return buildCitationWorklist(citationsDb, listingKit());
}

// Shared scan core — runs the grounded discovery, preserves statuses, and
// flags which domains are NEW since the previous scan. Used by the manual
// endpoint and the weekly auto-scan.
async function performCitationScan(queries) {
  const { brandCited, sourcesFound, targets } = await discoverCitationTargets(queries);
  // Remember competitors even when they disappear from a later scan.
  citationsDb.excludedCompetitorDomains = competitorDomains(citationsDb, targets);
  const prevDomains = new Set((citationsDb.targets || []).map(t => t.domain));
  const liveDomains = new Set(targets.map(t => t.domain));
  const keptStatuses = {};
  for (const d of Object.keys(citationsDb.statuses || {})) {
    if (liveDomains.has(d)) keptStatuses[d] = citationsDb.statuses[d];
  }
  citationsDb.statuses = keptStatuses;
  // Don't flag everything "new" on the very first scan.
  citationsDb.newDomains = prevDomains.size ? eligibleCitationState({ ...citationsDb, targets }).targets.filter(t => !prevDomains.has(t.domain)).map(t => t.domain) : [];
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

registerCitationRoutes(app, {
  requireAuth,
  hasGeminiKey: () => !!process.env.GEMINI_API_KEY,
  usageOverBudget,
  budgetBlock,
  getSavedQueries: () => citationsDb.queries || [],
  performScan: performCitationScan,
  worklist: worklistPayload,
  enqueueScanCheck: () => enqueueDurableJob('citation.scan', {}, {
    idempotencyKey: durableJobKey('citation.scan', 12 * 60 * 60 * 1000),
    maxAttempts: 5,
  }),
  setAutoEnabled: enabled => {
    citationsDb.autoEnabled = enabled;
    saveCitations();
    return citationsDb.autoEnabled;
  },
  clearNewDomains: () => {
    citationsDb.newDomains = [];
    saveCitations();
  },
  updateStatus: (domain, status) => {
    if (!citationsDb.statuses) citationsDb.statuses = {};
    citationsDb.statuses[domain] = { status, updatedAt: new Date().toISOString() };
    saveCitations();
  },
  listingKit,
  discoverTargets: discoverCitationTargets,
  filterTargets: targets => eligibleCitationState({ ...citationsDb, targets, excludedCompetitorDomains: competitorDomains(citationsDb, targets) }).targets,
  isExcludedDomain: domain => isCompetitorDomain(domain, competitorDomains(citationsDb)),
  updateListingKit: parsed => {
    citationsDb.kit = {
      tagline: parsed.tagline || kitStatic().tagline,
      shortDesc: parsed.shortDesc || kitStatic().shortDesc,
      longDesc: parsed.longDesc || kitStatic().longDesc,
      categories: Array.isArray(parsed.categories) && parsed.categories.length
        ? parsed.categories.slice(0, 6)
        : undefined,
      generatedAt: new Date().toISOString(),
    };
    saveCitations();
  },
  geminiGenerate,
  model: GEMINI_MODEL,
  parseGeminiJson,
  brandPrompt,
  logger: console,
});

// Background scheduler for the weekly citation auto-scan (staggered from the
// Local/On-Site autopilots so they don't all fire grounded calls at once).
scheduleDurableCheck('citation.scan', 60000, 12 * 60 * 60 * 1000);

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
  napExclusions: [],       // Owner preferences; keep original scan evidence intact.
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
  return saveJsonFileSync(LOCAL_FILE, localDb, 'Local Autopilot');
}

async function localNapScan() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const canonical = buildCanonicalNap(BUSINESS);
  if (!geminiKey) return null;
  const prompt = `Find the current online business listings for "${BUSINESS.name}" located in ${BUSINESS.addressLocality}, ${BUSINESS.addressRegion}. For each major platform (Google Business Profile, Yelp, Facebook, Apple Maps, Bing Places, BBB, local fitness directories), report the EXACT business name, full street address, and phone number shown there, based on current web information. Reply with ONLY raw JSON, no markdown fences: {"listings":[{"platform":"","name":"","address":"","phone":""}]}. Empty string if a field isn't shown.`;
  const r = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  const parsed = parseGeminiJson(r.text) || { listings: [] };
  const listings = mapNapListings(parsed.listings, BUSINESS, canonical);
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
  let topic, topicLabel;
  if (historyDb && historyDb.length) {
    topicLabel = historyDb[0].title;
    topic = `our recent article "${historyDb[0].title}" (topic: ${historyDb[0].keyword})`;
  } else {
    const idx = (localDb.gbpHistory.length) % GBP_TOPIC_SEED.length;
    topic = GBP_TOPIC_SEED[idx];
    topicLabel = topic;
  }
  const brand = brandPrompt(true);
  const prompt = `${brand}\nWrite a Google Business Profile post about: ${topic}. Under 1500 characters, engaging and locally relevant to St. Petersburg, with a clear call to action at the end (book a consultation / call us / visit). Return only the post text.`;
  const r = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt });
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
          const activeNap = effectiveNap(nap, localDb.napExclusions);
          const sig = napSignatureOf(activeNap);
          localDb.napNewMismatch = !!(sig && sig !== (localDb.napSignature || '') && activeNap.mismatchCount > 0);
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
              const receipt = await postGbpLocalPost(draft.text);
              recordGbpPublication(localDb.gbpDraft, receipt);
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
    nap: effectiveNap(localDb.nap, localDb.napExclusions),
    napExclusions: localDb.napExclusions || [],
    napNewMismatch: localDb.napNewMismatch && effectiveNap(localDb.nap, localDb.napExclusions)?.mismatchCount > 0,
    gbpDraft: localDb.gbpDraft,
    gbpHistory: localDb.gbpHistory,
    replyHistory: localDb.replyHistory,
    hasKey: !!process.env.GEMINI_API_KEY
  };
}

registerLocalSeoRoutes(app, {
  requireAuth,
  hasGeminiKey: () => !!process.env.GEMINI_API_KEY,
  business: BUSINESS,
  brandPrompt,
  geminiGenerate,
  model: GEMINI_MODEL,
  localState: localDb,
  filterNap: nap => effectiveNap(nap, localDb.napExclusions),
  saveLocal,
  logger: console,
});

registerLocalListingRoutes(app, { requireOwner, state: localDb, save: saveLocal });

// Background scheduler: catch up shortly after boot, then check twice a day.
scheduleDurableCheck('local.autopilot', 30000, 12 * 60 * 60 * 1000);

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
  saveJsonFileSync(ONSITE_FILE, onsiteDb, 'On-Site Autopilot');
}

// A function, not a const: evaluated at load it would freeze the brand voice at
// boot, so edits made in Settings would not reach the on-site tools until the
// next restart — the exact drift this refactor exists to remove.
const ONSITE_BRAND = () => brandPrompt(true);
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
  const prompt = `${ONSITE_BRAND()}\nUsing current web information, expand the seed keyword "${seed}" into 4–5 topic clusters this business could realistically target. For each cluster give: a short theme, 4–6 specific keyword phrases people actually search (favor local and long‑tail), 2–3 real questions people ask, and one concrete blog/page content idea. Return ONLY raw JSON, no markdown: {"clusters":[{"theme":"","keywords":[],"questions":[],"contentIdea":""}]}`;
  const r = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  const data = parseGeminiJson(r.text) || { clusters: [] };
  return { seed, clusters: data.clusters || [], generatedAt: new Date().toISOString() };
}
async function onsiteLinkScan() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const pages = (historyDb || []).map(h => ({ title: h.title, keyword: h.keyword, url: h.url }));
  if (pages.length < 2) return { suggestions: [], note: 'Publish at least two pages first — then this suggests internal links between them.', generatedAt: new Date().toISOString() };
  const prompt = `${ONSITE_BRAND()}\nHere are the pages this website has published:\n${JSON.stringify(pages)}\nSuggest internal links between them to build topic authority (pillar/cluster style). For each suggestion give the source page title, the target page title, a natural anchor phrase, and a one‑line reason. Return ONLY raw JSON, no markdown: {"suggestions":[{"from":"","to":"","anchor":"","why":""}]}`;
  const r = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt });
  const data = parseGeminiJson(r.text) || { suggestions: [] };
  return { suggestions: data.suggestions || [], note: '', generatedAt: new Date().toISOString() };
}
async function onsiteTitleMetaScan(keyword, page) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;
  const prompt = `${ONSITE_BRAND()}\nWrite SEO title tags and meta descriptions targeting the keyword "${keyword}". Provide 3 title options (each 60 characters or fewer, compelling, naturally including the keyword) and 2 meta descriptions (each 155 characters or fewer, with a clear call to action). Return ONLY raw JSON, no markdown: {"titles":[],"metas":[]}`;
  const r = await geminiGenerate({ model: GEMINI_MODEL, contents: prompt });
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

scheduleDurableCheck('onsite.autopilot', 45000, 12 * 60 * 60 * 1000);

// ============================================================
// 18. OAuth integrations — Gmail direct send + Google Business Profile
// auto-post. Both are PROGRESSIVE ENHANCEMENTS: if the env vars aren't
// set, the endpoints report needsSetup and the UI falls back to the
// existing compose-link / paste flow. Nothing breaks when unconfigured.
// ============================================================
const googleDelivery = createGoogleDelivery({ google, providerRuntime, siteDomain, env: process.env });
const { gmailClient, sendGmail, gbpConfigured, postGbpLocalPost } = googleDelivery;

// Monthly owner reports have their own durable state. Recipient addresses are
// operational configuration rather than secrets, and are masked in public
// status responses.
const MONTHLY_REPORT_FILE = path.join(DATA_DIR, 'monthly-report.json');
let savedMonthlyReport = {};
try { savedMonthlyReport = stateRepository.readJson('monthly-report.json', {}); }
catch (error) { logger.warn('monthly_report.state_unreadable', { error }); }
const monthlyReportDb = Object.assign({
  enabled: true,
  timeZone: process.env.REPORT_TIME_ZONE || 'America/New_York',
  recipient: '',
  lastAttemptAt: null,
  lastSentAt: null,
  lastSentMonth: null,
  lastMessageId: null,
  lastError: null,
}, savedMonthlyReport);
function saveMonthlyReport() {
  saveJsonFileSync(MONTHLY_REPORT_FILE, monthlyReportDb, 'Monthly Report');
}
let monthlyReportService = null;

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
  saveJsonFileSync(PERF_DIGEST_FILE, perfDigestDb, 'Perf Digest');
}
function perfPct(cur, prev) { if (prev == null || prev === 0) return null; return Math.round((cur - prev) / prev * 100); }
function perfDigestText(d) {
  const sign = n => (n >= 0 ? '+' : '') + n;
  const lines = [`${BUSINESS.name} — Weekly SEO Performance`, ''];
  if (d.score != null) lines.push(`Optimization Score: ${d.score}/100`, '');
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
  let score = null;
  try { const h = await buildHealthScoreResponse(); score = h.overall; } catch (e) { /* score optional */ }
  const d = {
    generatedAt: new Date().toISOString(),
    source: p.source,
    score,
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
registerDeliveryRoutes(app, {
  requireAuth,
  gmailClient,
  gmailSender: () => process.env.GMAIL_SENDER || '',
  sendGmail,
  gbpConfigured,
  postGbpLocalPost,
  getGbpDraft: () => localDb.gbpDraft,
  markGbpDraftPosted: result => {
    recordGbpPublication(localDb.gbpDraft, result);
    saveLocal();
  },
  defaultDigestRecipient: () => process.env.DIGEST_EMAIL || process.env.GMAIL_SENDER || '',
  getDigest: () => perfDigestDb.digest,
  saveNewDigest: digest => {
    perfDigestDb.digest = { ...digest, isNew: true };
    perfDigestDb.lastRun = new Date().toISOString();
    savePerfDigest();
  },
  buildDigest: buildPerfDigest,
  logger: console,
});

// These scheduled features share the same state/toggle/run/seen HTTP shape.
// Their distinct scheduling, availability, and persistence behavior remains in
// the feature callbacks below.
registerScheduledFeatureRoutes(app, {
  requireAuth,
  features: [
    {
      path: '/api/local-autopilot',
      status: localState,
      nudge: () => enqueueDurableJob('local.autopilot', {}, {
        idempotencyKey: durableJobKey('local.autopilot', 12 * 60 * 60 * 1000),
        maxAttempts: 5,
      }),
      toggle: body => {
        localDb.enabled = !!body.enabled;
        saveLocal();
        return { success: true, enabled: localDb.enabled };
      },
      availability: () => process.env.GEMINI_API_KEY ? null : ({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to run the Local SEO Autopilot.',
      }),
      start: () => maybeRunLocalAutopilot(true).catch(() => {}),
      markSeen: () => {
        localDb.napNewMismatch = false;
        if (localDb.gbpDraft) localDb.gbpDraft.isNew = false;
        saveLocal();
      },
    },
    {
      path: '/api/onsite-autopilot',
      status: onsiteState,
      nudge: () => enqueueDurableJob('onsite.autopilot', {}, {
        idempotencyKey: durableJobKey('onsite.autopilot', 12 * 60 * 60 * 1000),
        maxAttempts: 5,
      }),
      toggle: body => {
        onsiteDb.enabled = !!body.enabled;
        saveOnsite();
        return { success: true, enabled: onsiteDb.enabled };
      },
      availability: () => process.env.GEMINI_API_KEY ? null : ({
        success: true,
        unavailable: true,
        message: 'Add your Gemini API key in Settings to run the On-Site SEO Autopilot.',
      }),
      start: () => maybeRunOnsiteAutopilot(true).catch(() => {}),
      markSeen: () => {
        if (onsiteDb.ideas) onsiteDb.ideas.isNew = false;
        if (onsiteDb.links) onsiteDb.links.isNew = false;
        if (onsiteDb.titlemeta) onsiteDb.titlemeta.isNew = false;
        saveOnsite();
      },
    },
    {
      path: '/api/performance-digest',
      status: perfDigestState,
      nudge: () => enqueueDurableJob('performance.digest', {}, {
        idempotencyKey: durableJobKey('performance.digest', 12 * 60 * 60 * 1000),
        maxAttempts: 5,
      }),
      toggle: body => {
        if (typeof body.enabled === 'boolean') perfDigestDb.enabled = body.enabled;
        if (typeof body.autoEmail === 'boolean') perfDigestDb.autoEmail = body.autoEmail;
        savePerfDigest();
        return { success: true, enabled: perfDigestDb.enabled, autoEmail: perfDigestDb.autoEmail };
      },
      start: () => maybeRunPerfDigest(true).catch(() => {}),
      markSeen: () => {
        if (perfDigestDb.digest) perfDigestDb.digest.isNew = false;
        savePerfDigest();
      },
    },
  ],
});
scheduleDurableCheck('performance.digest', 75000, 12 * 60 * 60 * 1000);

// ============================================================
// 20. Optimization (Health) Score — the redesign's headline number.
// Five outcome pillars scored 0-100 from data we ALREADY store; the
// overall is a weighted average of only the MEASURED pillars, so a fresh
// account never sees a scary low number. Snapshotted daily for trend.
// ============================================================
const scoreHistoryRepository = createScoreHistoryRepository(stateRepository);
const scoreHistory = createScoreHistory({
  initialSnapshots: scoreHistoryRepository.load(),
  computeScore: computeHealthScore,
  saveSnapshots: scoreHistoryRepository.save,
  getRuntime: () => ({ mode: APP_MODE, mockIntegrationsAllowed: ALLOW_MOCK_INTEGRATIONS }),
});
const { buildResponse: buildHealthScoreResponse, recordDaily: recordDailyHealthSnapshot } = scoreHistory;

async function computeHealthScore() {
  const pillars = [];

  // 1. Found on Google (25%) — GSC leaks + rank
  try {
    const p = await computePerformance();
    if (p.source === 'live_gsc' && p.current) {
      const snap = (p.snapshots && p.snapshots.length) ? p.snapshots[p.snapshots.length - 1] : null;
      const leaks = (snap && typeof snap.leaks === 'number') ? snap.leaks : 0;
      const pos = p.current.avgPosition || 30;
      const leakScore = 100 - Math.min(leaks * 5, 40);
      const rankScore = hClamp(100 - (pos - 3) * (100 / 27), 0, 100);
      pillars.push({
        key: 'found', label: 'Found on Google', weight: 25, measured: true,
        score: 0.6 * leakScore + 0.4 * rankScore,
        detail: `${leaks} search${leaks === 1 ? '' : 'es'} with no clicks · avg rank ${pos}`,
        inputs: { leaks, averagePosition: pos },
        factors: [
          { key: 'clickGaps', label: 'Searches with impressions but no clicks', share: 60, score: Math.round(leakScore) },
          { key: 'averageRank', label: 'Average Google position', share: 40, score: Math.round(rankScore) },
        ],
        sourceUpdatedAt: snap && snap.date ? `${snap.date}T00:00:00.000Z` : null,
      });
    } else {
      pillars.push({ key: 'found', label: 'Found on Google', weight: 25, measured: false, score: null, detail: 'Connect Search Console to measure' });
    }
  } catch (e) {
    pillars.push({ key: 'found', label: 'Found on Google', weight: 25, measured: false, score: null, detail: 'Not measured yet' });
  }

  // 2. Local listings (20%) — NAP mismatches (+ GBP activity)
  if (localDb && localDb.nap) {
    const activeNap = effectiveNap(localDb.nap, localDb.napExclusions);
    const mm = activeNap.mismatchCount || 0;
    let score = hClamp(100 - mm * 15, 0, 100);
    if (localDb.gbpDraft && localDb.gbpDraft.posted) score = hClamp(score + 8, 0, 100);
    pillars.push({
      key: 'local', label: 'Local listings', weight: 20, measured: true, score,
      detail: mm ? `${mm} listing${mm > 1 ? 's' : ''} to fix` : 'No mismatches in monitored listings',
      inputs: { mismatches: mm, excludedListings: activeNap.excludedListings?.length || 0, unverifiedListings: activeNap.unverifiedCount || 0, gbpPosted: !!(localDb.gbpDraft && localDb.gbpDraft.posted) },
      factors: [
        { key: 'napConsistency', label: 'Name, address, and phone consistency', value: mm, effect: `${mm * 15}-point mismatch penalty` },
        { key: 'gbpActivity', label: 'Current Google Business Profile activity', value: !!(localDb.gbpDraft && localDb.gbpDraft.posted), effect: 'Up to 8 bonus points' },
      ],
      sourceUpdatedAt: localDb.lastNapRun || (localDb.gbpDraft && (localDb.gbpDraft.postedAt || localDb.gbpDraft.createdAt)) || null,
    });
  } else {
    pillars.push({ key: 'local', label: 'Local listings', weight: 20, measured: false, score: null, detail: 'Run a listings check to measure' });
  }

  // 3. AI recommends you (20%) — audit recommend rate
  if (aioAuditsDb && aioAuditsDb.length) {
    const rec = aioAuditsDb.filter(a => a.recommended).length;
    const latestAudit = aioAuditsDb[0] || {};
    pillars.push({
      key: 'ai', label: 'AI recommends you', weight: 20, measured: true,
      score: rec / aioAuditsDb.length * 100,
      detail: `Recommended in ${rec} of ${aioAuditsDb.length} check${aioAuditsDb.length > 1 ? 's' : ''}`,
      inputs: { recommended: rec, checks: aioAuditsDb.length },
      factors: [{ key: 'recommendationRate', label: 'Observed AI recommendation rate', numerator: rec, denominator: aioAuditsDb.length }],
      sourceUpdatedAt: latestAudit.timestamp || latestAudit.createdAt || latestAudit.date || null,
    });
  } else {
    pillars.push({ key: 'ai', label: 'AI recommends you', weight: 20, measured: false, score: null, detail: 'Run an AI visibility check to measure' });
  }

  // 4. Get listed (20%) — coverage of the sources AI cites
  const eligibleCitations = eligibleCitationState(citationsDb);
  if (eligibleCitations.targets.length) {
    const st = citationsDb.statuses || {};
    const total = eligibleCitations.targets.length;
    const done = eligibleCitations.targets.filter(t => t.listed === true || (st[t.domain] && st[t.domain].status === 'live')).length;
    pillars.push({
      key: 'listed', label: 'Get listed', weight: 20, measured: true,
      score: done / total * 100,
      detail: `On ${done} of ${total} eligible source${total > 1 ? 's' : ''} AI cites`,
      inputs: { listed: done, total, excludedCompetitors: eligibleCitations.excludedCompetitorCount },
      factors: [{ key: 'citationCoverage', label: 'Confirmed live on AI-cited sources', numerator: done, denominator: total }],
      sourceUpdatedAt: citationsDb.lastScanned || citationsDb.lastRun || null,
    });
  } else {
    pillars.push({ key: 'listed', label: 'Get listed', weight: 20, measured: false, score: null, detail: citationsDb.lastScanned ? 'No eligible listing sources in the latest scan' : 'Scan the sites AI cites to measure' });
  }

  // 5. Fresh content (15%) — recency + autopilot
  {
    const posts = (historyDb || []).filter(h => h.date);
    if (!posts.length && !autopilotEnabled) {
      pillars.push({ key: 'fresh', label: 'Fresh content', weight: 15, measured: false, score: null, detail: 'Publish your first post to measure' });
    } else {
      let days = Infinity;
      if (posts.length) days = (Date.now() - new Date(posts[0].date + 'T00:00:00Z').getTime()) / 86400000;
      let score = posts.length ? hClamp(100 - Math.max(0, days - 7) * (100 / 38), 0, 100) : 20;
      if (autopilotEnabled) score = hClamp(score + 10, 0, 100);
      pillars.push({
        key: 'fresh', label: 'Fresh content', weight: 15, measured: true, score,
        detail: posts.length ? `Last post ${Math.round(days)}d ago${autopilotEnabled ? ' · autopilot on' : ''}` : 'Autopilot on, no posts yet',
        inputs: { daysSincePost: Number.isFinite(days) ? Math.round(days * 100) / 100 : null, autopilotEnabled, postCount: posts.length },
        factors: [
          { key: 'recency', label: 'Days since latest published post', value: Number.isFinite(days) ? Math.round(days * 100) / 100 : null },
          { key: 'automation', label: 'Content autopilot enabled', value: autopilotEnabled, effect: 'Up to 10 bonus points' },
        ],
        sourceUpdatedAt: posts.length ? (posts[0].publishedAt || `${posts[0].date}T00:00:00.000Z`) : null,
      });
    }
  }

  return scorePillars(pillars);
}

function scheduleDailyHealthSnapshots() {
  jobDispatcher.scheduleDaily('health.snapshot', 60000, 5);
}

function getNextMovesContext() {
  return {
    localDb: { ...localDb, nap: effectiveNap(localDb.nap, localDb.napExclusions) },
    citationsDb: eligibleCitationState(citationsDb),
    aioAuditsDb,
    autopilotEnabled,
    gscConfigured: !!(process.env.GSC_SITE_URL && getGoogleAuth()),
    isGbpConfigured: gbpConfigured,
  };
}

function getDigestContext() {
  return { onsiteDb, localDb: { ...localDb, nap: effectiveNap(localDb.nap, localDb.napExclusions) }, citationsDb: eligibleCitationState(citationsDb), perfDigestDb, historyDb, aiVisDb, autopilotEnabled };
}

function getReadinessContext() {
  return {
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    storagePersistent: storageReadiness().persistent,
    gscConfigured: !!(process.env.GSC_SITE_URL && getGoogleAuth()),
    ghlConfigured: !!(process.env.GHL_ACCESS_TOKEN && process.env.GHL_LOCATION_ID),
    adminConfigured: !!ADMIN_PASSWORD,
    businessProfileSaved: !!businessProfileSaved,
    brandReviewed: !!brandReviewedAt,
    brandReviewedAt,
    brandDurable: storageReadiness().persistent,
    stateBackendMode: STATE_BACKEND_MODE,
    appMode: APP_MODE,
    mockIntegrationsAllowed: ALLOW_MOCK_INTEGRATIONS,
  };
}

function getAutomationFeatures() {
  const aiReady = !!process.env.GEMINI_API_KEY;
  const week = 7 * 86400000;
  const features = [
    { key: 'content', title: 'Content publishing', tab: 'publish-tab', jobType: 'content.autopilot',
      configured: aiReady && !!process.env.GHL_ACCESS_TOKEN && !!process.env.GHL_LOCATION_ID,
      setupReason: 'Connect AI writing and website publishing in Settings.',
      enabled: autopilotEnabled, lastRun: lastAutopilotRun, nextRun: nextRunTime },
    { key: 'ai', title: 'AI visibility checks', tab: 'aio-tab', jobType: 'ai.visibility',
      configured: aiReady, enabled: aiVisDb.autoEnabled, running: aiVisRunning,
      lastRun: aiVisDb.lastRun, intervalMs: (aiVisDb.intervalDays || 7) * 86400000 },
    { key: 'local', title: 'Local listings and Google posts', tab: 'local-tab', jobType: 'local.autopilot',
      configured: aiReady, enabled: localDb.enabled, running: localRunning,
      lastRun: localDb.lastNapRun || localDb.lastGbpRun, intervalMs: week,
      needsApproval: !!localDb.gbpDraft && !localDb.gbpDraft.posted, failed: !!localDb.gbpDraft?.postError },
    { key: 'citations', title: 'Directory discovery', tab: 'citations-tab', jobType: 'citation.scan',
      configured: aiReady, enabled: citationsDb.autoEnabled, running: citScanRunning,
      lastRun: citationsDb.lastScanned, intervalMs: (citationsDb.intervalDays || 7) * 86400000 },
    { key: 'onsite', title: 'Website improvement ideas', tab: 'onsite-tab', jobType: 'onsite.autopilot',
      configured: aiReady, enabled: onsiteDb.enabled, running: onsiteRunning,
      lastRun: onsiteDb.lastRun, intervalMs: (onsiteDb.intervalDays || 7) * 86400000 },
    { key: 'digest', title: 'Results summary', tab: 'performance-tab', jobType: 'performance.digest',
      configured: aiReady, enabled: perfDigestDb.enabled, running: perfDigestRunning,
      lastRun: perfDigestDb.lastRun, intervalMs: (perfDigestDb.intervalDays || 7) * 86400000 },
  ];
  if (monthlyReportService) {
    const report = monthlyReportService.status();
    features.push({
      key: 'monthly-report', title: 'Monthly owner report', tab: 'performance-tab', jobType: 'report.monthly-email',
      configured: report.ready,
      setupReason: report.gmailConfigured ? 'Add the owner email address in Results.' : 'Connect Gmail and add the owner email address in Results.',
      enabled: report.enabled, lastRun: report.lastSentAt, nextRun: report.nextRunAt, failed: report.hasDeliveryProblem,
    });
  }
  return features;
}

// Home/Reports dashboard projection. The module keeps response shaping pure;
// the composition root supplies the current live integration and feature state.
registerDashboardRoutes(app, {
  buildHealthScoreResponse,
  getNextMovesContext,
  getDigestContext,
  getReadinessContext,
  logger: console,
});

registerAutomationStatusRoute(app, {
  queue: durableJobQueue, worker: jobWorker,
  getFeatures: getAutomationFeatures,
});

// Restore the autopilot schedule if it was enabled before a redeploy.
if (autopilotEnabled) {
  try { startAutopilotScheduler(); } catch (e) { console.error('[Autopilot] restore failed:', e.message); }
}

// The persisted content deadline also handles one bounded overdue catch-up.

// Start the Express Server
// After boot: re-submit any posts whose URL was just repaired by the migration
// so Google re-crawls them at the corrected /post path. Runs once per post
// (clears the flag afterward), skips drafts/seed rows, and never crashes the
// server on failure — a Google permission error is logged, not thrown.
async function reindexRepairedPosts() {
  const targets = historyDb.filter(h => h && h.needsReindex && /published/i.test(h.platform || ''));
  if (!targets.length) return;
  console.log(`[URL Migration] Re-submitting ${targets.length} repaired URL(s) to Google indexing...`);
  for (const h of targets) {
    try {
      await indexUrlHelper(h.url);
      h.indexed = 'Indexing Requested';
      console.log(`[URL Migration] Re-indexed: ${h.url}`);
    } catch (e) {
      console.error(`[URL Migration] Re-index failed for ${h.url}: ${explainIndexError(e.message)}`);
    } finally {
      delete h.needsReindex;
    }
  }
  saveHistory();
}

// ===========================================================================
// REVIEWS SITE STATS  —  bestdayfitnessreviews.com
// ---------------------------------------------------------------------------
// The reviews hub is a single self-contained static page, so everything here is
// derived by fetching that one URL. No new API keys, no new credentials, no new
// dependency — which is why this can ship today rather than waiting on Google
// Business Profile API access.
//
// Two jobs:
//   1. Inventory & growth — how many reviews are published, on which platforms,
//      and how that has grown month over month.
//   2. Structured-data & SEO health — the checks that catch the failure modes
//      this page is actually prone to: the visible cards silently drifting from
//      the JSON-LD, an aggregateRating the page has not earned, and a social
//      preview image that 404s (all three were real, found 2026-08-05).
// ===========================================================================

const REVIEWS_SNAPSHOTS_FILE = path.join(DATA_DIR, 'reviews-snapshots.json');
let reviewsSnapshots = [];
try {
  reviewsSnapshots = JSON.parse(fs.readFileSync(REVIEWS_SNAPSHOTS_FILE, 'utf8'));
  if (!Array.isArray(reviewsSnapshots)) reviewsSnapshots = [];
} catch (e) { reviewsSnapshots = []; }
const reviewsService = createReviewsService({
  providerRuntime,
  initialSnapshots: reviewsSnapshots,
  saveSnapshots: snapshots => saveJsonFileSync(REVIEWS_SNAPSHOTS_FILE, snapshots, 'Reviews snapshot'),
  getReviewsUrl: () => process.env.REVIEWS_URL || 'https://bestdayfitnessreviews.com',
  getTrustpilotSettings: () => ({
    apiKey: process.env.TRUSTPILOT_API_KEY,
    domain: process.env.TRUSTPILOT_DOMAIN,
    apiBase: process.env.TRUSTPILOT_API_BASE,
  }),
});
registerReviewsRoutes(app, { service: reviewsService, logger: console });

const serverPdfReport = createServerPdfReport({ publicDir: PUBLIC_DIR, appOrigin: siteDomain() });
async function buildMonthlyReportData() {
  const safe = async operation => {
    try { return await operation(); } catch (error) {
      logger.warn('monthly_report.source_unavailable', { error });
      return null;
    }
  };
  const [score, performance, search, reviews, queue] = await Promise.all([
    safe(async () => ({ success: true, ...(await buildHealthScoreResponse()) })),
    safe(() => computePerformance()),
    safe(() => getGscDashboardData()),
    safe(async () => ({ success: true, ...(await reviewsService.getStats()) })),
    safe(() => durableJobQueue.snapshot(100)),
  ]);
  return {
    score,
    performance,
    moves: { success: true, moves: buildNextMoves(getNextMovesContext()) },
    profile: { success: true, profile: businessProfile() },
    search,
    history: historyDb,
    ai: { latest: aiVisDb.snapshots.at(-1) || null, lastRun: aiVisDb.lastRun },
    digest: perfDigestState(),
    automation: queue ? { success: true, checkedAt: new Date().toISOString(), features: buildAutomationStatus(getAutomationFeatures(), queue, jobWorker.status().running) } : null,
    reviews,
    readiness: buildDeployReadiness(getReadinessContext()),
  };
}
monthlyReportService = createMonthlyReportService({
  state: monthlyReportDb,
  saveState: saveMonthlyReport,
  gmailConfigured: () => !!gmailClient(),
  defaultRecipient: () => process.env.MONTHLY_REPORT_EMAIL || process.env.DIGEST_EMAIL || process.env.GMAIL_SENDER || '',
  buildReportData: buildMonthlyReportData,
  renderReport: serverPdfReport.render,
  sendGmail,
});
registerMonthlyReportRoutes(app, { requireOwner, service: monthlyReportService });
// ===========================================================================
// RECORDED ANSWERS  —  turning the owner's own words into content
// ---------------------------------------------------------------------------
// Two capabilities that nothing else in this app could do. Everything else here
// writes ABOUT a keyword from the model's general knowledge; these two are the
// only path for first-hand expertise to enter the system.
//
//   /api/transcribe   upload a recording, get a transcript back. Feeds the
//                     optional "your own words" box on the article generator,
//                     which is where the blog-post half of this now lives.
//   /api/social-pack  transcript -> 5 angles -> 5 hooks -> a 30s script, for
//                     the short-form platforms GBP posts don't cover.
//
// Deliberately NOT here: question-picking (the leak list on the Search Console
// tab already ranks queries with impressions and no clicks, and Autopilot
// already writes articles from it) and a second blog writer (generateArticleHelper
// has the better AEO prompt and the only path to publishing).
//
// Both spend Gemini credits, so both sit behind requireAuth.
// ===========================================================================

registerRecordedContentRoutes(app, {
  requireAuth,
  usageOverBudget,
  budgetBlock,
  geminiGenerate,
  model: GEMINI_MODEL,
  businessName: BUSINESS.name,
  parseGeminiJson,
  logger: console,
});

function scheduleDailyStateBackups() {
  jobDispatcher.scheduleDaily('storage.backup', 2 * 60 * 1000);
}

function scheduleMonthlyOwnerReport() {
  // A daily eligibility check keeps the calendar decision restart-safe and
  // timezone-aware. Only the first local calendar day can deliver.
  jobDispatcher.scheduleDaily('report.monthly-email', 150000, 13 * 60);
}

function registerDurableJobHandlers() {
  jobHandlers.set('content.autopilot', async () => {
    if (!autopilotEnabled) return { skipped: 'disabled' };
    await runAutopilotCycle();
    return { completed: true };
  });
  jobHandlers.set('ai.visibility', async () => { await maybeRunAiVisibility(false); return { checked: true }; });
  jobHandlers.set('citation.scan', async () => { await maybeRunCitationScan(false); return { checked: true }; });
  jobHandlers.set('local.autopilot', async () => { await maybeRunLocalAutopilot(false); return { checked: true }; });
  jobHandlers.set('onsite.autopilot', async () => { await maybeRunOnsiteAutopilot(false); return { checked: true }; });
  jobHandlers.set('performance.digest', async () => { await maybeRunPerfDigest(false); return { checked: true }; });
  jobHandlers.set('report.monthly-email', async () => monthlyReportService.runScheduled());
  jobHandlers.set('health.snapshot', async () => { await recordDailyHealthSnapshot(); return { recorded: true }; });
  jobHandlers.set('storage.backup', async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (backupService.list().some(item => item.valid && String(item.id).startsWith(today))) return { skipped: 'already-backed-up' };
    const backup = backupService.create();
    logger.info('storage.backup_created', { tenantId: stateRepository.tenantId, backupId: backup.id, files: backup.files.length });
    return { backupId: backup.id, files: backup.files.length };
  });
}


function startBackgroundWork() {
  jobWorker.start();
  scheduleDailyHealthSnapshots();
  scheduleDailyStateBackups();
  scheduleMonthlyOwnerReport();
}

const server = app.listen(PORT, () => {
  logger.info('server.started', {
    port: Number(PORT),
    mode: APP_MODE,
    mockIntegrationsAllowed: ALLOW_MOCK_INTEGRATIONS,
    geminiModel: GEMINI_MODEL,
    persistentStorage: STORAGE_IS_PERSISTENT || STATE_BACKEND_MODE === 'postgres',
    adminLockEnabled: Boolean(ADMIN_PASSWORD),
    operatorLockEnabled: Boolean(OPERATOR_PASSWORD),
    auditSigningEnabled: Boolean(process.env.AUDIT_SIGNING_KEY),
    tenantId: stateRepository.tenantId,
    repositoryBackend: stateRepository.backend,
    stateBackendMode: STATE_BACKEND_MODE,
    migratedStateFiles: stateRepository.migrated.length,
    railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME || null,
    railwayReplica: process.env.RAILWAY_REPLICA_ID || null,
  });
  if (!ADMIN_PASSWORD) logger.warn('security.admin_lock_disabled', { mode: APP_MODE });
  registerDurableJobHandlers();
  const databaseInitialization = initializePostgresMirror().catch(error => {
    postgresStatus.ready = false;
    postgresStatus.error = error.code || error.message;
    logger.error('storage.postgres_initialization_failed', { tenantId: stateRepository.tenantId, error });
    if (STATE_BACKEND_MODE === 'postgres') throw error;
  });
  if (STATE_BACKEND_MODE === 'postgres') {
    databaseInitialization.then(startBackgroundWork).catch(() => { /* readiness remains false */ });
  } else {
    startBackgroundWork();
  }
  // Fire-and-forget: repair-triggered re-indexing (safe, self-clearing).
  reindexRepairedPosts().catch(e => console.error('[URL Migration] reindex batch error:', e.message));
});

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  contentScheduler?.stop();
  jobDispatcher.stop();
  logger.info('server.shutdown_started', { signal });
  const forceExit = setTimeout(() => {
    logger.error('server.shutdown_timeout', { signal, timeoutMs: 10000 });
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000);
  forceExit.unref();
  server.close(async error => {
    clearTimeout(forceExit);
    if (error) {
      logger.error('server.shutdown_failed', { signal, error });
      process.exit(1);
    }
    try {
      await jobWorker.stop();
      if (postgresStateBridge) {
        await postgresStateBridge.flush();
        postgresStateBridge.close();
        setJsonWriteObserver(null);
      }
      if (postgresMirror) await postgresMirror.close();
    } catch (error) { logger.warn('storage.postgres_close_failed', { error }); }
    logger.info('server.shutdown_completed', { signal });
    process.exit(0);
  });
  server.closeIdleConnections?.();
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
