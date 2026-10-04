# Client-derived assets

Some of the portal's presentation — real item names like "Jackhammer" instead of `r_shotgun`, and
inventory artwork — comes from a **PlanetSide client installation**. That material is owned by
Daybreak Game Company.

**What is committed, and what is not.**

`data/items-english.json` IS committed, but with its description prose stripped. What remains is the
factual identifiers the inventory UI cannot render anything without: the wire `class_id`, the internal
name, the display name, the type, and the grid footprint in cells. The long `_info` description
strings -- verbatim client copy, and the most clearly copyrightable part -- are removed before commit.
Regenerating with the tool below WILL re-add them, so strip them again before committing a refresh.

`static/items/` remains gitignored: that is for locally-generated bitmaps, which are copied artwork
rather than factual data.

The traced vector artwork in `src/lib/itemShapes.json` is also committed -- it is geometry derived
from the client's icons, not a copy of them.

The portal degrades gracefully if the item table is absent: names fall back to internal object names
and the grid falls back to plain tiles. A clean clone builds and runs with no extra steps.

## Generating them locally

You need your own copy of the game client. Nothing here downloads or redistributes one.

The extractor lives in the sibling [raxicore-editor](../../raxicore-editor) repo, which reads the
client's archive formats directly:

```bash
# item names, types and descriptions -> data/items-english.json
dotnet run --project tools/ItemNamesExport -- "<PlanetSideDir>" "<PSFPortal>/data/items-english.json" english
```

Languages other than `english` are available (`de`, `es`, `fr`, `it`, `ru`) — the client ships all six.

### Where the data comes from

Both halves live inside `startup.pak` and join on the object's internal name:

| File | Provides |
|---|---|
| `game_objects.adb` | the object registry: wire `class_id`, internal name, `type`, and `icon_width`/`icon_height` (the inventory grid footprint in cells) |
| `english.str` | a flat `@key=value` table where the key IS the internal name — `@r_shotgun=Jackhammer`, and `@r_shotgun_info` for the description |

`class_id` matches PSF-LoginServer's `ObjectClass` ids, which is what makes the join to a stored
locker/loadout blob possible.

Roughly 429 of 1048 objects have a display name. That is not a gap to fix: the unnamed ones are
engine-internal (projectiles, skydomes, spawn points, vehicle-mounted turrets) and the client never
shows them to a player either. Coverage of what a player can actually hold is near-total.

## If you are packaging this

Build the image without the generated directories and it stays clean and redistributable. Build it
with them and the result contains Daybreak-owned material — keep that image local.
