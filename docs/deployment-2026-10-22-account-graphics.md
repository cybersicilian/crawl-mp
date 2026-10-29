# Account graphics settings deployment — 2026-10-22

Live at <https://dcss.iancaltabiano.com/settings/graphics>. The lobby Account
menu links directly to it; Game menu → Graphics settings opens the same controls
without leaving the game. Classic is the default. Balanced, Premium, individual
effect switches and reduced motion save automatically to the signed-in account.
Party members keep their own presentation. The former browser-only Premium
preference cannot opt an account in.

## Installed release

- Current: `/opt/dcss/releases/20261022T151837Z-account-graphics`.
- Previous: `/opt/dcss/releases/20261021T194324Z-all-oozle-altars`.
- READY snapshot: `dcss-pre-graphics-20261022t151837z`, ID
  `2434697189377152893`.
- Client revision: `70095f60038f96a8f2b6`.
- All 72 overlay files verified on the installed release; all 66 publicly
  served JavaScript, CSS and JSON files verified over HTTPS.
- 13,355 other regular files preserved byte-for-byte during staging.
- Native binary SHA-256 unchanged:
  `4be647f2df085bd578004a27c79bc998a9000bf26bcf0cd0a90e727324548e21`.
- `rcs` and `saves` still resolve to `/var/lib/dcss/rcs` and
  `/var/lib/dcss/saves`.
- Private account graphics use an additive `profile_graphics` table in
  `/var/lib/dcss/settings.db3`; columns are `username`, `settings`, `revision`.

The overlay was built against the exact installed baseline, retaining its native
atlases, gameplay, HUD and save format. Thin adapters add account graphics without
requiring unpublished local profile or Illustrated-art work. Activation checked
the candidate hashes and READY snapshot, gracefully restarted the application,
and retained automatic health-failure rollback. The application is active;
health and recovery services completed successfully. Rolling back the release
keeps the additive preference data and existing persistent game state.

## Verification

80 focused JavaScript graphics, movement and lighting tests passed, alongside
21 Python HTTP/auth/appearance tests. Client-auth checks also exercised the
actual production adapter, ensuring graphics fetch waits for the account cookie.
Frame lifecycle checks and 81 viewport sizing/pointer cases passed. The staged
Linux runtime passed its asset-revision check and two isolated Tornado HTTP
tests covering authentication, owner matching, XSRF, types and Classic defaults.

The local account browser fixture uses real isolated HTTP/SQLite persistence.
It passed fresh-browser persistence, cross-tab updates, account isolation,
rapid edits, failed-save restoration, stale-account rejection, mobile layout,
dialog keyboard/focus and absence of native commands, with no browser errors.

The separate production-atlas renderer fixture passed shader animation, Classic
pixel restoration, reduced motion, exact targets, hidden-cell masking, movement
cleanup, distinct Shell Dash art, GPU context recovery and CPU fallback. Maximum
GPU/CPU channel difference was 4/255; seam error was 1. This fixture uses a
synthetic account adapter and is not native gameplay proof.

The public postflight used an actual disposable native expedition and ordinary
delivered assets, with no overrides. Classic initially created no Premium canvas.
Selecting Balanced in the game dialog persisted to a fresh browser. Changes in
that browser updated the open game through its same-account connection. Overlay
geometry aligned and remained click-through; graphics changes left native hero
state unchanged. The QA account was restored to Classic, and save/quit left a
loadable game. Browser errors were empty. `/healthz` and `/status/version/`
returned 200. No human expedition was advanced by these checks.

Dense Premium scenes remain CPU-heavy. Balanced and individual switches offer
lower-cost choices; these functional checks make no sustained native frame-rate
or hosted-CI claim.

## Receipts

Artifacts are under
`/Users/iancaltabiano/.codex/visualizations/2026/10/20/01a15b9f-4d9a-7151-8542-16c58a376fe0/graphics-account/`.
The deployment directory retains the overlay manifest, baseline guard, snapshot,
stage and activation receipts, installed/public file verification, public native
smoke result and screenshots. Local account and renderer results are separate
under `browser/` and `renderer/`; focused test output is at the artifact root.
Shared-host browser/package reservations were closed and released after each
phase. See `acceptance.json` for the final source and evidence binding.
