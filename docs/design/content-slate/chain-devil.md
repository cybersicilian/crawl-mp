# Chain Devil: species proposal

[Slate](README.md) · [Exact mechanics](chain-devil-mechanics.md) · [Implementation and assessment plan](chain-devil-plan.md)

Design draft v0.3, 22 October 2026. The user selected a species-first direction and requested further planning: backgrounds are starting templates; most enduring character diversity should come from species. **Chain Devil** is the working name and next design focus. The Chainwarden background and its two proposed spells are retired from the active slate. This revision makes Reel's outcome explicit and records small Lash impact damage as an agreed direction; gameplay implementation and balance remain untested.

## Identity

A living devil whose chains are part of its body. They emerge from the back and arms, grip foes and fasten to the dungeon. They occupy no inventory slots, require no purchased ammunition and do not grant extra weapon hands. The character uses ordinary weapons, armour, jewellery and potions, subject to the final native demonic and anatomy contracts.

The species asks: **which enemy do I hold, and when do I turn that hold into a different position?** A Fighter uses the chains to keep a foe near its shield. A Hunter pulls a pursuer away from a companion or holds a distant flank. A Conjurer confines a dangerous melee enemy while attacking another. A Warper combines its learned movement magic with the same innate body.

Chain power grows with XL. It requires no Hexes, Translocations, Spellcasting, Invocations or particular background. Demonspawn's random mutation development remains a separate identity; this species has predictable chain development. Existing ordinary spells and equipment remain useful and do not confer the complete racial kit on everyone else.

## Candidate innate progression

These are prototype defaults, not measured balance. Implement and assess the first action before committing to the later two. Every listed action takes one normal action, costs no MP or HP, and scales with XL rather than trained skills.

| Milestone | Innate action | Decision and provisional rule |
| --- | --- | --- |
| XL1 | **Chain Lash** | Strike a visible hostile within three tiles. A successful physical hit deals modest damage and attaches one temporary tether to an eligible body. The initial source-to-target distance becomes its maximum length; it does not automatically tighten when either actor approaches. Initial lifetime: 40 aut. |
| XL7 | **Reel In** | One action consumes the current tether and pulls its target toward the devil, up to two tiles, stopping at adjacency or the first blocker. On a clear path, a foe at range three moves two tiles and one at range two moves one. No second hit roll or added damage. |
| XL13 | **Pinning Chain** | One action transfers the current tether to a fixed anchor at the foe's current tile, allowing movement within one tile for a short duration. Give up the mobile tether to hold a particular place while moving elsewhere. |

Lash lifetime grows to 60 aut at XL7 and 80 aut at XL13. Pin lifetime is the smaller of 40 aut and the tether's remaining life; it never refreshes a hold. Durations include the activation action's elapsed time. One maintained chain relationship per devil at every XL. A 50-aut recovery begins when the chain ends; a missed Lash also begins recovery. A valid attack that cannot attach a tether deals only its normal impact and starts recovery.

**Lash is a small damaging strike as well as a tether.** Proposed damage is `1d(5 + floor(XL / 3))`: 1d5 at XL1, 1d7 at XL7 and 1d9 at XL13, before ordinary AC. The proposed native to-hit input is `16 + XL`. Small impact damage is the selected direction; these numbers remain starting parameters to test, not observed hit rates. Native modifiers must be audited explicitly. Chain damage does not inherit a weapon brand, weapon enchantment, blood rite, auxiliary attack or automatic weapon strike. A landed hit may attach even if AC reduces its impact to zero, and that tether still permits Reel. No ongoing constriction damage follows.

No charge currency, recharge harvesting or idle bonus accumulation is introduced. Chain Lash cannot be recast during a maintained hold or recovery. A direct Release action is available without consuming a turn, starts the same recovery and cannot reset or shorten an existing cooldown.

The hit test, damage, cooldown and XL thresholds remain tunable. The purpose of a damaging first action is to avoid requiring a harmless preparation turn before every useful chain action. Reeling and pinning should be alternatives to an ordinary attack, not compulsory follow-up buttons.

## Reel In, concretely

Reel acts on the foe already caught by Lash. One activation takes a normal 10-aut action, with no MP/HP cost or additional target selection. The existing grip supplies its reliability: no new accuracy or Willpower roll. Native displacement immunity and the physical route still matter.

| Target position when Reel is activated | Result on an otherwise clear, legal path |
| --- | --- |
| Three tiles away | Pull two tiles, leaving the foe adjacent |
| Two tiles away | Pull one tile, leaving the foe adjacent |
| Already adjacent | Unavailable; spend no action and retain the tether |
| Only the first step is legal | Pull one tile and consume the tether |
| No step is legal, or the foe cannot be displaced | Unavailable; spend no action and retain the tether |

The devil stays in place. The target moves through consecutive cells and cannot pass through an intervening creature or wall, or enter unsuitable terrain. A successful Reel ends the hold, starts chain recovery and leaves an ordinary enemy at its new position. It adds no damage, stun or free weapon attack. The enemy can act normally when its next action is due.

