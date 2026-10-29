# Vellum, the Archbinder

Vellum conserves artifact enchantments as personal threads that can be removed
from a donor, archived, and bound to another artifact. This implements the
six-capacity core. **Overweave is not included.**

Status: the native game and test executable built successfully. All 24 Vellum
contract tests, 18 matched god/loadout comparisons, and the 103-case adjacent
regression batch passed. The current native source matches the tested snapshot.
Focused Vellum and Pakellas web action checks also passed. See
[validation results](validation-report.md). No browser playthrough, campaign
balance verdict, or deployment is claimed.

## Rules

- Capacity is personal: one at joining, then two/three/four/five/six at earned
  piety milestones 30/50/75/100/120. Spending piety does not retract earned capacity.
- Every bound thread reserves capacity, including threads on dropped, unequipped,
  melded, or traded recipients. Only the owner's active equipment grants effects.
- One thread per property across the character; one per recipient. At six stars,
  one designated Masterwork can hold two different threads within the same budget.
- Every enchantment is indivisible. Transferring a numeric property does not split
  its value, add it to the same native property, or cancel an opposite-signed one.
  The stronger same-signed value wins. A transferred brand replaces the active
  native brand while bound; archiving exposes that native brand again.
- Positive native enchantments are permanently depleted from donors. The donor
  survives, keeps its identity, and cannot issue the same enchantment twice.
- Drawbacks are movable. Suppressing a donor's drawback reserves capacity even
  when its thread is archived. Its original drawback returns if its suppression
  is severed, its donor changes owners, or Vellum's favour is lost. Drawbacks
  never provide negative capacity or free removal.
- Stateful unique powers move as a complete package costing all six capacity.
  Their native callback state is preserved separately from static affixes. The
  donor loses the power; the recipient must have the appropriate equipment
  family and attack/slot compatibility, including native prerequisites such as
  Mindtap requiring an energy orb. Named artifacts unlock at five stars.
- Standard artifact properties include signed stats, resistances, brands,
  drawbacks, base modifiers, and activated/passive properties. Weapon and armour
  enchantment levels also move intact; ordinary item subtype features remain
  intrinsic. Save-definition metadata is not a gameplay enchantment.
  Script-driven growth travels with the scripted power unless those levels were
  already harvested separately; harvesting in either order cannot duplicate it.
- Hard engine compatibility rules still apply, including conflicts between both
  imported Masterwork threads. Normal random-generation placement preferences
  are not used as universal restrictions on a hand-crafted artifact.
- Equipment with Contam, Drain, Fragile, or Bane must undergo its normal removal
  consequences before that thread can be extracted, moved, archived or replaced.
- Threads become dormant under penance or abandonment. Cleanup remains available.
  Destroying a bound item destroys its attached threads; it does not restore a
  positive donor property. Trading never changes the owner of a thread.

## Progression and costs

A character receives one free starter: Str+2, Int+2, Dex+2, or SInv. One mundane
apprentice vessel can host these simple properties; normal recipients are
artifacts. The starter is once per character, including abandonment and rejoining.

| Operation | Piety | Owner actions |
| --- | ---: | ---: |
| Starter | 0 | 1 |
| Extract, optionally bind immediately | 2 + 2 × min(6, weight) | 5 |
| Rebind an existing thread | 3 | 5 |
| Archive a bound thread | 0 | 5 |
| Sever a thread / restore its donor drawback | 0 | 1 |
| Designate a Masterwork | 3 | 5 |

Work requires safety. Damage, danger, inventory changes, ownership changes, stale
ledger revisions and lost eligibility cancel before commitment. No donor change
or piety payment occurs until the fifth owner action. Existing cooperative delay
handling lets peers act independently. Native kill conduct supplies piety;
crafting, item circulation and Invocations training do not expand capacity.

## Initial capacity prices

