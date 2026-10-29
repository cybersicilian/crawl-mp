# Eldritch: three stolen powers

Simplified design proposal, 22 October 2026. This supersedes the expanded draft.
It is a species concept, with no gameplay implementation or balance validation.
The target is the decision load of a species plus one ordinary religion.

**Steal one benefit from each of up to three gods. Endure their wrath. Complete
three Elder Rites to strengthen those same benefits.**

[The pantheon](pantheon.md) specifies the one benefit, rite scaling and punishment
for all 29 concrete gods in this checkout, including Vorr, Vellum and Pakellas.

## The important scope choice

Recommend a hard limit of **three distinct gods per character**. This deliberately
replaces the initial idea of unlimited absorption. Each god supplies one active
ability or one passive benefit, rather than a small religion of its own. A native
ability with several closely related effects, such as berserk, still counts as
one ability. Rites improve it without unlocking additional buttons.

Three choices preserve combinations while bounding the build to at most three
stolen combat actions. A passive uses a choice too. There are no equipped and
unequipped Echoes, switching menu, replacement loop, or dormant collection.
Selections are permanent; duplicate altars provide nothing. The consequence is
that most altars are alternatives, not mandatory upgrades.

An unlimited pantheon would require another restriction on accumulated benefits.
For this version, the three-god limit does that work and removes dilution and
combination-specific resource systems.

## Profanation

Eldritch cannot worship. Start from roughly Human attributes and aptitudes, without
Demigod stat growth; final species numbers remain open. Eldritch is living and
blood-bearing by default, and is not automatically undead or demonic.

At an actual altar, Profane shows the stolen benefit and its wrath, then asks for
one confirmation. The benefit works immediately, including during wrath. Each
later acquisition receives the character's current rite strength. There are no
conduct requirements or general gifts. Profaning an altar is personal and does
not prevent an ally from worshipping there.

Only available gods can be acquired. An acquired power remains yours if its god
later becomes unavailable; existing wrath also remains. An ecumenical altar does
not grant a separate power or a free choice from the entire pantheon.

## One shared resource

**Defiance is the replacement for spendable piety.** It has a fixed maximum of
100 and replenishes from ordinary combat XP, using actual party XP attribution.
The first profanation supplies 40 once. Further profanations and rite victories
do not refill it. Waiting does not earn Defiance.

Every stolen active ability spends from this same bar. Passives cost nothing.
Spending does not weaken powers or remove earned ranks. Their Defiance prices
replace the worship versions' divine MP, HP, gold and piety fees. Ordinary item
charges, material requirements and equipment effects still apply where stated.
There is no separate currency for each god.

Existing skill and XL scaling remain where the selected native effect uses them.
Invocations is relevant to invocations, Evocations to Pakellas's wand use, and
weapon skill to Wu Jian's lunge. Fixed bonuses stay fixed. No new skill is added.

Recharge rate is a balance parameter: initially target a substantial fight to
fund a modest invocation, with larger abilities requiring more saved reserve.
Acquiring another god never increases income or capacity.

## Three Elder Rites

| Stage | Available | Reward |
| --- | --- | --- |
| Theft | First profanation | Initial strength of every acquired power |
| First Rite | XL 9 | First improvement to every acquired power |
| Second Rite | XL 15, First Rite complete | Second improvement |
| Third Rite | XL 21, Second Rite complete | Final improvement |

Invoke Elder Rites appears in the normal ability menu when eligible. Each rite
is one short fight with two scheduled waves of ordinary monster types. The three
encounters have increasing, fixed difficulty, independent of the chosen gods.
Delaying a rite can make it easier, at the cost of delaying stronger powers.
There are no god-specific trial rules, avatar unlocks or preparation currencies.

Begin in a safe legal location with space for reachable enemies. The next wave
arrives on a fixed schedule; leaving one enemy alive does not stall it. Resolving
both waves by killing or permanently banishing their members wins. Temporary
pacification or conversion does not count as a victory. Trial enemies have no
natural expiry; they remain until defeated or the attempt is abandoned.

