const fs = require('fs');

const DEFAULT_BUSINESS = {
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
    'https://www.youtube.com/c/Bestdayfitness',
  ],
};

const PROFILE_FIELD_MAP = Object.freeze({
  name: 'name',
  phone: 'telephone',
  streetAddress: 'streetAddress',
  addressLocality: 'addressLocality',
  addressRegion: 'addressRegion',
  postalCode: 'postalCode',
});

function createBusinessProfileService(options = {}) {
  const {
    filePath,
    writeJsonFileSync,
    fsImpl = fs,
    logger = console,
    defaults = DEFAULT_BUSINESS,
    defaultLocationId = 'loc-bestday-stpete',
    defaultWebsite = 'https://bestdayfitness.com',
  } = options;
  if (!filePath) throw new TypeError('filePath is required.');
  if (typeof writeJsonFileSync !== 'function') throw new TypeError('writeJsonFileSync is required.');

  const business = { ...defaults, sameAs: Array.isArray(defaults.sameAs) ? defaults.sameAs.slice() : defaults.sameAs };
  let configured = false;
  let locationId = defaultLocationId;
  let website = defaultWebsite;

  try {
    if (fsImpl.existsSync(filePath)) {
      const saved = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      if (saved.locationId) locationId = saved.locationId;
      if (saved.website) website = saved.website;
      for (const [inputField, businessField] of Object.entries(PROFILE_FIELD_MAP)) {
        if (saved[inputField]) business[businessField] = saved[inputField];
      }
      if (Array.isArray(saved.socials)) business.sameAs = saved.socials;
      configured = true;
    }
  } catch (error) {
    logger.error('[Business Profile] load failed:', error.message);
  }

  function profile() {
    return {
      locationId,
      configured,
      name: business.name,
      phone: business.telephone,
      streetAddress: business.streetAddress,
      addressLocality: business.addressLocality,
      addressRegion: business.addressRegion,
      postalCode: business.postalCode,
      website,
      socials: business.sameAs || [],
    };
  }

  function save(input) {
    const set = (field, value) => {
      if (typeof value === 'string' && value.trim()) business[field] = value.trim();
    };
    set('name', input.name);
    set('telephone', input.phone);
    set('streetAddress', input.streetAddress);
    set('addressLocality', input.addressLocality);
    set('addressRegion', input.addressRegion);
    set('postalCode', input.postalCode);
    if (typeof input.website === 'string' && input.website.trim()) website = input.website.trim();
    if (Array.isArray(input.socials)) business.sameAs = input.socials.filter(value => typeof value === 'string' && value.trim());
    if (typeof input.locationId === 'string' && input.locationId.trim()) locationId = input.locationId.trim();
    configured = true;
    writeJsonFileSync(filePath, profile());
  }

  function buildLocalBusinessSchema(domain) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SportsClub',
      name: business.name,
      image: `${domain}/assets/logo.png`,
      '@id': `${domain}/#organization`,
      url: domain,
      telephone: business.telephone,
      address: {
        '@type': 'PostalAddress',
        streetAddress: business.streetAddress,
        addressLocality: business.addressLocality,
        addressRegion: business.addressRegion,
        postalCode: business.postalCode,
        addressCountry: business.addressCountry,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: business.latitude,
        longitude: business.longitude,
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          opens: '04:00',
          closes: '22:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Sunday'],
          opens: '09:00',
          closes: '17:00',
        },
      ],
      sameAs: business.sameAs,
    };
  }

  function phoneDisplay() {
    const digits = (business.telephone || '').replace(/[^0-9]/g, '').replace(/^1/, '');
    return digits.length === 10
      ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      : business.telephone;
  }

  return {
    business,
    profile,
    save,
    buildLocalBusinessSchema,
    phoneDisplay,
    get configured() { return configured; },
    get locationId() { return locationId; },
    get website() { return website; },
  };
}

module.exports = { DEFAULT_BUSINESS, PROFILE_FIELD_MAP, createBusinessProfileService };
