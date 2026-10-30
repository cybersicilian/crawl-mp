# Blood Hunter and bloodcraft

Blood Hunter is a starting background, not a permanent class. It grants no
exclusive traits, advancement track or skill. All five spells are ordinary
player spells, available in fixed books and the existing random-book/shop
systems. Species learning rules and religious restrictions still apply.

## Starting kit

- Attributes: +4 Strength, +5 Intelligence, +3 Dexterity.
- Plain weapon selection, leather armour, one potion of curing, one scroll of fog.
- Fighting, chosen weapon skill, Dodging, Spellcasting, Necromancy and Hexes: 2 each,
  before the normal species aptitude adjustments.
- Kindled Veins memorized; Winter's Due, Borrowed Thunder, Scarlet Fetters and
  Stolen Sight in the library. Innate casters retain their native learning rules.
- No starting god or active rite.

## Spells and costs

`P` is current native spell power, capped at 200. `H` is maximum HP before blood
reservations, including current HP modifiers and draining. One normal turn is
10 aut; durations use floor action time, not wall time or another hero's clock.

| Spell | Level / school | Base cost | Effect |
| --- | --- | --- | --- |
| Kindled Veins | 1 / Necromancy | 1 MP; reserve `max(2, ceil(0.12 H))` HP | Fire damage on weapon attacks |
| Winter's Due | 1 / Necromancy | Same | Cold damage on weapon attacks |
| Borrowed Thunder | 1 / Necromancy | Same | Electricity damage on weapon attacks |
| Scarlet Fetters | 2 / Hexes | 2 MP | Willpower-resisted movement binding |
| Stolen Sight | 3 / Hexes | 3 MP | Guaranteed modest accuracy impairment |

Native mana modifiers still apply. Amplification adds two MP after those
modifiers and costs `max(2, ceil(0.06 H))` additional HP. HP-casting species
pay the complete combined price in HP. Neither reservation nor amplification
can directly kill the caster. Invalid targets and cancelled casts refund the
normal spell cost. Miscasts spend normal casting resources, but commit no rite
HP and spend no amplification HP. Target resistance does not refund blood.

## Rites

One rite may remain active indefinitely. Activation subtracts its reservation
from both current and maximum HP. Healing cannot restore reserved capacity.
Switching directly to another rite takes a normal cast and retains the same
reservation. Dismiss Rite takes one action, restores capacity, and never heals.
Reactivation pays the commitment again. Forgetting the active rite releases it.

For example: `100/100 -> activate -> 88/88 -> take 20 damage -> 68/88 ->
dismiss -> 68/100`. Repeated toggling cannot generate HP.

Damage is `1d(3 + floor(P/20))` per 10 aut of weapon action time, rounded
without bias for other delays. One roll is shared across distinct living targets
hit by that action. Cleaving, multiple hits, dual wielding and penetrating
missiles cannot multiply the budget. Melee weapons, launched ranged weapons and
Unarmed Combat qualify. Thrown missiles, auxiliary attacks, retaliation and
spell-generated attacks do not create additional budgets. Existing weapon brands
remain intact; normal elemental resistance applies to rite damage.

Damage uses current power, so swapping an enhancer after casting cannot preserve
a stronger rite. Death's Door and a religion forbidding the rite suppress its
damage. Death's Door also prevents new life commitments.

| P | Bonus at 10 aut | Curse range | Ordinary bind | Amplified bind / anchor | Sight duration | Accuracy penalty |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1d3 | 4 | 1.1 turns | 3.1 turns | 3.2 turns | 15% |
| 50 | 1d5 | 5 | 1.5 | 3.5 | 4 | 17% |
| 100 | 1d8 | 6 | 2 | 4 | 5 | 20% |
| 150 | 1d10 | 7 | 2.5 | 4.5 | 6 | 22% |
| 200 | 1d13 | 7 | 3 | 5 | 7 | 25% |

## Curses and amplification

