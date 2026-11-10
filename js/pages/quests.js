(function (root) {
  'use strict';
  var GUIDE = root.GUIDE = root.GUIDE || {};
  GUIDE.pages = GUIDE.pages || {};
  var state = { query: '', type: 'all', giver: 'all' };
  var storageKey = 'guide.questProgress';

  function readProgress() {
    var raw = GUIDE.util.safeGet(root.localStorage, storageKey, '{}');
    try { var parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch (_) { return {}; }
  }

  function saveProgress(progress) { GUIDE.util.safeSet(root.localStorage, storageKey, JSON.stringify(progress)); }
  function rerender() { if (GUIDE.app) GUIDE.app.renderRoute(); }

  function questProgress(quest, progress) {
    var entry = progress[quest.id] || { steps: [], done: false };
    var completed = new Set(entry.steps || []);
    return { entry: entry, completed: completed, count: entry.done ? quest.steps.length : quest.steps.filter(function (_, index) { return completed.has(index); }).length };
  }

  function requirementNode(requirement, store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var values = GUIDE.util.asArray(requirement.value);
    if (requirement.type === 'quest') return ui.el('span', {}, values.map(function (value, index) { var quest = store.getQuest(value); return [index ? t('common.listSeparator') : null, quest ? ui.link('#/quests/' + encodeURIComponent(quest.id), quest.title) : String(value)]; }));
    if (requirement.type === 'item') return ui.el('span', { className: 'chip-list' }, values.map(function (value) { return ui.itemChip(value); }));
    if (requirement.type === 'level') return t('quests.levelRequirement', { value: JSON.stringify(requirement.value) });
    return t('quests.genericRequirement', { type: requirement.type && requirement.type.raw ? requirement.type.raw : requirement.type, value: JSON.stringify(requirement.value) });
  }

  function rewardNode(reward) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var n = GUIDE.i18n.n;
    if (reward.type === 'item') return ui.itemChip(reward.value, { count: reward.count });
    if (reward.type === 'xp') return t('quests.xpReward', { count: n(reward.count), value: utilValue(reward.value) });
    if (reward.type === 'currency') {
      var unit = GUIDE.util.isRaw(reward.value) ? ui.rawValue(reward.value) : reward.value === null || reward.value === undefined ? null : String(reward.value);
      return ui.el('span', {}, [n(reward.count), unit ? t('common.space') : null, unit]);
    }
    if (reward.type === 'friendship') return t('quests.friendshipReward', { count: n(reward.count), value: utilValue(reward.value) });
    return t('quests.unknownReward', { type: reward.type, count: n(reward.count) });
  }

  function utilValue(value) {
    if (GUIDE.util.isRaw(value)) return value.raw;
    if (typeof value === 'number') return GUIDE.i18n.n(value);
    return value === null || value === undefined ? GUIDE.i18n.t('common.unknown') : String(value);
  }

  function questRequirementIds(quest) {
    var ids = [];
    (quest.requires || []).forEach(function (requirement) {
      if (requirement.type === 'quest') GUIDE.util.asArray(requirement.value).forEach(function (value) { ids.push(String(value)); });
    });
    return ids;
  }

  function chainTree(quest, store) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t;
    function branch(current, path) {
      if (path.has(current.id)) return ui.el('li', {}, [current.title, ui.badge(t('quests.cycle'), 'warning')]);
      var nextPath = new Set(path); nextPath.add(current.id);
      var prerequisites = questRequirementIds(current).map(function (id) { return store.getQuest(id); }).filter(Boolean);
      return ui.el('li', {}, [ui.link('#/quests/' + encodeURIComponent(current.id), current.title), prerequisites.length ? ui.el('ul', {}, prerequisites.map(function (entry) { return branch(entry, nextPath); })) : null]);
    }
    var ids = questRequirementIds(quest); var roots = ids.map(function (id) { return store.getQuest(id); }).filter(Boolean);
    return roots.length ? ui.el('ul', { className: 'quest-tree' }, roots.map(function (entry) { return branch(entry, new Set([quest.id])); })) : ui.emptyState('notFound');
  }

  function detail(quest, context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var n = GUIDE.i18n.n; var store = context.store; var progress = readProgress();
    if (!quest) return { node: ui.el('div', { className: 'page' }, [ui.heading(1, t('quests.notFound')), ui.emptyState('notFound'), ui.link('#/quests', t('common.back'))]), title: t('nav.quests') };
    var current = questProgress(quest, progress); var giver = quest.giver === null ? null : store.getCharacter(quest.giver);
    function updateStep(index, checked) {
      var entry = progress[quest.id] || { steps: [], done: false }; var steps = new Set(entry.steps || []);
      if (checked) steps.add(index); else steps.delete(index);
      entry.steps = Array.from(steps); entry.done = entry.steps.length === quest.steps.length; progress[quest.id] = entry; saveProgress(progress); rerender();
    }
    function markDone(checked) { progress[quest.id] = { steps: checked ? quest.steps.map(function (_, index) { return index; }) : [], done: checked }; saveProgress(progress); rerender(); }
    var doneToggle = ui.el('input', { type: 'checkbox', checked: current.entry.done || current.count === quest.steps.length, onChange: function () { markDone(doneToggle.checked); } });
    var node = ui.el('article', { className: 'page detail-page' }, [
      ui.link('#/quests', t('quests.backToList'), 'back-link'), ui.datasetNotice('quests'),
      ui.el('header', { className: 'detail-header' }, [ui.el('div', {}, [ui.badge(quest.type, 'quest-type'), ui.heading(1, quest.title), quest.desc ? ui.el('p', { className: 'lede' }, quest.desc) : ui.emptyState('notFound')]), ui.el('label', { className: 'done-toggle' }, [doneToggle, ui.el('span', {}, t('quests.markDone'))])]),
      ui.el('dl', { className: 'facts' }, [ui.field(t('quests.giver'), giver ? ui.link('#/characters/' + giver.id, giver.name) : t('common.unknown')), ui.field(t('quests.deadline'), ui.rawValue(quest.deadline))]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('quests.prerequisites')), quest.requires && quest.requires.length ? ui.el('ul', { className: 'requirement-list' }, quest.requires.map(function (requirement) { return ui.el('li', {}, requirementNode(requirement, store)); })) : ui.emptyState('notFound')]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('quests.steps')), quest.steps.length ? ui.el('ol', { className: 'quest-steps' }, quest.steps.map(function (step, index) {
        var checkbox = ui.el('input', { type: 'checkbox', checked: current.entry.done || current.completed.has(index), 'aria-label': t('quests.stepCheck', { number: n(index + 1) }), onChange: function () { updateStep(index, checkbox.checked); } });
        var objective = step.objective ? ui.el('p', { className: 'objective' }, t('quests.objective', { target: JSON.stringify(step.objective.target), count: JSON.stringify(step.objective.count) })) : null;
        return ui.el('li', {}, [ui.el('div', { className: 'step-row' }, [checkbox, ui.el('div', {}, [ui.el('p', {}, step.text), objective])])]);
      })) : ui.emptyState('notFound')]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('quests.rewards')), quest.rewards && quest.rewards.length ? ui.el('ul', { className: 'reward-list' }, quest.rewards.map(function (reward) { return ui.el('li', {}, rewardNode(reward)); })) : ui.emptyState('notFound')]),
      ui.el('section', { className: 'panel' }, [ui.heading(2, t('quests.chain')), chainTree(quest, store)]),
      ui.button(t('quests.resetProgress'), function () { if (root.confirm(t('quests.resetConfirm', { name: quest.title }))) { delete progress[quest.id]; saveProgress(progress); rerender(); } }, { className: 'button danger' })
    ]);
    return { node: node, title: quest.title };
  }

  function list(context) {
    var ui = GUIDE.ui; var t = GUIDE.i18n.t; var util = GUIDE.util; var store = context.store; var progress = readProgress();
    var types = util.unique(store.lists.quests.map(function (quest) { return quest.type; })).sort(util.compareValues);
    var givers = util.unique(store.lists.quests.map(function (quest) { return quest.giver === null ? 'unknown' : String(quest.giver); }));
    var search = ui.el('input', { type: 'search', value: state.query, placeholder: t('quests.searchPlaceholder'), 'aria-label': t('quests.searchLabel'), onInput: util.debounce(function () { state.query = search.value; rerender(); }, 150) });
    var type = ui.el('select', { 'aria-label': t('quests.typeFilter'), onChange: function () { state.type = type.value; rerender(); } }, [ui.el('option', { value: 'all', selected: state.type === 'all' }, t('common.all'))].concat(types.map(function (value) { return ui.el('option', { value: value, selected: state.type === value }, value); })));
    var giver = ui.el('select', { 'aria-label': t('quests.giverFilter'), onChange: function () { state.giver = giver.value; rerender(); } }, [ui.el('option', { value: 'all', selected: state.giver === 'all' }, t('common.all'))].concat(givers.map(function (value) { var character = value === 'unknown' ? null : store.getCharacter(Number(value)); return ui.el('option', { value: value, selected: state.giver === value }, character ? character.name : t('common.unknown')); })));
    var filtered = store.lists.quests.filter(function (quest) {
      if (state.type !== 'all' && quest.type !== state.type) return false;
      if (state.giver !== 'all' && (quest.giver === null ? 'unknown' : String(quest.giver)) !== state.giver) return false;
      return !state.query || util.normalizeSearch(quest.title + ' ' + (quest.desc || '')).indexOf(util.normalizeSearch(state.query)) !== -1;
    });
    var completedQuests = store.lists.quests.filter(function (quest) { var value = questProgress(quest, progress); return value.entry.done || (quest.steps.length > 0 && value.count === quest.steps.length); }).length;
    var grouped = types.map(function (typeName) { return { type: typeName, quests: filtered.filter(function (quest) { return quest.type === typeName; }) }; }).filter(function (group) { return group.quests.length; });
    var node = ui.el('div', { className: 'page' }, [
      ui.heading(1, t('nav.quests')), ui.datasetNotice('quests'), ui.el('p', { className: 'progress-summary' }, t('quests.progress', { done: GUIDE.i18n.n(completedQuests), total: GUIDE.i18n.n(store.lists.quests.length) })),
      ui.el('div', { className: 'filters' }, [ui.el('label', {}, [ui.el('span', {}, t('common.search')), search]), ui.el('label', {}, [ui.el('span', {}, t('quests.type')), type]), ui.el('label', {}, [ui.el('span', {}, t('quests.giver')), giver])]),
      grouped.length ? ui.el('div', { className: 'quest-groups' }, grouped.map(function (group) {
        return ui.el('section', {}, [ui.heading(2, group.type), ui.el('div', { className: 'card-list' }, group.quests.map(function (quest) {
          return ui.el('article', { className: 'quest-card quest-card-readonly' }, ui.heading(3, quest.title));
        }))]);
      })) : ui.emptyState('noResults')
    ]);
    return { node: node, title: t('nav.quests') };
  }

  GUIDE.pages.quests = { render: function (route, context) { return route.id ? detail(context.store.getQuest(route.id), context) : list(context); } };
})(window);
