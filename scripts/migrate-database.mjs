import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createFileStateRepository } = require('../lib/state-repository.js');
const { createPostgresStore } = require('../lib/postgres-store.js');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storageRoot = resolve(process.env.DATA_DIR || projectRoot);
const repository = createFileStateRepository({ storageRoot, tenantId: process.env.TENANT_ID || 'best-day-fitness' });
const postgres = createPostgresStore({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL !== 'disable' });

try {
  const migrations = await postgres.migrate(resolve(projectRoot, 'migrations'));
  const synced = await postgres.syncFrom(repository);
  const health = await postgres.health();
  console.log(JSON.stringify({ success: true, tenantId: repository.tenantId, migrations, synced, health }));
} finally {
  await postgres.close();
}
