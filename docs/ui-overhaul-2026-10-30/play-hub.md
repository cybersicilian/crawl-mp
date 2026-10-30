# Play hub — UI overhaul 2026-10-30

The Play workspace is now a campaign hub rather than a tavern notice board.
Every section answers "what can I do right now" with one primary action, and
heroes are shown as first-class chips (name, species/background, level, role).

## What changed

**Play home** (`lobby-overview.js`, `lobby-dashboard.css`)
- Order is Continue → New expedition → Join friends → Other ways to play. When
  there is nothing to continue, the empty Continue callout drops below the
  banner so new players see the primary call to action first.
- Continue clones the saved-expedition cards (same component as the Saved
  expeditions view) with the roster, floor, turn, mode, party size and last
  save, and keeps only the primary Resume / Return to game link (same href and
  `data-library-load`).
- The banner holds the single New expedition button (the only visible
  `[data-lobby-create]` on the Play view) and the daily seed as a secondary
  card; a "parties gathering on today's seed" line appears when room rows carry
  `data-room-seed`.
- Join friends summarises gathering parties and live games as cards (host,
  roster, open seats, friendly-fire rule, mode, turn, watchers) with Join/Watch.
  Room cards forward their click to the original `.btn-join-party-room`; live
  cards reuse the original resume/watch href and the existing
  `pending_auto_join_party` flag. No new messages are sent.

**Other ways to play** (`lobby-modes.js`)
- Compact card grid, tutorial first and marked "Start here". The launch name
  field moved out of the page header into the "Solo and challenges" group it
  actually affects.

**Saved expeditions** (`library-ui.js`, `lobby-workspace.css`)
- Card component: title + state badge, labelled facts (Floor, Turn, Mode,
  Party), hero chips with slot colour and role badge, last save, and a primary
  action column. Delete save is separated below a rule, ghost-danger styled,
  and still behind the existing confirm.
- Immediate filters: search, Mode (shown when more than one mode exists) and
  Party size; a status line reports "n of m shown". Empty state is a callout
  with a New expedition button.

**Join friends** (`lobby-discovery.js`, `client.html`, `lobby-workspace.css`)
- `#party_rooms_table` and `#player_list` keep their ids, row and cell classes
  (`.username`, `.coop_join`, `.god` …) and are rendered as responsive card
  grids with per-cell labels; the live table's header row becomes a "Sort by"
  chip strip so tablesorter still works. "Show full details" still reveals
  god / idle / watching / milestone.

**Chronicle** (`client-chronicle.js`, `lobby-browser.js`, `client.html`)
- Three collections — Party builds, Ghosts, Relics — as a trophy hall with
  count badges in the headers, a hint under each, roster chips with role
  badges on builds, labelled score/MVP/seasoning badges, and "Use build" as
  the primary action. Inline terminal colours were replaced by classes.

**Navigation** (`lobby-navigation.js`, `lobby-dashboard.css`)
- Section tabs get an underline active mark, visible focus and Left/Right/
  Home/End keyboard movement. The account disclosure is a real menu:
  `aria-haspopup`/`aria-expanded` on the summary, `role="menu"` with
  `menuitem`s, Arrow/Home/End navigation, first item focused on keyboard open,
  Escape returns focus, focus-out closes.

**Chat** (`chat.js`, `chat.css`)
- Theme-aware via `--ui-*` tokens with folio fallbacks, collapsible caption
  with chevron and `aria-controls`, and hero colour tagging: a line whose sender
  matches a party member (username/owner/name) gets `data-hero-slot` and the
  seat colour used by the HUD.

**Shared vocabulary** — new `static/scripts/hero-role.js` is a thin lobby
decorator over the shared `hero-roles.js` (Frontline / Striker / Caster /
Support / Scout): it appends a `tr-badge` role badge with `data-role` to any
`[data-hero-job]` element (saved cards, Continue, chronicle builds and ghosts).
Paper-safe role colours are scoped under `#lobby`; the HUD keeps its own.

## Verification (light only)
- `node --check` on every touched script: hero-role, library-ui, lobby-overview,
  lobby-modes, lobby-navigation, lobby-discovery, client-chronicle,
  lobby-browser, chat — all pass.
- Python brace balance on lobby-workspace, lobby-dashboard, chat,
  layout-rhythm, lobby-experience CSS — balanced.
- Grepped every id/class/label used by `tests/lobby-navigation.cjs`,
  `lobby-ui.cjs`, `library-management.cjs`, `expedition-navigation-native.cjs`,
  `chat-ui.cjs`, `outgame-archive.cjs`; all still present.
- Not run (shared-host policy): servers, Playwright, native builds. Suggested
  acceptance: `tests/lobby-navigation.cjs`, `tests/library-management.cjs`,
  `tests/chat-ui.cjs` with `WEBTILES_URL`.

## Open requests for other areas
- PARTY-BUILDER: add `data-room-seed="<seed>"` on `#party_rooms_tbody tr` and a
  class (`is-on`/`is-off`) on the friendly-fire span instead of inline colours;
  the hub currently sniffs `style*="ef2929"`.
- DESIGN-SYSTEM: load `tabletop/ui-themes.css` in `client.html` so `--ui-*`
  tokens exist in the lobby (everything here falls back to folio/art tokens),
  and own the global `.tr-card/.tr-badge/.tr-btn/.tr-callout`; the hub's
  fallbacks are scoped under `#lobby`.
- DESIGN-SYSTEM: `tactics-components.css` colours `.tr-badge[data-role]` for
  the dark HUD; the lobby overrides with paper-safe `--role-*` tokens under
  `#lobby .hero-role-badge`. If light-surface role tokens are added globally,
  the lobby override can be dropped.
- The `library.html` archive page was left as is; its hero list could reuse
  the same chip markup if the archive agent wants it.
