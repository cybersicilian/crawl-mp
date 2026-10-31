# Menus, dialogs and the hero sheet (2026-10-30 overhaul)

Area: every in-game popup under `#ui-stack`, the hero sheet
(`#party_inspector_modal`), the spell/ability picker, off-turn inspection,
prompts and context menus. Files live under
`crawl-ref/source/webserver/game_data/`.

## What changed

**Folio dialog shell** (`styles/menu-polish.css`, `styles/menu-surfaces.css`,
`popup-controls.js`). Every native popup family now shares one frame:
eyebrow row (hero context "P1 · Name — Species Job" with a role badge, plus
Close/Back with its Esc key cap), chapter-coloured title, optional capacity
chip ("3/52 gear slots"), segmented category/pane tabs, scrolling body, and a
footer band (selection summary, native `--more--` text, action bar, key
hints). The frame is `min(720px, 100vw - 48px)` wide (table menus 860px,
scrollers 780px, prompts 480px), uses `100dvh` so the footer stays visible,
and goes full-bleed below 700px. All colours come from `--ui-*` theme tokens
with parchment fallbacks (`--menu-*` on `#ui-stack`); the native `fgN`
palette switches to a bright set on the dungeon and contrast themes.

**Item rows** (`menu-presentation.js`, `menu-surfaces.css`). Rows read as
key cap · tile · name · status chips · right-aligned hint. Chips come only
from the native `equipped` flag and the engine's own name suffixes
(`(quivered)`, `cursed`); `data-row-hint` ("Select"/"Toggle") is rendered by
CSS so row text stays unchanged for tests. Native click and key routing is
untouched.

**Spell/ability menus** (`power-picker.js`, `styles/folio-controls.css`).
Cards gain `is-blocked` (readable muted text instead of a faded row) and a
"Quick cast" badge from the native `quick_cast` flag; cost, failure, level,
school and range were already present. Native spell tables keep their
column grid with tokenised colours.

**Descriptions** (`ui-layout-format.js` `stat_grid`,
`ui-description-layouts.js`, `styles/game-descriptions.css`). Runs of
"Label: value" pairs (weapon base stats, the spell `Level/School/Fail` line)
become a labelled `dl.workflow-stat-grid`; remaining prose stays in place.
The action bar sits in the footer band with the first native action styled
as primary.

**Hero sheet** (`party-inspector-render.js`, `styles/party-inspector.css`).
Still five tabs (test contract): Overview, Equipment, Powers, Skills, Traits.
Overview opens with portrait (native equipment art, initial fallback), role
badge, level, species/background, HP and resource meters, attributes, speed
strip, resistances, a new Faith card (name, piety stars, penance/standing
badges, summary, description) and statuses. Hero tabs run across the top.
All existing action contracts (`power_action`, item inspection,
`skill_training`) are unchanged.

**Prompts** (`templates/popup-templates.html`, `ui-layouts.js`,
`textinput.js`, `styles/game-popups.css`). Line prompts, the generic text
input, the seed dialog and progress bars are compact 480px modals with a
labelled field, the primary answer highlighted (`workflow-primary`) and
Enter/Esc key caps.

**Context menus / inspection dialog** (`styles/context-menu.css`,
`styles/inspection-dialog.css`). Shell chrome from theme tokens, uppercase
title, consequential entries separated by a rule, reduced-motion safe.

## Role vocabulary

`popup-controls.js` exports `role(member)` → `{ key, label }`, built on the
shared `static/scripts/hero-roles.js` vocabulary (Frontline / Striker /
Caster / Support / Scout) with the highest trained skill as a fallback when
the background is unknown. Badges use the design system's
`.tr-badge[data-role]`; hero-sheet meters use `.tr-meter` with a light page
track variant.

## How to verify

- `node --check` on every touched module; CSS brace balance script.
- Browser regressions (host-heavy gate): `tests/menu-surfaces.cjs`,
  `tests/menu-selection.cjs`, `tests/menu-columns.cjs`, `tests/menu-search.cjs`,
  `tests/menu-actions.cjs`, `tests/companion-rpg-stats.cjs`,
  `tests/folio-controls.cjs`, `tests/equipment-paperdoll.cjs`,
  `tests/context-menu.cjs`, `tests/offturn-windows.cjs`,
  `tests/skill-training.cjs`.
- Visual: open inventory (`i`), a weapon description, `z`, the hero sheet
  on all three themes at 1440×900, 1024×768 and 390px wide.

## Open requests for other areas

- Design system: `.tr-btn` / `.tr-segmented` / `.tr-kbd` are dark-chrome
  (HUD) variants, so page-surface buttons, tabs and key caps keep the local
  `.workflow-button` / `.workflow-categories` / `.workflow-key` rules keyed to
  `--ui-*` tokens. A page variant (`.tr-btn.is-page`, `.tr-kbd.is-page` is
  there already) would let menus adopt them directly. `.tr-badge` and
  `.tr-meter` are used as-is.
- Lobby party roster uses ad-hoc badges (`[Vanguard]`, `[Blaster]`,
  `[Hybrid]`…); adopt the five-role vocabulary above.
- Yes/no, `--more--` and the level-up stat prompt render in the message
  window (`messages.js`), not as popups; they need the same key-cap styling
  there.
- `session-menu.css` (Game menu) is outside this area; it already reads the
  shell tokens via `#session_menu` rules in `menu-polish.css`.
