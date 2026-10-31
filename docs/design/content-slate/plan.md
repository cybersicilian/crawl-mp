# Delivery plan

[Slate](README.md) · [Roster](roster.md) · [Spells](spells.md) · [World](world.md) · [Mechanics](mechanics.md)

Status: planning authored, 21 October 2026; revised 22 October for Chain Devil and the species-first direction. No implementation phase has started in this pass. The request authorizes planning; this document records the proposed sequence rather than treating every candidate as approved code work. Phases are ordered by evidence and dependencies, not speculative calendar estimates.

## Work packages

| Package | Deliverable | Dependencies | Completion evidence |
| --- | --- | --- | --- |
| P0 Native contract audit | Confirm effect placement, action clocks, identity, source loss, anatomy slots, control recovery and enum/abbreviation allocation. Reconcile the exact current source with the binary to be used. | This design | Written contracts tied to actual consumers; remaining unsupported behavior explicit. Current source inventory is a start, not completion. |
| PC1 Chain Devil experiment | Audit demonic eligibility and prototype one innate Chain Lash/tether using the proposed owned actor relationship; run Q8 and relevant Q3 cases. | P0 demonic and actor-relationship contracts | The same anatomy works without magic-school investment across existing backgrounds; actual AI, hit, movement, cooldown and source-loss evidence. |
| PC2 Chain Devil playable species | Complete S5 identity, starting compatibility, art, descriptions, native ability access, forms, saves and conditional Reel/Pin progression. | PC1 accepted | Fighter, Hunter, Conjurer and Warper comparisons; god/start restrictions; two-owner native gameplay; no exclusive new class or spell dependency. |
| P1 Silk and sigil experiments | One temporary owned web, one R1 sigil, minimal native inspect/target output and Q1/Q2 fixtures. | P0 | Focused native ownership, timing, immunity, replacement, reload and trigger tests; exact executable/source binding. |
| P2 Silk/sigil roster | Complete S1 Araneid and B1 Runebinder; R1–R3; BOOK1; canonical definitions and generated catalogues. | P1 | Legal/illegal native character previews, D:1 usability, spell access outside the background, anatomy/form behavior and saves. |
| P3 Silk/sigil world and presentation | V1/V2 layouts with existing actors, species portrait/doll, three spell icons, silk/sigil states, descriptions, console display and direct hotbar actions. | P2; art preparation can precede native build | Native generation/connectivity; ordinary solo and two-owner encounters; no extra confirmation loop; narrow and normal WebTiles inspection. |
| P4 Encounter-controller extension | E1/E2 only where distinct behavior is justified; Q3 with Chain Devil, silk, sigils and existing bloodcraft. | P3 and relevant PC1 evidence | Forced movement, break/escape/immunity and mixed-party recovery tests; no indefinite cross-source control. Former Chainwarden job/spells/book are retired. |
| P5 Living growth | S2, B3, D1–D3, BOOK3, E3, V3/V4. Build one bud/plant first, then complete the family. | P3 lifecycle evidence; Q4 | Plant ownership, mature/consume lifecycle, ordinary summon caps, conduct, connectivity and full solo/co-op encounter evidence. |
| P6 Facet and illusion experiments | Fire-only S3 facet, generic I2 decoy and S4 exchange candidate. Run Q5/Q7 before completing characters. | P3; current native damage/AI audits | Stable provenance, no charge farming loop, characterized AI targeting, legal exchange and personal perception. |
| P7 Reflections package | Finish S3/S4, B4, I1–I3, BOOK4, E4 and V5. Remove I3 if it duplicates I2 scaling. | P6 accepted | Mixed old/new builds, divine-decoy interaction, source loss, save/resume and actual tactical value. |
| P8 Delayed magic | Q6 first; then B5, T1–T3, BOOK5 and V6. Remove T3 if it adds no meaningful choice. | P3 lifecycle evidence; stable action-clock contract | Once-only delayed events across floors/reloads, stable target identity, collateral attribution and playable counterplay. |
| P9 Item and campaign adapters | ITEM1–3 selectively, normal loot distribution, evoker compatibility. Later separate campaign recipes/assets when custody systems exist. | Accepted underlying effect; Pakellas/Oozle audits; campaign work has its own dependencies | Native items work independently of class; recharge and assimilation contracts; no duplicate custody or unsupported campaign claim. |

