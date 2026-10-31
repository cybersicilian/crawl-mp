# Tactical planning and smooth regional play

The engine owns action cost, collision, visibility, prompts and regional time.
The browser may describe an intention, but never advances a hero optimistically.
One native command is in flight at a time. Plans are bounded, session-local and
discarded on disconnect, control/floor changes or an unexpected movement result.
Each command binds an expected hero and a plan id. The native return to command
input echoes that id and the completed turn count. Personal-view refresh packets
cannot acknowledge a plan; the next step also waits for its matching snapshot.

## System map

| Mechanism | Authority | Consumer |
| --- | --- | --- |
| Visible enemy energy and speed | Native personal view | Timing rail attached to the player HUD's left edge |
| Region credit/debt | Native region and hero clocks | Shared timing meter in the same rail |
| Planned route | Known map cells, eight-way path search | Dashed map-space line and ordered action chips |
| Action execution | Existing native keys and power actions | One step per acknowledged turn; prompts retain control |
| Dirty map chunks | Browser map deltas and camera geometry | Clip and repaint changed chunks in original depth order |
| Independent simulation regions | Native proximity/threat connectivity | Distant heroes advance without a peer's action |

Use Plan to collect movement, waits and powers, then Go to execute. Shift-click
adds a waypoint directly. Each queued action can be removed; Clear and Escape
stop the remainder. Targeted powers pause at native targeting. Damage or a new
threat pauses a running route for review. The line is a plan over known terrain,
not a guarantee that doors, creatures or hazards will remain passable.

Enemy readiness is native energy toward the engine's action threshold, with an
estimated aut delay from current speed. Native energy gain is randomized; this
is not a promised attack order. Only personally visible enemies have live health
and action-energy readings. Native invisible contacts with a recorded location
have a separate last-known banner; both bars are unknown and the reticle marks
the recorded location. Ordinary out-of-sight monsters and positionless warnings
never gain a banner or live telemetry.
Older binaries can still show the shared region meter without inventing energy.

Each banner uses native map artwork, native injury bands and readiness. Hover or
keyboard focus places the dungeon cursor; click, right-click or the context-menu
key opens the existing tile actions. A moving/replaced contact, control change,
floor change or loss of knowledge invalidates its menu. The fixed lane sits
outside the Zot thermometer; narrow layouts flow inside the roster's padded
content. Both layouts cap their scrollable height at the viewport edge.

The nearby roster has independent Enemies, Allies and Neutrals disclosures.
Visible map attitudes supply allies and neutrals omitted by older initiative
feeds; noncombatants excluded by the native nearby-list presentation (including
plants) belong under Neutrals. Party projections remain represented by hero
cards. Missing health, timing and status readings remain explicitly unknown.
Last-known invisible contacts never borrow facts from a visible map occupant.

Identical names, types, perceptions and displayed readings share an expandable
stack. The count button exposes each individual target, while differences in
injury, conditions or readiness keep cards separate. Neutrals start collapsed;
disclosure choices survive state updates. The reusable `collapsible-roster.js`
component owns keyed disclosures and focus preservation; `creature-roster-model.js`
adapts the native map and initiative contracts. No engine/save format changes
are required. Closed groups release their cards, repeated snapshots skip card
projection, and map updates avoid repainting the replaced legacy monster rows.
Unknown-location warnings still appear in that legacy list.

Visible monster conditions come from the same native flags and descriptions as
inspection. Typed metadata classifies buffs and debuffs from the affected
creature's perspective; uncertain conditions remain neutral. Banners share the
player effect projection, glyph resolver and badge primitive, including tooltips
and harmful-effect marks. They show all reported effects without guessed timers.
Live status icons disappear for last-known invisible contacts, and native effect
removal updates the same banner without replacing its keyboard focus.

Invisible hints are captured per native observer and use the existing 15-turn
memory lifetime in the entity's regional clock. Projection copies that observer's
knowledge without mutating native safety state. Per-observer routing is runtime
state, like the personal map cache: old save records retain their byte layout and
are not assigned to a different hero after loading. A fresh native location hint
restores the banner after a floor reload; ordinary reconnect keeps runtime hints.

