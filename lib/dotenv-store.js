'use strict';

const dotenv = require('dotenv');

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Encode one value using a representation that dotenv proves it can read
 * back byte-for-byte. Trying the parser is important: double quotes expand
 * backslash escapes, while single quotes and unquoted values have different
 * edge cases around quotes, comments, whitespace, and multiline content.
 */
function encodeDotenvEntry(key, value) {
  if (!ENV_KEY.test(key)) throw new TypeError(`Invalid environment key: ${key}`);

  const expected = String(value);
  const candidates = [
    `${key}=${JSON.stringify(expected)}`,
    `${key}='${expected}'`,
    `${key}=${expected}`,
  ];

  for (const candidate of candidates) {
    const parsed = dotenv.parse(candidate);
    const keys = Object.keys(parsed);
    if (keys.length === 1 && keys[0] === key && parsed[key] === expected) {
      return candidate;
    }
  }

  throw new TypeError(`Cannot safely persist ${key} in dotenv format`);
}

function serializeDotenv(values) {
  const lines = Object.entries(values)
    .filter(([, value]) => value != null && String(value) !== '')
    .map(([key, value]) => encodeDotenvEntry(key, value));
  return lines.length ? `${lines.join('\n')}\n` : '';
}

module.exports = { encodeDotenvEntry, serializeDotenv };
