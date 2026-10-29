# Input responsiveness

Keypresses go from the browser through a Tornado WebSocket and a Unix datagram
socket to the native game. Native updates return through the same bridge and
an ordered browser message queue. The native game remains authoritative for
turns, hero ownership, prompts, costs and confirmations.

The transport now:

- Disables TCP small-packet buffering on established WebSockets.
- Retains game input in order when the Unix socket fills, then retries when
  writable. Immediate sends have no timer or batching delay.
- Keeps animation waits separate from client-loading barriers. Replacing a
  wait cannot leak an inhibition count and freeze subsequent updates.
- Lets keyboard and gameplay actions cancel waits and catch up queued animation
  frames. Loading barriers remain in force. Long ordinary batches yield to
  browser events after eight milliseconds of processing.
- Uses the standard JSON parser, with the existing legacy-message fallback.
- Suppresses identical personalized party snapshots, while sending changes in
  state or control and complete state to newly loaded clients.
- Avoids collecting a Python stack trace on every successful outgoing frame.

Keyboard translation uses the same sender as other gameplay actions, including
special keys and raw byte input. Existing message formats and server-side hero
binding are preserved.

## WebSocket recovery

The socket lifecycle is independent of the game message queue. Unexpected drops
retry automatically with jittered backoff capped at 30 seconds. Handshakes time
out after 15 seconds. Browser network restoration triggers an immediate retry;
sleep/wake gets a fresh liveness window. Native protocol pings run every 20
seconds with a 20-second response timeout, independently of JavaScript timers.
The server translates this response window for Tornado 6.4's older timeout semantics.
The browser also checks application responses and retires silent connections.

Authenticated hosts have a 30-second grace period after the server detects a
drop. Reconnecting transfers the existing engine and its end callback to the
new socket; guests can remain in the game. If the old connection still appears
live, recovery waits for its timeout instead of taking over an active tab.
After grace expires, the existing save-and-stop path applies. Expired login
tokens require signing in again. Idle limits and policy closures remain final.

Recovery authenticates before restoring the game route, refreshes the native
client, clears stale queues and loading callbacks, and restores a guest's hero
reservation. Party launches now record their play route. Commands are rejected
when the socket is unavailable or the browser reports being offline; the client
does not queue gameplay input for replay after reconnecting.

Server settings are `websocket_ping_interval`, `websocket_ping_timeout` and
`reconnect_grace_period`. Setting the grace period to zero restores immediate
save-and-stop behavior after disconnects. No reconnect credential is added.

## Validation

Local native/browser validation on October 17, 2026 passed:

- 413 engine bindings, 178 distinct translation probes and 20 physical browser
  keys, with existing web panels preserved and no game turns spent.
- 24 inventory open/close keypresses over compressed transport: median next UI
  frame 27.2 ms, p95 37 ms. A keypress interrupted a controlled 1,000 ms client
  animation wait in 28.7 ms. These are localhost observations, not WAN latency
  guarantees. The frame timestamp precedes the browser's actual paint.
- Repeated unchanged menus delivered no redundant party snapshots. Changed
  clocks, personalized control and new connections are covered separately.
- A real Unix socket was filled, then drained all 512 packets in exact order.
- Two real browser sessions completed ten native actions with personalized
  control, turn ownership and keyboard/pointer movement preserved.
- Deterministic browser-queue tests cover overlapping waits, cancellation,
  loading barriers, nested messages, handler errors, yielding and old JSON.

Relevant checks are `tests/client-transport.cjs`, `tests/input-latency-native.cjs`,
`tests/native-hotkeys.cjs` and the Python `webtiles.connection_test` and
`webtiles.gameplay_protocol_test` modules under `crawl-ref/source/webserver`.
The native browser tests require Playwright and a disposable localhost server;
set `WEBTILES_URL` to select it. Set `INPUT_LATENCY_COMPRESSION=1` to exercise
compressed frames. Browser evidence is written to `INPUT_LATENCY_PROOF`.

