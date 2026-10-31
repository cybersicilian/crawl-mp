# Master merge deployment — 31 October 2026

Live at <https://dcss.iancaltabiano.com/> since 2026-10-31 (release
`/opt/dcss/releases/20261031T135825Z`, master 391a3a7f9f), previous
`20261031T123110Z` (the UI overhaul, see
`docs/deployment-2026-10-31-content-port-ui.md`). Pre-deploy state-disk snapshot
`dcss-data-20261031-predeploy-391a`.

## Change

`master` now carries the live UI lineage, so releases can be cut from it again:

- 8ac8440cc7 merges `claude/ui-deploy-2026-10-31`, including 8699eec129: unversioned
  static requests (the stylesheets `style.css` pulls in with `@import`) send
  `Cache-Control: no-cache` and revalidate by ETag. Before it they had no
  Cache-Control header, browsers cached them heuristically, and returning players
  kept the pre-overhaul `tabletop/welcome.css`, so the welcome preview, seat list
  and feature cards rendered unstyled. `?v=` URLs keep the ten-year max-age.
  The welcome brand tagline also no longer starts with the "·" separator.
- 391a3a7f9f merges `claude/multiplayer-superlatives` (52cff527de): party support
  credit, persisted superlative tallies and Heavy Pebbles citations.

The webserver tree equals `claude/ui-deploy-2026-10-31`; the native tree equals
`claude/multiplayer-superlatives`, whose gated DEBUG Catch2 suite matched the
baseline (857 cases, the known 3 failed + 5 aborted).

## Deploy and verification

- `deploy_gcloud.sh --project chuk-437319` from a clean detached worktree of
  391a3a7f9f with the 41 git-ignored `static/title_*.png` and the HUD atlas
  `hud-sprites.438f559c163c.png` staged by `git add -f`.
- Install gate passed (104 webtiles tests, native preview checks).
- `curl -sI /static/tabletop/welcome.css` returns `Cache-Control: no-cache`;
  `/static/style.css?v=…` returns `max-age=315360000`.
- The signed-out welcome page renders fully styled at 1440x900.
- Local webtiles suite: 9 `activity_pacing_test` failures and the two pytest-only
  import errors, unchanged from the live branch.
