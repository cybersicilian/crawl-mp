# Spell catalogue

[Slate](README.md) · [Roster](roster.md) · [Mechanics](mechanics.md)

Twelve proposed spells use existing schools. Names, levels and costs are provisional. Listed MP is the base cost before native modifiers, including HP-casting substitutions. Every cast uses the ordinary failure, targeting, religion, action-time and cancellation paths. One normal action is 10 aut.

Revision, 22 October 2026: C1 Mooring Thread and C2 Draw Tether are retired spell proposals. Their former Chainwarden background is replaced by the [Chain Devil species](chain-devil.md), whose revised chain kit is innate. Those powers do not appear in ordinary books or require school training. Existing Beckoning remains a normal spell available under its own rules.

## Placement and control — wave 1

| ID / spell | Level / schools | First specification | Cost, response and limit |
| --- | --- | --- | --- |
| R1 Spark Sigil | 1 / Earth, Conjurations | Inscribe an empty visible floor tile within range three. The next hostile actor entering it takes a modest physical stone-spark hit against AC. | 1 MP; one action; expires after 40 aut. Fires once. Arms at cast completion before the next actor's movement. Does not trigger on the cast's empty target or grant vision. |
| R2 Snaring Script | 2 / Earth, Hexes | A floor sigil attempts a short movement bind against the first hostile entrant. | 2 MP; one action; 50-aut lifetime. Respect Willpower and binding immunity. Target can still fight/cast. Initial bind cap 10 aut and recovery 30 aut, shared across participating new bind effects and tested against Scarlet Fetters. |
| R3 Repelling Seal | 3 / Earth, Translocations | A crossed seal attempts to move its hostile entrant one tile away from the seal's recorded caster-side origin. | 3 MP; one action; 50-aut lifetime. Normal displacement eligibility; never place an actor in lethal terrain or an occupied tile. On blocked movement, consume the seal without hidden extra damage. |

R1–R3 share an owner limit of two sigils total, with one per tile. Placement at the limit replaces the oldest sigil; show the replaced tile in the targeting preview. Successful replacement is atomic. Failed placement or miscast must not erase the old effect. An ordinary hostile entering a spark tile supplies damage; a web-immune hostile walking over silk supplies the immunity control.

R2 is not a way to chain-lock an enemy across party members. If integrating the recovery rule with existing binding changes unrelated spells materially, revise the proposal before implementation. Include innate Chain Devil tethers in mixed-control checks without treating them as R2 or ordinary spells. Test ordinary movement, stepping across a tether boundary, forced movement, teleportation and adjacency separately.

## Living growth — wave 2

| ID / spell | Level / schools | First specification | Cost, response and limit |
| --- | --- | --- | --- |
| D1 Thornling | 1 / Summoning, Earth | Summon a fragile stationary plant on a legal adjacent tile. It makes modest attacks against adjacent foes. | 1 MP; one action; 50-aut lifetime; one thornling per caster. Attackable, no XP or item rewards, existing summon accounting. It must not hard-lock a one-tile exit. |
| D2 Forced Bloom | 2 / Summoning, Alchemy | Consume one of the caster's eligible new plants for a visible short-range burst. A plant that has matured once produces a stronger burst. | 2 MP; one action. Sacrifices future attacks and remaining lifetime. Damage/conduct are resolved once; no summon death rewards. Native plants, Fedhas allies and Myconid buds are ineligible in the first version. |
| D3 Root Lattice | 4 / Summoning, Earth | Grow up to three fragile root actors on visible eligible cells. Their attacks briefly constrict adjacent eligible foes. | 4 MP; one action; 40-aut lifetime. Shared cap with this caster's growth summons; no additive three-root damage to one target in a single effect tick. Escape, destruction or loss of source ends the relevant constriction. |

