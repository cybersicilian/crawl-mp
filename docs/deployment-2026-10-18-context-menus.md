# Asset-only context menus — 18 October 2026

Release `20261018T204045Z-context-loader-assets` is active at [DCSS](https://dcss.iancaltabiano.com).
It builds on `20261018T195936Z-context-menus-assets`. Both releases reuse the
existing native binary; no native source, generated tile atlas, or backend
change was deployed and no native recompilation was performed.

## Delivered

The release updates 16 JavaScript/CSS assets: contextual menus for carried items,
equipment, ground stacks, native menu rows, dungeon tiles and quickbar slots;
keyboard navigation, focus return and dismissal; stale-selection checks; and
quickbar validation for native consumable inventory slots. Native action costs,
warning prompts, targeting and ownership checks remain authoritative. Options
requiring an engine capability are shown only when the server advertises it.

Public verification exposed a pre-existing loader race: `contrib/jquery.json`
could run before jQuery. The one-file loader follow-up declares jQuery as a
prerequisite for the four legacy plugins. A forced-delay regression uses the
real RequireJS, jQuery and plugin files. Unrelated local command-palette,
exclusion-selection and power-blocking edits were excluded from the payload.

## Verification

- Ten scoped browser suites and the delayed-jQuery loader regression passed.
- The exact production Linux binary passed the context-menu smoke test under
  the `dcss` user, including consumable pin/clear, inspect, drop/pickup, movement,
  explicit unequip, and save/exit; all 15 initial assets matched HTTP hashes.
- The final public browser used Chrome HTTPS over HTTP/1.1, no asset
  overrides, a disposable account and a disposable expedition. All 16 asset
  hashes matched; menu actions and save/exit passed with zero JavaScript errors.
  The default-transport cold-start check stalled at game loading despite no
  JavaScript errors. Waiting for each party-setting acknowledgment did not
  resolve the timeout. This remains a separate verification limitation; it
  was not counted as a passing scenario or attributed to the menu code.
- 13,014 regular release files were audited, excluding Python bytecode
  caches and symlinks. Persistent state links were verified separately.
- Application/Caddy health and recovery passed; the temporary QA service and
  owned tunnel were stopped. Hosted CI was not used.

Native SHA-256, unchanged from the previous complete release:
`8d1dee0ef2c29cb1571f332ef69a317694c47da1f62c819d07a634b9710e6599`.

## Recovery

Pre-activation snapshot `dcss-pre-context-loader-20261018t204045z` reached `READY`.
The initial menu release also retained snapshot
`dcss-pre-context-assets-20261018-195936`. No snapshot was restored.
`/opt/dcss/previous` points to `/opt/dcss/releases/20261018T195936Z-context-menus-assets`. The original complete release
remains at `/opt/dcss/releases/20261018T035050Z-complete-multiplayer`.
Accounts and saves remain on the persistent state disk.

Refresh an existing game tab to load the new browser assets.

[Deployment receipt](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a1507e-1c1e-7c31-8f68-fb7363c7ccef/deployment-20261018T195936Z-context-menus-assets/deployment-receipt.json)
