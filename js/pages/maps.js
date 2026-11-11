(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var viewerId = 0;
  var fishListId = 0;

  function t(key, params) { return GUIDE.i18n.t(key, params); }

  function mapName(map) {
    return String(map && map.name || map && map.id || '');
  }

  function areaName(area) {
    return area && area.isParent ? t('maps.area.main') : String(area && (area.label || area.id) || '');
  }

  function findArea(map, areaId) {
    if (!map || !map.group || areaId === null || areaId === undefined) return null;
    var folded = String(areaId).toLocaleLowerCase();
    return (map.areas || []).find(function (area) { return String(area.id).toLocaleLowerCase() === folded; }) || null;
  }

  function visibleAreas(map) {
    return (map && map.areas || []).filter(function (area) {
      return area && (area.isParent || String(area.label || area.id) !== String(area.id));
    });
  }

  function areaHash(map, area) {
    var hash = '#/maps/' + encodeURIComponent(map.id);
    return area ? hash + '/' + encodeURIComponent(area.id) : hash;
  }

  function selectArea(map, area) {
    root.location.replace(areaHash(map, area));
  }

  function areaChips(map, areaIds) {
    if (!map || !map.group || !Array.isArray(areaIds) || !areaIds.length) return null;
    var areas = areaIds.map(function (id) { return findArea(map, id); }).filter(function (area) {
      return area && (area.isParent || String(area.label || area.id) !== String(area.id));
    });
    if (!areas.length) return null;
    var names = areas.map(areaName);
    return GUIDE.ui.el('small', {
      className: 'map-area-chips',
      'aria-label': t('maps.area.foundIn', { areas: names.join(t('common.listSeparator')) })
    }, areas.map(function (area) { return GUIDE.ui.el('span', { className: 'map-area-chip' }, areaName(area)); }));
  }

  function sectionHeading(label, count) {
    return GUIDE.ui.heading(2, count > 0 ? t('maps.section.count', { heading: label, count: GUIDE.i18n.n(count) }) : label);
  }

  function directImage(path, alt, size, className) {
    var ui = GUIDE.ui;
    if (!path) return ui.spriteImage(null, alt, size, className);
    var image = ui.el('img', { className: 'pixel-icon ' + (className || ''), src: path, alt: alt || '', width: size, height: size, loading: 'lazy' });
    image.addEventListener('error', function () { image.replaceWith(ui.spriteImage(null, alt, size, className)); }, { once: true });
    return image;
  }

  function imageInfo(map) {
    if (Object.prototype.hasOwnProperty.call(map, 'image') && map.image === null) return null;
    if (map.image && map.image.path) {
      return { path: String(map.image.path), width: Number(map.image.width) || null, height: Number(map.image.height) || null };
    }
    var room = map.room || map.id;
    if (!room) return null;
    var encoded = encodeURIComponent(String(room));
    return { path: 'assets/maps/' + encoded + '.png', fallbackPath: 'assets/maps/' + encoded + '_x1.png', width: null, height: null };
  }

  function openViewer(map, info, trigger, onViewDetail) {
    var ui = GUIDE.ui;
    var priorFocus = trigger || document.activeElement;
    var priorOverflow = document.body.style.overflow;
    var id = ++viewerId;
    var titleId = 'map-viewer-title-' + id;
    var pointers = new Map();
    var naturalWidth = info.width || 0;
    var naturalHeight = info.height || 0;
    var scale = 1; var x = 0; var y = 0; var fitScale = 1; var closed = false;

    var zoomText = ui.el('output', { className: 'map-viewer-zoom', 'aria-live': 'polite' });
    var image = ui.el('img', {
      className: 'map-viewer-image', src: info.path, alt: t('maps.image.alt', { name: mapName(map) }),
      draggable: 'false', loading: 'eager'
    });
    var viewport = ui.el('div', { className: 'map-viewer-viewport', tabindex: '0', 'aria-label': t('maps.viewer.panArea') }, image);
    var panel = ui.el('div', { className: 'map-viewer-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    var overlay = ui.el('div', { className: 'map-viewer-overlay' }, panel);

    function clamp(value) { return Math.max(0.25, Math.min(8, value)); }

    function draw() {
      image.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      zoomText.textContent = t('maps.viewer.zoomLevel', { percent: GUIDE.i18n.n(Math.round(scale * 100)) });
    }

    function centerAt(nextScale) {
      scale = clamp(nextScale);
      x = (viewport.clientWidth - naturalWidth * scale) / 2;
      y = (viewport.clientHeight - naturalHeight * scale) / 2;
      draw();
    }

    function fit() {
      if (!naturalWidth || !naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return;
      fitScale = clamp(Math.min(viewport.clientWidth / naturalWidth, viewport.clientHeight / naturalHeight));
      centerAt(fitScale);
    }

    function actual() {
      if (!naturalWidth || !naturalHeight) return;
      centerAt(1);
    }

    function zoomTo(nextScale, clientX, clientY) {
      var next = clamp(nextScale);
      if (next === scale) return;
      var bounds = viewport.getBoundingClientRect();
      var cx = clientX === undefined ? viewport.clientWidth / 2 : clientX - bounds.left;
      var cy = clientY === undefined ? viewport.clientHeight / 2 : clientY - bounds.top;
      var ratio = next / scale;
      x = cx - (cx - x) * ratio;
      y = cy - (cy - y) * ratio;
      scale = next;
      draw();
    }

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeydown);
      root.removeEventListener('resize', fit);
      root.removeEventListener('hashchange', close);
      overlay.remove();
      document.body.style.overflow = priorOverflow;
      document.body.classList.remove('map-viewer-open');
      if (priorFocus && document.contains(priorFocus)) priorFocus.focus({ preventScroll: true });
    }

    var closeButton = ui.button(t('maps.viewer.close'), close, { className: 'button map-viewer-close', 'aria-label': t('maps.viewer.close') });
    var controls = ui.el('div', { className: 'map-viewer-controls', 'aria-label': t('maps.viewer.controls') }, [
      ui.button(t('maps.viewer.zoomOut'), function () { zoomTo(scale / 1.25); }, { 'aria-label': t('maps.viewer.zoomOut'), title: t('maps.viewer.zoomOut') }),
      zoomText,
      ui.button(t('maps.viewer.zoomIn'), function () { zoomTo(scale * 1.25); }, { 'aria-label': t('maps.viewer.zoomIn'), title: t('maps.viewer.zoomIn') }),
      ui.button(t('maps.viewer.fit'), fit),
      ui.button(t('maps.viewer.actual'), actual),
      onViewDetail ? ui.button(t('maps.area.viewDetail'), function () { close(); onViewDetail(); }) : null,
      closeButton
    ]);
    panel.appendChild(ui.el('header', { className: 'map-viewer-header' }, [ui.heading(2, t('maps.viewer.title', { name: mapName(map) })), controls]));
    panel.querySelector('h2').id = titleId;
    panel.appendChild(viewport);

    function onKeydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === '+' || event.key === '=' || event.key === 'Add') { event.preventDefault(); zoomTo(scale * 1.25); return; }
      if (event.key === '-' || event.key === '_' || event.key === 'Subtract') { event.preventDefault(); zoomTo(scale / 1.25); return; }
      if (event.key === '0') { event.preventDefault(); actual(); return; }
      var distance = 32;
      if (event.key === 'ArrowLeft') x += distance;
      else if (event.key === 'ArrowRight') x -= distance;
      else if (event.key === 'ArrowUp') y += distance;
      else if (event.key === 'ArrowDown') y -= distance;
      else if (event.key === 'Tab') {
        var focusable = Array.from(panel.querySelectorAll('button:not([disabled]),[tabindex="0"]'));
        var first = focusable[0]; var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      } else return;
      event.preventDefault(); draw();
    }

    viewport.addEventListener('wheel', function (event) {
      event.preventDefault();
      zoomTo(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY);
    }, { passive: false });
    viewport.addEventListener('dblclick', function (event) {
      event.preventDefault();
      if (Math.abs(scale - fitScale) < 0.01) actual(); else fit();
    });
    viewport.addEventListener('pointerdown', function (event) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { viewport.setPointerCapture(event.pointerId); } catch (_) { /* Pointer capture is optional. */ }
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!pointers.has(event.pointerId)) return;
      var before = Array.from(pointers.values());
      var previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      var after = Array.from(pointers.values());
      if (after.length >= 2 && before.length >= 2) {
        var oldCenterX = (before[0].x + before[1].x) / 2; var oldCenterY = (before[0].y + before[1].y) / 2;
        var newCenterX = (after[0].x + after[1].x) / 2; var newCenterY = (after[0].y + after[1].y) / 2;
        var oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
        var newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
        if (oldDistance > 0) zoomTo(scale * newDistance / oldDistance, oldCenterX, oldCenterY);
        x += newCenterX - oldCenterX; y += newCenterY - oldCenterY; draw();
      } else if (after.length === 1) {
        x += event.clientX - previous.x; y += event.clientY - previous.y; draw();
      }
    });
    function releasePointer(event) { pointers.delete(event.pointerId); }
    viewport.addEventListener('pointerup', releasePointer);
    viewport.addEventListener('pointercancel', releasePointer);
    overlay.addEventListener('pointerdown', function (event) { if (event.target === overlay) close(); });
    image.addEventListener('load', function () {
      naturalWidth = image.naturalWidth || naturalWidth;
      naturalHeight = image.naturalHeight || naturalHeight;
      fit();
    }, { once: true });

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('map-viewer-open');
    document.addEventListener('keydown', onKeydown);
    root.addEventListener('resize', fit);
    root.addEventListener('hashchange', close, { once: true });
    if (naturalWidth && naturalHeight) root.requestAnimationFrame(fit);
    closeButton.focus({ preventScroll: true });
  }

  function missingImage() {
    return GUIDE.ui.el('div', { className: 'map-image-missing', role: 'status' }, t('maps.image.missing'));
  }

  function imageSection(map) {
    var ui = GUIDE.ui;
    var info = imageInfo(map);
    var body = ui.el('div', { className: 'map-image-body' });
    var section = ui.el('section', { className: 'panel map-image-section' }, [sectionHeading(t('maps.image.title'), 0), body]);
    if (!info) { body.appendChild(missingImage()); return section; }

    var caption = ui.el('figcaption', { className: 'map-image-caption' });
    var image = ui.el('img', {
      className: 'map-image', src: info.path, alt: t('maps.image.alt', { name: mapName(map) }), loading: 'eager', decoding: 'async'
    });
    if (info.width) image.setAttribute('width', info.width);
    if (info.height) image.setAttribute('height', info.height);
    function setCaption(width, height) {
      caption.textContent = t('maps.image.caption', { width: GUIDE.i18n.n(width), height: GUIDE.i18n.n(height) });
    }
    if (info.width && info.height) setCaption(info.width, info.height);
    var trigger = ui.el('button', {
      type: 'button', className: 'map-image-trigger', 'aria-label': t('maps.image.viewFull'), title: t('maps.image.viewFull'),
      onClick: function () { openViewer(map, info, trigger); }
    }, image);
    var figure = ui.el('figure', { className: 'map-image-figure' }, [trigger, caption]);
    var viewButton = ui.button(t('maps.image.viewFull'), function () { openViewer(map, info, viewButton); });
    body.appendChild(figure); body.appendChild(ui.el('div', { className: 'map-image-actions' }, viewButton));
    image.addEventListener('load', function () {
      info.width = info.width || image.naturalWidth;
      info.height = info.height || image.naturalHeight;
      if (info.width) image.setAttribute('width', info.width);
      if (info.height) image.setAttribute('height', info.height);
      if (info.width && info.height) setCaption(info.width, info.height);
    }, { once: true });
    image.addEventListener('error', function () {
      if (info.fallbackPath && image.getAttribute('src') !== info.fallbackPath) {
        info.path = info.fallbackPath;
        image.src = info.fallbackPath;
        return;
      }
      body.replaceChildren(missingImage());
    });
    return section;
  }

  function groupImageSection(map, selectedArea) {
    if (selectedArea) {
      return imageSection(Object.assign({}, selectedArea, {
        name: t('maps.area.imageName', { name: mapName(map), area: areaName(selectedArea) })
      }));
    }
    var ui = GUIDE.ui;
    var gallery = ui.el('div', { className: 'map-area-gallery' });
    visibleAreas(map).forEach(function (area) {
      var label = areaName(area);
      var info = imageInfo(area);
      var imageName = t('maps.area.imageName', { name: mapName(map), area: label });
      var media = info ? ui.el('img', {
        className: 'map-area-gallery-image', src: info.path,
        alt: t('maps.area.imageAlt', { name: mapName(map), area: label }), loading: 'lazy'
      }) : missingImage();
      var button = ui.el('button', {
        type: 'button', className: 'map-area-gallery-item',
        'aria-label': t('maps.viewer.title', { name: imageName }), title: t('maps.image.viewFull'), disabled: !info,
        onClick: function () {
          if (info) openViewer(Object.assign({}, area, { name: imageName }), info, button, area.isParent ? null : function () { selectArea(map, area); });
        }
      }, [media, ui.el('span', { className: 'map-area-gallery-label' }, label)]);
      if (info) media.addEventListener('error', function () {
        if (info.fallbackPath && media.getAttribute('src') !== info.fallbackPath) {
          info.path = info.fallbackPath;
          media.src = info.fallbackPath;
          return;
        }
        info = null;
        button.disabled = true;
        media.replaceWith(missingImage());
      });
      gallery.appendChild(button);
    });
    return ui.el('section', { className: 'panel map-image-section' }, [sectionHeading(t('maps.image.title'), 0), gallery]);
  }

  function areaSelector(map, selectedArea) {
    var ui = GUIDE.ui;
    var choices = [{ area: null, label: t('maps.area.all') }].concat(visibleAreas(map).map(function (area) {
      return { area: area, label: areaName(area) };
    }));
    var tabs = [];
    var tablist = ui.el('div', { className: 'map-area-tabs', role: 'tablist', 'aria-label': t('maps.area.label') });
    choices.forEach(function (choice, index) {
      var selected = choice.area ? selectedArea && String(choice.area.id) === String(selectedArea.id) : !selectedArea;
      var tab = ui.button(choice.label, function () { selectArea(map, choice.area); }, {
        className: 'map-area-tab', role: 'tab', 'aria-selected': String(!!selected), tabindex: selected ? '0' : '-1'
      });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      });
      tabs.push(tab); tablist.appendChild(tab);
    });
    return tablist;
  }

  function monsterRouteExists(monsterId) {
    if (!GUIDE.pages.monsters || !GUIDE.router || !GUIDE.router.parse) return false;
    var route = GUIDE.router.parse('#/monsters/' + encodeURIComponent(monsterId));
    return route.page === 'monsters' && !route.unknown;
  }

  function monstersSection(map, store, areaId) {
    var ui = GUIDE.ui;
    var entries = GUIDE.mapsLogic.filterByArea(store.mapIndexes.monstersByMap.get(String(map.id)) || [], areaId);
    var available = store.data.monsters && !store.data.monsters.malformed && store.data.monsters.status !== 'not_found' && store.lists.monsters.length > 0;
    var content;
    if (!available) content = ui.emptyState('notFound', t('maps.monsters.unavailable'));
    else if (!entries.length) content = ui.emptyState('notFound', areaId ? t('maps.area.empty') : t('maps.monsters.empty'));
    else content = ui.el('ul', { className: 'map-monster-list' }, entries.map(function (entry) {
      var monster = store.monsters.get(entry.monsterId) || { id: entry.monsterId, name: entry.monsterId };
      var name = String(monster.name || monster.id);
      var label = monsterRouteExists(monster.id) ? ui.link('#/monsters/' + encodeURIComponent(monster.id), name) : ui.el('span', {}, name);
      return ui.el('li', { className: 'map-monster' }, [
        monster.icon ? directImage(monster.icon, '', 40, 'map-monster-icon') : ui.spriteImage(monster.sprite, '', 40, 'map-monster-icon'),
        label,
        areaId ? null : areaChips(map, entry.areas)
      ]);
    }));
    return ui.el('section', { className: 'panel' }, [sectionHeading(t('maps.monsters'), entries.length), content]);
  }

  function gatherHowLabel(how) {
    if (how === 'placed') return t('maps.gather.how.placed');
    if (how === 'spawner') return t('maps.gather.how.spawner');
    if (how === 'random') return t('maps.gather.how.random');
    if (how === 'event') return t('maps.gather.how.event');
    return null;
  }

  function gatherSection(map, store, areaId) {
    var ui = GUIDE.ui;
    var entries = GUIDE.mapsLogic.filterByArea(store.mapIndexes.gatherablesByMap.get(String(map.id)) || [], areaId);
    var embedded = store.lists.maps.some(function (entry) { return Array.isArray(entry.gatherables) && entry.gatherables.length > 0; });
    var available = embedded || (store.data.gatherables && !store.data.gatherables.malformed && store.data.gatherables.status !== 'not_found' && store.lists.gatherables.length > 0);
    var content;
    if (!available) content = ui.emptyState('notFound', t('maps.gather.unavailable'));
    else if (!entries.length) content = ui.emptyState('notFound', areaId ? t('maps.area.empty') : t('maps.gather.empty'));
    else content = ui.el('div', { className: 'map-gather-list' }, entries.map(function (entry) {
      var chip = ui.itemChip(entry.itemId);
      var names = entry.nodeNames || [];
      var chipNode = names.length ? ui.tooltip(chip, t('maps.gather.node', { name: names.join(t('common.listSeparator')) })) : chip;
      var how = (entry.how || []).map(gatherHowLabel).filter(Boolean);
      return ui.el('div', { className: 'map-gather-entry' }, [chipNode, how.length ? ui.el('small', {}, how.join(t('common.listSeparator'))) : null, areaId ? null : areaChips(map, entry.areas)]);
    }));
    return ui.el('section', { className: 'panel' }, [sectionHeading(t('maps.gather'), entries.length), content]);
  }

  function fishSection(map, store, areaId) {
    var ui = GUIDE.ui;
    var entries = GUIDE.mapsLogic.filterByArea(store.mapIndexes.fishByMap.get(String(map.id)) || [], areaId);
    var available = store.data.fishingRate && !store.data.fishingRate.malformed && store.data.fishingRate.status !== 'not_found' && store.lists.fishingRate.length > 0;
    var content;
    if (!available) content = ui.emptyState('notFound', t('maps.fish.unavailable'));
    else if (!entries.length) content = ui.emptyState('notFound', areaId ? t('maps.area.empty') : t('maps.fish.empty'));
    else {
      var limit = 12;
      var expanded = false;
      var gridId = 'map-fish-grid-' + (++fishListId);
      var grid = ui.el('div', { id: gridId, className: 'map-fish-grid' });
      var toggle = entries.length > limit ? ui.button('', function () { expanded = !expanded; draw(); }, {
        className: 'map-fish-tile map-fish-toggle', 'aria-controls': gridId
      }) : null;
      function tileFor(entry) {
        var itemId = entry.itemId;
        var resolved = GUIDE.mapsLogic.resolveItem(itemId, store.lists.items, store.lists.fish, store.lists.sprites);
        var tile = ui.el('button', {
          type: 'button', className: 'map-fish-tile', 'aria-label': resolved.name,
          onClick: function () { ui.showItem(itemId, tile); }
        }, [directImage(resolved.icon, '', 40, 'map-fish-icon'), ui.el('span', {}, resolved.name), areaId ? null : areaChips(map, entry.areas)]);
        return tile;
      }
      function draw() {
        grid.replaceChildren();
        (expanded ? entries : entries.slice(0, limit)).forEach(function (entry) { grid.appendChild(tileFor(entry)); });
        if (toggle) {
          toggle.textContent = expanded ? t('maps.fish.showLess') : t('maps.fish.showMore');
          toggle.setAttribute('aria-expanded', String(expanded));
          grid.appendChild(toggle);
        }
      }
      draw();
      content = grid;
    }
    return ui.el('section', { className: 'panel' }, [sectionHeading(t('maps.fish'), entries.length), content]);
  }

  function dataNotes(map, store) {
    var ui = GUIDE.ui;
    var notes = [];
    (Array.isArray(map.warnings) ? map.warnings : []).forEach(function (warning) { if (warning) notes.push(String(warning)); });
    if (map.group) {
      var indexed = [];
      ['monstersByMap', 'fishByMap', 'gatherablesByMap'].forEach(function (key) {
        indexed.push.apply(indexed, store.mapIndexes[key].get(String(map.id)) || []);
      });
      var missingAreas = visibleAreas(map).filter(function (area) {
        return !area.isParent && !indexed.some(function (entry) { return (entry.areas || []).indexOf(area.id) !== -1; });
      }).map(areaName);
      if (missingAreas.length) notes.push(t('maps.notes.areaMissingData', { areas: missingAreas.join(t('common.listSeparator')) }));
    }
    if (store.mapIndexes.unmatchedPlaces.length) notes.push(t('maps.notes.unmatched', { places: store.mapIndexes.unmatchedPlaces.join(t('common.listSeparator')) }));
    if (store.data.places && store.data.places.status === 'partial') notes.push(t('maps.notes.mapsPartial'));
    if (store.data.monsters && store.data.monsters.status === 'partial') notes.push(t('maps.notes.monstersPartial'));
    if (store.data.fishingRate && store.data.fishingRate.status === 'partial') notes.push(t('maps.notes.fishingPartial'));
    if (store.data.fish && store.data.fish.status === 'partial') notes.push(t('maps.notes.fishPartial'));
    if (!store.data.gatherables || store.data.gatherables.status === 'not_found' || store.data.gatherables.malformed) notes.push(t('maps.notes.gatherUnavailable'));
    if (!notes.length) return null;
    return ui.el('details', { className: 'collapsible map-data-notes' }, [
      ui.el('summary', {}, t('maps.dataNotes')),
      ui.el('div', { className: 'collapsible-body' }, ui.el('ul', { className: 'compact-list' }, notes.map(function (note) { return ui.el('li', {}, note); })))
    ]);
  }

  function detail(map, context, areaId) {
    var ui = GUIDE.ui; var store = context.store;
    var selectedArea = map && map.group && areaId !== null && areaId !== undefined ? findArea(map, areaId) : null;
    if (map && ((!map.group && areaId !== null && areaId !== undefined) || (map.group && areaId !== null && areaId !== undefined && !selectedArea))) map = null;
    if (!map) {
      return {
        node: ui.el('div', { className: 'page' }, [ui.heading(1, t('maps.notFound')), ui.emptyState('notFound', t('maps.notFound')), ui.link('#/maps', t('maps.back'), 'back-link')]),
        title: t('maps.notFound')
      };
    }
    var node = ui.el('article', { className: 'page map-detail-page' }, [
      ui.link('#/maps', t('maps.back'), 'back-link'),
      ui.el('header', { className: 'map-detail-header' }, ui.heading(1, mapName(map))),
      map.group ? areaSelector(map, selectedArea) : null,
      map.group ? groupImageSection(map, selectedArea) : imageSection(map),
      monstersSection(map, store, selectedArea && selectedArea.id),
      gatherSection(map, store, selectedArea && selectedArea.id),
      fishSection(map, store, selectedArea && selectedArea.id),
      dataNotes(map, store)
    ]);
    return { node: node, title: mapName(map) };
  }

  function list(context) {
    var ui = GUIDE.ui; var store = context.store;
    var maps = store.mapIndexes.maps.slice();
    var node = ui.el('div', { className: 'page maps-page' });
    node.appendChild(ui.el('header', { className: 'maps-list-header' }, [
      ui.heading(1, t('maps.title')),
      ui.el('p', { className: 'maps-count' }, GUIDE.i18n.plural('maps.count', maps.length, { count: GUIDE.i18n.n(maps.length) }))
    ]));
    if (!maps.length) {
      node.appendChild(ui.emptyState('notFound', t('maps.empty.noData')));
      return { node: node, title: t('maps.title') };
    }
    var results = ui.el('div', { className: 'maps-list-results' });
    var search = ui.el('input', {
      id: 'maps-search', type: 'search', placeholder: t('maps.search.placeholder'), 'aria-label': t('maps.search'),
      onInput: draw
    });
    var sort = ui.el('select', { id: 'maps-sort', 'aria-label': t('maps.sort'), onChange: draw }, [
      ui.el('option', { value: 'id' }, t('maps.sort.id')),
      ui.el('option', { value: 'name' }, t('maps.sort.name'))
    ]);
    node.appendChild(ui.el('form', {
      className: 'maps-controls', role: 'search',
      onSubmit: function (event) { event.preventDefault(); }
    }, [
      ui.el('label', {}, [ui.el('span', {}, t('maps.search')), search]),
      ui.el('label', {}, [ui.el('span', {}, t('maps.sort')), sort])
    ]));
    node.appendChild(results);

    function draw() {
      var visible = GUIDE.mapsLogic.sortMaps(GUIDE.mapsLogic.filterMaps(maps, search.value), sort.value);
      if (!visible.length) {
        var empty = ui.emptyState('noResults', t('maps.empty.noMatch'));
        empty.appendChild(ui.button(t('maps.clear'), function () { search.value = ''; draw(); search.focus(); }));
        results.replaceChildren(empty);
        return;
      }
      results.replaceChildren(ui.el('ul', { className: 'maps-name-grid' }, visible.map(function (map) {
        var id = String(map.id);
        return ui.el('li', {}, ui.link('#/maps/' + encodeURIComponent(id), mapName(map)));
      })));
    }
    draw();
    return { node: node, title: t('maps.title') };
  }

  GUIDE.pages.maps = {
    render: function (route, context) {
      if (route.id === null || route.id === undefined) return list(context);
      var map = context.store.maps.get(String(route.id));
      if (map) return detail(map, context, route.areaId);
      if (route.areaId === null || route.areaId === undefined) {
        var target = context.store.mapIndexes.roomToMap.get(route.id);
        if (target && target.mapId !== String(route.id)) {
          var group = context.store.maps.get(String(target.mapId));
          if (group) {
            root.location.replace(GUIDE.mapsLogic.mapRouteForRoom(context.store.mapIndexes.roomToMap, route.id));
            return detail(group, context, target.areaId);
          }
        }
      }
      return detail(null, context);
    }
  };
})(window);
