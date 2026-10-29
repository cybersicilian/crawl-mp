# Direction pad and common hotkeys

The direction pad uses a compact 152px compass with quieter borders, aligned
letter/number labels, and eight 44px touch targets. Pointer, letter, physical
numpad and navigation-key feedback continue to use the existing native input
path. Number-row quickbar assignments do not hide physical numpad labels.

**Common hotkeys** is directly available beside **Menu** in the bottom toolbar.
It opens a local reference for movement, exploration, combat, character tools,
planning and quickbar actions. Reading it sends no gameplay input and takes no
turn. Escape closes it and restores focus; gameplay keys then work immediately.

Movement definitions are shared with route planning through `route-plan.js`.
Quickbar labels come from `quickbar-model.js`. The reference uses the existing
inspection dialog, its shared focus trap, and the HUD input adapter rather than
introducing another dialog or native input translator. Presentation is in
`styles/direction-pad.css` and `styles/common-hotkeys.css`.

## Validation and deployment

The focused browser checks passed for direction-pad input/feedback, hotkey
reference isolation and focus, quickbar shortcuts, and HUD input. Reference
layouts were checked at 1280, 768, 390 and 320px. These are browser viewport
checks; physical mobile-device interaction was not tested.

Production release `/opt/dcss/releases/multiplayer-performance-01a17ea4-ui`
was activated with a service restart on 27 October 2026. The running native game
saved through the normal SIGHUP path before activation. Verified state backups
and the previous performance release remain available. The native binary and
three multiplayer performance modules retained their exact deployed hashes.

A public browser loaded the existing disposable two-human campaign, verified
all eight labelled targets, opened and closed help without changing either
hero's turn count, then issued exactly one owner action with focus returned to
the help button. The campaign saved successfully and produced no page errors.
Public HTTPS application/disk health passed after the restart.

Receipts, source bindings, preserved failed fixture attempts and screenshots:
[`diagnostics/2026-10-27-direction-hotkeys/`](diagnostics/2026-10-27-direction-hotkeys/).
The preceding multiplayer optimization and save/reconnect checks are recorded in
[`diagnostics/2026-10-27-multiplayer-performance/`](diagnostics/2026-10-27-multiplayer-performance/).