For example, an archer three tiles away on a clear path is pulled next to the devil, where its position can be exploited on a later action. A foe beside a companion can be drawn away if the route is clear; the companion cannot be pulled through. Lash and Reel are separate turns, so the target may act between them. Reel previews the result from its current position rather than promising the original Lash position.

## What the tether does

- The target can move inside the allowed distance, attack, cast and use eligible abilities. Tethering does not itself lower evasion, grant stabbing opportunities, silence or impose a taunt.
- A target cannot voluntarily move beyond its valid tether boundary while held. Monster AI must choose a reachable action rather than repeatedly wasting turns against that boundary.
- If it lacks a productive attack or approach, the target can spend a normal action straining the chain. This removes another 10 aut from the remaining hold, in addition to ordinary time passing. Straining is a deliberate escape action with visible feedback, not a failed movement loop.
- The devil's own movement never drags a foe for free. A move beyond the allowed length releases the tether as part of that move, with a visible preview. No extra release command is needed for ordinary retreat.
- Teleportation or a forced move beyond the boundary breaks the tether. Reeling uses native displacement and habitat checks; size, anchoring, unmovability and other immunities need explicit characterization.
- Reel follows consecutive cells on the physical path and stops before a wall, actor, impassable or uninhabitable cell. It cannot skip blockers or add collision damage. A visible zero-distance or otherwise invalid Reel is unavailable and preserves the tether; at least one legal step makes it a valid pull that consumes the hold.
- A maintained tether ends on source downing, death, floor departure, relevant form suppression or lost clear sight. Disconnect alone does not pretend the actor died. Save/resume preserves owner, target, deadline and recovery.
- Pinning replaces the same relationship; it does not add a second target or require two target selections. The existing target's current solid-floor tile becomes the anchor. A target already pinned cannot be pinned again.
- A released target receives a proposed 30-aut respite from new chain attachments and Scarlet Fetters. Chains also respect bloodcraft's existing binding recovery. This is a narrow proposed mutual admission rule, not a rewrite of all crowd control. It requires mixed-source testing before acceptance.

These powers use bodily chains. Proposed rules: silence permits them; confusion and berserk prevent activating Lash, Reel or Pin. An existing hold continues during those temporary states while its other conditions remain valid. An anatomy/substance-changing form suppresses the chain mutation and ends an active hold. Lesser effects that preserve the body do not. Native implementation must confirm the exact form and state categories.

## Species profile to assess

| Property | Prototype default | Purpose |
| --- | --- | --- |
| Body | Medium living humanoid with two ordinary weapon hands and bodily chain appendages | Normal weapons, shields, armour, jewellery and potions; no additional wielding slots |
| Movement | Normal native speed | Close-range control supplies the identity; no fast-kiting or slow-species rule added |
| Starting attributes | Strength 10, Intelligence 8, Dexterity 6, before background modifiers | A physical inclination while keeping caster openings practical |
| Health / magic / XP | Native modifiers `hp: 0`, `mp_mod: 0`, `xp: 0` | Neutral starting assumptions for measurement |
| Willpower | Native aptitude field `wl: 3` | Ordinary baseline; no free control immunity |
| Species stat gain | Every four XL, choose randomly between Strength and Intelligence | Support physical and magical development; native user-selected stat gains remain |
| Natural defences | No added AC, SH, EV, regeneration or resistance in this draft | Measure the chains before adding another advantage |
| Anatomy and physiology | Living and blood-bearing; no wings, giant horns, extra hands or special diet | Clear gear fitting and native blood/healing interactions |

Proposed aptitude exceptions to a default of 0: **Fighting +1, Maces & Flails +1, Polearms +1, Armour +1, Invocations +1; Dodging -1, Spellcasting -1, Shapeshifting -1, Stealth -2**. Ranged Weapons, Unarmed Combat, Shields, Evocations and every individual magic school start at 0. The clinking chains motivate the stealth weakness; they do not emit additional per-turn noise or wake enemies through a second hidden rule.

These values are intentionally editable hypotheses. A neutral HP modifier and ordinary gear do not establish balance; tests must show whether action/recovery costs and the weaker aptitudes are sufficient. Chain power has no Strength, Dexterity or skill dependency, so a caster is not taxed into a hidden melee build.

Do not add a collection of resistances, natural armour, torment immunity, bloodlessness or regeneration simply because the name says devil or the existing chain-warden monster has resistances. Measure the chain utility first, then set HP, aptitudes and other tradeoffs. The opportunity costs already include action time, recovery, one target and remaining near a dangerous opponent.

**Demonic identity is a real integration requirement.** Current `player::undead_or_demonic`, `player::evil` and starting restrictions contain explicit Demonspawn checks. `player::holiness` is a different path. Introduce or reuse a canonical species capability and inspect its consumers; do not copy Demonspawn mutation progression or replace every Demonspawn check indiscriminately. Apply the established good-god and relevant religious-background exclusions consistently, with native preview tests.

