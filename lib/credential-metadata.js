'use strict';

const ALLOWED_PROVIDERS = new Set(['gemini', 'openai', 'perplexity', 'gohighlevel', 'search-console']);

function normalizeState(value) {
  const providers = {};
  if (value?.version === 1 && value.providers && typeof value.providers === 'object') {
    for (const [provider, entry] of Object.entries(value.providers)) {
      if (!ALLOWED_PROVIDERS.has(provider) || !Number.isFinite(Date.parse(entry?.lastReplacedAt))) continue;
      providers[provider] = { lastReplacedAt: new Date(entry.lastReplacedAt).toISOString() };
    }
  }
  return { version: 1, providers };
}

function createCredentialMetadata(options = {}) {
  const state = normalizeState(options.initialState);
  const save = typeof options.save === 'function' ? options.save : () => {};
  const now = options.now || (() => new Date());

  function record(providers) {
    const changed = [...new Set(Array.isArray(providers) ? providers : [])].filter(provider => ALLOWED_PROVIDERS.has(provider));
    if (!changed.length) return snapshot();
    const replacedAt = now().toISOString();
    for (const provider of changed) state.providers[provider] = { lastReplacedAt: replacedAt };
    save(snapshot());
    return snapshot();
  }

  function snapshot() {
    return { version: 1, providers: structuredClone(state.providers) };
  }

  return { record, snapshot };
}

module.exports = { ALLOWED_PROVIDERS, createCredentialMetadata, normalizeState };
