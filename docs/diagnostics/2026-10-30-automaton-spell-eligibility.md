# Automaton spell eligibility — 2026-10-30

Automatons may acquire and memorise only spells for which
`automaton::has_automatic_trigger` returns true.

- Casting eligibility provides the permanent rejection reason used by
  memorisation and utility-based reward selection.
- Library additions and direct memory grants reject unsupported spells before
  changing player state. Vehumet's gift candidates apply the same trigger rule.
- Party library sharing now filters each recipient independently. It retains
  the full shared pool for other species even when an Automaton is active, and
  removes unsupported entries from Automaton recipients on synchronization.
- Existing unsupported library entries remain visible and cannot be memorised.
- The previous memorisation warning is removed because learning is now blocked.

Regression coverage in `catch2-tests/test_spl-util.cc` includes unsupported saved
entries, hidden entries, mixed rewards, direct grants, wizard learning, old divine
offers, supported spells, and other species.

## Verification

All changed native translation units and the regression test translation unit
compiled successfully in an isolated source snapshot using C++17. Whitespace
checks passed. Every local native phase used the shared host gate and its exact
reservation was released after all owned processes exited.

The full test executable could not be built: existing population tables in
`mon-pick-data.h` have 44 entries while `NUM_BRANCHES` is 45, failing the assertions
at lines 1267, 1424, and 1533. Regression tests have been compiled, not executed.

Two minimal build repairs found during verification are included: the missing
`stringutil.h` include in `bag-menu.cc`, and the existing Collector/Caravan enum
entries in `util/job-gen/job-type-header.txt`. The regenerated job enum retains
the existing values and order.

Frozen inputs, build logs, and reservation closures are under
`/private/tmp/dcss-automaton-eligibility-01a18dad/`. No deployment was performed.

## Party-sharing follow-up

The party initialization and shared-state copy paths bypassed ordinary library
grants. Initialization now defers merging to shared-state synchronization, which
distributes the complete pool while excluding spells without automatic triggers
from each Automaton's library. Other species retain their spells across repeated
synchronization and either active-hero order.

Additional regressions cover every fixed book in Sage's selection pool and both
party slot arrangements with repeated active-hero changes. These additions have
passed whitespace review but have not been compiled or executed: the shared host
reservation is held by a different task (`d2a41b95-11d0-4f18-acbd-fd8fd5d8447f`,
owner `codex/01a182a9-4f73-7ba2-b45a-20b0022a438a`). That reservation was left
untouched. The earlier compilation evidence above does not cover this follow-up.
