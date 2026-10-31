# Shared status icon frames

`game_data/static/status-icons.js` exposes the existing unframed `icon(name)`
for action controls and two status-specific primitives:

- `frame(element, { glyph, tone, expiring })` applies the shared frame to an
  existing DOM element without replacing its focus, event handlers or tooltip.
  Omit `glyph` to frame compound artwork, such as signed resistance levels.
- `effect(view)` creates an accessible, focusable effect icon with hover details.
  Pass a canonical `party-status-model.effects(hero)` projection.

Load `/static/tabletop/status-icons.css` on each consumer. The game stylesheet
already imports it. The stylesheet does not require the game HUD or inspector;
new surfaces can reuse the same classes and data attributes.

Frames use a 22px metal tile and the existing licensed 16px HUD atlas. Coarse
pointers use 28px tiles. Buffs use a green inner rim, harmful effects a rust rim
and a corner notch, and passives a blue-grey rim. Unknown tone uses a dashed
frame. Expiring effects gain a dotted lower edge without animation. Keyboard
focus and forced-colour modes have explicit treatments. Signed resistance
groups retain their native number of symbols and negative-level crosses.

Party cards and the inspector share native `is_bad` classification and duration
projection. The older player HUD protocol has no `is_bad` field; its adapter
retains native light-colour classification, while preferring `is_bad` if supplied.
Missing classification stays unknown. An unrecognised effect still receives a
frame and a registered rune glyph; adding an effect never requires a frame asset.

Dungeon-cell sprites and portrait interior effects remain spatial overlays,
rather than independent DOM icons. Their canonical accessible effect badges use
the shared frame. Action icons and the specialised deity portrait frames retain
their own presentation.

Validation:

```sh
node crawl-ref/source/webserver/tests/status-icons.cjs
node crawl-ref/source/webserver/tests/status-icons-browser.cjs
```

The browser check must run through the shared host gate. It uses real styles,
real atlas pixels and the actual HUD, party-card and inspector renderers with
controlled state. It checks every source duration declaration, unknown and
expiring states, signed levels, reuse, focus, narrow layout and coarse pointers.
It does not apply effects in a running game or establish deployment acceptance.
