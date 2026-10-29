# Record cleanup — 17 October 2026

Archived records outside the exact, case-insensitive account allowlist
`JediJosh` and `Rogue` in both production and the local development state.
Linked companions, items, and legacy history belonging to retained parties
were included in preservation.

| Archived records | Production | Local |
| --- | ---: | ---: |
| Library expeditions | 7 | 59 |
| Linked hero/item entities | 18 | 166 |
| Library account identities | 7 | 84 |
| Chronicle compositions | 6 | 114 |
| Chronicle ghosts | 0 | 1 |
| Chronicle item discoveries | 0 | 2 |
| Cached source game rows | 36 | 339 |
| Cached progression landmarks | 18 | 166 |
| Cached Chronicle rows, net | 13 | 171 |

Production retains 88 library expeditions: 60 belonging to JediJosh and 28
to Rogue. Its public account list contains exactly those two accounts. Their
linked heroes include Lyra and MrBlueSky. Local state retains Rogue's older
two-member Chronicle composition, both associated ghosts, and the legacy
Rogue history; that run predates the local library index.

The production cache deletion initially included one derived Lyra ghost row.
The retained JediJosh expedition's untouched source stream reconstructed that
row during refresh. The operator tool and its regression test now retain such
anonymous companion events by source expedition, giving a net removal of 13
non-retained Chronicle cache rows.

## Recovery archives

- Production VM: `/var/lib/dcss/recovery/record-cleanup-20261018/`
- Local: `/private/tmp/dcss-record-cleanup-local-20261018/`

Each private archive contains online SQLite backups, moved save/event files,
original versions of filtered shared sources, a selection plan, and a completion
manifest identifying the affected rows and retained file hashes. Archive
directories are outside the record-ingestion tree. Production recovery storage
is on the persistent state disk; the local archive is temporary storage.

For recovery, use the manifest to restore selected rows and files from these
archives. Reconcile any subsequent gameplay before restoring a database or
shared log from its earlier snapshot.

## Verification

- Three archive tests passed: exact account ownership and linked companions,
  recoverable files/databases, legacy stream filtering without duplicate replay,
  and rejection of running discarded games or unrecognized save paths.
- All six affected live/local SQLite databases passed integrity checks.
- All 165 protected production files and three protected local morgue/crash
  files retained their SHA-256 hashes during archival.
- The same JediJosh native game process remained running before and after the
  operation. No service restart or gameplay input was required.
- After statistics ingestion, both archive plans report zero remaining target
  rows, files, or shared-log changes. The local statistics store was explicitly
  re-ingested; production refreshed through its running application.
- Trusted public HTTPS returned 200 for `/healthz`, `/games/`, `/players/`, and
  `/api/stats/players`. Public statistics identify only JediJosh and Rogue as
  owning accounts.

## Reusable operator tool

`deploy/archive_records.py` takes an explicit account allowlist and uses the
installed canonical statistics parsers. Inspect a plan before applying it:

```sh
.venv/bin/python deploy/archive_records.py \
  --rcs crawl-ref/source/rcs \
  --webserver crawl-ref/source/webserver \
  --keep JediJosh --keep Rogue
```

`--apply --archive ABSOLUTE_NEW_DIRECTORY` creates the private recovery archive
and applies the selection. The archive path must be outside `rcs`. Authentication
and settings stores are outside this tool's mutation scope.
