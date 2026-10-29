# Burrows vaults

Implemented in source, 23 October 2026. [Branch](burrows.md) · [Enemies](burrows-enemies.md)

Vaults are ordinary mapped pieces of the branch. Build variety through shape,
monster placement, and normal loot, using the existing vault system.

## Entrance

A broad earthen tunnel around the branch stair, with rock shoulders, scattered
bones, and exposed roots. A stone-cairn variant supplies a second appearance.
Use depth-appropriate Lair inhabitants around it, if any.

## Ordinary vaults

| Vault | Contents |
| --- | --- |
| Animal den | A rounded side chamber with one or two burrowing beasts or crag boars and occasional ordinary items. |
| Troll shelter | Rough connected chambers occupied by a small deep troll group, sometimes including a delver. Some gold or equipment among their belongings. |
| Winding burrow | Nearby stretches of passage separated by ordinary rock, with a burrowing beast. Its normal pursuit can open a shorter route. |
| Mineral cavern | Irregular stone outcrops, a shale drake, and occasionally an earth elemental. |
| Old hoard | A larger den with ordinary treasure and suitable branch inhabitants. Vary both the guards and the shape. |
| Abandoned tunnels | Empty or sparsely inhabited passages with roots and old bones, providing atmosphere between encounters. |
| Side den | A short side passage opening into a small animal den. |
| Split passage | Two routes around a rock partition, with an optional burrowing beast. |
| Bent gallery | An empty winding connecting tunnel. |
| Paired dens | Two offset chambers, boars and burrowing beasts. |
| Shale cut | A stone-ribbed chamber occupied by a drake or earth elemental. |
| Root pocket | A small empty chamber off a passage. |
| Bone cache | An old animal corpse and sometimes a burrowing beast. |
| Troll store | A delver's side chamber with a little gold. |
| Beetle burrow | A boulder beetle at the end of a bent tunnel. |
| Old crossing | Empty branching passages with a short alternate route. |

These names describe authoring themes, not bespoke encounter mechanics.
The ten small additions use ordinary `extra` and `CHANCE` placement, with no
required per-floor quota. Rotation, substitutions, and depth-appropriate
population variation supply multiple maps. No fixed combination must appear
every run. Unused cells outside the rock rims are blank so the maps fit the
surrounding passages without replacing large rectangles of the layout.

## Burrows endings

- **Worldworm's Den:** a central chamber, the Worldworm, winding connections to
  outer animal dens, and the Wormlands entrance among ordinary treasure.
- **Troll Cairn:** a rough troll settlement with delvers, connected chambers,
  and the Wormlands entrance in its central hoard.
- **Old Warren:** several animal dens around the Wormlands entrance, with heavier
  inhabitants and some ordinary rock partitions.

The three endings have separate layouts and populations. Rock partitions
separate their chambers; alternate passages keep them from being a single
arena. All participate in normal connectivity checks. None requires a
scripted fight or kill gate.

Use the existing [vault authoring format](../../crawl-ref/docs/develop/levels/syntax.txt)
and [branch vault examples](../../crawl-ref/source/dat/des/branches/spider.des).
The [native maps](../../crawl-ref/source/dat/des/branches/burrows.des) implement
this set. Native checks are tracked in [validation](burrows-validation/README.md);
gameplay balance remains to be assessed.


## Wormlands and Hive

The two new branches use native Lua layouts and ordinary vault features.
Their ending geometry shares the ordinary layout functions but is protected
from arbitrary secondary-vault overwrites.

| Vault | Role |
| --- | --- |
| `worm_entry_fault` | Small, connected Wormlands doorway used when an ending has not supplied it. |
| `hive_entry_comb` | Wax-lined doorway off Burrows:2. |
| `worm_mineral_seam` | Gallery worm and earth elemental around ordinary stone. |
| `worm_cross_gallery` | Short crossing with a worm and two approaches. |
| `worm_troll_cache` | Iron troll and delver guarding ordinary good-quality loot. |
| `worm_coiled_hoard` | Constriction threat near treasure behind a stone partition. |
| `worm_end_troll_mine` | Broad galleries; giant and troll near Depths, guarded side hoard. |
| `worm_end_dragon_cavern` | Broad galleries; iron dragon near Depths, separate worm-guarded hoard. |
| `hive_outer_cells` | Bees spread between connected combs. |
| `hive_queen_cell` | Queen and bees around a small cache. |
| `hive_flight_lane` | Short cross-connected flying approach. |
| `hive_meliai_cache` | Deeper meliai and bee cache. |
| `hive_end_inner_combs` | Full connected comb network with a guarded good-quality hoard. |

Neither new branch generates a rune. The Burrows ending maps are now named
`bur_end_worldworm`, `bur_end_troll_cairn`, and `bur_end_old_warren`.


## Organic generation revision

The organic revision introduced ten ordinary vaults and three endings for
Wormlands, and ten ordinary vaults and two endings for Hive. The new small maps have irregular outlines and use normal
rotation, depth limits, substitutions and optional extra placement. Empty pieces
remain in the pool so every room does not become a treasure fight.

