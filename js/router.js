(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};

  function parse(hash) {
    var value = String(hash || '#/').replace(/^#/, '');
    if (!value || value === '/') return { page: 'home', id: null, unknown: false };
    var parts = value.replace(/^\//, '').split('/').map(function (part) {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    });
    var page = parts[0]; var rawId = parts.length > 1 ? parts.slice(1).join('/') : null;
    if (page === 'characters' && parts.length <= 2) return { page: page, id: rawId === null ? null : Number(rawId), unknown: rawId !== null && !Number.isFinite(Number(rawId)) };
    if (page === 'fishing' && parts.length === 1) return { page: page, id: null, unknown: false };
    if (page === 'maps' && parts.length <= 2) return { page: page, id: rawId, unknown: false };
    if (page === 'events' && parts.length === 1) return { page: page, id: null, unknown: false };
    if (page === 'quests' && parts.length <= 2) return { page: page, id: rawId, unknown: false };
    if (page === 'recipes' && parts.length <= 2) return { page: page, id: rawId === null ? null : Number(rawId), unknown: rawId !== null && !Number.isFinite(Number(rawId)) };
    return { page: 'home', id: null, unknown: true };
  }

  function create(onRoute) {
    function current() { return parse(root.location.hash); }
    function render() { onRoute(current()); }
    function start() {
      root.addEventListener('hashchange', render);
      if (!root.location.hash) root.history.replaceState(null, '', '#/');
      render();
    }
    function stop() { root.removeEventListener('hashchange', render); }
    return { start: start, stop: stop, current: current, render: render };
  }

  GUIDE.router = { parse: parse, create: create };
})(window);
