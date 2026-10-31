> Historical proposal, superseded by README.md after the user requested movable drawbacks, brands and unique powers.

# Vellum, the Archbinder: artifact enchantment transfer

Status: proposed design and balance hypotheses, 2026-10-21. The name is provisional.
This document plans a new god against the current working source. No gameplay
implementation, native tests, balance simulation, or deployment was performed.
Existing files contain substantial local work; their presence is source evidence,
not proof that every system described here is in the running release.

## Decision and intended experience

Vellum lets a character remove a positive enchantment from an artifact and bind
that same enchantment to another artifact. An unsuitable weapon can be valuable
because its intelligence or resistance would complete a different piece of gear.
The donor survives, permanently diminished. The chosen enchantment survives as
one personal, indivisible thread of magic; it is never copied or learned as an
unlimited recipe.

The governing limit is a small, personal binding budget. Piety controls how often
the character works; it cannot buy unlimited simultaneous power. Loot determines
the available choices. The god supplies no passive supply of new random artifacts.

The initial recommendation is selective positive-property transfer, unchanged
native item drawbacks, and a late ability to place two threads on one masterpiece.
Curse relocation, whole-item fusion, transferable unique scripts, and Overweave
are separate experiments after this economy has a measured baseline.

## Current systems and the constraints they impose

| Source-backed mechanism | Consequence for this proposal |
| --- | --- |
| [Randart generation](../../../crawl-ref/source/artefact.cc) uses quality `1 + binomial(6, 21)`; negative properties fund more positive selections; it ordinarily targets about four distinct properties before enhancements. | Deliberate selection is worth more than a random property roll. Free removal of drawbacks would undo a native balancing mechanism. Generation weights are frequency, not prices. |
| The same file separates random-generation eligibility from hard compatibility checks. Regen, invisibility, Harm and Rampage are restricted to less swappable classes; Archmagi to robes; school enhancers to particular classes/slots. | Reuse both kinds of rule intentionally. Passing a hard validity check alone does not make a transfer balanced. |
| [Weapon and armour generation](../../../crawl-ref/source/makeitem.cc) grant extra enchantment for Bane; weapon generation can produce values above ordinary scroll limits. | Leave `item.plus`, Bane, base damage/delay/encumbrance, and ordinary enchantment-scroll behavior outside the first system. A universal +9 artifact cap would be incorrect. |
| [Intrinsic item properties](../../../crawl-ref/source/artefact.cc) include ring effects, staff powers and armour resistances separately from artifact extras. | A resistance ring's intrinsic resistance is not harvestable. Extraction must distinguish the two even when the description combines them. |
| [Acquirement](../../../crawl-ref/source/acquire.cc) rerolls many ordinary armour results and can upgrade other item classes to randarts. | Acquiring a donor instead of a wearable upgrade is a legitimate opportunity cost. Acquisition rate cannot be inferred from ordinary drop odds. |
| [Religion](../../../crawl-ref/source/religion.cc) uses star thresholds 30/50/75/100/120/160, a maximum of 200 piety, and records maximum piety achieved. [Conduct](../../../crawl-ref/source/god-conduct.cc) already handles eligible kills and party adjustments. | Use existing progression and conduct. Record earned capacity independently of later spending; do not award piety for crafting or item circulation. |
| [Pakellas](../../../crawl-ref/source/god-pakellas.cc) already has personal item designation, a once-only starter, ownership checks and fixed-cost workshop choices. | Reuse those integration patterns, while keeping Vellum's budget distinct from device recharge accounts. |
| [Ashenzari and Cheibriados](../../../crawl-ref/source/god-passive.cc) trade commitment or mobility for broad persistent benefits; [Okawaru](../../../crawl-ref/source/ability.cc) supplies paid combat skills/speed and gifts. | Compare complete god packages and constraints, not one resistance against one combat ability. Vellum initially has no rescue or burst button. |
| [Oozle extraction](../../../crawl-ref/source/equipment-memory-items.cc) reads artifact properties into lasting memories; [source copies](../../../crawl-ref/source/oozle-memory.cc) preserve equipment identities. | Imported divine properties must not become native source properties or permanent memories. Stripped donors must stay stripped in memories. |
| [Party trade](../../../crawl-ref/source/party-trade.cc) copies an item into the recipient context then debits the giver. | Item movement must preserve provenance without transferring personal divine capacity. One enchanter cannot outfit an entire party outside their budget. |
| [Unrand setup](../../../crawl-ref/source/artefact.cc), called by the [save loader](../../../crawl-ref/source/tags.cc), refreshes ordinary named artifacts from their definitions. | Persistent extraction must survive refresh. Mutating a property array alone would allow donor restoration on reload. |

