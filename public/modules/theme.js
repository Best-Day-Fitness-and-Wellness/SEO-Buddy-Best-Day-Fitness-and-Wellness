'use strict';

(function initializeTheme() {
  try {
    if (localStorage.getItem('seo_theme') === 'dark') document.body.classList.add('dark');
  } catch (_) { /* browser storage can be disabled */ }

  const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function sync() {
    const dark = document.body.classList.contains('dark');
    const icon = document.getElementById('theme-ic');
    const label = document.getElementById('theme-label');
    if (icon) icon.innerHTML = dark ? MOON : SUN;
    if (label) label.textContent = dark ? 'Dark mode' : 'Light mode';
  }

  document.addEventListener('DOMContentLoaded', () => {
    sync();
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    button.addEventListener('click', () => {
      const dark = !document.body.classList.contains('dark');
      document.body.classList.toggle('dark', dark);
      try { localStorage.setItem('seo_theme', dark ? 'dark' : 'light'); } catch (_) { /* best effort */ }
      sync();
    });
  });
})();
