'use strict';

const DEFAULT_CATEGORIES = Object.freeze([
  'Personal Trainer',
  'Fitness Center',
  'Physical Therapy',
  'Senior Fitness',
]);

const PHOTO_CHECKLIST = Object.freeze([
  'Square logo',
  'Storefront / exterior',
  '3+ class or training shots',
  'Trainer headshots',
  'Interior of the studio',
]);

function createListingKitService(options = {}) {
  const {
    business,
    getBrandProfile,
    getCitationState,
    getSiteDomain,
    phoneDisplay,
    save,
    now = () => new Date().toISOString(),
  } = options;

  if (!business || typeof business !== 'object') throw new TypeError('Business facts are required.');
  if (typeof getBrandProfile !== 'function') throw new TypeError('Brand profile reader is required.');
  if (typeof getCitationState !== 'function') throw new TypeError('Citation state reader is required.');
  if (typeof getSiteDomain !== 'function') throw new TypeError('Site-domain reader is required.');
  if (typeof phoneDisplay !== 'function') throw new TypeError('Phone formatter is required.');
  if (typeof save !== 'function') throw new TypeError('Citation save callback is required.');
  if (typeof now !== 'function') throw new TypeError('Clock is required.');

  function staticCopy() {
    const brand = getBrandProfile();
    return {
      tagline: brand.tagline || 'Coach-led fitness in St. Petersburg for active adults 50+.',
      shortDesc: `${brand.name}. ${brand.audienceDescription}`.slice(0, 160),
      longDesc: [brand.name + ' — ' + (brand.supportingLine || ''), brand.audienceDescription, brand.philosophy]
        .filter(Boolean).join(' ').trim(),
    };
  }

  function build() {
    const state = getCitationState();
    const cached = state.kit || {};
    const fallback = staticCopy();
    return {
      name: business.name,
      addressOneLine: `${business.streetAddress}, ${business.addressLocality}, ${business.addressRegion} ${business.postalCode}`,
      phone: phoneDisplay(),
      website: getSiteDomain(),
      socials: business.sameAs || [],
      categories: cached.categories || DEFAULT_CATEGORIES.slice(),
      tagline: cached.tagline || fallback.tagline,
      shortDesc: cached.shortDesc || fallback.shortDesc,
      longDesc: cached.longDesc || fallback.longDesc,
      photoChecklist: PHOTO_CHECKLIST.slice(),
      generatedAt: cached.generatedAt || null,
    };
  }

  function update(input) {
    const state = getCitationState();
    const fallback = staticCopy();
    state.kit = {
      tagline: input.tagline || fallback.tagline,
      shortDesc: input.shortDesc || fallback.shortDesc,
      longDesc: input.longDesc || fallback.longDesc,
      categories: Array.isArray(input.categories) && input.categories.length
        ? input.categories.slice(0, 6)
        : undefined,
      generatedAt: now(),
    };
    save();
  }

  return { staticCopy, build, update };
}

module.exports = { DEFAULT_CATEGORIES, PHOTO_CHECKLIST, createListingKitService };
