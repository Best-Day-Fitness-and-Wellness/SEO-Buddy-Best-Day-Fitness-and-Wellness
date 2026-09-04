import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { recordGbpPublication, gbpPublicationStatus } = require('../lib/gbp-publication');
const { registerDeliveryRoutes } = require('../lib/delivery-routes');
test('manual and legacy post records never claim a verified Google publication', () => {
  assert.equal(gbpPublicationStatus(null), 'none');
  assert.equal(gbpPublicationStatus({ text: 'draft' }), 'draft');
  assert.equal(gbpPublicationStatus({ posted: true }), 'owner-marked');
  const draft = { text: 'Keep content', postError: 'old' }; recordGbpPublication(draft, null, () => '2026-09-04');
  assert.equal(gbpPublicationStatus(draft), 'owner-marked'); assert.equal(draft.text, 'Keep content'); assert.equal(draft.postError, undefined);
  recordGbpPublication(draft, { posted: true, name: 'accounts/1/locations/1/localPosts/1' });
  assert.equal(gbpPublicationStatus(draft), 'google-confirmed'); recordGbpPublication(draft); assert.equal(gbpPublicationStatus(draft), 'google-confirmed');
  assert.throws(() => recordGbpPublication({}, { posted: false }), /did not confirm/);
  assert.throws(() => recordGbpPublication({}, { posted: true }), /did not confirm/);
});
test('GBP endpoint cannot mark a draft posted without a Google receipt', async () => {
  const routes = new Map(); let marks = 0;
  registerDeliveryRoutes({ get() {}, post: (path, ...handlers) => routes.set(path, handlers) }, {
    requireAuth() {}, getGbpDraft: () => ({ text: 'draft' }), gbpConfigured: () => true,
    postGbpLocalPost: async () => ({ posted: false, needsSetup: true }), markGbpDraftPosted: () => marks++, logger: { error() {} },
  });
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await routes.get('/api/gbp-post').at(-1)({ body: {} }, res); assert.equal(res.code, 502); assert.equal(marks, 0);
});
