# Welcome / entry — UI overhaul 2026-10-30

Area: first impression, sign-in, account dialogs, out-of-game navigation,
expedition loading card, lobby shell base.

## What changed

**Welcome hero** (`templates/client.html` `.welcome-entry`, `static/tabletop/welcome.css`)
- Pitch reframed as a 1–4 hero cooperative tactical dungeon crawl: "Gather your
  party. Descend together." with one paragraph covering shared floors/gold/spells,
  the initiative clock (banked time, recovery debt), friendly-fire choice and the
  daily seed. One flavour line remains (`.welcome-footnote`).
- Cooking-joke chips replaced by four value-prop cards (`.welcome-props`, inline
  SVG icons): Party of 1–4 heroes · Initiative-based tactical combat · Shared map,
  personal perception · Daily seeded expedition.
- Key art is now a framed composition (`figure.welcome-art`): a crop of the
  existing cover illustration (`--art-cover`, falling back to
  `assets/dungeon-threshold.png`) with a "war table" overlay — four hero seats
  (the staging-room default names Aldric/Lyra/Karn/Vex with role badges
  Frontline/Caster/Striker/Support) on an initiative line, and a "Shared floor ·
  Tactical combat" plate. No new binaries; `figcaption` is visually hidden for
  screen readers. `.welcome-entry` still carries `dungeon-threshold.png` in its
  background (lobby-ui test contract).
- `<title>` reads "Pebble Broth — Cooperative Tactics Roguelike".

