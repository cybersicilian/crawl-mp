# Personal interface themes

Appearance & graphics now begins with a separate UI theme choice. Adventurer's
Folio is the default: dark leather, brass controls and parchment reading surfaces.
Dungeon uses slate, silver and dark pages. High Contrast uses solid black,
white rules and yellow interaction cues. The controls retain their locations.

The existing `/settings/graphics` account page, profile controls and in-game
Game menu share the selector. Changes apply immediately and save through the
existing private account preference contract. A failed save restores the last
confirmed theme. Other players retain their own appearance.

## Shared contract

`static/graphics-settings.json` declares the `ui_theme` choice. Existing account
rows without it use Folio; no database migration is required. `presetIndependent`
marks theme and motion as preferences that survive graphics-quality changes.
They do not make a matching rendering preset appear Custom. Classic remains
the default dungeon renderer, independently of the interface theme.

`graphics-preferences.js` applies confirmed and optimistic values through
`ui-theme.js`, including account changes and rollback. This adapter only chooses
a validated root attribute. During a switch it suppresses CSS transitions for
two frames so foreground and background change together; existing hover behavior
resumes afterward. It sends no game commands.

`tabletop/ui-themes.css` supplies semantic materials and maps the existing
`--tt-*` and `--art-*` contracts to them. `theme-components.css` adapts HUD,
common native reading menus, character/equipment folios and tooltips;
`theme-lobby.css` adapts common tavern reading surfaces. Graphics settings reuse
the same materials. Native dungeon canvases and game state are unchanged.

The general mechanisms are semantic materials, root selection and independent
preset metadata. Fantasy palettes and component selectors remain DCSS adapters.
Add a theme through the canonical schema, root selector, validation whitelist
and equivalent presentation checks. There is no theme-specific gameplay branch.

## Verification

Eight focused JavaScript preference tests and nine Python HTTP/persistence
tests pass. The isolated HTTP browser fixture checks all themes, fresh-device
persistence, account isolation, preset independence, failure rollback, keyboard
isolation, focus restoration, forced colors and a 390px layout. Common reading,
selected-row and field foreground/background pairs are measured in the rendered
browser. These checks do not establish formal accessibility compliance.

The fixture uses the shipped component styles with synthetic content. Full native
game checks also pass for all three themes using an explicitly bound existing
binary, atlas and disposable account/save. They capture play, inventory, character
and equipment, verify no native commands from the theme selector, and retain a
world clock of zero throughout. An initial tooltip-first Escape dismissal caused
a harness timeout; the capture harness now uses the folio's explicit Close button.

The existing local engine displays placeholder world/party tiles and reports
that action queues need an updated engine. These captures establish the new UI
materials, not atlas correctness or acceptance of newer gameplay capabilities.
No engine rebuild or public deployment occurred.

## Tactics-RPG vocabulary (2026-10-30 overhaul)

Every screen answers: who is my party, whose time is it, what threatens us,
what can I do now. The tokens and classes below are the shared words for that.
They are additive; nothing earlier in this document was renamed. All tokens are
declared per theme in `static/tabletop/ui-themes.css`; components live in
`static/tabletop/tactics-components.css`, imported by `ui-themes.css` (which
both CSS entries reach through `graphics-settings.css`).

### Semantic colour tokens (`--ui-*`)

| Group | Tokens | Meaning |
| --- | --- | --- |
| Faction | `--ui-hero`, `--ui-hero-ink`, `--ui-ally`, `--ui-enemy`, `--ui-neutral` | Active/controlled hero (gold), other party heroes, hostiles, neutrals. `-ink` is text on a solid hero fill. |
| Threat | `--ui-threat-low`, `--ui-threat-med`, `--ui-threat-high`, `--ui-threat-lethal` | Enemy danger tiers; also the `data-threshold` colours on meters. |
| Initiative | `--ui-init-banked`, `--ui-init-debt` | Banked time (cool) vs recovery debt (hot) on clocks and region credit. |
| Turn mode | `--ui-mode-explore`, `--ui-mode-combat`, `--ui-mode-ink` | Free Explore vs Tactical Combat badge/strip; `-ink` is text on a solid mode fill. |
| Resources | `--ui-res-hp`, `--ui-res-mp`, `--ui-res-gold`, `--ui-res-xp`, `--ui-meter-track` | Bar fills and the shared empty track. |
| Roles | `--ui-role-frontline`, `--ui-role-striker`, `--ui-role-caster`, `--ui-role-support`, `--ui-role-scout` | Hero role badges. |
| States | `--ui-focus`, `--ui-danger-ink` | Focus ring colour; text on a solid `--ui-danger` fill. |