Both curses target a visible hostile quarry within
`min(7, 4 + floor(P/50))` tiles, respecting terrain and current vision.
Both may coexist on the same quarry. Selecting another quarry releases only
that caster's previous blood curses; ordinary Hexes and other heroes' effects
remain independent. Leaving the floor releases the departing hero's curses.
Normal dispelling can remove blood curses. No literal-blood eligibility test
excludes undead, constructs or demons.

Scarlet Fetters binds for `10 + floor(P/10)` aut if the target fails its normal
Willpower check. It stops ordinary movement, while leaving attacks, dodging,
spellcasting and other abilities available. Active blood binding cannot refresh.
After release there are 30 aut of recovery before any hero may apply another
blood bind. Native binding immunity is respected.

Amplified Scarlet Fetters adds 30 effective power to the resistance check and
20 aut to the duration. Dimensional anchoring applies for that amplified duration
even if movement binding is resisted, unless the target already cannot teleport.
This provides a late-game use against enemies with very high Willpower.

Stolen Sight reduces accuracy rating by `15 + floor(P/20)` percent for
`30 + floor(P/5)` aut. It does not directly subtract that percentage from final
hit chance. The ordinary effect does not remove vision, enable blindness stabs,
silence the quarry, or affect automatic-hit attacks, smiting or torment.

Amplified Stolen Sight extends the duration by 20 aut and attempts full blindness
at `P + 30` against Willpower, respecting blindness immunity. The ordinary
impairment remains if blindness is resisted. When full blindness applies, its
native impairment takes precedence instead of multiplying accuracy penalties.

Amplify Scarlet Fetters and Amplify Stolen Sight are native actions available
whenever the corresponding spell is memorized. They invoke the ordinary spell
casting path, including its failure and religious checks. They can be assigned
directly to quick actions; no persistent amplification mode or per-cast
confirmation is necessary. Spell descriptions expose current costs and scaling,
and the active rite displays its reservation in the native status list.

## General availability and progression

- Kindled Veins: Books of Flames and Necromancy.
- Winter's Due: Books of Frost and Necromancy.
- Borrowed Thunder: Books of Lightning and Necromancy.
- Scarlet Fetters and Stolen Sight: Books of Hexes and Misfortune.
- Existing random books, shops and eligible gift consumers use normal spell data.

Power continues scaling to 200 rather than ending at an early-game cap. There
are no background-only bonuses or order unlocks. A fighter can adopt one rite,
a Hexslinger can adopt one curse, and a Blood Hunter can stop investing in either
school. Resistant and bloodless late-game enemies retain applicable soft curse
effects, while immunity, automatic damage and crowds still require other tools.

## Validation

The focused native bundle passed 42 test cases with 1,937 assertions. A fresh
local WebTiles game also verified background selection, actual starting gear,
rite costs and status, and dismissal (16/16 HP to 14/14, then 14/16).

`catch2-tests/test_bloodcraft.cc` exercises the starting kit, ordinary book
availability, reservation accounting, nonlethal combined HP payments, miscasts,
native amplified casting, binding recovery, resistant/bloodless targets,
serialization, independent caster ownership, floor clocks, shared weapon budgets
and the native unarmed combat entry point.

Build and run the focused native tests with:

```sh
bloodcraft_tests="catch2-tests/test_bloodcraft.o catch2-tests/test_player_fixture.o \
catch2-tests/test_spl-util.o catch2-tests/test_party_session.o \
catch2-tests/test_party_trade.o catch2-tests/test_player.o \
catch2-tests/test_species.o catch2-tests/test_randbook.o"
make WEBTILES=y STDFLAG=-std=c++14 -j8 TEST_OBJECTS="$bloodcraft_tests" \
  crawl catch2-tests-executable
./catch2-tests-executable '[bloodcraft]'
./catch2-tests-executable
```

After rebuilding, regenerate the lobby's native character catalogue:

```sh
../../.venv/bin/python webserver/util/generate_character_catalog.py
```

The shared native modules contain no background eligibility checks. The only
background-specific spell rule is initial memorization in character creation;
normal library discovery, casting and skill progression apply afterward.

The numbers are implemented balance candidates. Tests of contracts and isolated
native workflows do not establish balance over a complete three-rune or extended
run, or fresh two-client multiplayer acceptance.