Recovery checks are `tests/socket-lifecycle.cjs`, `tests/client-connection.cjs`,
`tests/comm.cjs`, `webtiles.session_recovery_test` and
`webtiles.websocket_stability_test`. `tests/socket-recovery-native.cjs` exercises
real host/guest drops, browser offline/online transitions, unchanged expedition
identity and turn clocks, guest continuity, and native menu input after recovery.
Set `SOCKET_COMPRESSION=1` to exercise compressed frames and
`SOCKET_RECOVERY_PROOF` to select the JSON evidence path. This test accepts only
localhost URLs by default and creates disposable accounts. Production verification
requires `SOCKET_RECOVERY_ALLOW_LIVE=1` with the exact HTTPS production hostname;
that run explicitly saves and exits its QA expedition afterward.

The October 17 recovery validation passed all four deterministic JavaScript
suites and 130 backend unittest cases. Two existing pytest-only modules were
excluded because pytest is not installed in the local environment. Both native
browser runs passed four recovery scenarios each, with compressed and
uncompressed transport, unchanged turn clocks and no browser page errors.

Backend changes require a WebTiles server restart; browser changes require a
page reload. Validation used an isolated server and disposable accounts. The
existing running server and hosted release were not restarted or deployed.

## Turn transport and ping indicator

The subsequent movement investigation found repeated derived HUD rendering on
the temporary busy/ready modes within each native turn. Inventory, quick slots,
card readings and dock presentation now coalesce those updates into one frame.
Action validation and authoritative native updates remain synchronous. Ordinary
keypresses no longer drain an unrelated receive backlog before sending.

New clients negotiate `native-deflate-v1`: Tornado and the browser handle
permessage-deflate at compression level 1. The JavaScript inflater and its
Safari exclusion are removed from the active connection path. Existing clients
retain the original compressed or uncompressed protocol; the text subprotocol
remains a fallback. Native compression never nests application compression.

`transport_hello` version 1 enables ordered `state_frame` messages. The first
personalized party snapshot is complete; subsequent frames contain changed
object keys and array indices. Changed array lengths replace the array. Null
and deleted keys are distinct. Large deltas fall back to complete snapshots
when that is smaller. Each connection and game owns its own baseline; control
changes remain personalized. Gaps request a complete snapshot without invoking
the engine or spending a turn. Client presentation cannot mutate the baseline.

The visible connection indicator shows round-trip milliseconds with a status
dot. Its tooltip reports recent jitter and outgoing buffered bytes when present.
A small sequence-checked server echo runs every five seconds in visible tabs,
independently of animations and loading barriers. Disconnects, missing replies,
background suspension and reconnects do not leave a false low ping. The value
does not wait for a native turn or screen paint; browser/server event-loop load
can still affect an application-level round trip.

The reusable mechanisms are `frame-update.js`, `state-stream.js`,
`latency-monitor.js` and `webtiles/state_transport.py`. Party personalization,
socket negotiation and indicator placement are adapters. The engine-to-server
Unix socket continues to carry complete native snapshots.

Initial four-hero native validation measured a 41,704-character complete state
frame and a median 466-character delta, approximately 98.9% less state data
before compression. Eight rapid keys produced exactly eight turns for the
controlled hero. Deliberately invalidating a delta baseline triggered a complete
refresh without changing the world clock. These are disposable-game checks;
timings depend on browser, network and local CPU load.

Checks: `tests/state-stream.cjs` runs 120 real Python-encoder/browser-decoder
round trips; `tests/latency-monitor.cjs` covers RTT, jitter, stale replies,
timeouts, background tabs and reconnects; `tests/frame-update.cjs` covers
coalescing and cleanup. The extended `tests/turn-latency-native.cjs` checks
movement, rapid input, negotiated compression, baseline repair and visible ping.
Use `TURN_LATENCY_OPTIMIZED=1` and `TURN_LATENCY_COMPRESSION=1` to require the
new protocol; `TURN_LATENCY_ENGINE=webkit` selects WebKit. Live runs require
`TURN_LATENCY_ALLOW_LIVE=1` and the exact production HTTPS hostname; they create
and save/exit their own QA expeditions.