## Different starts, same species

| Existing background | What the chains add | What still comes from the background/build |
| --- | --- | --- |
| Fighter | Keep a threat near the front, then Reel when reaching distance is useful | Armour, shield use, weapon choice and damage |
| Hunter | Hold an enemy near its current approach or consume the chain to pull it off a companion | Ranged attacks, ammunition rules and distance management; no free moving leash |
| Conjurer | Spend an innate action on positioning while preserving MP for spells | Direct damage and spell training; the tether does not silence a hostile caster |
| Warper | Combine a bodily hold with learned movement tools | Blink/Beckoning and their native restrictions; moving beyond the leash releases it |
| Blood Liturgist | Choose between bodily control and learned curses/rites | HP reservations and worship; mutual recovery prevents alternating perpetual restraint |
| Berserker | Lash before entering berserk; use normal attacks while the short hold persists | Berserk and its restrictions; aimed chain actions are unavailable during it |

Paladin and other good-god starts must follow the final demonic restrictions. No background grants stronger chains or additional targets.

## Example fight

A Chain Devil Fighter lashes a charging ogre, dealing a little damage and holding it within the chain's reach. The ogre can still close and strike. While a companion retreats, the devil fights it normally. If another threat changes the fight, the devil can use its later Pin to keep the ogre near the doorway, or release the hold while retreating. It cannot maintain the ogre's pin and lash a second enemy simultaneously.

A Chain Devil caster makes a different choice with the same anatomy: hold one enemy while spending MP on another, then abandon the chain when the position becomes unsafe. That variation across existing starting templates is the design's main acceptance criterion.

## First useful assessment

Compare Chain Devil Fighter, Hunter, Conjurer and Warper with the same existing backgrounds on Human and appropriate Demonspawn controls. Start with one Lash and one tether in an open room, a corridor and a mixed melee/ranged encounter. Assess damage, action costs, pursuit, refusal behavior, safe retreat and interaction with ordinary control spells.

Then add Reel and Pin separately. Keep a later action only if choosing it changes the next decision rather than adding a required click. Before a playable species is accepted, include demonic eligibility, anatomy/forms, native character creation, art, descriptions, direct ability access, saves, personal perception and two-owner tests. The [assessment plan](chain-devil-plan.md) gives concrete comparisons and decision gates.

## Appearance and interface

Use a compact humanoid silhouette with two heavy chain arcs emerging behind the shoulders, muted red or violet skin, dark iron and a small bright eye treatment. Avoid a mass of fine links that becomes noise at native tile scale. Ordinary helmets and armour must remain believable on the body. The existing human chain-warden's tile is a thematic reference, not the final species art.

Show one tether, its target and allowed reach. Distinguish a body tether from a floor anchor by shape as well as colour. The player can inspect remaining time, the target's ability to break free and recovery without opening a separate management screen. Effects behind a wall or outside personal sight must not expose live target positions.

Lash uses activation plus target selection. Reel and Pin act directly on the single current tether; they need no second quarry picker. Keep hotbar slots stable while an action is unavailable and show the reason. Walking out of reach releases automatically; direct Release is optional. Console messages and symbols carry the same information.

Suggested species description:

> Chain Devils bear living iron in their flesh. Their chains catch foes at a distance, draw them close and, with age, fasten them to the dungeon itself. They wield ordinary weapons and practise any permitted art, but their rattling bodies are ill suited to stealth. A devil can hold only one foe, and every hold leaves it close to danger.

## Decisions still open

- Is the one-target restriction and recovery enough to balance the profile across melee and caster starts?
- Does a tether create useful solo choices before Reel unlocks, or does Reel need to arrive earlier?
- Does Pin offer a worthwhile fixed-position choice after its action cost, remaining-life cap and enemy straining?
- Should the native physical-grip immunity set be narrowed for chains? Begin with the current constriction-resistance query as an explicit conservative hypothesis; do not silently redefine it.
- Is Chain Devil the final name? It is suitable for mechanics planning; lore and art can still refine it.

The reusable engine unit is an owned relationship between a source actor and a target/anchor. The species mutation grants access and defines its progression; monster harpoons, ordinary spells or items can reuse particular operations with their own rules. Reuse of the mechanism does not imply identical powers or access.

## Evidence boundary

The source-backed references are [Demonspawn's definition](../../../crawl-ref/source/dat/species/demonspawn.yaml), [Human's baseline](../../../crawl-ref/source/dat/species/human.yaml), [player identity checks](../../../crawl-ref/source/player.cc), [starting restrictions](../../../crawl-ref/source/ng-restr.cc), [god admission](../../../crawl-ref/source/religion.cc) and the existing [chain-warden monster](../../../crawl-ref/source/dat/mons/chain-warden.yaml). [Mechanics](chain-devil-mechanics.md) records the additional constriction, harpoon, ability and AI findings. Their presence does not demonstrate this species or the proposed tether. The racial kit remains a planning proposal.
