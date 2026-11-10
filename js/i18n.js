(function (root, factory) {
  var api = factory(root);
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.i18n = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  // Add a locale code and display name here after loading its locale file.
  var LOCALES = { en: 'English', id: 'Bahasa Indonesia' };
  var dictionaries = Object.create(null);
  var warned = new Set();
  var listeners = new Set();
  var storageKey = 'guide.locale';
  var active = 'en';

  function storageGet() {
    try { return root && root.localStorage ? root.localStorage.getItem(storageKey) : null; }
    catch (_) { return null; }
  }

  function storageSet(value) {
    try { if (root && root.localStorage) root.localStorage.setItem(storageKey, value); }
    catch (_) { /* Storage is optional. */ }
  }

  function available() {
    return Object.keys(LOCALES).filter(function (code) { return !!dictionaries[code]; });
  }

  function registerLocale(code, strings, label) {
    if (!code || !strings || typeof strings !== 'object') return;
    dictionaries[code] = Object.assign({}, strings);
    if (label && Object.prototype.hasOwnProperty.call(LOCALES, code)) LOCALES[code] = label;
  }

  function initialize() {
    var saved = storageGet();
    active = available().indexOf(saved) !== -1 ? saved : 'en';
    if (available().indexOf(active) === -1) active = available()[0] || 'en';
    updateDocument();
    return active;
  }

  function interpolate(value, params) {
    return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, function (match, key) {
      return params && Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
    });
  }

  function t(key, params) {
    var current = dictionaries[active] || {};
    var english = dictionaries.en || {};
    var value = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : english[key];
    if (value === undefined) {
      if (!warned.has(key)) {
        warned.add(key);
        if (typeof console !== 'undefined' && console.warn) console.warn('Missing translation: ' + key);
      }
      value = key;
    }
    return interpolate(value, params || {});
  }

  function plural(key, count, params) {
    var rule;
    try { rule = new Intl.PluralRules(active).select(Number(count)); }
    catch (_) { rule = Number(count) === 1 ? 'one' : 'other'; }
    var values = Object.assign({ count: n(count) }, params || {});
    return t(key + '.' + rule, values);
  }

  function n(number, options) {
    if (number === null || number === undefined || Number.isNaN(Number(number))) return '-';
    try { return new Intl.NumberFormat(active, options).format(Number(number)); }
    catch (_) { return String(number); }
  }

  function date(value, options) {
    var parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    var defaults = { dateStyle: 'medium', timeStyle: 'short' };
    try { return new Intl.DateTimeFormat(active, options || defaults).format(parsed); }
    catch (_) { return parsed.toISOString(); }
  }

  function updateDocument() {
    if (!root || !root.document) return;
    root.document.documentElement.lang = active;
    apply(root.document);
  }

  function setLocale(code) {
    var next = available().indexOf(code) !== -1 ? code : 'en';
    if (available().indexOf(next) === -1) next = available()[0] || 'en';
    active = next;
    storageSet(active);
    updateDocument();
    listeners.forEach(function (listener) { listener(active); });
    return active;
  }

  function getLocale() { return active; }

  function apply(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var textNodes = scope.querySelectorAll('[data-i18n]');
    textNodes.forEach(function (node) { node.textContent = t(node.getAttribute('data-i18n')); });
    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    attrNodes.forEach(function (node) {
      node.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var separator = pair.indexOf(':');
        if (separator < 1) return;
        var attr = pair.slice(0, separator).trim();
        var key = pair.slice(separator + 1).trim();
        if (attr && key) node.setAttribute(attr, t(key));
      });
    });
  }

  function onChange(listener) {
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  function localeLabel(code) { return LOCALES[code] || code; }

  function resetForTests() {
    dictionaries = Object.create(null);
    warned = new Set();
    listeners = new Set();
    active = 'en';
  }

  return {
    LOCALES: LOCALES,
    registerLocale: registerLocale,
    initialize: initialize,
    t: t,
    plural: plural,
    n: n,
    date: date,
    setLocale: setLocale,
    getLocale: getLocale,
    available: available,
    apply: apply,
    onChange: onChange,
    localeLabel: localeLabel,
    _resetForTests: resetForTests
  };
});
