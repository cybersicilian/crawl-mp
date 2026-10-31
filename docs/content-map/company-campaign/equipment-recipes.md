# Equipment, supplies and service recipes

[Buildings and prerequisites](buildings.md) · [Economy and yields](guild-economy.md) · [Ownership and construction](guild-resources.md) · [Numeric catalogue](guild-catalogue.json)

Authored first-pass proposal. All 47 manufacturing/research/service recipes are new gameplay. Some outputs reuse source-backed native items/effects; newly invented caskets, tethers, realm modules and return apparatus require new native behavior. No recipe or price below is established by an existing item description.

**T timber; M metal; S stone; F hide/fibre; R reagents; C arcane crystal; IR infernal regulator; PC planar core; RS ritual seal.** Every listed facility must exist. Costs are per one output or stated operation. Research is paid once per guild pattern; a produced item always costs its own ingredients afterward. Facility construction prices are separate.

## Ownership and legal outputs

Personal inputs produce a personal item by default; guild inputs produce guild property. Mixed funding declares ownership before commitment. A guild loan cannot become an ingredient without its owner's authorization. Reserving a recipe input prevents simultaneous construction or crafting from spending it. Confirmation shows the exact consumed inputs, retained target, output and title.

Recipes only generate their named ordinary/native type and declared properties. They cannot roll arbitrary artifacts, stack brands/egos, exceed native enchantment caps or alter an unsupported unique. Returned artifacts and named cooperative relics remain inheritable through ARM1; manufacturing limits do not weaken their legitimate properties. Aegis of Fellowship, Conduit Staff, Twin-Soul Ring and Dawnforged/Duskweaver are inherited finds in this proposal, without mass-production recipes.

Crafted objects are marked as crafted and funded from real inputs. Background/start equipment and reissued goods are not fresh field research or saleable construction income. No material can be recovered by dismantling free starter gear. Unsupported anatomy, religion, native item compatibility or obsolete content yields a clear ineligible result before spending.

## Ordinary equipment

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| EQ01: Spear | FOR1 | 1T + 2M | Input: None. Output: One +0 ordinary spear. Native wield/anatomy rules; no random brand. |
| EQ02: Long sword | FOR1 | 4M + 1F | Input: None. Output: One +0 ordinary long sword. Native wield/anatomy rules. |
| EQ03: Quarterstaff | FOR1 | 2T + 1F | Input: None. Output: One +0 ordinary quarterstaff. Supports a caster/melee opening; normal hands and skill requirements. |
| EQ04: Buckler | FOR1 | 1T + 3M | Input: None. Output: One +0 ordinary buckler. A low-cost protective loan for a new member. |
| EQ05: Leather armour | FOR1 | 1M + 3F | Input: None. Output: One +0 ordinary leather armour. Native encumbrance and anatomy. |
| EQ06: Chain mail | FOR2 | 6M + 2F | Input: None. Output: One +0 ordinary chain mail. Useful with trained protection; does not remove encumbrance. |
| EQ07: Kite shield | FOR2 | 2T + 5M + 1F | Input: None. Output: One +0 ordinary kite shield. Ordinary base; cannot fabricate the Aegis of Fellowship. |

## Enchantment

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| EQ08: Weapon enchant I | FOR1 | 2M + 1R | Input: One eligible ordinary weapon; retained. Output: Same weapon, +1 enchantment. Result at most +2; do not lower an already stronger weapon. |
| EQ09: Weapon enchant II | FOR2 | 4M + 2R + 1C | Input: One eligible ordinary weapon; retained. Output: Same weapon, +1 enchantment. Use only for resulting +3 through +5. |
| EQ10: Weapon enchant III | FOR3 | 6M + 3R + 3C | Input: One eligible ordinary weapon; retained. Output: Same weapon, +1 enchantment. Use only for resulting +6 through native +9. |
| EQ11: Armour enchant I | FOR1 | 2M + 1F + 1R | Input: One eligible ordinary armour/shield; retained. Output: Same item, +1 enchantment. Result at most min(+2, armour_max_enchant). |
| EQ12: Armour enchant II | FOR2 | 4M + 1F + 2R + 1C | Input: One eligible ordinary armour/shield; retained. Output: Same item, +1 enchantment. Use for resulting +3/+4, within native maximum. |
| EQ13: Armour enchant III | FOR3 | 6M + 1F + 3R + 2C | Input: One eligible ordinary armour/shield; retained. Output: Same item, +1 enchantment. Use for resulting +5 or greater, within native maximum. |

