# Burrows enemies

Implemented in source, 23 October 2026. [Branch](burrows.md) · [Vaults](burrows-vaults.md)

The new regular population needs a few recognizable creatures, rather than a
specialized support role for every situation.

| Enemy | Description | Behaviour |
| --- | --- | --- |
| Burrowing beast | A large pale mammal with digging claws and a wedge-shaped head. | Normal-speed melee with a strong bite; native physical burrowing through eligible walls. |
| Crag boar | A heavy boar with thick hide and mineral-stained bristles. | Durable, straightforward melee with a gore attack. |
| Shale drake | A squat, flightless drake that grinds swallowed stones in its throat. | Bite and natural Stone Arrow breath using ordinary breath recovery. |
| Deep troll delver | A cave-dwelling troll versed in simple earth magic. | Dig, Stone Arrow, and ordinary troll melee. Weaker than the existing deep troll earth mage. |

The four regular Burrows monsters and the Worldworm move at normal speed. Resistances, anatomy, attacks, and
spell classifications use normal monster data. Keep ordinary weaknesses useful;
being native to the Burrows does not grant a resistance package. Stats are defined in native monster YAML and still need gameplay balance assessment.

Existing deep trolls, boulder beetles, earth elementals, komodo dragons, and
death yaks provide familiar supporting enemies. Later vaults can draw on
cyclopes, lindwurms, and a catoblepas where appropriate.

The Worldworm is the Burrows named unique: an enormous pale burrower for
one Burrows ending, with a heavy physical attack and native burrowing. It does not
need phases or a new combat system.

The earlier cairnkeeper, Barag, and Old Bristle proposals are withdrawn. Injury
Bond and additional boss packages are unnecessary for this branch's identity.

The definitions are in `crawl-ref/source/dat/mons/`; abilities use the existing
monster spell and burrowing systems. Native checks are tracked in
[validation](burrows-validation/README.md).


## Wormlands and Hive

Gallery worms are armoured normal-speed burrowers with a bite. Coil worms use
normal constriction and a bite at normal speed, without burrowing. They have
no spells, auras, new status effects or special resistances. The Wormlands
population gradually adds existing deep-rock enemies as described in the
[branch design](burrows.md).

Hive uses native bees, hornets, meliai and spark wasps alongside the two regular
insects below. It retains flight, poison and priority-target pressure, without
adding webs or new disabling effects.
Gallery/coil tiles reuse the repository's unused rock/drill worm sprites;
native corpse generation supplies matching corpses.


## Regional content expansion

| Enemy | Where | Native behaviour and purpose |
| --- | --- | --- |
| Caustic worm | Wormlands:2-4 | Normal-speed bite and Spit Acid with breath recovery. A ranged threat behind a constrictor; corrosion resistance, line of sight and priority targeting are useful alternatives. |
| Wax beetle | Hive:1-2 | Normal-speed, grounded armoured biter. Delays easy access to ranged insects; armour penetration, poison and manoeuvring all help. |
| Venom wasp | Hive:1-2 | Speed 15 flying insect with Spit Poison and a weak poisonous sting. Punishes waiting behind a durable blocker. It adds no paralysis or webs. |
| Old Coil | Optional unique, Wormlands:2-4 | Normal-speed constriction and vampiric bite, 165 HP, AC 12. Tests escape planning and sustained close combat. No burrowing or regeneration outside its bite. |
| Vespara | Optional unique, Hive:1-2 | Speed 15 queen, 110 HP, AC 12; poisonous sting and the existing queen bee's Berserk Other. Only killer bees and meliai can be incited. Separating or killing the queen reduces pressure. |

The two uniques use ordinary `place_unique` vaults and native once-per-game
tracking. Neither is guaranteed or gates a stair. Their guarded rewards are
ordinary equipment or jewellery randarts. No special drop, phase, status,
resistance requirement or equipment gate is added. Insects retain native poison
vulnerability. Caustic worms resist corrosion; the other new worms do not gain
blanket elemental resistances.

The three regular creatures enter the branch population tables by replacing
some existing weight, rather than raising monster density. Existing native
spellbooks supply acid breath, poison spit and bee incitement. The latter now
recognizes bee-genus inciters, preserving the normal target restrictions for
both queen bees and Vespara. New tiles and automatically generated corpses use
the classic native atlases; generated originals and prompts are preserved in
[the art manifest](burrows-art/content/prompts.json).


## Fungal Wormlands expansion

Wandering mushrooms enter the ordinary Wormlands population on floors 1-4;
deathcaps enter on floors 3-4. Mushrooms replace some existing worm and troll
weight. Ordinary support band leaders and great orbs of eyes were removed in
the encounter revision; selected vaults retain explicit support pairings.
Worms remain the largest part of the base population weight.

Both mushrooms retain Crawl's existing restrictions on moving while watched,
and their native confusion-spore melee attacks. Deathcaps also cast magical
Drain Life. These encounters test range, target priority and escape planning:
a constrictor near a deathcap is more dangerous than either alone. Distance,
line of sight, control and prompt damage offer several answers. There is no
ambient spore meter or required resistance.

The nursery vault has a few ordinary fragile fungi for atmosphere. They do not
enter the random population or create an experience-farming loop. Existing
native monster art supplies every fungal tile; no new creature IDs, status
effects, spells, animations or assets are needed for this revision.

## Progression tuning

The later [native playtest pass](burrows-playtest/RESULTS.md) adjusts ordinary
population dice by floor and revises Hive selection weights. The initial pass left creature XP,
stats and spells unchanged. The earlier statements about unchanged quantity
rules describe the content-expansion stage; the current depth budgets and
measured XP are documented in that report. Combat balance remains provisional.

The [28 October encounter revision](burrows-playtest/tuning-20261028/README.md)
raises burrowing beast base XP from 600 to 700 and crag boar base XP from 550 to
700, with unchanged attacks, defences, health and speed. These durable enemies
now reward closer to their native threat peers, allowing lower population
counts while retaining the floor XP budget. Native HP-based XP variation still
applies. Boulder beetles enter ordinary Burrows populations from floor 2.

Hive's final adjustment reduces repeated bee and queen packs, meliai and spark
wasps in ordinary selection while increasing wax beetle and venom wasp weight.
Guarded ending insects remain. Both Hive and Wormlands endings reserve initial
arrival space using the shared chamber-graph helper and native placement masks.
