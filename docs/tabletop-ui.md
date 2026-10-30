# Tabletop WebTiles interface

The lobby and game share an offline fantasy material system: forest and leather
surfaces, vellum reading panels, and restrained brass accents. Iowan/Palatino
headings pair with Avenir/Segoe/DejaVu interface text and fixed-width combat
output. Fonts use locally installed faces and the existing bundled fallbacks.
Custom dungeon key art, section marks, and engraved property/status icons ship
inside the repository; runtime rendering needs no external asset service.

## System map

- `webserver/static/tabletop/`: reusable palette, material recipes, SVG ornaments,
  interaction states, and modern interface presentation.
- `welcome.css`, `lobby-experience.css`, and `accounts.css` cover the responsive
  entry, quick seats, account forms, party planner, Chronicle, and expedition list.
  Welcome collapses after authentication; the existing one-click seats remain.
- `sourcebook.css` supplies the final illustrated-reference-book presentation:
  ivory pages, burgundy small-cap chapter titles, charcoal ink, and fine gold rules.
- `lobby-navigation.js` composes Play and Chronicle around the
  route-independent `workspace-views.js` controller. Source nodes, roster edits,
  scroll, search, and category context survive view changes. Play prioritizes saved
  progress, new expeditions, and joining; the named account menu groups maintenance.
  `lobby-browser.js` supplies immediate Chronicle filters and search;
  `lobby-modes.js` groups all eight original server-provided launch links into a
  compact section on Play, with a single party-size strip. Other modes remains
  directly reachable from setup without leaving the current room.
  `navigation.css` and `lobby-workspace.css` are explicit versioned template links.
- `character-guide.js` adds immediate race and class explanations beneath
  each selection. A shared sourcebook dialog provides racial traits, base
  attributes, class bonuses, starting equipment, spell access, skills,
  recommendations, and training aptitudes without leaving the current roster.
  Native selection changes, presets, and remote room updates refresh the guide.
  The launch action precedes the cards so richer help does not hide it.
- `searchable-select.js` enhances long native selects with a bounded, searchable
  top-layer popup. It is independent of character data and sends no commands:
  selections update the original native control and dispatch its change event.
  Consumers supply labels, legal options and disabled state. Arrow keys select
  a result, Enter applies it, and Escape returns focus without changing the value.
  Browsers without the Popover API retain the native select. `party-setup.css`
  styles the picker and compact setup toolbar, card identities and field guides.
- `character-catalog.js` is generated from native descriptions, species/job
  YAML, mutation text, and `crawl -playable-json`. Regenerate with
  `.venv/bin/python crawl-ref/source/webserver/util/generate_character_catalog.py`.
  The legacy Djinn label maps to Djinni data. Unavailable Vampire is excluded
  from the selectors rather than presenting a choice the engine cannot create.
- The builder derives every starting species, background and legal combination
  from that catalog. `character-builder.js` supplies wider hero folios and native
  combination labels; `starting-sheet.js` renders a read-only native starting sheet.
  Searchable visual species and background galleries show recommended choices first,
  filter all legal choices immediately, and retain the native select as the room's
  authoritative value. Species use native portraits; background icons reuse native
  tiles (with category fallbacks for jobs without a dedicated tile). The dark,
  brass-accented builder shows a larger equipped native portrait and compact
  starting attributes, defenses, and build highlights; the expanded starting sheet
  provides the full native skills, equipment and spells. The optional undead-trait
  guide compares all three descriptions and current compatibility.
  `native-start.js` requests the configured executable's `-character-preview-json`
  snapshot: real HP/MP, AC/EV/SH, adjusted attributes and skills, resistances,
  equipment, memorized spells and starting spell access. The engine runs its normal
  character setup against a temporary no-save package, without a dungeon or
  persistent save record. Each worker uses a private working/save directory;
  scratch files are removed when it completes or is cancelled, and installed
  releases remain read-only.
  The party shares its spell library; the sheet distinguishes memorized spells
  from each hero's contribution to that library.
  A per-seat creation seed reserves random starts and appearance. The same seed
  travels through `/weapon/seed` party tokens into host and companion creation;
  its explicit RNG sequence isolates creation from the expedition's world seed.
  `webtiles/character_preview.py` provides bounded subprocess execution, shared
  pending requests, retryable failures and a binary/atlas-versioned result cache.
- `party-composition.js` supplies an aligned comparison of native starting HP,
  MP, AC, EV and SH for every hero, alongside equipped portraits and direct sheet
  and edit actions. Open/closed seats are explicitly planned builds. Values update
  in place when snapshots arrive; loading/errors never become invented zeroes.
  Phone layouts retain all five values in a compact strip for each hero.
  The original editing controls remain mounted when switching views.
