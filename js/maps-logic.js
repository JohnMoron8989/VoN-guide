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

  function compare(a, b) {
    return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function idText(value) {
    if (value === null || value === undefined) return null;
    var result = String(value);
    return result.trim() ? result : null;
  }

  function naturalCompareIds(a, b) {
    var left = idText(a); var right = idText(b);
    if (left === null || right === null) {
      if (left === right) return 0;
      return left === null ? 1 : -1;
    }
    var leftChunks = left.match(/\d+|\D+/g) || [];
    var rightChunks = right.match(/\d+|\D+/g) || [];
    var length = Math.min(leftChunks.length, rightChunks.length);
    for (var i = 0; i < length; i += 1) {
      var leftChunk = leftChunks[i]; var rightChunk = rightChunks[i];
      var leftIsNumber = /^\d+$/.test(leftChunk); var rightIsNumber = /^\d+$/.test(rightChunk);
      if (leftIsNumber && rightIsNumber) {
        var leftNumber = leftChunk.replace(/^0+(?=\d)/, '');
        var rightNumber = rightChunk.replace(/^0+(?=\d)/, '');
        if (leftNumber.length !== rightNumber.length) return leftNumber.length - rightNumber.length;
        if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
      } else if (leftIsNumber !== rightIsNumber) {
        return leftIsNumber ? -1 : 1;
      } else {
        var leftText = leftChunk.toLowerCase(); var rightText = rightChunk.toLowerCase();
        if (leftText !== rightText) return leftText < rightText ? -1 : 1;
      }
    }
    return leftChunks.length - rightChunks.length;
  }

  function sortMapsById(list) {
    return records(list).map(function (map, index) {
      return { map: map, index: index };
    }).sort(function (a, b) {
      return naturalCompareIds(a.map && (a.map.sortId || a.map.id), b.map && (b.map.sortId || b.map.id)) || a.index - b.index;
    }).map(function (entry) { return entry.map; });
  }

  function childValue(entry) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) return entry.id === undefined ? (entry.room === undefined ? entry.value : entry.room) : entry.id;
    return entry;
  }

  function areaLabel(child, parent, fallback) {
    var childName = text(child && child.name); var parentName = text(parent && parent.name);
    var value = childName.toLocaleLowerCase().indexOf(parentName.toLocaleLowerCase()) === 0 ? childName.slice(parentName.length) : childName;
    value = value.replace(/^[\s\-–—:]+/, '').trim();
    return value || String(fallback);
  }

  function prepareMaps(value) {
    var source = records(value).filter(function (map) { return map && map.id !== null && map.id !== undefined; });
    if (source.some(function (map) { return map.group === true || (map.group === false && Array.isArray(map.areas)); })) return source.slice();
    var exact = new Map(); var lower = new Map(); var rooms = new Map(); var lowerRooms = new Map();
    source.forEach(function (map) {
      exact.set(String(map.id), map);
      if (!lower.has(String(map.id).toLocaleLowerCase())) lower.set(String(map.id).toLocaleLowerCase(), map);
      var room = map.room === null || map.room === undefined ? map.id : map.room;
      rooms.set(String(room), map);
      if (!lowerRooms.has(String(room).toLocaleLowerCase())) lowerRooms.set(String(room).toLocaleLowerCase(), map);
    });
    function resolve(entry) {
      var value = childValue(entry);
      if (value === null || value === undefined) return null;
      var key = String(value); var folded = key.toLocaleLowerCase();
      return exact.get(key) || rooms.get(key) || lower.get(folded) || lowerRooms.get(folded) || null;
    }
    function plain(map) {
      var room = map.room === null || map.room === undefined ? String(map.id) : String(map.room);
      return Object.assign({}, map, { id: String(map.id), room: room, group: false, sortId: String(map.sortId || map.id), areas: [] });
    }
    var claimed = new Map(); var members = new Set(); var groups = []; var groupIds = new Set();
    source.forEach(function (parent) {
      if (!Array.isArray(parent.children) || !parent.children.length || members.has(String(parent.id))) return;
      var warnings = Array.isArray(parent.warnings) ? parent.warnings.slice() : [];
      var parentMap = plain(parent);
      var areas = [{
        id: parentMap.room, room: parentMap.room, label: null, isParent: true,
        size: parentMap.size || null, image: parentMap.image, gatherables: records(parentMap.gatherables), source: parentMap.source
      }];
      var position = 0;
      function addChildren(children, trail, depth) {
        if (depth > 8) { warnings.push('Children depth limit exceeded'); return; }
        records(children).forEach(function (childEntry) {
          var child = resolve(childEntry);
          if (!child) { warnings.push('Unknown child ' + text(childValue(childEntry))); return; }
          var childId = String(child.id); var folded = childId.toLocaleLowerCase();
          if (trail.indexOf(folded) !== -1) { warnings.push('Children cycle detected at ' + childId); return; }
          members.add(childId);
          if (Array.isArray(child.children) && child.children.length) { addChildren(child.children, trail.concat(folded), depth + 1); return; }
          var childMap = plain(child); var prior = claimed.get(childMap.room.toLocaleLowerCase());
          if (prior && prior !== String(parent.id)) { warnings.push('Child ' + childId + ' is already claimed by ' + prior); return; }
          claimed.set(childMap.room.toLocaleLowerCase(), String(parent.id));
          position += 1;
          var explicit = childEntry && typeof childEntry === 'object' && !Array.isArray(childEntry) ? childEntry.label : null;
          areas.push({
            id: childMap.room, room: childMap.room, label: explicit === null || explicit === undefined ? areaLabel(child, parent, position) : explicit,
            isParent: false, size: childMap.size || null, image: childMap.image,
            gatherables: records(childMap.gatherables), source: childMap.source
          });
        });
      }
      addChildren(parent.children, [String(parent.id).toLocaleLowerCase()], 1);
      var roomIds = areas.map(function (area) { return area.room; }).sort(naturalCompareIds);
      groups.push(Object.assign({}, parent, {
        id: String(parent.id), room: parentMap.room, group: true, sortId: roomIds[0] || String(parent.id),
        areas: areas, image: areas[0] && areas[0].image, size: null, warnings: warnings
      }));
      groupIds.add(String(parent.id));
    });
    return source.filter(function (map) { return !members.has(String(map.id)) && !groupIds.has(String(map.id)); }).map(plain).concat(groups);
  }

  function buildRoomToMapIndex(value) {
    var result = new Map(); var folded = new Map();
    function add(roomId, target) {
      if (roomId === null || roomId === undefined || String(roomId) === '') return;
      var key = String(roomId);
      if (!result.has(key)) result.set(key, target);
      if (!folded.has(key.toLocaleLowerCase())) folded.set(key.toLocaleLowerCase(), target);
    }
    records(value).forEach(function (map) {
      if (!map || map.id === null || map.id === undefined) return;
      var mapId = String(map.id);
      if (map.group && Array.isArray(map.areas)) {
        map.areas.forEach(function (area) {
          if (!area) return;
          var areaId = String(area.id === undefined ? area.room : area.id);
          add(area.room === undefined ? areaId : area.room, { mapId: mapId, areaId: areaId });
          add(areaId, { mapId: mapId, areaId: areaId });
        });
        if (!result.has(mapId)) add(mapId, { mapId: mapId, areaId: null });
      } else {
        add(map.room === undefined ? mapId : map.room, { mapId: mapId, areaId: null });
        add(mapId, { mapId: mapId, areaId: null });
      }
    });
    var directGet = result.get.bind(result);
    result.get = function (key) {
      if (key === null || key === undefined) return undefined;
      return directGet(String(key)) || folded.get(String(key).toLocaleLowerCase());
    };
    return result;
  }

  function mapRouteForRoom(roomToMap, roomId) {
    var target = roomToMap && typeof roomToMap.get === 'function' ? roomToMap.get(roomId) : null;
    if (!target) return null;
    var hash = '#/maps/' + encodeURIComponent(target.mapId);
    return target.areaId === null || target.areaId === undefined ? hash : hash + '/' + encodeURIComponent(target.areaId);
  }

  function filterByArea(entries, areaId) {
    var list = records(entries).slice();
    if (areaId === null || areaId === undefined || String(areaId) === '') return list;
    return list.filter(function (entry) {
      return Array.isArray(entry && entry.areas) && entry.areas.some(function (id) { return String(id).toLocaleLowerCase() === String(areaId).toLocaleLowerCase(); });
    });
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
    var maps = sortMapsById(prepareMaps(input.maps));

    var mapById = new Map();
    maps.forEach(function (map) {
      var id = String(map.id);
      mapById.set(id, map);
    });
    var roomToMap = buildRoomToMapIndex(maps);
    var unmatched = new Set();

    function matchPlace(placeId) {
      if (placeId === null || placeId === undefined || String(placeId) === '') return null;
      var value = String(placeId);
      var target = roomToMap.get(value);
      if (target) return target;
      unmatched.add(value);
      return null;
    }

    var areaOrder = new Map();
    maps.forEach(function (map) {
      var order = new Map();
      records(map.areas).forEach(function (area, index) { order.set(String(area.id), index); });
      areaOrder.set(String(map.id), order);
    });
    function sortedAreas(mapId, values) {
      var order = areaOrder.get(String(mapId)) || new Map();
      return Array.from(values).sort(function (a, b) {
        var ai = order.has(String(a)) ? order.get(String(a)) : 9999;
        var bi = order.has(String(b)) ? order.get(String(b)) : 9999;
        return ai - bi || naturalCompareIds(a, b);
      });
    }

    var monstersByMapWork = new Map();
    var monsterRecords = records(input.monsters);
    var monsterById = byStringId(monsterRecords);
    var howStrength = { event: 1, spawner: 2, placed: 3 };
    monsterRecords.forEach(function (monster) {
      if (!monster || monster.id === null || monster.id === undefined) return;
      records(monster.locations).forEach(function (location) {
        var target = matchPlace(location && location.placeId);
        if (!target) return;
        var mapId = target.mapId;
        if (!monstersByMapWork.has(mapId)) monstersByMapWork.set(mapId, new Map());
        var group = monstersByMapWork.get(mapId);
        var monsterId = monster.id;
        var entry = group.get(String(monsterId));
        if (!entry) entry = { monsterId: monsterId, how: null, placedCount: 0, hasCount: false, areas: new Set() };
        if (location && typeof location.placedCount === 'number' && Number.isFinite(location.placedCount)) {
          entry.placedCount += location.placedCount;
          entry.hasCount = true;
        }
        var how = location && location.how ? String(location.how) : null;
        if ((howStrength[how] || 0) > (howStrength[entry.how] || 0)) entry.how = how;
        if (target.areaId !== null && target.areaId !== undefined) entry.areas.add(target.areaId);
        group.set(String(monsterId), entry);
      });
    });
    var monstersByMap = new Map();
    monstersByMapWork.forEach(function (group, mapId) {
      var list = Array.from(group.values()).map(function (entry) {
        return { monsterId: entry.monsterId, how: entry.how, placedCount: entry.hasCount ? entry.placedCount : null, areas: sortedAreas(mapId, entry.areas) };
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
        var target = matchPlace(place && place.placeId);
        if (!target || !hasPositiveRate(place)) return;
        if (!fishSets.has(target.mapId)) fishSets.set(target.mapId, new Map());
        var group = fishSets.get(target.mapId);
        var entry = group.get(String(itemId));
        if (!entry) entry = { itemId: itemId, areas: new Set() };
        if (target.areaId !== null && target.areaId !== undefined) entry.areas.add(target.areaId);
        group.set(String(itemId), entry);
      });
    });
    var fishByMap = new Map();
    fishSets.forEach(function (ids, mapId) {
      var list = Array.from(ids.values()).map(function (entry) { return { itemId: entry.itemId, areas: sortedAreas(mapId, entry.areas) }; });
      list.sort(function (a, b) {
        return compare(resolveItem(a.itemId, input.items, input.fish, []).name, resolveItem(b.itemId, input.items, input.fish, []).name) || compare(a.itemId, b.itemId);
      });
      fishByMap.set(mapId, list);
    });

    var gatherWork = new Map();
    function addGatherable(target, source) {
      if (!target || !source) return;
      var mapId = target.mapId;
      var itemId = source.itemId;
      if ((itemId === null || itemId === undefined) && typeof source.id === 'number') itemId = source.id;
      if (itemId === null || itemId === undefined) return;
      if (!gatherWork.has(mapId)) gatherWork.set(mapId, new Map());
      var group = gatherWork.get(mapId);
      var key = String(itemId);
      var entry = group.get(key);
      if (!entry) entry = { itemId: itemId, count: 0, how: new Set(), seasons: new Set(), nodeNames: new Set(), areas: new Set() };
      var count = source.count;
      if (count === null || count === undefined) count = source.placedCount;
      if (count === null || count === undefined) count = source.quantity;
      if (typeof count === 'number' && Number.isFinite(count)) entry.count += count;
      arrayValue(source.how).forEach(function (how) { if (how !== null && how !== undefined && String(how)) entry.how.add(String(how)); });
      arrayValue(source.seasons).forEach(function (season) { if (season !== null && season !== undefined && String(season)) entry.seasons.add(String(season)); });
      arrayValue(source.nodeNames || source.nodeName || source.node).forEach(function (name) { if (name !== null && name !== undefined && text(name)) entry.nodeNames.add(text(name)); });
      if (target.areaId !== null && target.areaId !== undefined) entry.areas.add(target.areaId);
      group.set(key, entry);
    }

    maps.forEach(function (map) {
      if (map.group) {
        records(map.areas).forEach(function (area) {
          var target = roomToMap.get(area && (area.room === undefined ? area.id : area.room));
          records(area && area.gatherables).forEach(function (entry) { addGatherable(target, entry); });
        });
      } else {
        var target = roomToMap.get(map.room === undefined ? map.id : map.room);
        records(map.gatherables).forEach(function (entry) { addGatherable(target, entry); });
      }
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
        return { itemId: entry.itemId, count: entry.count, how: how, seasons: seasons, nodeNames: Array.from(entry.nodeNames).sort(compare), areas: sortedAreas(mapId, entry.areas) };
      });
      list.sort(function (a, b) {
        return compare(resolveItem(a.itemId, input.items, input.fish, []).name, resolveItem(b.itemId, input.items, input.fish, []).name) || compare(a.itemId, b.itemId);
      });
      gatherablesByMap.set(mapId, list);
    });

    return {
      mapById: mapById,
      roomToMap: roomToMap,
      maps: maps,
      list: maps,
      monstersByMap: monstersByMap,
      fishByMap: fishByMap,
      gatherablesByMap: gatherablesByMap,
      unmatchedPlaces: Array.from(unmatched).sort(compare)
    };
  }

  return {
    buildMapIndexes: buildMapIndexes,
    buildRoomToMapIndex: buildRoomToMapIndex,
    filterByArea: filterByArea,
    mapRouteForRoom: mapRouteForRoom,
    resolveItem: resolveItem,
    naturalCompareIds: naturalCompareIds,
    sortMapsById: sortMapsById
  };
});
