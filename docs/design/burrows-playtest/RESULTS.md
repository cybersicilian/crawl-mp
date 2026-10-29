# Burrows route tuning and honey terrain — 27 October 2026

The native source now gives the three branches progression-based population
budgets, restores ordinary ending-floor loot, and adds small honey pools to Hive.
Individual monster XP, attack values and existing spell rules are unchanged.
The 63 content files in [the source manifest](results/final/content-files.json) match
the isolated native build exactly.

## Experience per floor

The comparison uses twelve fixed seeds, 2026102701–2026102712, with 300 native
floors before tuning and another 300 after the final tuning. All 180 comparison
floors retain exactly the same XP, population, ground loot and vault names.
The other 120 floors cover the complete ten-floor Burrows–Hive–Wormlands route.
These are generated available monster XP totals, including native bands and
vault guards; they are not XP earned by a surviving character.

Burrows floors match the mean of Snake and Spider at the corresponding floor.
Hive:1 matches their third floors, and Hive:2 their endings, reflecting its
placement from Burrows:2. Wormlands rises from the mean of Dungeon:14–15 to
Depths:1; its middle targets interpolate evenly between those endpoints.
A mean within 25% is the declared rough-parity band. **All ten floors meet it.**
Individual floors retain Crawl's normal variation; medians and quartiles are
preserved in [the comparison data](results/final/economy-comparison.json).

| Floor | Before XP | Tuned XP | Peer target | Difference | Items |
|---|---:|---:|---:|---:|---:|
| Bur:1 | 11,457 | 19,972 | 19,259 | +4% | 19.3 |
| Bur:2 | 11,911 | 19,648 | 22,590 | -13% | 17.8 |
| Bur:3 | 12,566 | 23,045 | 20,394 | +13% | 19.4 |
| Bur:4 | 15,237 | 33,246 | 43,703 | -24% | 25.2 |
| Hive:1 | 8,440 | 18,505 | 20,394 | -9% | 23.7 |
| Hive:2 | 11,634 | 37,757 | 43,703 | -14% | 23.8 |
| Worm:1 | 14,773 | 16,971 | 16,202 | +5% | 17.3 |
| Worm:2 | 18,672 | 26,698 | 25,819 | +3% | 18.3 |
| Worm:3 | 18,215 | 42,744 | 35,437 | +21% | 21.7 |
| Worm:4 | 20,579 | 43,323 | 45,054 | -4% | 24.7 |

Native population dice select quantity, with the existing population cap and
party scaling retained. The depth profiles are Burrows 22/22/22/44, Wormlands
14/18/24/26 and Hive 26/38. Hive's ordinary pool puts less weight on cheap bee
packs, increases its regional beetle/wasp presence, and halves meliai weight
from the first tuning candidate. Deeper electrical threats remain. There is no
branch XP multiplier or reward for repeatedly spawning creatures.

## Loot

Hive and Wormlands ending maps formerly suppressed random items for their
entire floor. Removing that tag restores normal native floor finds alongside
the existing authored three-item hoard and three gold stacks. The final survey
averages 23.8 ground stacks on Hive:2 and 24.7 on Wormlands:4, versus six before.
Ground-stack counts include gold; they do not include monster inventories or
shop stock. Hoards still use normal good-item specifications and native item
quality rolls, without guaranteed resistances or special drops.

| Branch | Ground stacks per floor, before → after | Gold per floor, before → after | Artefacts per floor, before → after |
|---|---:|---:|---:|
| Burrows | 20.6 → 20.4 | 95 → 103 | 0.35 → 0.33 |
| Hive | 12.0 → 23.8 | 62 → 119 | 0.38 → 0.67 |
| Wormlands | 14.6 → 20.5 | 90 → 122 | 0.38 → 0.46 |

These are observations across the fixed seeds, not guaranteed reward quotas.
Hive's book/jewellery/wand hoard and Wormlands' equipment/wand hoard remain.

## Honey

Shallow honey has its own appended terrain ID, yellow map glyph, amber liquid
tile variants, description and entry message. Normal grounded player movement
costs 20 aut, compared with 16 in shallow water and 10 on dry ground. Grounded
monsters pay ten extra movement energy; flyers bypass it. Attack and spell
costs remain unchanged. Native haste, speed and anatomy modifiers still apply.
Native automatic travel accounts for the extra movement cost.
Honey cannot drown a character and supplies no food, currency or new status.

Hive's shared organic layout places irregular pools away from stair landmarks.
It rejects pools that split dry ground, and the native builder checks dry
connectivity again after vault placement. All 24 surveyed Hive floors had
connected dry ground: Hive:1 had 30 honey cells and Hive:2 had 28–29. The survey
covered all three Hive endings, all four Wormlands endings and all four Burrows
endings. Flight helps with honey; it is never required to reach the stairs.

## Evidence

