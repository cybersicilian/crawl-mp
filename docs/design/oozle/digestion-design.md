# Oozle digestion and corrosive contact

Historical design, superseded by [manual assimilation](assimilation-design.md).
Passive assimilation and weapon wear have been removed.

Status: the user selected gradual corrosion of the Oozle's own equipped gear.
Later refinements selected automatic rolling properties on future matching
equipment and active multi-turn Assimilation with level-based slots. The
authoritative current rules and source status are in
[Assimilation](assimilation-design.md). The proposals below are the earlier
mechanism survey; they do not supersede that newer design.

## What this DCSS fork already supplies

| Capability | Source | Actual behavior and limit |
| --- | --- | --- |
| Item eligibility | `item-prop.cc:item_is_jelly_edible` | Accepts ordinary items; excludes artefacts, the horn of Geryon, miscellaneous evokers, most books, mimics and collectible game items |
| Jelly feeding | `mon-act.cc:_monster_eat_item`, `mon-util.cc:mons_eats_items` | Jiyva-enabled slime monsters consume floor stacks, gain HP and may grow/split; access is currently tied to a god passive |
| Item consumption bookkeeping | `items.cc:item_was_destroyed`, quantity/deletion operations | Handles the disappearance of real items; inventory and floor stacks require their own existing cleanup paths |
| Acidic melee | `dat/forms/jelly.yaml`, `attack.cc:SPWPN_ACID` | Jelly form's unarmed attacks splash acid; this is an existing form, with its own equipment and spell-power tradeoffs |
| Acidic auxiliary attack | `mutation-data.h:MUT_ACIDIC_BITE`, `melee-attack.cc:AuxBite` | A chance-based extra bite with acid effects; it is not guaranteed corrosion on every player attack |
| Corrosion | `player.cc:player::corrode`, `monster.cc:monster::corrode` | Temporary creature-level combat penalties, with resistance and stacking rules; no permanent alteration of the target's individual item enchantments |
| Acidic retaliation | `melee-attack.cc:attacker_sustain_passive_damage` | Acid-splash monsters burn adjacent melee attackers and sometimes corrode them; the current path is monster-specific |
| Projectile absorption | `ranged-attack.cc:_jelly_eat_missile`, `MUT_JELLY_MISSILE` | A native mutation can turn a projectile hit into healing while injured; this is a separate, stronger combat-defense direction |

These are source findings, not demonstrations on a playable Oozle. Slime
creatures, acid blobs and jelly form do not share every trait. Being mapped to
`MONS_JELLY` for species display does not grant those monster behaviors.

## Recommended core loop

Loot is both equipment and food. A useful weapon is worth retaining and
exposing to the Oozle's body; an obsolete weapon can instead be digested for
recovery. An unarmed Oozle spends less equipment but forgoes weapon brands,
reach and other weapon advantages. A shield remains a meaningful commitment.

The smallest useful absorption action is **Digest**: select an eligible item
from personal inventory or the current square, preview its recovery value,
confirm its destruction and spend one ordinary action. Reuse native jelly
eligibility and native item consumption. Introduce player-specific healing
limits rather than copying monster maximum-HP growth or splitting. Prototype
the recovery numbers against a normal healing consumable before selecting
them; neither raw stack size nor shop value should become an unbounded payout.

Digesting should have a useful outcome only when recovery is possible. Books,
scrolls, potions and charged items must not both execute their ordinary effect
and pay out digestion recovery. Consuming one unit must not consume or reward
the entire stack. A floor item used by a companion must be rechecked at commit.

The native Jiyva gate belongs to god-controlled monsters. An Oozle's digestion
needs its own reusable capability; granting that capability must not enable
Jiyva's autonomous item-eating behavior throughout the dungeon.

## Selected direction: corrosion of the Oozle's own gear

This is the more distinctive equipment-economy direction. Call the mechanic
**Digestion** in the UI so it is distinguishable from the existing temporary
`Corr` status. Wielding ordinary gear exposes it to the same digestive body
that deliberately consumes junk.

Proposed rules, with lifetime and magnitude still subject to balance work:

- Progress is deterministic and visible on the actual item. One elapsed native
  time budget drives it; no random per-turn corrosion rolls.
- Only equipped, active items accumulate exposure. Packed and melded items
  pause. Resting, waiting, quick attacks and slow actions follow the same native
  elapsed-time clock. The desired lifetime must be evaluated before choosing a
  rate, because a short lifetime would turn exploration into constant swapping.
- Progress persists with the item when unequipped, dropped, traded, saved or
  reloaded. Two slots consumed by one item do not double-charge it. Co-op hero
  switching must not reset progress or apply another hero's elapsed time.
- The first prototype should focus on weapon and shield behavior. Whether
  ordinary jewellery also dissolves is a separate equipment-design decision.
  Native jelly eligibility supplies artefact protection, rather than inventing
  a special exception for each named item.
- The last stage can destroy the item and produce the same bounded recovery
  as Digest. Whether earlier stages reduce effective enchantment, consume real
  enchantment, or merely forecast the eventual loss remains a deliberate
  balance choice, not an assumed implementation detail.
- Show remaining life directly in the equipment entry and during equip. Warn
  at meaningful thresholds. The initial consequential equip choice should make
  eventual loss clear; the ongoing clock should require no upkeep clicks.

The Oozle's rCorr protects the creature from external acid/corrosion. It should
not randomly switch its digestive chemistry off or make the item clock
unpredictable. That separation requires an item-level exposure mechanism;
calling `you.corrode()` cannot implement it.

There is a real tradeoff between a predictable supply of replacement equipment
and preservation of a good enchantment investment. Test both a weapon user and
an unarmed Oozle over an early dungeon route before making permanent equipment
loss the default. Artefact protection can eventually remove much of this cost,
which should be treated as an explicit progression outcome.

## Separate researched option: corrosion of enemies' gear

Use an **Acidic Touch** mutation and the native actor corrosion operation.
Choose the trigger explicitly: for example, every landed unarmed primary
attack attempts corrosion. A miss should not trigger it, and auxiliary attacks
must not multiply the trigger. Existing resistance/immunity can still defeat
the attempt; a reliable trigger and guaranteed penetration are different rules.

This affects the enemy's temporary combat state, not the enchantment of the
loot it eventually drops. It also works on creatures without worn equipment.
If the aim is permanent destruction of opponents' actual items, that requires
the item-level mechanism above plus separate loot and ownership decisions.

Applying acidic touch to every weapon attack would make the mutation a free
additional weapon brand. Restricting it to unarmed attacks creates a clear
choice between native weapon benefits and the Oozle's corrosive body.

## Implementation boundary and decisive probes

The reusable core should express item eligibility, quantity consumed, exposure
progress, threshold events and a computed outcome. Its species adapter supplies
the mutation, native elapsed time, healing, messages and inventory updates.
Enemy corrosion can remain a separate attack capability using the actor API.
Keep monster-specific growth, religion and global item consumption out of the
player digestion core.

Before native acceptance, prove cancellation consumes no item or turn; stacks
pay for the consumed quantity only; protected items remain intact; an actual
item cannot pay out twice; exposure survives trade/save/reload; and co-op time
is attributed once to the correct owner. Contrast active, packed and melded
equipment, and weapon-plus-shield with unarmed starts. These are pending tests,
not claimed results. No build or runtime work is needed to settle the current
mechanical direction.
