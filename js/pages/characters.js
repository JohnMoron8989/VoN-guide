(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var state = { view: 'cards', query: '', romance: 'all', season: 'all' };

  function rerender() { if (GUIDE.app) GUIDE.app.renderRoute(); }

  function birthdayText(character) {
    var t = GUIDE.i18n.t; var n = GUIDE.i18n.n;
    if (!character.birthday) return t('common.unknown');
    return t('characters.birthdayValue', { season: String(character.birthday.season), day: n(character.birthday.day) });
  }

  function preferenceGroup(label, ids, store) {
    var ui = GUIDE.ui;
    var knownIds = (ids || []).filter(function (id) {
      var item = store.getItem(id);
      return item && typeof item.name === 'string' && item.name.trim();
    });
    return ui.el('section', { className: 'preference-group' }, [
      ui.heading(4, label),
      knownIds.length ? ui.el('div', { className: 'chip-list' }, knownIds.map(function (id) { return ui.itemChip(id); })) : ui.emptyState('notYet')
    ]);
  }

  function giftPreferences(character, store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var gift = store.giftByCharacter.get(character.id);
    if (!gift) return ui.emptyState('notFound');
    return ui.el('div', { className: 'preference-groups' }, [
      preferenceGroup(t('reaction.loved'), gift.loved, store),
      preferenceGroup(t('reaction.liked'), gift.liked, store),
      preferenceGroup(t('reaction.neutral'), gift.neutral, store),
      preferenceGroup(t('reaction.disliked'), gift.disliked, store),
      preferenceGroup(t('reaction.hated'), gift.hated, store)
    ]);
  }

  function detail(character, context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var store = context.store;
    if (!character) return { node: ui.el('div', { className: 'page' }, [ui.heading(1, t('characters.notFound')), ui.emptyState('notFound'), ui.link('#/characters', t('common.back'))]), title: t('nav.characters') };
    var events = store.lists.events.filter(function (event) { return event.characterId === character.id; });
    var quests = store.questsByGiver.get(character.id) || [];
    var notice = ui.datasetNotice('characters');
    var node = ui.el('article', { className: 'page detail-page' }, [
      ui.link('#/characters', t('characters.backToList'), 'back-link'),
      notice,
      ui.el('header', { className: 'character-hero' }, [ui.spriteImage(character.portrait, '', 144, 'portrait'), ui.el('div', {}, [ui.heading(1, character.name), character.desc ? ui.el('p', { className: 'lede' }, character.desc) : ui.emptyState('unknown'), ui.el('dl', { className: 'facts' }, [
        ui.field(t('characters.birthday'), birthdayText(character)), ui.field(t('characters.home'), character.home || t('common.unknown')),
        ui.field(t('characters.romanceable'), character.romanceable === null ? t('common.unknown') : character.romanceable ? t('common.yes') : t('common.no'))
      ])])]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('characters.giftPreferences')), giftPreferences(character, store)]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('nav.events')), events.length ? ui.el('div', { className: 'card-list' }, events.map(function (event) { return ui.el('article', { className: 'mini-card' }, [ui.heading(3, event.title), ui.el('p', {}, event.summary)]); })) : ui.emptyState('notYet', t('empty.events'))]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('characters.relatedQuests')), quests.length ? ui.el('ul', { className: 'link-list' }, quests.map(function (quest) { return ui.el('li', {}, ui.link('#/quests/' + encodeURIComponent(quest.id), quest.title)); })) : ui.emptyState('notFound')])
    ]);
    return { node: node, title: character.name };
  }

  function list(context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var util = GUIDE.util; var store = context.store;
    var availableSeasons = new Set(store.lists.characters.filter(function (character) { return !!character.birthday; }).map(function (character) { return character.birthday.season; }));
    var seasons = ['spring', 'summer', 'autumn', 'winter', 'moonspring'].filter(function (seasonName) { return availableSeasons.has(seasonName); });
    var filtered = store.lists.characters.filter(function (character) {
      if (state.query && util.normalizeSearch(character.name).indexOf(util.normalizeSearch(state.query)) === -1) return false;
      if (state.romance === 'yes' && character.romanceable !== true) return false;
      if (state.romance === 'no' && character.romanceable !== false) return false;
      if (state.season !== 'all' && (!character.birthday || character.birthday.season !== state.season)) return false;
      return true;
    });
    var notice = ui.datasetNotice('characters');
    var search = ui.el('input', { id: 'characters-search', type: 'search', value: state.query, placeholder: t('characters.searchPlaceholder'), 'aria-label': t('characters.searchLabel'), onInput: util.debounce(function () {
      var restoreFocus = document.activeElement === search;
      var cursorStart = search.selectionStart;
      var cursorEnd = search.selectionEnd;
      state.query = search.value;
      rerender();
      if (restoreFocus) {
        var nextSearch = document.getElementById('characters-search');
        if (nextSearch) {
          nextSearch.focus({ preventScroll: true });
          nextSearch.setSelectionRange(cursorStart, cursorEnd);
        }
      }
    }, 150) });
    var romance = ui.el('select', { 'aria-label': t('characters.romanceFilter'), onChange: function () { state.romance = romance.value; rerender(); } }, [
      ui.el('option', { value: 'all', selected: state.romance === 'all' }, t('common.all')),
      ui.el('option', { value: 'yes', selected: state.romance === 'yes' }, t('characters.romanceYes')),
      ui.el('option', { value: 'no', selected: state.romance === 'no' }, t('characters.romanceNo'))
    ]);
    var season = ui.el('select', { 'aria-label': t('characters.seasonFilter'), onChange: function () { state.season = season.value; rerender(); } }, [ui.el('option', { value: 'all', selected: state.season === 'all' }, t('common.all'))].concat(seasons.map(function (value) { return ui.el('option', { value: value, selected: state.season === value }, value); })));

    var cards = ui.el('div', { className: 'character-grid' }, filtered.map(function (character) {
      return ui.el('a', { href: '#/characters/' + character.id, className: 'character-card' }, [ui.spriteImage(character.portrait, '', 96, 'portrait'), ui.heading(2, character.name)]);
    }));
    var calendar = ui.el('div', { className: 'birthday-calendar' }, seasons.map(function (seasonName) {
      var people = filtered.filter(function (character) { return character.birthday && character.birthday.season === seasonName; }).sort(function (a, b) { return a.birthday.day - b.birthday.day; });
      return ui.el('section', { className: 'calendar-column' }, [ui.heading(2, seasonName), people.length ? ui.el('ol', { className: 'calendar-list' }, people.map(function (character) {
        return ui.el('li', {}, [ui.badge(GUIDE.i18n.n(character.birthday.day), 'day'), ui.link('#/characters/' + character.id, character.name)]);
      })) : ui.emptyState('noResults')]);
    }));
    var node = ui.el('div', { className: 'page' }, [
      ui.heading(1, t('nav.characters')), notice,
      ui.tabs({ active: state.view, label: t('characters.viewLabel'), tabs: [{ id: 'cards', label: t('characters.cardView') }, { id: 'calendar', label: t('characters.calendarView') }], onChange: function (value) { state.view = value; rerender(); } }),
      ui.el('div', { className: 'filters' }, [ui.el('label', {}, [ui.el('span', {}, t('common.search')), search]), ui.el('label', {}, [ui.el('span', {}, t('characters.romanceable')), romance]), ui.el('label', {}, [ui.el('span', {}, t('characters.birthdaySeason')), season])]),
      filtered.length ? (state.view === 'calendar' ? calendar : cards) : ui.emptyState('noResults')
    ]);
    return { node: node, title: t('nav.characters') };
  }

  GUIDE.pages.characters = {
    render: function (route, context) { return route.id !== null && route.id !== undefined ? detail(context.store.getCharacter(route.id), context) : list(context); }
  };
})(window);
