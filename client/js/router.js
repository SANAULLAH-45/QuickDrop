/* Minimal hash-based router. Each route renders a <template> into #app
   and runs an optional init function. */

const Router = (() => {
  const appRoot = document.getElementById('app');
  let currentCleanup = null;

  const routes = [
    { pattern: /^\/$/, template: 'tpl-home', init: () => App.initHome() },
    { pattern: /^\/create$/, template: 'tpl-create', init: () => App.initCreate() },
    { pattern: /^\/join$/, template: 'tpl-join', init: () => App.initJoin() },
    { pattern: /^\/room\/([A-Z0-9]{4,8})$/i, template: 'tpl-room', init: (code) => App.initRoom(code) },
    { pattern: /^\/expired$/, template: 'tpl-expired', init: () => {} }
  ];

  function navigate(path) {
    window.location.hash = `#${path}`;
  }

  function resolve() {
    const hash = window.location.hash.replace(/^#/, '') || '/';

    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { /* ignore */ }
      currentCleanup = null;
    }

    for (const route of routes) {
      const match = hash.match(route.pattern);
      if (match) {
        renderTemplate(route.template);
        currentCleanup = route.init(match[1]) || null;
        return;
      }
    }

    renderTemplate('tpl-404');
  }

  function renderTemplate(id) {
    const tpl = document.getElementById(id);
    appRoot.innerHTML = '';
    appRoot.appendChild(tpl.content.cloneNode(true));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function init() {
    window.addEventListener('hashchange', resolve);
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action], [data-nav]');
      if (!el) return;
      const action = el.dataset.action || el.dataset.nav;
      if (action === 'home') navigate('/');
      if (action === 'create-share') navigate('/create');
      if (action === 'join-share') navigate('/join');
    });
    resolve();
  }

  return { navigate, init };
})();
