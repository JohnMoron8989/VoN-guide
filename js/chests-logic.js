(function (root, factory) {
  var api = factory();
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.chestsLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function records(value) {
    if (Array.isArray(value)) return value;
    return value && Array.isArray(value.records) ? value.records : [];
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalize(value) {
    return String(value === null || value === undefined ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .trim();
  }

  function pickText(textObj, lang) {
    if (!textObj || typeof textObj !== 'object' || Array.isArray(textObj)) return '';
    var preferred = textObj[lang];
    if (typeof preferred === 'string' && preferred.trim()) return preferred;
    return typeof textObj.en === 'string' && textObj.en.trim() ? textObj.en : '';
  }

  function splitPlaceholders(text) {
    if (text === null || text === undefined || text === '') return [];
    var value = String(text);
    var pattern = /\{item:(\d+)\}/g;
    var parts = [];
    var start = 0;
    var match;
    while ((match = pattern.exec(value))) {
      if (match.index > start) parts.push({ type: 'text', value: value.slice(start, match.index) });
      parts.push({ type: 'item', itemId: Number(match[1]) });
      start = match.index + match[0].length;
    }
    if (start < value.length) parts.push({ type: 'text', value: value.slice(start) });
    return parts;
  }

  function roomIndexFrom(input) {
    if (input && input.roomToMap && typeof input.roomToMap.get === 'function') return input.roomToMap;
    return input && typeof input.get === 'function' ? input : null;
  }

  function resolveRoom(roomToMap, room) {
    if (!roomToMap || room === null || room === undefined) return null;
    var key = String(room);
    if (typeof roomToMap.has === 'function' && roomToMap.has(key)) return roomToMap.get(key) || null;
    var direct = roomToMap.get(key);
    if (direct) return direct;
    var folded = key.toLocaleLowerCase();
    var found = null;
    if (typeof roomToMap.forEach === 'function') {
      roomToMap.forEach(function (target, candidate) {
        if (!found && String(candidate).toLocaleLowerCase() === folded) found = target;
      });
    }
    return found;
  }

  function mapFrom(input, mapId) {
    if (!input || mapId === null || mapId === undefined) return null;
    if (input.mapById && typeof input.mapById.get === 'function') {
      var indexed = input.mapById.get(String(mapId));
      if (indexed) return indexed;
    }
    return records(input.maps || input.list).find(function (map) {
      return map && String(map.id).toLocaleLowerCase() === String(mapId).toLocaleLowerCase();
    }) || null;
  }

  function areaInfo(input, target) {
    if (!target || target.areaId === null || target.areaId === undefined) return { area: null, order: 0 };
    var map = mapFrom(input, target.mapId);
    var areas = list(map && map.areas);
    var folded = String(target.areaId).toLocaleLowerCase();
    for (var i = 0; i < areas.length; i += 1) {
      var area = areas[i];
      if (area && String(area.id === undefined ? area.room : area.id).toLocaleLowerCase() === folded) return { area: area, order: i };
    }
    return { area: null, order: Number.MAX_SAFE_INTEGER };
  }

  function buildChestIndexes(chestsDataset, mapsIndexes) {
    var chestsByMap = new Map();
    var typesById = new Map();
    var unmatchedRooms = [];
    var roomToMap = roomIndexFrom(mapsIndexes);
    list(chestsDataset && chestsDataset.types).forEach(function (type) {
      if (type && type.id !== null && type.id !== undefined) typesById.set(String(type.id), type);
    });
    records(chestsDataset).forEach(function (record) {
      if (!record) return;
      var target = resolveRoom(roomToMap, record.room);
      if (!target) {
        if (record.room !== null && record.room !== undefined) unmatchedRooms.push(String(record.room));
        return;
      }
      var info = areaInfo(mapsIndexes, target);
      var recordArea = record.area && typeof record.area === 'object' ? record.area : null;
      var areaLabel = info.area && info.area.label !== null && info.area.label !== undefined ? info.area.label : (recordArea && recordArea.label !== undefined ? recordArea.label : null);
      var mapId = String(target.mapId);
      if (!chestsByMap.has(mapId)) chestsByMap.set(mapId, []);
      list(record.chests).forEach(function (chest) {
        if (!chest || typeof chest !== 'object') return;
        var type = typesById.get(String(chest.type));
        chestsByMap.get(mapId).push(Object.assign({}, chest, {
          mapId: mapId,
          room: record.room === null || record.room === undefined ? null : String(record.room),
          roomSize: record.size || null,
          areaId: target.areaId === null || target.areaId === undefined ? null : String(target.areaId),
          areaLabel: areaLabel === null || areaLabel === undefined ? null : String(areaLabel),
          areaOrder: info.order,
          typeName: type && type.name ? String(type.name) : String(chest.type || '')
        }));
      });
    });
    chestsByMap.forEach(function (chests, mapId) { chestsByMap.set(mapId, sortChests(chests)); });
    unmatchedRooms = Array.from(new Set(unmatchedRooms)).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return { chestsByMap: chestsByMap, typesById: typesById, unmatchedRooms: unmatchedRooms };
  }

  function numeric(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function compareValue(left, right) {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left < right ? -1 : 1;
  }

  function sortChests(value) {
    return list(value).map(function (chest, index) { return { chest: chest, index: index }; }).sort(function (left, right) {
      var a = left.chest || {};
      var b = right.chest || {};
      var area = compareValue(numeric(a.areaOrder), numeric(b.areaOrder));
      if (area) return area;
      var mark = compareValue(numeric(a.mark), numeric(b.mark));
      if (mark) return mark;
      var y = compareValue(numeric(a.position && a.position.y), numeric(b.position && b.position.y));
      if (y) return y;
      var x = compareValue(numeric(a.position && a.position.x), numeric(b.position && b.position.x));
      if (x) return x;
      var instance = compareValue(numeric(a.instanceId), numeric(b.instanceId));
      if (instance) return instance;
      return left.index - right.index;
    }).map(function (entry) { return entry.chest; });
  }

  function searchText(chest) {
    var values = [chest && chest.typeName, chest && chest.type];
    ['en', 'id'].forEach(function (lang) {
      values.push(pickText(chest && chest.howToGet, lang));
      values.push(pickText(chest && chest.contentsText, lang));
    });
    list(chest && chest.itemNames).forEach(function (name) { values.push(name); });
    list(chest && chest.contents && chest.contents.items).forEach(function (item) {
      if (item) values.push(item.itemName || item.name || '');
    });
    return normalize(values.join(' '));
  }

  function filterChests(value, filters) {
    filters = filters || {};
    var area = filters.areaId === null || filters.areaId === undefined || String(filters.areaId) === '' ? null : normalize(filters.areaId);
    var type = filters.typeId === null || filters.typeId === undefined || String(filters.typeId) === '' ? null : String(filters.typeId);
    var unlock = filters.onlyUnlockType === null || filters.onlyUnlockType === undefined || String(filters.onlyUnlockType) === '' ? null : String(filters.onlyUnlockType);
    var needle = normalize(filters.search);
    return list(value).filter(function (chest) {
      if (!chest) return false;
      if (area !== null && normalize(chest.areaId) !== area) return false;
      if (type !== null && String(chest.type) !== type) return false;
      var unlockType = chest.unlock && chest.unlock.type ? String(chest.unlock.type) : 'unknown';
      if (unlock === 'other') {
        if (['none', 'enemies', 'key'].indexOf(unlockType) !== -1) return false;
      } else if (unlock !== null && unlockType !== unlock) return false;
      return !needle || searchText(chest).indexOf(needle) !== -1;
    });
  }

  function contentsSummary(contents) {
    contents = contents && typeof contents === 'object' ? contents : {};
    var knownModes = ['fixed', 'oneOf', 'randomPool', 'varies'];
    var mode = knownModes.indexOf(contents.mode) === -1 ? 'unknown' : contents.mode;
    var itemIds = [];
    var seen = new Set();
    var hasChance = false;
    list(contents.items).forEach(function (item) {
      if (!item) return;
      if (typeof item.itemId === 'number' && Number.isFinite(item.itemId) && !seen.has(item.itemId)) {
        seen.add(item.itemId);
        itemIds.push(item.itemId);
      }
      if (typeof item.chancePct === 'number' && Number.isFinite(item.chancePct)) hasChance = true;
    });
    return { mode: mode, itemIds: itemIds, extras: list(contents.extras).slice(), hasChance: hasChance };
  }

  function chestsByItem(chestsDataset, mapsIndexes) {
    var result = new Map();
    var roomToMap = roomIndexFrom(mapsIndexes);
    records(chestsDataset).forEach(function (record) {
      if (!record) return;
      var target = resolveRoom(roomToMap, record.room);
      if (!target) return;
      list(record.chests).forEach(function (chest) {
        var ids = new Set();
        list(chest && chest.contents && chest.contents.items).forEach(function (item) {
          if (item && typeof item.itemId === 'number' && Number.isFinite(item.itemId)) ids.add(item.itemId);
        });
        ids.forEach(function (itemId) {
          if (!result.has(itemId)) result.set(itemId, []);
          var entries = result.get(itemId);
          var areaId = target.areaId === null || target.areaId === undefined ? null : String(target.areaId);
          var entry = entries.find(function (candidate) { return candidate.mapId === String(target.mapId) && candidate.areaId === areaId; });
          if (entry) entry.count += 1;
          else entries.push({ mapId: String(target.mapId), areaId: areaId, count: 1 });
        });
      });
    });
    return result;
  }

  function markerPosition(chest, size) {
    var x = numeric(chest && chest.position && chest.position.x);
    var y = numeric(chest && chest.position && chest.position.y);
    var width = numeric(size && size.width);
    var height = numeric(size && size.height);
    if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
    function clamp(value) { return Math.max(0, Math.min(100, value)); }
    return { leftPct: clamp(x / width * 100), topPct: clamp(y / height * 100) };
  }

  function canOverlay(image, size) {
    var imageWidth = numeric(image && image.width);
    var imageHeight = numeric(image && image.height);
    var width = numeric(size && size.width);
    var height = numeric(size && size.height);
    if (imageWidth === null || imageHeight === null || width === null || height === null || imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0) return false;
    return Math.abs((imageWidth / imageHeight) / (width / height) - 1) <= 0.01;
  }

  return {
    buildChestIndexes: buildChestIndexes,
    sortChests: sortChests,
    filterChests: filterChests,
    pickText: pickText,
    splitPlaceholders: splitPlaceholders,
    contentsSummary: contentsSummary,
    chestsByItem: chestsByItem,
    markerPosition: markerPosition,
    canOverlay: canOverlay
  };
});
