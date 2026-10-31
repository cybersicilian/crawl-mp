# Burrows encounter investigation — 28 October 2026

This revision separates repeated disabling encounters, improves initial ending
arrivals, and pays durable Burrows enemies closer to their native threat peers.
Combat balance remains provisional. The final native results below distinguish
full-route attempts, comparable-branch controls and fresh ending coverage.

## What the deaths established

The earlier “zero clears” combined encounter pressure with a limited test policy.
It was not a reliable estimate of a human player's completion rate.

- The hunter kept shooting armoured blockers while exposed to several enemies.
  The caster repeatedly used Sandblast against a boulder beetle's heavy armour.
  Another caster spent Fireballs on an iron troll with fire resistance, while
  deathcaps remained alive. The previous tests also ignored equipment upgrades
  and wands. These are material build and tactical limitations.
- The fresh Wormlands ending fighter was polymorphed into a wisp by a great orb
  of eyes, melding its weapon, plate and shield. It continued fighting. This
  explains that individual failure; it does not justify weaker ordinary melee
  monsters throughout the route.
- Ordinary Wormlands earth mages and shamans brought native bands of three to
  six additional trolls. Repeated random support selections overlapped haste,
  might, armour, regeneration, constriction, acid and Drain Life. Wormlands:3
  averaged 56.6 monsters. The problem was encounter composition as well as XP.
- Hive:2 averaged 17.2 meliai and 12.9 spark wasps across the twelve seeds.
  Its fast attackers, repeated smiting bands and electrical bursts could join
  random enemies near the upstairs before the player had separated an encounter.

The unchanged Snake controls killed the hunter on floor 1 at turn 747 and the
caster on floor 1 at turn 120 (Donald); the fighter reached floor 2 at its
2,000-turn cap. These used the same XL16 fixtures, gods and consumables. They
show that these fixed fixtures and the test policy also fail in existing content.
They do not establish that the new route is equally difficult.

The corrected early policy kept the unchanged Burrows hunter and fighter alive
past the same 2,000-turn cap on Burrows:2. Once recoil handling was repaired,
the unchanged caster explored Burrows:1 and died on Burrows:2 at turn 1,321.
The first revised six-game batch is preserved in [combat-1](combat-1/): all
six games exited normally with actual deaths; the best fighter reached
Wormlands:2 after exploring seven route floors. Those deaths prompted the
subsequent Hive adjustment rather than being discarded.

## Content changes

- Burrows ordinary boulder beetles enter from floor 2. Burrowing beast base XP
  rises from 600 to 700 and crag boar XP from 550 to 700. Health, AC, EV, attacks
  and speed are unchanged. A native death yak has comparable bulk and physical
  damage with base XP 811; the adjustment reduces the incentive to fill the
  branch with under-rewarded armoured bodies.
- Wormlands removes shamans, earth mages and great orbs of eyes from ordinary
  selection. Authored support vaults remain. Deathcaps enter the base table from
  floor 3 at lower weight; native out-of-depth selection still applies. More
  ordinary wandering mushrooms keep the fungal identity. Acid, constriction,
  burrowing, iron trolls, stone giants and rare iron dragons remain.
- Hive reduces ordinary bee/queen packs, meliai and spark-wasp weights, shifting
  weight to wax beetles and venom wasps. The ending's guarded spark wasps and
  meliai/queen remain. Poison resistance still leaves melee, electrical damage,
  speed, positioning and priority-target problems to solve.
- Both ending layouts use a shared chamber-graph arrival helper with native
  `no_monster_gen` and `no_trap_gen` masks around all three upstairs. This only
  affects initial placement; monsters can enter and attack normally afterward.
  It grants no immunity, lock, scripted phase or mandatory resistance.

The population dice are Burrows 19/20/20/44, Wormlands 14/20/26/36 and Hive
26/38. These select ordinary quantity using existing native placement, caps and
party rules. There is no branch XP multiplier, kill gate, special drop or
repeatable reward. The ordinary monster pool and individual creature data
supply XP directly.

This follows Crawl's documented emphasis on meaningful decisions, clarity,
internal consistency and avoiding grinding. Durable enemies, ranged threats and
limited support pairings still test builds, while the player has space to assess
and separate initial encounters. The optional Hive hoard remains a risk/reward
choice. Native poison, electricity, armour, constriction and spell rules retain
their usual answers.

