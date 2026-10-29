# HUD icon art

The local HUD uses purchased Clockwork Raven artwork at its original pixel grid.
Credit: Clockwork Raven – Additional Art Assets.
Source: https://clockworkraven.itch.io/raven-fantasy-icons

The Raven pixels are separately licensed under `LICENSE-RAVEN.txt`; they are not
GPL or CC0. Users may not reuse or redistribute this artwork as assets. The raw
purchased packs and generated licensed atlas are ignored by Git. This local art
overlay is not part of the project's open-source artwork grant. Do not publish
these assets as a standalone asset library. Each collaborating license holder
must provide their own authorized sources; team use follows the asset license.

## Rebuilding the local overlay

Install Pillow for the Python used below. Extract the purchased premium pack,
Symbols and Runes, and Classic GUI kit into a private directory with this layout:

```
private/
  raven-premium.zip
  raven-premium/Premium - Raven Fantasy Icons/Separated Files/16x16/a1.png …
  raven-symbols.zip
  raven-symbols/Original/16/1.png …
  raven-gui-classic.zip
  raven-gui-classic/Small Separated Files/sprite-4-20.png …
```

From `crawl-ref/source/webserver`:

```
python3 util/generate-hud-sprites.py --sources /absolute/path/to/private
python3 util/generate-hud-sprites.py --sources /absolute/path/to/private --verify
```

`util/hud-raven-mapping.json` is the declarative role-to-source contract. The
packer copies RGBA pixels, centering small authored GUI symbols without scaling,
recoloring, redrawing, or adding badges. It rejects oversized/empty art and missing
roles. SHA-256 hashes record the source archives, source PNGs, normalized RGBA
frames, and generated atlas. The stable renderer API preserves all existing
semantic names, aliases, accessible labels, exact values, and canvas consumers.
Native DCSS item, spell, deity, and collected-rune art uses its existing atlases.

The first pass replaces 92 of 112 canonical roles. The 20 retained frames
are marked `legacy` in the mapping and manifest, including the separate rotating
compass layers. They remain functional until suitable authored assets are
selected. `meaning: metaphor` records indirect meanings and intentional reuse;
these are not claims that the pack contains every literal game action.

Previous atlas files remain for cached clients and the explicitly retained
controls. The old `hud_sprite_art.py` drawing module is not used by this importer.

The HUD clarity pass corrects four source selections after reviewing enlarged
source pixels: `coin` uses gold coin stacks (`a173`), `armour` a silver breastplate
(`a6018`), `sound` a horn (`a19`), and `filter-pack` a brown backpack (`a263`). The
tracker also labels Gold, Floor, and Runes explicitly. These mappings preserve
the original authored pixels and the stable role names; the atlas hash changes
with its contents. Pixel/provenance checks verify faithful import, while visual
review establishes whether the selected object fits its role.

Pending roles: `zoom-in`, `zoom-out`, `zoom-reset`, `layout`, `move`, `expand`,
`camera`, `compact`, `faith-none`, `stairs`, `gloves`, `floor`, `control`,
`claim-hero`, `ping-look`, `filter-all`, `quiver`, `arcane-deck`, `compass-rose`,
and `compass-needle`.
