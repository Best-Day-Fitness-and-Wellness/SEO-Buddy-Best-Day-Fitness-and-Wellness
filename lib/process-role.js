'use strict';

const PROCESS_ROLES = new Set(['all', 'web', 'worker']);

function resolveProcessRole(environment = process.env) {
  const role = String(environment.PROCESS_ROLE || 'all').trim().toLowerCase();
  if (!PROCESS_ROLES.has(role)) throw new Error('PROCESS_ROLE must be all, web, or worker.');
  return Object.freeze({
    name: role,
    servesWeb: role !== 'worker',
    schedules: role !== 'worker',
    worksJobs: role !== 'web',
  });
}

module.exports = { PROCESS_ROLES, resolveProcessRole };
