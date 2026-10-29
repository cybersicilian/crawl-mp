# Vorr engine contracts and playtest cases

The reusable mechanisms are a finite resource deposited in cells, source-attributed combat rewards, and capped recovery over native game time. Vorr supplies the blood eligibility, piety rules, rites, and visual presentation. The resource contract should remain independent of religion names and the WebTiles client.

[Design](README.md) · [Art specification](art-direction.md) · [Visual review](index.html)

## Inspected source boundaries

| Existing mechanism | Local source | Consequence for Vorr |
| --- | --- | --- |
| Actor blood eligibility | [`monster::has_blood`](../../../crawl-ref/source/monster.cc), [`mons_has_blood`](../../../crawl-ref/source/mon-util.cc), [`player::has_blood`](../../../crawl-ref/source/player.cc) | Ask the actor at the time of the event. Preserve temporary conditions such as petrification. Do not invent a list of excluded species in a UI module. |
| Attack blood scheduling | [`attack::handle_phase_damaged`](../../../crawl-ref/source/attack.cc) | Existing blood emission already checks blood and excludes summons. Reuse the authoritative event and separate cosmetic emission from finite fuel accounting. |
| Spray and cosmetic flag | [`bloodspatter.cc`](../../../crawl-ref/source/bloodspatter.cc), [`bloodspatter.h`](../../../crawl-ref/source/bloodspatter.h) | Existing `FPROP_BLOODY` does not encode quantity, source, ownership, or expiry. It cannot itself be the fuel ledger. Current square rules exclude water, lava, sanctuary, and some altars. |
| Generic lifesteal eligibility | [`actor_can_drain_life_from`](../../../crawl-ref/source/mon-util.cc) | The inspected helper excludes firewood and player feeding on summons but does not require blood. Reuse it only alongside Vorr's explicit blood and hostile-reward checks. |
| Damage and healing | [`attack.cc`](../../../crawl-ref/source/attack.cc), [`melee-attack.cc`](../../../crawl-ref/source/melee-attack.cc) | Use actual HP removed and the native healing API. Capture source identity before death processing invalidates the target. |
| Kill rewards | [`_player_on_kill_effects`](../../../crawl-ref/source/mon-death.cc) | Reuse reward eligibility and source attribution, while keeping new bounded death bursts separate from ordinary kill-healing passives. |
| Native god integration | [`god-type.h`](../../../crawl-ref/source/god-type.h), [`religion.cc`](../../../crawl-ref/source/religion.cc), [`god-passive.h`](../../../crawl-ref/source/god-passive.h), [`ability.cc`](../../../crawl-ref/source/ability.cc) | Implement identity, devotion breakpoints, passive queries, ability cost/payment, and save compatibility in the native engine. |
| Tile conventions | [`tiles_creation.txt`](../../../crawl-ref/docs/develop/tiles_creation.txt), [`dc-feat.txt`](../../../crawl-ref/source/rltiles/dc-feat.txt), [`dc-invocations.txt`](../../../crawl-ref/source/rltiles/dc-invocations.txt) | Foreground features are normally 32×32 with alpha. Invocation content should preserve the native border. Large masters must be cleaned up before atlas registration. |
| Co-op and floor time | [`party-session.cc`](../../../crawl-ref/source/party-session.cc), [`level-time.cc`](../../../crawl-ref/source/level-time.cc) | Bind fuel and expiry to a floor, source slot, and native time. Use one reward event per actual kill, not one per observing client. |
| Faith plinth and native favor | [`party-faith.js`](../../../crawl-ref/source/webserver/game_data/static/party-faith.js), [`party-faith.css`](../../../crawl-ref/source/webserver/game_data/static/styles/party-faith.css), [`party-status-model.js`](../../../crawl-ref/source/webserver/game_data/static/party-status-model.js) | Extend the existing shrine theme, atmosphere, and altar setting. Retain the 60×68 frame, server-supplied favor, penance, unknown state, and existing inspection action. |

These are source integration points, not a claim that the proposed behavior is implemented or tested.

## Data and attribution

Keep a small native deposit record with a coordinate, units, creation and expiry clock, stable source/entitlement identity, and a resource kind. Multiple expiry lots may occupy one cell. Display density is derived from the ledger; it never creates charges.

An eligible enemy has a fixed lifetime release budget, whether its half-HP release happened, and the source event identities already processed. Repeated damage, healing, transformations, duplicate kill notifications, and reconnect cannot reset that budget. Distinguish blood that exists physically from blood eligible for divine fuel.

Combat attribution needs a stable acting worshipper, direct/ally/periodic source category, actual HP removed, blood eligibility at the event, and a root action identity. The root identity bounds the secondary explosion phase. Healing recovery also needs a time-window identity shared across all damage sources and effects for that worshipper.

Reuse canonical actor, coordinate, time, and combat types. Do not add a parallel TypeScript combat model. General ledger code takes explicit eligibility and allocation policies; deity-specific predicates and animation choices remain thin adapters. Extract a shared module only as far as the resource and attribution requirements demonstrate a need.

## Payment and ordering