Chain Devil is now the first proposed playable focus; it does not wait on Araneid or Runebinder. Later experiments may reuse accepted ownership/expiry contracts where they match, but actor tethers do not prove floor overlays. P5 and P6 are logically independent after their prerequisites, but that is not a request to launch parallel agents or concurrent local builds. The host permits one heavy phase at a time, subject to its current policy.

The [Chain Devil plan](chain-devil-plan.md) expands PC1/PC2 into CD0–CD7 and nine decisive probes. Its [mechanics contract](chain-devil-mechanics.md) records the v0.2 timing, native-constriction distinction, physical Reel, enemy strain response and mutual bloodcraft recovery proposal. Those detailed draft contracts control the species experiment when this older table is less specific.

## First playable package boundary

First candidate contents: **one Chain Devil species with its innate chain kit, usable across existing starting backgrounds**. Assess the opening Lash/tether before adding Reel and Pin. Use existing monsters, items and controlled encounter geometry. The package includes native gameplay, demonic eligibility, anatomy/forms, saves, art and console/WebTiles presentation; an entry in a selection menu alone is incomplete.

The earlier silk/sigil package remains the next distinct candidate: Araneid, Runebinder, three spells, one fixed book and two layouts. Growth, illusions, delayed damage, signature evokers, campaign recipes and new branches remain later. B2 Chainwarden, C1/C2 and BOOK2 are retired design concepts, not deferred implementation requirements.

## Acceptance matrix

| Area | Required cases | Acceptance |
| --- | --- | --- |
| Identity and creation | Existing save; new species/job; changed selection order; restricted deity/body/learning combination | IDs remain stable; native restrictions and actual starting kit match preview and exported catalogue. |
| Baseline builds | Chain Devil Fighter, Hunter, Conjurer and Warper with matched Human/Demonspawn controls; later Araneid Fighter and Human/Araneid Runebinder | The species changes decisions across starting templates without requiring a racial skill build. Record seed, equipment, skills, actions, damage and resource use. |
| D:1 viability | Missed Lash, recovery active, low MP, failed cast, control-immune foe, no favourable choke | Ordinary background actions remain viable and innate chains require no school investment or later spell. |
| Source lifecycle | Owner alive/downed/dead, departing, disconnected; peer remains | Each effect follows its documented physical or maintained-source rule. No remote owner borrowing from `you`. |
| Trigger and stacking | Two owners; repeated casts; oldest replacement; own/other effect on same tile; forced movement cycle | Declared caps and once-only handling; no unintended overwrite, infinite displacement or permanent bind. |
| Terrain and generation | Corridor, doors, stairs, water edge, permanent features, before/during/after expiry | Legal movement and connected exits remain. Temporary cleanup never restores the wrong terrain. |
| Perception | Hidden caster/foe, opaque/transparent walls, another floor, spectator/reconnect | New UI carries only the recipient's allowed live information. Shared memory is not shared sight. |
| Persistence | Save before trigger, after trigger, just before expiry; reload with changed active hero | No duplicate triggers, replenished lifetimes, wrong owners or stale actor-slot targeting. |
| Existing systems | Forms, species anatomy, native conduct, Auramancy redirection, bloodcraft binding, relevant gods | Actual native interactions agree with descriptions. Unsupported integrations block the affected feature. |
| Interaction cost | Keyboard, pointer, hotbar, replacement at cap, cancel, invalid target, narrow viewport, console | Normal action uses activation plus necessary targeting. Clear previews, readable states and existing consequential prompts. |
| Distribution | Random/fixed book eligibility, shop generation, ordinary loot, optional encounter placement | Old builds can find the new tools; no required branch or blanket loot-pool inflation. |