The existing [company equipment recipes](../../content-map/company-campaign/equipment-recipes.md)
are an authored proposal, not an established live crafting economy. Keep any
future campaign adapter explicit. Normal play, multiplayer, long runs, and the
account-specific acquisition start in [account-start.cc](../../../crawl-ref/source/account-start.cc)
need separate loot-availability measurements.

## Personal progression

All values below are starting hypotheses, not established balance.

| First milestone reached | Total binding capacity | New option |
| --- | ---: | --- |
| Join | 1 | One apprentice vessel and one starter thread. |
| One star: 30 piety | 2 | Extract and bind ordinary positive randart properties. |
| Two stars: 50 | 3 | More room for combined utility. |
| Three stars: 75 | 4 | Advanced properties: Regen, school enhancement and Archmagi, subject to native placement restrictions. |
| Four stars: 100 | 5 | More room for mixed offense and protection. |
| Five stars: 120 | 6 | Audited ordinary properties on named artifacts become eligible. |
| Six stars: 160 | 6 | Designate one Masterwork that can hold two different threads. |

Capacity is an earned personal milestone, retained across spending and rejoining.
Unlocks use recorded milestones too. Current worship, freedom from penance, and
sufficient current piety remain necessary to work. A thread does not turn off
because paying for its installation drops the character below a star threshold.
Use native maximum-piety bookkeeping where its semantics fit; give capacity and
starter state explicit saved versions rather than inferring them from UI stars.

The starter is one choice of Str+2, Int+2, Dex+2, or SInv. It costs one capacity
and is granted once per character. It supplies something useful before the first
randart pair appears. It is owner-bound and cannot be harvested or duplicated.

An apprentice vessel is one otherwise legal carried weapon, armour piece,
jewellery item, or staff allowed to host a thread despite not being an artifact.
It receives no random properties and retains native item/enchantment behavior.
Its first designation and starter installation are free. Later replacement uses
the ordinary rebind price; the old item loses the exception. Existing artifacts
are the normal recipients thereafter. The vessel is not an acquisition-quality
gift or a means to turn every mundane item into a new randart.

Use the standard worthwhile-kill piety response and existing party attribution.
No bonus for last hits, using an enchanted item, extracting items, purchases,
trades, sacrificing junk, or repeatedly rebinding. No Invocations investment is
required for this deterministic equipment-focused first version. Faith retains
its native effects on piety; it does not enlarge capacity or discount quoted costs.

## Transfer contract

1. Select an identified, eligible carried artifact and one whole positive extra
   property. The chosen value is moved intact; there is no splitting or fusion.
2. Extraction permanently removes that extra property. Intrinsics, enchantment,
   brand, drawbacks, other properties and item identity remain. Re-extraction of
   the same removed property is impossible, including after reload or trade.
3. Store the extracted thread in the owner's archive, with its exact type/value,
   source identity and provenance. Archive entries are not physical inventory
   objects and are not infinitely reusable patterns.
4. Bind the thread to a legal recipient, or archive it for later. A thread has
   exactly one state: archived, bound to one item, or destroyed. Display the
   donor's loss, recipient's result and capacity before commitment.
5. The recipient's native properties remain separately recorded. Imported power
   works only for the owning worshipper while that recipient is actively equipped
   under native rules. Melded, dropped, stored or another character's equipment
   gives no imported effect.

There is one bound thread per property type across the owner's entire ledger,
including bindings on unequipped items. Thus Int+4 and Int+6 cannot be installed
on two different items for a cumulative imported Int+10. Existing native bonuses
on other equipped items continue to stack normally.