These are tunable game policy in `god-vellum-policy.cc`, independent of the
conservation ledger. Numeric drawbacks use the same magnitude-based price as the
corresponding benefit, because removing a penalty is itself useful.

| Enchantment | Capacity |
| --- | ---: |
| Str / Int / Dex | ceil(abs(value) / 2) |
| rF / rC / rN / Slay / AC / SH / Stealth | abs(value) |
| Will / EV | 2 × abs(value) |
| rPois / rElec / rCorr / rMut / Rampage / Acrobat | 2 |
| MP / HP | ceil(abs(value) / 4) / ceil(abs(value) / 5) |
| Regen, mana regen, wizardry, invisibility, blink, clarity, repulsion, silence, school enhancer | 3 × abs(value) |
| Archmagi | 4 |
| Weapon brand / armour ego | 3; speed and distortion weapon brands 4 |
| Weapon / armour enchantment level | abs(value) |
| No spellcasting / Harm | 3 |
| No teleportation / Contam / Drain / Slow / Corrode / Fragile / Bane | 2 |
| Weapon base damage, accuracy, delay; armour encumbrance | 6 |
| Unique scripted package | 6 |
| Other native properties | abs(value) |

Oversized positive threads may be archived but cannot be installed within six
capacity. Archived drawbacks reserve their price and therefore cannot be used to
remove an oversized penalty. Negative delay means faster attacks and is priced
as a benefit, not a drawback.

## Reusable mechanisms and integration

`enchantment-transfer.h/.cc` owns exclusive thread identity, indivisible values,
capacity accounting, replacement, archiving, destruction and validation. It has
no player, inventory, UI or religion dependencies. The `god-vellum-*` adapters
supply prices, milestones, persisted owner state, transactions, menus and native
script lifecycle management.

Native/raw artifact properties remain separate from the owner projection. Item
memory takes a detached native source view so it cannot harvest borrowed stats,
base modifiers, brands or unique traits. Existing native unrand callbacks are
reused through the equipment-effect dispatcher. Saved script copies keep mutable
state across reload without repopulating the donor's static properties.

The native ability and web item context menu open the same weaving flow. The web
request carries the selected hero and physical item UID; the native handler
checks both. Destructive extraction and severing show the concrete change before
confirmation. Dedicated altar and Weave ability sprites use an ivory codex,
golden binder's needle and magenta enchantment threads. See [artwork](art/README.md)
for source images, generation prompts and integration status.

## Validation and balance interpretation

The native tests cover weapon brands versus armour egos, enchantment levels, capacity boundaries, whole-value transfer, duplicate
properties, stale quotes, donor identity/depletion, archived drawbacks, removal
consequences, Masterwork conflicts, memory harvesting, dropped/destroyed items,
penance, unique-power ownership, serialization and action timing.

`test_vellum_comparison.cc` defines 18 matched native loadouts: XL 8/15/25 under
Vellum, godless, Cheibriados, Okawaru, Ashenzari and Pakellas. It measures actual
stats, resistances, weapon skill, delay and remaining piety. Okawaru uses Heroism
and Finesse, Ash uses actual equipped curses, and Pakellas uses a designated wand.
These are diagnostic comparisons, not a claim of equal campaign strength.

Before adding Overweave, inspect the measured rows and playtest the important
opportunity costs: useful donor availability, temporary active-god power versus
permanent item flexibility, drawback suppression, unique combinations, changing
gear, and piety spent acquiring a loadout. No acceptance threshold is inferred
from unrun tests or static source inspection.

`validate.py prepare` binds the current source and installed dependency files to
a request hash. `validate.py run` requires that exact request, owner and process
group under the repository's shared host gate. It copies an isolated candidate,
compiles game objects afresh, builds the database and runs the native batches.
Repairs can reuse that owned candidate only with its complete cache hash manifest
bound to the next request; changed sources invalidate the affected objects.
Prior attempts and failure logs are retained separately. The original narrower
proposal is preserved in `initial-proposal.md` and is superseded by these rules.
