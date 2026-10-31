# Hotbar and Shift-click deployment — 17 October 2026

Release `20261018T032435Z-hotbar-shift-click` is active at
[DCSS Co-op](https://dcss.iancaltabiano.com). The release identifier uses UTC;
the deployment date above uses America/Denver.

Assigned hotbar numbers disappear from the d-pad, return when cleared, and
follow the controlled hero. Shift-click unequips equipped gear and drops
unequipped items across the HUD, backpack, and equipment slots. Native warnings,
removal delays, ownership checks, and equipment-sheet context remain intact.

## Scope

The candidate was built over live release `20261018T015800Z-save-manager`.
It contains ten frozen files: the scoped native inventory protocol change,
six browser modules, and three browser tests. Additional ongoing multiplayer,
equipment-layout, and direction-pad presentation changes in the shared working
tree were excluded. The exact deployed patch and source payload are retained
with the evidence, without changing that ongoing work.

## Verification

- Ubuntu native build passed with wizard mode disabled.
- All 189 backend unittest cases, 27 pytest cases, and six deployment tests passed.
- Native creation contracts and three runtime-user character previews passed.
- The exact browser candidate passed inventory shortcuts, warning/focus return,
  seven action restrictions, per-hero bindings, assignment clearing, unavailable
  assigned actions, accessible labels, and four palette widths.
- A disposable loopback game used the exact release binary. It passed weapon
  unequip/drop, delayed armor removal/drop, stale-request rejection, retained
  search, and hotbar number hiding/restoration, with no JavaScript errors.
- All ten installed source hashes and both persistent-state links matched.
- All six changed browser assets matched through public trusted HTTPS.
- Application, disk, recovery, and failed-unit checks passed after activation.
- All five post-activation native checkpoints were loadable with unchanged
  metadata compared with the preceding binary on the same disposable copies.

The native gameplay check used isolated accounts and saves. Public verification
checked HTTPS health and served asset bytes. The attempted anonymous spectator
probe did not establish public gameplay behavior; no production test party was
created or human expedition advanced by the validation.

## Recovery and evidence

Snapshot `dcss-pre-interactions-20261018-032435` is `READY`; it was not restored
for this deployment. `/opt/dcss/previous` retains
`20261018T015800Z-save-manager`. Activation included automatic rollback on failure.

Native binary SHA-256:
`37bd0e4acd8eaa5176b9d10b0acb3458f8844de407974ff0923607719cef4009`.

Credential-free receipts, exact payload, deployment scripts, patch, and native
proof are in the [persistent evidence folder](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a14d04-a678-76f3-ac8b-f24d49e88aa5/deployment-20261018T032435Z).
The disposable loopback server and local tunnel were stopped after validation.
