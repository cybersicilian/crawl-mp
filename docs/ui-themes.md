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
