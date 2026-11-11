# Monster Discovery Report

Generated from `extracted/code/*.gml`, `metadata/objects.json`, `metadata/rooms.json`, `metadata/sprites.json`, and `strings.txt`. No missing value below is inferred.

## 1. Definitions and stats — partial

The monster set is the seven concrete object descendants of `obj_enemies_parent`, plus `obj_pitcher` as an explicit mid-boss exception (8 records total). The shared normal-enemy chain is `obj_enemies_parent -> obj_creatures_parent -> obj_entity`; `obj_pitcher` instead directly inherits `obj_entity` and implements its own HP, shield, targeting, projectile, damage, death, and drop logic. Wild animals under `obj_wild_animals` remain a separate game hierarchy. No runtime boss flag or dedicated monster-name table was found.

`gml_Object_obj_enemies_parent_Create_0`:
```gml
maxHp = 3;
hp = 3;
atk = 5;
alertRadius = 200;
```

`gml_Object_obj_slime_Create_0`:
```gml
maxHp = 10;
hp = maxHp;
hpBack = maxHp;
```

Create events provide `maxHp`; `atk`, `alertRadius`, shields, and drop arrays come from `obj_enemies_parent`; baseline `maxSpd`, `walkSpd`, and `runSpd` come from `obj_creatures_parent`. `obj_enemies_parent` PreCreate sets `respawnTime = 3`. Alarm and Step events implement aggro/chase behavior; goblins and cobra set `maxSpd = 2` while engaged and reset it to 1 after escape. Attack scripts pass `atk` to `scr_showSlash`; cobra uses a 1.5 multiplier, most attacks use 1, and the shared battler script contains a facing-3 multiplier of 0.5.

`obj_pitcher` has `maxHp = 100`, `maxShield = 100`, targets the player below 200 pixels, disengages above 300, and its projectile calls `scr_showSlash` with damage 15. No defense, experience reward, money reward, level, size stat, explicit flying flag, element, weakness, or resistance variable was found for these objects.

## 2. Drops — ok for all 8 monsters

Drops use parallel `dropItem`, `dropChance`, `dropValue`, and `dropRarity` arrays. Example from `gml_Object_obj_slime_Create_0`:
```gml
array_push(dropItem, 244);
array_push(dropChance, 70);
array_push(dropValue, 1);
array_push(dropRarity, 0);
```

Normal enemies use `scr_npc_dead_state`; `obj_pitcher` performs the same independent `random(100) <= dropChance[i]` loop in its Destroy event. The roll passes fixed quantity and rarity to `scr_show_drop_item`. Because `random(100)` is uniform on [0,100), literal threshold N is recorded as N percent (and 100 always succeeds). No quantity ranges or season, weather, level, or difficulty conditions were found.

## 3. Locations and spawn paths — partial

`51` concrete monster instances are placed in room metadata:

| Room | Layer | Count |
|---|---|---:|
| rmForest1_1 | Instances | 9 |
| rmForest1_2 | Instances | 7 |
| rmForest1_3 | Instances | 4 |
| rmForest1_4 | Instances | 10 |
| rmForest1_5 | Instances | 10 |
| rmMap17 | Instances | 3 |
| rmMap17_backup | Instances | 3 |
| rmMap8 | Instances | 2 |
| rmMap9 | Instances | 3 |

The hunting spawner is placed in `rmHunting1`. Its Alarm chooses uniformly from all seven monster objects. `obj_hunting_starter` tries to refill toward 15 enemies whenever the count is below 10, scheduling one spawner Alarm after 15–60 frames. The selected monster gets `respawnTime = -1`, aggro range 1200, escape range 2400, and HP `7 + irandom(8)` (integer 7–15).

The two `gml_RoomCC_rmForest...` `enemies` arrays only lock chests while listed object types exist; they do not create monsters. No quest or cutscene scripted monster spawn, floor table, season, time-of-day, or weather monster spawn was found.

## 4. Names, descriptions, and sprites — partial

No monster name/description table or localization keys were found in code or `strings.txt`. When the only name equals the object id, the exported display fallback removes `obj_`, replaces underscores with spaces, separates trailing numbers, and title-cases words (for example, `obj_electric_bee` becomes `Electric Bee`); `id` remains unchanged. Descriptions/text keys remain null. Main sprites come from `metadata/objects.json`. Create events additionally name directional idle/walk/attack arrays such as `spr_goblin1_idleD`, `spr_goblin1_walkD`, and `spr_goblin1_atkD`; only each object's main sprite frame 0 is copied as the guide icon.

## 5. Scaling and variants — partial

Normal placed monsters use their Create-event HP. Hunting-spawned normal monsters replace it with `maxHp = 7 + irandom(8)` (7–15 inclusive); the Pitcher is not in that spawn table. No difficulty, floor-depth, player-level, or season multiplier was found. Pitcher is exported as the requested boss exception, but no elite, recolor, mutation, or code-linked variant objects were found, so `variants` is empty.

## 6. Not found

- **not_found:** numeric monster ids; dedicated display names/descriptions/text keys.
- **not_found:** defense, EXP, money, level, explicit size, element, weakness, resistance, or flying stats.
- **not_found:** conditional drops or random quantity ranges.
- **not_found:** difficulty/floor/player-level/season scaling and elite/mutation/variant links.
- **not_found:** quest or event-created monster instances.
- **partial:** `rmHunting1` has no record in `places.json`; it remains a raw room id and validator warning.

Raw-valued monster records after extraction: 0.