For a numerical property already on the recipient, use the stronger of its
native total and the thread's value, not their sum. Native total includes the
recipient's intrinsic contribution and remaining native artifact extras. A
weaker or equal thread is a no-op and cannot be installed. A negative native
value of that same property makes the recipient ineligible; transfer cannot
cleanse it. Unrelated drawbacks remain effective. A boolean already supplied by
the recipient is likewise a no-op. Do not scale prices by character vulnerabilities
or temporary buffs: the price belongs to the thread, while the preview shows
the actual marginal benefit under native caps.

Example: a fire-resistance ring with intrinsic rF+ and an extra rF++ yields one
rF++ thread and retains intrinsic rF+. Installing that thread on an artifact
with native rF+ produces rF++, not rF+++. Moving it to an item with no rF produces
the full two-rank gain. Both installations use two capacity.

Every bound thread reserves capacity even while its item is unequipped or
elsewhere. This prevents an unlimited collection of prepaid situational gear.
Ordinarily an item holds one thread; the single six-star Masterwork holds two
different types under the same six-capacity total. Redesignating the Masterwork
requires both affected items present or severing the old excess binding first.

## Initial property prices

Price is persistent capacity, not consumable piety. `ceil` rounds up. These are
explicit policy entries; unknown properties default to ineligible.

| Property | Capacity | Placement and magnitude rule |
| --- | ---: | --- |
| Str, Int, Dex | ceil(value / 2) | Positive extra values only; one bound thread per stat. |
| rF, rC, rN | value | Full positive rank bundle; native player caps still apply. |
| Will | 2 × value | One Will rank uses two capacity; retain native Will calculation. |
| rPois, rElec, rCorr | 2 | Boolean; preserve native protection behavior. |
| SInv, Fly | 1 | Boolean; flight uses normal terrain/equipment lifecycle rules. |
| Stealth | value | Native positive property units, not displayed stealth percentage. |
| MP | ceil(value / 4) | Retain current no-weapon/no-staff placement policy and antimagic conflict. |
| Slaying | value | No weapons/staves; entire donor value, no splitting. |
| Regen | 3 | Only value 1 initially; slow-swap classes and native attunement. |
| One spell-school enhancer | 3 | Three-star unlock; retain that school's native slot allowlist. |
| Archmagi | 4 | Three-star unlock; robes only. |

A property whose whole cost exceeds six is ineligible in this first tuning;
display this before extraction. No silent clipping of unusual unrand values.
Archive storage has no power cost or arbitrary slot cap. Entries can be filtered
and compared; inferior entries do not require periodic deletion chores.

Keep HP/AC/EV/SH extras, wizardry, MP regeneration, Harm, Rampage, activated powers
such as Blink/invisibility, weapon brands, egos, talismans and gizmos outside the
first allowlist. Each needs a deliberate price, placement and lifecycle decision.
Their exclusion is a scope choice, not a claim that the native engine lacks them.
Randart books, consumables, base weapon traits, unique callbacks, temporary item
growth and intrinsic material effects are not transferable properties here.

Do not infer named-artifact eligibility from the absence of a callback alone.
Other code can check an item's identity, as the robe of Folly's Will override
demonstrates. Admit individual native-property operations after catalogue and
consumer review. Start that review with simple static entries such as the robe
of Augmentation; no named item is marked approved by this document.

## Work costs and interaction

| Operation | Piety | Time and commitment |
| --- | ---: | --- |
| First vessel and starter | 0 | One normal owner action; once only. |
| Extract a new thread | 2 + 2 × capacity price | Five normal owner actions; permanent donor change commits at completion. |
| Install an archived thread, or move one between carried recipients | 3 | Five owner actions; validate the complete resulting budget. |
| Extract and immediately install | Extraction price only | One five-action operation; do not charge a second installation fee. |
| Archive/remove a carried binding without installing another | 0 | Five owner actions; no restoration of the original donor. |
| Change the Masterwork | 3 | Same work sequence, combined with a requested rebind rather than double charged. |
| Sever an inaccessible binding | 0 | One action and an explicit destruction confirmation; thread is lost. |

