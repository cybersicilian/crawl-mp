# Safari control and exploration responsiveness

The browser transport previously disabled its work budget when a gameplay key
interrupted an animation. It drained the entire queued update backlog before
sending that key. Catch-up now keeps the normal eight-millisecond work budget
between handlers and yields to browser events and paints. Its animation-skip
mode persists across drain slices until the queue empties; subsequent animations
resume normally. Loading barriers, packet order and reconnect resets remain in
force. A single handler still runs to completion.

Multiplayer activity readiness is now polled every 50ms instead of 150ms through
`ActivityPump.tick_interval_ms`. This removes extra scheduling delay, including
when several exploring heroes rotate through the shared engine. Native command
acknowledgement, round-robin ownership, finite-work pacing and combat cooldowns
retain their existing rules. The poll does not simulate or predict game turns.

The queue mechanism is independent of game-specific presentation. The activity
poll is a scheduler setting used by the WebTiles process adapter. The production
overlay contains only these changes; unrelated newer local scheduler, AI and
global-clock code was excluded.

## Evidence

A controlled 96-update backlog with three milliseconds of work per update
blocked input for 289ms on the installed WebKit engine before the change and 9ms
after it. The first timer ran after 293ms before and 10ms after. Chrome changed
from 288ms to 9.1ms. Every queued update arrived in its original order. These
figures describe the controlled catch-up workload, not general network latency.

The WebKit candidate also completed four native inventory open/close cycles
without spending turns, including toolbar focus and interrupted animation waits.
One manual key produced exactly one native turn. Auto-explore advanced 15 turns
and stopped normally, and the disposable campaign saved. No page errors occurred.

Transport, authentication, send-race and socket recovery checks passed, together
with 63 local activity/input regressions. The exact production-based scheduler
passed 13 applicable ownership/readiness contracts. A controlled Tornado timer
test with acknowledged mock commands dispatched three steps at the old interval
and ten at the new interval over 520ms, preserving fair rotation and one command
in flight. That timer test does not invoke the native engine.

The installed WebKit engine was tested; the user's interactive Safari session
was not directly instrumented. Initial native profiling and failed test-fixture
attempts are retained separately from successful acceptance evidence.

## Release

Release `/opt/dcss/releases/webkit-catchup-01a17ea4` succeeded with a service
restart on 27 October 2026. The active native game saved through its normal
SIGHUP path before cutover. The verified backup preserved 8,871 saved-directory
files and 306 SQLite databases. No save snapshot was restored. The native binary,
earlier multiplayer transport optimizations, compact keypad and Common hotkeys
files retained their exact deployed hashes.

A fresh public WebKit client then loaded the installed code, interrupted a
one-second animation wait with native inventory input, closed the menu without
spending a turn, and issued exactly one native turn from toolbar focus. The
campaign saved successfully after the restart, with no page errors. Public
application/disk health passed with a sample newer than the activation receipt.

Receipts and reproducible source bindings:
[`diagnostics/2026-10-27-webkit-controls/`](diagnostics/2026-10-27-webkit-controls/).
Reload Safari to load the updated browser transport.
