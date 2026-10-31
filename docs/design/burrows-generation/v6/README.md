# Expanded vaults and fungal Wormlands

Each branch now has **20 ordinary vaults**, excluding entrances, endings and
optional unique vaults. Eighteen new ordinary vaults bring the total to sixty.
Three new endings bring the complete authored catalogue to 77 maps.
The Worldworm remains in one Burrows ending and is counted as an ending map.

| Branch | Ordinary vaults | Endings | Optional unique vaults |
| --- | --- | --- | --- |
| Burrows | 20 | 4 | 0 |
| Wormlands | 20 | 4 | 1 |
| Hive | 20 | 3 | 1 |

Burrows retains heavy fauna, digging shortcuts, stone cover and winding dens.
Hive retains short flight lanes, armoured ground blockers, queens and workers,
with electrical and smiting threats deeper down. Quiet passages and empty combs
remain in the pools. These are options for normal placement, not per-floor quotas.

## Mushroom groves and crawling fauna

Wormlands has a moss floor palette, seven new grove vaults and a Fungal Heart
ending. Wandering mushrooms and deathcaps are part of its ordinary population,
alongside gallery, coil and caustic worms. Fungi replace existing population
weight; the total base weight and native quantity rules remain unchanged.

Native mushroom movement restrictions, confusion spores and deathcap Drain
Life create range and escape decisions around constrictors and burrowers.
There is no branch-wide spore effect or required resistance. The nursery has
only a few native fragile fungi; ordinary random monsters all grant experience.
The existing Coiled Galleries ending also now has a deathcap near its hoard.

## Native previews

[Six encounter highlights](highlights.png) · [Eleven endings](endings.png) ·
[Generated branch comparison](branches.png) · [Three visual seeds](variants.png)

- [All twenty Burrows ordinary vaults](bur-vaults.png)
- [All twenty Wormlands ordinary vaults](worm-vaults.png)
- [All twenty Hive ordinary vaults](hive-vaults.png)

Every authored vault has an individual native tile preview below. Geometry,
monsters, items and stairs come from native exports and matching atlases.
The images are fully revealed offline compositions, with deterministic floor
variants and generic item-class icons. They do not show live combat, client fog
or lighting. Preview placements reset unique history; ordinary games keep the
native once-per-game rules. Isolated ending previews show authored guards;
generated ending floors also receive normal branch populations.

## Validation

The isolated native WebTiles build and description/map database loading passed.
Eleven C++ cases passed with 994 assertions, covering progression, native
creature rules and the fungal population. All 77 authored non-dummy vaults
passed three placements each: **231 placements**. Tests check full-grid
connectivity, authored guards, cache classes, ordinary randarts, ending reward
budgets, stairs and normal unique history.

Eighty branch-floor generations and eight Lair/Depths connection floors passed:
**88 floor checks**. The Wormlands samples contained 87 wandering mushrooms
and 60 deathcaps; these are observed totals across the batch, not quotas.
All **93 native exports** rendered with matching classic atlases, including
all sixty ordinary vaults, eleven endings, four entrances, two optional unique
vaults, twelve complete floors and four extra visual seed samples.

[native-checks.json](native-checks.json), [generation.json](generation.json),
[validation-summary.json](validation-summary.json) and
[preview-manifest.json](preview-manifest.json) preserve counts and hashes.
Local receipts are `../validation/expansion-1/` for native build/database,
contracts and exports, `expansion-2/` for the final full-grid Lua checks, and
`expansion-3/` for the final gallery. Earlier test/preview failures remain
recorded.

Full-run balance, live graphical gameplay, deployment and a complete-suite
pass remain separate from this native content validation.

## Individual vaults

