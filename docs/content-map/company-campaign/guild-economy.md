# Guild economy: yields, costs and worked choices

[Buildings](buildings.md) · [Recipes](equipment-recipes.md) · [Ownership](guild-resources.md) · [Numeric catalogue](guild-catalogue.json)

Authored numerical baseline, not a measured loot economy. Values below make the proposal concrete and checkable; they require native acquisition, return and player-economy assessment before acceptance. No procedural loot generation or automated balance simulation was implemented.

## Budget assumptions

**T timber; M metal; S stone; F hide/fibre; R reagents; C arcane crystal; IR infernal regulator; PC planar core; RS ritual seal.** Facilities are permanent, recipe outputs are finite, and material holdings have individual owners until voluntarily contributed. The reference budgets are total finite expedition finds, not rewards per player and not automatic guild income.

One to four human heroes share the same authored cache total for a given reference expedition. Four clients never receive four copies of that total. Dividing a cache changes personal allocations, not generation. A larger party can improve survival, carry complementary equipment or operate separate fronts; it also needs more physical supplies. Separate concurrent expeditions generate their own legitimate finds while competing for the guild's finite equipment. No member-count construction scaling applies.

The following rows are incremental segments. An illustrative normal-depth route uses the first four once, for **80T + 74M + 54S + 42F + 54R + 36C = 340 common units**. A listed route leg is a budget class: the rune/Vaults row does not require visiting Elf or award an additional full budget for every branch name. Short returns are legitimate; a later expedition can explore different routes.

| Reference segment, fully collected before loss | T | M | S | F | R | C | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D:1-7 short return | 10 | 8 | 6 | 4 | 2 | 0 | 30 |
| Lair / Orc segment | 18 | 18 | 12 | 12 | 12 | 4 | 76 |
| Rune approach / Vaults segment (Elf is an alternate) | 24 | 22 | 16 | 12 | 18 | 12 | 104 |
| Depths / Zot segment | 28 | 26 | 20 | 14 | 22 | 20 | 130 |
| One substantial extended-region segment | 30 | 30 | 22 | 16 | 28 | 28 | 154 |

These are starting content budgets. Author a handful of mixed caches, individual scattered bundles and attractive guarded stores; do not ask the player to harvest 340 separate objects. Material autopickup/filtering and the dedicated pouch keep interaction cost low. Reserve exact cache identity/quantity in native generation so revisiting, reloading, joining late or visiting another floor never refills it.

The amount actually secured depends on native return and recovery. Field cargo remains exposed. Banking does not automatically donate it, and the reference totals assume no potions/recipes were bought from that same material first. Found equipment and spell research are additional actual acquisitions, not automatically converted into material yield.

## Special components and late availability

Use three extra component identities, each tied to a physical apparatus:

| Component | Proposed acquisition sites | Competing uses |
| --- | --- | --- |
| Infernal regulator | Rare Depths foundry/Vestibule installation; explicit Hell machinery salvage | Infernal laboratory construction or a corrosion frame |
| Planar core | Authored Wizlab/Abyss anchored research site or Pan installation | Extended staging, Planar observatory or a physical return beacon |
| Ritual seal | Authored Necropolis/ritual research site or Tomb/Tartarus installation | Soul anchor infirmary, ritual ward, soul ambrosia, tether or Planar observatory |

These sites and extraction objects are proposed content. The reference extended segment carries at most one selected special-component acquisition, not one per floor, monster or player. A rare pre-extended alternative can support experimentation without requiring the tool's target realm to be cleared first. There is no global achievement/rune entitlement pretending to be material.

Native Hells have a no-items generation flag. A finite machinery/component cache there needs an explicitly authorized authored placement path, with its own budget, rather than assuming ordinary loot will appear. Infinite Abyss/Pan floor cycling must not regenerate the same cache identity or guarantee a new component each cycle. A fresh expedition can legitimately find new material under its declared budget; save/re-entry cannot mint it.

Late segments retain timber, metal and other common inputs. Mature guilds should collect them while pursuing valuable deep goals instead of being sent back to D:1 for a compulsory basic-material circuit. No passive offline production is needed. Once construction is mature, surplus stone is acceptable; do not create weapon durability taxes just to force every resource to have endless demand.

## First three short expeditions

One short reference return contains 10T + 8M + 6S + 4F + 2R. If owners pledge the Armory cost, ARM1 consumes 8T + 6M + 4S and leaves 2T + 2M + 2S + 4F + 2R in their existing titles. Every guild member can now inherit legitimate secured gear.

