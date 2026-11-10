(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  var i18n = GUIDE.i18n; var ui = GUIDE.ui; var util = GUIDE.util;
  var appRoot = null; var store = null; var loadResult = null; var router = null; var main = null; var searchController = null; var lastRouteKey = null;
  var scrollResetToken = 0; var savedScrollBehavior = null;

  function t(key, params) { return i18n.t(key, params); }

  function gameName() {
    var name = store && store.data.meta.gameName;
    return name && name !== 'unknown' ? name : t('app.fallbackName');
  }

  function themeFromStorage() {
    var value = util.safeGet(root.localStorage, 'guide.theme', 'dark');
    return value === 'light' ? 'light' : 'dark';
  }

  function applyTheme(value) {
    document.documentElement.setAttribute('data-theme', value);
    util.safeSet(root.localStorage, 'guide.theme', value);
    var button = document.getElementById('theme-toggle');
    if (button) {
      var label = value === 'dark' ? t('theme.light') : t('theme.dark');
      button.setAttribute('aria-label', label); button.setAttribute('title', label);
    }
  }

  function localeCodeLabel(code) {
    if (code === 'id') return t('language.code.id');
    return t('language.code.en');
  }

  function navItems() {
    return [
      { page: 'home', href: '#/', label: t('nav.home') }, { page: 'characters', href: '#/characters', label: t('nav.characters') },
      { page: 'fishing', href: '#/fishing', label: t('nav.fishing') },
      { page: 'events', href: '#/events', label: t('nav.events') }, { page: 'quests', href: '#/quests', label: t('nav.quests') },
      { page: 'recipes', href: '#/recipes', label: t('nav.recipes') }
    ];
  }

  function buildShell() {
    var currentRoute = router ? router.current() : { page: 'home' };
    if (searchController) searchController.close();
    var menuButton = ui.button(t('nav.toggle'), function () {
      shell.classList.toggle('menu-open');
      if (!shell.classList.contains('menu-open') && searchController) searchController.close();
    }, { className: 'menu-button', 'aria-label': t('nav.toggle'), 'aria-controls': 'side-nav' });
    var brand = ui.link('#/', gameName(), 'brand');
    var searchInput = ui.el('input', { id: 'global-search', type: 'search', role: 'combobox', autocomplete: 'off', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'search-results', placeholder: t('search.placeholder'), 'aria-label': t('search.label') });
    var searchResults = ui.el('div', { id: 'search-results', className: 'search-results', role: 'listbox', hidden: true });
    var theme = ui.button('', function () { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }, { id: 'theme-toggle', className: 'theme-toggle' });
    theme.appendChild(ui.el('span', { className: 'theme-icon', 'aria-hidden': 'true' }));
    var actions = ui.el('div', { className: 'header-actions' }, [theme]);
    if (i18n.available().length > 1) {
      var languages = i18n.available();
      var currentLanguage = i18n.getLocale();
      var currentIndex = Math.max(0, languages.indexOf(currentLanguage));
      var nextLanguage = languages[(currentIndex + 1) % languages.length];
      var languageLabel = t('language.switchTo', { language: i18n.localeLabel(nextLanguage) });
      var language = ui.button(localeCodeLabel(currentLanguage), function () { i18n.setLocale(nextLanguage); }, {
        id: 'language-toggle', className: 'language-toggle', 'aria-label': languageLabel, title: languageLabel
      });
      actions.insertBefore(language, theme);
    }
    var nav = ui.el('nav', { id: 'side-nav', className: 'side-nav', 'aria-label': t('nav.primary') }, ui.el('ul', {}, navItems().map(function (item) {
      return ui.el('li', {}, ui.el('a', { href: item.href, className: item.page === currentRoute.page ? 'active' : '', 'aria-current': item.page === currentRoute.page ? 'page' : null }, item.label));
    })));
    var header = ui.el('header', { className: 'site-header' }, [menuButton, brand, ui.el('div', { className: 'global-search' }, [searchInput, searchResults]), actions]);
    main = ui.el('main', { id: 'main-content', className: 'main-content', tabindex: '-1' });
    var footerTemplate = t('footer.support'); var footerMarker = '{icon}'; var footerMarkerIndex = footerTemplate.indexOf(footerMarker);
    var footerContent = footerMarkerIndex === -1 ? footerTemplate : [
      footerTemplate.slice(0, footerMarkerIndex).trimEnd(),
      ui.el('img', { className: 'footer-cendol-icon', src: 'assets/icons/cendol_icon.svg', alt: '', 'aria-hidden': 'true' }),
      footerTemplate.slice(footerMarkerIndex + footerMarker.length).trimStart()
    ];
    var footer = ui.el('footer', { className: 'site-footer' }, ui.el('a', { href: 'https://trakteer.id/demon_lord14', target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('footer.supportLabel') }, footerContent));
    var shell = ui.el('div', { className: 'app-shell' }, [header, nav, main, footer]);
    appRoot.replaceChildren(shell);
    applyTheme(themeFromStorage());
    searchController = GUIDE.search.init(searchInput, searchResults, store, ui, i18n);
  }

  function updateNavigation(route) {
    document.querySelectorAll('.side-nav a').forEach(function (link) {
      var page = GUIDE.router.parse(link.getAttribute('href')).page; var active = page === route.page;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    var shell = document.querySelector('.app-shell'); if (shell) shell.classList.remove('menu-open');
  }

  function routeKey(route) {
    return [route.page || '', route.id === null || route.id === undefined ? '' : String(route.id), route.unknown ? 'unknown' : 'known'].join('|');
  }

  function resetPageScroll() {
    var token = ++scrollResetToken;
    var html = document.documentElement;
    if (savedScrollBehavior === null) savedScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    function reset() {
      html.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (main) main.scrollTop = 0;
      root.scrollTo(0, 0);
    }
    reset();
    root.requestAnimationFrame(function () {
      reset();
      root.requestAnimationFrame(function () {
        if (token !== scrollResetToken) return;
        reset();
        html.style.scrollBehavior = savedScrollBehavior;
        savedScrollBehavior = null;
      });
    });
  }

  function renderRoute(route) {
    if (!store || !main) return;
    var nextRouteKey = routeKey(route); var changedPage = nextRouteKey !== lastRouteKey;
    var page = GUIDE.pages[route.page] || GUIDE.pages.home; var result = page.render(route, { store: store, source: loadResult.source });
    main.replaceChildren(result.node); updateNavigation(route);
    document.title = t('app.documentTitle', { page: result.title, game: gameName() });
    main.focus({ preventScroll: true });
    lastRouteKey = nextRouteKey;
    if (changedPage) resetPageScroll();
  }

  function renderFailure() {
    var failure = ui.el('main', { id: 'main-content', className: 'boot failure', tabindex: '-1' }, [
      ui.heading(1, t('data.failed.title')), ui.el('p', {}, t('data.failed.intro')), ui.el('ol', {}, [ui.el('li', {}, t('data.failed.server')), ui.el('li', {}, t('data.failed.bundle'))])
    ]);
    appRoot.replaceChildren(failure); document.title = t('data.failed.title'); failure.focus();
  }

  function updateProgress(name, current, total) {
    var progress = document.getElementById('boot-progress'); var status = document.getElementById('boot-status');
    if (progress) { progress.max = total; progress.value = current; }
    if (status) status.textContent = t('loading.dataset', { name: name, current: i18n.n(current), total: i18n.n(total) });
  }

  async function start() {
    appRoot = document.getElementById('app'); i18n.initialize(); i18n.apply(document); applyTheme(themeFromStorage());
    try { if ('scrollRestoration' in root.history) root.history.scrollRestoration = 'manual'; } catch (_) { /* Optional browser behavior. */ }
    loadResult = await GUIDE.data.loadBrowser(updateProgress);
    if (!loadResult.ok) { if (console && console.warn) console.warn(t('data.failed.title')); renderFailure(); return; }
    store = GUIDE.storeLogic.create(loadResult.datasets, i18n.getLocale()); ui.init(store);
    router = GUIDE.router.create(renderRoute); buildShell();
    GUIDE.app.store = store; GUIDE.app.renderRoute = function () { renderRoute(router.current()); };
    i18n.onChange(function () {
      store = GUIDE.storeLogic.create(loadResult.datasets, i18n.getLocale());
      ui.init(store); GUIDE.app.store = store;
      buildShell(); renderRoute(router.current());
    });
    router.start();
  }

  GUIDE.app = { start: start, renderRoute: function () {} };
  root.addEventListener('DOMContentLoaded', start, { once: true });
  root.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
      var input = document.getElementById('global-search');
      if (input) {
        event.preventDefault();
        var shell = document.querySelector('.app-shell');
        if (shell && root.matchMedia && root.matchMedia('(max-width: 850px)').matches) shell.classList.add('menu-open');
        input.focus();
      }
    }
  });
})(window);
