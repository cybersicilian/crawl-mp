# Tactics-RPG UI overhaul — 30 October 2026

One coordinated pass over every WebTiles surface, from the welcome screen to
in-game menus, to make Pebble Broth read as a 1–4 hero cooperative tactical
roguelike RPG: who is in the party, whose time it is, what threatens us, and
what can be done right now. The engine, protocol and save formats are
unchanged; every change is browser presentation, markup and client logic that
reuses existing native commands and contracts.

| Area | Report | Highlights |
| --- | --- | --- |
| Design system | [design-system.md](design-system.md) | `tactics-components.css` (`.tr-badge/.tr-meter/.tr-stat/.tr-kbd/.tr-btn/.tr-card/.tr-segmented/.tr-callout`), faction/threat/initiative/role/resource tokens per theme, 12px label floor, one tooltip contract, text fallback when the licensed HUD atlas is missing |
| Welcome & entry | [welcome-entry.md](welcome-entry.md) | Party-first pitch with war-table key art, modal account dialogs, shared top bar, expedition loading card with roster |
| Play hub | [play-hub.md](play-hub.md) | Continue → New expedition → Join friends → Other modes; saved-expedition cards with roster chips; responsive live-game cards; chronicle trophy hall; keyboard menu |
| Party builder | [party-builder.md](party-builder.md) | Sticky command bar, four-seat roster strip with one focused editor, always-visible composition coverage and warnings, Expedition rules chips, side-sheet guides, shared `hero-roles.js` vocabulary |
| Gameplay shell | [gameplay-shell.md](gameplay-shell.md) | Fit-to-view dungeon zoom, mission bar, icon+label command dock, combat log with turn separators, pause menu |
| Party sidebar | [party-sidebar.md](party-sidebar.md) | Turn-order rail, labelled hero cards (role, defenses, attributes, faith, named effects, worded initiative), threat-coloured nearby creatures, segmented inventory filters |
| Menus & inspector | [menus.md](menus.md) | One folio dialog shell for every native popup, item status chips, stat grids in descriptions, hero sheet banner with faith card |
| Combat feedback | [combat-feedback.md](combat-feedback.md) | Action-queue planner with aut costs, hero/teammate map rings, threat reticles, numbered route line, floating HP numbers, combat start/clear banner |
| Settings & records | [settings-records.md](settings-records.md) | Grouped game-settings cards, theme swatch picker, profile texture gallery, responsive stats tables |

## Integration done after the area passes

- `templates/client.html` links `tabletop/ui-themes.css`, so the lobby resolves `--ui-*` tokens and the shared `.tr-*` components.
- `ui-themes.css` adds per-seat hero colours `--ui-hero-1..4` and threat aliases (`trivial/easy/tough/nasty/invisible`) on top of `low/med/high/lethal` so the sidebar, planner and map overlays share one palette.
- `hero-role.js` (lobby decorator) delegates to `hero-roles.js`; HUD, inspector, loading card and builder all use the same Frontline / Striker / Caster / Support / Scout vocabulary.
- Room rows in the party-room list use classes (`party-room-ff ff-on|ff-off`, `data-room-seed`) instead of inline colours.
- Navigation labels: "Appearance & graphics" and the kicker "Cooperative tactics roguelike".
- Tests: `tests/viewport-zoom.cjs` stubs the renderer's `chain-view` and `encounter-banner` deps; `tests/party-hud-actions-native.cjs` looks for zoom/camera controls in `#mission_bar_tools`.

## Verification

- `node --check` on every changed script; brace balance on all 67 changed stylesheets.
- Browser-free unit tests: 103 pass; the 7 failures are pre-existing `ENOENT` on build-generated `tileinfo-*.js` files that are not checked in.
- Plain-node contract suites pass: tactical-planner, display-frames, quickbar-model, status-icons, client-auth, viewport-zoom, enemy-banners, initiative-bars, creature-roster, party-status.
- Single-browser visual pass on an isolated `util/qa_server.py` runtime with an existing native build: welcome, registration dialog, Play hub, builder (1440 and 390 wide), loading card, in-game HUD at 1440×900 and 1024×768, inventory, pause menu. No Playwright suites or native builds were run (shared-host heavy gate).

## Follow-ups

- Browser suites that click seats 2–4 in the builder must select the seat tab (`#party_seat_tab_N`) or press `#party_seat_layout_toggle` first; the focused layout keeps all four editors in the DOM but shows one.
- The licensed HUD atlas named by `static/ui-sprites/hud-sprites.json` is not present in checkouts; regenerate with `util/generate-hud-sprites.py` or commit the generated sheet (licence permitting). Clients now fall back to text glyphs.
- Stats/library pages should receive the signed-in user's `ui_theme` from Python (`stats_http`/library handlers); `stats.html` already reads it.
- The lobby does not load `ui-theme.js`, so dungeon/contrast themes only apply in-game and on the graphics page today.
- `game-coop.css` still carries superseded `#dcss_rich_tooltip` rules that `tooltip-content.css` overrides; safe to delete.
