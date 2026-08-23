/* Dark / light theme toggle with persisted preference. */

const Theme = (() => {
  const STORAGE_KEY = 'quickdrop-theme';
  const root = document.documentElement;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* localStorage unavailable (private mode) — theme just won't persist */
    }
  }

  function init() {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(saved || (prefersDark ? 'dark' : 'dark')); // default to dark theme (matches product identity)

    document.getElementById('themeToggle').addEventListener('click', toggle);
  }

  function toggle() {
    const current = root.getAttribute('data-theme');
    apply(current === 'dark' ? 'light' : 'dark');
  }

  return { init };
})();

Theme.init();
