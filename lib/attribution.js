'use strict';

const CHANNELS = Object.freeze([
  'ai_referral', 'organic_search', 'paid_search', 'social', 'referral', 'direct', 'other', 'unknown',
]);

function sourceText(contact) {
  const candidates = [
    contact?.source,
    contact?.contactSource,
    contact?.attributionSource,
    contact?.lastAttributionSource,
    contact?.firstAttributionSource,
    contact?.utmSource,
    contact?.utmMedium,
  ];
  if (Array.isArray(contact?.tags)) candidates.push(...contact.tags);
  return candidates.filter(value => typeof value === 'string' && value.trim()).join(' ').toLowerCase();
}

function classifyContactSource(contact) {
  const source = sourceText(contact);
  if (!source) return { channel: 'unknown', evidence: null };
  if (/chatgpt|openai|perplexity|claude|gemini|copilot|ai[ _-]?overview/.test(source)) return { channel: 'ai_referral', evidence: source.slice(0, 160) };
  if (/organic|seo|google search|bing search|search engine/.test(source)) return { channel: 'organic_search', evidence: source.slice(0, 160) };
  if (/ppc|paid search|google ads|adwords|bing ads|cpc/.test(source)) return { channel: 'paid_search', evidence: source.slice(0, 160) };
  if (/facebook|instagram|linkedin|tiktok|youtube|twitter|threads|social/.test(source)) return { channel: 'social', evidence: source.slice(0, 160) };
  if (/referr|partner|directory|yelp|bbb|trustpilot/.test(source)) return { channel: 'referral', evidence: source.slice(0, 160) };
  if (/direct|walk[ -]?in|phone|manual/.test(source)) return { channel: 'direct', evidence: source.slice(0, 160) };
  return { channel: 'other', evidence: source.slice(0, 160) };
}

function contactTimestamp(contact) {
  const timestamp = new Date(contact?.dateAdded || contact?.createdAt || contact?.dateUpdated || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function emptyChannels() {
  return Object.fromEntries(CHANNELS.map(channel => [channel, 0]));
}

function summarizeContactAttribution(contacts, windows) {
  const currentChannels = emptyChannels();
  const previousChannels = emptyChannels();
  let currentTotal = 0;
  let previousTotal = 0;

  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const timestamp = contactTimestamp(contact);
    const { channel } = classifyContactSource(contact);
    if (timestamp >= windows.currentStart && timestamp <= windows.currentEnd) {
      currentTotal += 1;
      currentChannels[channel] += 1;
    } else if (timestamp >= windows.previousStart && timestamp < windows.previousEnd) {
      previousTotal += 1;
      previousChannels[channel] += 1;
    }
  }

  const knownCurrent = currentTotal - currentChannels.unknown;
  const knownPercent = currentTotal ? Math.round(knownCurrent / currentTotal * 100) : 0;
  const explicitlySearchAttributed = currentChannels.organic_search + currentChannels.ai_referral;
  const confidence = knownPercent >= 80 ? 'high' : knownPercent >= 40 ? 'medium' : 'low';
  return {
    scope: 'all-new-contacts',
    currentTotal,
    previousTotal,
    currentChannels,
    previousChannels,
    knownCurrent,
    unknownCurrent: currentChannels.unknown,
    knownPercent,
    explicitlySearchAttributed,
    confidence,
    note: explicitlySearchAttributed
      ? `${explicitlySearchAttributed} contact${explicitlySearchAttributed === 1 ? '' : 's'} carried explicit organic-search or AI-referral source evidence.`
      : 'No current contact carried explicit organic-search or AI-referral source evidence; do not treat all contacts as SEO conversions.',
  };
}

module.exports = { CHANNELS, classifyContactSource, summarizeContactAttribution };
