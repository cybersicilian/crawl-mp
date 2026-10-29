# Cross-computer expedition handoff

An explicit Resume previously skipped an owner's still-connected game process
and then failed the one-engine-per-account guard with “Your expedition is already
running in another tab.” This prevented moving a running expedition to a second
computer even though both sessions had authenticated as the same owner.

The runtime change is confined to `webtiles/session_recovery.py`. Explicit Resume
now transfers the existing process, detaches the old watcher, and closes the old
WebSocket normally. Its close callback cannot stop the transferred process.
Both the close message and normal WebSocket close prevent automatic reconnection
from stealing control back. Automatic recovery continues to wait on active hosts.
Account, mode, exact expedition identity, and fresh-start protections remain.

Validation: 21 Python cases passed, including two actual localhost WebSocket
connections around a controlled engine fixture. The original runtime reproduces
the reported error against the same fixture. The JavaScript socket lifecycle
checks passed, including terminal-close and sleep/wake behavior. No native game
was played during these tests.

`manifest.json` binds the frozen payload to the inspected production release
`/opt/dcss/releases/tav-lobby-fix-01a17f43`. `session-handoff.patch` contains the
single runtime-file change. A live read verified the original module's SHA-256
and its library adapter. No account or save contents were required for diagnosis.

Deployed after direct approval at `2026-10-28T01:47:48Z` (27 October locally) as
`/opt/dcss/releases/session-handoff-01a18019`. Both production deployment locks
were held during preparation and activation. All 21 cases passed against the
server's installed dependencies after adapting the fixture to its optional
profile settings modules. The single runtime change was unchanged throughout.
The native binary and 12,744 unrelated release files were preserved.

Both active service-owned games received graceful checkpoints without forced
kills. On-server recovery backups verified 9,469 saved-directory files and 317
SQLite backups. No save files were replaced during activation. The previous
release remains available for rollback. Private account/save evidence stayed on
the server; the local receipt contains only release data and aggregate counts.

Verification confirmed the running service's working directory, exact runtime
module hash, unchanged native binary, and persistent storage links. Public
HTTPS health, version and lobby requests returned 200 with TLS verification.
Application and disk health passed. See `deployment-receipt.json` and
`public-verification.json`. Two physical computers were not used for acceptance;
the automated handoff check used real WebSockets and a controlled engine fixture.
