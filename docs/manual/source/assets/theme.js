(function () {
  const root = document.documentElement;
  const managed = root.dataset.edition === 'offline';
  const valid = value => ['light', 'dark', 'system'].includes(value);
  const apply = value => {
    if (!valid(value)) return;
    root.dataset.preference = value;
    root.dataset.theme = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  };
  let preference = 'system';
  if (managed) {
    preference = document.querySelector('meta[name="eu5-app-theme"]')?.content || 'system';
    // Application state arrives before first paint and on live settings changes.
    // This event carries only an appearance value, with no privileged bridge.
    window.addEventListener('eu5-app-theme', event => apply(event.detail));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (root.dataset.preference === 'system') apply('system');
    });
  } else {
    try { preference = localStorage.getItem('eu5-population-editor-manual-theme') || 'system'; } catch (_) {}
  }
  apply(valid(preference) ? preference : 'system');
})();
