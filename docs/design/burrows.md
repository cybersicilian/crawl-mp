# The Burrows, Wormlands and Hive

The Burrows are a guaranteed, rune-free route below the Lair. The usual choice
of Snake or Spider and Swamp or Shoals remains intact. This revision is for new
games; existing generated floors are not rewritten.

```text
Lair:5
  Burrows:1–4
    Burrows:2 → Hive:1–2 (optional treasure branch)
    Burrows:4 → Wormlands:1–4 → Depths:1
Dungeon:15 ───────────────────→ Depths:1
```

Both Depths connections are reversible and coexist. The Wormlands connection
returns to Wormlands:4; the original Depths exit still returns to Dungeon:15.
All ordinary stairs and branch entrances remain usable without digging,
flight, a particular resistance or a character ability. These branches contain
no runes; normal rune requirements elsewhere remain in force.

## Length and progression

Burrows has four floors, with its entrance fixed to the bottom of the five-floor
Lair. Hive opens from Burrows:2 and has two floors. Wormlands opens from Burrows:4.
Its length is derived from Crawl's effective depth scale: Burrows:4 has depth
18 and Depths:1 has depth 22, leaving four floors. Wormlands therefore spans
effective depths 19–22. These are generation depths, not character levels.

The route offers more experience and guarded treasure, at the cost of additional
fights and exploration. It provides access to Depths without traversing the lower
Dungeon, Vaults or a Lair rune branch. Hive is an optional detour rather than a
required step. Nothing prevents returning to other branches before proceeding.

## Terrain and character pressures

| Area | Generation constraints | Character pressures | Reward |
| --- | --- | --- | --- |
| Burrows | Rounded dens, mostly two- or three-cell winding passages, loops, diggable rock and occasional stone outcrops. | Heavy physical hits and digging enemies make relying on a single choke unreliable. Armour, retreat routes and handling a drake at range matter. | Ordinary finds, guarded caches, the existing timed ochre gem, and onward access. |
| Wormlands | Moss-carpeted caverns and mushroom groves joined by bent galleries, short loops and occasional stone outcrops. No room rows or columns. | Durable worms and regenerating trolls test sustained damage. Constrictors can hold the player near confusion spores or a deathcap's Drain Life. Breaking line of sight, controlling range and choosing targets matter. | Guarded side hoards and a three-item equipment/wand ending hoard, plus the Depths passage. |
| Hive | Dense irregular comb clusters, short links, merged flight chambers and small honey pools, with connected dry routes. | Fast flying packs punish exposed approaches and weak crowd control. Honey slows grounded movement; flyers cross freely. Poison resistance helps; meliai and deeper electrical stings ensure poison resistance alone does not solve the branch. | A three-item jewellery/book/wand inner-comb hoard, gold and smaller optional caches. |

These are pressures on equipment, spells, positioning and consumable use. They
are not entry checks or new branch-wide debuffs. The geometry must never require
a particular build to reach the stairs or loot. Existing material, attack,
resistance, noise and travel rules remain authoritative.

Shallow honey is a native terrain feature. A normal-speed walker takes 2.0 turns
per honey step, compared with 1.6 in shallow water and 1.0 on dry ground. Grounded
monsters also pay the additional movement cost; flight bypasses it. Attacks and
spells retain their normal costs. Honey has no drowning, edible resource or new
status effect. Both Hive floors receive small irregular pools; generation keeps
dry ground connected, including after vault placement. The amber liquid tiles
are produced by the existing native tile generator.

Spider retains its webs, disabling combinations and broad arthropod roster.
Burrows centres on normal-speed heavy animals and rock; Wormlands on large worms, mushroom groves
and exposed deep-rock galleries; Hive on a short, dense flying-insect detour.

## Build checks

The encounters test capabilities with several native answers. They do not test
for a particular item, spell school or resistance flag at the entrance.

| Area | What exposes a weak build | Existing answers |
| --- | --- | --- |
| Wormlands: sustained damage | Armoured gallery worms and fast-regenerating iron trolls make repeated weak attacks expensive. Vault shamans can haste or might nearby allies. | Stronger melee, appropriate brands, poison against susceptible living targets, damaging spells or evocations; killing or separating support first. |
| Wormlands: escape and control | A coil worm holds the player while another worm, a mushroom or a ranged threat threatens through a gallery. | Kill the constrictor quickly, use translocations or suitable control, and preserve a retreat route before engaging. Armour helps survive the attempt. |
| Hive: pack handling and accuracy | Fast, evasive flyers close through several short approaches; queens can berserk bees. | Cleaving, area damage, reliable attacks, summons, control, or fighting a separated group at a narrow connection. Walking away in open ground is unreliable. |
| Hive: layered damage | Poisonous stings consume healing resources, spark wasps add electrical damage, and meliai smite. | Poison resistance or curing, electrical protection where available, rapid priority kills, and breaking line of sight. Poison resistance alone is incomplete preparation. |

