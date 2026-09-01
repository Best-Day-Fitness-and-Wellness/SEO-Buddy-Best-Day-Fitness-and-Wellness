'use strict';

(function exposeBrandProfile(global) {
  const { authFetch, confirmAction } = global.SeoBuddyCore;

  // Brand voice profile. Everything the AI features write reads from this, so
  // it is edited here rather than in eight places in the server source.
  // ---------------------------------------------------------------------------
  const BP_FIELDS = {
    'bp-tagline': { key: 'tagline', list: false },
    'bp-audience': { key: 'audienceDescription', list: false },
    'bp-philosophy': { key: 'philosophy', list: false },
    'bp-tone': { key: 'tone', list: false },
    'bp-traits': { key: 'voiceTraits', list: true },
    'bp-style': { key: 'writingStyle', list: true },
    'bp-use': { key: 'usePhrases', list: true },
    'bp-never': { key: 'neverUse', list: true },
    'bp-not': { key: 'notPositioning', list: true },
    'bp-keywords': { key: 'localKeywords', list: true },
    'bp-cta-label': { key: 'ctaPrimaryLabel', list: false },
    'bp-cta-url': { key: 'ctaPrimaryUrl', list: false },
  };

  // One announcement, many listeners. The review state is shown on the owner's
  // Business card, the Today board, the Explore checklist and the setup wizard;
  // wiring the save button to each of them by name is how one of them gets
  // forgotten and starts contradicting the others.
  function bpAnnounceChange(payload) {
    document.dispatchEvent(new CustomEvent('seo:readiness-changed', {
      detail: { source: 'brand', reviewedAt: (payload && payload.reviewedAt) || null },
    }));
  }

  function bpMsg(text, cls) {
    const el = document.getElementById('bp-msg');
    if (!el) return;
    el.className = 'bp-msg' + (cls ? ' ' + cls : '');
    el.textContent = text || '';
  }

  function bpFill(brand) {
    if (!brand) return;
    for (const [id, f] of Object.entries(BP_FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const v = brand[f.key];
      el.value = f.list ? (Array.isArray(v) ? v.join('\n') : '') : (v || '');
    }
  }

  function bpCollect() {
    const out = {};
    for (const [id, f] of Object.entries(BP_FIELDS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      out[f.key] = f.list
        ? el.value.split('\n').map(x => x.trim()).filter(Boolean)
        : el.value.trim();
    }
    return out;
  }

  async function bpLoad() {
    if (!document.getElementById('bp-card')) return;
    try {
      const j = await (await fetch('/api/brand-profile')).json();
      if (j && j.success) bpFill(j.brand);
    } catch (e) { bpMsg('Could not load the brand profile.', 'err'); }
  }

  const bpSaveBtn = document.getElementById('bp-save');
  if (bpSaveBtn) bpSaveBtn.addEventListener('click', async () => {
    bpSaveBtn.disabled = true;
    bpMsg('Saving…');
    try {
      const res = await authFetch('/api/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: bpCollect() }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed.');
      bpFill(j.brand);
      // Saving is what clears the "Not reviewed yet" badge, so the badge has to
      // move now — not on the owner's next tab change. If it does not move, the
      // owner reasonably concludes the save did not happen.
      bpAnnounceChange(j);
      bpMsg(j.persisted === false
        ? 'Saved for now, but it could not be written to disk — it will reset when the server restarts.'
        : (j.durable === false
          ? 'Saved — every AI feature uses this from now on. Note: this location has no persistent storage, so it resets on the next deploy.'
          : 'Saved — every AI feature uses this from now on.'),
        j.persisted === false ? 'err' : 'ok');
    } catch (err) {
      bpMsg(err.message, 'err');
    } finally {
      bpSaveBtn.disabled = false;
    }
  });

  const bpResetBtn = document.getElementById('bp-reset');
  if (bpResetBtn) bpResetBtn.addEventListener('click', async () => {
    if (!await confirmAction('Reset the brand voice back to the defaults built from your brand docs? Your edits will be replaced.')) return;
    bpResetBtn.disabled = true;
    try {
      const res = await authFetch('/api/brand-profile/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Reset failed.');
      bpFill(j.brand);
      bpAnnounceChange(j);
      bpMsg('Reset to defaults — read it through and save to confirm it again.', 'ok');
    } catch (err) {
      bpMsg(err.message, 'err');
    } finally {
      bpResetBtn.disabled = false;
    }
  });

  global.loadBrandProfile = bpLoad;


})(window);
