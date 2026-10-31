# Auramancy and the Paladin

## System map and invariants

The reusable mechanism is a sustained spell projected by a living caster to
living heroes on the same floor, through clear line of sight. One caster has
one stance. Different stances combine; copies of one stance use the strongest
eligible source. Switching costs a cast, MP and a turn, and replaces the old
stance. Auras grant neither permanent effects nor effects across floors.

Auramancy is a real trainable magic skill and spell school. Append its skill
and school IDs to preserve existing save identities. Include it in training,
aptitudes, school conversion, menus, spell generation, Djinni shared training,
Wanderer spells and descriptions. All seven aura spells use this school;
secondary schools provide additional routes into specialised stances.

Auramancy increases spell power through the normal school calculation and
extends radius from 2 tiles to 3/4/5/6 at base skill 6/12/18/24. Effects scale with
power, capped at 100. Duration scales from 12 to 32 turns. Clear walls still
block projection at every skill level. Recasting does not heal or cleanse.
Species inherit their Spellcasting aptitude for Auramancy unless their YAML
explicitly overrides it. Existing saves retain skill IDs; older Djinni saves
redistribute their existing magic XP across the expanded set of schools. A new
minor save version prevents an older binary from reading the expanded format.

## Decisions and interactions

| Aura | Level / schools | Party decision | Effect and progression |
| --- | --- | --- | --- |
| Protection | 1 / Auramancy, Earth | Hold a compact front around exposed allies. | +1 to +3 AC; adjacent living companions also grant +1 to +3 SH. |
| Zeal | 3 / Auramancy, Fire | Commit two heroes to the same foe. | +1 to +3 slaying, fear immunity; additional holy damage against undead/demons or enemies adjacent to another hero. |
| Rime | 3 / Auramancy, Ice | Let the front line absorb contact to slow pursuit. | rC+; melee attackers can be chilled and slowed, with chance and duration improving with power. |
| Vitality | 3 / Auramancy, Alchemy | Bring a badly wounded hero back inside the formation. | +0.50 to +1.00 HP/turn, doubled below half HP; no instant heal, poison resistance or cleansing. |
| Passage | 3 / Auramancy, Translocations | Put the bearer ahead of a separated hero to guide their return. | Allies moving closer to the bearer spend 10 to 20% less movement time; no attack/casting speed, self boost or Cheibriados violation. |
| Resonance | 4 / Auramancy, Air | Dedicate one bearer to supporting the party's spellcasters. | +10 to +25% power for non-Auramancy spells; no aura amplification feedback. |
| Sanctuary | 5 / Auramancy | Deliberately accept risk for a wounded companion. | Redirect 15 to 30% of an ally's incoming damage to a healthier bearer; never lower the bearer below one-third HP. No mitigation loop or self protection. |

The opportunity cost is the occupied stance, training, spell slots, MP and
casting time. The Paladin starts with Protection learned, a five-aura library,
plain weapon choices, ring mail and a buckler. Passage and Resonance are
available through other spell libraries/books, so Auramancy is reusable outside
the Paladin. Demigods may learn Auramancy but cannot start as Paladins.

## Evidence and validation boundaries

The existing school/training system, strongest-source party selection, Aegis
damage redirection, spell-power calculation and movement-cost calculation are
source-backed capabilities. Directional movement support and aura-specific
redirection are new compositions, requiring native tests for their boundaries.
This document records the implementation contract, not a gameplay balance proof.

Discriminating checks: skill 0/6/12/18/24 range; opaque and transparent walls;
same floor versus another floor; dead/downed source; duplicate versus different
stances; successful versus failed replacement; Passage toward/away/self/Chei;
Sanctuary healthier/wounded/one-third HP; Resonance with and without Auramancy;
old save skill counts and stable enum IDs; matching spell descriptions and lore.
Native compilation and gameplay checks require the shared host gate.

## Validation on 19 October 2026

The local WebTiles game and focused test executable built successfully. Eleven
Paladin/Auramancy native cases passed 251 assertions; native spell metadata
passed another 538 assertions. A real starting-character preview confirmed the
Paladin's equipment, Auramancy training and learned Protection spell, and
rejected Demigod/Paladin creation without writing a save. Four source/catalogue
contracts and eighteen web selection/preview tests also passed.

The shared native5 producer subsequently linked the combined game, Catch2
executable and WebTiles assets. All 74 inspected feature source/data files,
three relevant object files and 1,639 product assets matched its frozen inputs.
A separate zero-compile acceptance phase ran the same 11 feature cases / 251
assertions, 538 spell metadata assertions, 4 source contracts and 18 web tests
against those exact outputs. Native starting previews and catalogue agreement
also passed. Its reservation was fully closed and explicitly released.

These results cover linked native/metadata acceptance and the focused feature
suite. Real two-owner co-op tactical effects, faith/cooldown boundaries,
save/resume and authentic pre-Auramancy Djinni save migration still need their
own bounded acceptance phase. No deployment or fresh multiplayer gameplay
balance claim is made.