- [Final native economy survey](validation/economy-after-3/games/melee-2026102701/economy.json).
- [Before-tuning native economy survey](validation/economy-before-final/games/melee-2026102701/economy.json).
- [First calibration retained](validation/economy-after-1/games/melee-2026102701/economy.json): seven of ten floors met the band before the final adjustments.
- [Honey build and tile generation](validation/build-honey-1/build.log).
- [Population calibration build](validation/build-tuned-2/build.log).
- [Focused native honey/branch contracts](validation/balance-final/contracts.log): 1,208 assertions in fifteen cases passed.

## Native combat observations

**No tested fixture completed the whole route or reached Depths:1. Combat balance
remains provisional.** These runs demonstrate pressure and actual failure modes;
they do not establish expert-player viability or a satisfactory completion rate.

Paired route fixtures start at XL16, with two extra levels in the baseline skills,
initial piety 100, Okawaru for the physical builds and Vehumet for the caster.
Their initial gear stays fixed: a +3 broad axe/plate/shield fighter, a +3 orcbow
hunter in ring mail, and a robe/buckler earth caster with Stone Arrow, Fireball,
Mystic Blast and Bombard. All have poison resistance and the recorded consumables.
They pick up ordinary resources but do not upgrade equipment, use every wand,
kite intelligently or consistently select support enemies first. Death remains
enabled. Initial wizard setup is followed by ordinary native gameplay.

| Build | Before tuning | Final route attempt | Floors explored in final attempt |
|---|---|---|---:|
| Minotaur fighter | Died on Wormlands:3, XL17 | Died on Wormlands:3, XL18 | 8 |
| Human hunter | Died on Hive:2, XL16 | Died on Burrows:1, XL16 | 0 |
| Deep Elf caster | Died on Hive:2, XL16 | Died on Burrows:1, XL16 | 0 |

The fighter explored all four Burrows floors, both Hive floors and the first two
Wormlands floors, with normal stairs and the return from Hive. It entered and
fought on Wormlands:3. Separate fresh XL20 fixtures, with four extra baseline
skill levels, tested Wormlands:4 directly: fighter, hunter and caster all died.
The caster's final focused replay ended in a normal death on turn 101; an earlier
self-targeted blink stall was discarded. Every counted final case verified its
actual starting branch, exited normally and retained its native death audit and
morgue. The raw [game summary](results/final/games.json) records actual consumable
and god-ability use from morgues, rather than counting attempted commands.

This covers combat on all ten floors across the route and targeted scenarios.
It does **not** constitute a single surviving end-to-end clear. The Depths
connection retains native contract and generation coverage; a surviving native
playthrough across it has not been demonstrated. The two lighter builds' early
Burrows deaths and the Wormlands deaths remain unresolved balance observations,
with the fixed gear and limited tactics above as material limitations.

Wormlands:2–4 population dice were reduced after the late runs, from 20/28/30 to
18/24/26, to ease crowding while retaining comparable XP. Mushroom and crawler
weights, native monster stats and spells remain intact. Hive's meliai weight
was reduced to limit repeated smiting bands. These are initial adjustments,
not a claim that the combat balance is finished.

## Supporting fixes found during playtesting

- A meliai firing a fustibalus crashed the native launcher-noise switch. The
  fustibalus now shares the sling case. The affected fighter replay passed the
  original Hive:2 crash point and continued to Wormlands:3.
- Wormlands and Hive used travel letters already accepted for Tomb and Hell.
  Their distinct native menu keys are now `(` and `)`. A case-folded uniqueness
  contract covers all three new branches, and targeted games verified the
  actual Wormlands start before counting any combat.
- The harness now leaves dangerous clouds, backtracks after shafts, handles
  post-death screens across split terminal output, and excludes the player's
  current square and non-improving destinations from blink choices. Failed
  pilots, the incorrect Tomb starts, stalled cases and the original crash stay
  in `validation/`; they are excluded from the final combat outcomes.

## Previews and validation boundary

[Honey close-up](previews-final/honey-close-up.png) ·
[All ten final native floors](previews-final/README.md) ·
[Native rendering manifest](previews-final/preview-manifest.json)

The final survey, contracts and gallery use native binary
`e373dc0e1068ba504c29766dba4477944670864d16617c33cb1459bc07083465`.
The preview manifest records identical generation and rendering-build hashes.
These are fully revealed offline compositions from native geometry and matching
classic atlases, with generic item-class icons. They are not live graphical
screenshots.

The contract, economy, comparison and preview substeps in
[balance-final](validation/balance-final/components.json) passed before a later
postmortem harness stall interrupted that combined phase. The subsequent
[gameplay phase](validation/gameplay-final/closure.json) and
[caster regression](validation/bottom-caster-regression/closure.json) closed
normally. Focused checks passed; a complete repository suite, live graphical
acceptance and production deployment are separate from this local source work.

