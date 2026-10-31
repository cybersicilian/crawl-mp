# Eldritch: one theft per god

Simplified proposal, 22 October 2026. See [the shared rules](README.md).
Choose at most three of these 29 powers. Every row grants exactly one ability
or passive. None opens a further ability tree.

Numbers run **Theft → First Rite → Second Rite → Third Rite**. They are starting
balance proposals, not measured equivalences to worship. Turns mean normal
10-aut turns. `D` is Defiance; its maximum is always 100. Passive entries have no
activation cost. Rites only change the quantity named in the scaling column.

Where a percentage refers to a native effect, apply it once to the named damage,
restoration or application-power value, at the character's actual relevant
skills/XL. Use a fixed reference piety of 120 if that native formula requires
piety. Preserve native resistance rolls and caps. Percentages are not extra
success probabilities, and discrete effects such as banishment remain whole.
The reference is an implementation comparison, not another player stat.

Punishments below are proposals for profanation, including for gods that do not
normally use active wrath. They recur only while that god remains angry, with
one shared event scheduler and ordinary XL-based threat scaling. The same
punishment applies at every rite rank. Exact event frequency and brief curse
lengths remain tuning values, not four additional progression stages.

## The standard pantheon

| God | The single stolen power | Rite scaling | Profanation punishment |
| --- | --- | --- | --- |
| Zin <!-- GOD_ZIN --> | **Rebuke — 8 D.** Daze one susceptible visible foe; uses a resistance check and native daze behavior. | Maximum daze duration: **2 / 3 / 4 / 5 turns**. | A brief confusion effect from the axioms of Law. |
| The Shining One <!-- GOD_SHINING_ONE --> | **Divine Shield — 8 D.** Temporary SH for eight turns. | **+3 / +4 / +5 / +6 SH**. | Revealing radiance briefly prevents stealth and invisibility from concealing you. |
| Kikubaaqudgha <!-- GOD_KIKUBAAQUDGHA --> | **Grave Ward — passive.** Reduce otherwise applicable torment damage. | Prevent **20 / 30 / 40 / 50%** of that damage. | A hostile death-magic attack, using an existing scaled damage effect. |
| Yredelemnul <!-- GOD_YREDELEMNUL --> | **Raise Dead — 12 D.** Consume one eligible corpse to make one temporary zombie, using native corpse-to-undead rules. | Ally lifetime: **6 / 8 / 10 / 12 turns**. | A hostile undead pursuer. |
| Xom <!-- GOD_XOM --> | **Chaos Touch — 8 D.** Temporarily give a compatible wielded weapon the native chaos brand. Normal temporary-brand restrictions apply. | Brand duration: **4 / 6 / 8 / 10 turns**. | One hostile minor Xom intervention, restricted to temporary combat effects. |
| Vehumet <!-- GOD_VEHUMET --> | **Destructive Insight — passive.** Restore MP on a worthwhile ordinary kill. | **1 / 2 / 3 / 4 MP** per credited kill. | A hostile conjuration directed at you. |
| Okawaru <!-- GOD_OKAWARU --> | **Lesser Heroism — 8 D.** Boost the normal Heroism skills for six turns, respecting skill caps. | Skill bonus: **+1 / +2 / +3 / +4**. | A hostile warrior challenges you. |
| Makhleb <!-- GOD_MAKHLEB --> | **Blood Price — passive.** Restore HP on a worthwhile ordinary kill. | **3 / 4 / 5 / 6 HP** per credited kill. | A hostile demon. |
| Sif Muna <!-- GOD_SIF_MUNA --> | **Channel — 12 D.** Restore MP over three turns; interruption loses the unfinished restoration. | Total restoration: **3 / 6 / 9 / 12 MP**. | A brief spellcasting penalty. Its narrow relevance is intentional, rather than adding a second anti-warrior curse. |
| Trog <!-- GOD_TROG --> | **Borrowed Rage — 12 D.** Native berserk with a short fixed duration and normal aftereffects. Kills cannot extend it. | Duration: **4 / 5 / 6 / 7 turns**. | A hostile berserker. |
| Nemelex Xobeh <!-- GOD_NEMELEX_XOBEH --> | **Draw Destruction — 8 D.** Immediately resolve one random native Destruction card. No card inventory, stacking or deck selection. | Card application power: **25 / 35 / 45 / 55%** of the reference effect. | A brief pig transformation from the Swine card, respecting its native restrictions. |
| Elyvilon <!-- GOD_ELYVILON --> | **Lesser Healing — 16 D.** Apply the native self-healing effect, respecting healing restrictions. | Restoration: **20 / 30 / 40 / 50%** of native healing. | Briefly reduce healing received. This never reverses healing into damage. |
| Lugonu <!-- GOD_LUGONU --> | **Banish — 20 D.** Attempt to banish one native-legal target. | Application power: **25 / 35 / 45 / 55%** of native banishment. | A hostile distortion attack; no automatic trip to the Abyss. |
| Beogh <!-- GOD_BEOGH --> | **Smite — 8 D.** Use the native single-target smiting attack. | Damage: **25 / 35 / 45 / 55%** of native smiting. | A small hostile orc band within one wrath event's threat budget. |
| Jiyva <!-- GOD_JIYVA --> | **Slimify — 20 D.** Attempt the native slime transformation on one eligible foe. Its normal allegiance and reward rules remain. | Application power: **25 / 35 / 45 / 55%** of native Slimify. | Temporary corrosion. |
| Fedhas <!-- GOD_FEDHAS --> | **Grow Briar — 8 D.** Place one temporary friendly briar in a legal adjacent cell. | Lifetime: **6 / 8 / 10 / 12 turns**. | Hostile plants appear in legal, reachable positions. |
| Cheibriados <!-- GOD_CHEIBRIADOS --> | **Bend Time — 12 D.** Attempt to slow adjacent enemies with native susceptibility and resistance checks. | Maximum slow duration: **2 / 3 / 4 / 5 turns**. | A brief slow effect. |
| Ashenzari <!-- GOD_ASHENZARI --> | **Borrowed Insight — passive.** Permanently choose one martial or magical skill to boost when profaning. No curse or equipment-slot management. | **+1 / +2 / +3 / +4 skill**, capped normally. | Brief weakness. |
| Dithmenos <!-- GOD_DITHMENOS --> | **Shadow Step — 20 D.** Blink to a legal visible cell adjacent to a hostile enemy, respecting blink restrictions. | Maximum travel distance: **2 / 3 / 4 / 5 cells**. | A hostile shadow pursuer. |
| Gozag <!-- GOD_GOZAG --> | **Counterfeit Petition.** Choose one of three offered temporary potion effects and apply it immediately. No potion item, gold payment, permanent improvement or lasting mutation. | Defiance cost falls: **30 / 27 / 24 / 21 D**. The effect itself stays the same. | One nearby enemy receives a temporary might buff. |
| Qazlal <!-- GOD_QAZLAL --> | **Lesser Upheaval — 12 D.** Use the native elemental attack and targeting. | Damage: **25 / 35 / 45 / 55%** of native Upheaval. | A harmful elemental cloud, with a warning before it appears. |
| Ru <!-- GOD_RU --> | **Draw Out Power — 20 D.** Reduced native HP/MP recovery and ordinary cleansing, retaining native exhaustion. It cannot cleanse profanation wrath. | Restoration: **20 / 30 / 40 / 50%** of the native recovery. | Brief weakness. |
| Uskayaw <!-- GOD_USKAYAW --> | **Stomp — 8 D.** Use the native adjacent-enemy attack. No combat-piety meter or automatic paralysis. | Damage: **25 / 35 / 45 / 55%** of native Stomp. | A brief slow effect as your rhythm breaks. |
| Hepliaklqana <!-- GOD_HEPLIAKLQANA --> | **Call Ancestor — 16 D.** One temporary melee ancestor, with ordinary XL-based strength. No role choice, equipment, permanent companion or separate advancement. | Lifetime: **6 / 8 / 10 / 12 turns**. | A hostile ancestral warrior. |
| Wu Jian <!-- GOD_WU_JIAN --> | **Lunge — passive.** The native movement-triggered lunge, with reduced attack damage. No Whirlwind, Wall Jump or Lash. | Lunge damage: **25 / 35 / 45 / 55%** of a native lunge. | A hostile martial warrior. |
| Ignis <!-- GOD_IGNIS --> | **Fiery Armour — 12 D.** Eight turns of AC and the native fire retaliation at a fixed half strength. | Armour bonus: **+2 / +3 / +4 / +5 AC**. | A hostile fire elemental. |