- Starting sheets use the native folio's Character, Spells, Traits, Equipment and
  Skills sections, compact stat boxes, resistance symbols/gems and item tables.
  `tabletop/character-folio.css` owns the shared native skin and component layout;
  `inspector-sourcebook.css` retains its original URL as a compatibility import.
  `starting-sheet.css` provides the lobby structure and responsive comparison.
  Section choice and scroll context survive reopening and preview updates.
- `character-stat-help.js` supplies canonical stat explanations to the native HUD,
  lobby sheet/comparison and native inspector resistance rows. Lobby rich tips use
  the existing shared tooltip materials, enter the dialog's top layer, associate
  help with focused values through ARIA, and dismiss on Escape before the dialog.
- Starting equipment, spell and trained-skill rows expose native descriptions on
  hover, focus or tap through `starting-entry-help.js`. Creation snapshots call
  the engine's `get_item_description()`, spell-description database and
  `get_skill_description()` in that hero's context. Spell cards also use the same
  native level, MP, schools, failure, power, damage and range queries as in-game
  spell tips; skill cards retain species aptitude and equipment-aware projections.
  Existing snapshot fields remain compatible. Inspection has a dedicated seeded
  RNG stream, so reading descriptions cannot reroll the build or world.
  Long cards accept pointer scrolling and Arrow/Page keys while their entry has
  focus. Escape removes the ARIA association and suppresses immediate hover
  reopening when the dismissed card reveals its own source row underneath.
- `player-doll.js` draws the native packed player layers and clipping from the
  matching tile atlas in the builder, starting sheet and composition view. Species,
  background and weapon changes refresh the equipped outfit directly.
  The preview and in-game companion tiles share `fill_player_equipment_doll()`;
  background costumes cannot substitute gear the hero is not wearing.
  `util/character_tiles.py` publishes unchanged native species PNGs as a loading
  fallback. Loading and unavailable snapshots never substitute estimated stats.
  Shared `--tt-folio-*` tokens tie the lobby to the in-game character folio.
  Explicit template styles include the full UI revision to avoid stale hashes
  cached by a long-running development server.
- `client-staging-weapons.js` adds a directly editable starting weapon for classes
  that offer one. Fixed class equipment hides the selector; Felids show locked
  unarmed combat. Room broadcasts supply the legal options and chosen value.
  `starting_weapons.py` validates updates, launches and reused compositions against
  `static/starting-weapons.json`, generated by the same catalog command after a
  native rebuild. Both the native menu and companion setup reuse
  `starting_weapon_choices()` and `default_starting_weapon()`. The native
  `-playable-json` export supplies the choices without duplicating game rules in
  JavaScript or Python. Party tokens optionally append `/weapon` to
  `Name:Species/Job`; older tokens retain legal defaults. Host rc settings,
  companion arguments, and saved compositions all carry the selection.
- `assets/dungeon-threshold.png` is custom lobby artwork. Its generation prompt
  and tool provenance are recorded in `assets/README.md`.
- `loading-ui.js` and `loading.css` retain the native loading nodes and prompts
  while presenting an illustrated folio. Delayed startup gets supportive copy
  and an explicit return-to-party-hall action; nothing retries automatically.
- `library-ui.js` prioritizes saved expeditions before the gathering hall and
  exposes Save, Save & lobby, and record links directly in the game dock.
  The standalone game, hero, and artefact records share the sourcebook material
  and property-icon system through `templates/library.html` and `library.css`.
- Both `style.css` entry points retain their URLs and import ordered native
  behavior followed by shared materials and the appropriate component styles.
- `game_data/static/styles/party-inspector.css` loads through the preserved
  `#party_inspector_styles` element. The inspector uses a native modal dialog;
  its rich tooltip moves into the dialog top layer while it is open.
- `inspector-sourcebook.css` presents the character sheet as a readable folio.
  Its four sections use ARIA tabs/panels and Left/Right/Home/End navigation.
  Section changes retain inventory DOM and each hero/section's scroll position.
- `party-power-cards.js` adapts spell and ability snapshots to the shared rich
  tooltip attributes. Hover anywhere on a power's row or focus it with Tab for
  native effect text and the inspected hero's current metadata. The native
  party snapshot supplies plain-text `desc` fields from the spell database and
  `get_ability_desc()`; older snapshots explicitly show when prose is unavailable.
  Long cards scroll and retain nested glossary links. Escape dismisses the card
  before closing the inspector; hero/section changes dismiss stale cards.
  `tests/power-hover-cards.cjs` verifies these interactions in Chromium with
  native description fixtures, including keyboard access and narrow viewports.
  `tests/power-hover-native.cjs` checks descriptions and hero isolation in a
  fresh game on a disposable local server. Native power queries use
  `party::scoped_player_context` so nested queries retain the inspected hero.
