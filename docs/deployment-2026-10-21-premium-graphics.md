# Premium graphics deployment — 2026-10-21

**Historical deployment, rolled back on 2026-10-21 at the user's request.**
The rollback restored `20261021T194324Z-all-oozle-altars`. On 2026-10-22,
account graphics settings superseded this experiment with Classic as the
default and personal opt-in enhancements. See
`deployment-2026-10-22-account-graphics.md`. The receipts below describe the
earlier deployment and rollback.

Activated `20261022T031626Z-premium-graphics` on
`https://dcss.iancaltabiano.com`. The UTC release identifier falls on October 22;
the deployment occurred on October 21 in America/Denver.

## Delivered behavior

Premium preserves native sprite art and input while adding soft, occluded tile
lighting, connected terrain borders, liquid shaders and particles, billowing
clouds, native-lived spell effects, directional wall material shading, crystal
light catches and transparent-wall terrain refraction. Soft circular auras and
umbras now carry subpixel travelling distortion; umbra waves move inward. Actors
and exact targeting remain above the decorative terrain pass. Reduced motion
disables distortion and supplementary motion. Classic restores native drawing.

Shell Dash has a dedicated 32px browser icon even when the installed native GUI
atlas predates its symbol. Its isolated image preserves native atlas indices.

An older server template lacked the bounded dungeon viewport used by the newer
renderer. The renderer now creates that wrapper when absent; overlay geometry,
zoom and pointer coordinates share the same frame. The installed game template
and unrelated HUD, catalogue, gameplay and environment work were preserved.

## Release binding at activation

- Current: `/opt/dcss/releases/20261022T031626Z-premium-graphics`.
- Previous: `/opt/dcss/releases/20261021T194324Z-all-oozle-altars`.
- READY state snapshot: `dcss-pre-premium-20261022t031626z`, ID
  `2265580116202766064`.
- Client revision: `94454349103a98a9b9a8`.
- 56 graphics runtime files installed and verified over public HTTPS.
- 13,361 other regular source/assets were preserved byte-for-byte at staging.
- Native binary SHA-256 remains
  `4be647f2df085bd578004a27c79bc998a9000bf26bcf0cd0a90e727324548e21`.
- Native atlases, gameplay data and save format were retained; `rcs` and `saves`
  still resolve to `/var/lib/dcss` persistent directories.

Activation checked the exact candidate hashes, READY snapshot and successful
native preflight receipt before a graceful service stop and atomic release
switch. Failed startup health would automatically restore the previous release.
The application is active; health and recovery oneshots completed successfully.
Rollback uses the existing previous-release symlink and service restart; no
database or native save migration was introduced.

## Validation and limits

69 focused graphics/movement/lighting tests passed, as did 81 viewport sizing and
pointer cases and the frame/lifecycle checks. The staged Linux runtime passed
asset revision checks and real native previews as the service user for Minotaur
Fighter, Deep Elf Conjurer and Human Wanderer.

The browser fixture uses the production atlas files with the final graphics
payload. It verifies animated fields/clouds/spells/liquids/crystals, clean unknown
cell masking, exact target placement, Classic restoration, reduced motion,
cleanup, Shell Dash icon distinction, WebGL context recovery and CPU fallback.
GPU/CPU comparison had a maximum channel difference of 4/255 and seam error of 1.
The movement sample isolates native-style dirty cell updates from the fixture's
full-scene ambient repaint.

A disposable native expedition passed the public HTTPS preflight and resumed
the same saved hero state after activation, then saved and exited successfully.
The postflight used ordinary delivered assets with no overrides and reported no
browser errors. Both public health endpoints returned 200, and all 56 public
graphics file hashes matched the installed payload.

This is functional graphics and deployment acceptance, not sustained native FPS
acceptance. The dense fixture's full-scene CPU repaint ranged from about 159 to
992 ms in the recorded run and still needs performance work. The native smoke
scene had no light emitters; magical aura gameplay and native Shell Dash use were
not separately exercised in that expedition. Their presentation has controlled
fixture proof. Hosted CI was not run.

The broader local native-art catalogue check still reports the existing
`Weave Enchantments` mismatch (`null !== 10722`). Removing this pass's Shell Dash
addition reproduces the same failure. The installed production catalogue was
retained; this release does not claim full local catalogue parity.

Credential-free receipts, payload manifests, screenshots, source bindings and
the interactive demo are in the task's `premium-10` visualization folder. QA
credentials remain only in a private temporary directory and are not included.

## Requested aesthetic rollback

The rollback verified that the live Premium release and original presentation
files matched their recorded hashes, both releases used the same native binary,
and both retained the same persistent `rcs` and `saves` links. It then gracefully
stopped the application, restored the pre-Premium release, and restarted it with
a startup health guard. No state snapshot was restored and no save migration
was performed. The Premium release is now the retained previous-release target.

The application, health and recovery services passed verification after rollback.
Public HTTPS homepage and health/version endpoints returned 200; the Premium
presentation and liquid shader modules returned 404. Existing browser tabs need
a full refresh to unload the previously downloaded Premium code. The interactive
Premium demo remains a separate artifact and is not the active live aesthetic.
Credential-free evidence is saved as `rollback-installed.json` and
`rollback-public.json` beside the original deployment receipts.