Rendering chunks and simulation regions have different jobs. Rendering uses
small fixed grid rectangles and repaints their overlap halo, clipped once, so
translucent sprites do not accumulate. Camera/zoom/size changes repaint the full
view. Simulation keeps the existing dynamic connected regions (18-tile merge,
22-tile split, shared-threat bridges). A fixed spatial grid must not split a
fight simply because its participants cross a tile boundary.

At an equal-distance region boundary, each monster/cloud belongs to one region
using a stable region-id tie break. Otherwise both regions could advance the
same entity. Regional recovery remains native; browser/server animation pacing
must not impose another player's cooldown on an independent region.

Native multiplayer projection retains a filtered knowledge grid and tile memory
for each recipient's floor. Fixed-size owning grids exchange storage
in constant time; ordinary refreshes update previous/current personal LOS, native
dirty terrain and a one-cell feature halo. All sight checks still use native LOS,
including opacity changes and Revelation. A scalar terrain journal reconciles
the loaded floor once after package loading or bulk invalidation, while personal
LOS and tile work stay scoped to changed terrain and each hero's sight radius.
A hero's floor change or explicit attachment refresh sends a complete baseline.
An individual view request forces only that hero's baseline. Same-floor full
refreshes preserve an unchanged recipient's camera; fresh attachments still
receive the center required to initialize their view.
Caches and terrain journals are bounded by the party size and occupied floors;
distant heroes never expand one shared LOS rectangle.

The unused multiplayer union-map build and full-floor viewport knowledge copy
are skipped. Personal streams send self-contained replacement cells only when
their rendered contents change. Replacement removes old monsters, clouds and
decorations even when a field returns to its default. Sequence numbers identify
native refreshes; `view_work` reports LOS checks, updated cells and emitted cells
for verification. These counters describe projection work, not hosted FPS.

The server accumulates cells by recipient and floor and materializes a complete
reconnect snapshot only on attachment. It retains camera metadata across deltas.
Floor/native-process changes reset that baseline. The browser keeps its existing
dirty rendering chunks; camera changes retain the full redraw needed for sprite
correctness. Simulation region ownership and independent clocks are unchanged.

## Acceptance

Verify ordered queues, cancellation, ownership/floor binding, interrupted routes,
native prompts, reconnect discard, personal enemy state, narrow HUD geometry,
chunk seams/overlapping sprites and deterministic regional ownership. Keep
controlled browser, focused unit, native build and actual two-client gameplay
results separate. No deployment is implied by local source changes.

## Local verification, 19 October 2026

- Isolated WebTiles and Catch2 binaries built with C++17; 17 native regional
  cases passed 164 assertions, including boundary ownership and preserved debt.
- Two separate authenticated clients completed a three-step queued native route
  while the other hero stayed idle. Enemy energy remained personal. Rejoining a
  shared combat region held and resumed the next queued action at native recovery.
- Reconnect discarded planned actions. The final browser run reported no errors.
- Twelve real-game frame comparisons matched clean full repaints with zero stale
  pixels. A controlled Retina seam probe painted 361 of 1,200 cells and matched
  the full redraw exactly; desktop/narrow rails and invisible warnings passed.
- Fourteen focused server pump tests and route, queue, transport, camera and
  frame contracts passed. All scoped web files are at most 538 lines.

Evidence and the isolated build are in `/tmp/dcss-tactical-work/`; the final
source/binary binding is `request17.json`, with acceptance in `acceptance17.log`.
The original negative runs remain there. Each heavy phase used and released the
shared reservation after its owned browser/server/native processes exited.
The main local executable and hosted service were not replaced.

## Encounter membership candidate, 20 October 2026

The next native candidate replaces distance-based grouping with native sight and
shared creature/cloud dependencies. It preserves hero recovery across joins and
splits, introduces persistent entity ages for cooldown deadlines, and scopes
local markers/environment effects to the advancing region. Named floor-wide
timed systems retain an explicit shared-clock dependency. The existing planner,
personal perception and region fields remain the integration boundary.

See [Encounter time and fluid multiplayer play](design/encounter-time-and-fluid-play.md)
for the source boundary, conservative exceptions, isolated validation and current
acceptance status. The earlier local verification above remains historical proof
of its own exact build; it does not validate this candidate.
