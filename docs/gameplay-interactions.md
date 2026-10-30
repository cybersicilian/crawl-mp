# Gameplay interaction system

The gameplay audit is the implementation brief. Work proceeds from trustworthy
native state and safe information reads to shared controls and task workflows.

## Invariants

- The engine owns facts, item/spell identity, action legality, ownership, costs,
  and consequential confirmations. Missing data is unavailable; empty is empty.
- Reading, filtering, switching categories, and moving the camera consume no turn.
- Equivalent HUD and folio values use the same deterministic display calculations.
- Keyboard shortcuts remain native, with assigned quickbar digits overriding
  command input through the same explicit action routes as slot clicks.
  Pointer controls use explicit actions and
  authoritative identifiers rather than parsing displayed prose into commands.
- Game panels use web presentation and shared visual primitives. A native input
  or action protocol does not require a separate legacy visual style. Replacing
  a panel must retain its commands, selection modes, warnings, and return context.
- A camera change does not implicitly transfer control. Inspected, viewed, and
  controlled heroes are separate contexts with visible labels.
- Return paths retain hero, section, selection, filters, and scroll position.
- Test games and state live under a separate temporary root. Existing saves and
  the production service are not implementation test fixtures.

## Reused mechanisms and boundaries

Native menu state and the UI stack remain authoritative for selection and
confirmation. A shared menu presentation adapter provides category buttons,
named rows, and consistent Back/Close controls. Item details reuse native action
descriptions; folio actions enter that same detail workflow using stable slots.

The character folio, dock, and party cards share authoritative party snapshots
and capability/ownership checks. The client normalizer only normalizes shape;
it never generates character contents from species or class.

Spell snapshots expose `casting_cost` with an explicit `resource` (`hp` or `mp`)
and effective `amount`; live snapshots also include the native `payable` result.
`spell_resource` identifies the hero's casting pool even with an empty spell
list. The legacy `mp_cost` field remains for older clients. The shared
`spell-cost.js` adapter drives starting-sheet costs, folios, tooltips, the picker,
HUD and quick bar. HP casting requires strictly more HP than the cost, and
native payment restrictions still apply. An empty MP pool never implies HP
casting. Release the updated engine and client together to enable this contract.

The reusable primitives are the structured list/category shell, action metadata,
availability display, focus/return handling, and persistent help. DCSS adapters
supply native commands, categories, per-hero authority, and game-specific rules.

## Shared menu surfaces and keyboard selection

Every native `Menu` list and all 15 emitted UI layout families now pass through
the same folio surface: paper, readable semantic colours, visible keyboard hints,
focus outlines, hero context, and Back/Close. This includes inventory, equipment,
shops, travel, lookup/search results, descriptions, gods, monsters, spellbooks,
cards, help/history, startup choices, seed/text dialogs, progress, and game-over
records. The special native skill grid retains its authoritative layout inside
that surface; normal Skills entry opens the existing training folio.

`menu-keyboard.js` supplies reusable editing guards, visible/enabled selection,
focus movement, and single activation. `popup-controls.js` attaches it to the
whole popup stack; `menu-presentation.js` renders native shortcut metadata and
information tabs. No displayed prose is interpreted as an action identifier.
Native letters, quantity prefixes, multi-selection, and confirmations stay with
the engine. Starting a native menu from a dock click releases the opener's focus
so that the dock cannot swallow menu letters; closing restores that opener.

Item-search results now separate the heading and match count from the Travel/View,
sort and duplicate/useless-result controls. Result rows separate names, locations,
waypoints and equipment state, retain native icons and search highlights, and show
the selection letter once. Other native rows also omit a repeated terminal letter
prefix when it matches their actual hotkey. Popup surfaces avoid a second inner
outline; keyboard focus outlines remain visible.

`menu-search.js` is a thin adapter for the exact `StashSearchMenu::calc_title`
and result-row grammar in `stash.cc`. It reuses formatted-text slicing and the
existing native commands (`!`, `/`, `=`); unknown layouts retain their original
content. Native sort/filter redraws return focus to the initiating control.
Spectators cannot change the options. No engine build or protocol change is
required; release the new module and stylesheet with the updated client imports.

The search browser regression covers carried/equipped items, ground/shop labels,
waypoints, duplicates, filtered-empty results, formatted highlights, unknown-format
fallback, keyboard activation and spectator guards. The disposable native check
opens the actual animal-skin search, cycles sorting, toggles filtering, inspects by
pointer and letter, and returns without spending world time. Both check widths of
1280, 768, 390 and 320 pixels. The spell/ability table, menu-selection and all 15
popup-family regressions also passed. This is local proof; this menu change has
not been deployed.

```sh
node crawl-ref/source/webserver/tests/menu-search.cjs
WEBTILES_URL=http://127.0.0.1:8917 node crawl-ref/source/webserver/tests/menu-search-native.cjs
```

Multi-select rows show a persistent green highlight, checkmark and selection
label, independently of hover or keyboard focus. Partial stacks show the chosen
quantity, such as “2 of 3 selected”. The shared renderer uses the engine's
`selected_qty` field and total `q`; native updates send zero explicitly to clear
a selection. Toggle buttons expose `aria-pressed` and keep focus through redraws.
Single-selection and quiet-selection menus retain their existing presentation.
Release the updated engine and client together for this selection contract.