## Brands and armour egos

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| BR01: Venom application | FOR1 | 3M + 2R | Input: Eligible unbranded ordinary weapon; venom pattern known. Output: Same weapon with venom. No artifact mutation; keep enchantment/identity. |
| BR02: Flaming application | FOR2 | 3M + 3R + 1C | Input: Eligible unbranded ordinary weapon; flaming pattern known. Output: Same weapon with flaming. No artifact mutation; preserve legal base/brand combinations. |
| BR03: Freezing application | FOR2 | 3M + 3R + 1C | Input: Eligible unbranded ordinary weapon; freezing pattern known. Output: Same weapon with freezing. Same legal-base rules as BR02. |
| BR04: Holy wrath application | FOR3 | 6M + 6R + 4C | Input: Eligible unbranded ordinary weapon; holy-wrath pattern known. Output: Same weapon with holy wrath. Native religion/species/use rules remain; no universal holy conversion. |
| EG01: Fire-resistance ego | FOR2 | 4M + 2F + 4R + 2C | Input: Eligible ordinary unegoed armour; pattern known. Output: Same item with native fire-resistance ego. Use native ego compatibility; cannot stack egos. |
| EG02: Cold-resistance ego | FOR2 | 4M + 2F + 4R + 2C | Input: Eligible ordinary unegoed armour; pattern known. Output: Same item with native cold-resistance ego. Use native ego compatibility; cannot stack egos. |
| EG03: Poison-resistance ego | FOR2 | 3M + 2F + 4R + 1C | Input: Eligible ordinary unegoed armour; pattern known. Output: Same item with native poison-resistance ego. Use native ego compatibility; cannot stack egos. |

## Jewellery

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| JW01: Fire-resistance ring | FOR3 | 5M + 4R + 6C | Input: Fire-resistance ring pattern known. Output: One ordinary ring of protection from fire. Native ring property; no random artifact extras. |
| JW02: Cold-resistance ring | FOR3 | 5M + 4R + 6C | Input: Cold-resistance ring pattern known. Output: One ordinary ring of protection from cold. Native ring property; no random artifact extras. |
| JW03: Poison-resistance ring | FOR3 | 4M + 4R + 5C | Input: Poison-resistance ring pattern known. Output: One ordinary ring of poison resistance. Native ring property; no random artifact extras. |

## Potions

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| SU01: Curing | APO1 | 1F + 2R | Input: None. Output: One potion of curing. Use native effect/eligibility; consumed once. |
| SU02: Heal wounds | APO1 | 1F + 4R | Input: None. Output: One potion of heal wounds. Use native effect/eligibility; consumed once. |
| SU03: Resistance | APO2 | 5R + 2C | Input: None. Output: One potion of resistance. Finite group preparation; one potion is not a per-member grant. |
| SU04: Empathy | APO2 | 5R + 2C | Input: None. Output: One potion of empathy. Use native party healing/damage bond, with its actual eligibility/scope. |
| SU05: Soul ambrosia | APO3 | 12R + 8C + 1RS | Input: None. Output: One potion of soul ambrosia. Strong native party regeneration/revival; requires exact scope/lifecycle audit. |

## Cooperative scrolls

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| SC01: Rallying | LIB2 + TRN2 | 1T + 3R + 1C | Input: None. Output: One scroll of rallying. Native same-floor formation/control/support operation. |
| SC02: Phase swap | LIB2 | 1T + 4R + 2C | Input: None. Output: One scroll of phase swap. Native compatible same-floor ally swap. |
| SC03: Soul recall | REC1 + LIB1 | 1T + 6R + 4C | Input: None. Output: One scroll of soul recall. Current native code revives downed slots across floors, or recalls separated living peers. Exclude fallen/extracted heroes; characterize consent and destination restrictions before campaign use. |
| SC04: Shared vigour | LIB3 + APO3 | 2T + 12R + 8C | Input: None. Output: One scroll of shared vigour. Native same-floor party restoration; exact eligible effect remains native. |

## Cooperative equipment

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| CO01: Aegis standard | FOR2 + TRN2 | 4T + 10M + 2F + 6C | Input: None. Output: One native aegis standard. XP evoker; current native use requires a visible living same-floor ally. Preserve recharge debt. |
| CO02: Twin-spark conduit | FOR2 + LIB2 | 8M + 4R + 8C | Input: None. Output: One native twin-spark conduit. XP evoker; visible living same-floor ally needed; preserve native attack/friendly-fire rules. |
| CO03: Astral beacon | FOR3 + REC2 | 8M + 8R + 12C | Input: None. Output: One native astral beacon. XP evoker; visible same-floor living ally or downed ghost needed. Complete auxiliary-state transfer required. |

