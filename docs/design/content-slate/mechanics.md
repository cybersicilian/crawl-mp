# Mechanics, evidence and integration boundaries

[Slate](README.md) · [Delivery](plan.md)

Evidence below comes from local source and repository documents inspected on 21 October 2026, with Chain Devil identity checks refreshed on 22 October. This workspace contains extensive existing modifications. File presence and previous receipts do not establish a matching current executable or production release. This pass did not build or execute gameplay.

## Current source map

| Capability | Primary evidence | Useful scope | Still unproven for this slate |
| --- | --- | --- | --- |
| Species definitions and mutations | [Species authoring](../../../crawl-ref/docs/develop/species_creation.md), [Araneid comparison: Tortle](../../../crawl-ref/source/dat/species/tortle.yaml), [Oozle](../../../crawl-ref/source/dat/species/oozle.yaml) | Aptitudes, anatomy flags, XL mutation grants and recommendations | New species abilities, equipment fitting and transformed behavior |
| Background starting kits | [Background authoring](../../../crawl-ref/docs/develop/background_creation.md), [Forgewright](../../../crawl-ref/source/dat/jobs/forgewright.yaml), [Warper](../../../crawl-ref/source/dat/jobs/warper.yaml) | Equipment, skills and spell-library declarations | Memorization, actual legal combinations and exported UI for new jobs |
| Demonic species identity | [player.cc](../../../crawl-ref/source/player.cc), [ng-restr.cc](../../../crawl-ref/source/ng-restr.cc), [religion.cc](../../../crawl-ref/source/religion.cc), [Demonspawn](../../../crawl-ref/source/dat/species/demonspawn.yaml) | Existing Demonspawn checks in `undead_or_demonic`, `evil`, god admission and religious-start restrictions | Canonical demonic capability for a second species; do not copy random Demonspawn progression or conflate holiness with admission checks |
| Web triggering and immunity | [traps.cc](../../../crawl-ref/source/traps.cc), [traps.h](../../../crawl-ref/source/traps.h), [actor.cc](../../../crawl-ref/source/actor.cc) | `trigger_trap`, `trap_in_web`, `is_web_immune`; native player/monster escape behavior | Owned temporary player-created lines, expiry without destroying unrelated traps, cross-owner stacking |
| Temporary terrain | [terrain.cc](../../../crawl-ref/source/terrain.cc), [terrain.h](../../../crawl-ref/source/terrain.h) | `temp_change_terrain`, terrain markers, source IDs and `revert_terrain_change` | A generic sigil overlay. Same-type terrain changes can extend an existing duration and replace its source; that is not the proposed replacement contract |
| Forest and summon lifecycle | [spl-summoning.cc](../../../crawl-ref/source/spl-summoning.cc) | `cast_summon_forest`, plant placement restrictions, temporary trees, summoned dryad; battlesphere actor tracking | Growth states, owned bloom consumption, nonblocking buds and exit-safe new plant actors |
| Displacement | [spl-transloc.cc](../../../crawl-ref/source/spl-transloc.cc), [spl-transloc.h](../../../crawl-ref/source/spl-transloc.h) | Existing translocation consumers and habitat/target checks to inspect in P0 | A continuous mooring relationship, forced-movement trigger ordering and safe echo exchange |
| Spell metadata and dispatch | [spell-type.h](../../../crawl-ref/source/spell-type.h), [spl-cast.cc](../../../crawl-ref/source/spl-cast.cc), [ng-setup.cc](../../../crawl-ref/source/ng-setup.cc) | Spell identities, cast dispatch and starting setup | New spell metadata, learnability and once-only deferred resolution |
| Illusions and divine decoys | [evoke.cc](../../../crawl-ref/source/evoke.cc), [god-passive.cc](../../../crawl-ref/source/god-passive.cc), [mon-behv.cc](../../../crawl-ref/source/mon-behv.cc) | Phantom mirror uses a summoned illusion; Dithmenos preserves decoy duration/state when rebuilding a shadow | Targetable nonblocking decoys, generic enemy retargeting, personal-perception-safe echo movement |
| Auramancy | [Contract and receipts](../../auramancy.md), [spl-selfench.cc](../../../crawl-ref/source/spl-selfench.cc) | Existing school, cast path and source/recipient stance rules | Every new combination with held targets or prepared ground |
| Bloodcraft | [Contract](../../bloodcraft.md), [bloodcraft.cc](../../../crawl-ref/source/bloodcraft.cc) | HP reservation, bounded per-action damage and quarry binding recovery | Shared new-control interactions; new magic must not bypass that recovery |
| Multiplayer time and perception | [Current contract](../../multiplayer-mechanics.md), [party-session.cc](../../../crawl-ref/source/party-session.cc), [tileweb-party.cc](../../../crawl-ref/source/tileweb-party.cc) | Floor-scoped simulation and personal live sight; shared remembered terrain | New saved effects through split-floor, downing, disconnect and reload scenarios |
| Save identity | [species enum template](../../../crawl-ref/source/util/species-gen/species-type-header.txt), [job enum template](../../../crawl-ref/source/util/job-gen/job-type-header.txt), [tags.cc](../../../crawl-ref/source/tags.cc), [tag-version.h](../../../crawl-ref/source/tag-version.h) | Existing identity and serialization seams | New enum allocation, migration and old-save acceptance |

