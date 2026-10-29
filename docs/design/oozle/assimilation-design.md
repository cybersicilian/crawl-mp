# Oozle: memories and deliberate assimilation

This specification incorporates the latest corrections: **one item produces
one memory bundle containing every supported extracted property**. There is
no random subset and no per-property slot charge. Shapeshifting changes numeric
application strength; it does not limit how many properties a memory retains.

| XL | 1 | 3 | 7 | 13 | 19 | 25 |
| --- | --- | --- | --- | --- | --- | --- |
| Memory slots | 1 | 2 | 3 | 4 | 5 | 6 |

Memories last until overwritten. On completion, Assimilation chooses uniformly
among unlocked empty slots. If every unlocked slot is occupied, it replaces
the oldest whole bundle. Existing memories, including those created by the old
passive system, remain compatible; a legacy single-property memory loads as a
one-property bundle.

## Extraction and self-improvement

**Assimilation:** choose an unequipped inventory item, including armour this
body cannot wear. Confirm consumption and possible FIFO replacement, then spend
five owner actions. Completion consumes the source once and preserves all its
supported intrinsic properties in one slot. The destination is selected once
at completion and reused for the bundle, source item and display name. Danger,
damage, cancellation or source invalidation leaves the item and memories unchanged.
Inspection enumerates eligible slots without consuming gameplay RNG.

There is no passive assimilation, equipment dissolution or weapon-use wear.
Wearing, wielding, attacking and waiting never consume equipment for memories.
Legacy exposure properties no longer penalize weapons. Neutral equipment can
still be assimilated, but its memory grants no invented bonus, including for a
zero-enchantment stat ring.

**Shapeshifting:** source values are saved intact. The current real, unboosted
skill determines application strength, so training improves existing memories.
The provisional curve is 35% at skill 0, 56% at 9, 78% at 18, and 100% at 27.
It is continuous between those points at native skill precision, rounded to a
whole percentage. Integer numeric bonuses round down with a minimum of +1.
Skills do not change the stored bundle or trigger any extraction RNG.

AC, EV, attributes, Slaying, shielding, base damage and accuracy use this curve.
Qualitative properties, supported brands and discrete resistance ranks remain
intact. Numeric values no longer use the previous arbitrary +2/+1 storage caps.

Duplicate effects across memories use the strongest effective value; ties use
the newer memory. Stored bundles remain intact even when a stronger memory
currently supplies a duplicate effect. One native weapon brand takes priority
on an equipped weapon; an unbranded weapon can receive the newest stored brand.

## What items contribute

The generic memory mechanism stores a typed property bundle. The DCSS adapter
extracts native values without reading inherited properties, preventing
recursive copying or amplification.

- **Armour:** native base AC plus enchantment, intrinsic resistances, supported
  ego properties and supported artefact bonuses. Contributions of the same
  numeric type are combined before extraction.
- **Shields:** native shielding plus supported properties, in a separate family.
- **Weapons:** base damage, positive accuracy, enchantment as Slaying, supported
  brand/artefact properties and structural traits. Axes supply **Cleaving** via
  the native weapon capability, rather than treating it as a numeric brand. Polearms
  supply their native reach distance, which stays intact at every skill level.
- **Rings and amulets:** their native properties, stat values and special passive
  queries, including Acrobat, Faith, Guardian Spirit, Reflection, Wildshape,
  Chemistry, Dissipation, Vanguard and Camaraderie.
- **Staves, talismans and gizmos:** native intrinsic property bundles and gizmo
  passives use the same extraction path. Armour egos without an artefact-property
  equivalent retain their native passive query.

Extraction reuses the native intrinsic-item catalogue and beneficial artefact
property metadata, including regeneration, MP regeneration, Acrobat, wizardry,
flight, spell-school enhancers and HP/MP bonuses. Native passive queries reuse
the existing item-type and ego consumers; they are saved with their source
bundle, deduplicated globally, and scoped to the owning hero. Regeneration,
reflection shielding and flight have explicit body adapters where native code
normally iterates physical items or caches their presence.

All native equipment brands use their existing combat handlers. Unique items
also retain a detached source item: passive identity checks, activated abilities,
and native equip/removal, turn, kill, hit, block and projectile callbacks use that
source. Native state changes such as Wyrmbane growth and Dreamshard consumption
persist with the memory. Transient effects such as Thermic Engine heat follow
the native item's update and load rules. Staff damage, multiple strikes,
shield block limits and special projectile effects use native mechanics too.
See [the native effect contract](native-equipment-effects.md). Consumables and
general evokables remain outside the equipment contract.
## Where bonuses apply

**Armour memories protect the body once**, even with no clothing equipped.
A plate armour memory can therefore add AC to the gel without requiring a
hat as a carrier. Wearing a hat and scarf does not duplicate that body bonus.

