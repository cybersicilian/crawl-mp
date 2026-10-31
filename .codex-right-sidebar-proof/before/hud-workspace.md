# Inventory, powers, and a configurable HUD

The HUD presents common commands as icons with accessible names and hover cards.
Inventory is pinned to the bottom right; spells and abilities sit above it.
The hero summary, party roster, minimap, and nearby monsters share a scrolling
region so a large party cannot push the inventory below the window.

An eight-way direction pad stays in the dungeon's bottom-right corner, above the
command dock and log. Each button shows a direction and its Crawl letter key.
Its numpad number appears only while that digit has no quickbar assignment for
the controlled hero; clearing the slot restores the number. Activating a
direction briefly highlights only that button for 180 milliseconds. Pointer and
Enter/Space activation share the same feedback as native letter, numpad and
navigation keys. Repeated input restarts the highlight; menus, targeting, text
editing and unavailable actions do not highlight movement. Feedback uses an
immediate colour change, including with reduced motion enabled.
Clicking sends the native numpad command, so the engine handles movement, bump
attacks, and safety prompts. Physical numpad input remains available with assigned quickbar digits.
Pointer activation returns keyboard input to the dungeon; keyboard activation
of a button consumes Enter or Space once. Turn ownership, downed heroes, menus,
targeting, and spectators use the existing action guards.

`direction-pad.js` adapts the canonical browser key conversion and shared party
action rules. Its placement follows the canvas bounds without changing native
canvas dimensions or pointer coordinates. `tests/direction-pad-native.cjs`
checks the eight engine bindings, browser input, action guards, three viewport
sizes, and an actual native move using a disposable localhost party.
`tests/direction-pad-feedback.cjs` checks compact copy, real browser input,
highlight expiry and repeat timing, action guards, reduced motion and cleanup.

A skull thermometer runs down the left edge of the party pane. It drains toward
Zot's next touch and shows the earliest advancing deadline among living heroes;
hover or keyboard focus gives the exact standard turns, hero, branch, and party
pressure. Paused clocks, Zot immunity, and missing native data have distinct
presentations. Reading the meter never sends an action or spends a turn.

Every party member with `MUT_SHORT_LIFESPAN` adds nine times the ordinary Zot
pressure: 1× with none, 10× with one, 19× with two, 28× with three, and 37× with
four. This changes native deadlines, floor grants, warning thresholds, and clock
consumption for every hero. The saved per-branch clocks retain their original
units, including legacy short-lifespan saves, so gaining or losing the trait
adjusts the existing allowance without resetting it. The meter uses native
`zot_clock` snapshots; `party-doom-model.js` selects the deadline independently
of rendering, while `party-doom.js` maintains a stable, focusable meter.
The sidebar reserves an additional gutter for the meter, preserving the existing
card content width. The native `[zot]` case passes 32 assertions. Browser checks
verify native parties with zero, one, and two short lifespans, turn-free meter
inspection, countdown updates, and layouts at 1440×900, 1280×800, and 1024×768.
Paused, immune, unavailable, and imminent presentations use controlled snapshots.
Local captures and the final browser evidence are under `/tmp/dcss-doom-proof`.

Inventory uses the engine's tile atlas, inventory slots, letters, quantities,
identification, and equipped state. Left-click to equip, unequip, quaff, read,
or evoke through the same `tile_item_use` routine as the native DCSS inventory.
Right-click any item for its native description. Filters for all,
equipped, and unequipped items apply immediately. Opening the full inventory
remains available from its header toolbar and the `i` shortcut.

The powers panel follows the controlled hero and uses the same native
`power_action` contract as the character inspector. Costs, failure rates,
descriptions, targeting, and warnings come from existing game data and handlers.
Unavailable actions remain readable but cannot send an action. A known-empty
power list has an explicit empty state rather than invented abilities.

The layout icon in Session actions (or `Alt+L`) enables handles for hero stats, party,
minimap, powers, inventory, messages, and command dock. Drag the move or resize
handle, or focus it and use arrow keys; Shift plus arrows resizes. Double-click a
handle to return that panel to its default location. Done exits arrangement;
Reset layout restores all default positions. Arrangements persist in browser
local storage and are clamped to the current window on restoration and resize.
The native dungeon canvas keeps its own pixel dimensions and pointer coordinates.

## Mechanisms and boundaries

- `hud-inventory.js` adapts existing authoritative inventory and power snapshots
  into persistent HUD controls, reusing action guards, power cards, and icons.
