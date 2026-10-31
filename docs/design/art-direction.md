# Illustrated dark-fantasy overhaul

The user selected illustrated dark fantasy on 20 October 2026. The full goal is
to improve the game's aesthetic, art style, visual polish and cohesion. This is
broader than the earlier animation work and remains active until current native
and browser evidence supports the complete visual system.

## System map

- `static/tabletop/art-direction-tokens.css`: semantic colors, typography and
  materials shared across entry, tavern, roster, archives and the game.
- `art-direction-lobby.css` and `art-direction-library.css`: product adapters
  for non-play surfaces, loaded through `art-direction.css` after legacy styles.
- `game_data/static/styles/art-direction-game.css`: matte binding around the
  dungeon and native pixel art. Existing geometry and direct controls remain.
- `art-direction-journal.css`: the reading shell for native menus, descriptions
  and contextual reading. Native semantic colors and exact labels remain.
- `static/scripts/image-grade.js`: reusable cached image grading independent of
  native game rules, texture names, product identity and deployment.
- `game_data/static/tile-art-direction.js`: separate terrain, feature and actor
  profiles. GUI/status atlases bypass grading. `cell-renderer-textures.js` uses
  the shared mechanism without changing tile coordinates, overlap or alpha.
- `static/scripts/atlas-materials.js`: reusable cached material compositing with
  original alpha masks, optional inset borders, quarter turns and shading.
- `static/scripts/tile-edges.js`: reusable cardinal boundary masks and inset,
  pixel-snapped edge painting, independent of native game state.
- `game_data/static/terrain-materials.js`: explicit canonical native families
  select six painted floor/wall materials. No guessed index ranges.
- `terrain-edges.js`: a thin native adapter for connected wall lips. It uses
  already-visible map knowledge and redraws neighbors on terrain changes.

## Visual direction

Soot-dark frames, bone paper, matte antique brass, restrained teal magic, and
painterly engraved environment illustrations. Keep the Pebble Broth bowl mark,
crisp native silhouettes and meaning carried by native health, poison, threat,
status and targeting colors. Remove glossy chrome and unrelated surface styles
as their consumers move to this system. Frequent actions remain direct.

`static/tabletop/assets/expedition-vault.png` is locally served production art,
generated with the built-in image generation tool. Its adjacent provenance JSON
records the complete prompt, output hash and selected direction. No runtime
image API or external font dependency is introduced.

`painted-stone.png` adds six coordinated material swatches: limestone, moss and
slate floors; limestone, moss and charcoal masonry. Fifty-two floor variants and
67 wall variants use these materials. Insets make individual cells readable;
connected wall lips strengthen the floor/wall boundary. Blood, targeting and
native overlays paint afterward. Unconfigured terrain keeps its original art
under the conservative grade. Unseen/error tiles and GUI/status pixels retain
their exact native pixels. Missing artwork falls back to the native atlas.

The generic mechanisms have no product names, native flags or external service
dependency. Native tile families, visibility and palette choices remain in the
small adapters. The material sheet layout is an explicit 1536 x 1024, 3 x 2
contract; new sheets can supply different rectangles without changing the core.

## Evidence and remaining work

The complete baseline brief is in the task's `art-overhaul/brief.html` and the
established design archive at `__DESIGN/dcss/2026-10-20-art-direction-overhaul`.
Historical screenshots are labeled as historical. A source/style foundation,
generated illustration and unit checks alone do not establish the full goal.

Nine focused checks pass for alpha/geometry, semantic-region retention, color
distinction, fallback, caching/reload, all 16 edge masks, pixel snapping, native
visibility, neighbor invalidation and hazard exclusions. Frame scheduling checks
also pass. All changed web code files remain below 600 lines.

The first interface candidate passed 67 local native UI layouts, exact focus
return and zero-turn reading. A separate four-hero native run covered five
window sizes, control switching, inventory, reduced motion, real loading and
connection interruption. These used the existing local binary and precede the
new painted materials and connected borders; they do not prove the latest
combined native feature candidate or production rendering.

The final material/border candidate passed a controlled browser comparison
through the real native background/texture modules and original atlases. Every
pixel's alpha stays within one rounding unit, dimensions are unchanged, all
unconfigured pixels are invariant under the material compositor, and unseen and
UI/status pixels are exact. The plate covers stone, moss, walls, liquids,
doors, stairs, altars, actors, clouds, targeting and a labeled remembered veil.
It is controlled renderer evidence, not a native gameplay capture.

Initial floor/wall API calls took about 29 ms combined in the final controlled
run (observations across candidates ranged 28-47 ms). One thousand cached
requests per atlas took at most 0.9 ms in these runs. These are local call times,
not GPU completion measurements or a cross-device performance guarantee. No
timer or idle animation was added by the material/border mechanisms.

Acceptance includes welcome, tavern, roster, a populated dungeon and party HUD,
inventory, descriptions, spells, tooltips, session controls, archives, stats,
loading/error/empty states, reduced motion, focus and semantic state legibility.
The shared heavy-host reservation applies to all browser/native capture and
packaging phases. Preserve other owners' reservations and source changes.

No production activation is part of the current evidence. Native feature work
owned by other chats is not validated by these visual checks.

The full overhaul goal remains active for fresh integration of the latest
bordered materials into a populated native session and final visual acceptance.
The shared coordinator currently reserves combined native world execution for
its remote operator; this task's new heavy phases were controlled browser-only
checks and did not launch or compile a native world after that restriction.

The subsequent world/environment expansion is documented in
`environment-art.md`. It adds natural ground materials and transparent tree
sprites through the same atlas pipeline. Its evidence is recorded separately
from this earlier stone-material acceptance.