1. Native targeting establishes visibility, legal recipient, same-floor deposits, and available units.
2. The preview derives consumed cells and effects from the same selection logic used by execution.
3. Confirm any native friendly-fire warning. No extra confirmation is introduced for ordinary use.
4. Revalidate and debit blood and piety once, then resolve the action.
5. Resolve actual damage and capped healing, then qualifying deaths and remaining blood budgets.
6. Resolve at most one secondary death-burst phase. Its deaths deposit blood without creating further damaging bursts.
7. Publish the resulting authoritative state and advance expiry using native floor time.

Cancellation or invalid targeting costs nothing. Save/reload cannot restore payment, replay a burst, prolong a deposit, or duplicate fractional healing credits. Fractional credits and recovery windows must follow the native save contract rather than depending on an open browser tab.

Red Passage requires two distinct endpoint deposits and an atomic debit of one unit at each. Reuse native relocation restrictions, destination legality, visibility, and ally warnings for the arrival impact. Only move after revalidation succeeds; failure must not strand the player, spend one endpoint, or consume an action. Its preview and executor must select the same two lots.

## Co-op rule for the first version

A qualifying hostile killed by a party with Vorr worshippers creates one set of deposits. Attribution and the lifetime budget are resolved once. Same-floor Vorr worshippers share those deposits; a unit consumed by one is no longer available to another. Allied contributions can qualify a party kill, but allied attacks never become lifesteal for a worshipper who did not deal the damage.

Communion regeneration and lifesteal are personal. They do not inherit the fork's generic allied heal-on-kill sharing automatically. God-politics effects require an explicit later design, rather than accidental activation through Makhleb's reward path.

Deposits outside a worshipper's native perception cannot fund their ability. Spectators and map memory expose no live hidden fuel. Two simultaneous ability requests must revalidate payment against the same native authority. A disconnect cannot freeze an active floor's resource, create a second payer, or transfer entitlement through client state.

## Discriminating playtests

| Case | Required observation | Design question |
| --- | --- | --- |
| Dry opening against three ordinary blood-bearing enemies | Wounding or a first kill produces fuel; Rupture can then be used. | Does the economy start without a preparation command? |
| A durable isolated blood-bearing enemy | The half-HP release happens once; repeated healing does not farm it. | Is the god usable before the first kill without making one enemy infinite fuel? |
| Weak enemy beside a dangerous foe | A forceful kill creates a useful larger burst and a legible new field. | Does finish location alter the next decision? |
| A wholly bloodless encounter | No bleeding, new fuel, lifesteal, Rupture target, or bloody death burst. | Does the intended weakness remain honest? |
| A bloodless target beside existing fuel | Great Letting can strike it once; it stays dry and returns nothing. | Are external blood attacks distinct from biological blood extraction? |
| Player standing on fresh, fading, then spent blood | Regeneration follows actual potency and stops when the last unit is spent. | Is spending a sustaining position a meaningful cost? |
| Area spell, rapid attacks, and several periodic effects | Healing uses actual damage and one elapsed-time cap. | Can speed or multi-hit sources bypass the recovery limit? |
| An enemy killed by a death burst | It deposits remaining blood but triggers no further damaging burst. | Are large cascades bounded and understandable? |
| Two adjacent selected deposits beside one target | Great Letting strikes the target once. | Is its geometry useful without overlap multiplication? |
| Red Passage from a one-unit pool to another | Both endpoint units disappear, movement succeeds, and regeneration does not persist on an emptied landing tile. | Is mobility paid from the actual path endpoints? |
| Red Passage to an occupied, expired, hidden, or relocation-blocked endpoint | No movement, partial debit, or spent action. | Do native movement restrictions and cancellation remain sound? |
| Red Passage arrival beside bloodless and blood-bearing actors | One arrival impact per actor; only blood-bearing victims can return lifesteal or blood. | Does movement preserve the god's exclusions and bounded burst phase? |
| Old cosmetic blood or a fountain | No fuel is available. | Can the player distinguish appearance from usable supply? |
| Polymorph and petrification | Current blood eligibility is respected; release budgets persist. | Can forms create blood or rewards the source actor should not have? |
| Native healing restrictions | Communion respects the native refusal to heal. | Does the new god preserve existing health contracts? |
| Water, lava, narrow corridors, and sanctuary | Legal cells, available supply, and previews match execution. | Does native terrain make the kit too brittle in whole branches? |
| Save and resume just before expiry | The remaining potency and payment state survive correctly. | Are lifetime and single-use properties durable? |
| Two Vorr worshippers, then a spectator | One supply, independent personal healing, correct perception. | Can the party cooperate without duplicate rewards or hidden information? |

The first implementation gate is a native controlled combat scene for the resource loop and exclusions. The later acceptance gate is ordinary play through mixed encounters and a bloodless branch, with native art and WebTiles feedback. Source review, concept rendering, and an illustrative review page cannot replace either gate.

The plinth's local SVG study can establish dimensions and intended visual states. It cannot establish integration with the native deity catalogue, game save state, live favor updates, or final altar pixels. Keep its declarative theme reusable when adapting the existing renderer; do not fork the entire shrine renderer or infer new gameplay rewards from its decorative rank layers.
