# Categorized game settings

The raw RC editor is replaced with 131 controls in seven categories: travel and
rest, inventory, combat, messages, interface, tiles, and notes. Search matches
labels, descriptions, native option names and categories. A customized-only
filter, per-setting reset, category reset, undo and inherited-preference controls
keep recurring changes direct. Saving keeps the menu open and waits for a server
acknowledgement. Invalid fields are revealed and focused even if their category
was hidden. Keyboard focus stays inside the dialog and returns to its opener.

Every control displays a base default and an editable value. The base combines
the native WebTiles defaults, native `dat/defaults` files and the actual launch
command's early options. Server-enforced late options are displayed but locked.
The local fixture covers an early `explore_delay=0` override. Current production
has no early explore-delay override and correctly shows the native -1 default.

## Compatibility and persistence

Existing RC files remain byte-for-byte intact. A read-only importer recognizes
plain assignments, known aliases, and ordered list operations. It never executes
Lua or follows arbitrary include paths. Such dynamic values are clearly marked
as uncertain, while the known base default remains available for reference.
Arbitrary scripts and unsupported directives remain effective in the native RC;
they are not edited or removed by this menu.

Changes are validated against `static/game-settings.json` and stored in the
existing account settings SQLite database, scoped by authenticated account and
resolved RC path. Partial patches merge transactionally, so unrelated edits from
two browser tabs survive. Null removes a menu override and restores inherited
configuration; Reset writes the displayed base value explicitly.

At native startup the server passes saved choices through `-extra-opt-last`.
They follow normal RC evaluation but precede any server-enforced late options.
An empty RC is created only when one did not previously exist, because the
native loader otherwise returns before processing late options. The feature
does not read or rewrite native save packages. Changes take effect when a game
process next starts; reconnecting to an already-running process does not apply
new options. Scripts that change options later during gameplay remain outside
this startup guarantee.

The declarative catalogue drives the UI, validation, display of defaults and
native serialization. The socket adapter owns authentication and mode binding;
the storage adapter owns account persistence. This keeps additional settings out
of the rendering and persistence control flow.

## Verification

- 29 focused Python tests passed, including native-default parity, legacy
  preservation, aliases, typed validation, account isolation, durable reopening,
  partial merges, locked options, save errors, and native launch argument wiring.
- The real browser/SQLite fixture passed twice. The final pass also verifies
  hidden invalid-field focus, failed-save retry, multi-line entry, search,
  per-setting reset, inherited reset, keyboard trapping and a 390px layout.
- Original fixture RC text and a sentinel save file remained unchanged.
- All changed browser code and templates are below 600 lines.
- Both browser phases used the shared heavy gate and released their reservations
  after browser and fixture teardown.

`final/browser-result.json` and its screenshots contain the final browser proof.
No native game was started by these local checks. Deployment and public verification are recorded in `deployment/README.md`.
