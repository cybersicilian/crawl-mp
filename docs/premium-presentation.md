# Premium presentation

Live status: account graphics settings shipped on 2026-10-22. Classic remains
the default after the requested 2026-10-21 rollback. Enhancements now require a
personal choice through the Graphics settings page or in-game dialog, with
Classic, Balanced, Premium and individual effect controls. Preferences save to
the authenticated account and update its other browsers and open games.
See `account-graphics-settings.md` and
`deployment-2026-10-22-account-graphics.md`. The earlier global experiment and
its standalone demos are historical; do not restore a global Premium default.

Premium preserves native sprite art, tile geometry, texture-pack choice,
and input timing. Graphics settings apply immediately and save automatically.

Premium adds warm torch and lava bounce, cool fountain light, shadows at visible
wall/floor junctions, restrained panel relief, and 120 ms interface transitions.
The second pass adds connected wall lips, subtle stone seams, feathered transitions
between native ground materials, wet banks, shoreline foam, depth transitions,
world-space water currents and moving molten seams beneath lava crust. Small
torch embers, fountain droplets, water ripples and lava bubbles animate above the
terrain. Native traversal and combat feedback remain the existing mechanisms.
Native positions update immediately; presentation never delays input.

The third pass applies directional light to native floor and opaque wall pixels.
`surface-lighting.js` derives a restrained relief field from filtered texture luminance,
then combines ambient, coloured diffuse and wet specular response. This is an
approximation of material relief, not authored normal maps or a 3D renderer.
`premium-terrain.js` samples the existing native atlas renderer into small CPU
canvases, preserving texture-pack transforms and alpha. Source and shaded-tile
caches are bounded to 192 source tiles and 384 shaded tiles; the main game canvas is never read back.
Decals, creatures, item sprites, clouds and targeting still render afterward.

`premium-light-field.js` shares the occlusion field between tile relighting and
the low-intensity ambient bloom. Visible wall faces receive light and block
receivers behind them. A five-cell viewport margin includes currently visible
offscreen emitters, and source/topology changes invalidate affected tile light.
Classic does not schedule these additional terrain invalidations.

The fourth pass supplies water normals from the moving wave height field, using
a one-pixel world-space sampling halo to keep derivatives continuous across tile
edges and the wrapped noise domain. Highlights follow the surface slope rather
than painted colour or foam. The reusable surface shader also accepts explicit
normal maps; native stone retains its albedo-derived relief.

The fifth pass replaces stepped source energy with continuous world-anchored
variation from `light-emission.js`. A nine-sample receiver field and the shared
`light-field-sampling.js` soften occlusion and range boundaries. Unknown cells,
walls and diagonal corners still block light. `light-map-paint.js` caches smooth
8px-per-tile irradiance maps and composites source variation with a restrained
screen blend. Light motion does not dirty native terrain or create material-cache
brightness variants. Ordinary actor updates retain geometry and light maps;
only particle occupancy changes. Wall-base contact shadows are shorter and the
repeated per-tile water glints are removed. Source animation options, reduced
motion, hidden tabs, Classic and lifecycle shutdown retain their gates.

Premium walking uses confirmed adjacent positions. The reusable `sprite-motion`
core produces interruptible 170ms glides with a small foot lift and landing
settle; rapid updates retarget the displayed pose rather than queueing. Initial
snapshots, identity changes, removed actors and longer jumps do not walk.
`sprite-motion-layer.js` captures native actor paint calls and restores native
painting before removing the transient sprite. Dolls, equipment, mcache and
both submerged alpha passes retain their native rendering. The removable
actor-painter hook keeps status icons, cursors and terrain in their native pass.

`premium-movement.js` adapts visible native monster IDs and party snapshots.
Both ends of each step must stay visible. Clouds, marked targets, cursors,
native flashes and unknown diagonal corners suppress walking presentation.
Overlays clip to currently visible cells, follow camera and scale, and cannot
capture input. At most 24 poses are retained. The existing `map-effect-layer`
hosts `footstep-paint.js`: dust on dry ground, ripples and droplets in water,
warm sparks in lava. Flying actors do not produce ground responses. Reduced
motion, Classic, disabled native realtime animation, disconnect, floor changes,
hidden or disconnected views, and cleanup cancel transient work. Long native
traversal and Shell Dash rolling remain their existing mechanisms.

