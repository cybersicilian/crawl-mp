# Non-play workspace redesign — 16 October 2026

The lobby now has three persistent views: **Play**, **Chronicle**, and **Game modes**.
Play keeps starting, resuming, and joining together. A new party opens the builder;
saved expeditions move ahead of gathering parties when no room is being edited.
The illustrated introduction, forest navigation, quiet paper surfaces, normal-case
headings, and consistent controls establish a stronger visual hierarchy.

Chronicle distinguishes reusable **party builds** from saved expedition progress.
Search and category filters apply immediately and survive view changes. **Use
build** returns to the builder for both new and existing rooms, including after
the native game client removes document jQuery handlers. Record links open
separately to retain browsing context. Account maintenance and the player's own
record are grouped under the named account disclosure.

Game modes retain all eight original native launch routes and the RC editor,
with explanatory cards grouped into quick-start parties and solo/challenges.
The builder keeps all existing controls and character guides, adds explicit input
names and pressed states, spells out quick builds, and uses a concise launch label.

## Reusable mechanisms

- `workspace-views.js` controls visibility, focus, and independent scroll without
  replacing nodes, changing routes, or accessing server state. View membership is
  supplied by the lobby adapter.
- `lobby-navigation.js` composes the DCSS home, account disclosure, and view map.
  `lobby-browser.js` owns read-only Chronicle filtering; `lobby-modes.js` adapts
  server-provided links without replacing their routes or handlers.
- `asset_revision.py` hashes browser source independently of the native binary.
  AMD modules get a content revision; navigation/workspace styles use versioned
  template links so cached earlier interfaces do not outlive a release.
- `navigation.css` and `lobby-workspace.css` load as explicit versioned styles after
  the existing shared theme. In-game canvas and combat presentation are unchanged.

## Local validation

Passed the workspace browser acceptance test at 390, 768, 1280, and 1440 pixels:
view isolation, no page overflow, one visible new-expedition action, native route
preservation, no server/game commands from navigation or filtering, visible
keyboard focus, roster retention, search/category retention, account Escape,
all mode links, and build reuse after native document-handler teardown.

Populated saved-game presentation used explicitly controlled protocol fixtures;
searching and the exact Resume command were checked without opening a human save.
This is UI/protocol evidence, not a new native save-persistence claim.

Existing welcome/account/party-layout and character-guide browser checks pass.
The full native four-hero game smoke check also passes at 1280×800 and 1440×900,
including the existing inspector, chat, encyclopedia, hover, and layout checks.
The asset-revision test checks stable content, edits, added styles, renaming,
removal, and exclusion of unrelated documents. Changed JavaScript passes syntax
checks; all changed web sources are below 600 lines. Generated tile metadata,
vendored SimpleBar, and the unrelated native menu module retain existing sizes.

Evidence: `/tmp/dcss-workspace-proof/`, `/tmp/dcss-workspace-lobby-proof/`, and
`/tmp/dcss-character-guide-proof/`. The baseline design audit is separately saved
under `/Users/iancaltabiano/Documents/Projects/__DESIGN/dcss/2026-10-16-non-play-ux/`.
These changes are local and have not been deployed to the public site.

Only the eight exact library account records created by this session, their one
native game, four hero records, and one generated Chronicle build were archived
reversibly under `/tmp/dcss-workspace-qa-archive/`. Existing human records were
not selected. A concurrent starting-weapon implementation subsequently introduced
a required generated catalog and a separate native rebuild. The native smoke
evidence above predates that concurrent change; its integration is a separate
validation boundary.

The concurrent build completed its native catalog export. The missing
`starting-weapons.json` was generated from that executable with the existing
project generator, without overwriting the other task's character catalog. The
local server is running again and its Play home was visually verified. The
concurrent native weapon-selection feature has not been validated by this UX task.

## Character builder follow-up

The builder now offers the executable's 37 starting species and 33 backgrounds,
with native legal-combination restrictions and canonical Djinni presentation.
Wider hero folios, native species tiles, direct starting-sheet actions, precise
readiness text, and an adjacent party-composition view share the in-game folio's
ivory/crimson/brass materials. Open and closed slots retain editable plans and
explain when those heroes join. Preset guidance uses native descriptions.

The initial planning preview has been replaced by native creation snapshots.
HP/MP, AC/EV/SH, attributes, resistances, skills, actual starter inventory and
memorized spells now come from the configured executable. The builder, sheet
and composition view render native equipped doll layers against the matching
atlas. Each seat reserves a creation roll, also used at launch, so a Wanderer's
random kit and each hero's appearance remain consistent. Species PNGs remain a
loading fallback. Spell access identifies the hero's starting contribution; the
party shares its library once assembled.

