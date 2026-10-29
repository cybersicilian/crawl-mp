# Weaving the slate into the dungeon

[Slate](README.md) · [Roster](roster.md) · [Spells](spells.md) · [Plan](plan.md)

New character choices should be visible through ordinary finds and encounters, including runs where nobody selected a new background. Use existing branches and generation slots. The initial package requires no new branch, rune, portal timer, god or metagame subsystem.

Revision, 22 October 2026: Chain Devil is a species with innate powers. The former Chainwarden background, chain-spell proposals and BOOK2 Book of Bridles are retired. Existing control spells and items remain useful to other species; books do not distribute the complete Chain Devil identity.

## Books and acquisition

| ID / proposed book | Contents | Existing connections and distribution |
| --- | --- | --- |
| BOOK1 Book of Thresholds | Spark Sigil, Snaring Script, Repelling Seal | Earth/Hexes/Translocations; ordinary books and shops, optional Orc/Vaults study loot. Runebinder's opening library. |
| BOOK3 Book of Undergrowth | Thornling, Forced Bloom, Root Lattice, existing Summon Forest | Summoning/Alchemy/Earth with a later Translocations route. Ordinary acquisition plus Lair/Forest thematic placement; Forest must never be the sole source. |
| BOOK4 Book of Appearances | False Footfall, Paper Double, Borrowed Silhouette | Hexes/Summoning; general acquisition and occasional Elf study loot. No automatic theft of Dithmenos powers. |
| BOOK5 Book of Postponed Hours | Deferred Dart, Arrested Moment, Release Echo, existing Slow | Conjurations/Translocations/Hexes; ordinary books, with optional Vaults/Elf thematic placement. |

Book contents are proposed bundles, not guaranteed random generation or shop offers. Add a small number of thematic placements without guaranteed optimal drops or a species-specific loot table. Audit overlap with current books and measure whether adding all four crowds out older build routes. Existing spells retain their own schools and level requirements when included in a new book.

## Signature items: follow-on candidates

These are outside the first playable package. Existing nets, wands, scrolls, polearms, phantom mirror and normal equipment provide its initial loot. New items earn their place by making an action accessible through a different resource or commitment, not by multiplying the number of versions of a spell.

| ID / item | Proposed behavior | Integration and constraint |
| --- | --- | --- |
| ITEM1 Spindle of Detours | XP-recharged evoker places one short-lived repelling seal at a visible legal tile. | Gives noncasters a positioning tool. Reuse R3's target/effect adapter; normal Evocations scaling. Characterize recharge and Pakellas Prototype/Overclock policy before admission; no second free charge pool. |
| ITEM2 Germination Casket | XP-recharged evoker deploys one temporary thornling using the D1 actor contract. | Gives fighters a disposable positional ally. Uses the same summon accounting and no-XP rules, with its own explicit owner/cap interaction. It does not grant Forced Bloom without learning that spell. |
| ITEM3 The Surveyor's Hook | Unrand polearm with one activated bounded pull against a valid visible target, assessed against existing displacement effects. | An equipment commitment that offers an Evocations route to a pull, without granting Chain Devil's maintained tether or racial progression. Exact base weapon, enchantment, activation cost/recovery and appearance are deferred. |

ITEM3 needs a separate comparison against Beckoning, Kinetic Grapnel and reaching. Drop it if the only difference is its name. Every item must work on eligible old species/backgrounds; Oozle assimilation must either preserve its supported native behavior or present an explicit incompatibility under that system's contract.

## Enemy roles and readable counterplay

| ID / role | Proposed use | What the player can learn or exploit |
| --- | --- | --- |
| E1 Silk adept | A fragile web-using enemy for later Dungeon/Spider encounters; derive ordinary anatomy and immunity from the relevant existing monster data. | Kill or bypass the controller; recognize that some enemies ignore its silk. No new unique is required. |
| E2 Script sentinel | A modest caster that telegraphs one sigil at a time, initially an Orc/Vaults encounter role. | Step around the marked tile, draw another enemy onto it if allegiance permits, or force the caster to abandon its prepared position. |
| E3 Nursery tender | A fragile grower accompanied by a small bounded number of plants, suited to Lair/Forest. | Attack early growth, kill the tender or move the fight away. Clear mature/bloom states distinguish it from a generic summoner. |
| E4 Mirror duellist | An Elf/Depths opponent with one marked decoy and a bounded exchange. | Predict the return square, occupy it, destroy the decoy or break sight. No hidden simultaneous copies. |

These are four encounter archetypes to assess, not four already-authored monster records. Prototype with existing actors and controlled fixtures; create new records only when their behavior deserves distinct identity. Monster and player use share effect rules where applicable, while AI decisions, power and access remain separate.