**Sign-in fast path** (`client.html`, `welcome.css`, `static/scripts/client-auth.js`)
- `#login_message` is a styled callout; `client-auth.js` adds `is-error` /
  `is-busy` tones through a `set_status()` helper. Messages are more specific
  ("Enter your password to sign in.", "Waiting for a connection… try again in a
  moment."). Failed sign-in refocuses `#password`.
- Password visibility toggle (`#password_toggle`, `aria-pressed`,
  `aria-controls`); it re-masks automatically on submit. Enter still submits the
  form (`novalidate` so the inline callout is the validation surface).
- "Create an account" (`#reg_link`) is a full-width secondary button; forgot /
  change-email / change-password links are unchanged ids.
- No protocol messages changed; `tests/client-auth.cjs` passes.

**Account dialogs** (`client.html`, `static/tabletop/accounts.css`,
`static/scripts/client-dialogs.js`, `static/scripts/client-account.js`)
- Consistent modal shell: `role="dialog" aria-modal aria-labelledby tabindex=-1`,
  `.account-dialog-head` (title + lede), `.account-dialog-message.tr-callout`,
  `.account-field` label-above-input groups, `.account-dialog-actions` row
  (Cancel `.tr-btn`, primary `.tr-btn.tr-btn-primary`). Applied to #register,
  #change_password, #change_email, #floating_ok_message, #forgot, #forgot_2,
  #reset_pw and #exit_game. All ids/names/`.text`/`.button` classes retained.
- `client-dialogs.js`: for `[role="dialog"]` floaters, Escape closes, Tab is
  trapped, focus lands on the first text field, and focus returns to the opener
  on `hide_dialog()`. Native process prompts (#stale_processes_message,
  #force_terminate) and server-sent `handle_dialog` HTML are untouched.
- `client-account.js`: non-blocking password confirmation hints
  (`#reg_repeat_hint`, `#chpw_repeat_hint`, `#reset_pw_repeat_hint`, `aria-live`,
  `aria-invalid`); submit still performs the authoritative check. Register
  message is cleared on open.
- Email note is now "Add one if you want to be able to reset a forgotten
  password. Nothing else is sent." with an "optional" label.
- `.tr-btn` / `.tr-btn-primary` / `.tr-card` did not exist when this was
  written; they landed later in `static/tabletop/tactics-components.css` (imported by
  `ui-themes.css`, which `client.html` does not link yet). Minimal local equivalents remain scoped under
  `.account-dialog`, `.account-notice` and `.admin-tools` in `accounts.css` so the
  dialogs render without that sheet. Once `tactics-components.css` is linked in
  the lobby, delete the scoped copies (they intentionally out-specify the globals).
- `#account_restricted` is a `.tr-callout` notice; `#admin_panel` is a quiet card
  (ids unchanged).

**Out-of-game navigation** (`templates/outgame-navigation.html`,
`static/tabletop/navigation.css`, `static/styles/connection-quality.css`)
- The records/stats bar now mirrors the lobby bar: emblem + brand (kicker
  "Cooperative tactics roguelike"), sections Play · Saved · Join · Chronicle ·
  Records · Stats (full/short labels), account `details` menu (paper menu, logout
  inside), "Sign in" chip when anonymous. The partial carries its own
  `<link>` to `navigation.css`, so stats/library pages get the shared styles
  without touching their heads. Legacy classes (`.library-navigation`,
  `.archive-account`, `.archive-sign-in`, `.outgame-label-*`) are kept for
  `archive-navigation.js`, other stylesheets and `tests/logout-browser.cjs`.
- `navigation.css` styles `#lobby_navigation` and `.outgame-nav` with the same
  tokens: sticky bar, brass bottom-bar active state (`aria-current`), visible
  focus rings, 40px targets, connection chip at the right edge. ≤1000px: sections
  drop to their own row; ≤600px (covers 390px): compact brand, short labels, one
  horizontally scrollable section row with scroll-snap, narrow account summary.

**Loading screen** (`static/scripts/loading-ui.js`, `static/tabletop/loading.css`,
`static/scripts/game-loading.js`)
- Card now shows "EXPEDITION LOADING · A new chapter awaits", the status line
  (`#loader_text`, unchanged strings and timing), a **party roster** read from the
  staging DOM (`#party_slots_grid .party-slot-box` not `slot-state-closed`: hero
  name, species + background, role badge) and a three-step **progress strip**
  (Tiles & textures / Hero sheets / Dungeon floor) driven by a new read-only
  `loadingState.progress()` snapshot. Readiness logic (`begin/mark/setLayer/
  setPopupCount/cancel/fail`) is unchanged; `#loading_return` remains outside the
  card and is styled as a quiet button.
- Role badges use the shared `hero-roles` module (`roleForBackground`,
  `badgeClasses`, `data-role`); `loading-ui.js` guards for its absence because the
  offline loading fixture loads the file with a single dependency.

**Lobby shell** (`static/styles/lobby-base.css`, `static/styles/lobby-shell.css`,
`static/tabletop/outgame-hierarchy.css`)
- `#lobby` uses `--tt-page-gutter` gutters, `box-sizing`, `max-width: 100%` and
  `overflow-x: clip` (sticky nav still works); media and lobby tables are capped
  at 100%. Generic `.floating_dialog` base is modernised for server dialogs.
  `#overlay` dims less while an account dialog provides its own scrim. Custom
  server banners read as a quiet notice when signed in.

**Copy**: `templates/site-resources.html` footer intro mentions the 1–4 hero
party; "Plan a build" → "Plan a hero". `banner.html`, `logout.html`,
`shutdown.html` unchanged.

## How to verify (light)
- `node --check` on client-auth.js, client-account.js, client-dialogs.js,
  loading-ui.js, game-loading.js — pass.
- `node crawl-ref/source/webserver/tests/client-auth.cjs` — pass.
- Brace/paren balance script over all touched CSS — balanced.
- Browser checks (not run here, shared-host policy): `tests/lobby-ui.cjs`
  (welcome at 1280/1920/390, register dialog ≤390), `tests/loading-ui.cjs`
  (card ≤ 390×680, recovery link contract), `tests/logout-browser.cjs`
  (`.archive-account summary` / `.lobby-account summary`, 44px logout).

## Open requests for other areas
- **design-system**: ship global `.tr-btn`, `.tr-btn-primary`, `.tr-callout`,
  `.tr-card`; then remove the scoped equivalents from `accounts.css`. Link
  `tabletop/ui-themes.css` in `client.html` / stats / library so the `--ui-*`
  fallbacks used here become live theme tokens.
- **lobby/navigation owner (`static/scripts/lobby-navigation.js`)**: change the
  brand kicker "Field guide & tavern" to "Cooperative tactics roguelike" to match
  the welcome and records bars; consider adding Records (`/games`) alongside the
  external Stats link so the six sections match `outgame-navigation.html`.
- **profile / graphics pages (`templates/profile.html`, `templates/graphics.html`)**:
  include `outgame-navigation.html` (with `outgame_section` set) so settings pages
  share the top bar; today they only have a "Return to the tavern" link.
- **design-system**: link `ui-themes.css` (which imports `tactics-components.css`)
  in `client.html`, stats and library heads; the welcome war-table seats already carry
  `data-role` attributes for the shared role colours.
- `templates/client.html` is at the ~600-line convention limit; the dialog block
  could move to an `account-dialogs.html` include.