Charge exactly the displayed piety, without random cost or failure. Reject an
operation that would leave zero piety; show insufficient funds before starting.
First starter installation bypasses the normal three-piety install price.
Unbinding and severing remain available without worship for cleanup; they confer
no effect or restored donor property.

Use the native interruptible-delay pattern already used for Oozle assimilation.
Work requires safety and action capability; danger, damage, cancellation, source
change, owner change, or invalidated capacity aborts it without item/piety loss.
At completion, revalidate all objects and state and commit removal, archive,
binding and payment together. Five actions mean five owner actions, not five
seconds of multiplayer wall time. Peers retain native input priority.

Targets may be equipped: perform a native effect transition without inventing
an extra physical unequip/re-equip cycle. Existing curses and protected-item
restrictions still block modification. Until an atomic transition is supported
for a property, exclude that operation rather than silently bypassing its costs.

The item context action opens one transfer panel. Select property and target;
show exact before/after, conflicting properties and price inline. Confirm once
for irreversible extraction. Archiving and reversing an ordinary binding need
no additional generic warning. Keep last filter/selection, keyboard access and
native blocked reasons. No altar travel and no repeated trips to two menus.

The panel also previews current and potential resistance caps. Being capped by
other gear is a warning, not a prohibition: preparing for an intended equipment
change can be rational. Inert effects intrinsic to the chosen recipient remain
hard no-ops as specified above.

## Budget examples and comparisons

Assume donors exist and recipient native properties do not already cover the
chosen effects. These examples calculate capacity, not expected win rates.

| Build choice | Threads | Capacity |
| --- | --- | ---: |
| Early utility | Int+2 and SInv | 1 + 1 = 2 |
| Midgame protection | rF+, rPois, SInv | 1 + 2 + 1 = 4 |
| Physical offense | Slay+4 and Dex+4 | 4 + 2 = 6 |
| Broad defenses | rF++, rC+, rElec, SInv | 2 + 1 + 2 + 1 = 6 |
| Spell specialization | Int+6 and one school enhancer | 3 + 3 = 6 |
| Durable caster | Regen and Int+6 | 3 + 3 = 6 |
| Robe specialist | Archmagi and Int+4 | 4 + 2 = 6 |

One item per thread means four separate recipients for the broad-defense example
until a Masterwork supplies a second socket. Native anatomy, forms and actual
artifact availability can constrain that plan. Never multiply the budget by
number of equipment slots or party members. Test Octopodes, restricted-armour
species and Oozles explicitly; capacity is equal, access need not be identical.

The nominal ceilings are, for example, a single imported +12 stat, +6 Slaying,
or six rF ranks (the latter exceeds the normal effective rF ceiling and is not
useful in ordinary circumstances). These are not guaranteed available donors.
No accumulation of six +2-stat donors creates +12: the high-value source itself
must exist. Native artifact generation's repeat thresholds are not universal
hard maxima, so measure actual donor distributions.

Cheibriados reaches +15 to each stat at six stars but imposes native movement
and haste constraints. Vellum's flexible equipment selection has different
costs; a smaller attribute number alone does not establish weaker balance.
Likewise, resistance coverage can free a ring slot for another offensive item.
Measure whole-loadout benefit, including those freed slots.

Compare with Ashenzari's skill boosts/information and equipment commitment,
Okawaru's combat powers and gifts, and Pakellas's repeatable devices. Oozle
assimilation is a species capability and interaction test, not a substitute god
baseline. A godless baseline isolates raw gain but cannot establish pantheon parity.

## Ownership, loss, religion and recursive systems

- Bindings belong to a character identity, not an account, inventory letter,
  active controller, connected client or party host. Trading an item conveys
  its remaining native properties. Its old owner's imported thread is dormant
  for everyone else, including other Vellum worshippers. It stays reserved until
  recovered, unbound by its owner, or severed. The trade preview says this.