- Co-op presentation is split into party model, rendering, controls, and inspector
  modules. Existing normalization and server messages remain the source of data.
- `party-skill-training.js` adds direct Off/On/Focus priorities, automatic/manual
  mode, native XP shares, and decimal stop levels to the Skills section. Targets
  save on Enter or blur; Clear removes them. Base/effective targets use the
  engine's existing cross-training rules. Drafts, focus, hero and scroll context
  survive party updates. The native skill menu and WebTiles share
  `set_training_mode()`, including separate selections for each mode.
- Skill snapshots keep species aptitude in `apt` and export `manual_bonus`
  from the inspected hero's remaining native manual points (+4 while active,
  otherwise 0). The aptitude cell shows the total with a visible base/manual
  breakdown. Additional manuals extend duration; they do not stack the bonus.
  Older snapshots without the field retain their species aptitude display.
- Right-clicking eligible backpack, equipped, HUD or ground items offers their
  related skill targets. `Train [skill] to [level]` applies the native item goal
  and enables disabled training, retaining Focus and using no turn. `Set [skill]
  target…` opens the matching stop-level field in Skills for custom levels,
  base/effective targets and priorities. Item metadata reuses `item_skills()`
  and the same goal calculations as native descriptions; missing metadata adds
  no inferred actions. Open menus invalidate when the item, hero or training
  state changes. The optional boolean `enable` on a target request is atomic
  with that target; ordinary target edits keep their current priority.
- The `skill_training` protocol validates hero, skill, status and target before
  calling native training functions in the inspected hero's scoped context.
  Species restrictions and target completion remain native rules. The server
  permits the host to edit party heroes and other members to edit only their
  assigned hero. Browser controls require the new native snapshot fields;
  release the rebuilt engine, server authorization and browser assets together.
- `item-properties.js` is the shared safe-DOM parser and SVG factory for native
  and legacy property inscriptions. It retains exact values and unknown text.
  Chronicle relics, inventory, weapon fields, item hover titles, and chat tags
  use its badges. `status-icons.js` reuses that artwork for status label matching.
  Engine foreground colors and existing selectors remain.
- Character resistances use semantic symbols, gem indicators, exact values,
  and keyboard-focus explanations. Willpower and stealth gem scales match
  native `output.cc` (40 and 50 respectively); raw ratings stay visible.
- `interface-polish.js` removes terminal-style brackets from custom controls;
  their keyboard shortcuts, selectors, and data attributes are unchanged.
- `adventure-ui.js` exposes expedition chat and the native encyclopedia in the
  action dock. Chat preserves draft/history and F12/Escape shortcuts, adds an
  item picker and one-click inventory sharing, and shows unread counts in the dock.
  Dock controls isolate keyboard events while retaining native button activation,
  including dynamically inserted save controls.
- `chat-context.js` adapts server-known inventory and visible ground items into
  reusable item snapshots. Placeholder inventory is never shareable. Optional
  `inventory_known`, `kind_name`, and identified native lore enrich new packets;
  older native inventories still work with their existing known facts.
- `chat-items.js` renders received item chips and pointer/focus cards using safe
  DOM text. The chip carries a snapshot from that message, not a live item claim.
  Persistent chat-root/window handlers survive native client initialization.
- `webtiles/chat_tags.py` bounds and allowlists up to eight item snapshots per
  chat message, with same-origin static icons only. Existing legacy chat HTML
  remains compatible. Delivery stays inside the active expedition's receivers.
- `encyclopedia.js` presents the native lookup categories as illustrated chapter
  cards. Native search, descriptions, and shortcuts remain authoritative.
- `TilesFramework::_send_cell` supplies item labels, identified-item lore, and
  terrain labels from remembered map knowledge. Detection does not identify an
  item; unseen live entities are not queried. `mouse_control.js` uses this data
  for item, creature, terrain, and party hero hover cards, rendered as text.
- `nested-tips.js` and `tooltip-glossary.js` provide nested tooltips. Glossary
  terms (conditions, resistances, core mechanics; condition wording mirrors
  `dat/descript/status.txt`) are linked in the message log, text scrollers,
  description popups, and tooltip bodies. Hovering a term opens a card whose
  own terms open deeper cards. The sidebar rich tooltip and dungeon hover card
  are "hosts": when they contain something hoverable, a brass bar fills and the
  tooltip locks so the pointer can enter it. Cards close after a short grace
  period off the chain, or on Escape / click away.
- `tooltip-source.js` monitors the active or pending source's ancestor chain,
  dismissing help when a control is hidden, detached, or made inert. Screen
  changes, cleanup, and browser tab hiding dismiss transient cards. Gameplay
  tooltip handlers exclude lobby and loading controls, including after returning
  from an expedition; those controls retain their lobby help.

