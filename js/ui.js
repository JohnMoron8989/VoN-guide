(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  var i18n = GUIDE.i18n;
  var util = GUIDE.util;
  var store = null;
  var lastFocus = null;
  var openDialog = null;
  var placeChipId = 0;

  function t(key, params) { return i18n.t(key, params); }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (entry) { append(parent, entry); });
    else if (child && child.nodeType) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (key.slice(0, 2) === 'on' && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden') node[key] = !!value;
      else if (key === 'value') node.value = value;
      else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
    });
    append(node, children);
    return node;
  }

  function button(label, onClick, attrs) {
    return el('button', Object.assign({ type: 'button', className: 'button', onClick: onClick }, attrs || {}), label);
  }

  function heading(level, text, className) {
    return el('h' + level, { className: className || '' }, text);
  }

  function link(href, label, className) {
    return el('a', { href: href, className: className || '' }, label);
  }

  function rawValue(value) {
    if (value === null || value === undefined || value === '') return el('span', { className: 'unknown' }, t('common.unknown'));
    if (util.isRaw(value)) {
      return tooltip(el('span', { className: 'raw-value' }, t('value.cannotCompute')), t('value.rawTitle', { raw: value.raw }));
    }
    if (typeof value === 'number') return document.createTextNode(i18n.n(value));
    return document.createTextNode(String(value));
  }

  function badge(label, kind) {
    return el('span', { className: 'badge badge-' + (kind || 'neutral') }, label);
  }

  function seasonBadge(season, label) {
    var value = String(season || '').toLocaleLowerCase();
    var known = ['spring', 'summer', 'autumn', 'winter', 'moonspring'].indexOf(value) !== -1;
    return badge(label === null || label === undefined ? String(season || t('common.unknown')) : label, known ? 'season season-' + value : 'season');
  }

  function placeChips(names, options) {
    options = options || {};
    var split = util.splitPlaces(names, options.max === undefined ? 3 : options.max);
    var allNames = split.visible.concat(split.hidden);
    if (!allNames.length) return el('span', { className: 'unknown' }, i18n.n(null));
    var expanded = !!options.expanded;
    var hiddenId = 'place-chips-hidden-' + (++placeChipId);
    function chip(name) { return el('span', { className: 'place-chip' }, name); }
    var hidden = el('span', { id: hiddenId, className: 'place-chip-items place-chip-items-hidden', hidden: !expanded }, split.hidden.map(chip));
    var toggle = null;
    function updateToggle() {
      if (!toggle) return;
      var places = allNames.join(t('common.listSeparator'));
      var label = expanded ? t('table.placesShowLess') : i18n.plural('table.placesMore', split.hiddenCount, { count: i18n.n(split.hiddenCount) });
      var fullLabel = expanded ? t('table.placesShowLessLabel', { places: places }) : i18n.plural('table.placesMoreLabel', split.hiddenCount, { count: i18n.n(split.hiddenCount), places: places });
      toggle.textContent = label;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', fullLabel);
      toggle.setAttribute('title', fullLabel);
    }
    var children = [el('span', { className: 'place-chip-items' }, split.visible.map(chip)), hidden];
    if (split.hiddenCount) {
      toggle = button('', function () {
        expanded = !expanded;
        hidden.hidden = !expanded;
        updateToggle();
        if (typeof options.onToggle === 'function') options.onToggle(expanded);
      }, { className: 'place-chip-toggle', 'aria-controls': hiddenId });
      updateToggle();
      children.push(toggle);
    }
    return el('div', { className: 'place-chips' }, children);
  }

  function tooltip(content, message) {
    return el('span', { className: 'tooltip', tabindex: '0', 'aria-label': message, title: message }, content);
  }

  function reactionLabel(reaction) {
    if (reaction === 'loved') return t('reaction.loved');
    if (reaction === 'liked') return t('reaction.liked');
    if (reaction === 'neutral') return t('reaction.neutral');
    if (reaction === 'disliked') return t('reaction.disliked');
    if (reaction === 'hated') return t('reaction.hated');
    return t('common.unknown');
  }

  function reactionBadge(reaction) {
    return badge(reactionLabel(reaction), 'reaction-' + reaction);
  }

  function spriteImage(spriteName, alt, size, className) {
    var sprite = spriteName && store ? store.sprites.get(spriteName) : null;
    var dimension = size || 48;
    if (!sprite || !sprite.path) {
      return el('span', {
        className: 'image-placeholder ' + (className || ''),
        role: 'img',
        'aria-label': t('image.missing'),
        style: '--image-size:' + dimension + 'px'
      }, t('image.placeholder'));
    }
    var image = el('img', {
      className: 'pixel-icon ' + (className || ''),
      src: sprite.path,
      alt: alt || '',
      width: dimension,
      height: dimension,
      loading: 'lazy'
    });
    image.addEventListener('error', function () { image.replaceWith(spriteImage(null, '', dimension, className)); }, { once: true });
    return image;
  }

  function itemChip(itemId, options) {
    options = options || {};
    var item = store && store.getItem(itemId);
    var name = item ? String(item.name && item.name.raw ? item.name.raw : item.name) : t('item.unknownId', { id: i18n.n(itemId) });
    var chip = el('button', {
      type: 'button', className: 'item-chip' + (options.className ? ' ' + options.className : ''), 'aria-label': t('item.open', { name: name }),
      onClick: function () { showItem(itemId, chip); }
    }, [options.hideIcon ? null : spriteImage(item && item.icon, '', 28), el('span', {}, name)]);
    if (options.count !== null && options.count !== undefined) chip.appendChild(badge(t('item.count', { count: i18n.n(options.count) }), 'count'));
    return chip;
  }

  function emptyState(kind, message) {
    var defaultMessage;
    if (kind === 'notFound') defaultMessage = t('empty.notFound');
    else if (kind === 'unknown') defaultMessage = t('empty.unknown');
    else if (kind === 'noResults') defaultMessage = t('empty.noResults');
    else defaultMessage = t('empty.notYet');
    return el('div', { className: 'empty-state', role: 'status' }, [el('div', { className: 'empty-mark', 'aria-hidden': 'true' }), el('p', {}, message || defaultMessage)]);
  }

  function notice(message, kind) {
    return el('div', { className: 'notice notice-' + (kind || 'info'), role: 'status' }, message);
  }

  function datasetNotice(name) {
    return null;
  }

  function field(label, value) {
    return el('div', { className: 'field' }, [el('dt', {}, label), el('dd', {}, value)]);
  }

  function tabs(config) {
    var wrapper = el('div', { className: 'tabs' });
    var list = el('div', { className: 'tab-list', role: 'tablist', 'aria-label': config.label });
    config.tabs.forEach(function (tab, index) {
      var tabButton = el('button', {
        type: 'button', className: 'tab-button' + (tab.id === config.active ? ' active' : ''), role: 'tab',
        'aria-selected': String(tab.id === config.active), tabindex: tab.id === config.active ? '0' : '-1',
        onClick: function () { config.onChange(tab.id); },
        onKeydown: function (event) {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          var direction = event.key === 'ArrowRight' ? 1 : -1;
          var next = (index + direction + config.tabs.length) % config.tabs.length;
          list.querySelectorAll('[role="tab"]')[next].focus();
          config.onChange(config.tabs[next].id);
        }
      }, tab.label);
      list.appendChild(tabButton);
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  function collapsible(title, content, open) {
    return el('details', { className: 'collapsible', open: !!open }, [el('summary', {}, title), el('div', { className: 'collapsible-body' }, content)]);
  }

  function pager(page, pages, onChange) {
    if (pages <= 1) return null;
    return el('nav', { className: 'pager', 'aria-label': t('table.pagination') }, [
      button(t('common.previous'), function () { onChange(Math.max(0, page - 1)); }, { disabled: page <= 0 }),
      el('span', {}, t('table.page', { page: i18n.n(page + 1), pages: i18n.n(pages) })),
      button(t('common.next'), function () { onChange(Math.min(pages - 1, page + 1)); }, { disabled: page >= pages - 1 })
    ]);
  }

  function table(config) {
    var wrapper = el('div', { className: 'data-table-wrap' + (config.cards ? ' data-table-cards-wrap' : '') });
    var state = { sort: config.sort || null, direction: 1, page: 0, query: '' };
    var size = config.pageSize || (config.rows.length > 300 ? 100 : config.rows.length || 1);
    if (config.filterable) {
      var filter = el('input', {
        type: 'search', className: 'table-filter', placeholder: t('table.filterPlaceholder'), 'aria-label': t('table.filterLabel'),
        onInput: util.debounce(function () { state.query = util.normalizeSearch(filter.value); state.page = 0; draw(); }, 150)
      });
      wrapper.appendChild(filter);
    }
    var cardSortSelect = null;
    var cardDirection = null;
    if (config.cards) {
      var sortableColumns = config.columns.filter(function (column) { return column.sortable !== false; });
      cardSortSelect = el('select', { 'aria-label': t('table.sortByMobile'), onChange: function () {
        state.sort = cardSortSelect.value;
        state.direction = 1;
        state.page = 0;
        draw();
      } }, sortableColumns.map(function (column) { return el('option', { value: column.id, selected: column.id === state.sort }, column.label); }));
      cardDirection = button('', function () { state.direction *= -1; state.page = 0; draw(); }, { className: 'card-sort-direction' });
      wrapper.appendChild(el('div', { className: 'card-sort-controls' }, [
        el('label', {}, [el('span', {}, t('table.sortByMobile')), cardSortSelect]),
        cardDirection
      ]));
    }
    var host = el('div', { className: 'table-scroll' });
    var pagerHost = el('div');
    wrapper.appendChild(host);
    wrapper.appendChild(pagerHost);

    function draw() {
      if (cardSortSelect) cardSortSelect.value = state.sort || '';
      if (cardDirection) {
        var directionLabel = state.direction === 1 ? t('table.sortAscending') : t('table.sortDescending');
        cardDirection.textContent = directionLabel;
        cardDirection.setAttribute('aria-label', t('table.sortDirection', { direction: directionLabel }));
      }
      var rows = config.rows.slice();
      if (state.query) rows = rows.filter(function (row) { return util.normalizeSearch(config.filterText ? config.filterText(row) : JSON.stringify(row)).indexOf(state.query) !== -1; });
      if (state.sort) {
        var column = config.columns.find(function (entry) { return entry.id === state.sort; });
        if (column) rows.sort(function (a, b) {
          var av = column.sortValue ? column.sortValue(a) : a[column.id];
          var bv = column.sortValue ? column.sortValue(b) : b[column.id];
          return util.compareValues(av, bv) * state.direction;
        });
      }
      var pages = Math.max(1, Math.ceil(rows.length / size));
      state.page = Math.min(state.page, pages - 1);
      var shown = rows.slice(state.page * size, state.page * size + size);
      var tableNode = el('table', { className: 'data-table ' + (config.cards ? 'table--cards ' : '') + (config.className || ''), role: config.cards ? 'table' : null });
      var headerRow = el('tr', { role: config.cards ? 'row' : null });
      config.columns.forEach(function (column) {
        var header = el('th', { scope: 'col', className: column.className || '', role: config.cards ? 'columnheader' : null, 'aria-sort': config.cards && state.sort === column.id ? (state.direction === 1 ? 'ascending' : 'descending') : null });
        if (column.sortable === false) header.appendChild(document.createTextNode(column.label));
        else header.appendChild(el('button', {
          type: 'button', className: 'sort-button', 'aria-label': t('table.sortBy', { name: column.label }),
          onClick: function () {
            if (state.sort === column.id) state.direction *= -1;
            else { state.sort = column.id; state.direction = 1; }
            state.page = 0; draw();
          }
        }, column.label));
        headerRow.appendChild(header);
      });
      tableNode.appendChild(el('thead', { role: config.cards ? 'rowgroup' : null }, headerRow));
      var body = el('tbody', { role: config.cards ? 'rowgroup' : null });
      shown.forEach(function (row) {
        var rowNode = el('tr', { role: config.cards ? 'row' : null });
        config.columns.forEach(function (column) { rowNode.appendChild(el('td', { className: column.className || '', role: config.cards ? 'cell' : null, 'data-label': config.cards ? column.label : null }, column.render ? column.render(row) : rawValue(row[column.id]))); });
        body.appendChild(rowNode);
      });
      tableNode.appendChild(body);
      host.replaceChildren(tableNode);
      pagerHost.replaceChildren();
      var paging = pager(state.page, pages, function (page) { state.page = page; draw(); });
      if (paging) pagerHost.appendChild(paging);
      if (!shown.length) host.replaceChildren(emptyState('noResults'));
    }
    draw();
    return wrapper;
  }

  function closeCurrentDialog() {
    if (!openDialog) return;
    openDialog.remove(); openDialog = null;
    document.body.classList.remove('dialog-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function showDialog(title, content, trigger) {
    closeCurrentDialog();
    lastFocus = trigger || document.activeElement;
    var titleId = 'dialog-title-' + Date.now();
    var panel = el('div', { className: 'dialog-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
      el('div', { className: 'dialog-header' }, [heading(2, title), button(t('common.close'), closeCurrentDialog, { className: 'icon-button', 'aria-label': t('common.close') })]),
      el('div', { className: 'dialog-body' }, content)
    ]);
    panel.querySelector('h2').id = titleId;
    var overlay = el('div', { className: 'dialog-overlay', onMouseDown: function (event) { if (event.target === overlay) closeCurrentDialog(); } }, panel);
    overlay.addEventListener('click', function (event) {
      var target = event.target && event.target.closest ? event.target.closest('a[href^="#/"]') : null;
      if (target) closeCurrentDialog();
    });
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeCurrentDialog(); return; }
      if (event.key !== 'Tab') return;
      var focusable = Array.from(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.appendChild(overlay); document.body.classList.add('dialog-open'); openDialog = overlay;
    var initial = panel.querySelector('button,a,input,select,[tabindex="0"]');
    if (initial) initial.focus();
  }

  function relationList(entries, render, emptyKind) {
    if (!entries || !entries.length) return emptyState(emptyKind || 'notYet');
    return el('ul', { className: 'relation-list' }, entries.map(function (entry) { return el('li', {}, render(entry)); }));
  }

  function showItem(itemId, trigger) {
    var item = store && store.getItem(itemId);
    if (!item) { showDialog(t('item.unknownId', { id: i18n.n(itemId) }), emptyState('notFound'), trigger); return; }
    var giftEntries = (store.giftsByItem.get(item.id) || []).slice().sort(function (a, b) { return GUIDE.storeLogic.REACTIONS.indexOf(a.reaction) - GUIDE.storeLogic.REACTIONS.indexOf(b.reaction); });
    var using = store.recipesUsingItem.get(item.id) || [];
    var making = store.recipesMakingItem.get(item.id) || [];
    var quests = store.questsByItem.get(item.id) || [];
    var chestEntries = store.chestsByItem.get(item.id) || [];
    var fish = store.getFish(item.id);
    var tags = util.unique((Array.isArray(item.tags) ? item.tags : []).filter(function (tag) { return tag !== null && tag !== undefined && String(tag).trim(); }).map(String));
    var category = item.category === null || item.category === undefined || item.category === '' ? null : item.category;
    var categoryNode = category ? el('span', { className: 'item-category-value' }, [
      util.isRaw(category) ? rawValue(category) : badge(String(category), 'category')
    ]) : rawValue(null);
    var tagNode = tags.length ? el('span', { className: 'item-tag-list' }, tags.map(function (tag) { return badge(tag, 'item-tag'); })) : el('span', { className: 'unknown' }, t('common.none'));
    var content = el('div', { className: 'item-dialog-grid' }, [
      el('div', { className: 'item-dialog-summary' }, [spriteImage(item.icon, '', 72), item.desc ? el('p', {}, util.isRaw(item.desc) ? rawValue(item.desc) : String(item.desc)) : emptyState('unknown'), el('dl', { className: 'item-dialog-facts' }, [field(t('item.type'), item.type || t('common.unknown')), field(t('item.category'), categoryNode), field(t('item.tags'), tagNode), field(t('item.price'), rawValue(item.price))])]),
      heading(3, t('item.giftReactions')),
      relationList(giftEntries, function (entry) {
        var character = store.getCharacter(entry.characterId);
        return el('span', { className: 'gift-reaction-entry' }, [link('#/characters/' + entry.characterId, character ? character.name : t('common.unknown')), reactionBadge(entry.reaction)]);
      }),
      heading(3, t('item.usedInRecipes')), relationList(using, function (recipe) { return link('#/recipes/' + recipe.id, recipe.name); }),
      heading(3, t('item.madeByRecipes')), relationList(making, function (recipe) { return link('#/recipes/' + recipe.id, recipe.name); }),
      heading(3, t('item.relatedQuests')), relationList(quests, function (quest) { return link('#/quests/' + encodeURIComponent(quest.id), quest.title); }),
      chestEntries.length ? [heading(3, t('item.foundInChests')), relationList(chestEntries, function (entry) {
        var map = store.maps.get(String(entry.mapId));
        var area = map && (map.areas || []).find(function (candidate) { return String(candidate.id) === String(entry.areaId); });
        var mapLabel = String(map && (map.name || map.id) || entry.mapId);
        var areaLabel = area && area.isParent ? t('maps.area.main') : (area && area.label && String(area.label) !== String(area.id) ? String(area.label) : null);
        var label = areaLabel ? t('item.foundInChests.entryArea', { map: mapLabel, area: areaLabel, count: i18n.n(entry.count) }) : t('item.foundInChests.entry', { map: mapLabel, count: i18n.n(entry.count) });
        var href = '#/maps/' + encodeURIComponent(entry.mapId) + (entry.areaId === null ? '' : '/' + encodeURIComponent(entry.areaId));
        return link(href, label);
      })] : null,
      fish ? [heading(3, t('item.fishQuestion')), link('#/fishing', t('item.openFishingInfo'))] : null
    ]);
    showDialog(String(item.name), content, trigger);
  }

  function timeText(start, end) {
    if (start === null || start === undefined || end === null || end === undefined) return t('fishing.anyTime');
    if (util.isRaw(start) || util.isRaw(end)) return rawValue(util.isRaw(start) ? start : end);
    return t('fishing.timeRange', { start: i18n.n(start), end: i18n.n(end) });
  }

  function fishingRequirementType(type) {
    if (type === 'rod') return t('fishing.requirement.rod');
    if (type === 'bait') return t('fishing.requirement.bait');
    if (type === 'level') return t('fishing.requirement.level');
    if (type === 'event') return t('fishing.requirement.event');
    if (type === 'quest') return t('fishing.requirement.quest');
    if (type === 'flag') return t('fishing.requirement.flag');
    return String(type || t('common.unknown'));
  }

  function fishingRequirements(requirements) {
    if (!requirements || !requirements.length) return t('common.none');
    return el('ul', { className: 'compact-list requirement-list' }, requirements.map(function (requirement) {
      var values = util.asArray(requirement.value);
      var valueNode;
      if ((requirement.type === 'rod' || requirement.type === 'bait') && values.every(function (value) { return typeof value === 'number'; })) {
        valueNode = el('span', { className: 'chip-list' }, values.map(function (itemId) { return itemChip(itemId, { hideIcon: true }); }));
      } else if (requirement.type === 'quest' && values.length) {
        valueNode = el('span', { className: 'link-list-inline' }, values.map(function (questId) {
          var quest = store.getQuest(questId);
          return quest ? link('#/quests/' + encodeURIComponent(quest.id), quest.title) : String(questId);
        }));
      } else if (util.isRaw(requirement.value)) valueNode = rawValue(requirement.value);
      else valueNode = document.createTextNode(JSON.stringify(requirement.value));
      return el('li', {}, [el('strong', {}, t('fishing.requirement.label', { type: fishingRequirementType(requirement.type) })), valueNode]);
    }));
  }

  function init(nextStore) { store = nextStore; }

  GUIDE.ui = {
    init: init, el: el, append: append, button: button, heading: heading, link: link, rawValue: rawValue, badge: badge, seasonBadge: seasonBadge,
    tooltip: tooltip, reactionLabel: reactionLabel, reactionBadge: reactionBadge, spriteImage: spriteImage, itemChip: itemChip, placeChips: placeChips,
    emptyState: emptyState, notice: notice, datasetNotice: datasetNotice, field: field, tabs: tabs, collapsible: collapsible,
    pager: pager, table: table, showDialog: showDialog, closeDialog: closeCurrentDialog, showItem: showItem, timeText: timeText,
    fishingRequirements: fishingRequirements
  };
})(window);