| New vault | Role |
| --- | --- |
| `worm_shed_coils` | A bent side gallery, old debris and a possible constrictor. |
| `worm_double_mouth` | Linked chambers with a gallery worm and coil worm; damage plus escape pressure. |
| `worm_shale_shelf` | Lindwurm and optional earth elemental around a stone shelf. |
| `worm_blind_bend` | A quiet winding pocket and a little gold. |
| `worm_troll_cut` | Late iron troll and shaman; regeneration, armour and buff support. |
| `worm_seeping_vein` | Shallow seepage through a worm chamber, with walkable approaches. |
| `worm_end_coiled_galleries` | Worms guarding the exit; a deathcap near the separate hoard. |
| `hive_torn_comb` | Bees in offset, broken comb cells. |
| `hive_wax_island` | Several short flight approaches around a wax partition. |
| `hive_split_brood` | Queen and bees in adjoining combs. |
| `hive_wasp_roost` | Deeper spark wasp and bees; poison protection alone is insufficient. |
| `hive_abandoned_cells` | Quiet, irregular empty combs with occasional gold. |
| `hive_meliai_shelter` | Meliai and bees; priority targeting and line-of-sight control. |
| `hive_end_hollow_heart` | An enlarged flight chamber within irregular combs, with meliai and spark-wasp hoard guards. |

Shared layout landmarks keep the ending upstairs and hoards connected. New
endings retain the same three-item and three-gold-stack reward budget.


## Regional enemies and treasure

The regional-enemy revision introduced thirteen ordinary vaults per branch,
with one additional optional unique vault apiece. The eight new maps keep irregular outlines and native
rotation/placement. Existing empty vaults remain in the selection pool.

| Vault | Guards and ordinary reward |
| --- | --- |
| `worm_delvers_cache` | Caustic and coil worms; one good weapon/armour, a wand, a healing potion and gold. |
| `worm_buried_armoury` | Iron troll and caustic worm on Wormlands:3-4; good armour and weapon, an enchantment scroll with a small acquirement chance, and gold. |
| `worm_corroded_gallery` | Constrictor in front of an acid spitter, with two approaches. No authored loot. |
| `uniq_old_coil` | Old Coil's optional side den; an ordinary weapon/armour randart and gold. |
| `hive_amber_store` | Wax beetle and venom wasp; good jewellery, two curing potions and gold. |
| `hive_raided_satchel` | Meliai and wax beetle on Hive:2; book/wand, a strong potion, a blinking/fog scroll and gold. |
| `hive_guard_line` | Wax beetle, venom wasp and killer bee in connected cells. No authored loot. |
| `uniq_vespara` | Vespara, two killer bees and a wax beetle; jewellery randart and gold. |

Wormlands endings draw their three item slots from good weapons, armour,
magical staves and wands. Hive endings draw from good jewellery, books and
wands. Both retain three gold stacks. Optional unique vaults use weight 20 in
the existing unique-placement system, so these randart caches are not guaranteed
on the route. There are no runes, new currencies, bespoke items or kill gates.


## Twenty ordinary vaults per branch

The current catalogue has **20 Burrows, 20 Wormlands and 20 Hive ordinary
vaults**. These counts exclude four entrance maps, eleven endings and two
optional unique vaults. All 77 authored non-dummy maps share one catalogue in
`dat/dlua/burrows_catalogue.lua`, consumed by native placement tests and the
preview exporter. It does not impose a gameplay placement quota.

| Added ordinary vault | Encounter or reward |
| --- | --- |
| `bur_claw_through` | Burrowing beast can shorten a rock partition; a boar threatens the alternate passage. |
| `bur_drake_overlook` | Drake behind stone cover and a boar in the approach; two exits. |
| `bur_delver_workshop` | Delver and earth elemental guarding equipment, a wand and gold. |
| `bur_flooded_roots` | Quiet shallow-water side passage with an optional burrower and occasional gold. |
| `worm_mushroom_grove` | Two wandering mushrooms and a coil worm among stone roots. |
| `worm_deathcap_hollow` | Deathcap behind a gallery worm; several approaches around cover. |
| `worm_fungal_nursery` | A few fragile native fungi and an optional wandering mushroom in an irregular pocket. |
| `worm_spore_gallery` | Constrictor and deathcap guard a wand across a split gallery. |
| `worm_rotten_pack` | Caustic worm and mushroom around an abandoned equipment-and-potion cache. |
| `worm_capstone_ring` | Deathcap and constrictor with a full loop around a stone island. |
| `worm_rootbound_pool` | Mushroom and gallery worm beside shallow water and a little gold. |
| `hive_beetle_gate` | Wax beetle in front, venom wasp behind; a short bypass avoids the front attack. |
| `hive_queen_gallery` | Queen and workers in offset cells around a wax partition. |
| `hive_spark_crossing` | Spark wasp and wax beetle in an open crossing on Hive:2. |
| `hive_pollen_pockets` | Empty broken combs, sometimes containing gold. |
| `hive_lost_apothecary` | Venom wasp and beetle guard a potion and fog scroll. |
| `hive_winged_hunt` | Meliai and venom wasp in linked chambers with two entrances. |
| `hive_amber_jewels` | Queen and workers guarding good jewellery, a book and gold. |

Three additional endings preserve ordinary route and reward rules:

- **Split Delve (Burrows):** connected delver chambers, stone cover, drakes and
  heavy fauna; the ochre gem, equipment and Wormlands entrance share the hoard.
- **Fungal Heart (Wormlands):** gallery and coil worms near Depths, with a
  deathcap and wandering mushroom near the separate equipment hoard.
- **Amber Brood (Hive):** queen and worker, venom wasps and a wax beetle protect
  the inner comb's jewellery/book/wand hoard.

Wormlands and Hive endings retain their three item slots and three gold stacks.
No named unique is required for an ending or a stair. Wormlands' Coiled
Galleries also now uses a deathcap near the hoard. Ordinary layout variation,
rotation, depth limits and quiet pieces remain in use.

[Current native maps, all sixty ordinary vaults and validation](burrows-generation/v6/README.md).
