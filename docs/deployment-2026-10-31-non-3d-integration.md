# Non-3D integration, 31 October 2026

`master` now carries every non-3D line of work. This note lists what went in,
what stayed out, and how to ship it. It is not deployed yet.

## What went in

- **Branches:** the combat log repeat stacking and top-nav smoothing
  (`claude/aggregate-2026-10-31`), the library test fix from
  `claude/merge-deploy-main-3759c2`, and the deployment and enhancement notes.
  The tooltip ink and cache tag commits were already in master.
- **Main checkout, 2D work:** the asset delivery pipeline, stylesheet bundles,
  18 painted sprite sheets with provenance, premium terrain and lighting detail,
  the FPS readout and entry layout. The headwear and elite sheets arrived after
  the first snapshot and were taken at 19:22 MDT.
- **This pass:** the changes in
  [space-and-guidance-pass.md](ui-overhaul-2026-10-30/space-and-guidance-pass.md).

Master's overhauled lobby overview and hero identity won their merge conflicts.

## What stayed out

Everything for the 3D expedition mode stays uncommitted in the main checkout:
`first-person-*`, `mesh-*`, `grid-*`, `foreground-*`, `sprite-voxels` and the
modules only they use (`sprite-surface`, `sprite-subject`, `sprite-palette`,
`native-appearance`, `creature-dimensions`, `dungeon-atlas-model`), plus
`expedition-creation`, `expedition-presentation`, `game_presentation.py`, the
native `body_size` field and the quickbar favorites API.

Their hooks in shared files are removed on master, so the 3D merge must add them
back: `dungeon_renderer.js`, `hud-inventory.js`, `mouse_control.js`, `style.css`,
`direction-pad.js`, `quickbar.js`, the lobby view chooser, and the `presentation`
fields in `ws_handler.py`, `process_handler.py`, `party_saved.py`,
`game_library.py` and `library_socket.py`.

The main checkout still sits on `claude/multiplayer-superlatives`, 32 commits
behind the old master, so that merge needs a real three-way reconciliation.
Diagnostic evidence under `docs/` (about 2.5 GB) also stays uncommitted.

## Deploying

Release installs now run `prepare-assets.py` after the native build, so the VM
needs `brotli`, `webp`, `python3-pil` and `python3-tinycss2`. `gce_startup.sh`
installs them. `attack_info` is a new native field, so this is a full rebuild,
not a static overlay.

1. Snapshot the state disk:
   `gcloud compute disks snapshot dcss-coop-server-data --zone us-central1-a --project chuk-437319 --snapshot-names <name>`
2. Deploy the frozen bundle: `./deploy_gcloud.sh --project chuk-437319 --bundle <bundle directory>`

## Known test baseline

Catch2: 858 cases, 850 passed, the same 3 failed and 5 aborted as before. Python:
the 9 `activity_pacing_test` failures and 2 pytest import errors also fail on the
previous master. Six browser module tests fail identically on the previous master
and were not touched: `hud-overlap-browser`, `party-sidebar`, `offturn-windows`,
`quickbar-hotkeys`, `dock-controls` and `tactical-ui-browser`.