| Context | Keys |
| --- | --- |
| Native lists and item actions | Native letters; Tab to controls; Enter/Space activate single-selection rows; Space toggles multi-selection and Enter accepts selected quantities; Up/Down/Home/End move between focused rows |
| Native descriptions with sections | Direct section tabs; Left/Right/Home/End while a tab has focus; native `!` cycling remains available |
| Character folio | 1–4 select an inspected hero; `[`/`]` change section; item letters inspect; power letters select, repeating cycles duplicate letters, then Enter uses the selection |
| Spell/ability picker | Native letter uses the matching power; Up/Down/Home/End select; Enter uses; `/` focuses search; `[`/`]` switch power type |
| Command input | `m`, `A`, `%`, `z`, and `a` open the same bespoke surfaces as their dock buttons |
| Assigned quick actions | Top-row `1`–`9`, then `0`, use positions 1–10; empty positions retain native keys; prompts, targeting and text entry retain their digits |
| Spell browsing and function keys | `I` opens spell browsing; `F1` opens the native game menu through its web surface; other function keys remain available to native macros |

Search fields, training fields, chat, composition, and modified shortcuts retain
their own input. Hidden, filtered, disabled, and spectator actions cannot be
selected through these shortcuts. Availability and costs still use the existing
native action contracts.

Keyboard activation carries the original key through the shared row handler.
Native selection updates keep the focused row focusable; removing and restoring
its tabindex would lose focus between selection and confirmation. Modified keys
bypass web activation so the native modifier maps remain authoritative, including
Ctrl+R, Ctrl+V, Ctrl+Z, and modified numpad 5.

Regression coverage derives its inputs from the preprocessed WebTiles key table
in `cmd-keys.h` and key values in `cio.h`. `tests/native-hotkeys.cjs` probes each
distinct keyboard input against the real client, intercepting transport before
any probe can move, quit, save, or change the game. The five explicit web-panel
routes must open their matching command surface instead. Native spell browsing
and the game menu are also exercised against the engine. This checks input
delivery and web routing; it does not execute every context-specific game action.

`tests/menu-selection.cjs` checks confirmation, toggling, held keys, modifiers,
focus retention, and both popup and row handling. `tests/pickup-menu-native.cjs`
checks real dropped stacks, pointer and keyboard selection, partial quantities,
multiple selections, empty confirmation, and turn-free cancellation in a
disposable native game.

Use `webserver/util/qa_server.py` with the matching native build and a short new
runtime path, such as `/tmp/dcss-hkqa`, then point `WEBTILES_URL` at that server.
Long runtime paths can exceed the native Unix socket pathname limit.

The 17 October 2026 hotkey pass checked 178 distinct keyboard routes derived
from the active native table, 20 real Chrome key combinations, all 15 layout
families, the existing menu/folio/dock regressions, and actual native pickup,
spell-description and game-menu workflows. Changed client assets matched the
isolated runtime byte-for-byte. No game action was sent by the binding probes;
native workflow tests used disposable local accounts. This pass was not deployed.

Local verification on 17 October 2026 passed `tests/menu-surfaces.cjs`, which
checks all 15 emitted layout types against the C++ producers, and
`tests/menu-keyboard-native.cjs`, which exercises a disposable native party,
pointer-opened inventory, native letters, single activation, folio return,
text-field isolation, direct power-action routing, and 1280/768/390px popup bounds. The
existing power-hover, skill-training, and dock-control browser regressions also
passed. This is local client/native-fixture proof; it is not a deployment or a
fresh gameplay exercise of every shop, travel, religion, or experience prompt.

Screenshots and results are saved in the [menu validation record](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14a1d-b376-7281-81e5-c9ca08fdf1c1/dcss-menu-proof/validation.json).

## Verification

Regression coverage starts with absent help files, empty/unknown snapshots,
deterministic repeated stats, native inventory lettering and quantity, and crash
report access. Workflow coverage then exercises native menu/category round trips,
owned versus allied folio actions, keyboard isolation, context retention, party
camera/control separation, chat and ping cancellation, and laptop layouts.

Source changes, local native proof, and deployment remain separate claims.

## Audit implementation