## Custom and reworked gods

| God | The single stolen power | Rite scaling | Profanation punishment |
| --- | --- | --- | --- |
| Pakellas <!-- GOD_PAKELLAS --> | **Wand Surge — 8 D plus the normal wand payment.** Aim and evoke a wand in one action, with an effective Evocations bonus for that shot. A wand whose effect cannot benefit is ineligible. | Effective Evocations bonus: **+2 / +4 / +6 / +8**, respecting native effect caps. | Briefly reduce effective Evocations. |
| Vorr <!-- GOD_VORR --> | **Blood Communion — passive.** Heal from actual direct damage dealt to worthwhile, natural, blood-bearing foes. Retain Vorr's existing per-time healing cap and ordinary healing restrictions. | Lifesteal: **2 / 3 / 4 / 5%** of qualifying damage. | Brief bleeding, with native bloodless immunity. |
| Vellum <!-- GOD_VELLUM --> | **Borrowed Thread — 20 D.** Transfer one whole positive enchantment between compatible random artefacts through the existing binding flow. Only one stolen thread may exist at a time, including on unequipped or dropped items. | Maximum eligible property weight: **1 / 2 / 3 / 4** using Vellum's existing prices. The item menu filters eligibility; there is no allocatable capacity pool. | **Unravel:** briefly suppress the borrowed thread, without destroying it or altering either item's ownership. |

