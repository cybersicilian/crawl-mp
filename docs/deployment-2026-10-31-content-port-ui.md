# Content port and UI overhaul deployment — 31 October 2026

Status: LIVE as release `20261031T123110Z` since 13:28 UTC on 31 October 2026 (commit 25ced510ff).
`master` now carries this release: `claude/ui-deploy-2026-10-31` (tip 3e117c7d58) was merged
into master on 31 October 2026, so hotfixes cut from master keep the live lobby and HUD.

## What ships

Branch `claude/ui-deploy-2026-10-31`: the UI overhaul integration lineage
(`claude/content-port-ui-integration`) with the content-port release lineage
(`master` at fa9fc4c587, live as releases 20261031T031551Z and 20261031T045552Z)
merged on top. Native code is identical to master; only `webserver/` and `docs/`
differ.

- The curated content port (`port-manifest.md`): 13 species, undead traits and
  game modifiers, Elder Pantheon backgrounds and the standalone backgrounds, three
  gods and 6★ blessings, eleven spells, the Cubus/grape pair, the kimjoy uniques and
  mercenaries, Golemforge, the Zot:5 hall, items, bag slot and bunker, corpse
  knockback and the autofight swap; see
  `docs/diagnostics/2026-10-30-content-port-audit.md`.
- Production's server fixes as deployed: the 2026-10-30 performance and
  connectivity release, the per-turn multiplayer region reconcile (5688efc06b),
  -std=c++17 builds, gen-apt species tables, `games.d/base.yaml`, the tooltip ink
  pin and its cache-tag bump, and the shorter multiplayer combat pacing between
  partner actions (master 4b2c9eaae3, cherry-picked as cd3b3ffdf5: 20 ms per aut
  in combat, 10 ms otherwise, capped at 400 ms; `activity_pump_test` 22 OK).
- The WebTiles UI overhaul lineage (`claude/trusting-brahmagupta-ba643d`, PR 3):
  tactics-RPG lobby and HUD, frame-cost cuts, multiplayer connectivity fixes,
  screenshot-pass fixes (graphics settings rows, mission bar, portrait arches)
  and the enhancement and composition passes, merged with the port's trait and
  modifier controls, bag and grape equipment display and class art.

Merge resolution (5e9211d05b): the integration lobby's per-view room-list
encoding cache and `party_rooms_test` superset were kept; master's deployed
saved-party staging (`_stage_saved_party`), presence-check test patching,
starting-weapons fixture and `monster_list.js` dirty tracking were taken (the
overhaul's `threat` field re-added); the ink pin was layered onto the overhaul's
tooltip contract and its folio card tokens ported from the enhancement pass.
`deploy/Caddyfile` is the live one (HTTP/1.1 ALPN, Alt-Svc cleared).

Integration fixes found by the QA pass on this tree:

- a587caf272 — a roster-selected open seat shows its editor (production hid every
  non-launching seat's editor; the overhaul's roster strip had no way to give an
  open seat a mode).
- 02ed5d7baa — hero sheet weapon tile laid out by class, not grid position (the
  port's LEVEL CAP tile had pushed it into a single track: one letter per line).
- e372018994 — the account menu's Log out button keeps its native button role.
- (this commit) — fixed-position account dialogs stay viewport-centred on a
  scrolled phone-width lobby ("Create an account" opened above the viewport).

Deliberate differences from the previous production lineage: AI party seats stay
available when `TYPESAFE_API_KEY` is configured, the `/profile` page and
appearance API are present, one seat editor is shown at a time (roster strip),
and the Play home is the overhaul's hub.

## Pre-deploy evidence

QA server: `util/qa_server.py` on the merged source with the content-port release
engine (`evidence/content-port-20261030/release-candidate-r1/source`, binary
9e7b2165…), port 8899, runtime `/tmp/dcp-ui/rt`.

- Python webtiles suite: 537 tests, 9 failures + 2 import errors — the identical
  set as on the deployed lineage (`activity_pacing_test`, `auth_test`, `util_test`;
  all pre-existing).
- Pure-node tests: 59 pass / 10 fail on both the merged tree and the deployed
  lineage, same files.
- Screenshot pass (Playwright, 1440×900 and 1024×768, DPR 2): lobby home, party
  builder with four seats, HUD, hero sheet and its tabs, pause menu, graphics
  settings, premium preset on the dungeon theme (light canvas mounted), 390 px
  lobby. No page errors beyond the git-ignored `title_*.png` illustrations, which
  the release archive carries (staged with `git add -f` in the release worktree).
  Main-thread profile of the hero sheet's Equipment tab: 15 ms.
- Overhaul browser suites against the merged lobby: `portrait-status-browser`,
  `party-faith-browser`, `logout-browser` pass. `status-icons-browser` (overhaul
  version) does not stub `./equipment-paperdoll` and fails identically on the
  overhaul branch; `tactical-ui-browser` and `premium-presentation-browser` need
  generated client assets and fail the same way on the deployed lineage.
- Main-checkout lobby acceptance (`lobby-ui`, `lobby-navigation`, `lobby-access`,
  `party-setup`, `party-management`, `starting-weapons`, `library-smoke`): these
  assert production's all-seats-visible editor and compact Play section and fail
  on the overhaul's one-seat-at-a-time roster by design; the deployed lineage
  itself passed only 7/16 of this set. The native six were not run (they failed
  on the release candidate too).

## Deploy

- State-disk snapshot `dcss-data-pre-ui-overhaul-20261031` (20 GB, READY) taken
  first. Deployed with `deploy_gcloud.sh --project chuk-437319` from a clean
  detached worktree of 25ced510ff with the HUD atlas and the 41 `title_*.png`
  illustrations staged (`git add -f`); the archive carried 68,531 files.
- Release `20261031T123110Z`: uploaded 12:31 UTC, from-scratch build finished and
  the install gate passed at 13:28 UTC (104 tests OK, native character preview
  and runtime preview checks passed, `crawl -version` 0.33-coop, save version
  34.350). `dcss-coop` and `caddy` active; previous release
  `20261031T045552Z` kept for rollback. Boot disk at 66% afterwards.
- Public: `/status/version/` and `/healthz` OK, lobby HTTP 200, the served
  `style.css` imports the overhaul's tabletop stylesheets and
  `tooltip-content.css?v=tooltip-ink-ae95e701-r1`, title illustrations and the HUD
  atlas served. Headless Chrome on the live welcome page at 1440 and 390 px:
  no page errors, no failed requests, the register dialog centred in the viewport.
- The first deploy attempt was stopped while still packaging locally (nothing had
  reached the VM) to include the combat pacing change cd3b3ffdf5.
