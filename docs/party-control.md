# Multiplayer hero control

The current mechanics contract is documented in
[Multiplayer mechanics](multiplayer-mechanics.md). It records the selected
human-only multiplayer roster, shared-terrain/personal-vision rules and
independent floor exploration, along with source-backed gaps and native
acceptance checks. Those refinements are deployed in
`20261018T035050Z-complete-multiplayer`; see the
[complete release verification](deployment-2026-10-18-complete.md).

Each connection's hero selection is independent of the engine's acting hero.
`webtiles.party_control.PartyControl` uses the existing expedition member map
for exclusive reservations and reconnect identity. Host and guest keyboard,
pointer, item and power requests receive a server-authoritative `player_id`.
Raw party input uses the game socket; losing that socket never falls back to
unidentified terminal input.

In multiplayer, every player stays with their reserved character, including the
host on P1. Neither direct nor nested switch/cycle requests can transfer control
to another player's hero or an unclaimed companion. Joining a solo expedition
returns the host to P1 if they were controlling a companion. Reservations keep
this policy in effect while another player disconnects or reconnects; delayed
native switch acknowledgements cannot override it. A downed character remains
assigned to its player.

When playing a party alone, the host can explicitly select companions. Selection
changes only after the engine acknowledges a successful switch. The roster,
inspector and trade window offer switching only for controllable heroes, and
Next hero appears only when another living hero can be controlled.
Guests cannot claim occupied slots or take a second hero.
Party snapshots carry a connection-specific `controlled_slot` and
`controllable_slots`, while `active_slot` retains its native turn-queue meaning.
The roster, action controls and camera-centering controls reuse those fields.
The dungeon camera follows that connection's controlled hero by default during
normal play, including movement, explicit hero switches and reconnects. Other
players' turns do not select a different camera target. Manual centering remains
available until movement or a native viewpoint update resumes following;
targeting, full-map navigation and held minimap previews keep their own camera.
Spectators retain the native viewpoint. Automatic following applies only when
the controlled hero has a known position on the currently streamed floor.

Native availability, turn scheduling, action costs and prompt ownership remain
engine responsibilities. This does not add simultaneous independent native
menus or independent floor/map streams. Reservations survive browser reconnects
within a running expedition; the existing launch/resume mechanism supplies the
member map when creating a game process.

Trading is available from a companion's roster card, the Inventory header and
the equipment folio. Choose a recipient and give a quantity or the whole stack;
search, recipient and quantities remain available for repeated transfers. Solo
owners can explicitly control an unclaimed companion inside the trade window
to give items back. Multiplayer players send from their assigned hero.

The native engine requires a living recipient on the same floor, inside the
giver's own sight radius with an unobstructed native line of sight. Shared party
vision and browser coordinates do not grant trading access. Every transfer
rechecks the controlled source, recipient, item name, stack size, quantity and
equipped state. Equipped or melded items must be removed first. Native inventory
placement handles stacking, wand charges, evokers, item letters and capacity.
Rejections leave items and turns unchanged; a successful transfer costs the
giver one normal action. Gold remains shared. Request IDs isolate multiplayer
results and connection failures never replay transfers.

Trade validation on 17 October 2026: 274 native assertions in two Catch2 cases,
25 backend control/protocol tests, responsive trade UI checks at 1280, 768, 390
and 320 pixels, the equipment folio regression and the nearby-creature metadata
transition regression passed. `tests/party-trade-native.cjs` used two disposable
browser sessions and real native inventories to verify splitting, merging,
return transfers, one-action costs, stale and forged requests, equipped-item
rejection and save/exit. `tests/party-trade.cjs` covers search, quantity validation,
Enter-to-give, result isolation, companion switching, focus and connection errors.
These are local checks; they do not establish deployment or remote multiplayer
acceptance. Both tests use temporary output directories by default.
The validated executable was installed into the main local checkout after
matching all native source files and 15 atlas/index assets. Persistent evidence
is in the [trade validation folder](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14bf1-e031-7762-9789-32583b99577e/party-trade/validation.json).

Other connected players' hovered dungeon tiles have an outline in their hero's
roster color and a P-number label. Overlapping pointers retain separate outlines.
This works automatically during ordinary hovering and targeting, including when
the receiving player pans or zooms their camera. Spectators can see these pointers;
only players with a claimed hero can publish them.

`webtiles.tile_presence.TilePresence` keeps connection IDs, coordinate validation,
rate limiting, short leases and map generations independent of the engine.
`party-hover.js` supplies pointer events, heartbeat renewal and canvas drawing.
Leaving the map, hiding or blurring the window, disconnecting, or changing maps
clears the pointer. Hover packets remain within the expedition and never reach
the native input channel or spend turns. The native multiplayer regression is
`tests/party-hover-native.cjs`; the backend contract is `webtiles.tile_presence_test`.

Validation on 17 October 2026: 185 backend unittest tests, party-data contracts
and trading UI checks at 1280, 768, 390 and 320 pixels passed. The two older
pytest-based modules (`auth_test` and `util_test`) were unavailable because
pytest is absent from the local environment.
`tests/party-control-native.cjs` passed eight real native actions across
two isolated localhost browser sessions, including alternating keyboard and pointer
movement, unchanged other-hero positions/turn counts, solo companion selection,
multiplayer refusal to switch, shared-prompt isolation and reconnect.
It also verified the solo-to-multiplayer transition while the host had a
companion selected, hidden switch controls for both players and turn-free
rejection of direct and nested switch/cycle requests. Native evidence is in
[/tmp/dcss-fixed-character-native-proof/evidence.json](/tmp/dcss-fixed-character-native-proof/evidence.json).
It also checks each connection's camera against its controlled hero after those
actions, plus turn-free manual centering. `tests/camera-follow.cjs` covers native
targeting, full-map navigation, spectators, unavailable positions and temporary
minimap previews.
It defaults to localhost; live verification requires the explicit
`DCSS_CONTROL_ALLOW_LIVE=1` opt-in and creates disposable QA accounts.
