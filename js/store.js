(function (root, factory) {
  var util = root && root.GUIDE ? root.GUIDE.util : null;
  var mapsLogic = root && root.GUIDE ? root.GUIDE.mapsLogic : null;
  if (!util && typeof require === 'function') util = require('./util.js');
  if (!mapsLogic && typeof require === 'function') mapsLogic = require('./maps-logic.js');
  var api = factory(util, mapsLogic);
  if (root) {
    root.GUIDE = root.GUIDE || {};
    root.GUIDE.storeLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function (util, mapsLogic) {
  'use strict';

  var REACTIONS = ['loved', 'liked', 'neutral', 'disliked', 'hated'];

  function isLocalizedValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var keys = Object.keys(value);
    return keys.length > 0 && keys.every(function (key) { return key === 'en' || key === 'id'; }) && (Object.prototype.hasOwnProperty.call(value, 'en') || Object.prototype.hasOwnProperty.call(value, 'id'));
  }

  function localizeData(value, language) {
    language = language === 'id' ? 'id' : 'en';
    if (Array.isArray(value)) return value.map(function (entry) { return localizeData(entry, language); });
    if (!value || typeof value !== 'object') return value;
    if (isLocalizedValue(value)) {
      var selected = value[language];
      if (selected === null || selected === undefined || selected === '') selected = value.en;
      if (selected === null || selected === undefined || selected === '') selected = value.id;
      return localizeData(selected === undefined ? '' : selected, language);
    }
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = localizeData(value[key], language); });
    return result;
  }

  function records(data, name) {
    return data && data[name] && Array.isArray(data[name].records) ? data[name].records : [];
  }

  function byId(list, key) {
    var map = new Map();
    list.forEach(function (entry) { map.set(entry[key || 'id'], entry); });
    return map;
  }

  function buildGiftIndexes(gifts) {
    var byCharacter = new Map();
    var byItem = new Map();
    gifts.forEach(function (gift) {
      byCharacter.set(gift.characterId, gift);
      REACTIONS.forEach(function (reaction) {
        (gift[reaction] || []).forEach(function (itemId) {
          util.mapPush(byItem, itemId, {
            characterId: gift.characterId,
            reaction: reaction,
            points: gift.points && Object.prototype.hasOwnProperty.call(gift.points, itemId) ? gift.points[itemId] : null,
            affectionPoints: gift.affectionPoints && Object.prototype.hasOwnProperty.call(gift.affectionPoints, itemId) ? gift.affectionPoints[itemId] : null
          });
        });
      });
    });
    return { byCharacter: byCharacter, byItem: byItem };
  }

  function buildRecipeIndexes(recipes) {
    var usingItem = new Map();
    var makingItem = new Map();
    recipes.forEach(function (recipe) {
      util.mapPush(makingItem, recipe.resultItemId, recipe);
      (recipe.ingredients || []).forEach(function (ingredient) {
        util.asArray(ingredient.itemId).forEach(function (itemId) {
          if (!util.isRaw(itemId)) util.mapPush(usingItem, itemId, recipe);
        });
      });
    });
    return { usingItem: usingItem, makingItem: makingItem };
  }

  function requirementItemIds(requirement) {
    if (!requirement || ['item', 'items'].indexOf(requirement.type) === -1) return [];
    return util.asArray(requirement.value).filter(function (value) { return typeof value === 'number'; });
  }

  function buildQuestIndexes(quests) {
    var byItem = new Map();
    var byGiver = new Map();
    quests.forEach(function (quest) {
      if (quest.giver !== null && quest.giver !== undefined) util.mapPush(byGiver, quest.giver, quest);
      var ids = [];
      (quest.requires || []).forEach(function (requirement) { ids.push.apply(ids, requirementItemIds(requirement)); });
      (quest.rewards || []).forEach(function (reward) { if (reward.type === 'item' && typeof reward.value === 'number') ids.push(reward.value); });
      (quest.steps || []).forEach(function (step) {
        if (step.objective && step.objective.type === 'item' && typeof step.objective.target === 'number') ids.push(step.objective.target);
      });
      util.unique(ids).forEach(function (itemId) { util.mapPush(byItem, itemId, quest); });
    });
    return { byItem: byItem, byGiver: byGiver };
  }

  function buildFishingIndexes(rules) {
    var byPlace = new Map();
    var byFish = new Map();
    rules.forEach(function (rule) {
      util.mapPush(byFish, rule.fishId, rule);
      (rule.places || []).forEach(function (placeId) { util.mapPush(byPlace, placeId, rule); });
    });
    return { byPlace: byPlace, byFish: byFish };
  }

  function ruleMatches(rule, settings) {
    settings = settings || {};
    if (settings.place && (rule.places || []).indexOf(settings.place) === -1) return false;
    if (settings.season && rule.seasons && rule.seasons.indexOf(settings.season) === -1) return false;
    if (settings.weather && rule.weather && rule.weather.indexOf(settings.weather) === -1) return false;
    if (!util.timeMatches(settings.time, rule.timeStart, rule.timeEnd)) return false;
    var requirements = rule.requires || [];
    for (var i = 0; i < requirements.length; i += 1) {
      var requirement = requirements[i];
      if (requirement.type === 'rod') {
        if (!settings.rod || util.asArray(requirement.value).indexOf(Number(settings.rod)) === -1) return false;
      }
      if (requirement.type === 'bait') {
        if (!settings.bait || util.asArray(requirement.value).indexOf(Number(settings.bait)) === -1) return false;
      }
    }
    return true;
  }

  function rateApplies(rate, fish) {
    var applies = rate.appliesTo || {};
    if (applies.fishIds && applies.fishIds.indexOf(fish.id) === -1) return false;
    if (applies.rarities && applies.rarities.indexOf(fish.rarity) === -1) return false;
    return true;
  }

  function calculateFishingChances(rules, fishes, rateUps, activeIds, settings) {
    var fishMap = byId(fishes || []);
    var active = new Set(activeIds || []);
    var rates = (rateUps || []).filter(function (rate) { return active.has(rate.id); });
    var totals = new Map();
    var excluded = [];

    (rules || []).filter(function (rule) { return ruleMatches(rule, settings); }).forEach(function (rule) {
      var fish = fishMap.get(rule.fishId) || { id: rule.fishId, rarity: null };
      if (typeof rule.weight !== 'number' || !Number.isFinite(rule.weight)) {
        excluded.push({ rule: rule, fish: fish });
        return;
      }
      var multiplier = 1;
      var additive = 0;
      rates.forEach(function (rate) {
        if (!rateApplies(rate, fish)) return;
        if (typeof rate.multiplier === 'number') multiplier *= rate.multiplier;
        if (typeof rate.additive === 'number') additive += rate.additive;
      });
      var effective = Math.max(0, rule.weight * multiplier + additive);
      var prior = totals.get(rule.fishId) || { fish: fish, weight: 0, rules: [] };
      prior.weight += effective;
      prior.rules.push(rule);
      totals.set(rule.fishId, prior);
    });

    var totalWeight = Array.from(totals.values()).reduce(function (sum, entry) { return sum + entry.weight; }, 0);
    var entries = Array.from(totals.values()).map(function (entry) {
      return Object.assign(entry, { chance: totalWeight > 0 ? entry.weight / totalWeight : 0 });
    }).sort(function (a, b) { return b.chance - a.chance || util.compareValues(a.fish.name, b.fish.name); });
    return { entries: entries, excluded: excluded, totalWeight: totalWeight };
  }

  function ownedQuantity(owned, id) {
    if (owned instanceof Map) return Number(owned.get(id) || 0);
    return Number(owned && owned[id] || 0);
  }

  function recipeFeasibility(recipe, owned, learned) {
    var missing = [];
    (recipe.ingredients || []).forEach(function (ingredient) {
      var alternatives = util.asArray(ingredient.itemId).filter(function (id) { return typeof id === 'number'; });
      var required = typeof ingredient.count === 'number' ? ingredient.count : 0;
      var best = alternatives.reduce(function (maximum, id) { return Math.max(maximum, ownedQuantity(owned, id)); }, 0);
      if (!alternatives.length || best < required) {
        missing.push({ itemIds: alternatives, count: Math.max(0, required - best), required: required, owned: best });
      }
    });
    var ingredientsMet = missing.length === 0;
    var isLearned = learned instanceof Set ? learned.has(String(recipe.id)) || learned.has(recipe.id) : !!(learned && learned[recipe.id]);
    var canCookNow = ingredientsMet && (recipe.needsRecipe === false || isLearned);
    return {
      ingredientsMet: ingredientsMet,
      missing: missing,
      learned: isLearned,
      canCookNow: canCookNow,
      recipeRequired: recipe.needsRecipe === true,
      recipeUnknown: recipe.needsRecipe === null
    };
  }

  function create(data, language) {
    data = localizeData(data || {}, language || 'en');
    var lists = {
      items: records(data, 'items'),
      characters: records(data, 'characters'),
      gifts: records(data, 'gifts'),
      fish: records(data, 'fish'),
      places: records(data, 'places'),
      maps: records(data, 'places'),
      fishing: records(data, 'fishing'),
      fishingRate: records(data, 'fishingRate'),
      monsters: records(data, 'monsters'),
      gatherables: records(data, 'gatherables'),
      quests: records(data, 'quests'),
      recipes: records(data, 'recipes'),
      events: records(data, 'events'),
      sprites: records(data, 'sprites')
    };
    var giftIndexes = buildGiftIndexes(lists.gifts);
    var recipeIndexes = buildRecipeIndexes(lists.recipes);
    var questIndexes = buildQuestIndexes(lists.quests);
    var fishingIndexes = buildFishingIndexes(lists.fishing);
    var mapIndexes = mapsLogic.buildMapIndexes({
      maps: lists.maps,
      monsters: lists.monsters,
      gatherables: lists.gatherables,
      fishingRate: lists.fishingRate,
      items: lists.items,
      fish: lists.fish
    });
    return {
      data: data,
      lists: lists,
      items: byId(lists.items),
      characters: byId(lists.characters),
      fish: byId(lists.fish),
      places: byId(lists.places),
      maps: mapIndexes.mapById,
      monsters: byId(lists.monsters),
      mapIndexes: mapIndexes,
      quests: byId(lists.quests),
      recipes: byId(lists.recipes),
      sprites: byId(lists.sprites, 'name'),
      giftByCharacter: giftIndexes.byCharacter,
      giftsByItem: giftIndexes.byItem,
      recipesUsingItem: recipeIndexes.usingItem,
      recipesMakingItem: recipeIndexes.makingItem,
      questsByItem: questIndexes.byItem,
      questsByGiver: questIndexes.byGiver,
      fishRulesByPlace: fishingIndexes.byPlace,
      fishRulesByFish: fishingIndexes.byFish,
      activeRateUps: new Set(),
      getItem: function (id) { return this.items.get(Number(id)); },
      getCharacter: function (id) { return this.characters.get(Number(id)); },
      getFish: function (id) { return this.fish.get(Number(id)); },
      getQuest: function (id) { return this.quests.get(String(id)); },
      getRecipe: function (id) { return this.recipes.get(Number(id)); },
      setRateUp: function (id, enabled) { if (enabled) this.activeRateUps.add(id); else this.activeRateUps.delete(id); },
      fishingChances: function (settings) {
        return calculateFishingChances(this.lists.fishing, this.lists.fish, data.fishing.rateUps || [], this.activeRateUps, settings);
      }
    };
  }

  return {
    REACTIONS: REACTIONS,
    isLocalizedValue: isLocalizedValue,
    localizeData: localizeData,
    byId: byId,
    buildGiftIndexes: buildGiftIndexes,
    buildRecipeIndexes: buildRecipeIndexes,
    buildQuestIndexes: buildQuestIndexes,
    buildFishingIndexes: buildFishingIndexes,
    ruleMatches: ruleMatches,
    calculateFishingChances: calculateFishingChances,
    recipeFeasibility: recipeFeasibility,
    create: create
  };
});
