# Native spell-library counts — 18 October 2026

Release `20261018-spell-counts` is active at
<https://dcss.iancaltabiano.com>. It combines the completed web-view engine
snapshot with the deployed context menus and jQuery loader repair, then adds
native spell-library counts and the button's explicit title/count line break.

The engine reports each hero's unlearned library total and number of spells
individually eligible for memorization. Eligibility uses native experience,
free spell levels, species, religion, memory limits, current learning and
status restrictions; hidden spells and divine offers are included. Browser
code displays the native summary and updates when control or counts change.

## Installed identity

- Active release: `/opt/dcss/releases/20261018-spell-counts`.
- Rollback: `/opt/dcss/releases/20261018T204045Z-context-loader-assets`.
- Native SHA-256:
  `f8de58975c28b79e8717edde64a34460e22ec1a5746862efd60ca84f00f53ec5`.
- Source manifest SHA-256:
  `d970494ac252a7702bc7223e6b78d4f05f327a69bc7b4fb4c846e82c9933e01a`.
- All 12,347 installed source files matched the staged manifest.
- The native engine was built on Ubuntu with `WEBTILES=y NOWIZARD=y`.
- Persistent `rcs` and `saves` links still resolve under `/var/lib/dcss`.

The native count patch was applied to the frozen engine snapshot. Unrelated
in-progress native changes in the shared working tree were excluded.

## Verification

The exact candidate passed 75 backend tests, native creation contracts,
three service-user preview scenarios, and compatibility checks on five copied
retained checkpoints. The new native spell-library contract passed all 56
assertions, including zero/known/hidden spells, divine offers, experience and
spell-level limits, spell-memory limits, ongoing learning and restrictions.
Runtime checks used production Tornado 6.4.

An isolated Linux browser using that exact binary verified:

- `8 spells · 1 can memorize` from native state for two different casters.
- Memorizing Foxfire changes the first hero to `7 spells · 0 can memorize`.
- Switching heroes restores the second hero's `8 spells · 1 can memorize`.
- The title and count remain on separate lines at 1440, 768 and 390 px.
- Context menus remain available, with no JavaScript errors.
- The disposable expedition saves and exits.

Four independently authenticated clients against the isolated Linux engine
also verified fixed hero ownership and actual library counts, independent
native actions, and save/resume preserving all four identities, turns, positions
and inventories. That check exercises the actual native protocol; it does not
assert browser rendering. Four-browser startup timed out at loading and is not a passing check.

After activation, public HTTPS/HTTP1.1 verified the complete count workflow:
`8 spells · 1 can memorize` became `7 spells · 0 can memorize` after learning
Foxfire, then switching heroes restored `8 spells · 1 can memorize`. The layout
passed at 1440, 768 and 390 px. All five browser-loaded asset hashes matched the
sealed manifest, context menus worked, and the QA party saved and exited with
no JavaScript errors. The browser probe explicitly disabled HTTP/2; it does not
establish normal-transport or four-browser startup acceptance.

## Recovery and evidence

Fresh state-disk snapshot `dcss-pre-spell-counts-20261018-204952` reached `READY`
before activation. Recovery copies were refreshed before the snapshot. The
activation guard checked the current release, manifest, native binary,
snapshot and validation receipts, and retained automatic health-check rollback.
The application, Caddy, public HTTPS health and health/recovery jobs passed.

Credential-free local evidence is stored in:
`/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a150a5-1ad7-79f0-9ca4-4d42e53d4d64/deployment-spell-counts/`.
Remote installation and activation receipts are in
`/tmp/dcss-spell-counts-release-20261018/`. QA credentials are excluded from the
source bundle and shared evidence. The isolated QA service is stopped.
