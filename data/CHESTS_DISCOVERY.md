# Chest Discovery

This report is based only on `extracted/metadata`, `extracted/code`, `extracted/sprites`,
`extracted/strings.txt`, `guide/data/places.json`, and `guide/data/maps.json`.

## 0.1 Objects

The real lock object name is singular: `obj_chest_lock_enemy`.

| Object whose name contains `chest` | Sprite | Parent chain (nearest first) | Children (depth <= 32) | Placed instances | Classification |
|---|---|---|---|---:|---|
| `obj_chest` | `spr_chest2` | `obj_interaction_parent` → `obj_entity` | none | 14 | Real one-time loot chest |
| `obj_chest_lock_enemy` | `spr_chest2` | `obj_interaction_parent` → `obj_entity` | none | 2 | Real one-time enemy-locked loot chest |

Placed counts by room:

| Object | Room counts |
|---|---|
| `obj_chest` | `rmForest1_2` 1; `rmMap_Mines3` 1; `rmMap_Mines5` 1; `rmMap_Mines7` 1; `rmMap_Mines8` 1; `rmMap_Mines9` 1; `rmMap1` 1; `rmMap3_3_floor2` 1; `rmMap3_5` 1; `rmMap3_8` 1; `rmMap3` 3; `rmMap7` 1 |
| `obj_chest_lock_enemy` | `rmForest1_2` 1; `rmForest1_4` 1 |

A sprite/behavior cross-check found one additional real chest object whose name does not
contain `chest`:

| Object | Sprite | Parent chain | Children | Placed instances | Classification |
|---|---|---|---|---:|---|
| `obj_item_field` | `spr_soil_chest` | `obj_farm_field` | none | 18 | Real one-time buried chest; using a hoe rolls its per-instance drop table and changes the sprite to its opened frame |

`obj_item_field` placements are: `rmMap1` 7, `rmMap15` 3, `rmMap2_backup` 4,
and `rmMap2_backup2` 4.

Excluded sprite-based candidates:

- `obj_crate_box` uses `spr_chest1`, but it is reusable player storage. Its interaction
  calls `scr_showCrate(crateIndex)` and its alarm allocates an `Inventory`; it has no
  one-time loot/open reward logic. Its three placed instances are therefore excluded.
- `scr_show_chest_found` and `obj_window_item_found` display reward UI; they are not chest
  world objects.
- No object whose name contains `chest` was excluded: both such objects are real chests.

Parent walks were cycle-safe and capped at 32 links. No cycle was found in these real
objects.

## 0.2 Opening logic

### Plain interaction (`obj_chest`)

The player interactor selects an `obj_interaction_parent`; the desktop action performs its
user event:

```gml
with (_interaksiId)
{
    event_user(0);
}
```

The chest's user event immediately starts opening and schedules reward delivery:

```gml
interactAble = false;
opened = true;
alarm[0] = 15;
image_index = 1;
```

There is no key, quest, switch, boss, season, difficulty, or player-level condition on
`obj_chest`.

### Listed-enemy lock (`obj_chest_lock_enemy`)

Each instance creation code pushes object types into `enemies`. For example:

```gml
array_push(enemies, obj_electric_bee);
array_push(enemies, obj_fire_bee);
array_push(enemies, obj_pitcher);
array_push(enemies, obj_cobra);
```

The interaction checks whether any instance of each listed object type still exists:

```gml
if (instance_exists(enemies[i]))
{
    continue;
}
_remains--;
```

It opens only when none of the listed types remains:

```gml
if (_remains > 0) scr_show_notification("Chest locked!", 3415776);
else { opened = true; alarm[0] = 15; image_index = 1; }
```

This is **not** an all-enemies-in-room check. `rmForest1_4` also contains boars and a fire
bee, but its chest lists only `obj_slime`, `obj_goblin1`, and `obj_goblin2`. There is no
group id, counter, global unlock flag, or re-lock code. Once opened, the chest is recorded
as destroyed and does not return.

### Buried chest (`obj_item_field`)

Any equipped hoe executes the same action script. At impact it calls action `0` on the
field:

```gml
var _field = instance_place(x, y, obj_farm_field);
if (_field != -4 && drawField > 0)
    scr_farm_field_action(_field, fieldTileX, fieldTileY, 0);
```

For the non-farming `obj_item_field`, this rolls the drops and marks the chest opened:

```gml
if (random(100) <= dropChance[i])
    scr_show_drop_item(x, y, dropItem[i], dropValue[i], dropRarity[i]);
scr_destroyed_object_add();
image_index = 1;
```

The usable hoe item ids are 1, 6, 11, 16, and 21. A hoe is not consumed.

## 0.3 Contents

`scr_chests` writes reward arrays on the target chest. The four reward categories are
currency, XP, item, and feature:

```gml
objChest.itemCategory[index] = UnknownEnum.Value_2;
objChest.itemId[index] = arg0;
objChest.itemValue[index] = arg1;
```

Placed normal/enemy-lock chest creation code uses fixed calls such as:

