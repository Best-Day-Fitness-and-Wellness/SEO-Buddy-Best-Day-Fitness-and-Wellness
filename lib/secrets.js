'use strict';

class SecretInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretInputError';
    this.statusCode = 400;
  }
}

function normalizeSecretInput(value, label, maxLength = 10000) {
  if (typeof value !== 'string') return '';
  const secret = value.trim();
  if (!secret) return '';
  if (secret.length > maxLength) throw new SecretInputError(`${label} is longer than expected.`);
  if (/[\u0000-\u001f\u007f]/.test(secret)) throw new SecretInputError(`${label} contains unsupported control characters.`);
  return secret;
}

module.exports = { SecretInputError, normalizeSecretInput };
