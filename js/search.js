(function (root, factory) {
  var util = root && root.GUIDE ? root.GUIDE.util : null;
  if (!util && typeof require === 'function') util = require('./util.js');
  var api = factory(util);
  if (root) { root.GUIDE = root.GUIDE || {}; root.GUIDE.search = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (util) {
  'use strict';
  function buildIndex(store) {
    var entries = [];
    var fishIds = new Set(store.lists.fish.map(function (value) { return Number(value.id); }));
    store.lists.characters.forEach(function (value) { entries.push({ id: value.id, name: value.name, type: 'character', icon: value.portrait, value: value }); });
    store.lists.items.forEach(function (value) { if (!fishIds.has(Number(value.id))) entries.push({ id: value.id, name: value.name && value.name.raw ? value.name.raw : value.name, type: 'item', icon: value.icon, value: value }); });
    store.lists.fish.forEach(function (value) { entries.push({ id: value.id, name: value.name, type: 'fish', icon: value.icon, value: value }); });
    store.lists.recipes.forEach(function (value) { var item = store.getItem(value.resultItemId); entries.push({ id: value.id, name: value.name, type: 'recipe', icon: item && item.icon, value: value }); });
    (store.lists.maps || store.lists.places || []).forEach(function (value) { entries.push({ id: value.id, name: value.name, type: 'map', icon: null, value: value }); });
    entries.forEach(function (entry) { entry.normalized = util.normalizeSearch(entry.name) + ' ' + util.normalizeSearch(entry.id); });
    return entries;
  }
  function query(index, value, limit) {
    var needle = util.normalizeSearch(value);
    if (!needle) return [];
    return index.filter(function (entry) { return entry.normalized.indexOf(needle) !== -1; }).sort(function (a, b) {
      var aStart = a.normalized.indexOf(needle) === 0 ? 0 : 1; var bStart = b.normalized.indexOf(needle) === 0 ? 0 : 1;
      return aStart - bStart || util.compareValues(a.name, b.name);
    }).slice(0, limit || 12);
  }
  function init(input, dropdown, store, ui, i18n) {
    var index = buildIndex(store); var active = -1;
    function close() { dropdown.hidden = true; dropdown.replaceChildren(); active = -1; input.setAttribute('aria-expanded', 'false'); }
    function choose(entry, trigger) {
      close(); input.value = '';
      if (entry.type === 'character') location.hash = '#/characters/' + entry.id;
      else if (entry.type === 'recipe') location.hash = '#/recipes/' + entry.id;
      else if (entry.type === 'map') location.hash = '#/maps/' + encodeURIComponent(entry.id);
      else if (entry.type === 'fish') ui.showItem(entry.id, trigger);
      else ui.showItem(entry.id, trigger);
    }
    function typeLabel(type) {
      if (type === 'character') return i18n.t('search.resultType.character');
      if (type === 'fish') return i18n.t('search.resultType.fish');
      if (type === 'item') return i18n.t('search.resultType.item');
      if (type === 'recipe') return i18n.t('search.resultType.recipe');
      if (type === 'map') return i18n.t('search.type.map');
      return i18n.t('common.unknown');
    }
    function render() {
      var results = query(index, input.value, 12); dropdown.replaceChildren(); active = -1;
      if (!input.value.trim()) { close(); return; }
      if (!results.length) dropdown.appendChild(ui.emptyState('noResults', i18n.t('search.noResults')));
      results.forEach(function (entry) {
        var attrs = entry.type === 'map' ? {
          href: '#/maps/' + encodeURIComponent(entry.id), className: 'search-result', role: 'option',
          onClick: function () { close(); input.value = ''; }
        } : { type: 'button', className: 'search-result', role: 'option' };
        var resultButton = ui.el(entry.type === 'map' ? 'a' : 'button', attrs, [
          ui.spriteImage(entry.icon, '', 32), ui.el('span', { className: 'search-result-name' }, String(entry.name)), ui.badge(typeLabel(entry.type), entry.type)
        ]);
        if (entry.type !== 'map') resultButton.addEventListener('click', function () { choose(entry, resultButton); });
        dropdown.appendChild(resultButton);
      });
      dropdown.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    input.addEventListener('input', util.debounce(render, 150));
    input.addEventListener('keydown', function (event) {
      var results = Array.from(dropdown.querySelectorAll('[role="option"]'));
      if (event.key === 'Escape') { close(); return; }
      if (!results.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter')) return;
      event.preventDefault();
      if (event.key === 'Enter' && active >= 0) { results[active].click(); return; }
      active = event.key === 'ArrowUp' ? Math.max(0, active - 1) : Math.min(results.length - 1, active + 1);
      results.forEach(function (node, indexValue) { node.setAttribute('aria-selected', String(indexValue === active)); });
      results[active].focus();
    });
    document.addEventListener('pointerdown', function (event) { if (!dropdown.contains(event.target) && event.target !== input) close(); });
    return { close: close, rebuild: function () { index = buildIndex(store); } };
  }
  return { buildIndex: buildIndex, query: query, init: init };
});