`liquid-field.js` supplies periodic advected multi-scale noise for the CPU pixel
shader: fine water caustics and currents, irregular lava crust and hot channels.
The native renderer supplies one frame timestamp for every tile in a paint,
preventing a phase boundary from opening a seam halfway through a liquid pool.
Water cycles over 51.2 seconds and lava over 102.4 seconds, with static phases
under reduced motion. Rising lava sparks, small bubbles and faint wisps remain
bounded and clipped away from occupied or unknown cells.

The seventh pass adds an optional WebGL liquid backend. `shader-atlas.js` is a
reusable offscreen GLSL adapter with context-loss recovery. `liquid-shader.js`
renders water and lava into a single 256×512 atlas, using a shared deterministic
noise texture. There is one atlas copy per phase, rather than a GPU readback per
tile. The CPU shader remains the fallback when WebGL is unavailable or lost.
Water adds narrow wave crests; molten lava adds hotter fissure edges. Existing
banks, visibility, native cadence, reduced motion and occluded lighting remain
the consumer's responsibility. The browser check compares GPU and CPU pixels,
periodic boundaries, opacity, disabled WebGL and forced context recovery.

`material-response.js` declares relief, roughness and reflectance independently
of native tile IDs. Brick, stone and moss stay matte; metal and crystal have
tighter highlights. Wood has a softer response available to consumers. The
native terrain adapter maps masonry, metal and crystal wall families without
replacing their artwork. These are approximate pixel material responses, not
authored physically based assets or ray tracing.

`effect-shading.js` is a separate native-sprite shader for vapour and energy.
Smoke drifts upward, mist moves more slowly and poison fumes retain denser
coverage. Moving density and pigment use the native sprite as their source;
nearby visible lights tint clouds using the same occlusion field as terrain.
Fire, frost, electricity and physical projectiles get distinct emission and
two-pixel halos around their native core. Effects appear only while the native
cloud or spell overlay exists. No trajectory, impact, duration or damage is
invented. Oversized sprites keep native rendering and overlap bookkeeping.

`premium-effect-model.js` maps native IDs to these reusable profiles, while
`premium-effects.js` supplies bounded original/frame caches (96/192 entries),
native atlas sampling and visibility/preference gates. A removable effect-painter
hook preserves the native cloud front/back alpha clips and places spell overlays
before flashes and targeting. The native animation loop also refreshes Premium
clouds and spell overlays on ordinary floors, without animating a disabled water
background. Classic restores native effect drawing. Reduced motion keeps static
materials and cancels supplementary animation; no separate effect timer is added.

The ninth pass adds reusable native-pixel material fields. `vapour-field.js`
advects two density layers inside the native cloud footprint, with internal
shade and edge scattering from occlusion-filtered lights. Smoke, mist and fumes
have separate spread, density and flow settings. Fire keeps its dedicated flame
path and native front/back cloud clips remain authoritative.

`wall-surface.js` prepares broad masonry relief, recessed mortar, brushed-metal
roughness, and world-space crystal facets. The surface shader accepts optional
per-pixel cavity and roughness maps alongside supplied normals. Crystal glints
depend on known lights and stop with reduced motion or disabled misc animation.
The native pack supplies pigment and alpha; repeated crystal frames soften into
facets. This is a CPU material shader, separate from the optional GLSL liquids.

The removable `addSurfacePainter` hook replaces wall art at its native draw
position. Walls after `DNGN_FIRST_TRANSPARENT` are eligible too: the native floor
and floor overlays are painted first, the shaded wall is composited once, and
blood and targeting stay above it. Unsupported or oversized art falls back to
the native path. Raised edges now follow exposed contours instead of outlining
each connected wall cell.

`terrain-blend.js` mixes native floor sources using shared world-space weights
over eight neighbors, including diagonal corners. Sand boundaries meander and
feather on both sides; ordinary floor variations also join softly without an
extra tile outline. Unknown tiles, walls, fluids and features supply no blend
pixels. A one-pixel halo supplies continuous boundary normals. The eight-tile
field period and coordinate-aware keys keep the effect stable while panning.
Native tile changes invalidate the neighboring blend footprints. Original,
prepared and shaded terrain caches are bounded at 256, 384 and 512 entries.

The preview includes live smoke, crystal and sand closeups. Its material checks
cover cross-edge and corner continuity, unknown-neighbor exclusion, opacity,
native-source immutability, facet light response, transparency draw order,
Classic restoration and reduced motion. These remain local fixture results.

