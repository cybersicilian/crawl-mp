# Settings & records (UI overhaul 2026-10-30)

Scope: game settings dialog, Appearance & graphics page and in-game dialog,
profile page, `/stats` records pages, archive record styling. No server,
protocol, schema or id/class contracts changed; every id, `data-*` attribute
and class referenced by `tests/`, `webtiles/` or other scripts is preserved.

## What changed

### Game settings dialog (`templates/game-settings.html`, `rc-settings.js`, `rc-settings.css`)
- Header with eyebrow, title, one-line lede and an "N unsaved" badge; warnings
  and errors render as callouts (`tr-callout`).
- Toolbar: visible "Find a setting" search label, "Customized only" toggle,
  match count.
- Category rail (still exactly 8 buttons: All + 7 schema groups) shows a count
  bubble of customized settings per group (`aria-hidden`, so button names are
  unchanged).
- Each category renders as a card (`.rc-card`) with the category reset in its
  head. Each setting is one `.rc-setting` row: label + one-line help + source
  note on the left; control, "Base default" and Reset / Use existing
  configuration on the right.
- Booleans are now `<input type="checkbox" role="switch">` styled as a switch
  with an explicit On/Off word; selects for choices; right-aligned number
  inputs; monospace textareas for free lists.
- Footer is always visible (flex column with max-height): status dot + text,
  Undo, Cancel/Close, primary Save (`tr-btn tr-btn-primary` added additively).
- Colours come from `--ui-*` tokens with Folio fallbacks (`--rc-*` aliases),
  so the dialog follows all three themes once `ui-themes.css` is present.
- Not added: an RC text editor. `tests/rc-settings-test.cjs` asserts that
  `#rc_file_contents, #rc_advanced` do not exist and the 2026-10-28 design
  deliberately keeps RC files out of the browser.

### Appearance & graphics (`graphics.html`, `graphics-controls.js`, `graphics-settings.css`)
- Interface theme: three visual swatch buttons (`[data-graphics-theme]`,
  `aria-pressed`) with hardcoded per-theme materials, a "Current" tag, and the
  existing live preview strip. The canonical `<select data-graphics-field="ui_theme">`
  stays (keyboard path and browser tests) directly under the swatches.
- Rendering presets are cards with a check mark; "Rendering: Classic/Balanced/
  Premium/Custom" badge in the heading.
- Effect groups render as cards in a 2-column grid; booleans are switches
  (`.graphics-switch`, still `<input type="checkbox" data-graphics-field>`);
  motion stays a select. Save status has a coloured state dot; retry/done
  buttons use `tr-btn`.
- Optimistic apply and rollback are untouched (`graphics-preferences.js` not modified).
- Page chrome: account nav row (Profile / Appearance), eyebrow, title, lede.

### Profile (`profile.html`, `profile.css`, `profile-appearance.js`)
- Texture packs are a gallery (`role="radiogroup"`): art strip per pack
  (`data-texture-pack`), label, description, "Selected" tag; selected state via
  `:has(:checked)` plus an additive `.is-selected` class set by the script.
- Save status gets `data-state` (saved / saving / error) for the status dot.
- Same account nav row and header as the graphics page.

### Stats / records (`stats.html`, `stats-scope.html`, `stats.css`, `stats-layout.css`)
- `stats.html` links `tabletop/ui-themes.css` and sets
  `<html data-ui-theme="{{ data.get('ui_theme') or 'folio' }}">`; all stats
  colours are `--ui-*` aliases (`--stats-*`) and the `--book-*` tokens are
  remapped on `.stats-page`, so the page renders in folio, dungeon and contrast.
- Page header: copy on the left, a facts strip (recorded games, reference
  version, "About the data") on the right.
- Filter bar is a sticky toolbar inside the panel ("Filter records", fields,
  Date & advanced disclosure with an "active" pill, Apply/Clear, bold match count).
- Tables: sticky header row and first column kept; sort buttons show ↕ / ▲ / ▼
  and an accent underline on the active column.
- Narrow widths (≤650px): tables collapse to stacked cards; the header row
  becomes a "Sort by" chip strip so sorting still works; every cell carries
  `data-label` (new attribute in `stats.html`) for its label.
- Archive (`archive-layout.css`): hero lists on expedition records
  (`/games/<id>`) render as party roster chips via
  `.library-records:has(> li > a[href^="/players/"])` — CSS only, no markup
  change needed. Tokens use `--ui-*` with the archive's existing fallbacks.
- `outgame-archive.css`: account menu uses panel/edge tokens with a hover state.

## How to verify (light, done)
- `node --check` on every touched script; `node --test
  tests/graphics-preferences.test.cjs tests/graphics-renderer-gates.test.cjs`
  (14 pass).
- CSS brace balance checked for all seven touched stylesheets.
- `rc-settings.js` and `graphics-controls.js` exercised with a DOM shim:
  131 `.rc-setting` rows, 8 category buttons, unsaved counter, Customized
  only, undo, saving/error states, swatch click → `ui_theme` patch and select sync.

Not verified (needs a browser/server): `tests/rc-settings-test.cjs`,
`tests/graphics-profile-browser.cjs`, `tests/ui-theme-native.cjs`, real
rendering at 390px, and the stats page under dungeon/contrast.

## Open requests for other areas
- **Python (`webtiles/stats_http.py` or wherever `data` is built):** pass
  `data['ui_theme']` from the signed-in account's `profile_graphics` row so the
  stats page follows the user's theme (template already reads it, defaults to
  folio). Same for `library.html` (`/games`, `/players`, `/randarts`), which is
  not in this area's ownership.
- **Design system / lobby (`templates/client.html` or `static/style.css`):**
  load `tabletop/ui-themes.css` in the lobby so the game settings dialog
  resolves `--ui-*` (it currently falls back to Folio values) and the
  `tr-*` classes on its buttons/callouts take effect.
- **Welcome / library template owner:** add explicit roster markup on
  expedition records (portrait, `tr-badge[data-role]`, level, HP) — the CSS
  chip treatment is a stopgap keyed on hero links.
- **Navigation (`outgame-navigation.html`):** rename the account menu entry
  "Graphics & interface" to "Appearance & graphics" to match the page title.
