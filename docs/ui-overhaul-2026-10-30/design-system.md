# Design system — tactics-RPG vocabulary (2026-10-30)

Area: shared tokens, themes, components, typography, focus, icons, tooltips.
Full reference: [../ui-themes.md](../ui-themes.md) ("Tactics-RPG vocabulary").

## What changed and why

- **Semantic tokens** (`static/tabletop/ui-themes.css`): per-theme `--ui-*`
  colours for faction (hero/ally/enemy/neutral), threat tiers, initiative
  banked/debt, turn mode, resources (HP/MP/gold/XP + track), five role badges,
  plus `--ui-focus` and `--ui-danger-ink`. Folio re-declares them in ink weights
  on every parchment surface (and `.tr-on-page` / `.tr-on-panel` for new ones)
  so contrast holds on both chrome and paper; forced-colours mapped.
- **Component classes** (`static/tabletop/tactics-components.css`, new,
  imported from `ui-themes.css`): `.tr-badge`, `.tr-meter`, `.tr-stat`,
  `.tr-kbd`, `.tr-btn` (+primary/quiet/danger, sizes, states), `.tr-actions`,
  `.tr-card` (header/body/footer, `.is-active` hero ring), `.tr-segmented`,
  `.tr-callout` (info/warn/danger/good), layout helpers. Theme-aware with
  literal fallbacks, reduced-motion and forced-colours rules.
- **Scale** (`tokens.css`, `typography.css`, `interface.css`): `--tt-type-*`
  scale; every HUD/lobby label that was 9–11px now uses `--tt-type-label`
  (12px); `--tt-type-key` (11px) only for `kbd`, `.dock-key`, `.quickbar-key`,
  `.tr-kbd`, `.party-slot-tag`, `.party-bar-label`. Added radius, motion,
  meter-height, tip-width and focus tokens.
- **Focus ring** (`theme-components.css`, `theme-lobby.css`, `status-icons.css`):
  one `--tt-focus-ring` rule for buttons/links/inputs/summaries/`[tabindex]`/
  `[role=button]`; paper surfaces get it through the `--ui-focus` override, so
  the old per-surface outline rules are gone.
- **Tooltips** (`tooltip-content.css`, `materials.css`): one card contract
  (header with title + key-cap badge, body, meta row), 360px max width,
  13/16/12px type, `--ui-*` materials, token-driven rules, subtle enter motion
  gated on `prefers-reduced-motion: no-preference`.
- **Icons** (`status-icons.js`, `hud-iconography.js`, `properties.css`):
  atlas probe with ready/legacy/missing states, text-glyph fallback, legacy
  href re-targeting, `icons.labelled()`/`icons.name()` for accessible names,
  `hud-iconography.vocabulary` + `badge()` for the shared role/mode/faction/
  threat/initiative/resource words and glyphs; icon-only buttons in `#normal`
  are swept for names on every HUD refresh.
- `ui-theme.js`: exposes `themes` and `current()`; behaviour unchanged.

## Atlas finding

`static/ui-sprites/hud-sprites.json` (`file`) and the hardcoded `spriteAtlas.url`
in `static/scripts/item-properties.js` both name `hud-sprites.438f559c163c.png`.
`util/generate-hud-sprites.py` is the only writer: it packs the licensed Raven
sources, names the sheet `hud-sprites.<sha256(png)[:12]>.png`, writes that name
into the manifest and the JS, and `--verify` requires the file to exist with a
matching hash. `static/ui-sprites/.gitignore` ignores `/hud-sprites.*.png` and
un-ignores only `f4c7e20144b6` (256×112, the packer's `LEGACY` source for the
20 retained frames — same 16-column/112-frame geometry as the manifest) and
`bbe7b693ead5` (224×98, an older generation with different geometry). So the
438f sheet was generated on one machine and never un-ignored/committed; every
other checkout 404s it and the SVG `<image>` fails silently — the empty boxes
in `05-game-hud.jpg`. Resolution: run the packer locally with the private
sources (`python3 util/generate-hud-sprites.py --sources <private dir>`), or
un-ignore and commit the generated sheet (licence permitting). The client now
degrades: legacy sheet → text glyphs. Nothing binary was added.

## How to verify (done, light only)

- `node --check` on `ui-theme.js`, `status-icons.js`, `hud-iconography.js`: pass.
- `node --test tests/graphics-preferences.test.cjs`: 8/8 pass.
- `node tests/status-icons.cjs` (browser-free): pass (251 statuses resolve).
- Brace/paren balance on all eleven touched/added CSS files: balanced.
- No existing token or class was renamed; grep shows no stale references.
- Not verified (no browser/server allowed): rendered contrast, the
  `tests/ui-glyphs.cjs` fidelity run (the text fallback is only added once all
  sheets fail, so it should still pass where the 438f sheet exists),
  `tests/status-icons-browser.cjs`, lobby layout at 390px after the 12px floor.

## Open requests for other areas

1. **CSS entries** (`static/style.css`, `game_data/static/style.css` owners):
   add `@import url("tabletop/tactics-components.css")` /
   `@import url("/static/tabletop/tactics-components.css")` after
   `tooltip-content.css` so the components load even if `ui-themes.css` is ever
   split out of `graphics-settings.css`. Currently reached via
   `graphics-settings.css` (game) and `profile.css` (lobby).
2. **`static/scripts/item-properties.js`**: the atlas URL is hardcoded; read
   it from `hud-sprites.json` (or have the packer also emit a tiny
   `hud-sprites-manifest.js`) and append the `<text class="tt-icon-fallback">`
   child itself so lobby-only consumers get the fallback without
   `status-icons.js` re-wrapping `properties.icon`. Update `tests/ui-glyphs.cjs`
   (which asserts `<image>`-only children) in the same change.
3. **`game_data/static/player-interactions.js`**: stop wrapping the tip badge
   in `[...]` — `.dcss-tip-badge` now renders as a key cap.
4. **HUD / party / lobby agents**: use `data-role` badges via
   `hud-iconography.badge("roles", role)`, `.tr-meter[data-resource]` for every
   bar, `.tr-stat` for every number, `.tr-btn-primary` once per screen and
   `.tr-btn-danger` separated with `.tr-actions-end`. Re-check card widths after
   the 12px label floor (`.party-def-badges`, `.party-buff-pill`,
   `.party-badge` grew from 9px).
5. **`game_data/static/styles/game-coop.css`** still styles
   `#dcss_rich_tooltip` with terminal colours (`#fce94f` title, 10.5px body);
   it is overridden by `tooltip-content.css` but can be deleted.