## Shipping, recovery and insurance

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| LG01: Consignment packaging | ARM2 + WAY1 | 2T + 1M + 2F | Input: Actual declared gear/supplies; transferred, not consumed. Output: One declared finite shipment. Before-launch reserve delivery; WAY2 enables a new post-launch shipment. Destination/source title and native receiving capacity remain explicit. |
| RC01: Sealed recovery casket | REC2 | 3T + 2M + 4F + 2R | Input: Up to 40 tagged field material units; sealed, not donated. Output: One sealed material bundle. Preserve all contents into salvage escrow on final source closure; no automatic banking. Casket consumed on settlement/recovery. |
| RC02: Inheritance tether | REC3 | 4F + 10R + 10C + 1RS | Input: One eligible physical equipment instance; bound, retained. Output: One insured equipment claim. Return remaining actual item only on final source closure. Exclude quest items/stacks/consumables; no early copy or consumed-item restoration. |

## Realm protection and return

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| RM01: Heat seal | RLM1 | 4M + 4R + 4C | Input: One actual scroll; retained until read. Output: One protected scroll use. Bypass only Gehenna's branch read prohibition once; other read restrictions remain. Consume seal on successful scroll consumption. |
| RM02: Thermal ampoule | RLM1 | 3M + 6R + 3C | Input: One actual potion; retained until drunk. Output: One protected potion use. Bypass only Cocytus's branch drink prohibition once; other drinking restrictions remain. Consume on successful potion use. |
| RM03: Corrosion frame | RLM2 | 12M + 4F + 6R + 8C + 1IR | Input: No cell included. Output: One reusable carried frame. One cell grants 60 aut: same-floor living visible allies within radius 2 get Dis's fixed corrosion contribution reduced 8 to 4. No protection from other corrosion; strongest source only. |
| RM04: Ritual ward | RLM2 | 8M + 4F + 8R + 10C + 1RS | Input: No cell included. Output: One reusable carried ward. One cell grants 60 aut: same-floor living visible allies within radius 2 use 3/4 rather than 1/2 Will for Tartarus alone. Nonbranch lowered-Will still imposes native 1/2; strongest source only. |
| RM05: Ward cell | RLM2 | 4R + 4C | Input: One frame/ward; retained. Output: One activation for 60 floor-local aut. Evocation takes one normal 10-aut action; follows bearer across floor travel with remaining duration. Disconnect/hand-off/reload never reset it. |
| RM06: Anchored return beacon | RLM3 + WAY3 | 6T + 12M + 6S + 12R + 16C + 1PC | Input: None. Output: One reusable beacon, 4 return charges. Three consecutive 10-aut activation actions at an eligible safe site. After activation, each hero extraction or cargo-only settlement consumes one charge. Remaining peers continue; no remote cargo. |
| RM07: Return-beacon recharge | RLM3 | 12R + 8C | Input: One actual beacon at guild service; retained. Output: Restore beacon to 4 charges. Only at an eligible guild service, never on the ground during a fight; no extra benefit from charging a full beacon. |

## Pattern research

| Recipe | Facilities | Materials per output/use | Actual input and output |
| --- | --- | --- | --- |
| RS01: Brand / ego pattern study | FOR1 + LIB1 | 4M + 4R + 2C | Input: One identified eligible field-acquired ordinary item; consumed. Output: One guild-wide corresponding ordinary pattern. Application still requires the recipe's Forge tier. No artifact cloning or starter/import research faucet. |
| RS02: Resistance ring study | FOR3 + LIB2 | 6R + 4C | Input: One identified field-acquired ordinary resistance ring; consumed. Output: One guild-wide corresponding ring pattern. Choose keeping the useful ring versus investing it in repeatable production. |

## Exact scope of the new realm devices

**Heat seal / thermal ampoule:** bind to one actual scroll/potion unit, splitting a stack through native rules if necessary. At use, bypass only the named realm check. Confusion, berserk, silence, species/form/god restrictions and other native prohibitions still apply as appropriate. A failed eligibility check consumes neither wrapper nor item. Successful item use consumes the wrapper and that actual unit together. Wrappers never generate the potion/scroll they protect.

**Corrosion frame:** one consumed ward cell supplies 60 aut of active support after a normal 10-aut evocation. The bearer and living same-floor allies in native line of sight within grid radius 2 receive the effect. For Dis's fixed corrosion term, use 4 rather than 8. Ordinary corrosion and slime-wall effects remain. Multiple frames use the strongest single reduction. Downing, extraction or final fall stops the bearer's active aura; handing off the item cannot refresh it.

**Ritual ward:** the same activation, range, lifetime and non-stacking rules apply. Tartarus alone uses a 3/4 Will multiplier instead of its native 1/2. A nonbranch lowered-Will condition still applies the native 1/2 result; the device does not cleanse it or compound a second realm reduction. Preserve native rounding/caps. This changes a specific hostile-effect threshold rather than declaring immunity to hostile magic.

Durations advance through the bearer's actual floor-local native time. Saving, disconnecting, visiting another floor or changing carriers preserves remaining state and cannot refill a cell. No remote floor or offline wall-clock simulation is introduced. Frames/wards are real reusable devices; cells are finite consumables. They use an explicit carried-device activation contract, not an invisible passive guild buff.

