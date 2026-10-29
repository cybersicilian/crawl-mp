# Gameplay HUD structure

The gameplay shell separates controlled-hero context, native dungeon actions,
party coordination and expedition utilities. It preserves native keyboard
commands, action legality, costs and authoritative character facts.

## Layout and reusable mechanisms

`game_data/static/hud-layout.js` measures visible header, action dock, input helper
and ping notice heights. `game.js` reserves those pixels plus readable message
space before asking the native renderer to fit its grid. A ResizeObserver handles
wrapping controls and notices. The renderer remains unscaled by CSS; pointer
conversion subtracts the canvas's actual bounding rectangle before converting
to tile coordinates, including on Retina displays.

`gameplay-controls.js` uses labeled action groups and the existing command
attributes. Frequent actions stay directly available on the compact strip;
the remaining groups retain their native handlers inside the expanded tray.
The Expedition disclosure opens upward and receives record links even when they
arrive after initial game rendering. Save readiness and the party-wide exit
confirmation remain owned by the existing library adapter.

`session-menu.js` opens the Game menu with Esc in command mode or the direct
Menu button. Resume, Save, and Save and Quit reuse the library's ownership,
readiness, in-flight save guard, and party-wide exit confirmation. Save and Quit
saves the expedition and returns to the lobby for later resumption. Targeting,
native prompts, other dialogs, chat, command-palette dismissal, ping placement,
and HUD arrangement retain their existing Esc behavior. The shared focus trap
keeps Tab inside the menu; opening, closing, and saving consume no game turn.
`tests/session-menu.cjs` checks keyboard isolation, focus, ownership, save routes,
confirmation, lifecycle rebinding, and narrow layouts. The disposable localhost
`tests/session-menu-native.cjs` checks native-menu cancellation and a complete
four-hero save/quit/resume cycle, including roster, health, positions, inventory,
and the native world clock.

The sidebar uses one width shared with the canvas layout. Hero identity, vitality,
secondary metadata and actions have separate rows. Readiness shares the identity
row. Compact mode suppresses passive/detail information while retaining health,
magic, readiness, recovery and active conditions. The roster starts directly with
hero cards, without a Party heading or a Rules/Simultaneous row. Hero inspection
remains available on each card. Function keys retain native menu and macro
bindings, and `I` retains native spell browsing. Add hero, slot claiming and the
roster density toggle live in the existing More actions tray. Shared gold, the
controlled hero's floor and collected rune icons occupy a compact tracker at the
top-left of the dungeon, replacing the legacy native item strip. The game retains its native
turn and friendly-fire rules without in-play rule toggles. Level overview exposes
the existing minimap; Map remains available through the action tray and native key.

Character-panel and message-history keyboard shortcuts run only in native normal
or command input mode. Native prompts, targeting, More and macro input keep their
keys even when no popup is visible; in particular, uppercase `I` answers the
level-up Intelligence prompt. Off-turn inspection remains available in normal
and command mode. `tests/offturn-windows.cjs` checks these boundaries through the
real client keyboard translator.

Initiative is a text-free meter beside each hero's name. Solid green extends left
from the zero diamond for banked catch-up time; hatched amber extends right for
recovery debt. All heroes share a scale of at least 20 aut per half, expanding
together for longer gaps. Hover or keyboard focus gives exact amounts and action
costs. Banked time is the gap between a hero's native clock and the furthest living
teammate's clock on the current floor. Debt is the hero's clock ahead of the world
clock. A hero can have both; these are clock comparisons, not stored free actions
or permission to act out of turn. Downed and off-floor heroes do not set the
comparison horizon, and missing clocks show an unavailable pattern. Timing updates
in place on every snapshot without rebuilding cards or losing keyboard focus.
`party-model.js` owns these derived facts; `party-initiative.js` renders them with
the existing tooltip system. Native scheduling and action costs are unchanged.
`tests/initiative-bars.cjs` covers the clock contracts; its `--browser` option
covers controlled visual states, scale, live focus, keyboard isolation and narrow
cards. Controlled states establish presentation behavior rather than combat proof.

