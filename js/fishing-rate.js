(function (root, factory) {
  var api = factory();
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.fishingRate = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function parseCombo(key) {
    if (key === 'no-bait') return { kind: 'no-bait' };
    if (typeof key !== 'string') return null;
    var match = /^rod-(\d+)-bait-(\d+)$/.exec(key);
    if (!match) return null;
    return { kind: 'combo', rodId: Number(match[1]), baitId: Number(match[2]) };
  }

  function eachPeriod(records, callback) {
    (Array.isArray(records) ? records : []).forEach(function (record) {
      (record && Array.isArray(record.places) ? record.places : []).forEach(function (place) {
        (place && Array.isArray(place.seasons) ? place.seasons : []).forEach(function (season) {
          (season && Array.isArray(season.periods) ? season.periods : []).forEach(callback);
        });
      });
    });
  }

  function listCombos(records) {
    var rods = new Set();
    var baits = new Set();
    eachPeriod(records, function (period) {
      var rates = period && period.calculatedCatchRatesPercent;
      if (!rates || typeof rates !== 'object') return;
      Object.keys(rates).forEach(function (key) {
        var parsed = parseCombo(key);
        if (!parsed || parsed.kind !== 'combo') return;
        rods.add(parsed.rodId);
        baits.add(parsed.baitId);
      });
    });
    return {
      rods: Array.from(rods).sort(function (a, b) { return a - b; }),
      baits: Array.from(baits).sort(function (a, b) { return a - b; })
    };
  }

  function numericRate(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function pickRate(period, selection) {
    var rates = period && period.calculatedCatchRatesPercent;
    if (!rates || typeof rates !== 'object') return null;
    selection = selection || {};
    if (selection.baitId === null || selection.baitId === undefined) return numericRate(rates['no-bait']);
    if (selection.rodId === null || selection.rodId === undefined) return null;
    var key = 'rod-' + Number(selection.rodId) + '-bait-' + Number(selection.baitId);
    return Object.prototype.hasOwnProperty.call(rates, key) ? numericRate(rates[key]) : null;
  }

  function formatPercent(value) {
    value = numericRate(value);
    if (value === null) return '-';
    if (value > 0 && value < 0.01) return '<0.01%';
    var rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1') + '%';
  }

  function formatHour(hour) {
    var value = Number(hour);
    if (!Number.isFinite(value)) return '--:--';
    var whole = Math.trunc(value);
    return String(whole).padStart(2, '0') + ':00';
  }

  function formatHourRange(start, end) {
    if (Number(start) === 0 && Number(end) === 24) return 'All day';
    return formatHour(start) + '–' + formatHour(end);
  }

  function periodCoversHour(period, hour) {
    var value = Number(hour);
    var start = Number(period && period.timeStart);
    var end = Number(period && period.timeEnd);
    if (!Number.isFinite(value) || value < 0 || value >= 24 || !Number.isFinite(start) || !Number.isFinite(end)) return false;
    if (start === 0 && end === 24) return true;
    if (end < start) return value >= start || value < end;
    return value >= start && value < end;
  }

  function orderedSeasons(seasons) {
    return (Array.isArray(seasons) ? seasons : []).map(function (season, index) {
      return { value: season || {}, index: index };
    }).sort(function (a, b) {
      var aid = Number(a.value.seasonId);
      var bid = Number(b.value.seasonId);
      if (!Number.isFinite(aid)) aid = Number.MAX_SAFE_INTEGER;
      if (!Number.isFinite(bid)) bid = Number.MAX_SAFE_INTEGER;
      return aid - bid || a.index - b.index;
    }).map(function (entry) { return entry.value; });
  }

  function selectedPeriods(season, selection, hideZero) {
    return (season && Array.isArray(season.periods) ? season.periods : []).map(function (period) {
      return Object.assign({}, period || {}, { rate: pickRate(period, selection) });
    }).filter(function (period) { return !hideZero || period.rate !== 0; });
  }

  function periodSignature(periods) {
    return JSON.stringify(periods.map(function (period) {
      return [period.timeStart, period.timeEnd, period.rate];
    }));
  }

  function groupSeasons(seasons, selection, options) {
    options = options || {};
    var ordered = orderedSeasons(seasons);
    var bySignature = new Map();
    var groups = [];
    ordered.forEach(function (season) {
      var periods = selectedPeriods(season, selection, !!options.hideZero);
      var signature = periodSignature(periods);
      var group = bySignature.get(signature);
      if (!group) {
        group = { seasonNames: [], allSeasons: false, periods: periods, notCatchable: false };
        bySignature.set(signature, group);
        groups.push(group);
      }
      group.seasonNames.push(season.season);
    });
    groups.forEach(function (group) {
      group.allSeasons = ordered.length > 0 && group.seasonNames.length === ordered.length;
      group.notCatchable = group.periods.length === 0 || group.periods.every(function (period) { return period.rate === 0; });
    });
    return groups;
  }

  function filteredSeasons(place, filters) {
    var hourSet = filters.hour !== null && filters.hour !== undefined && filters.hour !== '';
    return (place && Array.isArray(place.seasons) ? place.seasons : []).filter(function (season) {
      return !filters.season || String(season.season) === String(filters.season);
    }).map(function (season) {
      var periods = Array.isArray(season.periods) ? season.periods : [];
      if (hourSet) periods = periods.filter(function (period) { return periodCoversHour(period, Number(filters.hour)); });
      return Object.assign({}, season, { periods: periods });
    }).filter(function (season) { return !hourSet || season.periods.length > 0; });
  }

  function rateSummary(seasons, selection) {
    var rates = [];
    seasons.forEach(function (season) {
      (Array.isArray(season.periods) ? season.periods : []).forEach(function (period) {
        var rate = pickRate(period, selection);
        if (rate !== null) rates.push(rate);
      });
    });
    return {
      bestPct: rates.length ? Math.max.apply(Math, rates) : null,
      notCatchable: rates.length > 0 ? rates.every(function (rate) { return rate === 0; }) : false
    };
  }

  function buildFishView(record, filters, selection) {
    record = record || {};
    filters = filters || {};
    selection = selection || {};
    var places = (Array.isArray(record.places) ? record.places : []).filter(function (place) {
      return !filters.placeId || String(place.placeId) === String(filters.placeId);
    }).map(function (place) {
      var sourceSeasons = place && Array.isArray(place.seasons) ? place.seasons : [];
      var seasons = filteredSeasons(place, filters);
      if (!seasons.length) return null;
      var summary = rateSummary(seasons, selection);
      var groups = groupSeasons(seasons, selection, { hideZero: !!filters.hideZero });
      groups.forEach(function (group) {
        group.allSeasons = !filters.season && group.seasonNames.length === sourceSeasons.length;
      });
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        groups: groups,
        bestPct: summary.bestPct,
        notCatchable: summary.notCatchable
      };
    }).filter(Boolean);
    var bestValues = places.map(function (place) { return place.bestPct; }).filter(function (value) { return value !== null; });
    var catchablePlaceCount = places.filter(function (place) { return !place.notCatchable; }).length;
    return {
      id: record.id,
      itemId: record.itemId,
      name: record.name,
      places: places,
      bestPct: bestValues.length ? Math.max.apply(Math, bestValues) : null,
      placeCount: places.length,
      catchablePlaceCount: catchablePlaceCount,
      notCatchable: places.length > 0 && catchablePlaceCount === 0
    };
  }

  function compareNames(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  }

  function compareNullableNumbers(a, b, direction) {
    var an = numericRate(a);
    var bn = numericRate(b);
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return (an - bn) * direction;
  }

  function sortFishViews(views, key, dir) {
    key = ['name', 'id', 'best'].indexOf(key) === -1 ? 'name' : key;
    var direction = dir === 'desc' || dir === -1 ? -1 : 1;
    return (Array.isArray(views) ? views : []).slice().sort(function (a, b) {
      a = a || {};
      b = b || {};
      var compared;
      if (key === 'id') compared = compareNullableNumbers(Number(a.itemId), Number(b.itemId), direction);
      else if (key === 'best') compared = compareNullableNumbers(a.bestPct, b.bestPct, direction);
      else compared = compareNames(a.name, b.name) * direction;
      return compared || compareNames(a.name, b.name) || (Number(a.itemId) || 0) - (Number(b.itemId) || 0);
    });
  }

  return {
    parseCombo: parseCombo,
    listCombos: listCombos,
    pickRate: pickRate,
    formatPercent: formatPercent,
    formatHourRange: formatHourRange,
    periodCoversHour: periodCoversHour,
    groupSeasons: groupSeasons,
    buildFishView: buildFishView,
    sortFishViews: sortFishViews
  };
});
