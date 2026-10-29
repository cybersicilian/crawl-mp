# Settings deployed and verified — 28 October 2026

Live site: <https://dcss.iancaltabiano.com>.
Active release: `/opt/dcss/releases/categorized-settings-01a1838c-r3`.
Verified backups: `/var/lib/dcss/recovery/categorized-settings-01a1838c-r2`
and `/var/lib/dcss/recovery/categorized-settings-01a1838c-r3`.

The settings overlay was merged into the actual production baseline on the
server, retaining the newer `ui-settings-01a182e1` release. No production source
was downloaded. The native engine remains byte-for-byte unchanged, SHA-256
`9cee132748e0c8465414fe3b2fd7c27edd91c1e569027cdc4af3742250314660`.
The initial overlay preserves 12,737 unrelated release files. Revision 3 changes
only two browser files to recenter dialogs after settings load and viewport
resize, reusing the existing centering mechanism.

Both release preparations passed 29 production-runtime tests and client-template
compilation. Cutovers held the production release locks, checked the expected
current release, made verified backups and switched atomically. No native games
were running at either cutover. Health or preservation failure would restore the
previous application release. All 317 detected SQLite backups passed integrity
checks. The previous application releases and both backups remain available.

## Live acceptance

`public/live-verification.json` records the successful final public HTTPS run:

- 131 controls, seven categories, editable values, labeled base defaults and no
  raw RC editor.
- Number, boolean and multiline-list changes save with a server acknowledgement
  and survive reload.
- Per-setting reset, undo, global search, customized filtering and modal keyboard
  focus work.
- The open menu fits a 390px viewport. A real modal fixture independently passed
  the same responsive workflow after its resize event completed.
- All four changed browser assets match the installed code hashes; no JavaScript
  errors occurred.
- Existing QA preferences were restored, no account was created, and the
  verification did not open or advance a native game.

Current production has no early explore-delay override. Its base default is -1,
meaning follow travel speed. The menu displays this actual live value. A test
expectation inherited from an older release was corrected after inspecting the
launch metadata. The verification also waits for the post-sign-in server exchange
before opening the menu, so initial lobby navigation has finished.

The phone check found a real desktop-offset issue, corrected in revision 3.
Earlier failed attempts and their closures remain recorded separately; the final
local and public runs passed under the shared heavy gate. Every owned browser,
fixture and worker exited, and all reservations were released.

## Preservation audit

`final-preservation.json` confirms retention of all 246 original save-index
records and all 9,481 original save-directory files. All six original native
checkpoint backups still match their pre-deployment hashes. All 12 existing
configuration files and original account preferences are unchanged.

One expedition was resumed during verification. Its native checkpoint and two
JSONL records advanced through its live native process; those three changes were
attributed to that exact active save directory. The expedition was left running,
and its latest progress was not rolled back. There are no unexplained save
changes. The other native packages retain their original contents.

Private per-file state manifests remain on the server. Local receipts contain
only aggregate counts and code hashes. `active-release.json` combines the initial
settings-overlay manifest with the two-file centering correction. Refresh an
existing browser tab to load the new menu.