In multiplayer, the top-left tracker shows **Monsters** with a shared credit/debt meter and
exact `C` (credit) and `D` (debt) amounts in aut. It compares the native world
clock, which advances monster simulation, with the furthest living hero's clock
on the current floor. Credit is the time the world still has to catch up; debt
is the time the world is ahead of that hero. Downed and off-floor heroes are
excluded using the same clock projection as hero initiative. This is a shared
scheduler comparison; each monster retains its native speed and action energy.
Missing clocks and no living current-floor heroes show unavailable values.
Singleplayer hides this meter and the Yield button, including expeditions with
companions. Visibility follows the native multiplayer flag rather than the hero
count, and explicit hidden-state CSS takes precedence over the dock's flex layout.
The meter reuses the hero meter's scale and rendering, updates
in place on clock-only snapshots, and explains its exact clocks on hover/focus.
Reading it sends no native commands.

`tests/initiative-bars.cjs` checks the monster projection as well as hero timing.
`tests/monster-timing-native.cjs` starts a disposable localhost expedition and
verifies an actual native wait advances the published world clock. Controlled
snapshots separately test credit, debt, missing facts, shared scale, live tooltip
refresh, focus retention, keyboard isolation, and three viewport sizes. The native
clock check and controlled presentation cases are distinct evidence.

### Configurable quick actions

The quickbar is a 32-pixel-high strip that fits its contents. It shows four
frequent native commands, assigned actions, one add/drop target and an adjacent
chevron. Ten saved positions remain available per hero; unused positions do
not become permanent empty buttons. The chevron opens a tray capped at 360 by
220 pixels. It opens on Commands with labeled actions; Items, Abilities and
Spells retain the dense icon picker. Names, costs and blocked reasons are available on
hover and keyboard focus. Large inventories scroll within the small palette.

Commands include Find Items (`Cmd/Ctrl+F`), Shopping List (`$`), Travel to Level,
Dungeon Overview, Examine Surroundings, Religion, Item Knowledge, Runes,
Message History, Memorise Spell and Keyboard Help, alongside the existing hero,
map and expedition controls. Search filters commands immediately by name,
description, alias or shortcut in every browsing category. It also reveals
matching expedition links directly, preserving their original click handlers
and confirmations. Enter uses the first available command; Down focuses it.
Escape closes the palette. Assignment mode keeps the item and power picker.
Opening the palette with the pointer leaves Search opt-in. Movement and other
gameplay keys from its non-editing controls close the tray and resume play
immediately. Keyboard activation of the chevron focuses Search; clicking Search
also retains ordinary text entry. Enter/Space activation and deliberate Tab
navigation remain available on palette controls.
The macOS `Cmd+F` alias uses the same native Find Items action during gameplay;
text fields, chat, native prompts and dialogs retain their own keyboard input.
An empty native shopping list reports gold instead of opening a list.
At phone widths the action strip stays above the sidebar; assigned slots scroll
within the strip so the palette button remains directly accessible.

Click the add target then an action to assign it. A filled slot uses its action
with one click; right-click or Shift+click opens replacement and Clear. Drag from
the sidebar or palette to pin directly; Shift+click, right-click or Shift+Enter
on a palette action pins it to a free position without using it. Assignments
persist locally per native hero identity, so switching heroes restores their own
bar. Inventory bindings deliberately follow the selected native inventory slot,
including dedicated consumable slots beyond the 52-slot gear pack; spells
and abilities bind native IDs and resolve their current shortcuts on use.
Item assignments also remember the last carried item's name and native art. When
the stack runs out, its dimmed icon stays in place with a zero count and an
out-of-stock explanation, including after reloading or switching heroes. Picking
up more in that native slot makes the assignment usable again automatically.
Remembered appearance never authorizes an action; use always requires a current
inventory entry. Reassigning or clearing replaces the remembered item as well.
Assigned positions show their keyboard shortcuts: `1`–`9`, then `0` for position
ten. These override the native top-row digit only while assigned and accepting
game commands. Clearing a position restores the native key immediately. Existing
eight-position saves retain their assignments, with two new empty positions.

