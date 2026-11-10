(function (root, factory) {
  var api = factory();
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.util = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function normalizeSearch(value) {
    return String(value === null || value === undefined ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .trim();
  }

  function isRaw(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.raw === 'string';
  }

  function asArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function splitPlaces(list, max) {
    var limit = Number.isFinite(Number(max)) ? Math.max(0, Math.floor(Number(max))) : 3;
    var seen = new Set();
    var names = [];
    (Array.isArray(list) ? list : []).forEach(function (value) {
      if (value === null || value === undefined) return;
      var name = String(value);
      if (!name.trim() || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
    var visible = names.slice(0, limit);
    var hidden = names.slice(limit);
    return { visible: visible, hidden: hidden, hiddenCount: hidden.length };
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait);
    };
  }

  function timeMatches(hour, start, end) {
    if (hour === null || hour === undefined || hour === '') return true;
    if (start === null || start === undefined || end === null || end === undefined) return true;
    if (isRaw(start) || isRaw(end)) return false;
    var value = ((Number(hour) % 24) + 24) % 24;
    var from = ((Number(start) % 24) + 24) % 24;
    var to = ((Number(end) % 24) + 24) % 24;
    if (from === to) return true;
    return from < to ? value >= from && value < to : value >= from || value < to;
  }

  function compareValues(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function safeGet(storage, key, fallback) {
    try {
      var value = storage && storage.getItem(key);
      return value === null || value === undefined ? fallback : value;
    } catch (_) { return fallback; }
  }

  function safeSet(storage, key, value) {
    try { if (storage) storage.setItem(key, value); return true; }
    catch (_) { return false; }
  }

  function safeRemove(storage, key) {
    try { if (storage) storage.removeItem(key); return true; }
    catch (_) { return false; }
  }

  function mapPush(map, key, value) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  return {
    normalizeSearch: normalizeSearch,
    isRaw: isRaw,
    asArray: asArray,
    unique: unique,
    splitPlaces: splitPlaces,
    debounce: debounce,
    timeMatches: timeMatches,
    compareValues: compareValues,
    safeGet: safeGet,
    safeSet: safeSet,
    safeRemove: safeRemove,
    mapPush: mapPush
  };
});
