# Multiplayer region snapshot deployment — 31 October 2026

Live at <https://dcss.iancaltabiano.com/> since 2026-10-31 06:37 UTC. Release
`/opt/dcss/releases/20261031T045552Z` (master 5688efc06b), previous
`20261031T031551Z` (the content port follow-up, see
`docs/deployment-2026-10-31-content-port.md`). Pre-deploy state-disk snapshot
`dcss-pre-region-snapshot-20261031t045436z`.

## Change

5688efc06b reconciles multiplayer regions once per world turn and once per
WebTiles redraw (`party::scoped_region_snapshot`, `party-region.h`). Before it,
every monster, cloud and environment seed in a world turn, and every hero's
party state and personal view in a redraw, re-ran the full monster and cloud
encounter scan, which made multiplayer input and frames lag. A change to any
hero's floor, position or living state still repartitions immediately.

Validated with the full per-file Catch2 suite on an incremental DEBUG WebTiles
build (results matched the `web-candidate-r4` baseline; one new test in
`test_party_session.cc`). Evidence:
`/Users/iancaltabiano/.claude/projects/-Users-iancaltabiano-Documents-Projects-dcss/evidence/region-snapshot-20261030/`
(`catch2-r1`, `deploy-r1`).

## Deploy and verification

- `deploy_gcloud.sh --project chuk-437319` from a clean detached worktree of
  5688efc06b with the git-ignored HUD atlas copied in.
- The IAP SSH session carrying the remote bootstrap dropped at 05:58 UTC mid-build
  and the build died with it (no OOM; 266 objects compiled). The extracted release
  was resumed with `install_release.sh` under a transient systemd unit
  (`dcss-install-20261031T045552Z`), after deleting objects written in the last
  minute before the drop. That unit finished the build, passed the install gate
  (104 tests OK, native character preview and runtime preview checks passed),
  and activated the release.
- Public: lobby HTTP 200; `dcss-coop` and `caddy` active; the live release source
  carries `party-region.h` and the snapshot calls in `main.cc` and `tileweb.cc`;
  no errors in the `dcss-coop` journal since start.
- Boot disk cleanup before and during the deploy: old releases, `/opt/dcss/staging`,
  older `recovery-backups`, `recovery-archive` and the previous upload archive were
  removed. The disk is at 61% (15 GB free) with this release in place.

## Not changed

Other lag sources found in the same investigation remain: the combat pacing
cooldown in `activity_pump.py` (up to ~500–750 ms per action while a partner has
not acted), the full party state and personal-view rebuild on every keypress, and
the client rebuilding every party card on almost every action.