Compatible offensive spell slots offer **Enable Quick cast** in their context
menu (right-click or Shift+F10). This turn-free preference is saved per slot and
hero. A `Q` badge marks enabled slots: one click or number key requests the native
quiver targeter's default target without changing the hero's quivered action.
`Shift+number` or **Aim spell manually** uses ordinary aiming for that cast;
**Use manual aiming** disables the preference. Shift-click/Shift+Enter still
reassign the slot. Existing bindings default to manual aiming. Missing native
`quick_cast` capability falls back to manual aiming even for a saved preference.
Native casting and autofight thresholds, costs, range, warning prompts and
channel continuation remain authoritative. Placement spells stay manual.

Quick shortcuts share the click action's legality, resource, and ownership gates.
An unavailable assigned action consumes its key without triggering a different
native command. Native prompts, targeting, menus, web dialogs, chat and text
editing keep their own number input. Numpad movement and modified shortcuts stay
native, except Shift+number on an enabled Quick cast slot. Holding a shortcut
activates once, including when it enters targeting;
release and press again to supply a target or prompt digit. Starting an action
also releases dock focus so native follow-up input works directly.

`quickbar-model.js` validates and resolves declarative bindings without DOM or
storage dependencies. `quickbar.js` owns local persistence and the dock view.
`quickbar-commands.js` keeps native command metadata, search aliases, and shortcut
routing together, reusing existing controls and their action handlers.
The existing `workflow-actions.js` remains responsible for action legality,
current item identity, native targeting and execution. Existing inventory art,
power tooltips and dock measurement are reused. Expansion never sends game input;
native commands retain their existing keyboard shortcuts and legality checks.

Hero actions form a fixed-width row beneath the vitality bars, followed by an
aligned divider and a level/activity line. Buff/debuff icon groups sit above
HP/MP, ending before the initiative tracker. Faith forms a plinth under
the portrait. Each deity has its own arch, pedestal, carved seal, side motifs and
crown. Native piety rank adds fittings, ornaments, a crown, inner sanctuary and
halo/jewels in stages. Penance adds fractures and a warning. Xom and Gozag have
distinct fixed treatments without invented piety progression. Names sit below the plinth and use a single-line ellipsis while retaining their full
accessible name and tooltip. The compass
rose sits at the top center of the portrait arch and points from the controlled hero to
each same-floor teammate, using the same north-up coordinates as the dungeon;
other floors or unavailable positions show a question mark. Navigate to is
disabled for other floors, missing positions, adjacent teammates and blocked
input modes. Activation re-resolves the current hero and teammate position,
then uses native click travel, including its normal pathfinding, costs and
interruptions. This travels toward a position rather than following a moving
hero. The signals toolbar uses the shared signal icon instead of a text heading.

The expanded quickbar puts the Items / Abilities / Spells palette first, with
search and assignment guidance. Existing utility handlers are grouped below as
Travel, Hero and Game. The roster-density toggle retains its icon through state
updates. Inactive hidden controls stay hidden; utility spacing no longer inherits
the collapsed toolbar's auto margins. The collapsed strip remains content-sized.

The controlled hero is first and has an expanded details area. The native
`#stats` nodes move into that card, preserving their values, tooltip contracts
and event handlers across card rebuilds and control changes. Duplicate identity,
vitality and status headings are omitted from that details projection; the
card's health/mana tracks reuse the native rich descriptions, including poison
and capacity details. Defenses and attributes use shared glyphs beside their native numeric values.
The shared level/activity row carries XP progress; noise uses a meter beside
compact equipment and hazard access. Elapsed time remains available in the
controlled level bar tooltip.
Repeated identity, level, floor, gold and equipment captions are suppressed.
`player-card-details.js` owns this DOM-preserving adapter; its separate
`personal-stat-visuals.css` keeps the native fallback layout usable outside a card.

