import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { createFileStateRepository } = require('../lib/state-repository.js');
const { createBackupService } = require('../lib/backup-service.js');

const storageRoot = resolve(process.env.DATA_DIR || process.cwd());
const repository = createFileStateRepository({ storageRoot, tenantId: process.env.TENANT_ID || 'best-day-fitness' });
const backups = createBackupService({ repository, backupRoot: resolve(storageRoot, 'backups') });
const verifyIndex = process.argv.indexOf('--verify');
const result = verifyIndex >= 0 ? backups.verify(process.argv[verifyIndex + 1]) : backups.create();
if (!result.valid) process.exitCode = 1;
console.log(JSON.stringify(result));
