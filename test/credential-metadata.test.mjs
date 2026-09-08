import test from 'node:test';
import assert from 'node:assert/strict';
import metadataModule from '../lib/credential-metadata.js';

const { createCredentialMetadata, normalizeState } = metadataModule;

test('credential metadata keeps only allowlisted provider timestamps', () => {
  assert.deepEqual(normalizeState({ version: 1, providers: {
    gemini: { lastReplacedAt: '2026-09-08T12:00:00.000Z', secret: 'must-not-survive' },
    attacker: { lastReplacedAt: '2026-09-08T12:00:00.000Z' },
    openai: { lastReplacedAt: 'not-a-date' },
  } }), { version: 1, providers: { gemini: { lastReplacedAt: '2026-09-08T12:00:00.000Z' } } });
});

test('credential replacements share one timestamp and persist no credential values', () => {
  const writes = [];
  const metadata = createCredentialMetadata({
    now: () => new Date('2026-09-08T13:00:00.000Z'),
    save: state => writes.push(state),
  });
  const result = metadata.record(['gemini', 'gemini', 'gohighlevel', 'unknown-provider']);
  assert.deepEqual(result, { version: 1, providers: {
    gemini: { lastReplacedAt: '2026-09-08T13:00:00.000Z' },
    gohighlevel: { lastReplacedAt: '2026-09-08T13:00:00.000Z' },
  } });
  assert.deepEqual(writes, [result]);
  assert.doesNotMatch(JSON.stringify(result), /key|token|secret/i);
});
