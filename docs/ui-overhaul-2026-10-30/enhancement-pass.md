# Enhancement pass — clipping, clarity, Baldur's Gate flourishes, responsiveness (30 October 2026)

Branch: `claude/trusting-brahmagupta-ba643d`, built on the merged screenshot branch
(`claude/ui-overhaul-screenshots-a44fc1` at be8ac92fb3). Scope is the WebTiles
browser client only: no engine, protocol, save or server change. The brief in the
user's words: "no text clipping; enhanced information clarity, design flourishes to
evoke Baldur's Gate, more responsive gameplay", with a fifth goal added mid-pass:
"strong composure, alignment, etc. with clear visual lines in our design".
The parent branch's later portrait-arch commit (43429d4e3e) is merged in; the medallion
keeps its arch radius and the gilt tokens.

## Clipping and overflow fixes

| Where | Before | Fix | Files |
| --- | --- | --- | --- |
| Party builder seat tabs | "ShotQA…", "Deep Elf C…", "Gargoyle E…" at 1440 and 1024 | The roster strip is a container; four seats across only when each gets ≥260px, otherwise a 2×2 grid, and under 540px whole 220px seats scroll sideways. Names and builds wrap to two lines instead of truncating. | `static/tabletop/party-setup.css` |
| Species/background blurbs in the builder | Two-line clamp cut "Enchanters know a variety of Hexes that…" | Three-line clamp | `static/tabletop/character-builder.css` |
| Controlled hero card | Name inside the 42px portrait: "ShotQA6…" | The name is appended to the readings row (`.party-member-meta`) at 13px title weight with the initiative reading at its right; compact roster keeps it visible. | `game_data/static/party.js`, `styles/player-card-sections.css`, `styles/party-card-readings.css`, `styles/hud-reflow.css` |
| Companion cards | Names collapsed to "L", "K", "V" once "+10 banked · −1020 recovering" appeared | The name keeps its width and wraps if it must; the reading breaks at the dot onto a second line (`max-width: 17ch`) instead of running off the card. | `styles/party-card-readings.css` |
| Turn-order strip | Fourth hero clipped ("P4 V"), names ellipsised | Entries wrap onto further rows (`flex-wrap`), names are whole; a long rail (many enemies) scrolls vertically after three rows. The 150/120/110px entry caps are gone. | `styles/party-initiative.css`, `styles/player-card-sections.css` |
| Enemies rail | "Recovering · not wo…" | Readiness wraps to two lines | `styles/enemy-initiative.css` |
| Mission bar | Chips wrapped onto a second line when the latency chip appeared; at 1024 the facts stacked in a column under the tools | One row with `flex-wrap: nowrap` at ≥1300px (the redundant "Mode" caption is removed, gaps 14→10px, status column no longer `flex: 1 1 0`); below 1300px a deliberate second row carries the expedition facts while hero, mode, turn and view tools stay on the first. Measured 46px tall in all three themes at 1440. | `styles/tactics-shell.css`, `templates/game.html` |
| Command tray (More ▸ Commands) | Tools/Move/Inspect columns rendered empty: the group caption's `flex-basis: 100%` meant full *height* once the group became a column, so every button sat below the fold | Caption `flex: 0 0 auto`, groups `flex-wrap: nowrap`, the list scrolls inside the tray (`max-height: min(56vh, 460px)`) | `styles/tactics-shell.css` |
| Combat log | The whole `#hud_bottom_row` (minimap + log) sat at y=912 in a 900px window at every size: the direction pad was caught by the shell's blanket `position: relative` rule and took 152px of flow between the dock and the log | `#direction_pad` excluded from that rule, so it floats over the dungeon as `direction-pad.css` intends; the bottom row now ends exactly at the window edge at 1440×900, 1280×800 and 1024×768 | `styles/gameplay-shell.css` |
| Hero sheet | WEAPON box broke "Nothing wielded" mid-word | Twelve-track stat grid: four attributes, three defenses, weapon on its own full-width row; `overflow-wrap: break-word` | `styles/party-inspector.css` |

## Clarity

- Mission bar: the connection chip reads **Ping · 1 ms** like the other facts (caption, chip frame, coloured dot by quality) instead of an unlabelled dot.
- Compact roster (auto at ≤900px tall with 3+ heroes): the controlled hero now shows its **AC / EV / SH** defense cluster like the companions do, without the floating "Defense" caption colliding with the chips.
- Turn-order: the heading's "timing unknown" note sits after the engraved rule; the first entry's marker glows so "who acts next" is read before any text.
- Combat log: turn separators are a labelled engraved rule; damage lines carry a red gradient and a soft glow, still 12px on a dark panel.
- Action acknowledgement chip (below) names the command and its key, so a keyboard player sees what the engine received.

## Baldur's Gate flourishes

New tokens per theme in `static/tabletop/ui-themes.css`: `--ui-gilt`, `--ui-gilt-deep`,
`--ui-gilt-glow`, `--ui-leather`, `--ui-engraved` (gold on folio, cold steel on dungeon,
flat white/yellow with no glow on contrast; a darker gilt on parchment surfaces). New
components in `static/tabletop/tactics-components.css`: `.tr-gilded` (+`.is-lit`),
`.tr-medallion` (+`.is-lit`), `.tr-rule-engraved` (+`.is-centered`), with forced-colours rules.
Applied through existing selectors (no DOM renames):

