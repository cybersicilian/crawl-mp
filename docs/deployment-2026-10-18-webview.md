# Completed web-view package deployment — 18 October 2026

The completed package is live at https://dcss.iancaltabiano.com. Ubuntu validation and public acceptance passed for release `20261018T220418Z-webview-startup`.

The release preserves the completed native and web changes, contextual menus, loader dependency ordering, and native spell-library counts already deployed by the related work. Source hashes identify this combined state; the recorded Git ancestor alone does not identify the release because the source includes uncommitted work.

## Final fixes

- Returning from a game keeps the Saved view selected when the save list arrives asynchronously. A later party-room refresh cannot override that intent; explicit navigation clears it.
- Right-clicking during tile-exclusion selection cancels that selection without also opening a context menu.
- The legacy jQuery bootstrap starts DOM consumers when the document is already ready, even if decorative images still delay `window.load`. Native game asset readiness remains enforced. A real RequireJS/jQuery regression holds a decorative image open and verifies startup before that image completes.

These browser fixes use the existing navigation, gesture, and bootstrap mechanisms. They require no native rebuild. Their shared-workspace source changes were retained without replacing unrelated work.

## Validation

| Check | Result |
| --- | --- |
| Ubuntu production native objects, wizard mode disabled | 17,948 assertions in 75 C++ test cases passed |
| Ubuntu backend | 221 unittest cases and 27 pytest cases passed |
| Deployment tooling | 16 tests passed |
| Controlled browser suites | All 14 passed; delayed-image bootstrap regression passed again after the final change |
| Browser scenarios using the isolated Ubuntu native runtime | All 11 passed |
| Native creation | All 36 Tortle backgrounds and three service-user previews passed |
| Retained checkpoint at final preactivation | One copied checkpoint loaded with unchanged metadata |
| Public HTTPS source/generated assets | All 299 hashes matched installed assets |
| Public responsive startup | 1440 px and 390 px passed, with no JavaScript exceptions |
| Public gameplay using normal Chrome HTTPS | Passed, with no JavaScript exceptions |
| Installed release | All 12,351 source files verified; persistent state paths preserved |
| Postflight | Application health passed; DCSS and Caddy services active |

The 11 Ubuntu scenarios cover spell counts, four-player control, inventory, spell menus, session menus, Bloodcraft, Tortle creation, action menus, lobby navigation, consumable hotbars, and context menus. Four-player validation exercised distinct hero ownership, independent native actions, Yield/Stop, and save/resume preservation of identities, positions, turns, and inventories.

The private IAP tests cached exact hash-verified installed Ubuntu static/generated assets locally to avoid tunnel congestion. API requests, native state, and game actions still used the real isolated Ubuntu runtime. Public acceptance used normal Chrome HTTPS without asset overrides or special transport settings.

Public gameplay selected Tortle and Blood Hunter through the hosted pickers, created that native hero, and exercised turn-free inspection, keyboard and canvas context menus, real drop/pickup, movement, native inventory rows, explicit unequip, and save/exit. An intermediate weapon-preview request returned the expected HTTP 400 before the picker adjusted the weapon; final creation and gameplay passed.

These are local, Ubuntu, and live-public results. No hosted-CI result is asserted.

## Release identity and recovery

| Item | Value |
| --- | --- |
| Active release | `/opt/dcss/releases/20261018T220418Z-webview-startup` |
| Previous release retained | `/opt/dcss/releases/20261018-completed-webview` |
| Native build origin retained | `/opt/dcss/releases/20261018-spell-counts` |
| VM | `dcss-coop-server`, `us-central1-a`, project `chuk-437319` |
| Runtime | Python 3.12.3; Tornado 6.4 |
| Data snapshot | `dcss-pre-completed-webview-final-20261018t214758z` — READY before combined activation |
| Persistent state | `/var/lib/dcss/rcs` and `/var/lib/dcss/saves` |
| Public game route | `/gamedata/6b4a8aa9f189981a8b70973d9d659416b4c7c445` |

- Native executable SHA-256: `f8de58975c28b79e8717edde64a34460e22ec1a5746862efd60ca84f00f53ec5`
- Final source manifest SHA-256: `de28b338934daea424cda7a75b81972c7d87e5e6844f12432972333e28d12a1b`
- Final source archive SHA-256: `9470c1b85afb0f6887d9689ae7d3b74f9cd562b661b2c6421569f592cd9d2aff`

The native executable was reused only after verifying that all final non-web native source inputs matched its production build. The final startup release changed two browser source/test files relative to the validated previous release. Installation used a separate immutable release, complete manifest verification, guarded activation, and retained rollback releases. No snapshot restore was performed.

## Deliverables

- [Validated source package](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a15079-4005-70d2-862f-6b5645889248/validated-webview-package.tar)
- [Package metadata and checksums](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a15079-4005-70d2-862f-6b5645889248/validated-webview-package/release.json)
- [Validation summary](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a15079-4005-70d2-862f-6b5645889248/validated-webview-package/validation.json)
- [Detailed deployment evidence](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a15079-4005-70d2-862f-6b5645889248/ubuntu-deployment)

The package excludes credentials and live saves. It contains the exact final source archive, manifest, change list, release metadata, activation receipt, asset manifest, validation summary, this report, and checksums. The executable and generated native assets are built on Ubuntu; the deployed executable remains available in the retained release directories.

Three disposable QA accounts and their three games remain intact. Their proposed cleanup is awaiting explicit approval after automatic approval review rejected production-data deletion under the deployment/testing authorization. No cleanup ran; all other accounts and expeditions were preserved.
