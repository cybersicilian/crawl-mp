# Burrows artwork

Current content revision: [twenty vaults per branch and fungal Wormlands](../burrows-generation/v6/README.md). Earlier results below remain historical.
Dedicated native artwork for the Burrows, generated with the built-in image
tool on 23 October 2026. [Preview](preview.png) shows every tile at native size
and enlarged with nearest-neighbor scaling.

## Assets

- Five monsters: burrowing beast, crag boar, shale drake, deep troll delver,
  and Worldworm. Their five corpse tiles use Crawl's existing collapse and
  blood-stain transform, which chooses a native blood background per creature.
- Four packed-earth floors, four diggable ochre rock walls, and two cool gray
  stone walls. The visual distinction follows the existing digging rules.
- Descending entrance and ascending exit, collected and uncollected clay rune,
  and whole and shattered ochre gem.

All 21 source tiles are 32 by 32 pixels. Monsters, stairs, and items have real
transparency; terrain fills the cell. Broad silhouettes, restrained palettes,
and ordinary native tile geometry keep them consistent with Crawl. Vaults use
these branch defaults and existing native props. No additional terrain rules,
monster abilities, effects, or animations are introduced.

The game assets live under `crawl-ref/source/rltiles/`: `mon/burrows/`,
`dngn/floor/floor_burrows*.png`, `dngn/wall/*wall_burrows*.png`,
`dngn/gateways/*_burrows.png`, `item/misc/{runes,uncollected_runes}/rune_burrows.png`,
and `item/gem/burrows_found_*.png`.

`dc-mon.txt`, `dc-corpse.txt`, `dc-floor.txt`, `dc-wall.txt`, `dc-feat.txt`, and
`dc-item.txt` register the artwork. Monster YAML, native tile selection, default
terrain flavors, and the party rune display select the dedicated symbols.

## Generation and provenance

[prompts.json](prompts.json) retains the complete final prompt set, built-in
tool provenance, original and native tile hashes, and native destination paths.
`sources/` preserves the selected generated PNGs. The uncollected rune is an
image-tool edit of the collected rune, preserving its tablet and sigil design.

`prepare.py` only normalizes generated artwork: crop transparent margins,
proportionally fit native bounds, downsample, limit the palette to 24 colors,
and threshold alpha to native opaque/transparent pixels. It draws no artwork.
Creature tiles fit 28 pixels, Worldworm and stairs 30, and item icons 20 by 24.

Normal native builds regenerate the atlases and tile metadata without any image
service or runtime asset dependency. For explicit atlas generation, run from
`crawl-ref/source`:

```
make -C rltiles -j2 TILES=y STDFLAG=-std=c++17
```

Follow the repository's shared heavy-host gate before generation or building.
Use the normal WebTiles build to copy matching atlases and metadata into its
runtime locations. Tile indices are generated; ship a matched native binary,
metadata, and atlases together.

## Verification

`verify.py SOURCE OUTPUT` reads actual generated AMD metadata through
`atlas-info.cjs`, reconstructs the atlas rectangles, and checks every original
opaque pixel against the corresponding source tile. It also checks all five
corpse tiles, atlas bounds, tile dimensions, alpha, and palette limits.

The gated isolated macOS arm64 WebTiles build passed with `FULLDEBUG=y`, C++17,
and two make jobs. Full database loading, native monster/spell data, five Burrows
cases with 552 assertions, all 33 authored vault placements, and 16 full floors
passed. The party rune display check also passed. All 21 original tiles match
their actual atlas pixels, and all five corpses are distinct native transforms.

[Native atlas preview](native-atlas-preview.png) reconstructs the audited
rectangles from the generated atlases. [Generated tiles](generated-tiles.zip)
contains 34 files: all matching native atlas images, C++ tile definitions,
generated WebTiles metadata, and manifests. [Validation summary](validation-summary.json)
and [generated manifest](generated-manifest.json) retain counts and hashes.

Local ignored `validation/attempt-1/` contains the passing build and native
generation receipts; `attempt-3/` contains the passing pixel audit. Earlier
audit failures are preserved: its palette check initially counted transparent
RGB values, then incorrectly expected multiple corpse tiles from alternative
blood backgrounds. Correcting the audit required no artwork or engine changes.
Every owned heavy-host reservation was closed and released.

The generated bundle is a matched build export. The shared checkout's existing
binary, runtime atlases, and services were not replaced. Full player-run balance,
live browser presentation, and deployment remain separate from these source,
atlas, and native generation checks. The earlier implementation's broader
[save-compatibility failure](../burrows-validation/README.md) remains recorded;
no complete-suite pass is claimed.


## Rune-free route revision

The current route reuses unused native rock/drill worm sprites for gallery and
coil worms, including normal native corpse transforms. It restores the existing
Hive entry/exit sprites and wax terrain. [route-assets.json](route-assets.json)
records exact provenance and hashes. The older clay rune tiles remain only for
saved items. The bundle above belongs to the earlier rune-branch build; current
native route previews and matching binary hashes are in
[the route revision](../burrows-generation/v4/README.md).


## Regional creature expansion

Five dedicated transparent 32x32 tiles cover caustic worms, wax beetles, venom
wasps, Old Coil and Vespara. Their corpses use the existing native collapse and
green-blood transform. [Native-size and enlarged sprites](content/monsters.png)
and [the prompt/source/tile manifest](content/prompts.json) preserve the chosen
artwork. Original generated images remain in `content/sources/`.

The existing pixel audit now accepts an optional monster manifest, retaining
its original whole-branch audit when the argument is omitted:

```
python3 verify.py SOURCE OUTPUT content/prompts.json
```

[The content preview](../burrows-generation/v5/README.md) records the matching
native binary and atlas audits. Normal native builds regenerate corpse tiles,
atlas images, C++ definitions and WebTiles metadata together. The older bundled
ZIP remains the historical rune-branch build.