Leaving the floor abandons the attempt and clears its remaining trial actors.
Retrying repeats the same encounter without losing completed rites. Only one
attempt may be active per party. Ordinary allies and co-op players may help;
only the invoking character advances. Party balance needs testing, but this
proposal adds no separate enrollment or isolation system.

Trial actors are unrewarding summons: no XP, loot, corpses, Defiance or
kill-triggered resource rewards. They do not supply Vorr healing. Ordinary
wrath events pause during the fight. There are no trial-only blood pools, soul
tokens, equipment loans or victory refills.

## Longer wrath, without another progression tree

Use the familiar per-god wrath state, with one duration rule:

| Acquisition | New god's wrath duration |
| --- | --- |
| First god | One baseline duration |
| Second god | Twice the baseline |
| Third god | Three times the baseline |

Duration expires through ordinary combat XP, not waiting. The baseline needs
campaign tuning. The same earned XP advances each outstanding duration; there is
no repayment allocation. Adding a god does not restart an earlier god's timer.

Each god has **one recognizable punishment**, listed in the pantheon. Rites do
not add punishment tiers or restart wrath. Native XL scaling supplies appropriate
threat. One common scheduler prevents independent gods from firing several major
punishments together. Brief status effects expire normally; completing wrath
ends further events from that god.

These are restricted profanation responses, not the complete native abandonment
package. Reuse existing statuses, attacks and monsters. In particular, do not
import one-time excommunication penalties or invent permanent item destruction.
Echoes remain available, except for a listed brief disruption such as Vellum's
Unravel. Cleansing an ordinary status never clears the underlying wrath.

## Compatibility and presentation

Keep ordinary targeting, resistances, physiology, terrain, friendly-fire warnings
and effect caps. Normal haste and berserk rules still apply. Each creature-making
Echo permits one of its own creatures at a time, with no refresh while it lives;
there is no shared summon-point currency. Different stolen benefits can combine.
The three choices and shared Defiance budget pay for that flexibility.

Generated actors cannot generate resources or be recycled into new rewards.
Resolve each real kill once through existing credit rules. Preserve ownership
and conservation for corpses, wand charges and Vellum enchantments. No copied or
secondary effect may recursively create itself. These are engine invariants,
not additional meters or player-managed counters.

The faith panel needs only Defiance, the completed rites, and the three chosen
powers with their angry/settled indicators. Ability descriptions show the current
effect and the next improvement. Routine powers are directly hotbar-accessible;
Vellum uses the existing item transfer flow. No return to an altar is needed to
manage acquired benefits or undertake a rite.

Implementation should keep `you.religion` godless and supply the selected effects
through a separate capability adapter. God identity, rank, selected ability,
cost and punishment belong in declarative policy. Reuse the native effects and
resource ledgers rather than making the character temporarily worship each god.
The full native gods retain all their existing capabilities.

## What was removed

Per-god four-ability trees; graded W0-W3 wrath; dilution equations; variable
Defiance capacity; reserved Defiance; multiple debt budgets; summon points;
additional shared cooldown categories; custom trial avatars; trial-only fuel;
and the borrowed gods' full gift, blood, card, workshop and binding economies.

The remaining balance questions are narrow: whether three benefits together
compete fairly with normal worship, whether wrath makes each altar a meaningful
choice, and whether three short trials are enjoyable. Compare complementary
three-power builds, all-passive builds and late acquisitions before tuning more
systems. This revision has only had document/roster checks, not gameplay tests.

## Local references

- [God roster](../../../crawl-ref/source/god-type.h),
  [abilities](../../../crawl-ref/source/religion.cc),
  [passives](../../../crawl-ref/source/god-passive.cc), and
  [wrath](../../../crawl-ref/source/god-wrath.cc).
- [Current god descriptions](../../../crawl-ref/source/dat/descript/gods.txt).
- [Vellum](../vellum/README.md) and [Pakellas](../pakellas/README.md).
- [Vorr's current effects](../../../crawl-ref/source/god-vorr.cc) and
  [payments](../../../crawl-ref/source/god-vorr-payment.cc); the initial Vorr
  design document does not describe all current native mechanics.
