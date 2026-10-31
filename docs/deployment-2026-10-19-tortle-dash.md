# Tortle dash — 19 October 2026

Release `20261019T162535Z-tortle-dash` is active at
[DCSS](https://dcss.iancaltabiano.com), following
`20261019T014658Z-content-pack`.

Shell Dash now has a native compass-path targeting reticle, dust and impact
particles, a tucked shell sprite with tuck/roll/emerge animation, automatic
emergence after a dash, 1–5 nonlethal recoil damage and five standard turns of
recovery. Ordinary movement while retracted takes twice its usual time.
Cancelled or blocked attempts with no movement or impact spend no turn, recoil
or cooldown.

The native duration system owns recovery and save persistence. Traversal events
use actual paths filtered through each viewer's visibility; presentation follows
the camera and respects reduced motion. The shared visibility check now handles
other player observers, fixing a companion-targeting crash. A quivered dash can
also launch without a hostile creature nearby.

## Verification

- Ubuntu WebTiles build passed with wizard mode disabled and C++17.
- 17,637 assertions passed in 43 scoped native cases covering Tortle mechanics,
  equipment and party trading, including visible/invisible companion reticles.
- All 36 available Tortle backgrounds passed native creation checks; runtime-user
  previews passed against the immutable release.
- 76 backend tests, seven particle/shell animation cases and the existing
  frame-rendering regression passed.
- An isolated Linux browser passed targeting/cancel, particles, shell rendering,
  recoil, automatic emergence, five-turn recovery saved and resumed, and an
  ordinary one-cell 26-aut shell step.
- The same scenario passed on public trusted HTTPS without asset overrides,
  using a disposable account. All five changed game assets matched their source
  bytes. The test saved and exited its expedition and reported no JavaScript errors.
- Eight retained checkpoint copies remained loadable with unchanged exported metadata.
  This check did not advance human expeditions.
- All 13,212 regular release files matched their frozen hashes after activation;
  persistent state links, application health, disk health and recovery passed.
- All task-owned remote build, QA and browser process groups were confirmed empty.

The overloaded local host was not used for heavy validation. Existing exact
passing results were retained across browser-harness-only corrections. Earlier
failures and their corrections are preserved alongside final proof. Hosted CI
and a full repository suite were not used for this release.

## Recovery and evidence

State snapshot `dcss-pre-tortle-dash-20261019t172610z` reached `READY` before
activation. It was not restored. `/opt/dcss/previous` retains
`20261019T014658Z-content-pack`; activation had an automatic health rollback.
Accounts and saves remain on the persistent state disk.

Native SHA-256:
`ff998bb0ab3ad1c5810672a8c3db38da22581fe9a99759261d8eb2bde9c08964`.

[Deployment evidence](/Users/iancaltabiano/.codex/visualizations/2026/10/19/01a154c8-7aba-7003-b377-0f4dc419d727/tortle-dash/remote/evidence).
[Shell sprite and built-in ImageGen prompt](design/tortle.md#sprite-provenance).

Refresh an existing game tab to load the new browser assets.