Values are tuned for the dark chrome (`--ui-panel`, `--ui-canvas`) of each
theme. In Folio the parchment surfaces are light, so `ui-themes.css`
re-declares the whole group in ink weights on every known paper surface
(workflow popups, rich tooltips, session/help/power dialogs, inspector and
starting-sheet dialogs, lobby panels). New parchment surfaces add `.tr-on-page`;
dark islands inside a page (e.g. `.folio-equipment.is-crpg-layout`) add
`.tr-on-panel`. Dungeon and Contrast pages are already dark and need nothing.
Forced-colours maps the group to `CanvasText`/`Highlight`.

Scale tokens in `tokens.css`: `--tt-type-key` 11px (key hints only),
`--tt-type-label` 12px (the floor for anything a player reads),
`--tt-type-body` 13px, `--tt-type-reading` 14px, `--tt-type-value` 15px,
`--tt-type-entry` 19px, `--tt-type-section` 23px, `--tt-type-title` (clamp);
`--tt-radius-1/2/3` (3/5/8px); `--tt-motion-fast/base` (100/180ms);
`--tt-meter-height` 10px; `--tt-tip-width` 360px; `--tt-focus-ring` and
`--tt-focus-offset`. `typography.css` enforces the 12px floor on every HUD and
lobby label and keeps 11px for `kbd`, `.dock-key`, `.quickbar-key`, `.tr-kbd`.

### Focus ring

One rule in `theme-components.css`:
`outline: var(--tt-focus-ring); outline-offset: var(--tt-focus-offset)` on
`:focus-visible` for buttons, links, inputs, selects, summaries, textareas,
`[tabindex]` and `[role=button]`, lobby and game alike. `--ui-focus` is the
accent on chrome and `--ui-chapter` on Folio parchment, so no surface needs
its own override; `materials.css` keeps a `--tt-brass-light` fallback.

### Component classes (`.tr-*`)

All are theme-aware (tokens with literal fallbacks), reduced-motion safe and
have forced-colours rules. Use existing ids/`data-*` for behaviour; these only
describe presentation.

- `.tr-badge` — pill. Variant by attribute: `data-role="frontline|striker|caster|support|scout"`,
  `data-mode="explore|combat"`, `data-faction="hero|ally|enemy|neutral"`,
  `data-threat="low|med|high|lethal"`, `data-initiative="banked|debt"`.
  Modifiers `.is-solid` (filled), `.is-quiet` (outline only), `.is-sm` (18px).
  `hud-iconography.badge(kind, value)` builds one with the matching glyph.
- `.tr-meter` — `grid: label | track | value`. Children `.tr-meter-label`,
  `.tr-meter-track > .tr-meter-fill` (+ optional `.tr-meter-ghost` for
  previewed loss), `.tr-meter-value`. Fill width is `--tr-meter-pct` (set
  inline). `data-resource="hp|mp|gold|xp|banked|debt|enemy"` picks the colour;
  `data-threshold="low|critical"` recolours (critical pulses unless reduced
  motion). Layout modifiers `.is-stacked` (track on its own row), `.is-bare`
  (track only), `.is-thin` (6px). Put `role="meter"`/`aria-valuenow` on the root.
- `.tr-stat` — icon + `.tr-stat-label` + `.tr-stat-value` cell (never a bare
  number). `.is-inline` puts the three in one row; `data-tone="good|warn|danger"`
  colours the value. `.tr-stat-grid` wraps a row of cells.
- `.tr-kbd` — key hint (11px mono cap). `.dcss-tip-badge`, `.tr-btn > kbd`
  and `.tr-card kbd` share the look; `.is-page` is the parchment variant.
