(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var viewerId = 0;
  var mapGalleryId = 0;
  var fishListId = 0;
  var pendingChestKey = null;
  var DETAIL_SECTION_ORDER = ['image', 'chests', 'monsters', 'gatherables', 'fish', 'notes'];
  var CHEST_OVERLAY_KEY = 'guide.chests.overlay';
  var MAP_CHEST_TYPES = ['obj_chest', 'obj_chest_lock_enemy'];
  var MAP_IMAGE_PREVIEW_LIMIT = 6;

  function t(key, params) { return GUIDE.i18n.t(key, params); }

  function mapChestsForArea(chests, areaId) {
    return GUIDE.chestsLogic.filterChests(chests, { areaId: areaId }).filter(function (chest) {
      return MAP_CHEST_TYPES.indexOf(String(chest && chest.type)) !== -1;
    });
  }

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

  function chestEntryKey(chest) {
    return String(chest && (chest.key || chest.instanceId) || 'unknown');
  }

  function chestCardId(chest) {
    return 'chest-card-' + chestEntryKey(chest).replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function setChestActive(interaction, chest, token, active) {
    if (!interaction) return;
    var key = chestEntryKey(chest);
    if (!interaction.active.has(key)) interaction.active.set(key, new Set());
    var tokens = interaction.active.get(key);
    if (active) tokens.add(token); else tokens.delete(token);
    if (!tokens.size) interaction.active.delete(key);
    var highlighted = tokens.size > 0;
    var card = interaction.cards.get(key);
    var marker = interaction.markers.get(key);
    if (card) card.classList.toggle('is-highlighted', highlighted);
    if (marker) marker.classList.toggle('is-highlighted', highlighted);
  }

  function revealChestTarget(target, pulseClass) {
    if (!target) return;
    var reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    if (reduced) return;
    target.classList.remove(pulseClass);
    root.requestAnimationFrame(function () {
      target.classList.add(pulseClass);
      target.addEventListener('animationend', function () { target.classList.remove(pulseClass); }, { once: true });
    });
  }

  function markerIsVisible(interaction, key) {
    if (!interaction || !interaction.markersEnabled) return false;
    var marker = interaction.markers.get(key);
    if (!marker || marker.hidden) return false;
    var layer = marker.closest('.map-chest-markers');
    return !layer || !layer.hidden;
  }

  function revealPendingChestAfterRender(interaction) {
    var key = pendingChestKey;
    pendingChestKey = null;
    if (!key || !markerIsVisible(interaction, key)) return;
    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () {
        root.requestAnimationFrame(function () {
          if (markerIsVisible(interaction, key)) revealChestTarget(interaction.markers.get(key), 'map-chest-marker-pulse');
        });
      });
    });
  }

  function registerChestCard(interaction, chest, card, navigateToArea) {
    if (!interaction) return;
    var key = chestEntryKey(chest);
    interaction.cards.set(key, card);
    interaction.updateCard(key);
    if (interaction.active.has(key)) card.classList.add('is-highlighted');
    card.addEventListener('pointerenter', function () { setChestActive(interaction, chest, 'card-pointer', true); });
    card.addEventListener('pointerleave', function () { setChestActive(interaction, chest, 'card-pointer', false); });
    card.addEventListener('focusin', function () { setChestActive(interaction, chest, 'card-focus', true); });
    card.addEventListener('focusout', function (event) {
      if (!event.relatedTarget || !card.contains(event.relatedTarget)) setChestActive(interaction, chest, 'card-focus', false);
    });
    card.addEventListener('click', function (event) {
      var interactive = event.target && event.target.closest ? event.target.closest('button, a, input, select, textarea, summary, [role="button"], [role="link"]') : null;
      if (interactive && card.contains(interactive)) return;
      if (markerIsVisible(interaction, key)) {
        revealChestTarget(interaction.markers.get(key), 'map-chest-marker-pulse');
      } else if (navigateToArea) {
        navigateToArea();
      }
    });
  }

  function createChestInteraction() {
    return {
      cards: new Map(), markers: new Map(), active: new Map(), markersEnabled: false,
      updateCard: function (key) {
        var card = this.cards.get(key);
        var marker = this.markers.get(key);
        if (card) card.classList.toggle('has-map-marker', !!(this.markersEnabled && marker && !marker.hidden));
      },
      setMarkersEnabled: function (enabled) {
        this.markersEnabled = !!enabled;
        var self = this;
        this.cards.forEach(function (_, key) { self.updateCard(key); });
      },
      setVisible: function (keys) {
        var visible = new Set(keys || []);
        var self = this;
        this.markers.forEach(function (marker, key) {
          marker.hidden = !visible.has(key);
          self.updateCard(key);
        });
      }
    };
  }

  function storageValue(key, fallback) {
    try { return GUIDE.util.safeGet(root.localStorage, key, fallback); }
    catch (_) { return fallback; }
  }

  function saveStorageValue(key, value) {
    try { GUIDE.util.safeSet(root.localStorage, key, value); }
    catch (_) { /* Storage is optional. */ }
  }

  function overlayEnabled() {
    var saved = storageValue(CHEST_OVERLAY_KEY, 'false');
    return saved === 'true';
  }

  function overlayRoomSize(map, chests) {
    var chest = (chests || []).find(function (entry) { return entry && entry.roomSize && Number(entry.roomSize.width) > 0 && Number(entry.roomSize.height) > 0; });
    return chest ? chest.roomSize : map && map.size;
  }

  function addMapMarkers(layer, chests, size, interaction) {
    var fragment = document.createDocumentFragment();
    (chests || []).forEach(function (chest) {
      var position = GUIDE.chestsLogic.markerPosition(chest, size);
      if (!position) return;
      var marked = typeof chest.mark === 'number' && Number.isFinite(chest.mark);
      var mark = marked ? ('#' + GUIDE.i18n.n(chest.mark)) : t('maps.chests.noMarkerValue');
      var marker = GUIDE.ui.el('button', {
        type: 'button', className: 'map-chest-marker' + (marked ? '' : ' map-chest-marker-unmarked'),
        'aria-label': t('maps.chests.overlay.markerLabel', { mark: mark, type: chest.typeName || chest.type || t('common.unknown') }),
        'aria-controls': chestCardId(chest)
      }, marked ? mark : null);
      marker.style.left = position.leftPct + '%';
      marker.style.top = position.topPct + '%';
      marker.addEventListener('pointerenter', function () { setChestActive(interaction, chest, 'marker-pointer', true); });
      marker.addEventListener('pointerleave', function () { setChestActive(interaction, chest, 'marker-pointer', false); });
      marker.addEventListener('focus', function () { setChestActive(interaction, chest, 'marker-focus', true); });
      marker.addEventListener('blur', function () { setChestActive(interaction, chest, 'marker-focus', false); });
      marker.addEventListener('click', function () {
        var card = interaction && interaction.cards.get(chestEntryKey(chest));
        if (!card) return;
        revealChestTarget(card, 'chest-card-pulse');
      });
      interaction.markers.set(chestEntryKey(chest), marker);
      fragment.appendChild(marker);
    });
    layer.appendChild(fragment);
  }

  function imageSection(map, overlayOptions) {
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
    var imageWrap = ui.el('div', { className: 'map-image-overlay-wrap' }, trigger);
    var figure = ui.el('figure', { className: 'map-image-figure' }, [imageWrap, caption]);
    var viewButton = ui.button(t('maps.image.viewFull'), function () { openViewer(map, info, viewButton); });
    body.appendChild(figure); body.appendChild(ui.el('div', { className: 'map-image-actions' }, viewButton));
    if (overlayOptions && overlayOptions.interaction) {
      overlayOptions.interaction.markers.clear();
      overlayOptions.interaction.setMarkersEnabled(false);
    }
    var overlayChests = overlayOptions && overlayOptions.chests || [];
    var roomSize = overlayRoomSize(map, overlayChests);
    if (overlayChests.length && GUIDE.chestsLogic.canOverlay(info, roomSize)) {
      var markerLayer = ui.el('div', { className: 'map-chest-markers', 'aria-hidden': 'false' });
      var enabled = overlayEnabled();
      markerLayer.hidden = !enabled;
      addMapMarkers(markerLayer, overlayChests, roomSize, overlayOptions.interaction);
      imageWrap.appendChild(markerLayer);
      overlayOptions.interaction.setMarkersEnabled(enabled);
      var checkbox = ui.el('input', { type: 'checkbox', checked: enabled });
      checkbox.addEventListener('change', function () {
        markerLayer.hidden = !checkbox.checked;
        overlayOptions.interaction.setMarkersEnabled(checkbox.checked);
        saveStorageValue(CHEST_OVERLAY_KEY, String(checkbox.checked));
      });
      body.appendChild(ui.el('div', { className: 'map-chest-overlay-controls' }, [
        ui.el('label', { className: 'check-label' }, [checkbox, ui.el('span', {}, t('maps.chests.overlay.show'))]),
        ui.el('small', {}, t('maps.chests.overlay.note'))
      ]));
    } else if (overlayChests.length && info.width && info.height && roomSize && roomSize.width && roomSize.height) {
      body.appendChild(ui.el('p', { className: 'map-chest-overlay-unavailable' }, t('maps.chests.overlay.unavailable')));
    }
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
      if (overlayOptions && overlayOptions.interaction) {
        overlayOptions.interaction.markers.clear();
        overlayOptions.interaction.setMarkersEnabled(false);
      }
      body.replaceChildren(missingImage());
    });
    return section;
  }

  function groupImageSection(map, selectedArea, overlayOptions) {
    if (selectedArea) {
      return imageSection(Object.assign({}, selectedArea, {
        name: t('maps.area.imageName', { name: mapName(map), area: areaName(selectedArea) })
      }), overlayOptions);
    }
    if (overlayOptions && overlayOptions.interaction) {
      overlayOptions.interaction.markers.clear();
      overlayOptions.interaction.setMarkersEnabled(false);
    }
    var ui = GUIDE.ui;
    var areas = visibleAreas(map);
    var expanded = false;
    var galleryId = 'map-area-gallery-' + (++mapGalleryId);
    var gallery = ui.el('div', { id: galleryId, className: 'map-area-gallery' });
    var toggle = areas.length > MAP_IMAGE_PREVIEW_LIMIT ? ui.button('', function () {
      expanded = !expanded;
      draw();
    }, { 'aria-controls': galleryId }) : null;

    function galleryItem(area) {
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
      return button;
    }

    function draw() {
      gallery.replaceChildren();
      (expanded ? areas : areas.slice(0, MAP_IMAGE_PREVIEW_LIMIT)).forEach(function (area) {
        gallery.appendChild(galleryItem(area));
      });
      if (toggle) {
        toggle.textContent = expanded ? t('maps.image.showLess') : t('maps.image.showMore');
        toggle.setAttribute('aria-expanded', String(expanded));
      }
    }

    draw();
    return ui.el('section', { className: 'panel map-image-section' }, [
      sectionHeading(t('maps.image.title'), 0),
      gallery,
      toggle ? ui.el('div', { className: 'map-image-actions' }, toggle) : null
    ]);
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

  function chestType(store, chest) {
    return store.chestIndexes.typesById.get(String(chest && chest.type)) || { id: chest && chest.type, name: chest && chest.typeName || t('common.unknown') };
  }

  function itemDisplayName(store, itemId) {
    var item = store.getItem(itemId);
    return item ? String(item.name && item.name.raw ? item.name.raw : item.name) : t('maps.chests.itemFallback', { id: GUIDE.i18n.n(itemId) });
  }

  function appendChestText(node, value, store, itemLinks) {
    var parts = GUIDE.chestsLogic.splitPlaceholders(value);
    if (!parts.length) {
      node.appendChild(document.createTextNode(t('common.unknown')));
      return;
    }
    parts.forEach(function (part) {
      if (part.type === 'text') node.appendChild(document.createTextNode(part.value));
      else {
        var name = itemDisplayName(store, part.itemId);
        if (!itemLinks) node.appendChild(document.createTextNode(name));
        else {
          var button = GUIDE.ui.button(name, function () { GUIDE.ui.showItem(part.itemId, button); }, {
            className: 'text-button chest-inline-item', 'aria-label': t('item.open', { name: name })
          });
          node.appendChild(button);
        }
      }
    });
  }

  function chestAreaChip(map, chest) {
    if (!map.group || chest.areaId === null || chest.areaId === undefined) return null;
    var area = findArea(map, chest.areaId);
    var technicalLabel = area && !area.isParent && String(area.label || area.id) === String(area.id);
    var label = area && !technicalLabel ? areaName(area) : chest.areaLabel;
    if (!label) label = t('maps.chests.areaUnknown');
    return GUIDE.ui.el('small', {
      className: 'map-area-chip chest-area-chip',
      'aria-label': t('maps.chests.areaChipLabel', { area: label })
    }, area && area.isParent ? label : (label === t('maps.chests.areaUnknown') ? label : t('maps.chests.areaChip', { area: label })));
  }

  function confidenceBadge(chest) {
    var label;
    if (chest.confidence === 'low') label = t('maps.chests.unverified');
    else if (chest.confidence === 'medium') label = t('maps.chests.partlyVerified');
    else return null;
    return GUIDE.ui.tooltip(GUIDE.ui.badge(label, 'warning chest-confidence'), t('maps.chests.unverifiedHint'));
  }

  function rawChestValue(raw) {
    var value = raw && typeof raw === 'object' && raw.raw !== undefined ? raw.raw : raw;
    return GUIDE.ui.tooltip(GUIDE.ui.el('span', { className: 'raw-value' }, t('value.cannotCompute')), t('value.rawTitle', { raw: String(value || t('common.unknown')) }));
  }

  function chestItemNode(entry) {
    var ui = GUIDE.ui;
    if (!entry || typeof entry.itemId !== 'number' || !Number.isFinite(entry.itemId)) return rawChestValue(entry && (entry.itemId || entry.raw));
    var min = entry.min; var max = entry.max;
    var fixed = typeof min === 'number' && Number.isFinite(min) && min === max;
    var chip = ui.itemChip(entry.itemId, { count: fixed && min !== 1 ? min : null });
    var children = [chip];
    if (typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max) && min !== max) {
      children.push(ui.badge(t('maps.chests.quantityRange', { min: GUIDE.i18n.n(min), max: GUIDE.i18n.n(max) }), 'count'));
    } else if (GUIDE.util.isRaw(min) || GUIDE.util.isRaw(max) || entry.raw) {
      children.push(rawChestValue(GUIDE.util.isRaw(min) ? min : (GUIDE.util.isRaw(max) ? max : entry.raw)));
    }
    if (typeof entry.chancePct === 'number' && Number.isFinite(entry.chancePct)) {
      children.push(ui.badge(t('maps.chests.chance', { chance: GUIDE.fishingRate.formatPercent(entry.chancePct) }), 'neutral'));
    } else if (GUIDE.util.isRaw(entry.chancePct)) children.push(rawChestValue(entry.chancePct));
    return ui.el('span', { className: 'chest-loot-item' }, children);
  }

  function extraTypeLabel(type) {
    if (type === 'money') return t('maps.chests.extra.money');
    if (type === 'exp') return t('maps.chests.extra.exp');
    return t('maps.chests.extra.other');
  }

  function chestExtraNode(extra) {
    var type = extraTypeLabel(extra && extra.type);
    var min = extra && extra.min; var max = extra && extra.max;
    if (typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max)) {
      var label = min === max ? t('maps.chests.extra.fixed', { type: type, count: GUIDE.i18n.n(min) }) : t('maps.chests.extra.range', { type: type, min: GUIDE.i18n.n(min), max: GUIDE.i18n.n(max) });
      return GUIDE.ui.badge(label, 'neutral chest-extra-chip');
    }
    if (extra && (extra.raw || GUIDE.util.isRaw(min) || GUIDE.util.isRaw(max))) {
      var raw = extra.raw || (GUIDE.util.isRaw(min) ? min : max);
      var value = raw && raw.raw !== undefined ? raw.raw : raw;
      return GUIDE.ui.tooltip(GUIDE.ui.badge(t('maps.chests.extra.cannotCompute', { type: type }), 'neutral chest-extra-chip'), t('value.rawTitle', { raw: String(value) }));
    }
    return GUIDE.ui.badge(t('maps.chests.extra.unknown', { type: type }), 'neutral chest-extra-chip');
  }

  function chestCard(map, store, chest, language, showArea, interaction) {
    var ui = GUIDE.ui;
    var type = chestType(store, chest);
    var marked = typeof chest.mark === 'number' && Number.isFinite(chest.mark);
    var markText = marked ? ('#' + GUIDE.i18n.n(chest.mark)) : t('maps.chests.noMarkerValue');
    var markLabel = marked ? t('maps.chests.marker', { mark: markText }) : t('maps.chests.noMarker');
    var icon = type.icon ? directImage(type.icon, '', 32, 'chest-type-icon') : ui.spriteImage(type.sprite, '', 32, 'chest-type-icon');
    var how = ui.el('p', { className: 'chest-text' });
    appendChestText(how, GUIDE.chestsLogic.pickText(chest.howToGet, language), store, true);
    var summary = GUIDE.chestsLogic.contentsSummary(chest.contents);
    var loot = ui.el('div', { className: 'chest-loot-list' });
    (chest.contents && chest.contents.items || []).forEach(function (entry) { loot.appendChild(chestItemNode(entry)); });
    summary.extras.forEach(function (extra) { loot.appendChild(chestExtraNode(extra)); });
    var card = ui.el('li', { id: chestCardId(chest), className: 'chest-card', tabindex: '-1' }, [
      ui.el('span', { className: 'chest-mark-badge', 'aria-label': markLabel }, markText),
      ui.el('div', { className: 'chest-card-body' }, [
        ui.el('div', { className: 'chest-title-row' }, [icon, ui.heading(3, String(type.name || chest.typeName || t('common.unknown'))), showArea ? chestAreaChip(map, chest) : null, confidenceBadge(chest)]),
        ui.el('div', { className: 'chest-copy-block' }, [ui.el('strong', {}, t('maps.chests.howToGet')), how]),
        loot
      ])
    ]);
    var targetArea = showArea ? findArea(map, chest.areaId) : null;
    var navigateToArea = targetArea ? function () {
      pendingChestKey = chestEntryKey(chest);
      selectArea(map, targetArea);
    } : null;
    if (navigateToArea) card.classList.add('has-area-link');
    registerChestCard(interaction, chest, card, navigateToArea);
    return card;
  }

  function chestsSection(map, store, areaId, interaction) {
    var ui = GUIDE.ui;
    var all = store.chestIndexes.chestsByMap.get(String(map.id)) || [];
    var base = mapChestsForArea(all, areaId);
    var dataset = store.data.chests;
    var available = dataset && !dataset.malformed && dataset.status !== 'not_found';
    var heading = ui.heading(2, GUIDE.i18n.plural('maps.chests.count', base.length, { count: GUIDE.i18n.n(base.length) }));
    var section = ui.el('section', { className: 'panel chests-section', 'aria-label': t('maps.chests') });
    var language = GUIDE.i18n.getLocale();
    section.appendChild(ui.el('header', { className: 'chests-section-header' }, [
      heading,
      ui.el('small', { className: 'chests-section-note' }, t('maps.chests.mapMarkerNote'))
    ]));
    if (!available) {
      interaction.setVisible([]);
      section.appendChild(ui.emptyState('notFound', t('maps.chests.unavailable')));
      return section;
    }
    if (!base.length) {
      interaction.setVisible([]);
      section.appendChild(ui.emptyState('notFound', areaId ? t('maps.chests.emptyArea') : t('maps.chests.empty')));
      return section;
    }

    var selectedType = null;
    var typeButtons = [];
    var unlock = null;
    var host = ui.el('div', { className: 'chest-list-host' });
    var search = null;
    if (base.length > 5) {
      var typeCounts = new Map();
      base.forEach(function (chest) { typeCounts.set(String(chest.type), (typeCounts.get(String(chest.type)) || 0) + 1); });
      var typeGroup = ui.el('fieldset', { className: 'chest-type-filters' }, ui.el('legend', {}, t('maps.chests.filter.type')));
      function addTypeButton(typeId, type, count, label) {
        var button = ui.button('', function () { selectedType = typeId; draw(); }, { className: 'chest-filter-chip', 'aria-pressed': String(selectedType === typeId) });
        if (type && type.icon) button.appendChild(directImage(type.icon, '', 24, 'chest-filter-icon'));
        button.appendChild(ui.el('span', {}, label));
        button.appendChild(ui.badge(GUIDE.i18n.n(count), 'count'));
        typeButtons.push({ id: typeId, button: button });
        typeGroup.appendChild(button);
      }
      addTypeButton(null, null, base.length, t('common.all'));
      typeCounts.forEach(function (count, typeId) {
        var type = store.chestIndexes.typesById.get(typeId) || { name: typeId };
        addTypeButton(typeId, type, count, String(type.name || typeId));
      });
      var unlockSelect = ui.el('select', { 'aria-label': t('maps.chests.filter.unlock.label'), onChange: function () { unlock = unlockSelect.value || null; draw(); } }, [
        ui.el('option', { value: '' }, t('maps.chests.filter.unlock.any')),
        ui.el('option', { value: 'none' }, t('maps.chests.filter.unlock.free')),
        ui.el('option', { value: 'enemies' }, t('maps.chests.filter.unlock.enemies')),
        ui.el('option', { value: 'key' }, t('maps.chests.filter.unlock.key')),
        ui.el('option', { value: 'other' }, t('maps.chests.filter.unlock.other'))
      ]);
      search = ui.el('input', { type: 'search', placeholder: t('maps.chests.filter.search'), 'aria-label': t('maps.chests.filter.search'), onInput: draw });
      section.appendChild(ui.el('form', { className: 'chest-toolbar', role: 'search', onSubmit: function (event) { event.preventDefault(); } }, [
        typeGroup,
        ui.el('label', {}, [ui.el('span', {}, t('maps.chests.filter.unlock.label')), unlockSelect]),
        ui.el('label', {}, [ui.el('span', {}, t('maps.chests.filter.search')), search])
      ]));
    }
    section.appendChild(host);

    function draw() {
      typeButtons.forEach(function (entry) { entry.button.setAttribute('aria-pressed', String(entry.id === selectedType)); });
      var filtered = GUIDE.chestsLogic.filterChests(base, {
        typeId: selectedType, onlyUnlockType: unlock, search: search ? search.value : ''
      });
      interaction.cards.clear();
      interaction.active.clear();
      interaction.markers.forEach(function (marker) { marker.classList.remove('is-highlighted'); });
      interaction.setVisible(filtered.map(chestEntryKey));
      if (!filtered.length) {
        host.replaceChildren(ui.emptyState('noResults', t('empty.noResults')));
        return;
      }
      var listNode = ui.el('ul', { className: 'chest-card-list', role: 'list' });
      var fragment = document.createDocumentFragment();
      filtered.forEach(function (chest) { fragment.appendChild(chestCard(map, store, chest, language, map.group && !areaId, interaction)); });
      listNode.appendChild(fragment);
      host.replaceChildren(listNode);
    }
    draw();
    return section;
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

  function dataNotesSection(map, store, areaId) {
    var ui = GUIDE.ui;
    var notes = [];
    (map.warnings || []).forEach(function (warning) {
      notes.push(t('maps.dataNotes.mapWarning', { warning: String(warning) }));
    });
    (store.mapIndexes.unmatchedPlaces || []).forEach(function (room) {
      notes.push(t('maps.dataNotes.unmatchedPlace', { room: room }));
    });
    (store.chestIndexes.unmatchedRooms || []).forEach(function (room) {
      notes.push(t('maps.dataNotes.unmatchedChestRoom', { room: room }));
    });
    var mapChests = mapChestsForArea(store.chestIndexes.chestsByMap.get(String(map.id)) || [], areaId);
    mapChests.forEach(function (chest) {
      if (!chest.position || typeof chest.position.x !== 'number' || typeof chest.position.y !== 'number') {
        notes.push(t('maps.dataNotes.chestWithoutPosition', { key: chestEntryKey(chest) }));
      }
    });
    if (store.data.chests && store.data.chests.status === 'partial') notes.push(t('maps.dataNotes.chestsPartial'));
    var content = notes.length ? ui.el('ul', { className: 'map-data-note-list' }, notes.map(function (note) { return ui.el('li', {}, note); })) : ui.el('p', {}, t('maps.dataNotes.none'));
    return ui.el('details', { className: 'panel map-data-notes' }, [ui.el('summary', {}, t('maps.dataNotes')), content]);
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
    var selectedAreaId = selectedArea ? selectedArea.id : null;
    var interaction = createChestInteraction();
    var visibleChests = mapChestsForArea(store.chestIndexes.chestsByMap.get(String(map.id)) || [], selectedAreaId);
    var overlayOptions = { chests: visibleChests, interaction: interaction };
    var sections = {
      image: map.group ? groupImageSection(map, selectedArea, overlayOptions) : imageSection(map, overlayOptions),
      chests: chestsSection(map, store, selectedAreaId, interaction),
      monsters: monstersSection(map, store, selectedAreaId),
      gatherables: gatherSection(map, store, selectedAreaId),
      fish: fishSection(map, store, selectedAreaId),
      notes: dataNotesSection(map, store, selectedAreaId)
    };
    var node = ui.el('article', { className: 'page map-detail-page' }, [
      ui.link('#/maps', t('maps.back'), 'back-link'),
      ui.el('header', { className: 'map-detail-header' }, ui.heading(1, mapName(map))),
      map.group ? areaSelector(map, selectedArea) : null
    ]);
    DETAIL_SECTION_ORDER.forEach(function (name) { node.appendChild(sections[name]); });
    revealPendingChestAfterRender(interaction);
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