The final local runs passed 139 backend unittest cases, the focused final
transport/socket regressions, 120 cross-language delta states, deterministic
queue/liveness/ping tests, the equipment/HP-cost fixture, and all 178 distinct
key-routing probes. Chrome and WebKit both completed 16 measured native turns,
eight rapid additional turns, negotiated native compression and delta baseline
repair. Four host/guest socket recovery scenarios retained clocks and control.
The ping indicator was visually verified in the current gameplay progress bar.
No production staging or activation was performed: automatic approval review
rejected uploading the release and launching the privileged staging job without
explicit production-deployment authorization.

## Dungeon frame updates

Map state still merges immediately. Map, party, camera, local cursor and peer
hover updates now request one shared `requestAnimationFrame` paint. A burst uses
the newest known state and camera at that paint, without waiting for another
packet. Native turns and movement remain authoritative.

Each paint clears the visible canvas and draws its cells once in depth order.
This replaces copying old camera pixels and recursively blending overlapping
sprites. Minimap and creature-list bookkeeping still uses dirty cells. Terrain
animation advances on native updates and its existing timer, independently of
cursor repaint frequency. Loading/cleanup cancels pending paints, and a new map
discards dirty positions from the previous level.

`tests/display-frames.cjs` covers burst coalescing, immediate logical state,
final camera selection, single-pass sprite drawing, cursor/hover scheduling,
loading readiness and lifecycle cancellation. Existing camera, transport and
send-race suites also pass.

`tests/display-frames-native.cjs` creates a disposable four-hero localhost game
and compares movement and camera frames with independent clean repaints. It also
checks that twenty refresh requests and a camera change produce one paint.
The pixel test pins canvas rasterization to avoid GPU/CPU text-edge differences
introduced by repeated canvas readback. Set `WEBTILES_URL`, `FRAME_DPR` and
`FRAME_PROOF_DIR` to select the isolated server, display scale and evidence path.
Local native runs on October 17 passed all 24 samples at 1x and 1.25x display
scales with zero differing pixels and no browser errors. The 800-cell clean
repaint median was 2.4 ms in both runs (maximum 3.4 ms); these are local software
canvas measurements, not performance guarantees for other devices.
This browser-only change requires a page reload after installation; it has not
been deployed to the hosted release.

Tracked native commands now complete even when they only redraw or ignore a
stale UI selection. These commands return through the normal command boundary
without spending a turn. Previously they could leave the server waiting for a
completion token indefinitely, including with no enemies visible. Exact native
completion restores server readiness; buffered local rejections cannot strand
later input. Stale tokens and personal-view refreshes retain their existing
ownership restrictions.

The October 26 source fix passed 87 focused backend tests and an isolated native
before/after probe: the original engine omitted its completion token; the fixed
engine completed four turn-free commands exactly once and then accepted three
alternating, actor-owned turns. This checks command completion rather than a
replay of the reported hosted encounter. Tests used disposable games. The fix
was deployed on October 26 after the Linux native probe and 19 queue regressions
passed. The remaining live game saved and exited through its native save command.
All four native packages and all 7,690 saved-directory files were preserved across
cutover; 284 SQLite backups passed integrity checks. Public HTTPS and application
health passed. See the [validation receipt](diagnostics/2026-10-26-input-freeze/validation.json).

The subsequent multiplayer audit reproduced a second all-player deadlock: rapid
owner input and premature native completion could assign the router's token to
a different hero from the native dialog owner. The local follow-up serializes
ordinary input, preserves automated prompt ownership, waits for complete macro
and control-handler return, rejects stale prompt responses, and guards both
queues against disconnects, identity changes, travel, overflow, and cancellation.
Native rejection paths now use the same completion boundary as accepted actions.

A local recovery watchdog queries the engine after five seconds and at bounded
intervals thereafter. It restores completion, tactical acknowledgements, or
prompt ownership only with evidence for the exact native request. Unknown or
unresponsive state produces diagnostic warnings, while the original command
keeps ownership. No timeout replays a move, dismisses a prompt, or releases an
unconfirmed command. The full [audit and remediation contract](diagnostics/2026-10-26-prompt-ownership/AUDIT.md)
and [validation receipt](diagnostics/2026-10-26-prompt-ownership/validation.json)
describe coverage and remaining hosted acceptance. This follow-up is local and
has not been uploaded or deployed; the earlier deployed fix remains distinct.
