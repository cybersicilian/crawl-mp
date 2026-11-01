# Lobby assets

`dungeon-thresholds-v1.png` supplies amber-runed and green-sealed doors,
downward/upward escape hatches, and green-sealed stairs in both directions.
These six exact native states have distinct authored crops; clear doors,
connected gate segments and branch/vault overrides remain independent. The
same declared artwork feeds detailed draws and the composed feature atlas.
Original built-in `image_gen` output, prompt, references and crop metadata are
preserved. See `docs/graphics-2026-10-31/thresholds/README.md` for verification.

`dungeon-denizens-v1.png` adds nine ordinary creature appearances for
Illustrated: dart slug, ribbon worm, scorpion, killer bee, bullfrog, jelly,
endoplasm, wolf and black bear. Explicit source rectangles follow transparent
gaps in the original sheet, preserving complete sprites without local pixel
edits. The adjacent provenance records the built-in `image_gen` prompt,
style/native references and exact crop geometry. See
`docs/graphics-2026-10-31/denizens/README.md` for native-definition and browser
verification status.

`held-ranged-v2.png` supplies five mapped ranged appearances for Illustrated:
sling, shortbow, shared longbow/orcbow, arbalest and triple crossbow. The
unused hand-cannon draft retains native rendering until its grip fits. The
provenance preserves the original built-in `image_gen` prompt,
layout correction and native geometry references. Bow hand gaps and distinct
crossbow orientations follow the native equipment layers. See
`docs/graphics-2026-10-31/ranged/README.md` for coverage and validation status.

`held-melee-v1.png` and `held-weapon-forms-v1.png` add 22 more ordinary melee
appearances, including the actual angled short-sword/club defaults, larger
axes, polearms, flexible weapons and quarterstaff. Exact built-in `image_gen`
prompts, native geometry references, transparent crop boundaries and original
hashes are preserved in adjacent provenance JSON. See
`docs/graphics-2026-10-31/melee/README.md` for native-selector coverage and
verification status. Both sheets load only when Illustrated is selected.

`held-equipment-v2.png` and `shield-variants-v1.png` supply six ordinary weapon
styles and all 19 ordinary shield appearances for Illustrated. Adjacent
provenance JSON preserves exact built-in `image_gen` prompts, references,
crop geometry and hashes. The generic compositor preserves native finger gaps
in a limited grip window and retains independent equipment layers. See
`docs/graphics-2026-10-31/equipment/README.md` for final browser evidence and
the remaining equipment coverage.

`dungeon-humanoids-v1.png` adds nine empty-handed enemy bodies for Illustrated;
real equipment remains separately composited. Its provenance JSON contains the
built-in `image_gen` prompt, native reference images, actual crop layout and
hash. See `docs/graphics-2026-10-31/humanoids/README.md` for equipment and scale
verification.

`dungeon-beasts-v2.png` supplies nine ordinary animals for Illustrated. It is a
1254 × 1254 transparent 3 × 3 sheet, loaded only when that pack is selected.
Its provenance JSON records built-in `image_gen` generation and layout-edit
prompts. See `docs/graphics-2026-10-31/creatures/README.md` for mappings and
native composition verification.

Dungeon gameplay feature art is documented in
`docs/graphics-2026-10-31/README.md`. `dungeon-features-v1.png` is an original
built-in `image_gen` RGBA sheet with closed/open doors, descending/ascending
stone stairs, and blue/dry fountains. Its adjacent provenance JSON records the
complete prompt, layout and source hash. The Illustrated pack samples it at
fourfold native resolution; Classic retains native artwork.

`dungeon-threshold.png` is a custom 1536 × 1024 illustration generated for this
project with the built-in `image_gen` tool (`transparent_background: false`).
It is served locally by the welcome and staging stylesheets. No runtime image
API, remote URL, or generated text is involved.

The two section marks (`lobby-expedition-mark.svg` and
`lobby-chronicle-mark.svg`) are project-native vector artwork. Shared item,
resistance, and status symbols are SVG paths in `scripts/item-properties.js`.

## Final generation prompt

Use case: stylized-concept.

Asset type: production fantasy game lobby background illustration, wide 3:2
landscape, intended native output 1536 x 1024 pixels or greater.

Primary request: An ancient stone dungeon threshold: a monumental weathered
vault archway opens onto broad descending stairs that recede into an immense
subterranean hall, with a softly glowing small magical Orb visible far below.
This is contemporary premium fantasy game key art, a richly textured painterly
environment illustration with confident shape design and sophisticated
atmospheric depth.

Composition/framing: The richly detailed focal stone doorway and descending
stairway occupy the RIGHT TWO THIRDS of the image. The LEFT THIRD is deep dark
umber atmospheric shadow and subtle stone texture, deliberately quiet negative
space for a separately composited heading. View from just outside the vault
into the depths; strong arch silhouette, tactile monumental scale, calm visual
hierarchy. Keep the main doorway and light sources readable when the illustration
is cropped to a wide header.

Lighting/mood: An adventurers' guild's invitation to an unexplored dungeon;
warm bronze and gold torchlight grazing worn masonry, subtly teal mist and a
faint teal-gold glow around the distant Orb. Moody and enticing, elegant rather
than horror. Controlled highlights, softly luminous depth.

Color palette: warm dark umber, smoked bronze, antique gold torchlight, charcoal
stone, restrained deep teal accents.

Materials/textures: expressive hand-painted stone planes, chipped limestone
edges, old bronze vault details, dust and smoke catching warm light. Authentic
illustrative brushwork, layered painterly texture, polished art direction.

Constraints: Environment only. No characters, people, faces, monsters, skeletons,
weapons or treasure props in the foreground. No UI elements, text, lettering,
labels, numbers, logos, signatures or watermarks. No fake pixel art, no pixel
grid, no retro DOS aesthetic, no photorealistic CGI sheen. Deliver the standalone
illustration without borders or a mockup.

`human-bases-v2.png` is the selected local follow-up for six canonical human
appearances. The original generated pixels and six native choices are preserved;
its provenance records source hashes, crop rectangles, 72 paired native-headwear
checks and the rejected-original geometry control. It is outside the current
13-sheet release. Isolated lossless output checks pass; native gameplay remains
pending. `human-bases-v1.png` is retained as an unselected
rejected draft. See `docs/graphics-2026-10-31/human-bases/README.md`.

`hair-overlays-v1.png` selects six exact native hair choices in local Illustrated
mode. It is an unchanged built-in ImageGen result, including black, copper-red
and blond identities, two native blue ties and a red topknot tie. Its provenance
records original/tool/prompt hashes and source crops. The shared alpha-mask
compositor preserves native face openings and sprite silhouette, while Classic,
unselected hair/helmets and the 3D native-only renderer retain native art.
The 36 paired body/hair browser checks pass; canonical selection regressions,
lossless output and native gameplay are tracked in
`docs/graphics-2026-10-31/hair/README.md`. This asset is outside the frozen release.