## Layout and integration

The game retains its dungeon canvas origin, native tile sizing, and mouse
coordinate conversion. Sidebar widths use outer dimensions consistently. The
minimap chooses an integer cell size from the available sidebar height, using
that same size for rendering and hit testing. Dense monster lists scroll within
their panel. No parent transform scales the dungeon.

All web code files changed by this overhaul are at most 600 lines. The native
browser client now composes account, input, transport, staging, lobby, and
Chronicle helpers through explicit shared session state and callbacks. Player
protocol state is separate from HUD drawing and interactions; popup layouts
delegate description, scrolling, and formatting. The cell renderer retains its
public prototype and coordinate system while delegating glyphs, overlays,
layers, and texture primitives. These extractions preserve the native APIs.
Deploy the stylesheet entry points **and their imported files**,
the new AMD modules, and template includes together. Item and terrain hover
metadata additionally requires the rebuilt WebTiles binary.

The read-only `/stats` section (gameplay statistics and the reference
encyclopedia) is another sourcebook chapter, reachable from the library chapter
bar and the lobby chapter index; see [stats.md](stats.md).

## Verification

Build from `crawl-ref/source` with `make WEBTILES=y -j8 crawl`, and start the local
server with `./start_coop_server.sh` from the repository root. Run:

```sh
node crawl-ref/source/webserver/tests/tabletop-ui-smoke.cjs
node crawl-ref/source/webserver/tests/lobby-ui.cjs
node crawl-ref/source/webserver/tests/party-setup.cjs
node crawl-ref/source/webserver/tests/lobby-navigation.cjs
node crawl-ref/source/webserver/tests/item-properties.cjs
node crawl-ref/source/webserver/tests/nested-tooltips.cjs
node crawl-ref/source/webserver/tests/tooltip-dismissal.cjs
node crawl-ref/source/webserver/tests/tooltip-dismissal-native.cjs
node crawl-ref/source/webserver/tests/chat-ui.cjs
node crawl-ref/source/webserver/tests/chat-multiplayer.cjs
node crawl-ref/source/webserver/tests/loading-ui.cjs
node crawl-ref/source/webserver/tests/dock-controls.cjs
node crawl-ref/source/webserver/tests/skill-training.cjs
node crawl-ref/source/webserver/tests/item-skill-training.cjs
WEBTILES_URL=http://localhost:19018 node crawl-ref/source/webserver/tests/context-menu-native.cjs
WEBTILES_URL=http://localhost:8892 node crawl-ref/source/webserver/tests/skill-training-native.cjs
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.skill_training_test -q
node crawl-ref/source/webserver/tests/character-guide.cjs
node crawl-ref/source/webserver/tests/character-options.cjs
WEBTILES_URL=http://localhost:8889 node crawl-ref/source/webserver/tests/starting-weapons.cjs
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.starting_weapons_test -q
WEBTILES_URL=http://localhost:8888 node crawl-ref/source/webserver/tests/library-smoke.cjs
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.chat_tags_test webtiles.game_library_test -q
```

The training browser contract checks decimal input, clearing, Off/On/Focus,
mode changes, draft/focus retention, keyboard isolation and responsive layouts.
The native training test requires an isolated local QA server and uses a new
three-hero expedition. It checks base/effective targets, mode selections,
companion isolation, Gnoll restrictions, rejected malformed requests, unchanged
turn clocks and save/resume. A controlled wizard skill increase verifies native
target completion. Final evidence is in `/tmp/dcss-skill-training-verified-proof/`;
the browser layout evidence is in `/tmp/dcss-skill-training-proof/`.

The smoke check requires Playwright, uses localhost only, and creates a new
`FolioQA…` account and four-hero expedition. `BROWSER_EXECUTABLE` can select an
installed browser. `THEME_PROOF_DIR` selects the screenshot/evidence directory
(default `/tmp/dcss-tabletop-proof`). Chat sending is intercepted before network
transmission. It checks both laptop sizes, all inspector tabs, modal tooltips,
chat focus/composition, encyclopedia navigation/search without spending a turn,
native item hover, resistance scales, direct inventory sharing, text escaping,
viewport containment, and browser asset errors. The lobby check also covers
mobile registration, sign-in/logout, quick-seat restoration, friendly-fire
switching, and a visible laptop launch action.

`chat-multiplayer.cjs` creates three isolated local accounts. A host and a real
P2 exchange a tagged native inventory item and a reply, while a third expedition
must receive neither. It checks pointer/focus tooltips, unchanged game clocks,
and absence of dungeon key input during chat. These tests never message an
existing player or open an existing save.
