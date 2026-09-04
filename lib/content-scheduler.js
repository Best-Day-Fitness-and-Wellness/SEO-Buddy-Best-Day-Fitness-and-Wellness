'use strict';

// A persisted deadline, not process uptime, determines when content is due.
function createContentScheduler({ state, save, enqueue, timers = globalThis, now = Date.now, logger = console }) {
  let timer = null;
  let generation = 0;
  const interval = () => {
    const hours = Number(state.intervalHours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('Content interval must be between 1 and 720 hours.');
    return hours * 3600000;
  };
  function persist() { if (save() === false) throw new Error('Could not save the content schedule.'); }
  function stop() { generation++; if (timer) timers.clearTimeout(timer); timer = null; }
  function arm(token, retry = false) {
    if (token !== generation || !state.enabled) return;
    const delay = retry ? 60000 : Math.max(1000, Math.min(Date.parse(state.nextRunTime) - now(), 2147483647));
    timer = timers.setTimeout(() => tick(token), delay);
    timer.unref?.();
  }
  async function tick(token) {
    if (token !== generation || !state.enabled) return;
    const due = Date.parse(state.nextRunTime);
    if (due > now()) { arm(token); return; }
    try {
      const result = await enqueue('content.autopilot', {}, { idempotencyKey: `content.autopilot:scheduled:${new Date(due).toISOString()}`, maxAttempts: 5 });
      if (result?.error || !result?.job) throw new Error(result?.error || 'Content job was not acknowledged.');
      if (token !== generation || !state.enabled) return;
      const previous = state.nextRunTime;
      const step = interval();
      // One catch-up job, never a burst of every missed day.
      state.nextRunTime = new Date(due + (Math.floor((now() - due) / step) + 1) * step).toISOString();
      try { persist(); } catch (error) { state.nextRunTime = previous; throw error; }
      arm(token);
    } catch (error) {
      logger.error('[Content schedule]', error.message);
      arm(token, true);
    }
  }
  function start({ reset = false } = {}) {
    const previous = state.nextRunTime;
    const step = interval();
    if (reset || (state.enabled && !Number.isFinite(Date.parse(state.nextRunTime)))) {
      const last = Date.parse(state.lastRun);
      state.nextRunTime = new Date(!reset && Number.isFinite(last) ? last + step : now() + step).toISOString();
    }
    // Commit the full configuration before replacing an existing timer.
    try { persist(); } catch (error) { state.nextRunTime = previous; throw error; }
    stop();
    if (state.enabled) arm(generation);
  }
  return { start, stop };
}

module.exports = { createContentScheduler };
