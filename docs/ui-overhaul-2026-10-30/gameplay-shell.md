# Gameplay shell — tactics-RPG overhaul (2026-10-30)

Scope: the left column of the in-game HUD (`game_data/templates/game.html`),
its layout/zoom code, the command dock, the combat log, the direction pad,
the quickbar and the pause menu. The engine stays authoritative; no new
commands or messages were added.

## What changed

**Viewport fits the column.** `game.js` now keeps a zoom mode: `null` means
"fit", a number is an explicit user zoom. On every `layout()` the fit factor
is `min(width, height) / (show_diameter × base tile)`, floored to 1/20 and
clamped to 1–2, and written to `dungeon_renderer.viewport_zoom` before
`fit_to()`. The renderer still floors to integer device pixels, draws whole
tiles beyond every edge and owns pointer→tile conversion, so hit testing is
unchanged (`tests/viewport-zoom.cjs` sizing/pointer cases pass with
non-level factors such as 1.2 and 1.35). Resulting tiles: 38 px at
1440×900, 33 px at 1280×800, 32 px at 1024×768 (never below native size).
`viewport-zoom.js` persists `"fit"` or the chosen level in
`dcss.viewport.zoom.v1`; the reset button is now "Fit dungeon to view", the
status reads "Fit · 120%", and stepping from fit moves to the next level
above/below the effective factor. `game.get_view_zoom()` reports
`{ fit, factor }`; `game_view_zoom_changed` fires after each layout.

**Mission bar.** `#party_turn_banner` is back in flow above the dungeon
(`hud-reflow.css` no longer hides it) and is one strip: hero portrait
(species tile) + "Controlling P1 · Name", a mode pill (`Free Explore` /
`Tactical Combat`, red accent in combat), a labelled **Turn** cell (native
`player.turn`, world clock in the tooltip), then the expedition facts from
`party-progress.js` (**Gold**, **Floor**, **Runes**, monster rhythm meter in
co-op) and the view tools (zoom out / fit / in with a value chip, Next hero,
Center camera). `mission-bar.js` only relocates and labels existing elements
and adds the portrait, clock and `data-mode`; `party.js`,
`gameplay-controls.js` and `party-progress.js` keep writing the facts.
`hud-bottom-strip.js` no longer moves the view tools into the map strip.
`hud-layout.js` already measures the banner, so the dungeon height accounts
for it.

**Command dock.** Primary row (icon + short label + tiny key hint):
Explore, Fight, Rest, Pick up, Up stairs, Down stairs, Inventory, Cast,
Ability. The tray (`#quickbar_more`) lists everything else in a two-column
grid under **Move / Inspect / Expedition** plus **Tools**, each entry with
icon, name and `kbd` hint. Explore/Fight/Rest/Pick up are disabled with the
reason as title whenever `workflow-actions.reason()` blocks the hero
(spectating, not controlling, downed, waiting in the combat queue, prompt
open); stairs, spells and abilities keep their existing guards.
Quick slots are 40 px sockets with key badge, cost/quantity and a dashed
empty state.

**Combat log.** `messages.js` adds presentation data from fields the engine
already sends: `data-channel`/`msg-*` classes, `is-damage` for `MSGCH_DANGER`
or "X hits you" lines, `is-turn-start` + `data-turn` on the first line of each
game turn (CSS draws "Turn N —"; rollback removes whole lines so separators
never outlive their message), and `msg-hero` + slot colour from `recipient`
in co-op. `--more--` is a pill with "any key continues". Minimum font 12 px;
the region is labelled "Combat log" and remains keyboard scrollable.

**Direction pad / quickbar / mobile input / arrangement mode** are restyled
on the shared tokens (`--ui-*` with fallbacks) in `styles/tactics-shell.css`;
behaviour, ids and the `is-activated` feedback are untouched.

**Session menu.** Header carries "Expedition paused" + hero context
(P-slot, name, floor, level). Resume is the single primary button; Save keeps
playing; Appearance, Common hotkeys and Profile are grouped; "Save and quit to
lobby" sits apart with a note. Save and quit still goes through
`library.save(true)`, which owns the party-wide confirmation.

## Files

- `game_data/templates/game.html` (left column only)
- `game_data/static/game.js`, `viewport-zoom.js`, `hud-bottom-strip.js`,
  `mission-bar.js` (new), `adventure-ui.js`, `gameplay-controls.js`,
  `quickbar.js`, `messages.js`, `session-menu.js`
- `game_data/static/style.css` (imports), `styles/tactics-shell.css` (new),
  `styles/combat-log.css` (new), `styles/session-menu.css`,
  `styles/hud-reflow.css`

## How to verify (light)

```
cd crawl-ref/source/webserver
node --check game_data/static/{game,viewport-zoom,hud-bottom-strip,mission-bar,adventure-ui,gameplay-controls,quickbar,messages,session-menu}.js
node tests/display-frames.cjs; node tests/quickbar-model.cjs; node --test tests/shell-animation.test.cjs
```
`tests/viewport-zoom.cjs` currently fails before any assertion because its
renderer fixture predates the `./chain-view` (and now `./encounter-banner`)
dependencies of `dungeon_renderer.js`; with `'./chain-view': { attach }`
added to the fixture it passes all 117 sizing/pointer cases, including
fit-style factors.

Not verified here (no servers/browsers allowed): the Playwright and native
suites (`dock-controls`, `hud-input`, `session-menu`, `common-hotkeys`,
`quickbar-hotkeys`, `direction-pad-*`, `gameplay-shell-native`,
`hud-workspace-native`), real rendering at 1024×768 / 1440×900, the three
themes.

## Open requests for other areas

- **Tests:** `tests/party-hud-actions-native.cjs` lines 126–127 assert the
  zoom and camera buttons live in `#hud_map_tools`; they are now in
  `#mission_bar_tools` inside `#party_turn_banner`. Update the selectors.
  `tests/viewport-zoom.cjs` fixture needs `'./chain-view'` (and
  `'./encounter-banner'`) stubs.
- **Sidebar agent:** `#hud_minimap` summary markup is hidden inside the
  bottom map strip (`hud-reflow.css` `#hud_minimap > summary { display: none }`);
  if the new `#hud_minimap_floor` label should be visible, say where.
- **Design system:** the shell reads `--ui-mode-explore`, `--ui-mode-combat`,
  `--ui-hero`, `--ui-action`, `--ui-action-text`, `--ui-page-scheme`; all have
  fallbacks. A contrast-theme pass on the mission bar and dock would be welcome.
