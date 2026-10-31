# UI mechanics deployment — 18 October 2026

Release `20261019T011148Z-ui-mechanics` is active at [DCSS](https://dcss.iancaltabiano.com).
The release ID uses UTC. Refresh an existing game tab to load the updated UI.

## Delivered

- Yield and the monster AUT credit/debt display stay hidden in singleplayer,
  including solo expeditions with companions. Multiplayer retains both controls;
  spectators can inspect timing and cannot Yield.
- Depleted hotbar items retain their last native icon and name with a zero count,
  survive reloads, and become available again when replenished.
- Quick builds follow the chosen race or class and preserve both explicit choices.
- Eligible carried, equipped, and ground-item menus expose native recommended
  skill targets and custom target controls. Applying a recommendation enables
  disabled training without spending a turn and preserves an existing Focus.
- Current party/status presentation updates are included with compatibility
  fallbacks for the deployed native state.

The candidate contains 21 changed runtime browser assets, 17 browser test/support
files, and three narrowly scoped native source changes. Native item recommendations
reuse the existing description/training helpers; the shared serializer serves
both ground and carried items. Visibility uses the native multiplayer flag, and
explicit hidden-state CSS overrides the dock's flex layout. All 38 changed web
code files are below 600 lines; no TypeScript was added.

This release starts from `20261018T220418Z-webview-startup`. Concurrent randart
sharing edits, Tortle shell/dash and balance work, world generation, and multiplayer
scheduler/backend changes remain outside this release. The full working checkout
is therefore not the deployment identity; the frozen manifest is authoritative.

## Verification

| Check | Result |
| --- | --- |
| Scoped browser/model suites | All 13 passed |
| Ubuntu build | Passed with `WEBTILES=y NOWIZARD=y` |
| Ubuntu backend | 221 unittest cases and 27 pytest cases passed |
| Native creation and service-user previews | Passed |
| Retained checkpoint copies | Three loaded with unchanged metadata |
| Solo native gameplay | Hidden controls at 1440, 768 and 390 px; native item training; final potion consumption; zero-count slot and training retained after reload; save/exit passed |
| Solo companions | Hidden controls during real native world-clock advancement passed; controlled timing/tooltip cases passed separately |
| Four authenticated native players | Ownership, independent actions, Yield/Stop, and save/resume preserving identities, positions, turns and inventories passed |
| Public HTTPS gameplay | Same solo workflow passed with HTTP/2 disabled; zero JavaScript exceptions |
| Public asset delivery | All 299 expected source/generated asset hashes matched |
| Installed source | All 12,353 manifest files verified |
| Postflight | Application, disk, proxy and recovery checks passed |

Private Ubuntu browser tests used locally cached, hash-verified candidate assets
to avoid IAP congestion. API calls, WebSockets and native actions used the real
isolated Ubuntu service under the production user and filesystem restrictions.
Public gameplay used hosted assets without local overrides. These are controlled,
Ubuntu and public results; no hosted-CI result is claimed.

## Public startup limitation

Normal Chrome HTTPS did not pass cold-start acceptance. One attempt timed out
before its WebSocket opened. A later attempt registered, configured the party,
then stalled during game loading and reported a RequireJS bootstrap-module timeout.
The diagnostic trace showed pending startup requests; inspected public bootstrap
and creation-module hashes matched the candidate. The cause was not established.
The complete public workflow passed with `--disable-http2`. This does not establish
normal-transport startup acceptance. Earlier release notes also record this class
of startup limitation. Failed normal-transport evidence is retained separately.

An initial backend run shared a probe-library environment variable across tests.
The validation runner was corrected to let each backend fixture isolate its own
library; the full 221/27 checks then passed. This required no application change.

## Identity and recovery

- Active: `/opt/dcss/releases/20261019T011148Z-ui-mechanics`.
- Rollback retained: `/opt/dcss/releases/20261018T220418Z-webview-startup`.
- VM: `dcss-coop-server`, project `chuk-437319`, zone `us-central1-a`.
- Native SHA-256: `6c88204be1092ade44e290440b1f7904060a525be9470481ad234441f8a1b796`.
- Source manifest SHA-256: `88d489b3e5eb744209730223b850a4ebd266640df9bca6dd7cb5aeb20e70b989`.
- Source archive SHA-256: `2dcdbd72d9861144da8fd02c92f81581d619fd4c5bb995d4e51d6c723cc4185f`.
- Public game assets: `https://dcss.iancaltabiano.com/gamedata/954d7425cec1c799521b62a31a2e32a3f2aff2d0/`.
- Fresh state-disk snapshot: `dcss-pre-ui-mechanics-20261019-011148` reached READY
  before activation. No snapshot was restored.
- Persistent state remains at `/var/lib/dcss/rcs` and `/var/lib/dcss/saves`.
- Activation verified the expected live release, candidate hashes, completed
  validation receipts and snapshot, with health-check rollback protection.
- The isolated QA service and its managed tunnel were stopped. Disposable public
  QA records were retained under the existing test-account naming policy; no
  production account or record cleanup ran.

[Source package, receipts and screenshots](/Users/iancaltabiano/.codex/visualizations/2026/10/19/01a151b1-ab53-7673-9030-ce630913e542/deployment-20261019T011148Z-ui-mechanics) are retained locally.
The evidence export excludes account credentials and failed-run screenshots.