**Weapon memories improve natural unarmed attacks** as well as future weapons.
An Oozle can learn cleaving and chopping, additional base damage, accuracy and Slaying from
an axe, then fight with its pseudopods. The native acid brand remains its base
unarmed effect; one inherited native brand can apply through
the existing brand handler alongside it. Body-changing forms suppress natural
unarmed inheritance along with acidic touch.

**All absorbed properties apply once to the Oozle itself.** Rings, amulets,
shields, armour and weapons identify the source of a memory, not a required
carrier. Resistance, attributes, AC, EV, shielding and Slaying continue to work
when naked, after equipment changes and while items are melded. Duplicate
effects use the strongest effective value across all source families, with
newer memories breaking ties. Additional equipped items never multiply a
memory. Physical equipment keeps its own independent native properties.

Weapon damage, accuracy, brands and cleaving are capabilities of the attacking
Oozle. Native weapon brands still take priority, and body-changing forms retain
their existing natural-attack restrictions. Stored source-family metadata and
legacy saves remain compatible; no item properties are stamped or transferred
to another hero.

## Body and vulnerabilities

Shapeshifting aptitude is **+2**. The skill is visible and trainable without
talismans, spells or forms. Combat and Assimilate exercise it; losing access to
forms does not disable training used by absorption.

All manufactured-weapon skills, including Throwing and Ranged Weapons, have
aptitude **−2**. Unarmed Combat remains **+1**.

The Oozle has **−10% base HP and rF−** as the initial balance pass. It retains
natural gel AC/EV, poison/corrosion resistance and amorphous movement defenses.
It can wear hats and scarves, hold weapons and shields, and wear two rings and
one amulet. Fitted armour, hard helmets, cloaks, gloves, boots and bardings do
not fit the natural body. Acidic unarmed attacks reuse native acid mechanics.

## Player display

[Interactive design preview](assimilation-preview.html) now uses the production
player-panel and property renderers with explicitly labelled sample state.
Its controls explore XL, Shapeshifting and manual assimilation.

The HUD shows six bundle slots, locked milestones and the next unlock. All
unlocked empty slots are eligible; only when full is the oldest bundle marked
for replacement. Every extracted property appears within its slot.
The current skill and percentage explain numeric application; tooltips show
stored → applied values. A single **Body** row shows effective inheritance
from every source type. Work displays source and owner turns remaining. A direct Assimilate
button opens the native inventory picker. Item views show their native properties;
absorbed bonuses appear on the Oozle.

## Co-op and validation

Active work remains a native interruptible Delay. Each step spends at most one
owner action, then yields to the existing activity pump; peer manual input has
priority at the next native boundary. Recovering and downed heroes do not spend
steps. Native interactive prompts are not automated with keystroke chains.

The reusable core is in `equipment-memory.h/.cc`; extraction is in
`equipment-memory-items.h/.cc`; native ownership, save properties and work are
in `oozle-memory.h/.cc`; native source events are in
`oozle-memory-effects.h/.cc`; JSON is in `oozle-memory-ui.cc`. Combat adapters reuse
native attack, brand and cleave handlers. Species HP and fire weakness use YAML
and an existing mutation.

## Current manual-only revision validation

[The current validation receipt](manual-assimilation-validation.json) records
17 pure memory-core cases with 245 assertions, ten affected C++ translation-unit
syntax checks, ten item-action contract checks, the species generator, and a
passing sample-state browser display regression. Updated native integration
tests cover random placement, source identity and legacy exposure, but have not
been executed against a freshly linked full game. No gameplay or deployment
acceptance is claimed for this revision.

## Earlier validation (before manual-only assimilation)

The results below describe the preceding revision and do not validate the
random-slot, manual-only assimilation change or the new weapon aptitudes.

The pure memory tests, integration translation-unit syntax checks, icon-atlas
pixel checks and the browser display regression pass. The browser regression
uses explicitly supplied sample state and checks the Body row, retention,
tooltips, focus and legacy data; it is not a live-game acceptance test.

A fresh isolated full-engine build and the focused native memory tests pass:
**40 cases, 697 assertions**. The final test revision reuses only engine objects
whose source, headers and compiler flags match the fresh build; no repository
game objects are mixed in. The tested absorption modules and integration files
match the working copy. Permanent Wyrmbane growth survives a later acquisition
and a native save roundtrip; temporary Thermic Engine heat follows the native
loader's reset rule.

[The validation receipt](body-absorption-validation.json) binds the source,
binary, raw log and all-owned-process closure. Earlier compilation failures and
test-fixture corrections remain preserved as negative evidence. The shared slot
is released. These are local native/component results; deployment, live gameplay
and two-client acceptance remain separate checks.