- `panel-workspace.js` owns bounded viewport geometry, pointer capture, keyboard
  manipulation, storage, and restoration. Its panel registry and toolbar are the
  DCSS adapter; the geometry and input mechanisms have no engine dependency.
- `hud-iconography.js` adapts the shared SVG icon vocabulary without changing
  existing command handlers or native keyboard shortcuts.
- `message-references.js` caches descriptions of encountered creatures and known
  items and powers. The glossary's contextual-entry API is reusable by other
  text surfaces. Native map deltas are decoded before publishing changed cells.
  Existing condition/mechanic glossary entries retain priority.

Creature cards describe recorded encounters and species-average health, not a
current target's health or location. The cache does not query hidden game facts.
The engine advertises native item-use support and validates hero and item identity
before acting. Older engines fall back to inspection. Native menus retain
consequential prompts. Inspection and layout changes consume no game turns.

## Verification

`tests/hud-workspace-native.cjs` runs a disposable localhost party through the HUD
at 1440×900, 1280×800, and 1024×768. It checks native item inspection, direct
consumable use, equipped filters, controlled-hero switching, native power
activation, saved geometry, viewport bounds, floating stats/log reflow, and
keyboard isolation. Encountered-entity tooltips use explicitly controlled map
fixtures through the actual delta decoder and message handler; this is not a
claim of fresh jackal combat. `HUD_LEADER_JOB=Berserker` exercises an innate/divine
ability and `HUD_DPR=2` runs at Retina density.

The isolated runtime is `/tmp/dcss-hud-workspace-qa`, using the freshly rebuilt
native engine `/tmp/dcss-hud-native/source/crawl`. Browser evidence is under
`/tmp/dcss-hud-workspace-proof` and `/tmp/dcss-hud-workspace-ability-proof`.
These are local implementation checks, not deployment or hosted-play evidence.

Final local runs passed at all three sizes, with no JavaScript errors. The
Fighter run verified native equipment toggling, a reduced potion quantity,
and a Magic Dart action. The Retina Berserker run verified equipment toggling
and actual Berserk activation, including the `berserking` status. Dock activation
and lifecycle checks, nested tooltip checks, party-data contracts, and all 15
server gameplay-protocol tests passed. All 17 HUD-related browser code/style/test
files checked are at most 600 lines and JavaScript syntax checks passed.

The verified native executable has SHA-256
`f7061e5d5080e5b49ade78ac0f4b1e58219b6a9a6b9cc21ee7643d0cbd2fcf58`.
Its `tileweb.cc` matches current checkout source with SHA-256
`c1d8fab53a5716ea3c60791868a3998527894bb2c0c8df4546e82869bf94f67b`.
The checkout base is `3688bb28598a1c3f3968b5d3d1b3dffcc3d2c13c`; it contains
other ongoing uncommitted work. The test build clones the existing
`/tmp/dcss-gameplay-native` build and rebuilds its current `tileweb.cc`; this does
not claim every unrelated in-progress native source change was rebuilt.
`/tmp/dcss-hud-workspace-proof/source-manifest.json` records browser source hashes.

The isolated test server on port 8898 uses the verified executable. This task
has not replaced `crawl-ref/source/crawl` or switched/restarted the main local
server. Integration must include a native rebuild plus the browser assets;
without the new native capability, inventory clicks safely open inspection.
No hosted deployment was performed.

## Controlled player card reflow, 17 October 2026

The controlled hero places metadata, health, and the six native stat readings
beside its portrait. Its weapon and inspect/camera/experience rails use the full
card width; active effects and passive traits share a strip beneath the header.
The repeated AC/EV/SH text is hidden only for the controlled hero. Companion
cards retain their compact summary. Equipment shortcuts use the inspector's
canonical `equipment` section, including its inventory, rather than the retired
`inventory` section name that fell back to Character.

`styles/player-card-sections.css` owns the controlled-card placement; `party.js`
places its existing initiative and passive controls in the corresponding rails.
The native stat adapter retains the existing nodes, values, tooltips, and handlers.
Long weapon names wrap; noise and equipment shortcuts can wrap at narrow widths.

`tests/player-card-layout-native.cjs` passed against a fresh disposable game on
the main localhost server at 1440×900, 1280×800, and 1024×768, both with normal
pointer targets and Retina/coarse-pointer targets. The desktop summary above
powers measures 185px at card widths of 335px, 315.8px, and 283px; coarse-pointer
targets increase it to 213px. Inspect, camera, direct equipment access, native
hero switching, retained stat nodes, and zero inspection turns passed. A separate
presentation-only stress case checks long equipment and many effect icons.
Personal-stat, health-bar, and portrait browser regressions and JavaScript syntax
checks passed. Each changed browser code/style/test file is below 600 lines.
Evidence is in `/tmp/dcss-player-card-proof` and
`/tmp/dcss-player-card-touch-proof`. These are local results; no hosted deployment
was performed. Reload the game page to load the changed browser assets.

