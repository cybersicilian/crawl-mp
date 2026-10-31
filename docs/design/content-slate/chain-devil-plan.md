# Chain Devil: implementation and assessment plan

[Species design](chain-devil.md) · [Mechanics contract](chain-devil-mechanics.md) · [Full content slate](plan.md)

Draft v0.3, 22 October 2026. This is a sequenced plan, not evidence of implemented gameplay. The species is the first design focus; it has no dependency on the proposed Araneid, Runebinder, new books or campaign facilities.

## Selected design direction and working assumptions

The user selected species as the main source of lasting diversity and Chain Devil as the current concept. Keep ordinary backgrounds as starting equipment/training/spell templates. The proposed chains are bodily powers with predictable XL progression, ordinary equipment access and one maintained target.

Small Lash impact damage is an agreed direction. Profile numbers, precise ability costs, damage values, hit input, target immunity, later unlock levels and visuals remain hypotheses. Reel spends the existing grip for a physical pull toward adjacency without a second hit roll or additional damage. The design is sufficiently concrete to assess these rules, but no assumed number is protected from revision by having been written in a table.

## Work sequence

| Step | Work product | Required evidence before proceeding |
| --- | --- | --- |
| CD0: exact native contracts | Record current source identities and trace native actor IDs, duration processing, movement types, body suppression, damage attribution, demonic membership and starting restrictions. Inspect the current applicable repository instructions. | The source paths below resolve to actual consumers; unsupported operations are recorded. Old source receipts are not substituted for the current binary. |
| CD1: minimal leash | One owned mobile relationship with range, expiry, release, stable identity and recovery. A native diagnostic fixture can attach it without exposing a finished species. | Legal movement inside, blocked movement outside, owner retreat release, transparent/opaque walls, teleport, death and reload all follow the contract. |
| CD2: useful enemy response | Add the leash to candidate and committed movement checks; add the deliberate strain fallback. | Melee, ranged, caster, fleeing, confused and fast/slow opponents make valid decisions. No indefinite failed-move loop. |
| CD3: playable opening | Add S5's canonical species data, demonic capability integration, XL1 mutation/ability, Lash hit/damage, targeting, native descriptions and preliminary art. | Real native character previews and a small playable solo encounter work for Fighter, Hunter, Conjurer and Warper without school training for chains. |
| CD4: Reel | Extract/reuse a bounded physical pull from the native harpoon path, add provisional XL7 availability and direct action on the existing target. | Clear range-three/two pulls end adjacent; adjacent targets are unavailable. No skipping actors/walls, second hit roll, positive-impact requirement, translocation semantics or extra damage. Correct partial/invalid pulls and once-only consumption. |
| CD5: Pin | Add XL13 fixed-anchor conversion, remaining-life cap and same target/owner capacity. | Anchor geometry, valid floor, owner sight/range, source loss and strain behavior are correct; the action is useful after paying for it. |
| CD6: integration and presentation | Finish equipment/form/god interactions, source/recipient ownership, saves, ability icons, doll/selection art, personal overlays, keyboard/pointer and console display. | Complete native and two-owner co-op acceptance on exact inputs; starting preview and generated catalogue agree. |
| CD7: balance and release candidate | Run the bounded comparisons below and revise parameters. Package only the accepted exact source and outputs when release work is requested. | Record scenario outcomes and limitations. Packaging, production activation and fresh hosted behavior each require their own evidence. |

The opening Lash and tether must justify the race before adding Reel and Pin. If solo play before XL7 provides only a weak ranged opener, compare an earlier Reel unlock with a better tether rule before adding passive damage or resistances. If Pin adds a compulsory button, remove or revise it.

## Reuse and file boundaries

| Concern | Existing source/data to inspect or extend | Intended boundary |
| --- | --- | --- |
| Species and stable identity | `dat/species/`, `species-def.h`, `species.cc`, `util/species-gen/species-type-header.txt`, generator consumers | Canonical definitions and append-safe identifiers. Allocate the abbreviation only after a full active/deprecated scan. |
| Demonic membership | `player.cc`, `ng-restr.cc`, `religion.cc`, `god-conduct.cc`, related holy/equipment consumers | A canonical species predicate/capability where appropriate. Separate Demonspawn's random traits and special progression from demonic admission rules. |
| Innate growth and ability access | `mutation-type.h`, `mutation-data.h`, `ability-type.h`, `ability.cc`, duration and status definitions | Species data grants the mutation; the mutation grants abilities. No background flag or special magic school. |
| Relationship lifecycle | `actor.h`, `actor.cc`, player/monster saved state, movement/reaction loops | Small typed ownership/lifecycle code. Keep it separate from native damaging constriction unless that subsystem is deliberately generalized without changing old behavior. |
| Physical pull | `beam.cc`, movement types and actor movement finalization | Share consecutive legal path traversal and stop rules. Supply distance and collision policy explicitly; never pretend the racial action is `SPELL_HARPOON_SHOT`. |
| AI | `mon-act.cc`, `mon-behv.cc`, authoritative actor movement | Same movement predicate for planning and execution; strain spends real action energy. |
| Restraint recovery | `bloodcraft.cc` and existing binding admission | Narrow mutual recovery check with existing bloodcraft, backed by tests. No unrelated spell nerf or global control-system rewrite. |
| Persistence | `tags.cc`, save-version definitions, existing property serialization | Explicit identity and duration migration. Restoring old saves adds no active chain and does not shift old enum meanings. |
| Native and web display | Native ability/status/examine consumers, `tileweb-party.cc`, existing ability/hotbar adapters, `rltiles/` lists | Native state defines availability; console and WebTiles project it. Keep any new web code below 600 lines/file and use canonical typed contracts without TypeScript `any`. |