Combat comparisons are small recorded scenarios first, followed by ordinary early/mid/late run samples. A few controlled wins are not a measured win-rate or balance claim. If a package trivializes its intended threat, revise its geometry, lifetime, cost or capability before simply inflating enemy numbers.

## Art and writing work

- S1–S5 each need a readable native-scale base silhouette, player doll/selection treatment and any anatomy-specific equipment behavior. Chain Devil's attached chains need clear source/target display. Follow the existing asset pipeline and scale conventions; do not assume a generated portrait is a usable dungeon sprite.
- Twelve candidate spells and the separate Chain Devil innate actions need distinct readable icons, native descriptions, targeting text and failure/expiry messages. Conditional spell removals reduce this count; innate powers do not become spells for catalogue convenience.
- Floor effects need owner-legible glyph/shape distinctions, armed/mature/expiring states and a colour-independent examine path. Preserve readability beneath actors, clouds and existing aura effects.
- The six encounter designs need `.des` authoring, depth/weight rules and generation checks. The first two use existing enemy art; later E1–E4 require art only if new records are retained.
- All player-facing text should explain meaningful choices, costs and limitations. Internal implementation names and evidence statuses belong in development records, not gameplay descriptions.

## Open decisions with working defaults

| Decision | Working default | Evidence that should change it |
| --- | --- | --- |
| Chain Devil body and access | Living humanoid devil; ordinary equipment; XL-based innate powers and short recovery, no school dependency | Native anatomy/religion audit or cross-background play exposes contradictions; full resistances and aptitudes remain open |
| Chain Devil later actions | Add Reel/Pin only after the opening Lash is useful on its own | The follow-ups merely add mandatory clicks or reproduce existing actions without a new choice |
| Araneid friendly silk | Physical web rules apply to heroes; immunity is individual | Routine party obstruction outweighs tactical choice; assess an explicit pass-through mechanic rather than silently granting immunity |
| Preparation burden | Short lifetimes, small caps, paid actions; no harvestable resources | Recorded play repeatedly rewards refresh-before-every-door or empty-room waiting |
| Cross-owner control recovery | Explicit target recovery for the new bind family, assessed alongside Scarlet Fetters | A global rule would unexpectedly weaken old control; redesign the new effect before broadening scope |
| Species numerical profiles | Distinct core mechanic first; conservative HP/MP and equipment assumptions | Baseline encounters reveal free advantages or an unusable opening |
| Illusion targeting/occupancy | Hold full design until Q5; no guaranteed universal aggro | Native AI cannot deliver readable target choices without excessive special cases |
| Deferred casts | Typed scheduled effects; pay once; exact source/target rules | Action-clock or save evidence cannot preserve once-only resolution |
| Book and encounter frequency | Selective additions within existing budgets | New books crowd out old builds or new vaults lengthen every run |
| Campaign access | Ordinary in-run availability; optional later archiving | A separate user decision changes campaign progression; do not infer that here |

These defaults are proposed design choices, not questions blocking this planning pass. Prototype numbers can change without a new approval ritual; material scope changes should be made visible in the plan.

## Resource and release discipline

Before any heavy local compile, native/broad test, asset regeneration, packaging or browser/gameplay batch, read `$HOME/Documents/Codex/work/host-heavy/policy.json` if present. Follow its current gate script, hash, fixed state directory, reservations and dispatch priorities. Prepare exact source/resource bindings while waiting. Do not bypass or clear another owner's reservation.

Preserve existing workspace changes. Keep new TypeScript/web code below 600 lines per file, prohibit TypeScript `any`, reuse canonical types, and derive client presentations from native state. Add meaningful contract and boundary tests; avoid broad unrelated refactors or tests that only mirror implementation.

Record acceptance separately as: authored, statically checked, compiled, focused native verified, genuine co-op verified, packaged and deployed. Exact source and output identities accompany each receipt. Deployment requires its own task scope and concrete reviewed artifact; this plan does not claim or perform a release.