- If a bound item is destroyed, its thread is destroyed once. If merely dropped,
  stored, downed with, or disconnected with, it remains bound and inactive until
  native equipment ownership/activation makes it usable again. No remote recall
  creates a copy. A retained duplicate ID cannot activate a second instance.
- Penance suspends imported effects. Abandonment suspends all benefits and work,
  without restoring donors or damaging native properties. Initial policy adds
  no separate wrath attack: losing the entire personal benefit prevents keeping
  the finished equipment as a reward while switching gods. Rejoining resumes
  earned state when otherwise eligible and never repeats the starter grant.
- Oozle assimilation consumes the actual source normally. It reads remaining
  native source properties, excluding imported threads and the starter. A
  recipient's imported thread is lost with the consumed item; the confirmation
  states this. The detached source copy must also omit the attachment, so native
  callbacks cannot recreate it. A stripped donor yields only its remainder.
- Shop appraisal and trade descriptions distinguish the altered native item
  from a personal blessing. A merchant cannot buy or sell another character's
  dormant thread as universally usable item power.
- Keep guild inheritance, saved loadout import/export and campaign custody out
  of default eligibility until they preserve the same unique identities and
  thread states. Documentation of those future systems is not an implemented
  provenance guarantee. Item sharing used only for display grants no ownership.

## Reusable engine design

Build the smallest reusable property-transfer mechanism, with three explicit
views: catalog/base properties, remaining extractable source properties, and
effective properties for a specified wearer. The distinction is required by
both enchantment transfer and Oozle's existing extraction consumer.

Reuse `artefact_prop_type`, native item IDs, player IDs and native compatibility
rules. Do not reuse Oozle's whole-item memory extraction unchanged: it intentionally
includes intrinsic values, traits and unique identities that Vellum cannot move.
Extract shared property metadata only where the two real consumers need it.

The god-independent mechanism owns typed property/value records, eligibility
results, an exclusive attachment state, source depletion, a versioned quote,
transactional transfer and persistence. Vellum's adapter owns prices, milestones,
recipient scope, the one-vessel/Masterwork exceptions and presentation. Names and
pantheon rules do not belong in the generic property catalogue.

Store permanent removals separately from owner-dependent attachments. Named-item
refresh must reapply the removals once against the refreshed base definition;
it must neither resurrect removed magic nor subtract it again on every load.
Define conflict handling when a future catalogue changes a depleted property.
Raw catalog access stays available to generation and migration. Effective access
must name its wearer; a global current-player shortcut is unsafe for companions,
monsters, previews and detached memory items.

Audit existing property consumers instead of adding a hidden owner-sensitive
branch to `artefact_property()`. Native equip caches, regeneration attunement,
flight, stats, descriptions, item values and serialization must agree. Binding
cannot reset a native timer or allow a spell/effect to survive its normal source
removal longer than native rules permit.

## Implementation sequence, after the design is accepted

1. **Property audit and pure contract:** enumerate eligible raw extras, intrinsic
   overlap, placement constraints, native caps, named identity consumers and
   mutation callbacks. Write the typed policy and quote/transfer state machine.
2. **Small native slice:** starter/vessel, randart resistance/stat transfers,
   depletion persistence and explicit effective-property consumers. Include
   atomic interruption and source identity tests before any broad property work.
3. **Full initial allowlist and god integration:** complete progression, piety,
   neutral pantheon/altar/menu/save IDs, MP/Slay/Stealth/Flight and advanced
   properties, trade and Oozle adapters. Preserve old enum/save identities.
4. **Named-artifact support:** approve concrete item/property operations, exercise
   definition refresh and save roundtrips, then add Masterwork lifecycle tests.
   Do not advertise all fixed artifacts as supported from a generic setter.
5. **Native interaction and balance:** direct transfer panel, authoritative JSON,
   two distinct player controllers, measured candidate builds, then controlled
   gameplay and whole-run comparisons. Publication is a separate decision.

All new or changed web code must remain at most 600 lines and use shared typed
contracts; TypeScript must not introduce `any`. Prefer concise native modules.
Before builds, broad tests, asset regeneration or browser/gameplay batches,
follow the current host-heavy policy, script hash, fixed state directory and
reservation contract. No heavy phase was started for this planning document.

