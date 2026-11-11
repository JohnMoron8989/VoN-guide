(function (root, factory) {
  var api = factory();
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.data = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DATASETS = ['meta', 'items', 'characters', 'gifts', 'fish', 'places', 'fishing', 'fishingRate', 'quests', 'recipes', 'events', 'sprites', 'monsters', 'gatherables'];
  var OPTIONAL_DATASETS = ['gatherables'];

  function emptyEnvelope(name, input) {
    return {
      schema: name + '/invalid',
      generatedAt: input && input.generatedAt ? input.generatedAt : null,
      gameVersion: input && input.gameVersion ? input.gameVersion : 'unknown',
      count: 0,
      status: 'not_found',
      notes: [],
      records: [],
      malformed: true
    };
  }

  function normalizeEnvelope(name, input) {
    if (name === 'meta') {
      if (input && typeof input === 'object' && typeof input.schema === 'string' && input.schema.indexOf('meta/') === 0) {
        return Object.assign({ gameName: 'unknown', gameVersion: 'unknown', generatedAt: null }, input, { malformed: false });
      }
      return Object.assign(emptyEnvelope(name, input), { gameName: 'unknown' });
    }
    if (!input || typeof input !== 'object' || typeof input.schema !== 'string' || input.schema.indexOf(name + '/') !== 0 || !Array.isArray(input.records)) {
      return emptyEnvelope(name, input);
    }
    return Object.assign({}, input, {
      count: input.records.length,
      status: ['ok', 'partial', 'not_found'].indexOf(input.status) !== -1 ? input.status : 'partial',
      notes: Array.isArray(input.notes) ? input.notes : [],
      malformed: false
    });
  }

  function normalizeAll(input) {
    var result = {};
    DATASETS.forEach(function (name) { result[name] = normalizeEnvelope(name, input && input[name]); });
    return result;
  }

  function fetchJson(fetchFn, name, signal) {
    return fetchFn('data/' + name + '.json', { cache: 'no-store', signal: signal }).then(function (response) {
      if (!response || !response.ok) throw new Error('HTTP data load failed');
      return response.json();
    });
  }

  async function load(options) {
    options = options || {};
    var fetchFn = options.fetchFn;
    var protocol = options.protocol || '';
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
    var timeoutMs = options.timeoutMs || 10000;
    var bundle = options.bundle;
    var canFetch = typeof fetchFn === 'function' && (protocol === 'http:' || protocol === 'https:' || protocol === 'test:');

    if (canFetch) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timeout = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);
      try {
        var completed = 0;
        var entries = await Promise.all(DATASETS.map(async function (name) {
          var value;
          try {
            value = await fetchJson(fetchFn, name, controller ? controller.signal : undefined);
          } catch (error) {
            if (OPTIONAL_DATASETS.indexOf(name) === -1) throw error;
            value = null;
          }
          completed += 1;
          onProgress(name, completed, DATASETS.length);
          return [name, value];
        }));
        clearTimeout(timeout);
        var fetched = {};
        entries.forEach(function (entry) { fetched[entry[0]] = entry[1]; });
        return { ok: true, source: 'http', datasets: normalizeAll(fetched) };
      } catch (_) {
        clearTimeout(timeout);
      }
    }

    if (bundle && typeof bundle === 'object') {
      DATASETS.forEach(function (name, index) { onProgress(name, index + 1, DATASETS.length); });
      return { ok: true, source: 'bundle', datasets: normalizeAll(bundle) };
    }
    return { ok: false, source: null, datasets: null };
  }

  function loadBrowser(onProgress) {
    var protocol = typeof location !== 'undefined' ? location.protocol : '';
    return load({
      fetchFn: typeof fetch === 'function' ? fetch.bind(typeof window !== 'undefined' ? window : null) : null,
      protocol: protocol,
      bundle: typeof window !== 'undefined' ? window.GUIDE_BUNDLE : null,
      onProgress: onProgress
    });
  }

  return {
    DATASETS: DATASETS,
    normalizeEnvelope: normalizeEnvelope,
    normalizeAll: normalizeAll,
    load: load,
    loadBrowser: loadBrowser
  };
});
