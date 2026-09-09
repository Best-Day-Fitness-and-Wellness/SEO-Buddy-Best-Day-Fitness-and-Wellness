import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_CATEGORIES,
  PHOTO_CHECKLIST,
  createListingKitService,
} = require('../lib/listing-kit-service');

function fixture(overrides = {}) {
  const state = overrides.state || { kit: null };
  const business = overrides.business || {
    name: 'Best Day Fitness',
    streetAddress: '6619 1st Ave S',
    addressLocality: 'St. Petersburg',
    addressRegion: 'FL',
    postalCode: '33707',
    sameAs: ['https://social.example/best-day'],
  };
  const brand = overrides.brand || {
    name: 'Best Day Fitness',
    tagline: '',
    supportingLine: 'Move well and feel strong.',
    audienceDescription: 'Coach-led training for active adults.',
    philosophy: 'Build confidence for everyday life.',
  };
  let saves = 0;
  const service = createListingKitService({
    business,
    getBrandProfile: () => brand,
    getCitationState: () => state,
    getSiteDomain: () => 'https://bestdayfitness.com',
    phoneDisplay: () => '(727) 334-1472',
    save: () => { saves += 1; },
    now: () => '2026-09-09T12:00:00.000Z',
  });
  return { service, state, business, brand, saves: () => saves };
}

test('fresh listing kit retains the exact canonical identity and directory defaults', () => {
  const { service } = fixture();
  assert.deepEqual(service.build(), {
    name: 'Best Day Fitness',
    addressOneLine: '6619 1st Ave S, St. Petersburg, FL 33707',
    phone: '(727) 334-1472',
    website: 'https://bestdayfitness.com',
    socials: ['https://social.example/best-day'],
    categories: ['Personal Trainer', 'Fitness Center', 'Physical Therapy', 'Senior Fitness'],
    tagline: 'Coach-led fitness in St. Petersburg for active adults 50+.',
    shortDesc: 'Best Day Fitness. Coach-led training for active adults.',
    longDesc: 'Best Day Fitness — Move well and feel strong. Coach-led training for active adults. Build confidence for everyday life.',
    photoChecklist: ['Square logo', 'Storefront / exterior', '3+ class or training shots', 'Trainer headshots', 'Interior of the studio'],
    generatedAt: null,
  });
});

test('brand-derived fallbacks preserve truncation and composition behavior', () => {
  const audienceDescription = 'A'.repeat(200);
  const { service } = fixture({
    brand: { name: 'Brand', tagline: 'Own tagline', supportingLine: '', audienceDescription, philosophy: '' },
  });
  assert.deepEqual(service.staticCopy(), {
    tagline: 'Own tagline',
    shortDesc: `Brand. ${audienceDescription}`.slice(0, 160),
    longDesc: `Brand —  ${audienceDescription}`,
  });
});

test('saved copy and categories override fallbacks without replacing canonical identity', () => {
  const state = {
    kit: {
      tagline: 'Saved tagline',
      shortDesc: 'Saved short description',
      longDesc: 'Saved long description',
      categories: ['Gym', 'Coach'],
      generatedAt: '2026-08-01T00:00:00.000Z',
    },
  };
  const { service } = fixture({ state });
  const kit = service.build();
  assert.equal(kit.name, 'Best Day Fitness');
  assert.equal(kit.addressOneLine, '6619 1st Ave S, St. Petersburg, FL 33707');
  assert.equal(kit.tagline, 'Saved tagline');
  assert.equal(kit.shortDesc, 'Saved short description');
  assert.equal(kit.longDesc, 'Saved long description');
  assert.deepEqual(kit.categories, ['Gym', 'Coach']);
  assert.equal(kit.generatedAt, '2026-08-01T00:00:00.000Z');
});

test('update applies fallbacks, limits categories, stamps time, and saves once', () => {
  const { service, state, saves } = fixture();
  service.update({
    tagline: 'Generated tagline',
    shortDesc: '',
    longDesc: 'Generated long description',
    categories: ['1', '2', '3', '4', '5', '6', '7'],
  });
  assert.deepEqual(state.kit, {
    tagline: 'Generated tagline',
    shortDesc: 'Best Day Fitness. Coach-led training for active adults.',
    longDesc: 'Generated long description',
    categories: ['1', '2', '3', '4', '5', '6'],
    generatedAt: '2026-09-09T12:00:00.000Z',
  });
  assert.equal(saves(), 1);
});

test('empty generated categories retain the existing undefined-on-save and default-on-read behavior', () => {
  const { service, state } = fixture();
  service.update({ tagline: '', shortDesc: '', longDesc: '', categories: [] });
  assert.equal(state.kit.categories, undefined);
  assert.deepEqual(service.build().categories, DEFAULT_CATEGORIES);
});

test('reads use current mutable business, brand, and citation state', () => {
  const state = { kit: null };
  const business = {
    name: 'First', streetAddress: '1 A St', addressLocality: 'City', addressRegion: 'FL', postalCode: '1', sameAs: [],
  };
  const brand = { name: 'First', tagline: '', supportingLine: '', audienceDescription: 'First audience', philosophy: '' };
  const { service } = fixture({ state, business, brand });
  business.name = 'Second';
  brand.name = 'Second';
  state.kit = { tagline: 'Current saved tagline' };
  const kit = service.build();
  assert.equal(kit.name, 'Second');
  assert.equal(kit.shortDesc, 'Second. First audience');
  assert.equal(kit.tagline, 'Current saved tagline');
});

test('default list projections are independent across reads', () => {
  const { service } = fixture();
  const first = service.build();
  first.categories.push('Changed');
  first.photoChecklist.push('Changed');
  const second = service.build();
  assert.deepEqual(second.categories, DEFAULT_CATEGORIES);
  assert.deepEqual(second.photoChecklist, PHOTO_CHECKLIST);
});

test('service validates every composition dependency', () => {
  const valid = {
    business: {},
    getBrandProfile: () => ({}),
    getCitationState: () => ({}),
    getSiteDomain: () => '',
    phoneDisplay: () => '',
    save: () => {},
  };
  for (const key of Object.keys(valid)) {
    const broken = { ...valid };
    delete broken[key];
    assert.throws(() => createListingKitService(broken), TypeError);
  }
  assert.throws(() => createListingKitService({ ...valid, now: 'not a function' }), /Clock is required/);
});