## Experiments that distinguish balance hypotheses

| Probe | Baseline and variations | Required observation / decision |
| --- | --- | --- |
| Artifact availability | Same recorded seeds and progression checkpoints: joining, Lair, first rune, late game; ordinary solo, two/four heroes, restricted equipment, account-specific acquisition start. | Count accessible donor/recipient pairs and first meaningful transfer. If drought makes the god inert, improve the finite starter or vessel before increasing artifact generation. No assumed artifact count per run. |
| Capacity | Fixed loot and characters; terminal budgets 4, 6 and 8 with monotone corresponding progressions. | Measure best legal whole-loadout gain, damage taken, offensive output and expendable use. Choose the smallest budget that supports several viable builds without routine complete coverage. Six is a candidate, not a measured winner. |
| Property prices | Same budget; Regen 3/4, school enhancer 3/4, Will rank 1/2, stat point pair 1. | See whether one choice dominates across different threats and archetypes, rather than merely being strong in its intended matchup. Change the offending price/placement before raising every cost. |
| God opportunity cost | Matched characters, XP/training budget, encounter suites and appropriate god progression: Ash, Oka, Pakellas, Chei; godless control separately. | Compare sustained fights, emergencies, elemental threats, hex threats and low-loot starts. Include actual skill-training and item-gift differences; do not equate six stars with identical power. |
| Work price | Formula 2+2w versus 3+3w; rebind 3 versus 5; same candidate capacity. | Record piety remaining, milestone delay and rebinds. Desired rhythm is meaningful loot/branch changes, not mandatory preparation before each encounter. Never use rebind price as the only power cap. |
| Donor opportunity cost | Mixed-value donors, genuine wearable upgrades and party-demanded items. | Record keep/strip/trade decisions. If stripping every positive is automatic, compare a one-extraction-per-donor policy or destructive extraction as explicit alternatives. Neither is adopted yet. |
| Saturated loot | Late-game and abundant-donor fixtures, plus repeated acquisitions without extra capacity. | Prove total active imported strength remains bounded, while measuring how optimal selection improves it. Abundant loot may increase choice, never numeric fusion or the binding ceiling. |
| Species and modes | Humanoid, Octopode, restricted-armour species, Oozle and melded forms; solo/local companions/network co-op. | Separate recipient scarcity from excessive power. Test Oozle memory plus physical gear, not only naked-body projections. No party-size multiplier or borrowed identity. |

Use deterministic combat batches for initial signals, followed by human-visible
native runs for tactical decisions and menu burden. Report sample sizes and
uncertainty; do not call a small fixture comparison a win-rate result. Log donor
opportunities, chosen/rejected transfers, capacity use, piety spent, time to first
use, rebind frequency, property diversity and remaining reasons to keep loot.

Mandatory correctness cases: cancel at each work step; damage interruption;
stale requests; full/no-op/conflicting targets; opposite-sign properties; one
property across several carriers; source and target same item; detached source
assimilation; bound target assimilation/destruction; two owners and spectator;
trade/drop/recovery; inactive floor; meld/unmeld; penance/abandon/rejoin; once-only
starter; named refresh; repeated save roundtrips; catalogue migration; duplicate
item IDs; and atomic rollback with neither lost nor duplicated properties.

## Deferred design questions

The highest-value unknown is whether careful selection of six capacity already
outperforms gods that supply less reliable or more constrained power. Establish
that result before adding an active power. If the package is strategically good
but tactically flat, test a narrow Overweave against the same encounter baselines.

Curse relocation would need persistent accounting for both benefit and burden:
unequipping, melding, immunity, species irrelevance, trade and abandonment must
not turn a real drawback into free capacity. Whole-bundle fusion would also need
to distinguish meaningful drawbacks from harmless ones. Those rules are not
implied by a universal negative-property discount.

Transferring unique signature powers is a separate expansion with explicit
effect/lifecycle adapters and its own balance review. The existing Oozle source
adapter is useful evidence for native dispatch, but does not establish that any
unique power is safe or balanced on an arbitrary new item.
