(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var state = { tab: 'schedule', fishQuery: '', place: 'all', season: 'all', weather: 'all', time: 'all' };
  var expandedSchedulePlaces = new Set();
  var rateState = {
    search: '', placeId: 'all', baitId: null, rodId: null,
    sort: 'name', limit: 25,
    initializedFor: null
  };
  var rateIndex = null;
  var openRatePlaces = new Set();
  var openRateFishSections = new Set();
  var lazyBuildQueue = [];
  var lazyBuildScheduled = false;
  var rateStickyObserver = null;
  var rateLayoutQuery = null;
  var rateLayoutListener = null;

  function rerender() { if (GUIDE.app) GUIDE.app.renderRoute(); }

  function valuesFromRules(rules, key) {
    return GUIDE.util.unique(rules.flatMap(function (rule) { return Array.isArray(rule[key]) ? rule[key] : []; })).sort(GUIDE.util.compareValues);
  }

  function orderedSeasons(rules) {
    var available = new Set(valuesFromRules(rules, 'seasons'));
    return ['spring', 'summer', 'autumn', 'winter', 'moonspring'].filter(function (season) { return available.has(season); });
  }

  function selectControl(label, value, options, onChange) {
    var ui = GUIDE.ui;
    var select = ui.el('select', { 'aria-label': label, onChange: function () { onChange(select.value); } }, options.map(function (option) {
      return ui.el('option', { value: option.value, selected: String(option.value) === String(value) }, option.label);
    }));
    return ui.el('label', {}, [ui.el('span', {}, label), select]);
  }

  function allOption() { return { value: 'all', label: GUIDE.i18n.t('common.all') }; }

  function timeStrip(start, end) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var util = GUIDE.util;
    if (start === null || start === undefined || end === null || end === undefined) return null;
    if (util.isRaw(start) || util.isRaw(end)) return ui.rawValue(util.isRaw(start) ? start : end);
    return ui.el('div', { className: 'time-strip', 'aria-label': t('fishing.timeRange', { start: GUIDE.i18n.n(start), end: GUIDE.i18n.n(end) }) }, Array.from({ length: 24 }, function (_, hour) {
      var active = util.timeMatches(hour, start, end);
      return ui.el('span', { className: active ? 'time-cell active' : 'time-cell', title: active ? t('fishing.hourAvailable', { hour: GUIDE.i18n.n(hour) }) : t('fishing.hourUnavailable', { hour: GUIDE.i18n.n(hour) }) }, hour % 6 === 0 ? GUIDE.i18n.n(hour) : '');
    }));
  }

  function seasonsNode(seasons) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    if (!seasons || !seasons.length) return ui.badge(t('common.any'), 'season');
    return ui.el('div', { className: 'badge-list' }, seasons.map(function (season) { return ui.seasonBadge(season, season); }));
  }

  function schedule(store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    var places = store.lists.places; var seasons = orderedSeasons(store.lists.fishing); var weather = valuesFromRules(store.lists.fishing, 'weather');
    var fishSearch = ui.el('input', { id: 'fishing-fish-search', type: 'search', value: state.fishQuery, placeholder: t('fishing.searchFishPlaceholder'), 'aria-label': t('fishing.searchFish'), onInput: GUIDE.util.debounce(function () {
      var restoreFocus = document.activeElement === fishSearch;
      var cursorStart = fishSearch.selectionStart;
      var cursorEnd = fishSearch.selectionEnd;
      state.fishQuery = fishSearch.value;
      rerender();
      if (restoreFocus) {
        var nextSearch = document.getElementById('fishing-fish-search');
        if (nextSearch) {
          nextSearch.focus({ preventScroll: true });
          nextSearch.setSelectionRange(cursorStart, cursorEnd);
        }
      }
    }, 150) });
    var filters = ui.el('div', { className: 'filters' }, [
      ui.el('label', {}, [ui.el('span', {}, t('fishing.searchFish')), fishSearch]),
      selectControl(t('fishing.place'), state.place, [allOption()].concat(places.map(function (place) { return { value: place.id, label: place.name }; })), function (value) { state.place = value; rerender(); }),
      selectControl(t('fishing.season'), state.season, [allOption()].concat(seasons.map(function (value) { return { value: value, label: value }; })), function (value) { state.season = value; rerender(); }),
      selectControl(t('fishing.weather'), state.weather, [allOption()].concat(weather.map(function (value) { return { value: value, label: value }; })), function (value) { state.weather = value; rerender(); }),
      selectControl(t('fishing.time'), state.time, [allOption()].concat(Array.from({ length: 24 }, function (_, hour) { return { value: String(hour), label: t('characters.hour', { hour: GUIDE.i18n.n(hour) }) }; })), function (value) { state.time = value; rerender(); })
    ]);
    var matchingRules = store.lists.fishing.filter(function (rule) {
      var fish = store.getFish(rule.fishId);
      if (state.fishQuery && GUIDE.util.normalizeSearch(fish ? fish.name : '').indexOf(GUIDE.util.normalizeSearch(state.fishQuery)) === -1) return false;
      return GUIDE.storeLogic.ruleMatches(rule, {
        place: state.place === 'all' ? null : state.place,
        season: state.season === 'all' ? null : state.season,
        weather: state.weather === 'all' ? null : state.weather,
        time: state.time === 'all' ? null : Number(state.time),
        rod: null
      }) || ((rule.requires || []).some(function (req) { return req.type === 'rod'; }) &&
        (!state.place || state.place === 'all' || rule.places.indexOf(state.place) !== -1) &&
        (state.season === 'all' || !rule.seasons || rule.seasons.indexOf(state.season) !== -1) &&
        (state.weather === 'all' || !rule.weather || rule.weather.indexOf(state.weather) !== -1) &&
        GUIDE.util.timeMatches(state.time === 'all' ? null : Number(state.time), rule.timeStart, rule.timeEnd));
    });
    var uniqueRules = new Map();
    matchingRules.forEach(function (rule) {
      var key = JSON.stringify([
        rule.fishId,
        (rule.places || []).slice().sort(),
        rule.seasons ? rule.seasons.slice().sort() : null,
        rule.weather ? rule.weather.slice().sort() : null,
        rule.timeStart,
        rule.timeEnd,
        rule.requires || []
      ]);
      var existing = uniqueRules.get(key);
      if (!existing || (typeof existing.weight !== 'number' && typeof rule.weight === 'number')) uniqueRules.set(key, rule);
    });
    var rules = Array.from(uniqueRules.values());
    var seasonalPlacesByFish = new Map();
    rules.forEach(function (rule) {
      if (!rule.seasons || !rule.seasons.length) return;
      if (!seasonalPlacesByFish.has(rule.fishId)) seasonalPlacesByFish.set(rule.fishId, new Set());
      (rule.places || []).forEach(function (placeId) { seasonalPlacesByFish.get(rule.fishId).add(placeId); });
    });
    function visiblePlaceNames(rule) {
      var duplicateSeasonalPlaces = !rule.seasons || !rule.seasons.length ? seasonalPlacesByFish.get(rule.fishId) : null;
      return (rule.places || []).filter(function (id) { return !duplicateSeasonalPlaces || !duplicateSeasonalPlaces.has(id); }).map(function (id) { return store.places.get(id); }).filter(function (place) { return place && place.name !== place.id; }).map(function (place) { return place.name; });
    }
    rules = rules.filter(function (rule) { return visiblePlaceNames(rule).length > 0; });
    var table = ui.table({ rows: rules, sort: 'fish', cards: true, pageSize: 25, columns: [
      { id: 'fish', label: t('fishing.fish'), className: 'fishing-fish-column', sortValue: function (rule) { var fish = store.getFish(rule.fishId); return fish && fish.name; }, render: function (rule) {
        var fish = store.getFish(rule.fishId);
        var trigger = ui.button(fish ? fish.name : t('fish.unknown'), function () { ui.showItem(rule.fishId, trigger); }, { className: 'text-button' });
        return ui.el('span', { className: 'fish-cell' }, [
          ui.spriteImage(fish && fish.icon, '', 32), trigger,
          ui.el('span', { className: 'card-only fishing-card-fish-meta' }, [
            fish && fish.rarity ? ui.badge(fish.rarity, 'rarity') : null,
            fish && fish.price !== null && fish.price !== undefined ? ui.badge(t('fishing.rates.price', { price: GUIDE.i18n.n(fish.price) }), 'price') : null
          ])
        ]);
      } },
      { id: 'place', label: t('fishing.place'), className: 'fishing-place-column', sortValue: function (rule) { return rule.places && rule.places[0]; }, render: function (rule) {
        return ui.placeChips(visiblePlaceNames(rule), {
          max: 3,
          expanded: expandedSchedulePlaces.has(rule.fishId),
          onToggle: function (expanded) {
            if (expanded) expandedSchedulePlaces.add(rule.fishId);
            else expandedSchedulePlaces.delete(rule.fishId);
          }
        });
      } },
      { id: 'season', label: t('fishing.season'), sortValue: function (rule) { return rule.seasons ? rule.seasons.join(',') : ''; }, render: function (rule) { return seasonsNode(rule.seasons); } },
      { id: 'weather', label: t('fishing.weather'), sortValue: function (rule) { return rule.weather ? rule.weather.join(',') : ''; }, render: function (rule) { return rule.weather ? rule.weather.join(', ') : t('common.any'); } },
      { id: 'time', label: t('fishing.time'), sortValue: function (rule) { return typeof rule.timeStart === 'number' ? rule.timeStart : -1; }, render: function (rule) { return ui.el('div', { className: 'time-stack' }, [ui.timeText(rule.timeStart, rule.timeEnd), timeStrip(rule.timeStart, rule.timeEnd)]); } },
      { id: 'requirements', label: t('fishing.requirements'), sortable: false, render: function (rule) { return ui.fishingRequirements(rule.requires); } },
      { id: 'price', label: t('item.price'), className: 'fishing-price-column', sortValue: function (rule) { var fish = store.getFish(rule.fishId); return fish && fish.price; }, render: function (rule) { var fish = store.getFish(rule.fishId); return GUIDE.i18n.n(fish && fish.price); } }
    ] });
    return ui.el('div', { className: 'fishing-schedule' }, [filters, rules.length ? table : ui.emptyState('noResults')]);
  }

  function itemName(store, id) {
    var item = store.getItem(id);
    return item && typeof item.name === 'string' ? item.name : GUIDE.i18n.t('fishing.rates.itemFallback', { id: GUIDE.i18n.n(id) });
  }

  function resolvedPlaceName(store, place) {
    var id = place && place.placeId;
    var stored = store.places.get(id);
    if (stored && stored.name && String(stored.name) !== String(id)) return stored.name;
    if (place && place.placeName && String(place.placeName) !== String(id)) return place.placeName;
    return null;
  }

  function namedPlaceFishView(store, view) {
    var places = view.places.filter(function (place) { return !!resolvedPlaceName(store, place); });
    var bestValues = places.map(function (place) { return place.bestPct; }).filter(function (value) { return typeof value === 'number' && Number.isFinite(value); });
    var catchablePlaceCount = places.filter(function (place) { return !place.notCatchable; }).length;
    return Object.assign({}, view, {
      places: places,
      bestPct: bestValues.length ? Math.max.apply(Math, bestValues) : null,
      placeCount: places.length,
      catchablePlaceCount: catchablePlaceCount,
      notCatchable: places.length > 0 && catchablePlaceCount === 0
    });
  }

  function seasonLabel(season) {
    var t = GUIDE.i18n.t;
    if (season === 'moonspring') return t('fishing.rates.season.moonspring');
    if (season === 'spring') return t('fishing.rates.season.spring');
    if (season === 'summer') return t('fishing.rates.season.summer');
    if (season === 'autumn') return t('fishing.rates.season.autumn');
    if (season === 'winter') return t('fishing.rates.season.winter');
    return String(season || t('common.unknown'));
  }

  function buildRateIndex(store, records) {
    var places = new Map();
    records.forEach(function (record) {
      (Array.isArray(record.places) ? record.places : []).forEach(function (place) {
        var name = resolvedPlaceName(store, place);
        if (name && !places.has(String(place.placeId))) places.set(String(place.placeId), { id: place.placeId, name: name });
      });
    });
    return {
      records: records,
      combos: GUIDE.fishingRate.listCombos(records),
      places: Array.from(places.values()).sort(function (a, b) { return GUIDE.util.compareValues(a.name, b.name); })
    };
  }

  function savedRatePreferences() {
    try {
      var raw = root.localStorage && root.localStorage.getItem('guide.fishingRates');
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }

  function saveRatePreferences() {
    try {
      if (!root.localStorage) return;
      root.localStorage.setItem('guide.fishingRates', JSON.stringify({
        baitId: rateState.baitId,
        rodId: rateState.rodId,
        sort: rateState.sort
      }));
    } catch (_) { /* Storage is optional. */ }
  }

  function initializeRateState(index) {
    if (rateState.initializedFor === index.records) return;
    var saved = savedRatePreferences();
    var bait = saved.baitId === null ? null : Number(saved.baitId);
    var rod = Number(saved.rodId);
    rateState.baitId = bait !== null && index.combos.baits.indexOf(bait) !== -1 ? bait : null;
    rateState.rodId = index.combos.rods.indexOf(rod) !== -1 ? rod : (index.combos.rods[0] === undefined ? null : index.combos.rods[0]);
    if (rateState.placeId !== 'all' && !index.places.some(function (place) { return String(place.id) === String(rateState.placeId); })) rateState.placeId = 'all';
    rateState.sort = ['name', 'id', 'best'].indexOf(saved.sort) !== -1 ? saved.sort : 'name';
    rateState.initializedFor = index.records;
  }

  function queueLazyBuild(node, build) {
    lazyBuildQueue.push({ node: node, build: build });
    if (lazyBuildScheduled) return;
    lazyBuildScheduled = true;
    var schedule = root.requestAnimationFrame || function (callback) { root.setTimeout(callback, 0); };
    schedule(function process() {
      var count = 0;
      while (lazyBuildQueue.length && count < 2) {
        var entry = lazyBuildQueue.shift();
        if (entry.node.isConnected && entry.node.open) entry.build();
        count += 1;
      }
      if (lazyBuildQueue.length) schedule(process);
      else lazyBuildScheduled = false;
    });
  }

  function fullPercent(value) {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) + '%' : '-';
  }

  function percentText(value) {
    return GUIDE.fishingRate.formatPercent(value);
  }

  function percentNode(value, className) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    return ui.el('span', {
      className: className || '',
      title: t('fishing.rates.preciseValue', { pct: fullPercent(value) })
    }, percentText(value));
  }

  function clockText(hour) {
    return String(Math.trunc(Number(hour))).padStart(2, '0') + ':00';
  }

  function hourRangeText(period) {
    var t = GUIDE.i18n.t;
    if (Number(period.timeStart) === 0 && Number(period.timeEnd) === 24) return t('fishing.rates.allDay');
    return t('fishing.rates.timeRange', { start: clockText(period.timeStart), end: clockText(period.timeEnd) });
  }

  function chanceRatio(value, best) {
    if (typeof value !== 'number' || value <= 0 || typeof best !== 'number' || best <= 0) return 0;
    return Math.max(0, Math.min(1, value / best));
  }

  function chanceBar(value, best) {
    var ui = GUIDE.ui;
    var ratio = chanceRatio(value, best);
    return ui.el('span', { className: 'fishing-rate-bar', 'aria-hidden': 'true' }, ui.el('span', { style: '--rate-width:' + (ratio * 100) + '%;--rate-level:' + ratio }));
  }

  function periodRow(period, fishBest) {
    var ui = GUIDE.ui;
    return ui.el('div', { className: 'fishing-period-row' + (period.rate === 0 ? ' is-zero' : '') }, [
      ui.el('span', { className: 'fishing-period-time' }, hourRangeText(period)),
      chanceBar(period.rate, fishBest),
      percentNode(period.rate, 'fishing-period-value')
    ]);
  }

  function seasonGroup(group, fishBest) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    var seasonChips = group.allSeasons ? [ui.badge(t('fishing.rates.allSeasons'), 'season')] : group.seasonNames.map(function (season) { return ui.seasonBadge(season, seasonLabel(season)); });
    var rows = group.periods.length ? group.periods.map(function (period) { return periodRow(period, fishBest); }) : [ui.emptyState('noResults', t('fishing.rates.noPeriods'))];
    return ui.el('section', { className: 'fishing-season-group' + (group.notCatchable ? ' is-not-catchable' : '') }, [
      ui.el('div', { className: 'badge-list fishing-season-chips' }, seasonChips),
      ui.el('div', { className: 'fishing-period-list' }, rows)
    ]);
  }

  function catchableSeasonGroups(place) {
    return place.groups.filter(function (group) {
      return group.periods.some(function (period) { return typeof period.rate === 'number' && period.rate > 0; });
    });
  }

  function collapsedPlaceChips(place) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    var chips = [];
    var groups = catchableSeasonGroups(place);
    if (groups.length === 1 && groups[0].allSeasons) chips.push(ui.badge(t('fishing.rates.allSeasons'), 'season'));
    else {
      var seasonNames = [];
      groups.forEach(function (group) { group.seasonNames.forEach(function (season) { if (seasonNames.indexOf(season) === -1) seasonNames.push(season); }); });
      seasonNames.forEach(function (season) { chips.push(ui.seasonBadge(season, seasonLabel(season))); });
    }
    var seenTimes = new Set();
    groups.forEach(function (group) {
      group.periods.forEach(function (period) {
        var label = hourRangeText(period);
        if (!seenTimes.has(label)) { seenTimes.add(label); chips.push(ui.badge(label, 'time')); }
      });
    });
    return ui.el('span', { className: 'badge-list fishing-place-collapsed-chips' }, chips);
  }

  function ratePlace(store, view, place) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    var name = resolvedPlaceName(store, place);
    var key = String(view.itemId) + '|' + String(place.placeId);
    var body = ui.el('div', { className: 'fishing-place-body' });
    var details = ui.el('details', { className: 'fishing-place-details' + (place.notCatchable ? ' is-not-catchable' : '') });
    details.open = openRatePlaces.has(key);
    var catchableGroups = catchableSeasonGroups(place);
    var built = false;
    function build() {
      if (built) return;
      built = true;
      body.appendChild(ui.el('div', { className: 'fishing-season-groups' }, catchableGroups.length ? catchableGroups.map(function (group) {
        return seasonGroup(group, view.bestPct);
      }) : ui.emptyState('noResults', t('fishing.rates.noPeriods'))));
    }
    details.appendChild(ui.el('summary', {}, [
      ui.el('span', { className: 'fishing-place-summary-main' }, [ui.el('strong', {}, name || t('common.unknown')), collapsedPlaceChips(place)]),
      ui.el('span', { className: 'fishing-place-summary-rate' }, [place.notCatchable ? ui.badge(t('fishing.rates.notCatchable'), 'warning') : null, percentNode(place.bestPct)]),
      ui.el('span', { className: 'fishing-details-arrow', 'aria-hidden': 'true' })
    ]));
    details.appendChild(body);
    details.addEventListener('toggle', function () {
      if (details.open) { openRatePlaces.add(key); queueLazyBuild(details, build); }
      else openRatePlaces.delete(key);
    });
    if (details.open) queueLazyBuild(details, build);
    return details;
  }

  function rateFishCard(store, view, visiblePlaces) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    var fish = store.getFish(view.itemId) || store.getFish(view.id);
    var item = store.getItem(view.itemId);
    var name = view.name || (fish && fish.name) || (item && item.name) || t('fish.unknown');
    var rarity = fish && fish.rarity;
    var price = fish && fish.price !== null && fish.price !== undefined ? fish.price : item && item.price;
    var summary = GUIDE.i18n.plural('fishing.rates.summary', visiblePlaces.length, { count: GUIDE.i18n.n(visiblePlaces.length), pct: percentText(view.bestPct) });
    var cards = visiblePlaces.map(function (place) { return ratePlace(store, view, place); });
    var nameTrigger = ui.button(name, function () { ui.showItem(view.itemId, nameTrigger); }, { className: 'text-button fishing-rate-name-button' });
    var sectionKey = String(view.itemId);
    var placesSection = ui.el('details', { className: 'fishing-fish-places-section' });
    placesSection.open = openRateFishSections.has(sectionKey);
    placesSection.appendChild(ui.el('summary', {}, [
      ui.el('strong', {}, GUIDE.i18n.plural('fishing.rates.placesSection', visiblePlaces.length, { count: GUIDE.i18n.n(visiblePlaces.length) })),
      ui.el('span', { className: 'fishing-details-arrow', 'aria-hidden': 'true' })
    ]));
    placesSection.appendChild(ui.el('div', { className: 'fishing-rate-places' }, cards));
    placesSection.addEventListener('toggle', function () {
      if (placesSection.open) openRateFishSections.add(sectionKey);
      else openRateFishSections.delete(sectionKey);
    });
    return ui.el('article', { className: 'fishing-rate-card' + (view.notCatchable ? ' is-not-catchable' : '') }, [
      ui.el('header', { className: 'fishing-rate-card-header' }, [
        ui.spriteImage((fish && fish.icon) || (item && item.icon), '', 48),
        ui.el('div', { className: 'fishing-rate-card-title' }, [
          ui.el('div', { className: 'fishing-rate-card-name' }, [ui.heading(2, nameTrigger), ui.el('span', { className: 'fishing-item-id' }, t('fishing.rates.itemId', { id: GUIDE.i18n.n(view.itemId) }))]),
          ui.el('div', { className: 'badge-list' }, [rarity ? ui.badge(rarity, 'rarity') : null, price !== null && price !== undefined ? ui.badge(t('fishing.rates.price', { price: GUIDE.i18n.n(price) }), 'price') : null, view.notCatchable ? ui.badge(t('fishing.rates.notCatchable'), 'warning') : null]),
          ui.el('p', { className: 'fishing-rate-summary', title: t('fishing.rates.preciseValue', { pct: fullPercent(view.bestPct) }) }, summary)
        ])
      ]),
      placesSection
    ]);
  }

  function rateSelect(label, value, options, onChange) {
    var ui = GUIDE.ui;
    var select = ui.el('select', { 'aria-label': label, onChange: function () { onChange(select.value); } }, options.map(function (option) {
      return ui.el('option', { value: option.value, selected: String(option.value) === String(value) }, option.label);
    }));
    return { node: ui.el('label', {}, [ui.el('span', {}, label), select]), select: select };
  }

  function rateChoice(label, checked, onSelect) {
    var ui = GUIDE.ui;
    var input = ui.el('input', {
      type: 'checkbox', checked: checked,
      onChange: function () {
        if (!input.checked) { input.checked = true; return; }
        onSelect();
      }
    });
    return { node: ui.el('label', { className: 'check-label fishing-equipment-option' }, [input, ui.el('span', {}, label)]), input: input };
  }

  function observeStickyEquipment(sentinel, equipmentSection) {
    if (rateStickyObserver) rateStickyObserver.disconnect();
    rateStickyObserver = null;
    if (!root.IntersectionObserver) return;
    var styles = root.getComputedStyle ? root.getComputedStyle(document.documentElement) : null;
    var headerHeight = styles ? parseFloat(styles.getPropertyValue('--header-height')) : 64;
    var stickyTop = Number.isFinite(headerHeight) ? headerHeight : 64;
    rateStickyObserver = new root.IntersectionObserver(function (entries) {
      var entry = entries[0];
      if (!entry || !(root.matchMedia && root.matchMedia('(max-width: 850px)').matches)) return;
      var rootTop = entry.rootBounds ? entry.rootBounds.top : stickyTop;
      if (!entry.isIntersecting && entry.boundingClientRect.top <= rootTop) equipmentSection.open = false;
    }, { rootMargin: '-' + stickyTop + 'px 0px 0px 0px', threshold: 0 });
    rateStickyObserver.observe(sentinel);
  }

  function clearRateLayoutListener() {
    if (!rateLayoutQuery || !rateLayoutListener) return;
    if (rateLayoutQuery.removeEventListener) rateLayoutQuery.removeEventListener('change', rateLayoutListener);
    else if (rateLayoutQuery.removeListener) rateLayoutQuery.removeListener(rateLayoutListener);
    rateLayoutQuery = null;
    rateLayoutListener = null;
  }

  function observeEquipmentLayout(equipmentSection) {
    clearRateLayoutListener();
    if (!root.matchMedia) { equipmentSection.open = true; return; }
    rateLayoutQuery = root.matchMedia('(max-width: 850px)');
    rateLayoutListener = function (event) { equipmentSection.open = !event.matches; };
    equipmentSection.open = !rateLayoutQuery.matches;
    if (rateLayoutQuery.addEventListener) rateLayoutQuery.addEventListener('change', rateLayoutListener);
    else if (rateLayoutQuery.addListener) rateLayoutQuery.addListener(rateLayoutListener);
  }

  function catchRates(store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    if (rateStickyObserver) { rateStickyObserver.disconnect(); rateStickyObserver = null; }
    clearRateLayoutListener();
    var envelope = store.data.fishingRate;
    var records = envelope && Array.isArray(envelope.records) ? envelope.records : [];
    if (!envelope || envelope.malformed || envelope.status === 'not_found' || !records.length) return ui.emptyState('notFound', t('fishing.rates.noData'));
    if (!rateIndex || rateIndex.records !== records) rateIndex = buildRateIndex(store, records);
    initializeRateState(rateIndex);

    var refs = {};
    var host = ui.el('div', { className: 'fishing-rate-list' });
    var moreHost = ui.el('div', { className: 'fishing-rate-more' });

    function selection() { return { baitId: rateState.baitId, rodId: rateState.rodId }; }

    function matchingViews() {
      var query = GUIDE.util.normalizeSearch(rateState.search);
      var views = records.map(function (record) {
        return namedPlaceFishView(store, GUIDE.fishingRate.buildFishView(record, {
          hideZero: true,
          placeId: rateState.placeId === 'all' ? null : rateState.placeId
        }, selection()));
      }).filter(function (view) {
        if (query) {
          var id = String(view.itemId === null || view.itemId === undefined ? '' : view.itemId);
          if (GUIDE.util.normalizeSearch(view.name).indexOf(query) === -1 && id.indexOf(query) === -1 && ('#' + id).indexOf(query) === -1) return false;
        }
        if (view.placeCount === 0) return false;
        return true;
      });
      return GUIDE.fishingRate.sortFishViews(views, rateState.sort, rateState.sort === 'best' ? 'desc' : 'asc');
    }

    function draw() {
      var views = matchingViews();
      host.replaceChildren();
      moreHost.replaceChildren();
      if (!views.length) {
        host.appendChild(ui.emptyState('noResults', t('fishing.rates.noMatch')));
        return;
      }
      views.slice(0, rateState.limit).forEach(function (view) {
        var visiblePlaces = view.notCatchable ? view.places : view.places.filter(function (place) { return !place.notCatchable; });
        var card = rateFishCard(store, view, visiblePlaces);
        host.appendChild(card);
      });
      if (rateState.limit < views.length) {
        moreHost.appendChild(ui.button(t('fishing.rates.showMore'), function () { rateState.limit += 25; draw(); }));
      }
    }

    function updateAndDraw(persist) {
      rateState.limit = 25;
      refs.baitChoices.forEach(function (choice) { choice.input.checked = choice.id === rateState.baitId; });
      refs.rodChoices.forEach(function (choice) {
        choice.input.checked = choice.id === rateState.rodId;
        choice.input.disabled = rateState.baitId === null;
      });
      refs.rodHint.hidden = rateState.baitId !== null;
      if (persist) saveRatePreferences();
      draw();
    }

    refs.search = ui.el('input', {
      type: 'search', value: rateState.search, placeholder: t('fishing.rates.searchPlaceholder'), 'aria-label': t('fishing.rates.search'),
      onInput: GUIDE.util.debounce(function () { rateState.search = refs.search.value; rateState.limit = 25; draw(); }, 150)
    });
    var searchControl = ui.el('label', {}, [ui.el('span', {}, t('fishing.rates.search')), refs.search]);

    refs.baitChoices = [];
    var baitNodes = [{ id: null, label: t('fishing.rates.noBait') }].concat(rateIndex.combos.baits.map(function (id) {
      return { id: id, label: itemName(store, id) };
    })).map(function (option) {
      var choice = rateChoice(option.label, option.id === rateState.baitId, function () {
        rateState.baitId = option.id;
        updateAndDraw(true);
      });
      refs.baitChoices.push({ id: option.id, input: choice.input });
      return choice.node;
    });

    refs.rodChoices = [];
    var rodNodes = rateIndex.combos.rods.map(function (id) {
      var choice = rateChoice(itemName(store, id), id === rateState.rodId, function () {
        rateState.rodId = id;
        updateAndDraw(true);
      });
      choice.input.disabled = rateState.baitId === null;
      refs.rodChoices.push({ id: id, input: choice.input });
      return choice.node;
    });
    refs.rodHint = ui.el('small', { className: 'fishing-rate-rod-hint', hidden: rateState.baitId !== null }, t('fishing.rates.rodHint'));
    var equipmentSection = ui.el('details', { className: 'fishing-equipment-filters' });
    observeEquipmentLayout(equipmentSection);
    equipmentSection.appendChild(ui.el('summary', {}, [
      ui.el('strong', {}, t('fishing.rates.equipment')),
      ui.el('span', { className: 'fishing-details-arrow', 'aria-hidden': 'true' })
    ]));
    equipmentSection.appendChild(ui.el('div', { className: 'fishing-equipment-groups' }, [
        ui.el('fieldset', {}, [ui.el('legend', {}, t('fishing.rates.bait')), ui.el('div', { className: 'fishing-equipment-options' }, baitNodes)]),
        ui.el('fieldset', {}, [ui.el('legend', {}, t('fishing.rates.rod')), ui.el('div', { className: 'fishing-equipment-options' }, rodNodes), refs.rodHint])
    ]));

    var place = rateSelect(t('fishing.place'), rateState.placeId, [{ value: 'all', label: t('fishing.rates.allPlaces') }].concat(rateIndex.places.map(function (entry) {
      return { value: entry.id, label: entry.name };
    })), function (value) { rateState.placeId = value; updateAndDraw(false); });
    refs.place = place.select;
    var sort = rateSelect(t('fishing.rates.sort'), rateState.sort, [
      { value: 'name', label: t('fishing.rates.sort.name') },
      { value: 'id', label: t('fishing.rates.sort.id') },
      { value: 'best', label: t('fishing.rates.sort.best') }
    ], function (value) { rateState.sort = value; updateAndDraw(true); });
    refs.sort = sort.select;

    var stickySentinel = ui.el('span', { className: 'fishing-rate-sticky-sentinel', 'aria-hidden': 'true' });
    var controls = ui.el('div', { className: 'fishing-rate-controls' }, [
      stickySentinel,
      ui.el('div', { className: 'fishing-rate-sticky-controls' }, [
        ui.el('div', { className: 'fishing-rate-control-fields' }, searchControl),
        equipmentSection
      ]),
      ui.el('div', { className: 'fishing-rate-secondary-controls' }, [
        ui.el('div', { className: 'fishing-rate-control-fields' }, [place.node, sort.node])
      ])
    ]);
    observeStickyEquipment(stickySentinel, equipmentSection);
    draw();
    return ui.el('div', { className: 'fishing-rate-tab' }, [controls, host, moreHost]);
  }

  GUIDE.pages.fishing = {
    render: function (route, context) {
      var ui = GUIDE.ui; var t = GUIDE.i18n.t; var store = context.store;
      if (state.tab !== 'rates') {
        if (rateStickyObserver) { rateStickyObserver.disconnect(); rateStickyObserver = null; }
        clearRateLayoutListener();
      }
      var tabs = [{ id: 'schedule', label: t('fishing.tab.schedule') }, { id: 'rates', label: t('fishing.tab.rates') }];
      var content = state.tab === 'rates' ? catchRates(store) : schedule(store);
      var node = ui.el('div', { className: 'page' }, [
        ui.heading(1, t('nav.fishing')), state.tab === 'schedule' ? ui.datasetNotice('fishing') : null,
        ui.tabs({ active: state.tab, label: t('fishing.tabs'), tabs: tabs, onChange: function (value) { state.tab = value; rerender(); } }), content
      ]);
      return { node: node, title: t('nav.fishing') };
    }
  };
})(window);
