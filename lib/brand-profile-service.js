const fs = require('fs');

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

const clone = value => JSON.parse(JSON.stringify(value));
const list = value => (Array.isArray(value) ? value.filter(Boolean) : []);

function createBrandProfileService(options = {}) {
  const {
    filePath,
    saveJsonFileSync,
    fsImpl = fs,
    defaults = BRAND_DEFAULT,
  } = options;
  if (!filePath) throw new TypeError('filePath is required.');
  if (typeof saveJsonFileSync !== 'function') throw new TypeError('saveJsonFileSync is required.');

  let profile = clone(defaults);
  let reviewedAt = null;
  try {
    const loaded = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    if (loaded && typeof loaded === 'object') {
      const { _reviewedAt, ...loadedBrand } = loaded;
      profile = { ...defaults, ...loadedBrand };
      reviewedAt = Object.prototype.hasOwnProperty.call(loaded, '_reviewedAt')
        ? (typeof _reviewedAt === 'string' && _reviewedAt ? _reviewedAt : null)
        : fsImpl.statSync(filePath).mtime.toISOString();
    }
  } catch { /* first run or unreadable profile — defaults stand */ }

  const state = {
    get profile() { return profile; },
    set profile(value) { profile = value; },
    get reviewedAt() { return reviewedAt; },
    set reviewedAt(value) { reviewedAt = value; },
  };

  function save() {
    return saveJsonFileSync(filePath, { ...profile, _reviewedAt: reviewedAt }, 'Brand');
  }

  function prompt(full) {
    const brand = profile;
    const lines = [
      `${brand.name} — ${brand.audienceDescription}`,
      brand.tagline ? `Tagline: "${brand.tagline}"` : '',
      brand.philosophy ? `Philosophy: ${brand.philosophy}` : '',
      brand.tone ? `TONE: ${brand.tone}` : '',
      list(brand.voiceTraits).length ? `VOICE:\n- ${list(brand.voiceTraits).join('\n- ')}` : '',
      list(brand.writingStyle).length ? `STYLE:\n- ${list(brand.writingStyle).join('\n- ')}` : '',
      list(brand.usePhrases).length ? `PHRASES THAT ARE OURS (use naturally, do not force):\n- ${list(brand.usePhrases).join('\n- ')}` : '',
      list(brand.neverUse).length ? `NEVER USE THESE WORDS OR PHRASES — this is a hard rule and the copy is checked for them afterwards:\n${list(brand.neverUse).map(word => `"${word}"`).join(', ')}` : '',
    ];
    if (full) {
      lines.push(
        list(brand.services).length ? `SERVICES:\n- ${list(brand.services).join('\n- ')}` : '',
        list(brand.differentiators).length ? `WHAT MAKES US DIFFERENT:\n- ${list(brand.differentiators).join('\n- ')}` : '',
        list(brand.audiencePainPoints).length ? `WHAT THE READER IS FEELING:\n- ${list(brand.audiencePainPoints).join('\n- ')}` : '',
        list(brand.notPositioning).length ? `WE ARE NOT: ${list(brand.notPositioning).join(', ')}. Never imply otherwise.` : '',
      );
    }
    return lines.filter(Boolean).join('\n');
  }

  function violations(text) {
    const source = String(text || '');
    if (!source) return [];
    const hits = [];
    for (const phrase of list(profile.neverUse)) {
      const escaped = String(phrase).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escaped) continue;
      const match = source.match(new RegExp(`\\b${escaped.replace(/\s+/g, '\\s+')}\\b`, 'i'));
      if (match) hits.push({ phrase, found: match[0] });
    }
    return hits;
  }

  return { defaults, state, save, prompt, violations };
}

module.exports = { BRAND_DEFAULT, createBrandProfileService };