Three fully secured short returns total **30T + 24M + 18S + 12F + 6R**. ARM1 + FOR1 + APO1 together consume **20T + 18M + 12S + 4F + 6R**. The guild can then craft a spear, buckler and quarterstaff for **4T + 5M + 1F**, supporting a frontliner/caster pair. Remaining: **6T + 1M + 6S + 7F**, with no reagents. Constructing the Herbarium did not also produce healing stock. Another resource acquisition, or a different investment plan, is needed for potions.

An alternative is ARM1 + TRN1 and found equipment: improve competence now while delaying manufacturing. Shared contribution quantities need not be equal. One member may supply metal, another timber and a third stone; the constructed benefit is identical for all. These examples assume the listed owners voluntarily fund the chosen bill, not that officers can spend everybody's wallet.

## Full prerequisite costs

A tier's sticker price is not its full development path. These totals include each required predecessor exactly once, and exclude recipe consumables/outputs. They are alternative goals, not additive bills when prerequisites overlap.

| Goal | Included facility nodes | Total project investment |
| --- | --- | --- |
| Armory + Smithy + Herbarium | ARM1, FOR1, APO1 | 20T + 18M + 12S + 4F + 6R |
| Armory + Library II + Academy + Apothecary II | ARM1, LIB1, LIB2, TRN1, TRN2, APO1, APO2 | 72T + 14M + 42S + 28F + 42R + 16C |
| Supply network + Field recovery office | ARM1, ARM2, APO1, WAY1, WAY2, REC1, REC2 | 84T + 44M + 58S + 42F + 16C + 24R |
| Masterworks foundry | ARM1, FOR1, FOR2, FOR3, LIB1, LIB2 | 66T + 82M + 60S + 34R + 32C + 4F |
| Armory + War college | ARM1, TRN1, TRN2, TRN3 | 50T + 30M + 56S + 24F + 12R + 8C |
| Ward workshop | ARM1, FOR1, FOR2, LIB1, LIB2, RLM1 | 62T + 62M + 52S + 34R + 32C + 4F |
| Planar observatory + extended staging | ARM1, ARM2, FOR1, FOR2, LIB1, LIB2, WAY1, WAY2, WAY3, RLM1, RLM2, RLM3 | 180T + 178M + 162S + 34F + 128C + 90R + 2PC + 1IR + 1RS |

All 23 buildings together consume **336T + 260M + 306S + 118F + 220C + 222R + 2PC + 2RS + 1IR**: 1,462 common units plus five special components. This is an optional whole-guild development horizon over several expeditions, not preparation required for an ordinary three-rune run. A guild with a narrower interest can stop investing in an irrelevant branch and spend its resources on equipment and supplies.

## Two contrasting co-op investments

For the first two examples, the input is three short returns plus one normal-depth reference return: **110T + 98M + 72S + 54F + 60R + 36C = 430 common units**. Costs below include every facility prerequisite and the stated recipes, without assuming prior buildings are free. Neither example contains additional free equipment beyond specifically declared crafted outputs.

### Formation and support

Input: 110T + 98M + 72S + 54F + 60R + 36C. Facilities: ARM1, FOR1, FOR2, LIB1, LIB2, TRN1, TRN2, APO1, APO2. Purchases: CO01, SC02, SU04.

Total spent: **93T + 60M + 66S + 57R + 30C + 30F**. Remaining personal/guild holdings, according to actual title: **17T + 38M + 6S + 24F + 3R + 6C**.

Build the complete listed facilities and produce one aegis standard, one phase-swap scroll and one empathy potion. A frontliner can operate reusable formation support while a partner holds repositioning/healing capacity. This spends most available reagents, so immediate further healing production is constrained.

### Return and recovery

Input: 110T + 98M + 72S + 54F + 60R + 36C. Facilities: ARM1, ARM2, FOR1, LIB1, APO1, WAY1, WAY2, REC1, REC2. Purchases: LG01, RC01, SC03.

Total spent: **106T + 59M + 66S + 52F + 22C + 36R**. Remaining personal/guild holdings, according to actual title: **4T + 39M + 6S + 2F + 24R + 14C**.

Build the complete listed facilities and prepare one actual consignment's packaging, one 40-unit recovery casket and one soul-recall scroll. Cargo inside the consignment is additional existing stock; packaging does not create it. This route preserves substantial reagents/crystal but uses nearly all available fibre and much of the stone. It does not also purchase the support route.

### Prepare for a first Hell

Input: 80T + 74M + 54S + 42F + 54R + 36C. Facilities: ARM1, FOR1, FOR2, LIB1, LIB2, RLM1. Purchases: RM01.

Total spent: **62T + 66M + 52S + 38R + 36C + 4F**. Remaining personal/guild holdings, according to actual title: **18T + 8M + 2S + 38F + 16R**.

