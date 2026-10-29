# Complete multiplayer and pending-fix release — 18 October 2026

Release `20261018T035050Z-complete-multiplayer` is active at
[DCSS Co-op](https://dcss.iancaltabiano.com).

## Included

- Two to four authenticated human players, fixed ownership, personal live vision,
  shared remembered terrain, independent floors and floor clocks.
- Fluid safe actions, per-player auto explore/rest, Yield/Stop, floor-local
  combat scheduling, and reconnect and save/resume handling.
- Spell-entry Memorise/Describe/Hide/Show actions, visible shop prices, polished
  search menus, compact equipment layout, and compact direction-pad feedback.
- The previously deployed Shift-click and hotbar-binding fixes, plus every other
  runtime difference identified by the full working-source/production audit.

The release contains 12,231 frozen source files, all verified after installation.
The source audit found no changes or additions after the final freeze. Accounts,
records and saves remain on the persistent state disk. Operational cleanup tools
were included as source; this deployment did not repeat record cleanup.

## Verification

- Ubuntu production build passed with wizard mode disabled.
- 217 backend unittest cases, 27 pytest cases, and nine deployment tests passed.
- 15,971 C++ assertions passed in 26 cases using the production objects and flags.
- Native creation contracts, runtime-user previews, and all 38 starting species passed.
- All 15 affected browser suites passed. Fresh Ubuntu equipment fixtures covered
  173 cases across four widths, including species, mutations, forms and special items.
- Seven combined local native scenarios passed: four-player automation, personal
  perception and independent floors, solo companions, direct ownership, spell
  actions, item search and Shift-click. These included split-floor save/resume.
- The exact Ubuntu binary passed three additional browser smoke scenarios under
  a dedicated service user with filesystem and privilege restrictions matching
  production: normal four-player actions/Yield/Stop/save/resume, inventory
  unequip/drop, and native spell actions and confirmations. No wizard commands
  were used for these Linux checks.
- The four-player Linux save/resume check preserved all four identities, turns,
  positions and inventories. IAP transport and loader synchronization were fixed
  in the operator harness before the successful serial run.
- All three currently retained production checkpoints remained loadable with
  unchanged metadata compared with the preceding binary on disposable copies.
- All 98 public site assets matched through trusted HTTPS. All 155 installed
  game assets matched their staged hashes. No public games were running during
  verification, so public game-client delivery was not exercised.
- Application, disk, recovery and failed-unit checks passed after activation.

The skill-training browser fixture was updated to implement the new shared
inventory-action interface. All changed web code files remain below 600 lines.
Gameplay validation used disposable accounts and saves; human expeditions were
not advanced by the tests. Hosted CI was not used for this release.

## Recovery and evidence

Fresh pre-activation snapshot:
`dcss-pre-complete-20261018-final-035050` (`READY`). It was not restored for this
deployment. `/opt/dcss/previous` retains `20261018T032435Z-hotbar-shift-click`;
activation included automatic rollback on a failed application health check.

Native binary SHA-256:
`8d1dee0ef2c29cb1571f332ef69a317694c47da1f62c819d07a634b9710e6599`.

Final source archive SHA-256:
`539517ab3773c1be6ea8dfac3072c6325ee767011d0b248c12da07e00296f537`.

Receipts, manifests, scripts and successful proof are retained in the
[deployment evidence folder](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a14d04-a678-76f3-ac8b-f24d49e88aa5/deployment-20261018T035050Z-complete-multiplayer).
The frozen archive remains in `/tmp/dcss-complete-release/source.tar.gz` locally
and `/tmp/dcss-20261018T035050Z-complete-multiplayer/source.tar.gz` on the VM.
Temporary local and VM QA services and their managed tunnel were stopped.