Green, blue, red and other crystal variants derive facet and edge colours from
their native pigment. Native green crystal remains opaque, as declared by
`FFT_OPAQUE` in `feature-data.h`; clear rock and clear stone are separate native
families. Clear panes get a low-roughness glass response and preserve every
native alpha value. Their floor and floor overlays remain visible beneath them.
The geometry core accepts an optional scalar transmission independent of solid
collision: clear walls pass .82 of visual light and translucent stone .58, with
weaker contact shadows. A crossed cell absorbs once despite ray supersampling.
Unknown cells still block, and a change between opaque and translucent material
invalidates the shared field. This is approximate visual transmission, without
changes to native visibility, collision or targeting.

The tenth pass adds restrained terrain refraction and reflections in transparent
walls. `transparent-surface.js` samples the supplied native floor underlay with a
subpixel displacement, then composites the native wall once. It never samples the
game canvas, creatures, items or targeting. The native alpha, local visibility and
transmission bound the effect. Crystal highlights now follow actual known light
directions, facet normals, roughness and source flicker; steady sources remain
steady. This remains an approximate material response rather than scene reflection.

`aura-distortion.js` supplies radial travelling waves for soft magical circles;
umbra waves travel inward. `pixel-sampling.js` provides premultiplied bilinear
sampling and a small interpolated displacement grid. The DCSS region adapter
builds a one-pixel halo from known terrain frames, allowing motion across tile
edges without reading actors or unknown cells. Distortion is bounded below one
native pixel, fades at the centre and perimeter, and shares the existing 10 Hz
supplementary cadence. A bounded cache avoids repeated terrain work. Reduced
motion freezes the decorative colour field and skips displacement entirely.

The eighth pass adds visible source reflections, emissive bloom, real flame
silhouette motion, shallow wall depth, softer masks and connected area fields.
`flame-field.js` produces advected, curling flame density and a hot core palette.
`emissive-surface.js` extracts bright pixels into a premultiplied emission buffer,
then applies two bounded separable blur kernels. `emissive-paint.js` paints these
isolated halos, flame cores and wave-broken source reflections. A dedicated
screen-blended radiance canvas adds brightness without blurring the game artwork.
Fire clouds and luminous spell overlays supply native-lived light sources; the
normal visibility and wall occlusion field controls their illumination. Physical
arrows keep their native pigment and direction and do not become light sources.

`surface-reflections.js` models coloured reflections of visible emitters on water.
World-space wave distortion, roughness, broken glints and source falloff spread
reflections along the surface. This is a planar light-source approximation rather
than a mirrored copy of the scene or ray-traced reflection. Source and reflection
buffers are bounded to 96 entries each; soft flame halos can reuse adjacent frames.

Cloud colour and alpha now advect together through a premultiplied bilinear sample,
so silhouettes billow within their native cell. Supplementary cloud and area motion
use the native animation loop at 10 Hz in Premium. Native background animation
still advances at 4 Hz. Classic and reduced motion restore the lower cadence;
hidden pages skip supplementary motion, and cleanup, pre-init and disconnect stop
the animation interval. `depth-shading.js` adds raised wall-face cues and short
directional floor shadows before actors and decals, preserving the aligned grid.

Light receivers share conservative boundary samples. Occlusion masks reach zero
at blocked or unknown neighbours, so material light and atmospheric light approach
darkness continuously. `visibility-feather.js` adds an inward visibility fade and
erases radiance near unknown boundaries. It does not draw into unknown cells or
mistake the viewport edge for fog when visible geometry continues offscreen.

`region-field.js` groups native affected cells into components. The DCSS region
model maps halo, umbra, silence, sanctuary, blasphemy, orb glow, quad glow,
disjunction, heat aura and target overlays to declarative styles. Auras and umbras
use softly fading circles fitted to component area and centre. These circles are
a visual approximation of the native area, clipped to known visibility. Exact
target, multi-target and out-of-range previews retain their native cell masks and
holes, with shared union contours instead of repeated tile borders. Friendly,
neutral, threat and summoner markers retain their native semantic art.
`premium-regions.js` paints fields beneath actors and target cursors, invalidates
decorative fringes when native areas change, and obeys Classic and reduced motion.

