'use strict';

const DEFAULT_SERVICE = 'seo-buddy';
const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key)/i;

function sanitize(value, seen = new WeakSet(), depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : value.stack,
    };
  }
  if (typeof value !== 'object') return String(value);
  if (depth >= 6) return '[max-depth]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, seen, depth + 1));

  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, seen, depth + 1);
  }
  return clean;
}

function createLogger(options = {}) {
  const service = options.service || DEFAULT_SERVICE;
  const environment = options.environment || process.env.NODE_ENV || 'development';
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  function write(level, event, fields = {}) {
    const record = sanitize({
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      event,
      ...fields,
    });
    const stream = level === 'error' || level === 'warn' ? stderr : stdout;
    stream.write(`${JSON.stringify(record)}\n`);
  }

  return {
    debug(event, fields) { if (process.env.LOG_LEVEL === 'debug') write('debug', event, fields); },
    info(event, fields) { write('info', event, fields); },
    warn(event, fields) { write('warn', event, fields); },
    error(event, fields) { write('error', event, fields); },
  };
}

module.exports = { createLogger, sanitize };