## Health effects, 17 October 2026

Party HP bars show the native poison forecast as a striped section of current
health, with the projected minimum HP beside the exact current/max values. A
zero projection adds a lethal-poison warning. Burning, berserk, regeneration,
inhibited regeneration, barbs, flaying and Death's Door have distinct bar
treatments; unavailable maximum HP has a separate hatched capacity segment.
Hover or keyboard focus explains every active health effect. Reading a bar
does not send a dungeon command.

`party-status-model.js` shares explicit native-name classification between
portraits and health bars. The health projection computes bounded segments from
snapshot facts; it does not estimate damage for effects without a native
forecast. `tileweb.cc` supplies each hero's `poison_survival` and `real_hp_max`
using the existing engine queries. Status descriptions run in that hero's
`scoped_player_context`, preventing nested queries from leaking the active
hero's effects into a companion. Missing forecast fields preserve HP and effect
cues while leaving projected damage unavailable. Deploy the rebuilt executable
with the browser assets; an already running game must save and resume to use
the new native snapshot fields.

`tests/health-bars.cjs` checks segment bounds, missing facts, status-only updates,
effect expiry, keyboard isolation and focus retention through the actual party
renderer. `tests/health-bars-native.cjs` uses a fresh two-hero expedition on an
isolated localhost server and native wizard durations to verify poison, fire,
full cure and unaffected-companion isolation. The checkout native build and
both checks passed, alongside portrait, personal-stat and initiative regressions.
Evidence is in `/tmp/dcss-health-bars-proof` and `/tmp/dcss-health-native-proof`.

## HUD visual polish, 17 October 2026

`styles/hud-polish.css` layers scoped charcoal/brass material tokens and shared
hover, pressed, selected, disabled and focus treatments over the existing HUD.
`hud-polish.js` is a small presentation adapter that adds canonical native species
medallions to party cards. It does not infer live equipment from those images.
Inventory filters share the heading rail; fixed 42×42 item sockets and compact
party rows preserve working space. Common actions retain their existing handlers.

Fresh native validation passed at 1440×900, 1280×800 and 1024×768, including
Retina density. Compact healthy member rows measure 68–71px; the dock occupies
one 51px row at 1280 and 1440. The current native test supports
`HUD_POLISH_PROOF=1` to check portrait keyboard activation, square slots, density,
and a controlled long-name/harmful-condition presentation case. Native item use,
powers, tooltips, saved layout and recovery checks pass. The dock keyboard and
lifecycle regression passes. Browser code/style/test files touched remain below
600 lines. Local evidence: `/tmp/dcss-bg3-polish/proof` and
`/tmp/dcss-bg3-polish/retina`. This visual pass does not switch the main server
or deploy hosted assets.

## Main local server and dungeon zoom, 17 October 2026

The main server is now running at `http://localhost:8888` through
`start_coop_server.sh`, using the checkout's browser assets and rebuilt native
executable. This supersedes the earlier isolated-runtime status above. The
rebuild includes the current source's equipment-profile serialization fix;
existing accounts and saves were preserved. Server output is in
`crawl-ref/source/webserver/run/main-local.log` and its PID is recorded beside it.
The rebuilt executable has SHA-256
`dbe000c3f514de38f6ae3b1ff7151140e0b4d55859bb1a6c33b406c74a73a875`.

The command dock omits visible category captions and uses a camp icon for
Expedition, retaining accessible names and hover help. The dungeon banner has
zoom out, reset, and zoom in buttons. Mouse-wheel input over the dungeon also
zooms, from 50% to 400%. Zoom is saved in browser local storage. Rendering changes
the native canvas cell geometry rather than applying a CSS transform, so dungeon
hit testing and the HUD's own scale are preserved. Zoom consumes no game time.

`viewport-zoom.js` adapts browser controls and persistence to the renderer's
explicit zoom factor. Existing layout, canvas sizing, and coordinate conversion
remain authoritative; inventory icon rendering is unaffected.

Fresh native workflows passed directly against port 8888 at normal and Retina
density, covering the three HUD sizes, inventory inspection and use, equipment,
Magic Dart, tooltip references, saved layout, keyboard isolation, and icon-only
controls. Zoom checks verified button, keyboard and wheel input, unchanged view
center and game clock, reset, and a correctly located map ping after zooming.
Evidence is in `/tmp/dcss-main-local-proof` and
`/tmp/dcss-main-local-retina-proof`; the dock lifecycle regression also passed.
No hosted deployment was performed.

