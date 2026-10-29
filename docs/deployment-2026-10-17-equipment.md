# Equipment and complete-source deployment — 17 October 2026

Release `20261017T202009Z-equipment-complete` is active at
[DCSS Co-op](https://dcss.iancaltabiano.com).

The release includes the complete frozen working source, the RPG equipment menu,
native anatomy and equipment fixes, item artwork, party Zot changes, and the new
HUD icon overlay. Credentials, private purchased source packs, accounts and saves
were excluded from the source package.

## Verified release

- All 12,120 installed source files match the frozen manifest.
- Native Ubuntu build: `0.33-coop`, GCC 13.3.0, wizard mode disabled.
- Native equipment, item-art and Zot tests: 15,600 assertions in 12 cases passed.
- Backend checks: 119 unittest cases, 27 additional pytest cases and six deployment tests passed.
- Native creation contracts, runtime-user previews and all 38 selectable starting species passed.
- All 13 retained native checkpoints remained compatible in read-only copy inspections.
- Ubuntu-produced browser fixtures: all 173 states passed at 1280, 768, 390 and 320 pixels wide.
- Live HTTPS menus passed for Octopode, Naga, Coglin and Poltergeist, including native socket counts, Gear filtering, optional profile fields, native inspection and focus return.
- The disposable public QA expedition was saved, resumed and saved again. Hero identities, stats and complete equipment profiles matched; its final status is saved and loadable.
- All 244 checked public assets matched, including seven native atlases. The public browser recorded no JavaScript errors.
- Public HTTPS, application and persistent-disk health passed. Both runtime state paths resolve directly to the persistent disk.

## Deployment repairs

The source packager now includes the ignored runtime atlas declared by the HUD
manifest, verifies its content-addressed filename and excludes private purchased
source archives. Regression tests cover inclusion, missing or changed pixels and
invalid paths.

The installer removes only empty validation-created state directories before
creating persistent-state links; it refuses to discard directories containing
data. The confirmed empty default save directory was corrected without moving
or deleting save files.

The additional Catch2 harness was compiled with C++14, while the production
engine retained its original compiler flags. The public test was updated to open
the current game-menu controls before Save & lobby.

## Recovery and evidence

Pre-release state snapshot: `dcss-pre-equipment-20261017-202009` (`READY`).
The previous release `20261017T174328Z-hud-hotkeys` is retained through
`/opt/dcss/previous`. This snapshot was not restored as part of this deployment.
Existing human expeditions were not played during validation.

Native binary SHA-256:
`79339cc8633aa21944d50a19f38e3146d586dcf6de43a9b498a1107f8d5b5aff`.
Client revision: `d1ea3b21d809c66b069b`.

Credential-free evidence is retained in the task's
[persistent deployment folder](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14b58-e0f4-7b91-ab13-4abbcdfd77e0/deployment-20261017T202009Z/README.md).
The full frozen archive and operator files are in
`/tmp/dcss-release-20261017T202009Z-equipment-complete` locally and
`/tmp/dcss-20261017T202009Z-equipment-complete` on the VM. Private QA credentials
remain outside the persistent evidence folder.

The species/mutation/form matrix uses controlled native fixtures; the public
smoke check uses normal gameplay with wizard mode disabled. These checks do not
establish exhaustive Cartesian coverage of every possible combination.
