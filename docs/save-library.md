# Saved expeditions and public records

The game dock provides **Save** (continue playing) and **Save & lobby**.
The lobby's **Saved games** panel resumes a specific expedition. Starting a new
party allocates a separate native save directory and leaves earlier games intact.
Resuming a running expedition on another computer transfers its existing process
to the authenticated owner and disconnects the previous host session. The game
continues at its current state, including unsaved actions and other party members.
Automatic network recovery waits for an active host instead of taking control back.
Each expedition also has **Delete save**, with a confirmation describing the
permanent loss of saved progress. Only its logged-in owner can delete it, from
the lobby, while that expedition is stopped (including in other tabs). Deletion
removes its native save directory and lobby card; public expedition, hero and
item records remain available. Other tabs refresh automatically. Deleted saves
cannot be resumed or automatically re-imported from an older legacy package.
Continue lists only resumable checkpoints or actually running expeditions. Its
compact rows keep Resume, View record and Delete together; My history opens the
account's complete expedition record. Running status comes from current processes,
so a stopped game with an old active marker is shown as Saved.

DCSS removes the resumable native package when a run ends through death, victory,
quitting or leaving the dungeon. These terminal outcomes also block every loading
path if an old package remains. Lobby refresh automatically deletes the owner's
confirmed fallen expeditions' leftover save storage and removes their save-manager
entries, retaining public records. Running and detached processes are protected.
Downed companions, low HP, absent checkpoints and crashes never qualify as death.
Failed filesystem cleanup can be retried without marking progress as deleted.

Every account, hero, expedition and randart receives a UUID. Hero and randart
IDs are native properties, serialized by the existing save system. They are
independent of names, inventory slots and the seeded gameplay RNG. Older native
saves receive missing identities on first load. Existing account saves can be
copied into the library on first launch without deleting their originals.

Read-only pages are available at `/games/<id>`, `/players/<id>` and
`/randarts/<id>`. The corresponding collection pages browse records. Game pages
link to heroes and discovered randarts; hero and item pages link back to their
game. Accounts have their own player page. Record links open separately during
play so the expedition stays connected. A shared game URL grants viewing access;
only its authenticated owner can resume it or request a save.

## System boundaries

- `game-record.{h,cc}` owns native identity and known-state snapshots. Every
  randart gets an ID on creation; only known, observed randarts enter public
  records. Picked-up books and dropped/transferred items retain their records.
- `game_library.py` owns the SQLite index, account IDs, stored launch parameters
  and private native-package locations. Public data excludes filesystem paths.
- `library_socket.py` adapts authenticated WebTiles operations to that index and
  restores party membership/configuration after a server restart.
- `record_visibility.py` identifies disposable QA accounts for public browsing
  and statistics. Existing QA account prefixes used by browser tests, `test`,
  `test` plus digits, `QA` and `QA` plus digits are excluded along with their
  heroes, expeditions and items. `CRAWL_TEST_ACCOUNTS` adds comma-separated exact
  names for a deployment. Names merely containing "test" remain visible.
  Owners still see their own saves, and direct diagnostic record links work.
  Stats applies the policy after account resolution, including existing cached
  rows; wizard-mode inclusion does not expose test accounts.
- `library_http.py` and `library.html` provide escaped, read-only public views.
- `library-ui.js` owns the lobby list and dock controls; native DOM event
  listeners survive WebTiles replacing its game client and jQuery handlers.

The trusted launcher passes `CRAWL_GAME_ID`, `CRAWL_OWNER_ID`, `CRAWL_SAVE_DIR`
and `CRAWL_RECORD_PATH` to the engine. `CRAWL_SAVE_DIR` isolates packages while
keeping the configured shared bones and data directories. Snapshots are replaced
atomically and indexed by ID. The engine stores the complete party and visited
levels in its normal `.cs` package; JSON records are descriptions, not save files.
Back up all of `rcs/library/`, including `index.sqlite`, `saves/` and `events/`.

## Verification

Run backend persistence, identity, ownership and HTTP escaping regressions:

```sh
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.game_library_test webtiles.library_management_test webtiles.save_lifecycle_test webtiles.stats_test -v
```

`webserver/tests/library-smoke.cjs` uses disposable local accounts and a real
native three-hero game. It exercises a randart, saves, a separate second run,
server/browser restart, reloading the first run, preserved IDs/state and rejected
cross-account loading. `START_WEBTILES=1` lets the test own its temporary server;
`WEBTILES_URL`, `BROWSER_EXECUTABLE` and `LIBRARY_PROOF_DIR` configure execution.
The test creates a native wizard-mode randart only in its disposable QA run.