## Reconciliation with older documents

- On 22 October the user emphasized that backgrounds are starting templates and species should carry most diversity. B2/C1/C2/BOOK2 are retired planning IDs; [S5 Chain Devil](chain-devil.md) replaces that concept with innate abilities. These IDs never became native save identities in this task.
- The [18 October content map](../../content-map/systems.md) is a historical capability snapshot. Its K5 inventory includes automatic elemental cross-combos. The [later co-op revision](../../coop-content/README.md) explicitly removes those and background-based passives. The new slate follows the latter policy.
- [Skald](../../../crawl-ref/source/dat/jobs/skald.yaml), [Paladin](../../../crawl-ref/source/dat/jobs/paladin.yaml) and [Blood Liturgist](../../../crawl-ref/source/dat/jobs/blood-hunter.yaml) are present in current local source. Do not count them as new additions here or infer availability solely from deprecated enum guards.
- [Arachne](../../../crawl-ref/source/dat/mons/arachne.yaml) is explicitly unique. [Deprecated Mayflytaur](../../../crawl-ref/source/dat/species/deprecated-mayflytaur.yaml) uses `My`. Allocate names, abbreviations and saved IDs with the full compatibility catalogue in view.
- Vorr's draft describes blood-bearing prey restrictions. The newer bloodcraft contract explicitly allows its ordinary curses against bloodless foes. Species biology, religious rewards and spell eligibility are separate contracts.
- Recent Forest repair and existing feature test receipts are relevant evidence for their own inputs. They do not validate this slate or a newly combined binary.

## Smallest reusable boundaries

Reuse native mechanisms first. Do not implement a universal effect framework merely because this plan lists several families. Introduce a shared helper only after at least two implemented consumers demonstrate the same contract.

| Proposed boundary | First consumers | Keep outside it |
| --- | --- | --- |
| Owned floor-effect identity, lookup and expiry | One silk placement and one sigil | Silk immunity, spell schools, graphics, hostile-selection policy and damage formulas |
| Trigger resolution with bounded re-entry | Sigil crossing and later deferred impact | AI intent, arbitrary callbacks, whole-spell replay and background identity |
| Explicit source/recipient relationship | Chain Devil's innate tether and echo exchange | Species or spell access, power, range, divine conduct and each effect's break conditions |
| Bounded source damage budget | Overlapping colony buds and lattice attacks | Damage flavor, armour/resistance handling and visual effects |

Use existing terrain markers if they satisfy the exact contract; otherwise a small saved overlay may be appropriate for sigils and buds. Actor summons should retain native summon lifecycle. A source-to-target link should retain stable native actor identity. A delayed event stores a typed effect and necessary values, not an executable closure or a serialized command.

## State and lifecycle contract to implement

For any new owned effect, define: stable expedition/floor identity, stable source hero/actor identity, effect kind, tile or recipient identity, created/due/expiry action times, remaining trigger budget, stacking/replacement policy, and saved terminal/consumed state where necessary. Use canonical native types. `you` or the currently loaded hero is not a substitute for the original owner.

