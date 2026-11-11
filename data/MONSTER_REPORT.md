# Monster Discovery Report

Generated from `extracted/code/*.gml`, `metadata/objects.json`, `metadata/rooms.json`, `metadata/sprites.json`, and `strings.txt`. No missing value below is inferred.

## 1. Definitions and stats — partial

The concrete monster set is the 7 object descendants of `obj_enemies_parent`. The shared chain is `obj_enemies_parent -> obj_creatures_parent -> obj_entity`; wild animals under `obj_wild_animals` are a separate game hierarchy and are not classified as monsters.

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

No defense, experience reward, money reward, level, size stat, explicit flying flag, element, weakness, or resistance variable was found for these objects.

## 2. Drops — ok for the seven concrete monsters

Drops use parallel `dropItem`, `dropChance`, `dropValue`, and `dropRarity` arrays. Example from `gml_Object_obj_slime_Create_0`:
```gml
array_push(dropItem, 244);
array_push(dropChance, 70);
array_push(dropValue, 1);
array_push(dropRarity, 0);
```

`scr_npc_dead_state` rolls each entry independently with `random(100) <= dropChance[i]`, then passes the fixed quantity and rarity to `scr_show_drop_item`. Because `random(100)` is uniform on [0,100), literal threshold N is recorded as N percent (and 100 always succeeds). No quantity ranges or season, weather, level, or difficulty conditions were found.

## 3. Locations and spawn paths — partial

`50` concrete monster instances are placed in room metadata:

| Room | Layer | Count |
|---|---|---:|
| rmForest1_1 | Instances | 9 |
| rmForest1_2 | Instances | 6 |
| rmForest1_3 | Instances | 4 |
| rmForest1_4 | Instances | 10 |
| rmForest1_5 | Instances | 10 |
| rmMap17 | Instances | 3 |
| rmMap17_backup | Instances | 3 |
| rmMap8 | Instances | 2 |
| rmMap9 | Instances | 3 |

The hunting spawner is placed in `rmHunting1`. Its Alarm chooses uniformly from all seven monster objects. `obj_hunting_starter` tries to refill toward 15 enemies whenever the count is below 10, scheduling one spawner Alarm after 15–60 frames. The selected monster gets `respawnTime = -1`, aggro range 1200, escape range 2400, and HP `7 + irandom(8)` (integer 7–15).

The two `gml_RoomCC_rmForest...` `enemies` arrays only lock chests while listed object types exist; they do not create monsters. No quest, boss, cutscene, floor table, season, time-of-day, or weather monster spawn was found.

## 4. Names, descriptions, and sprites — partial

No monster name/description table or localization keys were found in code or `strings.txt`; records therefore retain their object ids as names and use null descriptions/text keys. Main sprites come from `metadata/objects.json`. Create events additionally name directional idle/walk/attack arrays such as `spr_goblin1_idleD`, `spr_goblin1_walkD`, and `spr_goblin1_atkD`; only each object's main sprite frame 0 is copied as the guide icon.

## 5. Scaling and variants — partial

Normal placed monsters use their Create-event HP. Hunting-spawned monsters replace it with `maxHp = 7 + irandom(8)` (7–15 inclusive). No difficulty, floor-depth, player-level, or season multiplier was found. No elite, boss, recolor, mutation, or code-linked variant objects were found, so `variants` is empty.

## 6. Not found

- **not_found:** numeric monster ids; dedicated display names/descriptions/text keys.
- **not_found:** defense, EXP, money, level, explicit size, element, weakness, resistance, or flying stats.
- **not_found:** conditional drops or random quantity ranges.
- **not_found:** difficulty/floor/player-level/season scaling and elite/boss/mutation links.
- **not_found:** quest, boss, or event-created monster instances.
- **partial:** several metadata room ids have no record in `places.json`; they remain as raw room ids and validator warnings.

Raw-valued monster records after extraction: 0.