`player-card-sections.js` attaches the existing abilities and inventory panels
directly below the controlled hero's readings, inside the same card border.
Both grids add rows as their contents grow, without an inner height cap; the
sidebar provides one scrollbar. Original panel nodes and handlers survive card
rebuilds and follow control changes. Their separate workspace handles are removed.
`power-art.js` shares exact native GUI atlas artwork between these grids, the
quickbar and the spell picker. Native snapshots provide authoritative tile IDs,
including dynamic powers; exact canonical names support older snapshots. Unknown
art uses an explicit unavailable symbol rather than an unrelated ability icon.

`status-icons.js` and the canonical `item-properties.js` icon registry supply
a colored pixel-art sprite family for the web HUD, drawn on a native 16×16
grid and displayed at 16 CSS pixels across controls, properties, filters and stats.
Simplified filled silhouettes, clear
negative spaces and restrained highlights take precedence over texture. A single content-addressed
PNG atlas is clipped into each icon; compact geometry and metadata stay stable.
`util/generate-hud-sprites.py` builds the filled, shaded artwork deterministically
with Pillow, with a manifest under `static/ui-sprites/`. Distinct semantic names separate
exploration, combat, resting, pickup, inspection, camera, hero control/cycling,
filters, personal readings, signals and layout affordances. `hud-iconography.js`
is the single dock role map and upgrades stale glyphs after initialization and
card rebuilds. Icon metadata records requested and resolved roles plus the sprite frame for coverage;
labels and rich tooltips remain authoritative. Native game artwork stays native.
Dexterity uses fine-control imagery, evasion a dodging figure and speed a swift
boot, keeping their meanings separate. Harmful effects have a simple corner
notch instead of a miniature overlaid icon; divine relationship marks retain
the full 16px size beside the altar. Button padding accommodates the art without
changing the shared level/control height. The generator retains previous hashed
atlases for cached clients. Unknown power artwork uses the same shared 16px
question sprite; late fallback loading cannot overwrite resolved native art.

`portrait-status.js` selects at most two explicit native status treatments inside
the arch: berserk heat, haste streaks, poison miasma, slow ripples, confusion
motes, petrified stone, frozen crystals, burning and invisibility. The native
sprite remains above the clipped effects. Known invisibility fades it; cooldowns,
resistances, descriptive lookalikes and unknown facts cannot fake active effects.
Precise status icons remain above the health/mana bars. CSS motion respects
reduced-motion preferences while keeping static state cues; a negative time
phase prevents animation restarts when native snapshots rebuild a card.

Deity frames use engraved material gradients, beveled edges and recessed altar
settings. Their bounded decorative particle renderer uses deity themes such as
embers, sacred motes, leaves, mist and coin glints; native piety controls ordinary
rank intensity, and Xom/Gozag retain fixed identity treatments. Penance and unknown
favor stay still. At most six particles decorate one shrine, with no timers or
input handling. Reduced motion hides moving particles and freezes decoration.
Compasses retain their apex alignment inside explicit rims, dashed for unknown
or off-floor bearings. Altars retain their native artwork and inspection action.

`party-progress-model.js` derives shared gold, the controlled floor and the
deduplicated party rune collection. `party-progress.js` presents native rune
artwork and moves the original shared-gold node into the tracker. Missing rune
data stays unknown; it does not imply an empty collection. The renderer reuses
`native-tile-art.js` and the canonical versioned atlas metadata.
`tests/ui-glyphs.cjs` checks every custom sprite frame, real colored alpha pixels,
semantic coverage, actual 16px presentation and integer 2×/3× scaling; isolated DOM fixtures serve
the same PNG through `tests/helpers/ui-sprite-fixture.cjs` without network access.

