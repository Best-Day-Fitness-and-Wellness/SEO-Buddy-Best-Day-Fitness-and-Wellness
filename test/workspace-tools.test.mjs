import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/modules/workspace.js', import.meta.url), 'utf8');

function harness(open = false) {
  const details = { open, hidden: false, matches: selector => selector === 'details' };
  const row = { dataset: { go: 'tab:summary-tab' }, textContent: 'Full dashboard', hidden: false };
  const group = { parentElement: details, querySelectorAll: () => [row] };
  const input = { value: '' }, count = {}, clear = {};
  // The disclosure is already constructed; exercise filtering through its public entry point.
  const elements = { 'exp-groups': { querySelectorAll: () => [] }, 'ws-tool-search': input, 'ws-tool-clear': clear, 'ws-tool-count': count };
  const window = { SeoBuddyCore: { uiEsc: String } };
  vm.runInNewContext(source, { window, document: { getElementById: id => elements[id], querySelectorAll: () => [group] } });
  return { details, row, group, clear, count, search(query) { input.value = query; window.SeoBuddyWorkspace.enhanceTools(); } };
}

test('clearing a tool search restores the initially collapsed advanced section', () => {
  const h = harness();
  h.search('dashboard');
  assert.equal(h.details.open, true);
  assert.equal(h.row.hidden, false);
  h.search('no-such-tool');
  assert.equal(h.details.hidden, true);
  h.search('dashboard');
  assert.equal(h.details.hidden, false);
  h.search('');
  assert.equal(h.details.open, false);
  assert.equal(h.details.hidden, false);
  assert.equal(h.clear.hidden, true);
  assert.equal(h.count.textContent, '1 destination available');
});

test('clearing a tool search preserves an advanced section the owner opened', () => {
  const h = harness(true);
  h.search('no-such-tool');
  h.search('dashboard');
  h.search('   ');
  assert.equal(h.details.open, true);
  assert.equal(h.group.hidden, false);
  h.details.open = false;
  h.search('dashboard');
  h.search('');
  assert.equal(h.details.open, false, 'Each new search remembers the current layout');
});