## Test policy corrections

The policy now uses visible enemy information to prefer support creatures and
constrictors, chooses spells with armour and fire resistance in mind, and makes
ordinary retreat moves. It prioritises spark wasps and acid spitters, including
adjacent melee bump attacks. It avoids known traps during Bombard recoil,
restricts caster fallback to explicit spells, and handles confusion without
blind movement. No combat stat, health, teleport position or god standing is
changed after setup.

The first recoil attempts in `baseline-2`, `baseline-3` and `causal-controls`
stalled at a native trap confirmation and remain excluded. The initial native
survey passed generation and contracts, then its strict XP-control assertion
found two pre-existing burrowing beasts in Depths:2 whose XP also changed.
[The two exact revaluations](verify-1/control-xp-changes.json) are declared;
all other control values remain strict. No failed phase is reported as a pass.

The policy still does not upgrade gear or use wands. It cannot reliably evaluate
all escape options, invisible enemies or future encounters. Its outcomes are
native test observations, not expert human balance acceptance.

## Final validation

The final encounter build passed 1,214 assertions in 16 cases and generated
300 native floors across twelve seeds. All ten route-floor XP means remain
within 25% of their comparable-progression targets. All 24 ending floors have
no initially placed monster within three squares of any upstairs, and all 24
Hive floors retain connected dry ground. [Native verification](verify-2/closure.json)
and [raw floor economy](verify-2/survey/melee-2026102701/economy.json) are retained.

Burrows matches the corresponding Snake/Spider floor mean; Hive uses their
third and fourth floors. Wormlands interpolates from Dungeon:14–15 to Depths:1.
These are generated available XP totals, including guards and bands, rather
than XP earned by a survivor. Twelve seeds do not bound individual-floor
variance. [Medians and quartiles](results/economy-comparison.json) are preserved.

| Floor | Before XP | Tuned XP | Peer target | Difference | Items |
|---|---:|---:|---:|---:|---:|
| Bur:1 | 19,972 | 19,990 | 19,259 | +4% | 17.9 |
| Bur:2 | 19,648 | 21,952 | 22,590 | -3% | 15.5 |
| Bur:3 | 23,045 | 17,722 | 20,394 | -13% | 15.2 |
| Bur:4 | 33,246 | 35,379 | 43,703 | -19% | 22.8 |
| Hive:1 | 18,505 | 18,714 | 20,394 | -8% | 23.7 |
| Hive:2 | 37,757 | 33,093 | 43,703 | -24% | 24.5 |
| Worm:1 | 16,971 | 16,190 | 16,202 | -0% | 17.3 |
| Worm:2 | 26,698 | 26,202 | 25,819 | +1% | 17.6 |
| Worm:3 | 42,744 | 32,163 | 35,437 | -9% | 21.2 |
| Worm:4 | 43,323 | 41,398 | 45,054 | -8% | 24.2 |

Hive:2 drops from 77.5 to 64.0 monsters per floor, with meliai 17.2 → 9.9 and
spark wasps 12.9 → 8.3. Wormlands:3 drops from 56.6 to 45.5 monsters. Wormlands
ending XP remains 41,398 against a 45,054 target; Hive:2 is 33,093 against
43,703, near the lower edge of the declared band. No floor loot specification
was reduced: ordinary finds and the existing ending hoards remain. Differences
in observed loot follow the changed native generation sequence.

All 180 control floors retain identical monster counts, rosters, loot and vaults.
178 also retain identical XP; the other two contain an existing burrowing beast
and gain 99 or 100 XP through its explicit valuation and native HP scaling.
These are Depths:2 floors, outside the target-reference floors, so peer targets
are unchanged.

### Final combat outcomes

All ten cases in [the final combat phase](combat-2/closure.json) verified their
starts, exited normally, and ended in native deaths. The six full-route attempts
use XL16, +2 baseline skills, their same fixed gear, gods and consumable kit.
The three ending cases start fresh at XL20 with +4 baseline skills. They do not
inherit damage or resource consumption from the route. Death remains enabled.

| Build | Seed 2026102701 route | Seed 2026102702 route | Fresh Wormlands:4 |
|---|---|---|---|
| Fighter | Died Hive:2, turn 4,313 | Died Wormlands:3, turn 11,931 | Iron troll, turn 545 |
| Hunter | Died Burrows:2, turn 1,977 | Died Hive:1, turn 2,875 | Deathcap, turn 416 |
| Caster | Died Hive:2, turn 4,973 | Died Hive:1, turn 2,524 | Coil constriction, turn 105 |