The double-mouth worm vault pairs a heavy burrower with a constrictor. The troll
cut pairs an iron troll with a shaman. Hive has separate queen-and-bee,
wasp-and-bee, and meliai-and-bee vaults. Tests check that these authored pairings
actually place. Their frequency, resource cost and full-run balance still need
player-run assessment.

## Monsters and vaults

Burrows retains burrowing beasts, crag boars, shale drakes, deep troll delvers,
and its familiar supporting fauna. The Worldworm remains an optional Burrows
ending guardian. Its former rune chamber now contains the Wormlands entrance.
All three existing endings have been converted this way; the clay rune no longer
generates. Its saved item ID and art remain available for old items.

Wormlands adds three regular, normal-speed worms using existing attacks:

- Gallery worm: a durable heavy biter with native physical burrowing.
- Coil worm: constriction and a bite; it cannot burrow.
- Caustic worm: acid spit with ordinary breath recovery, plus a bite.

Wandering mushrooms are regular inhabitants from the first floor; deathcaps
join from Wormlands:3. They use native movement restrictions, confusion spores
and Drain Life. Seven new grove vaults, the Fungal Heart ending and a moss floor
palette make fungi a major part of the branch alongside its crawling fauna.

Deep trolls, delvers, earth elementals and lindwurms support the early floors.
Deeper floors add iron trolls, stone giants and occasional iron dragons.
Shamans and earth mages remain authored vault threats; random band leaders and
great orbs of eyes are excluded to avoid repeated support packs and polymorph. No mandatory named boss or scripted encounter sequence
is added. Old Coil is an optional vampiric constrictor. Hive uses killer bees,
queen bees, hornets, meliai and spark wasps, plus armoured wax beetles and
poison-spitting venom wasps. Its optional unique queen, Vespara, incites bees
using the existing queen-bee ability.

The [vault catalogue](burrows-vaults.md) includes **twenty ordinary vaults for
each of Burrows, Wormlands and Hive**, excluding entrances, endings and uniques.
There are four Burrows endings, four Wormlands endings and three Hive endings,
plus the two optional unique vaults. Wormlands treasure favors equipment and wands; Hive favors
jewellery, books and consumables. Endings retain three ordinary item slots and
three gold stacks. Optional unique vaults guard ordinary randarts. All rewards
use native item generation, without a new currency or bespoke reward system.

## Implementation boundaries

The normal branch tree remains the canonical parent hierarchy. A small typed
`branch_connection` table represents additional reversible links between fixed
levels. Generation, destination lookup, return-stair selection and interlevel
travel consume those same endpoints. This can support other fixed branch links
without embedding their names in the travel engine.

Branch and terrain IDs are appended to preserve existing IDs. The clay rune is
legacy-only. A small shared chamber-graph helper scatters rooms, connects a spanning tree,
and adds short local loops with existing native drawing primitives. Branch
profiles supply room sizes, density and passage shapes. Protected ending maps
reuse their branch geometry and place stairs and hoards at connected landmarks.
Monsters use native YAML, attacks and spellbooks. Gallery and coil worms reuse
unused native worm art; the other new creatures have dedicated tiles. Hive
restores native doorway art and uses the existing wax wall tiles.

The expanded revision passed native build/database loading, 11 C++ cases with
994 assertions, 231 authored vault placements, 88 floor checks and 93 native
exports. See [the expanded vault revision](burrows-generation/v6/README.md).
Full-run balance, production deployment and live graphical gameplay remain
separate checks.

## First native balance pass

The [playtest report](burrows-playtest/RESULTS.md) records progression-based XP
profiles, restored ordinary ending loot, honey terrain, native combat deaths and
remaining limitations. All ten per-floor XP means fall within 25% of their
declared progression peers across twelve seeds. Fifteen focused native cases
passed with 1,208 assertions. No fixed test build completed the full route, so
combat balance remains provisional. Normal travel uses `&` for Burrows, `(` for
Wormlands and `)` for Hive, avoiding existing branch-letter collisions.

## Encounter revision, 28 October

The [encounter report](burrows-playtest/tuning-20261028/README.md) follows the
first pass with ordinary-population separation, later deathcaps, less armoured
crowding and clear initial rooms around all three upstairs in Hive and Wormlands endings.
Burrowing beasts and crag boars now award base XP 700 each; their combat stats
are unchanged. The same twelve-seed progression comparison retains rough XP
parity on all ten floors. Combat outcomes and test-policy limits are recorded
in that report.
