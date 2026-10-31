# Burrows route playtesting

This work uses disposable native games to assess Burrows:1–4, the optional
Hive:1–2 detour, and Wormlands:1–4 through its Depths connection. It does not
use existing saves or change a running service.

[Current encounter tuning and evidence](tuning-20261028/README.md) ·
[27 October XP, loot and honey pass](RESULTS.md)

## Method

- Three fixed XL14 midgame fixtures: Minotaur axe/shield fighter, Human bow
  hunter, and Deep Elf earth/conjuration caster. `builds.json` records their
  equipment, skills and attributes. Early stress tests start without a god.
  Prepared paired tests use XL16, two additional skill levels, Okawaru for
  physical builds or Vehumet for the caster, and initial piety 100. Later
  coverage tests, if needed, are identified separately in the results.
- Wizard commands supply the initial fixtures and place the character on
  Burrows:1. Subsequent fighting, regeneration, spell costs, consumables,
  XP growth, traps and stairs use native gameplay. Death stays enabled.
- `player.lua` is a bounded autoplay policy, using visible enemies and native
  exploration. Full-map telemetry is observational; its navigation helper
  locates stairs after exploration has stopped. It never moves the character
  instantly during a test or edits combat stats after setup.
- The policy is deliberately limited. It does not establish expert-player
  viability or optimal resource use, and deaths can reflect tactical mistakes.
  A shaft can interrupt the intended floor order. The raw records retain these
  outcomes rather than silently reviving or replacing failed games.
- The native generation survey is separate from combat. It measures monster
  counts, available XP, ground item classes, artefacts and gold across twelve
  fixed seeds, with lower Dungeon, Snake, Spider and early Depths comparisons. Unique and
  vault history persists within each surveyed route.

## Acceptance and tuning constraints

1. Confirm each fixture's actual equipment, defences and spells before treating
   a game as a balance observation. Harness errors and timeouts are failures of
   the harness, not monster balance results.
2. Preserve a baseline before changing content. Retest the same seeds and
   configurations after a focused change; retain every death and incomplete run.
3. Prefer native monster data, population weights, vault depth limits and normal
   item specifications. Do not introduce branch XP multipliers, mandatory
   resistances, guaranteed counters, kill gates or bespoke reward mechanics.
4. Check the specific change with native combat or generation and existing
   content contracts. Report remaining gaps separately from passed checks.

The Python runner and native audit can support other branch tests. Fixtures
and route-specific stair choices remain data or thin adapters around them.
`phase.py` reserves the shared host gate for each exact bound request and writes
process-group closure evidence before releasing its reservation. All game
processes are bounded and run sequentially.

`validation/` preserves requests, terminal logs, JSON telemetry, morgues and
reservation closures. Early pilot failures are historical setup evidence;
they must not be counted as completed route playthroughs.
