(function (root, factory) {
  var api = factory();
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.mapsLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function records(value) {
    if (Array.isArray(value)) return value;
    return value && Array.isArray(value.records) ? value.records : [];
  }

  function text(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (value.en !== null && value.en !== undefined) return String(value.en);
      if (value.id !== null && value.id !== undefined) return String(value.id);
      if (value.raw !== null && value.raw !== undefined) return String(value.raw);
    }
    return String(value);
  }

  function normalize(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  }

  function compare(a, b) {
    return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function byStringId(value) {
    var result = new Map();
    records(value).forEach(function (entry) {
      if (!entry || entry.id === null || entry.id === undefined) return;
      result.set(String(entry.id), entry);
      if (entry.itemId !== null && entry.itemId !== undefined) result.set(String(entry.itemId), entry);
    });
    return result;
  }

  function resolveItem(itemId, items, fish, sprites) {
    var id = typeof itemId === 'number' ? itemId : Number(itemId);
    if (!Number.isFinite(id)) id = itemId;
    var item = byStringId(items).get(String(itemId));
    var fishRecord = byStringId(fish).get(String(itemId));
    var source = item || fishRecord;
    var name = source && text(source.name) ? text(source.name) : (fishRecord && text(fishRecord.name) ? text(fishRecord.name) : 'Item #' + text(itemId));
    var spriteName = (item && text(item.icon)) || (fishRecord && text(fishRecord.icon)) || '';
    var sprite = records(sprites).find(function (entry) { return entry && String(entry.name) === spriteName; });
    var icon = sprite && sprite.path ? String(sprite.path) : (/^assets\//.test(spriteName) ? spriteName : null);
    return { id: id, name: name, icon: icon };
  }

  function filterMaps(list, query) {
    var needle = normalize(query);
    if (!needle) return records(list).slice();
    return records(list).filter(function (map) {
      return normalize(map && map.name).indexOf(needle) !== -1 || normalize(map && (map.id === undefined ? map.room : map.id)).indexOf(needle) !== -1;
    });
  }

  function hasPositiveRate(place) {
    return records(place && place.seasons).some(function (season) {
      return records(season && season.periods).some(function (period) {
        if (Number(period && period.basePoolRatePercent) > 0) return true;
        return Object.keys(period && period.calculatedCatchRatesPercent || {}).some(function (key) {
          return Number(period.calculatedCatchRatesPercent[key]) > 0;
        });
      });
    });
  }

  function arrayValue(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  function buildMapIndexes(input) {
    input = input || {};
    var maps = records(input.maps).filter(function (map) { return map && map.id !== null && map.id !== undefined; }).slice();
    maps.sort(function (a, b) {
      var ao = Number(a.order); var bo = Number(b.order);
      var aHasOrder = Number.isFinite(ao); var bHasOrder = Number.isFinite(bo);
      if (aHasOrder && bHasOrder && ao !== bo) return ao - bo;
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
      return compare(a.name, b.name) || compare(a.id, b.id);
    });

    var mapById = new Map();
    var lowerIds = new Map();
    maps.forEach(function (map) {
      var id = String(map.id);
      mapById.set(id, map);
      if (!lowerIds.has(id.toLocaleLowerCase())) lowerIds.set(id.toLocaleLowerCase(), id);
    });
    var unmatched = new Set();

    function matchPlace(placeId) {
      if (placeId === null || placeId === undefined || String(placeId) === '') return null;
      var value = String(placeId);
      if (mapById.has(value)) return value;
      var insensitive = lowerIds.get(value.toLocaleLowerCase());
      if (insensitive !== undefined) return insensitive;
      unmatched.add(value);
      return null;
    }

    var monstersByMapWork = new Map();
    var monsterRecords = records(input.monsters);
    var monsterById = byStringId(monsterRecords);
    var howStrength = { event: 1, spawner: 2, placed: 3 };
    monsterRecords.forEach(function (monster) {
      if (!monster || monster.id === null || monster.id === undefined) return;
      records(monster.locations).forEach(function (location) {
        var mapId = matchPlace(location && location.placeId);
        if (!mapId) return;
        if (!monstersByMapWork.has(mapId)) monstersByMapWork.set(mapId, new Map());
        var group = monstersByMapWork.get(mapId);
        var monsterId = monster.id;
        var entry = group.get(String(monsterId));
        if (!entry) entry = { monsterId: monsterId, how: null, placedCount: 0, hasCount: false };
        if (location && typeof location.placedCount === 'number' && Number.isFinite(location.placedCount)) {
          entry.placedCount += location.placedCount;
          entry.hasCount = true;
        }
        var how = location && location.how ? String(location.how) : null;
        if ((howStrength[how] || 0) > (howStrength[entry.how] || 0)) entry.how = how;
        group.set(String(monsterId), entry);
      });
    });
    var monstersByMap = new Map();
    monstersByMapWork.forEach(function (group, mapId) {
      var list = Array.from(group.values()).map(function (entry) {
        return { monsterId: entry.monsterId, how: entry.how, placedCount: entry.hasCount ? entry.placedCount : null };
      });
      list.sort(function (a, b) {
        var am = monsterById.get(String(a.monsterId)); var bm = monsterById.get(String(b.monsterId));
        return compare(am && am.name || a.monsterId, bm && bm.name || b.monsterId);
      });
      monstersByMap.set(mapId, list);
    });

    var fishSets = new Map();
    records(input.fishingRate).forEach(function (fishRate) {
      if (!fishRate) return;
      var itemId = fishRate.itemId === null || fishRate.itemId === undefined ? fishRate.id : fishRate.itemId;
      if (itemId === null || itemId === undefined) return;
      records(fishRate.places).forEach(function (place) {
        var mapId = matchPlace(place && place.placeId);
        if (!mapId || !hasPositiveRate(place)) return;
        if (!fishSets.has(mapId)) fishSets.set(mapId, new Set());
        fishSets.get(mapId).add(itemId);
      });
    });
    var fishByMap = new Map();
    fishSets.forEach(function (ids, mapId) {
      var list = Array.from(ids);
      list.sort(function (a, b) {
        return compare(resolveItem(a, input.items, input.fish, []).name, resolveItem(b, input.items, input.fish, []).name) || compare(a, b);
      });
      fishByMap.set(mapId, list);
    });

    var gatherWork = new Map();
    function addGatherable(mapId, source) {
      if (!mapId || !source) return;
      var itemId = source.itemId;
      if ((itemId === null || itemId === undefined) && typeof source.id === 'number') itemId = source.id;
      if (itemId === null || itemId === undefined) return;
      if (!gatherWork.has(mapId)) gatherWork.set(mapId, new Map());
      var group = gatherWork.get(mapId);
      var key = String(itemId);
      var entry = group.get(key);
      if (!entry) entry = { itemId: itemId, count: 0, how: new Set(), seasons: new Set(), nodeNames: new Set() };
      var count = source.count;
      if (count === null || count === undefined) count = source.placedCount;
      if (count === null || count === undefined) count = source.quantity;
      if (typeof count === 'number' && Number.isFinite(count)) entry.count += count;
      arrayValue(source.how).forEach(function (how) { if (how !== null && how !== undefined && String(how)) entry.how.add(String(how)); });
      arrayValue(source.seasons).forEach(function (season) { if (season !== null && season !== undefined && String(season)) entry.seasons.add(String(season)); });
      arrayValue(source.nodeNames || source.nodeName || source.node).forEach(function (name) { if (name !== null && name !== undefined && text(name)) entry.nodeNames.add(text(name)); });
      group.set(key, entry);
    }

    maps.forEach(function (map) {
      records(map.gatherables).forEach(function (entry) { addGatherable(String(map.id), entry); });
    });
    records(input.gatherables).forEach(function (entry) {
      if (!entry) return;
      var direct = entry.placeId === undefined ? (entry.mapId === undefined ? entry.roomId : entry.mapId) : entry.placeId;
      if (direct !== null && direct !== undefined) addGatherable(matchPlace(direct), entry);
      records(entry.places).forEach(function (place) {
        var placeId = typeof place === 'object' && place ? (place.placeId === undefined ? place.id : place.placeId) : place;
        addGatherable(matchPlace(placeId), Object.assign({}, entry, typeof place === 'object' && place ? place : {}));
      });
      records(entry.locations).forEach(function (location) {
        var placeId = location && (location.placeId === undefined ? location.mapId : location.placeId);
        addGatherable(matchPlace(placeId), Object.assign({}, entry, location || {}));
      });
    });

    var gatherablesByMap = new Map();
    var seasonOrder = ['moonspring', 'spring', 'summer', 'autumn', 'winter'];
    var gatherHowOrder = ['placed', 'spawner', 'random', 'event'];
    gatherWork.forEach(function (group, mapId) {
      var list = Array.from(group.values()).map(function (entry) {
        var how = Array.from(entry.how).sort(function (a, b) {
          var ai = gatherHowOrder.indexOf(a); var bi = gatherHowOrder.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || compare(a, b);
        });
        var seasons = Array.from(entry.seasons).sort(function (a, b) {
          var ai = seasonOrder.indexOf(a); var bi = seasonOrder.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || compare(a, b);
        });
        return { itemId: entry.itemId, count: entry.count, how: how, seasons: seasons, nodeNames: Array.from(entry.nodeNames).sort(compare) };
      });
      list.sort(function (a, b) {
        return compare(resolveItem(a.itemId, input.items, input.fish, []).name, resolveItem(b.itemId, input.items, input.fish, []).name) || compare(a.itemId, b.itemId);
      });
      gatherablesByMap.set(mapId, list);
    });

    return {
      mapById: mapById,
      maps: maps,
      list: maps,
      monstersByMap: monstersByMap,
      fishByMap: fishByMap,
      gatherablesByMap: gatherablesByMap,
      unmatchedPlaces: Array.from(unmatched).sort(compare)
    };
  }

  return { buildMapIndexes: buildMapIndexes, resolveItem: resolveItem, filterMaps: filterMaps };
});
