# Fantasy interface validation — 16 October 2026

## Finished interface

The illustrated sourcebook lobby, chapter navigation, race/class guides,
character folio, shared property/status icons, chat/item tags, hover cards,
encyclopedia, loading recovery, and saved-game/record pages are implemented.
The local server is available at `http://localhost:8888`.

## Verified workflows

- Fresh-account welcome, registration, sign-in/logout, party setup, and four-hero
  launch work at desktop and mobile widths. No horizontal page overflow or
  browser/asset errors. Launch remains directly available at 1280 × 800.
- Race/class summaries appear beneath every selector. Every offered choice has
  native data; Guide opens full traits, attributes, equipment, starting spell
  access, skills, recommendations, and aptitudes. Keyboard tabs, Escape, focus
  return, touch layouts, presets, and authoritative room changes pass. Reading
  guides sends no server or dungeon command. Retired Vampire is no longer offered.
- Sourcebook chapter jumps preserve the native hash route and edited roster,
  send no game commands, restore keyboard heading focus, and survive native
  document-event teardown. The saved-game chapter uses the real library panel.
- Full native four-hero UI checks pass at 1440 × 900 and 1280 × 800: unchanged
  canvas origin and scale, bounded sidebar/dock/log geometry, every inspector
  section, retained inventory DOM/scroll, hero shortcuts, resistance icons and
  native scales, direct inventory sharing, native ground-item hover, safe text,
  and seventeen encyclopedia categories/search without spending turns.
- Real three-client multiplayer chat passes: host and claimed P2 exchange a
  tagged native inventory item and reply, pointer and keyboard-focus cards work,
  and an unrelated expedition receives neither message. All clocks stay at 0.0;
  no dungeon input leaks from chat.
- Full native library checks pass: in-game save, three normal saved exits, two
  independent native packages, browser-session restart and exact package resume,
  unchanged hero UUIDs/current and maximum HP/MP/XL/place, and an identified
  randart retaining its UUID. A different authenticated account cannot load it.
  Actual game/hero/artefact pages render with expandable record references,
  property badges, and clean native prose. This run did not restart the server;
  backend persistence is separately covered by temporary-database tests.
- Loading recovery passes desktop/mobile, delayed-copy/timer reset, native
  prompt precedence, real explicit return navigation, and zero dungeon commands.
  Dock Enter/Space activates once; save readiness follows native command mode
  and resets on cleanup. No automatic retries or redirects were added.
- All 22 backend chat/library tests pass. Browser contracts for item properties,
  chat, nested tooltips, loading, and keyboard/readiness pass.

## Native corrections and build

The initial executable crashed before character creation. A clean isolated
WebTiles build succeeded and replaced it. Native save/reload testing then found
and repaired three concrete integration defects:

1. `item_type_known()` explicitly rejects artefacts. Record publication and
   inventory record IDs now use the item's own identified flag.
2. Save exit deleted a shared package while companions retained dangling
   aliases. The existing shared-state synchronizer clears those aliases before
   the game loop resets, matching ordinary end-game cleanup.
3. Maximum HP is derived rather than serialized. Startup now recomputes HP/MP
   limits in each hero's scoped player context, preserving saved current values.

Record prose passes through Crawl's existing formatted-string parser to remove
terminal colour tags while retaining the native known description.

The final executable was built with `make WEBTILES=y -j8 crawl` in an isolated
source/object tree. Its native `.cc`/`.h` sources matched the working checkout at
installation. SHA-256:

`f66ae2b6d8d6745884c9688ef08339247bdae1564c04d2a56474270888a45050`

## Architecture checks

All web code files changed by this overhaul are at most 600 lines. JavaScript
syntax and scoped whitespace checks pass. Native/public selectors and APIs are
preserved. Differential browser checks verified the client queue/compression and
lifecycle, five player/HUD states, 21 popup/update frames, and 18,661 identical
canvas operations across 84 renderer scenarios after cohesive AMD extraction.

The character catalog is generated from local native descriptions, YAML,
mutation text, and `-playable-json`; regenerating it produces identical output.
Local artwork and bundled/system font fallbacks require no external asset host.

## Evidence

- `/tmp/dcss-character-guide-final-proof/`: character setup and desktop/mobile guides.
- `/tmp/dcss-client-refactor-proof/`: welcome, account forms, and lobby screenshots.
- `/tmp/dcss-client-refactor-navigation-proof/`: actual chapter/context navigation.
- `/tmp/dcss-final-integrated-proof/`: final native four-hero UI and server readiness.
- `/tmp/dcss-finish-chat-native-proof/`: actual three-client chat delivery/isolation.
- `/tmp/dcss-finished-library-native-proof/`: complete native save/resume and records.
- `/tmp/dcss-library-finish-proof/`: fourteen controlled desktop/mobile record views.
- `/tmp/dcss-loading-final-proof/`: illustrated loading state and recovery.
- `/tmp/dcss-client-refactor-fixture/evidence.json`: queue, compression and lifecycle.
- `/tmp/dcss-module-extraction-evidence.json`: player and popup equivalence.
- `/tmp/dcss-cell-renderer-evidence.json`: rendering/coordinate equivalence.

## QA cleanup

Only exact disposable accounts identified from this task's test log were
selected: 31 account identities, 24 game records, 77 linked entities, and 24
Chronicle compositions. Their selected rows, native packages, and event files
were archived reversibly under `/tmp/dcss-final-qa-cleanup/`. No existing human
save was opened or changed. One unrelated pre-existing game record was preserved.
The earlier sixteen-composition cleanup remains backed up separately under
`/tmp/dcss-tabletop-proof/qa-chronicle-entries.json`.

All test clients closed before the owned server was restarted. The final
read-only server check creates no account or game.
