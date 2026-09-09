import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_BUSINESS, createBusinessProfileService } = require('../lib/business-profile-service');

function fixture(options = {}) {
  const writes = [];
  const logs = [];
  const defaults = options.defaults || {
    name: 'Original Business',
    telephone: '+1-555-234-5678',
    streetAddress: '1 Main St',
    addressLocality: 'St. Pete',
    addressRegion: 'FL',
    postalCode: '33701',
    addressCountry: 'US',
    latitude: 27.7,
    longitude: -82.6,
    sameAs: ['https://social.example/original'],
  };
  const fsImpl = options.fsImpl || { existsSync: () => false };
  const writeJsonFileSync = options.writeJsonFileSync || ((...args) => writes.push(args));
  const logger = options.logger || { error: (...args) => logs.push(args) };
  const service = createBusinessProfileService({
    filePath: 'business-profile.json',
    writeJsonFileSync,
    fsImpl,
    logger,
    defaults,
    defaultLocationId: 'location-default',
    defaultWebsite: 'https://default.example',
  });
  return { service, defaults, writes, logs };
}

test('production identity retains the confirmed Best Day Fitness location facts', () => {
  assert.deepEqual(DEFAULT_BUSINESS, {
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
  });
});

test('a fresh location returns independent defaults without claiming saved configuration', () => {
  const { service, defaults } = fixture();
  assert.deepEqual(service.profile(), {
    locationId: 'location-default',
    configured: false,
    name: 'Original Business',
    phone: '+1-555-234-5678',
    streetAddress: '1 Main St',
    addressLocality: 'St. Pete',
    addressRegion: 'FL',
    postalCode: '33701',
    website: 'https://default.example',
    socials: ['https://social.example/original'],
  });
  assert.notEqual(service.business, defaults);
  assert.notEqual(service.business.sameAs, defaults.sameAs);
  assert.equal(service.configured, false);
});

test('saved identity overrides only established profile fields and marks configuration', () => {
  const saved = {
    locationId: 'saved-location',
    website: 'https://saved.example',
    name: 'Saved Business',
    phone: '727-111-2222',
    streetAddress: '2 Saved Ave',
    addressLocality: 'Tampa',
    addressRegion: 'FL',
    postalCode: '33601',
    socials: ['https://social.example/saved'],
    ignored: 'not projected',
  };
  const { service } = fixture({
    fsImpl: { existsSync: () => true, readFileSync: () => JSON.stringify(saved) },
  });
  assert.equal(service.configured, true);
  assert.equal(service.locationId, 'saved-location');
  assert.equal(service.website, 'https://saved.example');
  assert.equal(service.business.name, 'Saved Business');
  assert.equal(service.business.telephone, '727-111-2222');
  assert.deepEqual(service.business.sameAs, ['https://social.example/saved']);
  assert.equal(Object.hasOwn(service.business, 'ignored'), false);
});

test('an unreadable saved profile retains defaults and reports the existing safe error', () => {
  const { service, logs } = fixture({
    fsImpl: { existsSync: () => true, readFileSync: () => '{bad json' },
  });
  assert.equal(service.profile().configured, false);
  assert.equal(service.profile().name, 'Original Business');
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[Business Profile] load failed:');
  assert.match(logs[0][1], /JSON/);
});

test('saving preserves trimming, blank-field, social filtering, and persistence behavior', () => {
  const { service, writes } = fixture();
  service.save({
    locationId: '  new-location  ',
    website: ' https://new.example ',
    name: ' New Name ',
    phone: '',
    streetAddress: ' New Street ',
    addressLocality: ' ',
    addressRegion: ' GA ',
    postalCode: '30301',
    socials: [' https://social.example/new ', '', 42, null],
  });
  assert.deepEqual(service.profile(), {
    locationId: 'new-location',
    configured: true,
    name: 'New Name',
    phone: '+1-555-234-5678',
    streetAddress: 'New Street',
    addressLocality: 'St. Pete',
    addressRegion: 'GA',
    postalCode: '30301',
    website: 'https://new.example',
    socials: [' https://social.example/new '],
  });
  assert.deepEqual(writes, [['business-profile.json', service.profile()]]);
});

test('LocalBusiness schema retains the exact public type, hours, NAP, and identity links', () => {
  const { service } = fixture();
  const schema = service.buildLocalBusinessSchema('https://example.test');
  assert.equal(schema['@context'], 'https://schema.org');
  assert.equal(schema['@type'], 'SportsClub');
  assert.equal(schema['@id'], 'https://example.test/#organization');
  assert.equal(schema.image, 'https://example.test/assets/logo.png');
  assert.equal(schema.telephone, '+1-555-234-5678');
  assert.deepEqual(schema.address, {
    '@type': 'PostalAddress',
    streetAddress: '1 Main St',
    addressLocality: 'St. Pete',
    addressRegion: 'FL',
    postalCode: '33701',
    addressCountry: 'US',
  });
  assert.deepEqual(schema.geo, { '@type': 'GeoCoordinates', latitude: 27.7, longitude: -82.6 });
  assert.deepEqual(schema.openingHoursSpecification.map(item => [item.dayOfWeek, item.opens, item.closes]), [
    [['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], '04:00', '22:00'],
    [['Sunday'], '09:00', '17:00'],
  ]);
  assert.deepEqual(schema.sameAs, ['https://social.example/original']);
});

test('phone display retains US normalization and unknown-number fallback', () => {
  const { service } = fixture();
  assert.equal(service.phoneDisplay(), '(555) 234-5678');
  service.business.telephone = 'extension 123';
  assert.equal(service.phoneDisplay(), 'extension 123');
});

test('service validates persistence dependencies at composition time', () => {
  assert.throws(() => createBusinessProfileService(), /filePath is required/);
  assert.throws(() => createBusinessProfileService({ filePath: 'business.json' }), /writeJsonFileSync is required/);
});