| Finding | Implemented behavior |
| --- | --- |
| G01: crash and recovery | Help survives absent documents; releases build the docs. Crash recovery checks confirmed checkpoints with the engine's read-only save compatibility reader before offering resume, and provides an authenticated diagnostic download. Closed process streams are reaped reliably. |
| G02: trustworthy data | Versioned snapshots use HUD display calculations under the UI RNG. Inventory slots, letters, names and quantities, spell letters and IDs, and native ability IDs remain authoritative. Missing data stays unavailable and empty lists stay empty. |
| G03: visible controls | Inventory exposes four direct category tabs and empty states. Native item details expose named action buttons, secondary shortcuts, optional expert metadata, and shared Back/Close controls. The legacy menu client is split into lifecycle, rendering, navigation and presentation modules. |
| G04: information to action | One character folio separates Equipment and Skills, supports validated training, and provides native item management and spell/ability actions. Native targeting, warnings, costs and confirmations remain in charge. Item reading returns to the same hero, section, position and control. |
| G05: hero context | The banner names the controlled hero and camera context. Cards expose separate inspection, camera and control actions. The folio names the inspected hero and offers permitted control transfer. Host commands retain explicit control; guest identity is server-bound. |
| G06: command hierarchy | Travel, Combat, Hero and Session groups keep frequent actions direct. Character-related pointer routes use the shared folio. Missing powers and stairs disable the relevant action with a reason; stair presence comes from the engine. Save remains direct; records, exit and item shortcut settings live in Expedition. |
| G07: reading surfaces | Management lists and details share quiet paper, readable ink, named controls, consistent spacing and visible focus. The dungeon stays dark. Dense data uses the same folio surface. Native expert menus remain available. |
| G08: reference search | Encyclopedia opens directly without loading the manual and searches names across native chapters before requiring a category. Chapter browsing and native descriptions remain available. |
| G09: durable help | Previews accept the pointer immediately; Read details opens persistent help. Glossary terms support click, touch activation, focus and Enter/Space. Long descriptions scroll. |
| G10: coordination | Gameplay chat opens on the left, leaving party health/readiness visible. Armed pings display their mode and Cancel/Escape; placement clears the mode. Existing chat drafts and item sharing remain intact. |
| G11: tactical space | A stable context bar, compact roster option, deliberately budgeted dock/log/sidebar and optional level overview replace competing overlays. Item shortcut settings have a named route and isolated keyboard input. |

Keyboard commands remain native, including movement, auto-fight Tab, inventory
letters and cycling, native `m`, `z`, `a`, `?`, and Escape. Within focused web
controls, Tab follows the accessible control order; inventory Tab retains native
category cycling when command focus is on the game.

Party rule changes and terminating the expedition are owner-scoped at the
server boundary. Enabling friendly fire or changing the turn model asks one
party-wide confirmation. Reversible reading, category and camera changes apply
immediately.

## Regression entry points

- `webtiles.crash_reports_test`: missing/public URL handling, bounded diagnostic
  reads, path restrictions, real cookie encoding and owner-only HTTP access.
- `webtiles.gameplay_protocol_test`: sticky host control, guest identity binding,
  party-rule/termination ownership, and the chat shortcut boundary.
- `webtiles.terminal_exit_test`: a real child closes its streams before exiting;
  the server still reports its exit exactly once.
- `tests/party-data.cjs`: sparse and known-empty snapshots never invent facts.
- `tests/gameplay-workflows-native.cjs`: fresh four-hero game, repeated turn-free
  reads, direct categories, legacy keys, stale-action rejection, folio return,
  camera/control separation, native cast cancellation, equipment actions, ping
  cancellation, chat placement and desktop geometry.
- `tests/gameplay-recovery-native.cjs`: absent manual, repeated reference entry,
  confirmed save, intentional native crash, private report download and explicit
  checkpoint resume with hero identity preserved.
- Existing dock, training, power description and nested-help browser regressions
  exercise keyboard isolation, native activation, focus and long descriptions.

The native recovery test requires an explicitly isolated build with wizard mode
enabled. Its accounts, saves and deliberate crash are disposable. Production
builds retain their existing wizard policy.

## Verified implementation results

Local validation on 16 October 2026 passed 23 server tests, the sparse/empty
party-data contracts, and native Chrome workflows against a clean isolated engine
build. Four heroes' defence values matched the HUD. Three repeated inventory,
Skills and Encyclopedia round trips changed no game time or facts. Stale actions
were rejected; casting cancellation spent no magic or time, while equipment
changes retained their native turn costs. Context, focus, native keyboard paths,
chat/ping controls and layouts at 1280×800 and 1440×900 passed.
Dock activation, nested help, power descriptions and training controls also passed
their browser regressions, including training at 768px and 390px widths.

With the manual deliberately absent, native help remained safe. After a
deliberate crash, a confirmed checkpoint passed the engine's compatibility check,
the report was downloadable only by its owner, and explicit resume restored the
same hero identities. A separate host, bound guest and unrelated expedition
passed item-sharing, tooltip/input-isolation and direct slot-claim workflows.

The final source check parsed 117 JavaScript files and found no authored web
file over 600 lines; vendored and generated assets are excluded. The scoped diff
check passed. All gameplay native sources matched the tested build. Concurrent
character-preview changes in this shared checkout are recorded separately.

Screenshots, native observations, source hashes and the build identity are saved
in the [local validation record](/Users/iancaltabiano/.codex/visualizations/2026/10/16/01a14708-f750-7522-80ef-1345960aea43/dcss-gameplay-implementation/validation.json).

This is local implementation and browser/native proof, with disposable saves.
Production has not been deployed. Release the engine, generated tile assets,
client and documentation together; version checks disable unsafe actions against
an older engine. Full screen-reader testing and extended mobile, combat and
downed-hero play sessions remain outside this validation pass.