`hud-bottom-strip.js` places the minimap at bottom-left, with zoom, next-hero and
camera controls directly above it. The visible top banner is removed. A compact
scrollable message log occupies the rest of the bottom strip. Native minimap
pixels and hit testing share the same measured host budget. `hud-layout.js`
reserves the strip's measured height, excluding the quickbar's flexible spacer,
so repeated layout changes cannot consume the dungeon viewport. The hero roster
and the map/tools group remain movable through the existing HUD workspace.

`party-status-model.js` projects native effects and religion facts without
guessing healthy states from missing data. `party-card-status.js` renders the
shared effect badges and detailed passive defenses. `party-faith.js` renders
deity-specific shrine architecture separately from native religion facts. Current effects
and religion remain visible in compact cards; passive defenses stay in detailed
cards and the inspector. Harmful effects carry warning triangles and a distinct
border as well as color. Native duration values are already rounded to standard
turns; tooltips report them without visible text pills. Reading effects spends no
turns, and snapshot changes preserve focus on surviving effect/faith controls.

Faith badges use native altar symbols from the versioned dungeon atlas, with a
vector fallback for unknown artwork. All 27 catalogued gods, including the legacy
Pakellas entry, have distinct shrine geometry. Piety changes architectural
magnificence rather than filling a meter. Penance and party religious relationships
have separate markers and explanations. Xom and Gozag do not receive ordinary
rank progression. Their exact mood or service balances
are not inferred from the party snapshot. The inspector reuses the same religion
projection, and the controlled hero's native status lights also use icons.

Focused validation uses `tests/party-data.cjs`, `tests/initiative-bars.cjs`,
`tests/quickbar-model.cjs`, `tests/quickbar-hotkeys.cjs` and
`tests/party-hud-actions-native.cjs`. The keyboard regression uses real browser
events with the shared action gates and native input translator to cover all ten
slots, old saves, hero switching, held keys, input isolation and native fallbacks.
`tests/native-hotkeys.cjs` also checks all ten assigned digit routes against the
native client with transport intercepted, alongside its native binding probes.
`tests/party-hud-actions-native.cjs` loads an isolated native HUD and then uses explicitly controlled snapshots and
intercepted packets for compass, navigation guards, item/spell/ability execution,
per-hero persistence, page reload, drag assignment, clearing and three laptop
layouts. It proves UI and protocol behavior, not actual synthetic spell casts or
successful path traversal. Proof is under `/tmp/dcss-party-hud-proof`. Existing
dock keyboard and tooltip overlap regressions also cover their shared mechanisms.

The 17 October 2026 number-key pass passed model, focused browser and dock
regressions, plus 178 native binding probes, 20 physical native keys and all ten
assigned quick keys. The tested quickbar JavaScript and stylesheet matched the
workspace hashes. The broader HUD suite stopped before its quickbar checks at
the existing assertion that every shared icon must render at 16px; this pass
does not claim a full HUD-suite pass. These are local, disposable-game checks,
with action transport intercepted; they do not establish item/spell execution or
a deployment. Results and the ten-slot image are saved in the task's
[validation folder](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14bdb-2584-7283-a079-ff6a128ed100/quickbar-number-keys/checks.json).

The effects/religion extension uses `tests/party-status.cjs` for native fact
projection and extends the HUD fixture with mixed effects, penance/favor updates,
missing facts, no deity, native altar rendering, Xom/Gozag exceptions, aligned
dividers, portrait compass placement, name ellipsis and keyboard isolation.
Its screenshots and measured local results are under `/tmp/dcss-card-status-proof`.
The continuous-card extension is verified under `/tmp/dcss-ornate-cards-proof`,
including native power pixels, the shared gold/floor/rune tracker, six icon-based
personal readings, panel identity across rebuild/control changes, a 52-item pack
and 31-power grid, and all three laptop layouts. Focused checks in
`tests/power-art.cjs`, `tests/personal-stat-visuals.cjs`,
`tests/party-faith-browser.cjs` and `tests/party-progress.cjs` cover canonical art
parity, late atlas loading, unavailable art, native stat updates/tooltips, 27 deity
designs at ranks 0–6, penance, special gods, and unknown collection data. The two
native power tile fields in `tileweb.cc` compile with `make WEBTILES=y tileweb.o`;
the older HUD fixture exercises the exact-name artwork fallback. This is not a
full rebuilt-engine run of the new metadata.
The current workspace executable crashed at startup with “Webtiles message too
long”; HUD validation therefore uses the previously validated engine fixture
described below. No current-engine gameplay or hosted deployment is claimed.