- `.tr-btn` — secondary by default. `.tr-btn-primary` (one per screen),
  `.tr-btn-quiet`, `.tr-btn-danger`; sizes `.tr-btn-sm`, `.tr-btn-icon`,
  `.tr-btn-block`; `[aria-pressed=true]`/`.is-selected`; hover, active,
  disabled and `[aria-disabled]` states. `.tr-actions` lays out a row with
  `.tr-actions-end` pushing destructive actions apart and `.tr-actions-split`
  forcing a wrap. Inside native workflow popups the id-scoped theme rules win;
  use the existing `.workflow-primary` there.
- `.tr-card` — `.tr-card-header` (with `.tr-card-title`), `.tr-card-body`,
  `.tr-card-footer`. `.is-active` draws the hero ring (also available as the
  `.tr-active-ring` utility on any element); `data-faction="enemy|ally"`
  tints the border; `.is-down` dims; `.is-compact` tightens padding.
- `.tr-segmented` — wraps `button`/`a`/`label`/`[role=tab|radio]` children;
  the selected child is `[aria-pressed|aria-selected|aria-checked="true"]` or
  `.is-selected`. `.is-block` fills its row.
- `.tr-callout` — info by default (`--ui-cold`), `.tr-callout-warn`,
  `.tr-callout-danger`, `.tr-callout-good`; optional leading `.tt-icon` and
  `.tr-callout-title`.
- Helpers: `.tr-row` (+`.is-nowrap`), `.tr-grow`, `.tr-stack`, `.tr-truncate`,
  `.tr-num` (tabular), `.tr-label` (uppercase 12px), `.tr-sr-only`.

### Role vocabulary

Use these five words and glyphs everywhere a hero is summarised, lobby and
game alike (`hud-iconography.vocabulary`):

| Role | Derived from | Glyph |
| --- | --- | --- |
| Frontline | melee/armour backgrounds, high AC or Fighting/Armour skills | `shield` |
| Striker | ranged, stabbing and high-damage weapon backgrounds | `blade` |
| Caster | spellcasting backgrounds, Spellcasting/school skills | `spark` |
| Support | healing, summoning, invocation and buff backgrounds | `heart` |
| Scout | stealth, traps, speed and exploration backgrounds | `eye` |

Modes: **Free Explore** (`explore`) and **Tactical Combat** (`autofight`).
Factions: Your hero (`user`), Ally (`heart`), Enemy (`skull`), Neutral
(`question`). Threat tiers: Low/Moderate/High/Lethal. Initiative: Banked time
(`time`) / Recovery debt (`slow`). Resources: Health, Magic, Gold, Experience.

### Rich tooltip contract

`tooltip-content.css` owns one card for `#lobby_rich_tooltip`,
`#dcss_rich_tooltip`, `#tooltip` and `.dcss-nested-tip`: `.dcss-tip-header`
(title in `--ui-chapter`, optional `.dcss-tip-badge` key cap), `.dcss-tip-body`
(facts grid, prose, search details), `.dcss-tip-meta` (context row). Width is
`min(--tt-tip-width, 100vw - 16px)`, type is 13px body / 16px title / 12px
meta, materials are `--ui-paper`/`--ui-ink`/`--ui-edge`. Cards open on hover,
tap and keyboard focus (`focusin` handlers in `player-interactions.js` and
`client-tooltips.js`) and are linked with `aria-describedby`.

### Icon atlas resolution and fallback

`static/ui-sprites/hud-sprites.json` names the sheet
(`hud-sprites.<sha256[:12]>.png`); `util/generate-hud-sprites.py` writes that
name into both the manifest and `item-properties.js`. The licensed sheets are
gitignored except the two un-ignored legacy files, so a fresh checkout can
reference a sheet it does not have. `status-icons.js` probes the manifest sheet
with `Image()` at load, then the committed `hud-sprites.f4c7e20144b6.png`
(same 16-column, 112-frame geometry), and sets
`html[data-ui-sprites="ready" | "legacy" | "missing"]` and dispatches
`ui-sprites-resolved`. In `legacy` every `.tt-icon > image` is re-pointed; in
`missing` each icon gains a `<text class="tt-icon-fallback">` glyph
(`icons.fallbackGlyph(name)`) that `properties.css` shows instead of the empty
image. `icons.labelled(glyph, label)` and `icons.name(element, label)` give
icon-only controls an accessible name and tip title.