Existing **Arachne, entropy weavers, thorn hunters, wandering mushrooms, fungal shamblers and chain-wardens** supply thematic anchors. Their names do not prove support for the proposed player behavior. Arachne remains her own unique. The existing chain-warden is a human Vaults specialist; Chain Devil is a proposed demonic species, with no automatic affiliation, immunity or allegiance to those jailers.

## Six encounter candidates

Depths are proposed placement bands, subject to actual monster strength and native generation checks. These replace ordinary encounter opportunities within a content budget; no run receives all six by default.

| ID / encounter | Placement | Tactical episode | Loot and fallback |
| --- | --- | --- | --- |
| V1 The Broken Loom | D:5–8 | Two approaches to a small room: a visibly webbed short route and an open longer route. A depth-appropriate existing melee pack creates pressure. Later variant adds E1. | Normal loot; optional Book of Thresholds weighting, never guaranteed. Every species can take the open route. |
| V2 The Customs Seal | Orc:2 or Vaults:1–2 | A short approach has a visible seal, cover and a second route. First fixture uses existing enemies; later E2 guards a mixed melee/ranged pack. | Ordinary branch loot. No locked exit, compulsory trap trigger or mandatory dispel tool. |
| V3 The Abandoned Nursery | Lair:2–4 | A tender's immature plants occupy one approach; another exposes the party to existing ranged pressure. Advance early, destroy growth or pull enemies away. | Normal loot and optional Undergrowth book placement. A solo character can resolve every objective. |
| V4 The Rooted Ford | Swamp:1–3 or Forest:1–3 | Shallow water, existing trees and temporary roots create several traversable routes. The stronger position can become exposed when growth expires. | Ordinary branch loot; no rune or branch-ending changes. Connectivity remains valid before, during and after expiry. |
| V5 The Crooked Gallery | Elf:1–2 | A mirror duellist uses one visible decoy across a room with ordinary sight breaks. The player can occupy its return point or pressure the real caster. | Normal Elf equipment/books. No unseen-entity information leak through decoy behavior. |
| V6 The Unfinished Clock | Vaults:3–4 or Depths | Marked delayed impacts combine with an existing control enemy. Reposition, disrupt the controller or spend a resource to survive the deadline. | Normal late-game loot. Clear telegraphs, safe counterplay and no unavoidable simultaneous-impact kill. |

The recent [Forest generation repair](../../forest-recovery-2026-10-21.md) makes connectivity a concrete regression concern. Do not alter Forest:4's ending in this slate. The shallow-water/tree-ring failure is relevant to V4's geometry, not evidence that every dynamic root layout is safe.

## Gods and existing builds

These are compatibility questions and thematic opportunities, not new divine benefits or exceptions.

| Existing system | Integration decision |
| --- | --- |
| Good gods and religious starts | Chain Devil needs consistent demonic eligibility, using a shared species capability where appropriate. Current Demonspawn-specific checks must be audited; good-god and relevant starting-background exclusions are part of the species proposal, not a class bonus or exemption. |
| Fedhas | Keep divine plant privileges and powers valuable. Ordinary Druid summons must respect current plant traversal/protection/conduct. Do not silently allow Forced Bloom to consume divine allies. |
| Dithmenos | Compare Paper Double and Echoborn with actual shadow/decoy behavior. Ordinary illusions remain smaller; changing their appearance does not copy a divine passive. |
| Cheibriados | Delayed resolution is not an extra player action or acceleration. Exchange/pull abilities still pass native movement and conduct rules; “time” flavor grants no exemption. |
| Trog | New background spells obey existing spell restrictions. Innate species abilities need an explicit native classification; paying MP alone does not determine whether an ability is forbidden magic. |
| Vehumet / Sif Muna | Check support and gift eligibility through actual spell flags, schools and access paths. Do not promise eligibility from a spell's damage description. |
| Vorr / Blood Liturgist | Plants and crystal bodies must report anatomy honestly. Ordinary bloodcraft curse eligibility differs from Vorr's blood-bearing kill economy. Shared binding recovery must prevent abusive chains without rewriting unrelated rites accidentally. |
| Pakellas | New evokers and activated items require an explicit Prototype/Overclock/recharge decision. Do not assume membership in the misc-item enum gives complete compatibility. |
| Paladin / Skald / Auramancy | Formation support can help a prepared position survive. Preserve strongest-source and stance rules; no extra aura stacking or background-triggered elemental combos. |

## Optional Company Campaign bridge

When actual asset transfer and library persistence exist, BOOK1 and BOOK3–5 can be archived knowledge and ITEM1–3 can be ordinary secured property. Their native availability does not depend on a guild building. Species and backgrounds start selectable under normal rules; no proposed accomplishment gate locks them. Chain Devil's innate abilities are bodily capabilities, not archivable spells or loanable equipment.

Future recipes should use the existing material and building vocabulary instead of adding silk tokens, spores or temporal currency. Recipe outputs must be real legal items with one custody chain. This document does not add recipes, modify the economy catalogue or claim the campaign is implemented.