Build the Ward workshop and all its prerequisites, then protect one actual scroll with a heat seal. The scroll itself must already exist. No infernal regulator or prior Hell clear is needed. This consumes the reference return's entire crystal budget, so making a second module immediately needs another legitimate acquisition.

## Survival, personal retention and contribution sensitivity

A simple arithmetic sensitivity is useful before a real loot model. Let s be the fraction of field material actually secured and d the fraction owners choose to contribute. Approximate new shared construction input as gross finite yield × s × d, before per-owner/type rounding. This is not a measured survival probability or a predicted number of runs.

| Secured fraction | Voluntarily contributed fraction | Share reaching construction | Common units from a 340-unit reference |
| --- | --- | --- | --- |
| 100% | 100% | 100% | 340 |
| 70% | 100% | 70% | 238 |
| 70% | 50% | 35% | 119 |
| 50% | 50% | 25% | 85 |

Material composition matters: 100 spare fibre cannot automatically pay 10 missing crystal. Under the common-material reference alone, completing all buildings would require at least seven full-profile returns at full security/contribution because crystal is the bottleneck, before recipes and rare components. At 70% secured and 50% contributed, that lower bound rises to eighteen. Extended yields and shared project prioritization can improve the actual path; these figures flag potential grind rather than certify acceptable pacing.

Do not solve that grind by compulsory donation, officer access to private supplies or personal contribution ranks. Compare reducing specific construction costs, increasing legitimate deep-site yield or making a focused subset of buildings more useful. Members retaining materials for a private item is intended play.

## Loss baseline to compare

Built facilities/knowledge and secured property survive. Consumed supplies remain consumed. Remaining eligible equipment can enter one recovery escrow only after source closure. For a concrete initial material comparison, preserve 50% of unsealed loose material per owner/type, rounded down, after a final full wipe; sealed casket contents preserve 100% up to 40 actual units. Test alternatives of zero/full loose-material salvage using the same loadout. This severity is a new hypothesis, not a user-approved final rule.

During a continuing expedition, a fallen hero's actual remaining tagged cargo is still recoverable by survivors before this closure rule applies. If a survivor extracts it, return all actually carried units by original title. An earlier partial extraction remains safe regardless of later losses. No source may simultaneously supply field gear, insured return and a salvage copy.

## Co-op episodes these costs enable

**Early recruitment:** a returning member supplies found armour; the guild funds a Drill yard instead of a Smithy. A new recruit begins with relevant skills and the actual loan, while another member keeps materials for personal equipment.

**Rune-stage support:** a finite standard and a phase-swap scroll let a pair choose formation versus separation. The standard bearer can anchor a fight; the other player preserves the scroll for a rescue. The alternative logistics investment supports banking and eventual recovery rather than that same immediate combat package.

**Partial return:** a player carrying the missing Forge material extracts early; construction can now complete for future preparations. Peers continue with their own exposed bags. A later survivor returns a fallen owner's crystal, which remains that person's resource until they choose a contribution.

**Extended formation:** the guild can build a ward or reserve the component for a return route. A charged short aura makes staying near the bearer useful without protecting remote floors. A return beacon creates a protected setup and independent departure decisions. Losing it does not destroy the permanent observatory.

## Decisive assessment shortlist

1. **Cost visibility:** manually fund the same project from three personal balances, guild stock and a cancelled pledge; compare one-screen contribution/build flow against repeated deposit navigation. Accept clear title and no duplicate spend.
2. **First payoff:** compare found gear plus Drill yard against Smithy production for the same native two-hero opening. Measure changed builds/actions and secured haul; exclude adapter startup failures from balance conclusions.
3. **Contribution and scarcity:** run the same finite total with one, two and four accounts; compare collector-owned drops and equal-share caches. Accept no duplicated yield, useful individual retention and no pressure for every member to donate everything.
4. **Recipe substitution:** compare several soul-recall scrolls with one XP beacon, including off-floor/downed/visible cases. A universal dominant option calls for scope/price adjustment; a broken state adapter only narrows supported outputs.
5. **Durability of progress:** follow the same guild through separate return, final fall, survivor salvage and full wipe. Verify buildings remain useful, secured goods stay safe and recovery doesn't become a compulsory mundane chore.
6. **Extended reach:** compare a heat seal, charged group ward and portable return on the relevant native realm behavior. Check eligible and closest-ineligible cases, charge/identity persistence and separate departures. No silent global timing or false Orb outcomes.

These probes are specified, not executed. Current validation covers catalogue structure, prerequisites, material arithmetic and documentation links only.