**Anchored return beacon:** deploy on an allowed accessible floor and complete three consecutive 10-aut setup actions. Unsafe native conditions, movement, taking damage or cancellation reset unfinished setup; no return charge is spent until a valid settlement actually commits. Once ready, the actual beacon remains anchored at that location. The field service has four finite charges. One charge settles one eligible hero with valid carried cargo, or one cargo-only deposit while that hero remains. It cannot fetch a distant hero/bag or extract a downed hero without the applicable revival/final-loss transition.

The proposing scope allows approved Hell/Pan/Tomb expedition floors, excludes authored trial/no-company-return sites and unresolved locked quest transitions, and changes no native rune/entrance conditions. The exact branch allowlist is part of the new travel adapter. Each actual departure uses its participant lifecycle; an extracted operator can leave the anchored device for authorized remaining peers. No host action settles everybody automatically. Unused charges remain finite native item state; a recovered beacon can be refilled only through RM07 at a valid guild service. Recharging a full device is ineligible.

## Recovery tools and loss policy

A casket seals at most 40 actual tagged material units with one normal native action. It preserves each owner's share and cannot be spent for crafting while sealed. Priorities can be chosen once; automatic packing need not ask about every pickup. The initial loss hypothesis is that sealed units enter salvage escrow at 100%, whereas unsealed loose material retains 50% per owner/type, rounded down, only when the whole source expedition finally closes. Before closure, surviving players can recover every remaining physical unit under native custody. This is a comparison baseline, not an accepted final loss rule. If full material salvage is selected instead, reassess the casket's purpose rather than selling a redundant benefit.

An inheritance tether consumes its crafting materials on binding to one eligible existing equipment instance. Ordinary successful return needs no insurance payout or reward claim. After terminal source closure, an unresolved bound item can move automatically to its titled owner, bypassing a salvage mission. There is no mid-expedition copy, restored charge expenditure, recreated destroyed object or insurance payout in money. Each further protected physical item needs another tether; the system does not impose a universal single-heirloom limit.

## Source-backed effect boundaries

- Ordinary brand/ego types, weapon +9 and per-base armour maxima: [item-prop-enum.h](../../../crawl-ref/source/item-prop-enum.h), [defines.h](../../../crawl-ref/source/defines.h), [armour_max_enchant](../../../crawl-ref/source/item-prop.cc). All crafting and target-price bands remain proposed.
- Cooperative scroll operations: [party.cc](../../../crawl-ref/source/party.cc) and dispatch in [item-use.cc](../../../crawl-ref/source/item-use.cc). Important asymmetry: current soul recall revives downed party slots across floors, and otherwise can bring separated living peers to the reader. It is stronger/different in scope than a same-floor visible-ally beacon. Descriptions alone are insufficient.
- Cooperative XP-evoker eligibility: [evoke.cc](../../../crawl-ref/source/evoke.cc) checks same-floor visible living allies; astral beacon additionally accepts a visible downed ghost. Charges/recharge/enchantment require auxiliary-state handling in [item-prop.cc](../../../crawl-ref/source/item-prop.cc) and native merge behavior in [items.cc](../../../crawl-ref/source/items.cc). Crafting a replacement or reissuing an object must not reset spent debt or silently merge it into a free upgrade. These classes stay unsupported until that adapter is proven.
- Realm read/drink restrictions: [item-name.cc](../../../crawl-ref/source/item-name.cc). Dis's fixed corrosion and Tartarus's Will change: [player.cc](../../../crawl-ref/source/player.cc). Every proposed exception/aura is new behavior, not a native capability inferred from a device name.
- Hell branches carry a no-items flag in [branch-data.h](../../../crawl-ref/source/branch-data.h). Material/component installations there require explicit authored placement eligibility; ordinary random loot cannot be assumed.

Soul recall's relocation path also needs controller-consent/destination-policy assessment for living off-floor humans before manufacturing becomes routine. The campaign lifecycle must exclude extracted/finally fallen heroes from every revival, recall, XP and passive-support loop. A current downed-flag check alone cannot implement the new lifecycle safely.

## Most useful recipe comparisons

A spear plus buckler costs 2T + 5M. Raising the spear from +0 to +2 adds 4M + 2R. Two curing potions cost 2F + 4R. This is a concrete early preparation that can compete with the next permanent building. A shared aegis standard costs 4T + 10M + 2F + 6C after its facilities; it can become reusable company equipment if recovered. A soul-recall scroll costs 1T + 6R + 4C once, with broader native relocation and different tactical constraints. An astral beacon costs 8M + 8R + 12C plus its facility path, retains XP recharge requirements, and gives a different recurring support option.

Test output usefulness and eligibility in real native play before judging the numerical prices. Documentation arithmetic and a valid catalogue do not prove manufacturing, multiplayer support, safe recall or realm exceptions.
