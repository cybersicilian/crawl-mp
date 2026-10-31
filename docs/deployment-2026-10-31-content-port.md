# Curated content port deployment — 31 October 2026

Status: PENDING (release id, snapshot and verification are filled in once deployed).

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

## Deploy

PENDING: state-disk snapshot `dcss-pre-content-port-ui-20261031t0110z` (READY,
taken before this release), release id, `install_release.sh` gate output,
`/status/version/`, lobby and websocket check.