Shell Dash has dedicated 32px native GUI art, with an olive folded shell, motion
streaks and impact flash. Its SVG source lives beside the generated PNG in
`rltiles/gui/abilities`. `webserver/util/generate-shell-dash.cjs` rasterizes it and
runs the existing tile generator under the host gate, then checks that previous
GUI symbols and pixels remain unchanged. The symbol is appended to `dc-gui.txt`
to preserve existing indices. Native `tileidx_ability` and shared browser
`power-art` both select it. An exact-name compatibility adapter replaces the old
Jump metadata for Shell Dash on older servers; other native power art is unchanged.
The native mapping needs a future engine rebuild; generated client art is ready locally.
For an installed atlas without that symbol, `shell-dash-art.js` supplies the same
dedicated 32px artwork as an isolated embedded image. The browser uses this only
when the native symbol is absent, preserving all installed native GUI indices.

The graphics release is prepared against the installed production atlas and
catalogue. Thin release adapters omit unrelated local environment/HUD changes;
the reusable lighting, material, particle and region cores are identical. The
native engine, gameplay data, generated tile atlases and save format are retained.
The renderer also creates its bounded viewport when an older server template
places the dungeon canvas directly in the column. This keeps overlays, zoom and
pointer coordinates aligned without replacing the surrounding game template.

`tile-lighting.js` is a reusable geometry core: a consumer supplies a viewport,
visible cells, opaque cells, and declarative emitters. It bounds emitter count,
normalizes dense source groups, and blocks rays through walls, unknown cells,
and diagonal corners. `tile-lighting-paint.js` supplies Canvas painting.
`premium-dungeon.js` is the DCSS adapter for native terrain IDs, lifecycle,
visibility, and renderer coordinates. It does not change engine rules or tile IDs.

`terrain-topology.js` derives visible cardinal boundary masks using the existing
`tile-edges` primitive. `terrain-finish.js` draws exposed wall and fluid borders;
`terrain-blend.js` supplies native floor transitions. `fluid-surface.js` creates pixel-snapped 32px water
and lava surfaces; its cache is bounded to 192 tiles and anchored in world space,
so panning never restarts the pattern. `tile-atmosphere.js` clips a maximum of 32
small emitters away from occupied or semantically marked cells.

`shoreline-paint.js` adds world-anchored pixel banks from declarative material
profiles. Lava gets an irregular cooled-rock rim, a broken inner ember seam and
scorched adjacent ground. Water gets a wet stone/silt lip and broken pale rim.
Both sides sample the same boundary coordinates, with an eight-tile cache
period. Borders appear only against a known different material, remain inside
their native tile, and do not split connected pools. Hot ground edges and wet
banks have separate topology masks; dry material blends retain their world seed.

The native `cell-renderer-layers` offers a removable terrain-painter hook after
background art and before native blood, decals, actors, clouds and targeting.
`premium-terrain.js` uses this hook, while `premium-terrain-model.js` maps native
terrain IDs, fluid depth, murky water and semantic exclusions. These are the
DCSS-specific adapters; the topology, fluids and finish painters are reusable.
Features, submerged mangroves and unsupported material families retain native
art. The native fluid animation cadence drives surface updates; no extra world
simulation or fluid travel rules are introduced. Classic triggers a complete
viewport repaint, restoring native terrain pixels immediately.

Light is clipped to currently visible receivers. Remembered and unseen cells
receive no effects. Camera, zoom, map changes, disconnect, and cleanup invalidate
the overlay; map and glyph views suppress it. The overlay cannot capture input.
Geometry is cached between ambient frames, sources are capped at 24, and ambient
motion is limited to ten frames per second. Hidden tabs stop all overlay work.
Reduced motion and disabled native realtime animation preserve static light and
stop the ambient timer. Forced-colour mode hides the overlay.

Focused checks: `node --test crawl-ref/source/webserver/tests/tile-lighting.test.cjs`.
Terrain checks: `node --test crawl-ref/source/webserver/tests/premium-terrain.test.cjs`.
Surface checks: `node --test crawl-ref/source/webserver/tests/surface-lighting.test.cjs`.
The browser fixture uses real unmodified native atlases and controlled map state;
its screenshots are presentation evidence, not native gameplay or deployment.
Its walking and wading controls exercise confirmed map/party updates, native
sprite capture, logical-position immediacy, sprite restoration and water effects.
The projectile control sends a controlled sequence of native overlay positions;
it does not cast an engine spell or infer a path in the production adapter.
Motion checks: `node --test crawl-ref/source/webserver/tests/sprite-motion.test.cjs`.
Graphics checks: `node --test crawl-ref/source/webserver/tests/premium-graphics.test.cjs`.
Material checks: `node --test crawl-ref/source/webserver/tests/premium-materials.test.cjs`.
Radiance and region checks: `node --test crawl-ref/source/webserver/tests/premium-radiance.test.cjs`.
