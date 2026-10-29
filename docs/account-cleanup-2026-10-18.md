# Production account cleanup — 18 October 2026

Applied the requested allowlist for Mr Blue Sky, Tadpole, Joleto, and Rogue to
production. Both `Mr Blue Sky` and the stored `MrBlueSky` spelling were allowed.
Account comparisons were exact and case insensitive.

The live login and library accounts are now Rogue and Tadpole. MrBlueSky has no
separate current login account; both shared saved expeditions with Rogue were
preserved. Joleto has no current login account, and the pre-cleanup recovery
databases contain no matching game, hero, party, or statistics records. No
accounts were created or renamed.

| Archived production data | Count |
| --- | ---: |
| Login accounts | 20 |
| Library account identities | 14 |
| Expeditions | 92 |
| Linked hero/item entities | 111 |
| Save-deletion records | 81 |
| Chronicle compositions | 94 |
| Cached source game rows | 344 |
| Cached progression landmarks | 103 |
| Cached Chronicle rows | 292 |
| File/directory archive entries | 168 |
| Filtered shared source streams | 1 |

The operation retains 59 expeditions. All 1,339 protected source, save, event,
and preference files retained their SHA-256 hashes. Retained game rows and login
credentials are unchanged. Five live SQLite databases passed integrity checks.
After canonical statistics ingestion, a new plan found no remaining target rows,
files, or shared-log changes.

The live service was briefly stopped to prevent concurrent writes and restarted
to invalidate deleted-account sessions and refresh in-memory statistics. No
production native game was running. Separate staging games and local development
databases were left untouched. The active release remains
`20261018-spell-counts`; no application release was deployed for this cleanup.

## Recovery and verification

Private recovery directory on the production state disk:
`/var/lib/dcss/recovery/account-cleanup-20261018T211722Z/`.

It contains online SQLite backups, moved files, original shared streams, a
selection plan, a completion manifest, and `verification.json`. It is outside
the ingestion tree. Reconcile subsequent gameplay before restoring any older
database or source stream.

At 15:17 MDT, trusted public HTTPS returned 200 for health, expeditions, players,
ratings, and both checked JSON APIs. The public account list and Elo table contain
exactly Rogue and Tadpole; MrBlueSky remains in the public hero records.
The [public verification receipt](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a150d1-9b3c-7441-8430-02df9e570619/cleanup-evidence/public-verification.json)
contains the endpoint results.

Five operator-tool tests passed, covering opt-in account cleanup, retained
credentials and tokens, recovery copies, shared-source replay, linked save data,
unsafe paths, and native-game guards scoped to the target state directory.
