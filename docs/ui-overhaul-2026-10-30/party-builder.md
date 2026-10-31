# Party builder (staging room) — tactics-RPG squad screen

Part of the 2026-10-30 UI overhaul. Scope: `#party_room_view` in the lobby and the
client-staging / character-builder modules. No new server messages; every room
command (`party_room_update_slot`, `party_room_settings`, `party_room_launch`,
`party_room_leave`) and every element id / `data-*` attribute used by
`client-staging*.js` and the browser tests is unchanged.

## What changed

- **Sticky command bar** (`#party_room_command`, top of the room): expedition name,
  host, hero count (`#party_room_hero_count`), the primary
  "Begin expedition · N heroes" button, the status hint, a one-line
  **Expedition rules summary** with a score badge (`#party_rules_summary`,
  `#party_rules_score`), and a quiet/danger "Leave party". `#party_room_footer`
  now lives inside the command bar instead of being moved by `character-guide.js`.
- **Roster strip** (`party-roster-strip.js`, `#party_roster_strip`): the four
  seats as a `role="tablist"`. Each tab shows the native portrait doll, hero
  name, species/background, role badge, seat kind (You / Host / Friend / Companion /
  AI · Jev / Open seat / Closed) and readiness. Arrow keys move between seats.
  Selecting a tab sets `#party_slots_grid[data-active-seat]` and `.is-active-seat`
  on the matching `.party-slot-box`.
- **Single seat editor**: all four `.party-slot-box` cards stay in the DOM (ids
  `party_seat_editor_N`); in the default focus layout only the active one is
  shown (`#party_slots_grid[data-seat-layout="focus"]`). A "Show all seats"
  toggle (`#party_seat_layout_toggle`, persisted in `localStorage`
  `pebble.partySeatLayout`) restores the stacked view. The seat-kind buttons are
  a segmented control (`.party-slot-modes.party-seat-kind`); quick builds are
  role-badged cards; each identity row carries a role badge.
- **Party composition** (`party-composition.js`) is always visible beside the
  editor (≥1100px) or below it. It now starts with role coverage
  (Frontline / Striker / Caster / Support / Scout counts), damage-type coverage
  (Melee / Ranged / Magic) and a warnings list computed by
  `party-coverage.js` from catalog data. Native HP/MP/AC/EV/SH comparison follows;
  loading values are shown as "…" / "Loading stats…" and never invented. The
  comparison table switches to stacked rows via a container query when its
  column is narrow.
- **Expedition rules** (`client-staging-modifiers.js`, `#party_expedition_rules`):
  one chip group for the three Seasonings (with their advertised score bonus),
  Friendly fire (`#party_rule_friendly_fire`), Rune locks (`#campaign_rune_locks`,
  now an `aria-pressed` button) and the Traps select (`#campaign_traps`). Each chip
  has a one-line effect. `modifiers.render(room, isHost)` updates chips, disables
  them for guests and writes the sticky-bar summary. `#party_seasonings_bar` and
  `.party-seasoning-chip[data-seasoning]` keep their contract.
- **Role vocabulary** (`hero-roles.js`, UMD): `roleForBackground(nameOrJob)` →
  `{ key, label, short, summary }`, `damageForBackground(nameOrJob)` →
  `{ key, label } | null`, `ROLES`, `ORDER`, `DAMAGE`, `badgeClasses(key)`.
  Badges use `class="party-role-badge tr-badge" data-role="<key>"`, so the
  design-system `.tr-badge[data-role]` colours apply when
  `tactics-components.css` is loaded; a local fallback is in `party-setup.css`.
  In-game modules can `define(["hero-roles"], ...)` (baseUrl `/static/scripts`).
- **Guides / starting sheet** open as a right-hand side sheet
  (`.character-side-sheet` on `#character_guide_dialog`), still a modal `<dialog>`
  so Escape closes and focus returns to the opener. Dark page themes get token
  colours.
- `client-staging.js` marks each card with `data-seat-kind` / `data-seat-owner`
  and `#party_room_view.is-host|is-guest`; friendly-fire labels are plain
  "Friendly fire on/off"; inline colours are gone.

## Files

`templates/client.html` (only the `#party_room_view` block);
`static/scripts/`: `hero-roles.js` (new), `party-coverage.js` (new),
`party-roster-strip.js` (new), `party-composition.js`, `client-staging.js`,
`client-staging-controls.js`, `client-staging-modifiers.js`,
`character-builder.js`, `character-guide.js`;
`static/tabletop/`: `party-setup.css`, `character-builder.css`,
`character-guide.css`, `starting-sheet.css`.

## How to verify

- `node --check` on every script above (done). `node -e "require('./static/scripts/party-coverage.js')"`
  exercises the UMD path.
- CSS brace balance via a Python scan (done). Not verified in a browser: no
  servers or Playwright were run per the shared-host policy.
- Manual: create a party → the strip shows four seats, seat 1 active; click a
  seat or press Right arrow; toggle "Show all seats"; change a background and watch
  the role badge, coverage chips and warnings update; open a Guide and press
  Escape; shrink to 390px: strip scrolls horizontally, command bar stays sticky.

## Open requests for other areas

- **Tests** (`tests/`, not owned here): in focus layout only the active seat's
  editor is visible, so tests that click into seats 1–3 without selecting them
  (`lobby-ui.cjs`, `party-setup.cjs`, `chat-multiplayer.cjs`,
  `gameplay-workflows-native.cjs`, `companion-layout-native.cjs`,
  `character-roster-native.cjs`, `art-direction-native.cjs`,
  `display-frames-native.cjs`, `health-bars-native.cjs`, `lobby-navigation.cjs`)
  should either click `#party_seat_tab_N` first or click
  `#party_seat_layout_toggle` once after the room opens.
- **Design system**: `tactics-components.css` is not yet linked from
  `templates/client.html` / `static/style.css`; once it is, the local
  `.party-role-badge` fallback can shrink. Add `--ui-role-*` tokens to
  `ui-themes.css` if per-theme role colours are wanted (fallbacks are in place).
- **Lobby shell** (`lobby-workspace.css`, `lobby-dashboard.css`,
  `layout-rhythm.css`, `lobby-experience.css`): they still carry
  `#party_room_footer` / `#party_slots_grid` / `.party-room-banner > div:last-child`
  rules from the old layout. They are overridden here with higher specificity;
  they can be deleted.
- **In-game agents**: reuse `hero-roles.js` for party cards and the inspector so
  the lobby and HUD badges match.
