(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var state = { query: '', station: 'all' };

  function rerender() { if (GUIDE.app) GUIDE.app.renderRoute(); }

  function ingredientNode(ingredient) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var ids = GUIDE.util.asArray(ingredient.itemId);
    if (GUIDE.util.isRaw(ingredient.itemId)) return ui.el('span', {}, [ui.rawValue(ingredient.itemId), ui.badge(t('item.count', { count: GUIDE.i18n.n(ingredient.count) }), 'count')]);
    return ui.el('div', { className: 'ingredient-row' }, [
      ids.length > 1 ? ui.badge(t('recipes.anyOf'), 'choice') : null,
      ui.el('div', { className: 'chip-list' }, ids.map(function (id) { return ui.itemChip(id); })),
      ui.badge(t('item.count', { count: GUIDE.i18n.n(ingredient.count) }), 'count')
    ]);
  }

  function recipeCard(recipe, store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var result = store.getItem(recipe.resultItemId);
    return ui.el('article', { className: 'recipe-card' }, [
      ui.el('div', { className: 'recipe-card-header' }, ui.itemChip(recipe.resultItemId, { className: 'recipe-name-button' })),
      result && result.desc ? ui.el('p', {}, GUIDE.util.isRaw(result.desc) ? ui.rawValue(result.desc) : result.desc) : null,
      ui.el('div', { className: 'recipe-card-actions' }, ui.link('#/recipes/' + recipe.id, t('recipes.openDetails'), 'button-link'))
    ]);
  }

  function detail(recipe, context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    if (!recipe) return { node: ui.el('div', { className: 'page' }, [ui.heading(1, t('recipes.notFound')), ui.emptyState('notFound'), ui.link('#/recipes', t('common.back'))]), title: t('nav.recipes') };
    var node = ui.el('article', { className: 'page detail-page' }, [
      ui.link('#/recipes', t('recipes.backToList'), 'back-link'), ui.datasetNotice('recipes'),
      ui.el('header', { className: 'recipe-detail-header' }, ui.heading(1, recipe.name)),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('recipes.ingredients')), recipe.ingredients.length ? ui.el('div', { className: 'ingredient-list' }, recipe.ingredients.map(ingredientNode)) : ui.emptyState('notFound')])
    ]);
    return { node: node, title: recipe.name };
  }

  function list(context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var util = GUIDE.util; var store = context.store;
    var tabs = [{ id: 'all', label: t('common.all') }];
    var stations = util.unique(store.lists.recipes.map(function (recipe) { return recipe.station && recipe.station.raw ? recipe.station.raw : recipe.station; })).filter(Boolean).sort(util.compareValues);
    var search = ui.el('input', { id: 'recipes-search', type: 'search', value: state.query, placeholder: t('recipes.searchPlaceholder'), 'aria-label': t('recipes.searchLabel'), onInput: util.debounce(function () {
      var restoreFocus = document.activeElement === search;
      var cursorStart = search.selectionStart;
      var cursorEnd = search.selectionEnd;
      state.query = search.value;
      rerender();
      if (restoreFocus) {
        var nextSearch = document.getElementById('recipes-search');
        if (nextSearch) {
          nextSearch.focus({ preventScroll: true });
          nextSearch.setSelectionRange(cursorStart, cursorEnd);
        }
      }
    }, 150) });
    var station = ui.el('select', { 'aria-label': t('recipes.stationFilter'), onChange: function () { state.station = station.value; rerender(); } }, [ui.el('option', { value: 'all', selected: state.station === 'all' }, t('common.all'))].concat(stations.map(function (value) { return ui.el('option', { value: value, selected: state.station === value }, value); })));
    var filtered = store.lists.recipes.filter(function (recipe) {
      if (state.station !== 'all' && (recipe.station && recipe.station.raw ? recipe.station.raw : recipe.station) !== state.station) return false;
      if (state.query && util.normalizeSearch(recipe.name).indexOf(util.normalizeSearch(state.query)) === -1) return false;
      return true;
    });
    var node = ui.el('div', { className: 'page' }, [
      ui.heading(1, t('nav.recipes')), ui.datasetNotice('recipes'),
      ui.tabs({ active: 'all', label: t('recipes.statusTabs'), tabs: tabs, onChange: function () {} }),
      ui.el('div', { className: 'filters recipe-filters' }, [ui.el('label', {}, [ui.el('span', {}, t('common.search')), search]), ui.el('label', {}, [ui.el('span', {}, t('recipes.station')), station])]),
      filtered.length ? ui.el('div', { className: 'recipe-grid' }, filtered.map(function (recipe) { return recipeCard(recipe, store); })) : ui.emptyState('noResults')
    ]);
    return { node: node, title: t('nav.recipes') };
  }

  GUIDE.pages.recipes = { render: function (route, context) { return route.id !== null && route.id !== undefined ? detail(context.store.getRecipe(route.id), context) : list(context); } };
})(window);