The compact-bar correction is assessed separately in the focused design archive
at `/Users/iancaltabiano/Documents/Projects/__DESIGN/dcss/2026-10-17-compact-quickbar`.
Its browser check also covers empty, populated and full saved bars, a 52-item
palette, keyboard pinning, measured strip size and bounded expansion. Current
correction evidence is under `/tmp/dcss-quickbar-redesign/proof`.

Shared sizes and quiet surfaces live in `styles/gameplay-shell.css`; the existing
material tokens, icons, native colors, inspector and tooltip systems are reused.
The measurement adapter and presentation primitives can be reused independently;
DCSS commands, party ownership and game-specific grouping remain in their current
adapters. No new framework or dependency is introduced.

## Evidence and limits

`tests/gameplay-shell-native.cjs` covers three desktop/laptop sizes, a four-hero
party, one-click camera/inspection/control, turn-free navigation, keyboard
isolation, native Map return, ping-to-tile coordinates and the Expedition menu.
It also includes clearly controlled DOM presentation cases for long names and
negative statuses; those cases do not simulate native poisoning or combat.
`tests/dock-controls.cjs` covers Enter/Space, repeated initialization, late-added
controls, lifecycle rebinding, readiness and consequential confirmation.

Local proof is stored under `/tmp/dcss-hud-reconfiguration/proof` and
`/tmp/dcss-hud-reconfiguration/proof-retina`. The isolated server uses temporary
accounts, saves and records at `/tmp/dcss-hud-qa`, on localhost port 8896. No human
save is used. UI workflow proof uses the existing native fixture executable
`/tmp/dcss-skill-training-build/source/crawl` with SHA-256
`8cb825f9992d61097f5baf4519f9b7b9d1ca91f4e6403f8a081cfa7d7dae0938`.
The newer character-preview endpoint is outside this HUD check; that endpoint
returns 503 against the older fixture engine. The HUD checks report JavaScript
and JS/CSS asset errors separately from that fixture compatibility limitation.
This work does not validate the in-progress native character-preview build,
mobile play, combat balance, hosted deployment or formal accessibility compliance.

The focused baseline critique and control map are archived at
`/Users/iancaltabiano/Documents/Projects/__DESIGN/dcss/2026-10-16-hud-reconfiguration/brief.html`.

Final local checks passed at 1280 × 800, 1440 × 900 and 1024 × 768, at both 1×
and 2× pixel density. All four healthy heroes and signal controls fit without
scrolling at each size. Actual native ping coordinates matched the clicked tile;
camera, inspection, control switching and map navigation did not advance the
world clock. The controlled long-name and negative-status presentation cases
passed. The dock activation/lifecycle test, party-data trust contracts, edited
JavaScript syntax, scoped whitespace and 600-line limits also passed.

The duplicate bottom-right companion block is suppressed: `monster_list.js`
omits friendly map actors only at authoritative same-floor party positions.
A friendly-only party list is hidden. Threats, neutral creatures and unseen
warnings stay directly visible in a compact native list (at most 72px), and an
empty list takes no space. Unknown/off-floor facts never classify an actor as a party duplicate; the
friendly-only presentation rule is separate.
`tests/nearby-creatures.cjs` covers party duplicates, threats, summons and unknowns.

The level/XP bars and adjacent controls share `--party-control-size`: 20px for
precise pointers and 28px for coarse pointers. Both align at their top/bottom
edges independently of portrait height or stretched grid tracks.
