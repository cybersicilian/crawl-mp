# Content port and UI overhaul deployment — 31 October 2026

Status: PENDING (release id, snapshot and verification are filled in once deployed).

## What ships

Branch `claude/content-port-ui-integration`, landed on `master`:

- The curated content port (`port-manifest.md`): 13 species, undead traits and
  game modifiers, Elder Pantheon backgrounds and the standalone backgrounds, three
  gods and 6★ blessings, eleven spells, the Cubus/grape pair, the kimjoy uniques and
  mercenaries, Golemforge, the Zot:5 hall, items, bag slot and bunker, corpse
  knockback and the autofight swap; see
  `docs/diagnostics/2026-10-30-content-port-audit.md` for the audit, fixes and flags.
- The WebTiles UI overhaul lineage (`claude/trusting-brahmagupta-ba643d`): tactics-RPG
  lobby and HUD, frame-cost cuts, multiplayer connectivity fixes, screenshots cleanup
  and composition pass, merged with the port's trait and modifier controls, bag and
  grape equipment display and class art.
- Production's remaining server-only fixes, ported: seat-owner-only trait edits,
  activity-ready only for non-view packets, cached-bootstrap reattach without the
  spectator replay. The async chronicle and library reads, record finish off the
  IOLoop, presence expiry, write-buffer cap and the close-1000 reconnect grace arrived
  through the merged multiplayer branch.

Deliberate differences from the previous production lineage: AI party seats stay
available when `TYPESAFE_API_KEY` is configured (production forced them off), the
`/profile` page and appearance API are present, `deploy/webtiles.yml` disables the
`Host` and `Player2..4` accounts and anonymous spectating, and the Caddyfile imports
`/etc/caddy/apps/*.caddy` and pins HTTP/1.1.

## Pre-deploy evidence

Evidence root:
`/Users/iancaltabiano/.claude/projects/-Users-iancaltabiano-Documents-Projects-dcss/evidence/content-port-20261030/`

- `integration-candidate-r1`/`r2`: DEBUG WebTiles build, builddb, install-gate
  python suite (102 OK), webtiles discover (529, two known pytest import errors), node
  UI checks, five Lua fixtures; per-file Catch2 844/852 with the same known
  harness-only and fork-own items as the content-port baseline. r1's debug engine
  aborted on a FULLDEBUG monster-scan check for party avatars at multiplayer launch;
  r2 exempts those (release engines never ran the check).
- `two-client-integration-*`: PENDING
- `ui-acceptance-r1`: PENDING

## Deploy

PENDING: state-disk snapshot name, release id, `install_release.sh` gate output,
`/status/version/`, lobby and websocket check.