```gml
var _chest = new scr_chests(id);
_chest.xpAdd(10);
_chest.currencyAdd(UnknownEnum.Value_0, 500);
_chest.itemAdd(242, 10);
```

`Data_getCurrency` proves `UnknownEnum.Value_0` is Gold. `xpAdd` is XP. No fixed chest
uses `choose`, `irandom`, weights, floor, season, difficulty, or player-level tables.

The buried chests have three independent explicit rolls in every instance:

```gml
array_push(dropItem, 246); array_push(dropChance, 50);
array_push(dropItem, 247); array_push(dropChance, 25);
array_push(dropItem, 248); array_push(dropChance, 5);
```

The consumer uses `random(100) <= dropChance[i]`; the recorded percentages are 50%, 25%,
and 5%. All quantities are 1. These are independent rolls, so more than one item can drop.

Precedence is: instance creation/pre-creation code, then the inherited object default,
then unknown. Object defaults initialize empty arrays. Consequently, the `obj_chest`
instance `rmForest1_2#100597`, which has no instance code, is explicitly an empty chest.
All referenced numeric item ids exist in the current `items.json`.

## 0.4 State and scripted creation

Both chest families set `respawnTime = -1`. Opening a normal chest calls
`scr_destroyed_object_add`; digging a buried chest does the same. The stable game save key
is constructed as:

```gml
room_get_name(room) + "_" + object_get_name(arg0) + "_" + string(xstart) + "_" + string(ystart)
```

The key, destruction day, and season are saved in `dest_obj` and restored into
`global.gl_destroyedObject`. On room creation, `scr_is_respawn` destroys a previously
opened chest immediately when `respawnTime == -1`. Thus these chests do not reset daily,
per visit, or after enemy respawns.

A scan of all `instance_create`, `instance_create_depth`, and `instance_create_layer` calls
found no script-created `obj_chest`, `obj_chest_lock_enemy`, or `obj_item_field`. Calls to
`new scr_chests(id)` configure already placed instances; they do not create chest objects.

## 0.5 Map join

`maps.json` groups rooms using `places.json.children`. Chest rooms resolve as follows:

| Chest room | Guide map display name | Area label | Chests |
|---|---|---|---:|
| `rmForest1_2` | Grimwood Forest | 2 | 2 |
| `rmForest1_4` | Grimwood Forest | 4 | 1 |
| `rmMap_Mines3` | Silent Fairy | Mines floor 3 | 1 |
| `rmMap_Mines5` | Silent Fairy | Mines floor 5 | 1 |
| `rmMap_Mines7` | Silent Fairy | Mines floor 7 | 1 |
| `rmMap_Mines8` | Silent Fairy | Mines floor 8 | 1 |
| `rmMap_Mines9` | Silent Fairy | Mines floor 9 | 1 |
| `rmMap1` | North West Town | none | 8 |
| `rmMap15` | North East Town | none | 3 |
| `rmMap2_backup` | Town Square | technical room-id label omitted from human text | 4 |
| `rmMap2_backup2` | Town Square | technical room-id label omitted from human text | 4 |
| `rmMap3_3_floor2` | not present in guide maps/places | none | 1 |
| `rmMap3_5` | Town Hall | Sweet Cafe | 1 |
| `rmMap3_8` | Town Hall | Lilia's House | 1 |
| `rmMap3` | Town Hall | none | 3 |
| `rmMap7` | Carpenter | none | 1 |

`rmMap3_3_floor2` is retained as informational with `Unknown map`/`Peta tidak diketahui`;
its internal id is never inserted into human text. The two backup rooms technically occur
as grouped map areas, but their only area labels are internal room ids, so those labels are
also omitted from human text rather than guessed.

## 0.6 Text facts

The deterministic text needs only: localized map name, optional safe area label, 3×3
position region, unlock type/details, and contents mode/items/extras. Unlock types actually
found are:

- `none`: direct interaction;
- `enemies`: every instance of each per-chest listed enemy object type must be gone;
- `key`: use any hoe (ids 1, 6, 11, 16, or 21) for a buried chest.

Contents modes actually found are `fixed`, `randomPool` (the three independent buried
chest rolls), and `none`. No unsupported fact is converted into a guess.

## 0.7 Icons

- `obj_chest` and `obj_chest_lock_enemy` use `spr_chest2`: frame 0 is closed and code sets
  `image_index = 1` when opened.
- `obj_item_field` uses `spr_soil_chest`: frame 0 is buried/closed and code sets frame 1
  after digging.
- Excluded `obj_crate_box` uses the single-frame `spr_chest1`.
- Before this task, none of these three sprite names had a file in `guide/assets/icons/`.

Before the required fix, `copyReferencedSprites` used `fs.copyFileSync(source,
destination)` unconditionally and also deleted old icon files that were no longer
referenced. Therefore it did overwrite existing icons. The build now uses the shared
`copyIconIfMissing` helper for every referenced sprite and performs no icon cleanup;
existing files are left byte-for-byte untouched. The icon directory was 32.7 MB before
adding chest icons, below the 50 MB warning threshold.
