import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { createFileStateRepository } = require('../lib/state-repository.js');
const { createBackupService } = require('../lib/backup-service.js');

const backupIndex = process.argv.indexOf('--backup');
const confirmIndex = process.argv.indexOf('--confirm');
const backupId = backupIndex >= 0 ? process.argv[backupIndex + 1] : '';
const confirmation = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : '';
if (!backupId || confirmation !== `RESTORE ${backupId}`) {
  throw new Error('Restore refused. Provide --backup <id> --confirm "RESTORE <id>" while the application is stopped.');
}

const storageRoot = resolve(process.env.DATA_DIR || process.cwd());
const repository = createFileStateRepository({ storageRoot, tenantId: process.env.TENANT_ID || 'best-day-fitness' });
const backups = createBackupService({ repository, backupRoot: resolve(storageRoot, 'backups') });
const verified = backups.verify(backupId);
if (!verified.valid) throw new Error(verified.error || 'Backup verification failed.');
const safetyBackup = backups.create();
const restored = backups.restore(backupId);
console.log(JSON.stringify({ ...restored, safetyBackupId: safetyBackup.id }));