Pakellas lends enhanced wand use, without a Field Kit, Prototype reserve,
Overclock debt or Breakthrough loan. Ordinary charges and any intrinsic wand
costs remain real payments. The full god's device support stays unchanged.

Vorr lends lifesteal, without ground-blood collection, regeneration, blood speed,
corpse funding, self-exsanguination or additional rites. Its native per-time cap
bounds fast attacks and multi-target damage without exposing a new meter.
Fractional healing uses the existing native rounding convention.

Vellum lends one transfer, without starter gifts, a thread collection, drawback
suppression, Masterwork or unique scripted packages. Whole properties are never
split. Positive donors remain permanently depleted, and the one thread grants
its effect only through its owner's active equipment. Existing compatibility,
non-stacking, work interruption and removal-consequence rules still apply.
Moving the same thread uses the same transfer action and price; cleanup remains
available. Replacing it requires explicitly severing it, not dropping its item.
This is an occasional equipment decision rather than another combat system.

## Shared boundaries

- No power grants the rest of its god's kit, conducts, gifts or capstones.
- Kill recovery uses normal worthwhile-kill credit, including party attribution;
  no last-hit minigame. It cannot pay from summons, trials or wrath actors.
- Zombie, briar and ancestor powers each allow one of their own creations at a
  time. There is no extra summoning currency or refresh while that creation lives.
- Ordinary restrictions still matter: resistible powers can fail; berserk has
  consequences; bloodless foes cannot feed Vorr; a missing corpse cannot be
  replaced with free trial material. Native consumable/effect locks still apply.
- Cancelling a selection spends nothing, but cannot reroll a potion offer or
  reveal an uncommitted random card. Preserve native commitment semantics.
- Different chosen powers can stack through normal engine rules. For example,
  Makhleb kill healing and Vorr lifesteal are allowed together; they occupy two
  of the three choices. There is no additional strongest-heal-only rule.
- Punishments may share familiar mechanics. Ru and Ashenzari can both cause
  weakness; that is preferable to inventing a new status solely for each god.

Roster checked against [god_type](../../../crawl-ref/source/god-type.h).
Pakellas is present under the checkout's default `TAG_MAJOR_VERSION == 34`.
No God, Random, Nameless and Ecumenical are not additional stealable gods.
