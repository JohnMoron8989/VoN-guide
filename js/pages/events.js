(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var state = { query: '', character: 'all' };

  function rerender() { if (GUIDE.app) GUIDE.app.renderRoute(); }

  function eventCard(event, store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var character = store.getCharacter(event.characterId); var trigger = event.trigger || {};
    return ui.el('article', { className: 'panel event-card' }, [
      ui.heading(2, event.title), character ? ui.link('#/characters/' + character.id, character.name) : ui.badge(t('common.unknown'), 'unknown'),
      ui.el('p', {}, event.summary),
      ui.el('dl', {}, [
        ui.field(t('events.hearts'), trigger.hearts === null || trigger.hearts === undefined ? t('common.any') : GUIDE.i18n.n(trigger.hearts)),
        ui.field(t('fishing.season'), trigger.season || t('common.any')), ui.field(t('events.day'), trigger.day || t('common.any')),
        ui.field(t('fishing.place'), trigger.place || t('common.any')), ui.field(t('fishing.time'), trigger.time === null || trigger.time === undefined ? t('common.any') : JSON.stringify(trigger.time))
      ]),
      event.choices && event.choices.length ? ui.collapsible(t('events.choices'), ui.el('ol', {}, event.choices.map(function (choice) {
        return ui.el('li', {}, [ui.el('strong', {}, choice.text), ui.el('p', {}, choice.result), choice.points === null ? null : ui.badge(t('events.points', { points: GUIDE.i18n.n(choice.points) }), 'count')]);
      })), false) : null
    ]);
  }

  GUIDE.pages.events = {
    render: function (route, context) {
      var ui = GUIDE.ui; var t = GUIDE.i18n.t; var util = GUIDE.util; var store = context.store;
      if (!store.lists.events.length) {
        return {
          node: ui.el('div', { className: 'page' }, [ui.heading(1, t('events.title')), ui.emptyState('notYet', t('events.noData'))]),
          title: t('nav.events')
        };
      }
      var search = ui.el('input', { type: 'search', value: state.query, placeholder: t('events.searchPlaceholder'), 'aria-label': t('events.searchLabel'), onInput: util.debounce(function () { state.query = search.value; rerender(); }, 150) });
      var character = ui.el('select', { 'aria-label': t('events.characterFilter'), onChange: function () { state.character = character.value; rerender(); } }, [ui.el('option', { value: 'all', selected: state.character === 'all' }, t('common.all'))].concat(store.lists.characters.map(function (entry) {
        return ui.el('option', { value: entry.id, selected: String(entry.id) === state.character }, entry.name);
      })));
      var events = store.lists.events.filter(function (event) {
        if (state.character !== 'all' && String(event.characterId) !== state.character) return false;
        return !state.query || util.normalizeSearch(event.title + ' ' + event.summary).indexOf(util.normalizeSearch(state.query)) !== -1;
      });
      var node = ui.el('div', { className: 'page' }, [
        ui.heading(1, t('events.title')),
        ui.el('div', { className: 'filters' }, [ui.el('label', {}, [ui.el('span', {}, t('common.search')), search]), ui.el('label', {}, [ui.el('span', {}, t('nav.characters')), character])]),
        events.length ? ui.el('div', { className: 'card-list' }, events.map(function (event) { return eventCard(event, store); })) : ui.emptyState('noResults')
      ]);
      return { node: node, title: t('nav.events') };
    }
  };
})(window);
