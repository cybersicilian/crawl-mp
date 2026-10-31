# Illustrated world environments

The environmental extension keeps the illustrated dark-fantasy direction of
the main overhaul: subdued natural colors, broad painted shapes, readable
silhouettes, and the existing 32-pixel native tile geometry.

It is available through the Illustrated texture pack in the user's profile.
Classic remains the default and keeps the original terrain/sprites. See
`texture-packs.md` for account persistence, live switching and acceptance.

## Assets and consumers

`painted-wilds-v1.png` contains six 512-pixel square ground swatches in a 3 by 2
sheet: woodland grass, shaded leaf litter, mud, sand, frosted ice, and rooted
woodland earth. `environment-materials.js` selects all 56 variants of the six
canonical native floor families. It uses the existing `atlas-materials` core,
including original alpha masks and cached output for atlas-only consumers.
Natural ground has no artificial per-cell inset frame.

Actual world backgrounds use `environment-ground.js` and the general
`terrain-surface` core. Each material spans four by four native cells in world
coordinates. Periodic interior crossfades remove wrap discontinuities; native
random tile variants no longer rotate adjacent material patches independently.
Eight-neighbour feathering blends different materials along sides and corners,
with a small consistent variation in feather width. The same mechanism blends
natural ground into the existing three stone floor materials. Native wall lips
and semantic overlays retain their drawing order.

Only already-visible neighbour types participate. Unknown or unseen neighbours
contribute the current cell's material, and unseen cells retain native drawing.
Terrain-type changes invalidate affected known neighbours, including diagonals;
actor-only changes do not expand redraws. The core caches at most 512 composed
32-pixel cells (about 2 MiB of pixel data) and has no idle timer.

`woodland-sprites-v1.png` is a genuinely transparent 1448 by 1086 sheet with
twelve 362-pixel cells in four columns and three rows. The generated output
dimensions differ from the requested dimensions; the consumer explicitly uses
the actual file geometry. Both original generated PNGs remain unmodified.
Their adjacent provenance files retain the complete prompts and source hashes.

The twelve sprites are two living woodland trees, ochre and copper autumn
trees, a dead tree, mangrove, petrified tree, blue tree of woe, dead tree of woe,
mossy boulders, a fungal stump, and a mushroom cluster. The native tree adapter
uses the first nine sprites across 41 existing tree variants. Boulders, stump,
and fungi are prepared props; their creation does not introduce placement or
change world state. Demonic trees and other special features retain their art.

`environment-art.js` owns sheet geometry, labels, and explicit native opt-ins.
The general `atlas-sprites` core knows only source rectangles and RGBA images.
It finds opaque bounds within each sprite cell, scales proportionally, anchors
at the existing tile bottom, optionally mirrors, and clips to the existing
atlas rectangle. A restrained dark contour and modest brightness/contrast
adjustment separate foreground trees from the quieter ground. It preserves
native offsets, drawing geometry, and every unconfigured pixel. Invalid,
missing, or unreadable sheets retain native art.
Unlike ground materials, new sprites intentionally replace the original
silhouette alpha inside the selected tree rectangles.

The game template loads both sheets with the existing image readiness system.
Late image loads invalidate the renderer through the existing art-ready event.
No idle timer, world-generation rule, collision change, input action, or external
runtime image service is added.

## Validation boundary

Focused tests verify complete family selection, source rectangle geometry,
sheet bounds, and exclusions. The controlled browser case executes actual
native atlas and texture drawing modules, compares all unconfigured pixels,
checks floor alpha, cache reuse, real transparent surroundings, near-opaque
sprite interiors, invalid-sheet fallback, shared transition edges, preserved
material centres, periodic coordinates, bounded caches and unseen-neighbour
invariance. It renders before/after environment plates through the native
background layer and native-size sprite previews.
Browser execution and its visual review are required before claiming a pass.

Native gameplay integration and production deployment remain separate checks.
The previous art packet and its historical proof remain immutable. This
extension must be applied as a successor delta, preserving unrelated changes,
and reviewed in a representative native environment before release.
