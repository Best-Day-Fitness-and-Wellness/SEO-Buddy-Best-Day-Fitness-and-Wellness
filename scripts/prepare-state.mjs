import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const { createFileStateRepository } = require('../lib/state-repository.js');
const { createPostgresStore } = require('../lib/postgres-store.js');
const { replayPostgresOutbox } = require('../lib/postgres-state-bridge.js');
const { createPostgresJobQueue } = require('../lib/postgres-job-queue.js');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storageRoot = resolve(process.env.DATA_DIR || projectRoot);
dotenv.config({ path: resolve(storageRoot, '.env') });

const mode = String(process.env.STATE_BACKEND || 'filesystem').trim().toLowerCase();
if (!['filesystem', 'postgres'].includes(mode)) throw new Error('STATE_BACKEND must be filesystem or postgres.');

if (mode === 'postgres') {
  if (!process.env.DATABASE_URL) throw new Error('STATE_BACKEND=postgres requires DATABASE_URL.');
  const repository = createFileStateRepository({ storageRoot, tenantId: process.env.TENANT_ID || 'best-day-fitness' });
  const postgres = createPostgresStore({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL !== 'disable' });
  try {
    const migrations = await postgres.migrate(resolve(projectRoot, 'migrations'));
    const replayed = await replayPostgresOutbox({ repository, store: postgres });
    let states = await postgres.listStates(repository.tenantId);
    let seeded = 0;
    if (!states.length) {
      seeded = await postgres.syncFrom(repository);
      states = await postgres.listStates(repository.tenantId);
    }
    for (const state of states) repository.writeJson(state.state_key, state.payload);
    const jobQueue = createPostgresJobQueue({ pool: postgres.pool, tenantId: repository.tenantId });
    const fileJobs = repository.readJson('jobs.json', { jobs: [] });
    const importedJobs = await jobQueue.importJobs(fileJobs.jobs);
    console.log(JSON.stringify({ success: true, mode, tenantId: repository.tenantId, migrations, replayed, seeded, hydrated: states.length, importedJobs }));
  } finally {
    await postgres.close();
  }
}