The tenth case is the unchanged-world fighter with the same final policy; it
also died on Hive:2, turn 4,011. [Raw summaries and actual resource-use counts](results/games.json)
link to each audit and morgue. The final policy improved first-floor performance
but did not produce a surviving clear. The fresh ending caster still drew a
large mixed group while fighting; the placement masks do not prevent monsters
from converging after noise or movement. The ranger died to Drain Life, and the
fighter exhausted its options against iron trolls. These remain concerns for
human playtesting and better build/equipment progression coverage.

**There is still no demonstrated full-route clear or surviving traversal of the
Depths connection.** This revision establishes lower overlap and retained XP
parity; it does not establish a satisfactory completion rate. These are reused
tuning seeds and a small fixed-gear sample, not held-out balance qualification.

## Curated-port integration

The user requested incorporation alongside **Port curated fork content**. Its
current built snapshot already contains all eight encounter source files with
exact matching hashes. The port manifest now records this branch route and its
XP/encounter constraints as the baseline for future Hive feedstock. The playable
Meliai and larvae/brood salvage remain that task's later work; they are not
silently added to the tuned enemy population.

The normal `Makefile.obj` test list now includes the honey and population-budget
contracts, which the port's default target previously omitted. The initial
combined binary passed 1,131 assertions in 22 registered cases; that count did
not include the two newly registered test files. A durable combined-source
validation below checks the complete registration and default-rule economy.

The standalone encounter native hash is
`113e582a9838266a8fd40a78eb59b14e657faf6ffd51d73aebefeaf07e829f2d`.
[The source manifest](results/content-files.json), [source status](results/source-status.json)
and [focused patch](results/encounters.patch) retain its exact content. The
shared checkout also has newer player/stair modifier work; it was not overwritten
with the older isolated source. [Port source inclusion](port-integration/source-inclusion.json)
and [integration file hashes](port-integration/integration-files.json) record
what was incorporated.

The temporary standalone build directories disappeared before the requested
port integration. Native logs, morgues, economy data, closures and source patch
remain in the repository. A preview-only retry consequently stopped before
reserving the host. A first durable combined clone was interrupted after it
triggered an unnecessary full rebuild; that snapshot and failure evidence are
retained. The next phase used the port's unchanged native runtime and compiled
only missing test objects, with no modification of the port task's snapshot.
It passed the complete registered contract set: 1,345 assertions in 26 cases
([log](combined-validation-2/contracts.log)). Its subsequent survey failed to
start because the isolated harness received an export driver in place of the
canonical export library. The corrected survey uses the repository's actual
`dat/dlua/burrows_preview.lua`; the runner now also asserts successful dungeon
Lua execution before reporting survey completion. Failed runs produced no
floor data and remain excluded.

All heavy phases reserve and close the shared host gate. Existing player saves,
running services, Forest work and Hall of Blades work are preserved. Production
deployment and expert human play acceptance remain separate from these local
checks.


### Combined-source result

The corrected [combined phase](combined-validation-3/closure.json) passed.
All 300 generated records exactly match the final standalone encounter survey,
including every XP total, roster, loot count/class, vault, honey count, dry-route
result and arrival count. [The compatibility receipt](combined-validation-3/compatibility.json)
records the unchanged curated-port native hash:
`7941fe60811f4592a179a9a4e75d902ede8785c8ef43a0ef0ebeb9e86fbb9dbc`.
The eight encounter files match the shared checkout, and both new test objects
are registered there and in the tested snapshot. The continuing port added a
separate Two-Headed Ogre test entry after this snapshot; it is preserved and
outside this validation. The test-only link retains the existing port runtime.

[All ten combined native floor previews](previews/README.md) and the
[matching generation/render manifest](previews/preview-manifest.json) use that
same combined hash. The earlier interactive generation widget remains a
historical preview; it was not relabelled as current evidence.

The [port manifest](../../../../port-manifest.md) now carries the branch integration
checkpoint. [The integration validation receipt](port-integration/validation.json)
summarises the combined checks. These results cover integration with the port's
current step 1 framework and default campaign rules; they do not claim the
remaining curated species, spells, gods or branch feedstock have been implemented
or playtested through this route.