1. **Eligibility and payment:** validate range, current sight, terrain, recipients and replacements before payment. Cancellation spends nothing. A genuine miscast uses native cost rules; it must not commit the new effect or remove the old one.
2. **Placement:** atomically replace only the source's designated old effect. Never erase an unrelated map trap, another caster's effect or a persistent feature while cleaning up a temporary overlay.
3. **Time:** attach to the actual floor action clock. A second hero's action must not double-tick the same elapsed interval. Paused floors do not age through wall time or unrelated-floor movement.
4. **Resolution:** one trigger commits once. Forced movement may traverse a tile trigger, but chained displacements need a bounded event path to prevent recursion. State is consumed before issuing secondary effects.
5. **Visibility:** project only personally perceived live effects. Remembered tiles may retain appropriate stale memory; they must not reveal hidden actors, active AI choices or remote expirations as live information.
6. **Source loss:** physical silk can remain until its finite expiry after departure/death. First-version sigils, colonies, growth summons, maintained tethers, decoys and pending temporal effects cancel on owner departure or downing/death. Body-changing forms also suppress or end body-dependent abilities as specified by their mutation contract. Disconnection alone is not departure or death; apply normal source lifecycle.
7. **Persistence:** save and restore owners, deadlines, targets and consumption exactly. Reload cannot re-arm a spent sigil, mature a colony twice, duplicate a summon or replay deferred damage. A target that dies and whose slot is reused is not the original target.
8. **Terrain and movement:** preserve stair/door access, normal habitat and level connectivity. No echo exchange into lethal or occupied terrain. Cleanup must leave the underlying floor in its current valid state, not blindly restore an obsolete snapshot.
9. **Damage and conduct:** use native attribution, resistance, AC, death credit and religion hooks. Damage redirected by Sanctuary, reflected bolts and controlled summons need provenance tests, not origin guesses.
10. **UI:** one activation and the necessary target selection. Preview replacement, collateral and deadlines. Console glyphs/text and native examine descriptions ship alongside WebTiles artwork. No client-side reimplementation of eligibility.

Source-loss defaults may change during experiments, but a change must update the roster, spell catalogue and tests together. No generic cleanup helper should silently impose one lifecycle on every content family.

## Highest-value experiments

| Probe | Comparison and observable acceptance | What failure means |
| --- | --- | --- |
| Q1 Owned web expiry | Native web baseline; new owned web; unrelated trap on another tile. Compare ordinary and web-immune actors. New web expires once without changing the other trap, including after reload. | Ownership/cleanup is not ready. It does not invalidate native webs. |
| Q2 Sigil movement ordering | Walking entrant, forced entrant, teleport arrival and stationary occupant. Only the declared trigger paths fire, once; displacement cycles terminate. | Trigger policy or dispatch is incomplete; do not add more sigil types. |
| Q3 Two-owner control | Compare single caster with two casters, mixing silk, new binds and Scarlet Fetters. Test a susceptible target and the closest immune/resistant control. No alternating casts create permanent immobility. | Revisit control/recovery semantics, not merely damage numbers. |
| Q4 Growth and exit | Compare ordinary summon with thornling in a corridor, beside stairs and on open floor. Growth, destruction and bloom leave an escape and consume no other owner's plant. | Actor placement/cap or connectivity rules need repair. |
| Q5 Decoy target selection | Existing divine decoy or phantom-mirror behavior as characterized control; new decoy with melee, ranged, see-invisible and immune candidates. Record actual retargeting and obstruction. | Generic illusion/echo capability remains unproven; hold Echoborn and Illusionist. |
| Q6 Floor-clock deferred hit | Same-floor pair versus split floors; move target, kill target, disconnect owner, reload before due time. One due event resolves against declared eligibility, with no hidden information leak. | Temporal execution remains unproven; no Chronomancer release. |
| Q7 Facet provenance | Enemy hit versus ally, self, controlled summon and redirected/reflected damage. Charge only from eligible original hostility, once, after original damage. | Glassborn can be farmed or misattributes effects; hold species. |
| Q8 Innate chain across starts | Same Chain Devil anatomy with Fighter, Hunter, Conjurer and Warper; matched Human/Demonspawn controls. Include religion, forms, no school investment, tether-aware AI and multi-owner control. | Species identity or gameplay diversity is not established. A working new spell or one successful melee build is insufficient. |

Each experiment needs exact source inputs, a matching executable, expected and actual results, and separate setup-failure reporting. Native/build/browser phases must use the current shared-host policy and reservation gate. This planning pass needs no heavy reservation.
