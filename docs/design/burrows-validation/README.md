# Burrows validation

Current content revision: [twenty vaults per branch and fungal Wormlands](../burrows-generation/v6/README.md). Earlier results below remain historical.
The later [den-and-passage generation revision](../burrows-generation/v2/README.md)
adds ten ordinary vaults and replaces the open-cavern layout. Its native build,
63 vault placements, and 48 generated-floor checks passed separately. The
receipts below preserve the earlier implementation baseline.

The implementation passed the scoped native checks on 23 October 2026 in an
isolated macOS arm64 WebTiles engine build. The shared checkout's game binary
and running services were not replaced.

## Passed

- Native game and Catch2 builds with `FULLDEBUG=y`, C++17, and two make jobs.
- Full description and vault database loading.
- Five Burrows C++ cases: 552 assertions covering branch alternatives, Descent
  selection, native stairs and rune contracts, digging and spell rules, stable
  appended IDs, and clay rune item serialization.
- 61 existing branch, population, and other scoped C++ cases: 12,195 assertions.
- Native `mon-data` and `mon-spell` validation.
- All 11 authored non-dummy vaults placed three times: 33 placements, including
  every rune ending and the Worldworm.
- All four floors generated four times: 16 floors, with full-grid connectivity,
  normal stairs, a single Bur:1 exit, and rune/gem placement only on Bur:4.
- Native branch and monster catalogue exports, including descriptions and
  normal speed for all five new monsters.

Generation uses native RNG seed 1. Inspection uses `dgn.grid_bounds()`, which
exposes the complete native grid independently of the player-scaled builder
bounds. The older cached Lua bounds could omit terrain from these checks.

The final source matches the validated snapshot. Temporary generator logging
was removed and the restored source was recompiled before the final generation
confirmation. Every owned host reservation was closed and released.

## Scope and remaining issues

A broader `[save-compatibility]` debug selection stopped in Vellum's
`Property serialization preserves borrowed scripts without recreating static
extras` test, at the `store.cc:700` `SFLAG_UNSET` assertion. The Vellum and store
implementations were not changed by this work. That broader failure remains
unresolved; no complete-suite pass is claimed.

Three existing spellbook lists were sorted by spell level to permit native
debug startup validation. Their spell contents are unchanged.

Historical-save corpus loading and balance over full player runs were not
tested. These implementation checks preceded the dedicated
[artwork](../burrows-art/README.md), whose generation and validation are recorded
separately. No commit, deployment, or running-server update was performed.

## Local execution receipts

`attempt-15/` records the passing scoped pipeline; `attempt-16/` records the
final rebuild and generation confirmation without diagnostic logging.
`summary.json` contains the result counts and final binary digest. Each attempt
retains its input hashes, commands, logs, result, and exact host reservation
closure. Earlier failed attempts are preserved, including the Vellum failure
in `attempt-8/regressions.log` and the grid-bounds diagnosis.

`changes.patch` compares this implementation with the preserved starting files,
so unrelated work already in the shared checkout can be reviewed separately.
Execution receipts and generated diffs are local ignored artifacts.
