(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};

  GUIDE.pages.home = {
    render: function (route, context) {
      var ui = GUIDE.ui; var t = GUIDE.i18n.t; var n = GUIDE.i18n.n; var store = context.store;
      var meta = store.data.meta;
      var gameName = meta.gameName && meta.gameName !== 'unknown' ? meta.gameName : t('app.fallbackName');
      var sections = [
        { href: '#/characters', title: t('nav.characters'), count: store.lists.characters.length, desc: t('home.characters') },
        { href: '#/fishing', title: t('nav.fishing'), count: store.lists.fishing.length, desc: t('home.fishing') },
        { href: '#/events', title: t('nav.events'), count: store.lists.events.length, desc: t('home.events') },
        { href: '#/quests', title: t('nav.quests'), count: store.lists.quests.length, desc: t('home.quests') },
        { href: '#/recipes', title: t('nav.recipes'), count: store.lists.recipes.length, desc: t('home.recipes') }
      ];
      var node = ui.el('div', { className: 'page home-page' }, [
        ui.el('section', { className: 'hero' }, [ui.heading(1, gameName), ui.el('p', { className: 'lede' }, t('home.intro'))]),
        route.unknown ? ui.notice(t('route.unknown'), 'warning') : null,
        ui.el('section', { className: 'dashboard-grid', 'aria-label': t('home.sections') }, sections.map(function (section) {
          return ui.el('a', { href: section.href, className: 'dashboard-card' }, [ui.el('div', { className: 'dashboard-count' }, n(section.count)), ui.heading(2, section.title), ui.el('p', {}, section.desc)]);
        }))
      ]);
      return { node: node, title: t('nav.home') };
    }
  };
})(window);
