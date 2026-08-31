'use strict';

function createSwitchableJobQueue(initialQueue, initialName = 'filesystem') {
  let queue = initialQueue;
  let name = initialName;

  function setBackend(nextQueue, nextName) {
    if (!nextQueue) throw new TypeError('Job queue backend is required.');
    queue = nextQueue;
    name = String(nextName || 'custom');
  }

  const call = method => async (...args) => queue[method](...args);
  return {
    backend: () => name,
    setBackend,
    claim: call('claim'),
    complete: call('complete'),
    enqueue: call('enqueue'),
    fail: call('fail'),
    renewLease: call('renewLease'),
    snapshot: call('snapshot'),
  };
}

module.exports = { createSwitchableJobQueue };
