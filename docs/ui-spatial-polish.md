# UI hierarchy, spacing and menu completion

This pass applies one spatial hierarchy to the tavern, party setup, Saved,
Friends, Chronicle, archive pages, Stats, shared character folios and native
in-game menus. It preserves existing routes, engine commands and contextual
state. The game retains its dark brass HUD, native pixel art and parchment
reading surfaces.

## Shared mechanisms

`static/tabletop/tokens.css` defines a reusable 4px spacing scale, bounded page
and panel gutters, and page/section/entry heading sizes. `layout-rhythm.css`
applies those primitives to existing application surfaces. Headings and panels
fit their content, nested spacing is smaller than section spacing, and fields
on folios use the same light material. The Play preset-party grid can shrink
to a narrow viewport without expanding its sibling rows.

`game_data/static/styles/menu-polish.css` supplies the native popup shell,
reading rhythm, responsive constraints, button states and selection strip.
Fixed chrome stays outside the list scroll region. The viewport uses dynamic
height units so short windows still expose navigation and completion controls.
Existing structured spell/ability/shop adapters retain their native fields.
The shell also contains the older SimpleBar geometry: browser scrollbars are
hidden with CSS, custom tracks retain an internal reading gutter, and text
width is measured inside that gutter rather than a negative outer margin.
This integration stays in the presentation adapter; the vendor library is
unchanged. `quickbar.css` explicitly removes the closed action tray from layout
and bounds its initial width to the viewport before JavaScript placement.
The map/log/loot footer uses viewport-bounded tracks on narrow screens instead
of fixed minima wider than the window.

`menu-selection-controls.js` reads native flags and selected quantities. It
shows selected units/stacks and sends one native Enter command from Confirm
selection. It does not select items, calculate prices or perform game effects.
Chunked menus explicitly qualify incomplete counts; unseen entries are never
treated as zero. Single-select and quiet-select menus retain their existing
behavior, and spectators cannot confirm a selection.

`menu-presentation.js` separates recognized native capacity/help suffixes from
the title. Capacity remains visible and Help sends the existing underscore
command. Unrecognized titles keep their native text. Native row quantities,
inventory categories and keyboard commands remain authoritative.

`ui.js` restores a nested panel's originating control after revealing the
previous panel. It prefers a still-connected initiating control over the focus
trap's default Close button, and preserves native action restoration when
controls have been replaced. A stale fade callback cannot focus beneath a newer
popup. The initial-focus callback supports the bundled older focus-trap
library while keeping native command focus on open.
Reduced-motion preferences disable the popup fade. These are shared popup
behaviors, independent of inventory/spell rules.

## Verification

Focused browser suites cover selected quantities, chunked loading, empty/quiet
selection, spectator state, exact command routing, all emitted popup families,
spell action IDs, keyboard isolation, safe descriptions and search/filter focus.
The disposable native pickup scenario exercises pointer confirmation, partial
stacks, multiple stacks and zero-turn cancellation. Workspace navigation checks
exercise retained party/filter state, direct resume, live search, and archive
return paths. Fresh spatial acceptance checks the public template routes,
registration, narrow/short windows, actual native menus and nested reading.

Use `ui-polish-native.cjs` with a disposable localhost server. On macOS keep the
runtime path short enough for the native Unix socket, for example a fresh
`/tmp/dcp-<unique>` directory. Keep account/save data separate from human games.
The shared QA helper also sets explicit disposable native defaults before game
mode discovery. This prevents helper processes from reading an unbound init
file or reusing description databases from the native build directory. Actual
expedition processes retain their separate record/save directory. Frozen QA
fixtures declare an empty native init.txt input: on macOS this prevents the
preview helper's compatibility symlink from modifying the binary directory.
The run verifies the complete source file set and hashes before and after
execution.
Run browser/native batches only under the shared host-heavy reservation.

These are local validation surfaces. Production deployment, hosted CI, formal
accessibility compliance and exhaustive native content coverage are separate
claims. The design baseline and current receipts are retained in the task's
menu-polish artifact folder and the established DCSS design archive.

## First animation pass

`hero-feedback-model.js` compares small, copied projections of consecutive
native party snapshots. Adjacent moves emit a brief footfall; net HP changes
emit signed HP cues; increased experience levels emit a gold burst. Initial
snapshots, joins, control switches, floor/identity changes and teleports do not
invent actions. HP capacity changes are not presented as damage or healing.

`map-effect-layer.js` is an independently usable presentation layer. It takes
an injected renderer, visibility predicate and painter, follows the renderer's
camera/backing-pixel geometry, bounds concurrent cues, and removes its canvas
and frame callback when idle. Each cue and its trail origin must remain visible.
It does not capture input or change native state. The hero adapter supplies
colors, timing, pixel dust, healing rings, level sparks and text. Existing
traversal/shell animations keep their own native event contracts.

Party-card highlights and a fading health echo accompany HP changes. Actual
fill, numeric labels, poison forecasts, capacity and accessibility values
update immediately. Forecast/capacity changes suppress the echo. Rebuilding
cards cancels detached card animations; floor changes, game cleanup, hidden
documents and reduced-motion changes clear transient work. Reduced motion
suppresses this pass's effects without changing gameplay.

Focused checks: `node --test tests/hero-feedback.test.cjs` covers state identity,
native deltas, bounds, visibility, camera scaling and lifecycle. Under the shared
host-heavy reservation, `node tests/hero-feedback-browser.cjs` checks actual
canvas paint, DOM health feedback, click-through, reduced motion and narrow
geometry. Set `HERO_FEEDBACK_PROOF_DIR` to retain its preview and JSON evidence.
That fixture is controlled browser presentation proof, not native gameplay or
production acceptance.

## Encounter animation pass

`encounter-feedback-model.js` projects native map changes into short impact
cues. Increased native MDAM wound bands trigger a crescent and a few sparks;
they never imply an exact damage amount or a kill. Spell-flash transitions
produce sparks using the existing `view_data` palette. Initial cells, new
identities, returning visibility and cleared maps establish fresh baselines.
Identity updates apply as one batch so actor movement works in either cell
order. A bounded snapshot cache prevents growth across large maps.

`view_data` publishes cursor changes after updating the native cursor, and
`map_knowledge` publishes explicit map clears. The encounter adapter consumes
these events, reuses the transient map layer, and adds a brief four-corner
settling effect only in targeting mode. Cursor removal cancels only that cue;
the native cursor and command routing remain authoritative. Ordinary mouse
hover stays quiet. The new effects respect the same visibility, camera,
reduced-motion, background-tab, connection and cleanup boundaries.

Focused checks are `tests/encounter-feedback.test.cjs`,
`tests/hero-feedback.test.cjs` and `tests/display-frames.cjs`. The controlled
`tests/encounter-feedback-browser.cjs` fixture loads the actual map, flag and
cursor modules, checks three native flash palettes and retains its preview
when `ENCOUNTER_FEEDBACK_PROOF_DIR` is set. Run browser checks under the shared
host-heavy reservation. These checks establish local presentation behavior;
fresh native gameplay and production deployment are separate acceptance steps.