- Mission bar and command dock: leather gradient, double gilt hairline, an engraved gold rule along the bottom edge that turns red in Tactical Combat.
- Hero cards: leather panel with a gilt inner hairline; the controlled card's line is stronger; the acting hero's card and medallion are lit (gold glow). Portrait medallions get a second gilt ring.
- Turn-order rail: gilded frame, illuminated small-caps title with an engraved rule, lit active entry.
- Folio dialogs (`#ui-stack` popups) and the pause menu: a gilt hairline inside the parchment inset; titles sit on a crimson→rule gradient instead of a flat border.
- Hero sheet: portrait medallion with hero-colour ring inside a gilt ring, gilded banner frame, section titles with a ❖ ornament and tapering rule.
- Party builder: seat portraits in arched gilt medallion frames; the selected seat is lit (crimson frame, gilt inner line, soft glow).
- Combat log: engraved turn rules, dramatic damage lines.

## Composition and alignment

Measured with a Playwright probe (`scratchpad/align.cjs`, logs `align-before-measure.txt` /
`align-after-measure.txt`) that records left/right edges, row heights and caption sizes of
every chip, label and panel on the builder, mission bar, sidebar, dock and hero sheet.

Tokens (`static/tabletop/tokens.css`): `--tt-type-caption: 10px` (the one tertiary text
style), `--tt-hud-row: 28px` (every mission-bar chip and tool), `--tt-hud-gutter: 8px`
(every sidebar panel's inner padding). Component: `.tr-caption` in `tactics-components.css`.

| Surface | Before | After |
| --- | --- | --- |
| Mission bar rows | Five chip heights on one strip: mode 28, turn 22, facts 26, tools 30, zoom value 20 (tops 7–12px) | One 28px row, all chips top-aligned at 8px; zoom value 22px centred. Faint vertical rules separate hero · mode · turn · facts · tools. |
| Captions | 8.5px (AC/EV/SH labels, cluster title), 9px (turn order, combat log, Act/Quick, turn separators), 9.5px (initiative reading), 10px (mission labels) | All 10px, 600 weight, .08em small caps, muted ink. Primary text stays 13px title weight (hero names), secondary 12–13px values. |
| Sidebar gutters | Cards 7px, turn-order rail 6px, planner 7/8px, ping bar 7px | All on the 8px gutter; card inner sections bleed by the same 8px. Rail, cards, ping bar and planner share the same left and right edge (1092–1430 at 1440). |
| Companion readings | Defense chips indented 2px with a stray rule, so AC sat 2px right of the HP bar | Flush with the bars and the hero name (one left edge for name, defenses, bars) |
| Dock | Menu / Common hotkeys at 32px beside 40px controls | 40px, so the dock's top and bottom lines run straight through every control |
| Hero sheet | Aut strip padded 12px against a 16px banner; stat labels could wrap | 16px inner gutters; labels `nowrap`; the twelve-track stat grid keeps all rows aligned |
| Folio dialogs | 20px side padding against the hero sheet's 24px | 24px, one gutter for every parchment surface |
| Builder | Seat tabs 8/10px padding, composition card 14/16px, "Party at a glance" 20px beside "Expedition rules" 18px | Seat tabs 10/12px, composition card 16px, both section headings 20px chapter crimson |

## Responsiveness

- New `game_data/static/action-feedback.js` (mounted from `adventure-ui.js`): observes the existing input paths only (document `click` capture on dock buttons, quick slots, direction pad, view tools, tray commands, planner Go; `game_keydown`/`game_keypress` for gameplay keys when input mode is NORMAL/COMMAND and no popup is open). On each command it (1) adds `is-activated` to the control for 120ms, (2) pulses the controlled hero's medallion (`is-acting`, 240ms, reduced-motion safe), (3) shows a `#mission_ack` chip over the dungeon ("o Auto-Explore", "5 Rest", "Move ↑") in a *sent* state, which ticks to *done* on the next `player_state_changed`/`party_state_rendered` and fades 600ms later (1.5s cap if nothing returns). It never sends, translates or repeats a native command. Verified live: pressing `5` gave `{text: "5Rest", dockActivated: true, ring: true}` within 40ms; clicking Explore gave the pressed state and a *sent* chip within 30ms, *done* after the engine update.
- Pressed/sent visual state for dock buttons, quick slots, view tools and tray commands (`.is-activated`), matching the direction pad's existing feedback.
- Durations on the action path trimmed to ≤120ms: direction-pad highlight 180→120ms, `.tr-meter` fill 180→100ms, portrait cooldown ring 160→120ms, planner progress 250→120ms, hero-sheet meters 220→120ms, lobby cards 140→120ms. Ambient effects (portrait atmospheres, encounter banner) are unchanged.
- `display.js` already coalesces map/player/party packets into one `requestAnimationFrame`; no change was needed there.

## Verification

- Alignment probe after the composition pass: every mission-bar chip measures 28px tall at the same top; sidebar captions all 10px; rail, cards, ping bar and planner share one left and right edge.
- `node --check` on every touched script (`party.js`, `direction-pad.js`, `adventure-ui.js`, `action-feedback.js`, `tests/render-benchmark.cjs`): pass. Brace balance on all 19 touched stylesheets: balanced.
- Browser-free suites: `tactical-planner`, `display-frames`, `quickbar-model`, `initiative-bars`, `party-status`, `enemy-banners`, `creature-roster`, `status-icons` pass; `node --test shell-animation hero-feedback encounter-feedback graphics-preferences` pass.
- Render benchmark (`tests/render-benchmark.cjs`, 30 iterations, same headless Chrome, base export of be8ac92fb3 vs this tree). The fixture needed `encounter-banner` in its module list (the merge made `dungeon_renderer` depend on it; without the stub the benchmark fails on the base tree too); that one-line fix is included. Medians are unchanged within noise: classic full repaint 1.7/1.7ms, illustrated full repaint 2.6/2.6ms, premium full repaint 4.5/4.7ms, premium packet 14.5/13.9ms, premium camera step 6.1/5.7ms (base/after). None of the renderer modules were touched.
- Single-browser Playwright visual pass on an isolated `util/qa_server.py` runtime (port 8911, runtime `/tmp/dcp-eh/rt`, existing native build `/private/tmp/dcss-builder-validation-01a18b22`), DPR 2, with an automated overflow audit (every text-bearing element whose `scrollWidth`/`scrollHeight` exceeds its box under `overflow`/`text-overflow` clipping; visually-hidden `.hud-icon-only-label` excluded). Before: 6 hits in the builder at 1440, 2 at 1024, 2 in-game at every size, 3 more once heroes were recovering. After: **clean** at builder 1440/1024/390, game 1440/1280/1024, contrast theme, hero sheet, and in combat after exploring. Page errors: none.
- No native build, no multi-browser batch (shared-host gate in `AGENTS.md`).

## Screenshots (scratchpad, 2880×1800 PNGs at DPR 2)

Directory: `/private/tmp/claude-502/-Users-iancaltabiano-Documents-Projects-dcss--claude-worktrees-trusting-brahmagupta-ba643d/97ce2d2d-5e42-4a65-8da2-574f0722c999/scratchpad/shots/`

| Surface | Before | After |
| --- | --- | --- |
| Game HUD 1440×900 | `before-game-1440.png` | `after-game-1440.png`, `after-game-1440-with-log.png` (combat log row on screen) |
| Mission bar crop | `before-game-mission-bar-1440.png` | `after-game-mission-bar-1440.png`, `after-game-mission-bar-contrast.png` |
| Turn-order strip | `before-game-turn-order-1440.png` | `after-game-turn-order-1440.png` |
| Party sidebar | `before-game-sidebar-1440.png` | `after-game-sidebar-1440.png`, `after-game-sidebar-combat-1440.png` |
| In combat (enemy rail, wrapped readings) | — | `after-game-after-explore-1440.png`, `after-game-enemy-rail-1440.png` |
| Action acknowledgement | — | `after-game-ack-key-rest.png`, `after-game-ack-dock-explore.png` |
| Command tray | `before-game-command-tray-1440.png` | `after-game-command-tray-1440.png` |
| Hero sheet | `before-game-hero-sheet-1440.png` | `after-game-hero-sheet-1440.png`, `after-game-hero-sheet-banner-1440.png` |
| Pause menu | `before-game-pause-menu-1440.png` | `after-game-pause-menu-1440.png` |
| 1280×800 / 1024×768 | `before-game-1280.png`, `before-game-1024.png` | `after-game-1280.png`, `after-game-1024.png`, `after-game-1280-with-log.png`, `after-game-1024-with-log.png` |
| High contrast | `before-game-contrast-1440.png` | `after-game-contrast-1440.png` |
| Party builder 1440 / 1024 / 390 | `before-builder-4-heroes-1440.png`, `before-builder-1024.png`, `before-builder-390.png` | `after-builder-4-heroes-1440.png`, `after-builder-1024.png`, `after-builder-390.png`, `after-builder-roster-strip.png` |

Audit logs: `before-log.txt`, `after-log.txt` in the same directory; benchmark output
`../bench-base.txt`, `../bench-after.txt` (JSON alongside).

## Not verified / follow-ups

- Native and browser suites that assert the old hero-name placement (`companion-layout-native.cjs` expects slot 0's name inside `.party-member-top`; the controlled card now keeps it in `.party-member-meta`) were not run (heavy gate). `gameplay-shell-native.cjs`'s "name not clipped" assertion is what this pass satisfies.
- The acknowledgement chip's key map covers the dock keys, movement (hjklyubn, arrows, numpad) and common single-key commands; unknown keys produce no chip rather than a wrong one.
- The lobby only lists a saved game under "Saved expeditions" once two or more exist; the Play hub's Continue card showed only the first. Not a client regression from this pass, but worth a look for the hub.
