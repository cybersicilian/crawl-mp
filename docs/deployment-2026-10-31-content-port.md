# Curated content port deployment — 31 October 2026

Live at <https://dcss.iancaltabiano.com/> since 2026-10-31 02:51 UTC. Release
`/opt/dcss/releases/20261031T015752Z`, previous `20261031T014639Z` (another
session's tooltip-contrast hotfix of the same evening). Pre-deploy state-disk
snapshot `dcss-pre-content-port-ui-20261031t0110z` (READY, 20 GB).

## Lineage

Release branch `claude/release-content-port` = the curated content-port branch
(`claude/dcss-content-port-071894`: the main checkout's working tree, the port, and
the audit fixes) with the live server's source (`claude/production-2026-10-30-perf`)
merged on top. Game code and docs are byte-identical to the validated content-port
source (`web-candidate-r4`); from production come the FPS cuts, the multiplayer
connectivity fixes, async chronicle and library reads, record finish off the IOLoop,
party-room presence expiry, the write-buffer cap, the close-1000 reconnect grace,
auth token expiry, release-only lobby fixes, and production's `deploy/Caddyfile`
and `deploy/webtiles.yml`. The production snapshot's stale reversions of newer
main-checkout files were discarded file by file.

Kept from the main checkout rather than production: the AI party seat modules
(seats offered only when `TYPESAFE_API_KEY` is configured), the `/profile` page and
appearance API, `shared_fate`, and the newer archive script.

Not shipped: the WebTiles UI overhaul lineage (`claude/trusting-brahmagupta-ba643d`).
Its merge with the main-checkout lobby (`claude/content-port-ui-integration`) builds
and passes unit tests but failed 15 of 16 live-server lobby/HUD acceptance tests as a
hybrid; it needs a redesign-level port and stays on its branch.

## Evidence

Evidence root:
`/Users/iancaltabiano/.claude/projects/-Users-iancaltabiano-Documents-Projects-dcss/evidence/content-port-20261030/`
(`release-candidate-r1`, `two-client-release-r1`, `ui-acceptance-release-r1`).
Content-port validation: `docs/diagnostics/2026-10-30-content-port-audit.md`.

## Deploy and verification

- Deployed with `deploy_gcloud.sh --project chuk-437319` from a clean detached
  worktree of the release commit (d50e5b2b6f) with the git-ignored HUD atlas
  `hud-sprites.438f559c163c.png` copied in; the archive carried 68,462 files
  (750 MB) because master tracks the docs evidence trees, which also leaves the
  boot disk at 79% (prune old releases before many more deploys).
- The local deploy process was lost to a Claude session restart mid-build; the
  remote bootstrap kept running and the install gate activated the release itself
  (`crawl -version` 0.33-coop, save version 34.350, `dcss-coop` and `caddy` active,
  server started 02:51:05 UTC).
- Public: `/status/version/` and `/healthz` OK, lobby HTTP 200, the served
  character catalog lists the ported species and backgrounds, and the served
  `class-art.js` hash matches the release commit.
- Not yet shipped: commit 9119297e27 (the hotfix's tooltip stylesheet cache-tag
  bump, cherry-picked onto master after the build started). Cached clients may
  keep the pre-fix tooltip ink until their cache expires; a follow-up deploy
  carries it.
- Browser acceptance against the release candidate: 7 of 16 main-checkout lobby
  tests passed; the 9 failures are pre-existing drift against the one-seat-editor
  lobby that production already ran (hidden seat-2 mode button, saved-games view
  not navigated to, welcome illustration check) and should be updated.
- The two-client Cubus/grape fixture passed fully on the release engine.