Names of possible new C++ files should follow repository conventions after CD0. Do not create a general relationship engine before the concrete native lifecycle and a justified extraction are known. A useful extraction preserves operations for other consumers while keeping Chain Devil flavor and progression in its adapter.

## Decisive probes

| Probe | Setup and baseline | Observable acceptance |
| --- | --- | --- |
| DCP1: actual leash | Open room with a normal melee foe; compare unheld, native constriction and new tether. Repeat at initial lengths one/two/three. | Tether permits movement inside its region and normal attacks/casting. No constriction damage, evasion penalty or immobilization leaks in. |
| DCP2: escape and AI | Hold melee/ranged/caster foes with one reachable option, then none; repeat while afraid/confused and at different speeds. | Productive actions remain available. Strain explicitly spends an action and reduces lifetime; no repeated invalid command loop. |
| DCP3: owner commitment | Move owner toward, sideways and beyond the recorded leash; use Blink, stairs, form change and downing. | No free dragging or automatic tightening. The declared events release once and preserve owner recovery. |
| DCP4: physical Reel | Compare existing harpoon and racial pull at ranges one/two/three with an open ray, ally blocker, solid wall, unsuitable water/lava, immovable foe and one-cell partial path. Include a Lash hit reduced to zero damage by AC and target movement between Lash and Reel. | Current-position preview agrees with the result; clear pulls stop adjacent and the source stays put. No second hit roll or positive-impact requirement. Consecutive legal movement, explicit dislodgement handling, no skipped blockers or collision bonus; invalid pulls preserve the hold and action. |
| DCP5: fixed anchor | Convert at 19/20/40/70 remaining aut, near doors/stairs and with an invalid floor. Move target and source separately. | Clear threshold and preview; correct fixed center and radius, remaining-life cap, no second target and no expiry refresh. |
| DCP6: cross-owner control | Two Chain Devils plus Scarlet Fetters; alternate abilities on one foe. Include native constriction/net/web cases. | Capacity and mutual respite prevent the new repeated chain/bloodcraft lock. Existing unrelated spells retain their documented behavior. |
| DCP7: clocks and persistence | Save/reload in every state; one owner changes floors while a peer stays. Include disconnection and reused monster slots after a kill. | No wrong target, extra trigger, cooldown reset, off-floor ticking or dependence on whichever hero is currently loaded. |
| DCP8: identity and anatomy | Compare Chain Devil, Human and Demonspawn against the same god/start/form/equipment checks. | Demonic restrictions agree across preview, actual join and later actions. Demonspawn mutations remain unchanged. Normal chain-devil gear and learning still work. |
| DCP9: information and controls | Two owners with different sight; hide the target; inspect and reconnect. Test hotbar, keyboard, narrow view and console. | No hidden live coordinates; stable action slots, useful unavailable reasons, one target selection for Lash and none for Reel/Pin. |

Use native tests for invariants and controlled native encounters for behavior. Mocked WebTiles data can verify layout but cannot prove targeting, movement or ownership. Record source identity, executable identity, expected result and actual result. A fixture that fails to start is a setup failure, not a failed species mechanic.

## Balance comparison

Run small matched scenarios at **XL1, XL7, XL13 and XL20**, then expand only when their results warrant it. Match background, training budget, equipment and encounter geometry across species; record what cannot be matched because of actual species rules. Preserve Human's current exploration-regeneration trait and Demonspawn's genuine traits rather than pretending both are blank stat blocks.

| Scenario | Build comparison | Decision to examine |
| --- | --- | --- |
| One melee pursuer in open space | Fighter / Hunter | Is Lash worthwhile sometimes without becoming the required first action in every fight? Can the enemy still pressure the devil? |
| Mixed melee and ranged pack | Fighter / Conjurer | Does holding one foe improve allocation of attacks or spells while leaving real danger from the others? |
| Corridor with escape route | Fighter / Warper | Can the player release and retreat clearly? Does the leash accidentally enable unlimited safe kiting? |
| High-AC, high-EV or grip-resistant foe | All four | Are hit, damage-only and immune outcomes legible, and are ordinary background actions still useful? |
| Two-owner rescue | Different backgrounds, no required support class | Does the chain buy position or time without forcing a party composition or dragging another player's hero? |
| Late-game teleporting/casting foe | Conjurer / Warper | Does the racial action remain situationally useful while respecting escape, spell and displacement counters? |

Record action count, resource spending, damage taken, hold/reel/pin choices, escapes/strains and unnecessary UI interactions. Include decisions not to use the racial ability. Avoid invented win-rate conclusions from a handful of controlled fights.

Parameter revision order: geometry/eligible actions first; then duration, recovery and hit rate; then damage; then racial HP/aptitudes if necessary. Do not compensate for an uninteresting mechanic solely with larger damage or harsher penalties.

## Delivery assets and remaining choices

Required species assets: base dungeon/doll silhouette, selection treatment, three innate action icons if all survive assessment, tether/fixed-anchor display, console glyph/message support, ability descriptions and native species/aptitude/help entries. Final background recommendations follow real previews; no class-specific chain tutorial or separate control panel is needed.

The main remaining choices are whether Reel belongs before XL7, whether Pin earns a later unlock, the exact body-grip immunity set, and whether the baseline profile needs an additional tradeoff. Chain Devil is the working name; its visual/lore identity can be refined without changing the species-first contract.

## Execution boundary

This planning pass performs only source reading, document editing and lightweight document checks. Before a heavy native build/test, asset regeneration, packaging or browser/gameplay batch, follow the current shared-host policy and gate specified in the repository's `AGENTS.md`. Preserve existing local work and bind exact inputs. No agents, builds, gameplay sessions, asset generation or deployments are launched by this document.