This follow-up visually verified the builder, sheets and composition at phone,
tablet and desktop widths (390, 768, 1280 and 1440), including viewport containment,
native portrait loading, retained roster values, modal keyboard navigation and
focus return. Native character-option contracts cover 1,190 legal combinations;
the existing nine weapon/asset-revision unit tests and changed-JavaScript syntax
checks pass. Proof is under `/tmp/dcss-builder-polish-proof/`. This follow-up has
not repeated native gameplay or save/resume acceptance and has not deployed.

A Makefile dry run unexpectedly executed its forced link recipe. The resulting
stale executable was replaced atomically with the latest isolated skill-training
build, with byte identity and the native starting-weapon export verified. No native
source changes were needed for this builder follow-up.

## Native starting sheets and equipment follow-up

The engine now exports a read-only native creation snapshot without generating a
dungeon or native save. It reserves the same per-seat creation roll used by launch,
including Wanderer equipment and appearance. Starting HP, MP, AC, EV, SH,
attributes, resistances, adjusted skills, inventory and memorized spells replace
planning estimates. Loading and retry states are explicit. The native companion
renderer and lobby share an equipment-driven doll builder; old background
costumes no longer replace the companion's real worn gear.

Validation: 16 backend/asset tests, native option contracts for 1,190 combinations,
and native snapshot checks for world-seed isolation, companion context, species
restrictions, spell memorization, Wanderer determinism, seat compaction and no
native saves passed. A fresh four-hero expedition matched all 32 starting
HP/MP/AC/EV/SH/attribute values and all four equipped layer sequences at clock
zero, then saved and exited cleanly. Browser checks covered a direct weapon
change, equipped portraits in all composition seats, and a contained 390px sheet.
Proof is under `/tmp/dcss-native-start-proof/`; the executable was built in an
isolated source copy and installed atomically after verification. The local
server was updated with its staging roster preserved and no active expedition.
No external deployment was performed.

## Party comparison and matching folio follow-up

The composition view now compares HP, MP, AC, EV and SH in aligned columns with
equipped portraits and direct Sheet/Edit actions. Planned seats remain explicit.
The phone layout keeps all five values visible per hero without sideways scrolling.
Starting sheets reuse the native folio skin and component styles, with Character,
Spells, Traits, Equipment and Skills tabs, resistance gems and item tables.
Canonical stat/resistance explanations are shared with the native HUD/inspector.
Hover/focus tips enter the dialog top layer and have ARIA associations; Escape
dismisses a tip before closing the sheet. Sections and scroll context are retained.

CUA verified all 20 comparison values against four displayed starting sheets,
keyboard tab navigation, spell/equipment/skill content, section persistence, tooltip
stacking and Escape behavior. A separate 390px lobby check confirmed the comparison
and dialog stay contained. The actual in-game inspector renderer also rendered
successfully in a disposable fixture using native snapshot data and the shared
assets. This was a UI check; no additional gameplay was performed. JavaScript
syntax checks and the 600-line web-file limit passed. Screenshots are in
`/tmp/dcss-party-comparison-proof/`.

## Native equipment, spell and skill tooltip follow-up

The starting folio now exposes actual native descriptions for equipped/carried
items, memorized/library spells and trained skills. Spell rows display level,
MP and schools; their cards add the selected hero's native casting failure,
power, damage and range. Skill rows display aptitude, and native descriptions
include per-hero training projections where applicable. The thin row adapter
reuses the lobby's shared rich-tip contract and in-game tooltip materials.
Descriptions are exported as plain text and rendered as text, with no HTML
interpretation. Native inspection uses an independent deterministic RNG stream.

Native contract checks passed for description availability, hero-specific spell
details, deterministic creation, companion context, restrictions and no saves.
Comparing the previous and new executables preserved every preexisting snapshot
field in fighter, caster-companion and randomized Wanderer builds. In the browser,
Lyra's displayed descriptions (two items, four spells and four skills) matched
a fresh installed-engine snapshot exactly, including casting details.
CUA checked keyboard focus/ARIA, top-layer positioning, Escape, 390px containment
and mouse-wheel/PageDown scrolling in a compact 390x440 viewport. A dismissal/hover reopening
edge case found in that viewport was fixed and rechecked. Screenshots and native
comparison evidence are in `/tmp/dcss-starting-entry-tooltip-proof/`.
All 16 preview, asset-revision and starting-weapon tests passed, as did JavaScript
syntax checks and the 600-line limit for the changed web files.
The verified executable was installed atomically; the running local server's
binary-versioned cache refreshed without restarting or changing the roster.
This follow-up did not launch a new expedition or deploy externally.
