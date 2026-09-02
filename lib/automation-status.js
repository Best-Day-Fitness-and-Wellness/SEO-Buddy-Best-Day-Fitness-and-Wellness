'use strict';

const LABELS = Object.freeze({
  'needs-setup': 'Needs setup', scheduled: 'Scheduled', running: 'Running',
  'needs-approval': 'Needs approval', completed: 'Completed', failed: 'Failed',
  paused: 'Paused', unknown: 'Unable to check',
});
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

// A schedule is not proof of execution, and a completed queue check is not
// proof of publishing. Expose only bounded status evidence, never job payloads.
function buildAutomationStatus(features, queue, workerRunning, now = Date.now()) {
  const recent = Array.isArray(queue?.recent) ? queue.recent : [];
  return features.map(feature => {
    const jobs = recent.filter(job => job.type === feature.jobType)
      .sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
    const active = jobs.find(job => job.status === 'running' && timestamp(job.leaseUntil) > now);
    const failed = jobs.find(job => job.status === 'failed');
    const lastRecordedAt = timestamp(feature.lastRun) ? new Date(feature.lastRun).toISOString() : null;
    let status, reason;
    if (!feature.configured) {
      status = 'needs-setup'; reason = feature.setupReason || 'Connect the required accounts before this can run.';
    } else if (feature.running || active) {
      status = 'running'; reason = 'Work is in progress. Completion has not been confirmed yet.';
    } else if (feature.failed || (failed && timestamp(failed.updatedAt) > timestamp(lastRecordedAt))) {
      status = 'failed'; reason = 'The latest recorded attempt failed. Open the tool to review and retry.';
    } else if (feature.needsApproval) {
      status = 'needs-approval'; reason = 'A prepared draft needs review. It has not been published.';
    } else if (!workerRunning && feature.enabled) {
      status = 'unknown'; reason = 'The background worker is not available. The schedule is not verified.';
    } else if (feature.enabled) {
      status = 'scheduled'; reason = 'Enabled for scheduled checks; this does not mean new work has completed.';
    } else if (lastRecordedAt) {
      status = 'completed'; reason = 'Previous activity is recorded. Automatic runs are currently paused.';
    } else {
      status = 'paused'; reason = 'Automatic runs are off. Nothing has been recorded yet.';
    }
    const explicitNext = timestamp(feature.nextRun);
    const estimatedNext = lastRecordedAt && feature.intervalMs ? timestamp(lastRecordedAt) + feature.intervalMs : 0;
    const next = explicitNext || estimatedNext;
    return {
      key: feature.key, title: feature.title, tab: feature.tab, status, label: LABELS[status], reason,
      enabled: !!feature.enabled, lastRecordedAt,
      nextRunAt: feature.enabled && feature.configured && next ? new Date(next).toISOString() : null,
      nextRunEstimated: !explicitNext && !!estimatedNext,
    };
  });
}

function registerAutomationStatusRoute(app, { getFeatures, queue, worker }) {
  app.get('/api/automation-status', async (req, res) => {
    try {
      const features = buildAutomationStatus(getFeatures(), await queue.snapshot(100), worker.status().running);
      res.json({ success: true, checkedAt: new Date().toISOString(), features });
    } catch (_) {
      res.status(503).json({ success: false, error: 'Unable to verify automation status. Try again shortly.' });
    }
  });
}

module.exports = { buildAutomationStatus, registerAutomationStatusRoute };
