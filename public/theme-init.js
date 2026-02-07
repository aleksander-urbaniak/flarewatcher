(function () {
  try {
    var key = 'flarewatcher:theme';
    var mode = localStorage.getItem(key) || 'system';
    var root = document.documentElement;
    var body = document.body;
    root.dataset.theme = mode;
    body.dataset.theme = mode;
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = mode === 'dark' || (mode === 'system' && prefersDark);
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
    body.classList.toggle('theme-dark', isDark);
    body.classList.toggle('theme-light', !isDark);
  } catch (e) {}
})();
