# Party sidebar — tactical party panel (30 October 2026)

Area: the right column of the game HUD (`#right_column`): hero cards, turn
order, nearby creatures, inventory/powers mini panels and the minimap frame.

## What changed

**Hero card** (`party.js`, `party-card-status.js`, `party-card-readings.js`,
`party-sidebar.js`, `character-sheet.html`, `player-card-details.js` untouched)
- One component for the controlled hero and teammates; the controlled card is
  larger and highlighted (`.is-controlled-card`), teammates are quieter.
- New identity line `.party-hero-identity`: role badge (`.party-role-badge`,
  `data-role`) from the shared lobby vocabulary `static/scripts/hero-roles.js`
  (`roleForBackground(job)` → Frontline / Striker / Caster / Support / Scout;
  unknown background → unknown role), plus species and background text.
- HP/MP are `.tr-meter` meters: `#party_hp_<slot>` (existing) and
  `#party_mp_<slot>` (new, `role="meter"`, `data-meter`, `data-resource-state`).
  Label text stays `HP 24/40 → 12` so the health-bar tests hold.
- Readings now show a caption: `.party-reading-label` ("AC", "EV", "SH",
  "Floor", "Noise", "Move", "Stealth"); AC/EV/SH sit in
  `.party-defense-cluster` (role group "Defenses"). The XP progress bar gets an
  "XP" caption beside `.party-member-level` (its text is unchanged).
- Controlled hero: `character-sheet.html` restructures `#stats` into
  `.hud-defense-cluster` / `.hud-attribute-cluster` groups with visible
  `.hud-stat-label` captions (only shown inside `.party-self-details`; the
  native `.stats_caption` remains hidden there, as the tests require). Every
  `#stats_*` id is unchanged.
- Companion attributes/resistances (`party-sidebar.js`) carry a
  `.party-sidebar-label` caption and group titles.
- Status effects: icon frames unchanged, plus `.party-effect-names` naming the
  two most important effects (harmful first) and a "+N" overflow.
- Initiative: `.initiative-reading` text beside the meter — "Ready",
  "+12 banked", "−8 recovering", "Timing unknown", "Downed", "Other floor",
  "Own clock" (`party-initiative.readingText`).
- Faith row `.party-faith-row` (`#party_faith_row_<slot>`): deity, favour
  stars (★/☆ from native `piety_rank`), Gozag "gold", Xom "mood", penance badge,
  unknown state. Uses `party-status-model.faith`; nothing inferred.

**Turn-order rail** (`turn-order-rail.js`, markup in `party-roster.html`,
styles in `party-initiative.css`)
- `#party_turn_order` at the top of `#party_hud`; `#party_turn_order_track`
  lists heroes and personally visible enemies as `.turn-order-entry` buttons.
- Projection: heroes use `party-model.initiativeTimeline` (wait = recovery
  debt; banked time breaks ties); enemies use the native readings
  (`ready` → 0, else `energy_deficit × 10 / speed` aut). Entries without
  native timing are listed last in `data-timing-state="unknown"` and the rail
  title reads "timing unknown" when nothing is timed. Downed/other-floor heroes
  and remembered-only contacts are not placed ahead of anyone.
- Click hero → existing `.party-camera-btn` handler (centre camera). Click
  enemy → `enemy-initiative.locate(key)` (the banner's own cursor placement).
- No new engine data or messages.

**Nearby creatures** (`enemy-initiative.js`, `monster_list.js`,
`enemy-initiative.css`)
- Contacts carry the native `threat` tier; cards get `data-threat`
  (trivial/easy/tough/nasty/invisible/unknown), `data-attitude`
  (enemies/allies/neutrals) and `data-injury` (native damage band). Names
  colour by `--ui-threat-*` tokens with local fallbacks.
- Readiness line now reads "Recovering · lightly wounded" (native text);
  rows are more compact (46px).

**Inventory & powers** (`hud-inventory.js`, `hud-workspace.css`)
- Filters are one segmented control `.hud-segmented` with "All / Worn / Pack"
  captions (icon buttons keep their `data-item-filter` and `aria-pressed`).
- Spell buttons show `.hud-power-cost` and `.hud-power-fail` (native `fail`,
  "?%" when absent); `aria-label` includes cost/failure and the blocked
  reason. Blocked powers are `data-blocked="true"` with a readable dashed
  frame and strike instead of 44% opacity.

**Minimap** (`game.html`, `player-hud.js`, `nearby-creatures.css`)
- `#hud_minimap` summary is a frame label "Map" plus `#hud_minimap_floor`
  (floor name from `#stats_place`, "Floor unknown" otherwise). The caption
  also shows when `hud-bottom-strip.js` moves the map to the bottom row.

**Compact mode and 1024×768** (`player-card-sections.css`)
- `.workflow-compact-roster` collapses cards to portrait + meters + initiative
  (+ defense cluster). `@media (max-width: 1100px), (max-height: 800px)`
  tightens paddings, meter heights, item/power grids (96px, scroll inside) and
  the rail, so the right column scrolls without pushing inventory out.

## Why
The screenshot showed bare number clusters ("6 8 4 / 20 5 9"), icon-only
readings, no role, no turn order, and an unlabelled minimap. Every number now
has a caption; turn economy and threat are visible at a glance.

## How to verify
- `node --check` on every file under `game_data/static/` listed above.
- `node --test crawl-ref/source/webserver/tests/hero-feedback.test.cjs`
- `node crawl-ref/source/webserver/tests/{enemy-banners,initiative-bars,creature-roster,party-status,status-icons}.cjs`
- Brace balance of the touched CSS (python count of `{`/`}`).
- Not run (shared-host policy): browser/native tests
  (`health-bars*.cjs`, `companion-*.cjs`, `enemy-banners-native.cjs`,
  `party-*.cjs`, `inventory-secondary*.cjs`, `status-icons-browser.cjs`).
  Selectors they assert (`.party-bar-label` text, `.party-member-level` text,
  `.party-reading-value`, `[data-reading]` visibility, `.stats_caption:visible`
  = 0 in `.party-self-details`, `.party-def-badges` hidden) were preserved.

## Open requests for other areas
- DESIGN-SYSTEM: define `--ui-threat-trivial/easy/tough/nasty/invisible` in
  `ui-themes.css` for all three themes; the sidebar uses them with fallbacks.
  Also consider shared `.tr-meter` / `.tr-badge-role` component styles (the
  sidebar styles `.party-role-badge[data-role]` locally).
- GAMEPLAY-SHELL: `hud-reflow.css` hides `#hud_minimap > summary`; the
  sidebar overrides it for the labelled frame (`#normal #hud_bottom_map
  #hud_minimap > summary.hud-minimap-summary`). Fold that into the shell rule
  if preferred.
- PARTY-BUILDER: `hero-roles.js` unknown label is "Hero"; the game card labels
  the tooltip "[Role]". Keep `roleForBackground`/`badgeClasses` stable.