| Branch / role | Native vault |
| --- | --- |
| Lair:5 / entrance | [Entry Root Mouth](bur_entry_root_mouth.png) |
| Lair:5 / entrance | [Entry Cairn](bur_entry_cairn.png) |
| Bur:1 / ordinary | [Animal Den](bur_animal_den.png) |
| Bur:2 / ordinary | [Troll Shelter](bur_troll_shelter.png) |
| Bur:1 / ordinary | [Winding Tunnel](bur_winding_tunnel.png) |
| Bur:2 / ordinary | [Mineral Cavern](bur_mineral_cavern.png) |
| Bur:2 / ordinary | [Old Hoard](bur_old_hoard.png) |
| Bur:1 / ordinary | [Abandoned Tunnels](bur_abandoned_tunnels.png) |
| Bur:1 / ordinary | [Side Den](bur_side_den.png) |
| Bur:2 / ordinary | [Split Passage](bur_split_passage.png) |
| Bur:1 / ordinary | [Bent Gallery](bur_bent_gallery.png) |
| Bur:1 / ordinary | [Paired Dens](bur_paired_dens.png) |
| Bur:2 / ordinary | [Shale Cut](bur_shale_cut.png) |
| Bur:1 / ordinary | [Root Pocket](bur_root_pocket.png) |
| Bur:2 / ordinary | [Bone Cache](bur_bone_cache.png) |
| Bur:2 / ordinary | [Troll Store](bur_troll_store.png) |
| Bur:2 / ordinary | [Beetle Burrow](bur_beetle_burrow.png) |
| Bur:1 / ordinary | [Old Crossing](bur_old_crossing.png) |
| Bur:4 / ending | [Worldworm](bur_end_worldworm.png) |
| Bur:4 / ending | [Troll Cairn](bur_end_troll_cairn.png) |
| Bur:4 / ending | [Old Warren](bur_end_old_warren.png) |
| Bur:4 / entrance | [Entry Fault](worm_entry_fault.png) |
| Bur:2 / entrance | [Entry Comb](hive_entry_comb.png) |
| Worm:1 / ordinary | [Mineral Seam](worm_mineral_seam.png) |
| Worm:2 / ordinary | [Cross Gallery](worm_cross_gallery.png) |
| Worm:3 / ordinary | [Troll Cache](worm_troll_cache.png) |
| Worm:2 / ordinary | [Coiled Hoard](worm_coiled_hoard.png) |
| Worm:4 / ending | [Troll Mine](worm_end_troll_mine.png) |
| Worm:4 / ending | [Dragon Cavern](worm_end_dragon_cavern.png) |
| Hive:1 / ordinary | [Outer Cells](hive_outer_cells.png) |
| Hive:1 / ordinary | [Queen Cell](hive_queen_cell.png) |
| Hive:1 / ordinary | [Flight Lane](hive_flight_lane.png) |
| Hive:2 / ordinary | [Meliai Cache](hive_meliai_cache.png) |
| Hive:2 / ending | [Inner Combs](hive_end_inner_combs.png) |
| Worm:1 / ordinary | [Shed Coils](worm_shed_coils.png) |
| Worm:2 / ordinary | [Double Mouth](worm_double_mouth.png) |
| Worm:3 / ordinary | [Shale Shelf](worm_shale_shelf.png) |
| Worm:1 / ordinary | [Blind Bend](worm_blind_bend.png) |
| Worm:3 / ordinary | [Troll Cut](worm_troll_cut.png) |
| Worm:2 / ordinary | [Seeping Vein](worm_seeping_vein.png) |
| Worm:4 / ending | [Coiled Galleries](worm_end_coiled_galleries.png) |
| Hive:1 / ordinary | [Torn Comb](hive_torn_comb.png) |
| Hive:1 / ordinary | [Wax Island](hive_wax_island.png) |
| Hive:1 / ordinary | [Split Brood](hive_split_brood.png) |
| Hive:2 / ordinary | [Wasp Roost](hive_wasp_roost.png) |
| Hive:1 / ordinary | [Abandoned Cells](hive_abandoned_cells.png) |
| Hive:2 / ordinary | [Meliai Shelter](hive_meliai_shelter.png) |
| Hive:2 / ending | [Hollow Heart](hive_end_hollow_heart.png) |
| Worm:2 / ordinary | [Delvers Cache](worm_delvers_cache.png) |
| Worm:3 / ordinary | [Buried Armoury](worm_buried_armoury.png) |
| Worm:2 / ordinary | [Corroded Gallery](worm_corroded_gallery.png) |
| Worm:2 / unique | [Old Coil](uniq_old_coil.png) |
| Hive:1 / ordinary | [Amber Store](hive_amber_store.png) |
| Hive:2 / ordinary | [Raided Satchel](hive_raided_satchel.png) |
| Hive:1 / ordinary | [Guard Line](hive_guard_line.png) |
| Hive:1 / unique | [Vespara](uniq_vespara.png) |
| Bur:1 / ordinary | [Claw Through](bur_claw_through.png) |
| Bur:2 / ordinary | [Drake Overlook](bur_drake_overlook.png) |
| Bur:3 / ordinary | [Delver Workshop](bur_delver_workshop.png) |
| Bur:1 / ordinary | [Flooded Roots](bur_flooded_roots.png) |
| Bur:4 / ending | [Split Delve](bur_end_split_delve.png) |
| Worm:1 / ordinary | [Mushroom Grove](worm_mushroom_grove.png) |
| Worm:2 / ordinary | [Deathcap Hollow](worm_deathcap_hollow.png) |
| Worm:1 / ordinary | [Fungal Nursery](worm_fungal_nursery.png) |
| Worm:2 / ordinary | [Spore Gallery](worm_spore_gallery.png) |
| Worm:2 / ordinary | [Rotten Pack](worm_rotten_pack.png) |
| Worm:3 / ordinary | [Capstone Ring](worm_capstone_ring.png) |
| Worm:1 / ordinary | [Rootbound Pool](worm_rootbound_pool.png) |
| Worm:4 / ending | [Fungal Heart](worm_end_fungal_heart.png) |
| Hive:1 / ordinary | [Beetle Gate](hive_beetle_gate.png) |
| Hive:1 / ordinary | [Queen Gallery](hive_queen_gallery.png) |
| Hive:2 / ordinary | [Spark Crossing](hive_spark_crossing.png) |
| Hive:1 / ordinary | [Pollen Pockets](hive_pollen_pockets.png) |
| Hive:1 / ordinary | [Lost Apothecary](hive_lost_apothecary.png) |
| Hive:2 / ordinary | [Winged Hunt](hive_winged_hunt.png) |
| Hive:2 / ordinary | [Amber Jewels](hive_amber_jewels.png) |
| Hive:2 / ending | [Amber Brood](hive_end_amber_brood.png) |

[Previous regional content revision](../v5/README.md) is preserved.