## HUD clarity and companion density, 17 October 2026

Companion identity and initiative now share the first content row beside the
portrait. Detailed mode follows with metadata, health, equipment, a populated
effect/trait rail, and full-width actions/experience. Compact mode fits the
essential rows beside the portrait; touch layouts stack actions and experience
within that content column. Empty effect rails occupy no space, and action
groups size to their actual buttons. The native personal sheet and inventory
still move to the controlled hero. Stable name-control IDs preserve focus when
health or other card facts cause a rebuild.

The shared icon mapping now uses authored gold coin stacks, a breastplate, a horn,
and a backpack for currency, armour, noise, and carried items. Gold, Floor, and
Runes have explicit tracker labels. Source pixels and the existing license are
preserved; `util/generate-hud-sprites.py --verify` checks the mapping, provenance,
atlas pixels, and content-addressed URL.

Matching fresh native four-hero captures at 1440×900, 1280×800, and 1024×768 show
healthy detailed companions shrinking from 163px to 130px. Desktop compact cards
shrink from 93–95px to 82–84px. These measurements compare the same native starting
builds and display settings; they do not claim every status-heavy card has a fixed
height. Retina/touch layouts also pass without clipping or hidden conditions.

`tests/companion-layout-native.cjs` verifies both density modes, a native hero
switch, inspection/camera access, focus restoration, and controlled long-name,
many-effect, downed, and off-floor presentations. Atlas source/browser pixel,
health/status, shared monster timing, and the full party HUD interaction
regressions pass. The latter covers native action guards, inventory/powers,
saved quickbar slots, layout recovery, tooltips, and reduced motion. All changed
browser code/style/test files remain below 600 lines. Local evidence is under
`/tmp/dcss-companion-layout-proof`, `/tmp/dcss-companion-touch-proof`,
`/tmp/dcss-hud-clarity-full-proof`, and `/tmp/dcss-ui-16px-proof`.
Reload the main local game page to load the browser changes. No hosted deployment
was performed.

## Current-tile pickup tray, 17 October 2026

The bottom-right end of the map/message footer now contains an always-visible
“On this tile” tray. It lists native item artwork and names, including stack
quantities. Click a stack to pick it up; right-click to open its native
description. The `g` button retains native pickup selection and quantities for
multiple stacks. Empty tiles have an explicit empty state; large piles scroll.
The tray follows the controlled hero and keeps keyboard focus on the next stack
after pickup. Touch input receives larger targets and a slightly taller footer.

`floor-items.js` adapts authoritative per-hero `floor_items` snapshots into the
footer. `hud-inventory.js` exposes its existing atlas renderer as `drawTiles`
for reuse. The native `floor_item_action` adapter validates hero, current floor,
position, item index, known name, and quantity against the current visible stack
before calling `pickup_single_item` or `describe_item`. It retains the engine's
inventory limits, pickup history, turn costs, and inspection behavior. Off-floor
or downed heroes have unavailable ground data; stationary items are excluded.
Connection ownership and input-mode guards also apply to floor actions.

The native executable must accompany the browser assets. Existing running games
need saving and resuming, plus a page reload, to use the new snapshot fields.
`tests/floor-items-native.cjs` covers real stack transfers, inspection, stale
requests, companion switching, keyboard activation, the native pickup menu, and
1440×900, 1280×800, and 1024×768 layouts. `tests/floor-items.cjs` supplements it
with controlled large-pile, long-name, spectator, downed, missing-data, and
cleanup/reinitialization cases. Evidence defaults to `/tmp/dcss-floor-items-proof`.

Desktop native validation passed on the dedicated localhost server, using
temporary accounts and a copied executable at `/tmp/dcss-floor-items-qa/crawl`.
Inspection, selected-stack transfers and turn costs, stale-request rejection,
controlled-hero switching, keyboard focus, native pickup menu access, and all
three viewport sizes passed without JavaScript errors. Evidence is under
`/tmp/dcss-floor-items-native-proof`; the same workflow also passed at Retina
density with coarse-pointer targets in `/tmp/dcss-floor-items-touch-proof`.
The controlled browser suite, shared party
data/transport checks, and all 17 gameplay protocol tests also passed. Browser
code/style/test files changed for this feature remain below 600 lines.
This is local validation; no hosted deployment was performed.
