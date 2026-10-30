# FPS and multiplayer connectivity deployment — 2026-10-30

Live at <https://dcss.iancaltabiano.com/>. Release `/opt/dcss/releases/20261030T230815Z`,
previous `/opt/dcss/releases/effects-01a18e68-r1`. Pre-deploy state-disk snapshot
`dcss-pre-claude-perf-20261030t222600z` (READY, 20 GB).

## What shipped

The Claude branches `claude/fps-performance-improvements-2dda0a` and
`claude/multiplayer-connectivity-performance-7e93ca` were three-way merged (base:
`master`) onto the source of the live release and deployed with
`deploy_gcloud.sh` as a full from-scratch build. Production semantics were kept
where the two lineages had fixed the same problems differently (per-socket private
lobby room lists, one room per host or guest, no AI party seats, saved-party staging
after the record's final snapshot). Websocket close code 1000 now gets the reconnect
grace period like any other drop.

Not shipped: `claude/tactics-rpg-ui-overhaul-75daa7`. It rebuilt the lobby and HUD
that production had also redesigned (private lobbies, party manager, saved-party
resume), so it needs a redesign-level port rather than conflict resolution.

## Deploy fixes needed for a from-scratch build of the production source

- `util/gen-apt.pl`: skip species blocks under `TAG_MAJOR_VERSION != 34` and
  accept hyphenated display names, so `make docs` succeeds.
- `deploy/install_release.sh`: build with `STDFLAG=-std=c++17`.
- `webserver/games.d/base.yaml` is git-ignored and must be force-added so
  `package_source.py` ships it; without it the service starts with no games.

## Verification

- Install gate: `./crawl -version` 0.33-coop, 100 webtiles unit tests OK,
  local health check passed, Caddy reloaded.
- Public: `/status/version/` and `/healthz` OK, lobby loads and its websocket
  connects, served `idle-work.js` and `client-transport.js` match the release.
- Not run: `deploy/live_smoke.cjs` (needs the shared-host heavy slot, held by a
  Codex validation job at the time).
