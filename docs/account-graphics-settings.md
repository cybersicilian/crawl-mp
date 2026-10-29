# Account graphics settings

Graphics settings are private account preferences at `/settings/graphics`, with
a direct link in the lobby Account menu. The in-game Graphics button and Game
menu open the same controls in a dialog without leaving or advancing the game.
An existing local profile page also embeds these controls.

Live at <https://dcss.iancaltabiano.com/settings/graphics> since 2026-10-22.
The production account page and an actual native game passed persistence and
same-account update checks using ordinarily delivered HTTPS assets. See
`deployment-2026-10-22-account-graphics.md` for the installed release binding.

New accounts and signed-out viewers use Classic. The former browser-only
`dcss.visual-presentation.v1` choice is not migrated, so an old Premium experiment
cannot override the requested return to Classic. Enabling enhancements is an
explicit personal choice; party members retain their own graphics settings.

## Controls

Classic restores native presentation. Balanced enables lighting, borders,
liquids, clouds, spells, soft areas, movement, particles and interface polish;
material shaders, reflections, bloom and aura distortion remain off. Premium
enables all enhancements. Individual edits produce a Custom configuration.

All 13 enhancement switches reach their renderer: tile lighting, borders and
blending, wall materials, liquid shaders, reflections, clouds, spells/fire,
bloom, magical areas, aura distortion, movement, particles and interface polish.
Disabling a treatment preserves its underlying native drawing. Reduced motion
freezes supplementary animation and disables glides; the operating system's
reduced-motion preference and native animation options remain authoritative.
Exact native targeting, visibility and game rules are unchanged.

## Shared mechanism and account contract

`static/graphics-settings.json` is the canonical schema, presets and control
metadata. Python validation/persistence and the browser model consume it.
`graphics-controls.js` builds one accessible control surface for the account
page, profile and in-game dialog. General pixel, lighting and emission modules
accept optional settings; the DCSS adapters select those settings per viewer.

The existing persistent settings database stores `profile_graphics` rows keyed
by case-insensitive authenticated username. Typed partial patches merge inside
an immediate transaction and increase a monotonic revision. Changes to unrelated
fields from multiple tabs/devices do not overwrite an entire stale settings
object. Account identity comes from the shared login cookie helper, never from
a payload field. POST requires XSRF and a matching `X-Profile-User` header.

`graphics-preferences.js` serializes automatic saves while applying edits
optimistically. A failed write restores the last confirmed values. Responses
from a prior account and older revisions cannot replace current settings.
Sign-out/account switching clears the view to Classic. The server pushes updates
only to that account's WebSockets; a storage event signals other tabs to fetch
authoritative state. Fresh browsers load server preferences, and visibility
changes refresh pages without their own game socket. No shared graphics values
are read from browser storage.

## Validation boundaries

Focused checks cover schema/preset parity, real HTTP ownership and XSRF,
case-insensitive durable persistence, partial merges, socket recipient scope,
rapid edits, failures, account changes, stale replies and renderer gates.
The browser account fixture uses real isolated HTTP/SQLite persistence and
checks fresh contexts, cross-tab application, mobile layout, keyboard/focus and
absence of native commands. The separate native-atlas fixture uses a synthetic
account adapter for rendering; it is not account or native gameplay proof.

The production adapter introduces the standalone graphics page without requiring
unpublished profile/Illustrated-art work. It preserves the installed native
binary and atlas IDs. Dense Premium scenes remain CPU-heavy; Balanced and
individual switches provide lower-cost choices. No sustained native frame-rate
claim is made by these functional settings checks.