Keep D1 useful before D2 is learned. D2 changes a decision, rather than being a mandatory last-turn detonation button: a mature plant may still offer more value alive. D3 earns its inclusion only if it differs in practice from existing Grasping Roots and Summon Forest. Existing monster-only plant spells are reference mechanisms, not automatically player-ready spells.

Initial shared growth capacity: three actors, including the thornling and lattice roots. A cast previews what it would replace. Scaling should first improve durability, attack power or duration within readable caps; do not increase clicks through unlimited gardens.

## Reflections — wave 3

| ID / spell | Level / schools | First specification | Cost, response and limit |
| --- | --- | --- | --- |
| I1 False Footfall | 1 / Hexes | Emit a modest artificial movement noise at one visible legal tile within range four. | 1 MP; one action. Uses ordinary hearing and alert behavior, not a guaranteed aggro override. Never uncovers unseen monsters. Already engaged or deaf opponents may ignore it. |
| I2 Paper Double | 2 / Hexes, Summoning | Create one fragile visible decoy within range three. Eligible foes may select it as a target through the characterized AI rules. | 2 MP; one action; 30-aut lifetime. No damage, scouting or rewards. It cannot promise universal distraction, regardless of flavor. |
| I3 Borrowed Silhouette | 4 / Hexes, Summoning | Create a decoy with the appearance of a visible living hero, including the caster, and greater ability to survive incidental damage. | 4 MP; one action; 40-aut lifetime. Shares the caster's ordinary illusion cap with Paper Double. Copies no inventory, spells, divine passives or character state. Teammates always see the illusion marker and owner. |

I3 is contingent: if survival duration does not create a different tactical choice from I2, merge it into I2 power scaling and reduce the slate to eleven spells. Do not keep a spell to satisfy a content count. Echoborn's exchange echo has a separate purpose but must be included in total party obstruction and targeting tests.

## Delayed magic — wave 3

| ID / spell | Level / schools | First specification | Cost, response and limit |
| --- | --- | --- | --- |
| T1 Deferred Dart | 1 / Conjurations, Translocations | Pay now to place a visible attack marker at a target floor tile. After 20 aut, strike the tile's current occupant using the recorded cast power. | 1 MP; one action; range four; one pending dart per caster initially. Does not home, retarget or replay an entire spell cast. Moving off the tile avoids it. |
| T2 Arrested Moment | 3 / Hexes, Translocations | Mark a visible hostile. After 10 aut, attempt a short Willpower-resisted slow if that same actor remains eligible and in the caster's sight. | 3 MP; one action. A stable actor ID follows that target, not a later occupant. Respect slow immunity, native duration caps and stacking. No global time stop or queue suspension. |
| T3 Release Echo | 4 / Conjurations, Translocations | Resolve the caster's pending Deferred Dart immediately at reduced effect. | 4 MP; one action; proposed 60% effective power. Consumes the pending attack once. Casting failure leaves its normal deadline unchanged. Invalid pending state cancels before cost. |

Deferred Dart's threat is visible immediately, and its remaining action time is inspectable. An ally can enter the marked tile before resolution; preview that possibility at cast time and use ordinary collateral/conduct handling at resolution. Owner death or departure cancels these first-version effects. Reload preserves the due time and once-only resolution.

T3 must justify its spell slot and action against simply casting a direct attack. If it is redundant or always optimal, remove it rather than adding arbitrary bonuses. Chronomancer's existing Slow access should remain a meaningful alternative to T2.

## Acquisition and ordinary builds

Four proposed fixed books expose these spells outside the new backgrounds; see [world integration](world.md). Reuse the existing random-book and shop pipelines where their predicates permit each spell. Review school weighting and total book-pool dilution before adding all books to normal generation.

Enemy-only spells, unmemorized library entries and starting memorized spells are distinct states. A row in this document or `spell-type.h` establishes none of their runtime availability. Each implemented spell needs native metadata, targeting, school/failure rules, description, art, quiver eligibility where appropriate, and generated catalogue agreement.
