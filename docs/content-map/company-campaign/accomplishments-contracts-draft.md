> Superseded design exploration. The user rejected accomplishment-led progression and requested persistent assets, equipment and company capabilities that materially change gameplay. See the [current design](README.md). This file preserves prior reasoning only.

# Campaign rules, reusable contracts and probes

[Campaign design](README.md) · [Charter catalogue](charters.md) · [Original evidence](../evidence.md)

This document separates source-backed building blocks from proposed policy and missing mechanisms. It is a design contract, not a claim that the current engine/server implements campaign progression.

## Baseline refreshed for this design

The following local sources were read during this deepening pass:

| Existing capability | Primary source | What it permits us to compose / limit |
| --- | --- | --- |
| Hero/game/item IDs and known-state publication | [game-record.cc](../../../crawl-ref/source/game-record.cc), [save library](../../save-library.md) | Link histories to stable entities and saves; a record UUID is not a grant or transferable item |
| Per-hero save/end observations | [stats-json.cc](../../../crawl-ref/source/stats-json.cc) | Derive supported rune/terminal facts; the snapshot account field reads `CRAWL_OWNER_ID`, which alone does not prove each human controller |
| Native shared run state | `sync_shared_state_from_active` in [party.cc](../../../crawl-ref/source/party.cc) | Runes, gold, spell library and other run facts are synchronized inside a native party; this is not the proposed cross-run company state |
| XP distribution | `_give_player_experience` in [mon-death.cc](../../../crawl-ref/source/mon-death.cc) | Other non-downed heroes receive the awarded XP without a floor check in that loop; proximity/last-hit assumptions cannot define campaign participation |
| Owned human actions and launch roster | [party_roster.py](../../../crawl-ref/source/webserver/webtiles/party_roster.py), [multiplayer mechanics](../../multiplayer-mechanics.md) | Authenticated occupied seats become human participants; solo companions and human controllers are different dimensions |
| Personal vision and independent floor clocks | [multiplayer mechanics](../../multiplayer-mechanics.md), [party-session.cc](../../../crawl-ref/source/party-session.cc) | Shared remembered terrain, personal live perception, floor-local simulation; no implied global raid timer |
| Save/resume and terminal cleanup | [save-library.md](../../save-library.md) | A paused run is resumable; native death/escape/quit are terminal; deleting a private save is distinct from deleting public history |

These are source-backed observations. No new gameplay, co-op session, campaign, reward delivery or production verification was performed. The existing design documents supply the broader inventory; the search for campaign/achievement behavior was scoped to the inspected native record and WebTiles library/Chronicle/control/analysis modules. It is not proof that no similarly named experiment exists elsewhere.

## Define the scopes before rewards

| State / fact | Scope and authority | Inherits into another run? |
| --- | --- | --- |
| XP, HP, piety, inventory and runes | Native hero/run/save | No, under the baseline design |
| Operation state | Native objective instance inside one run | Its sealed result can inform the company; live entities do not transfer |
| Personal achievement | Account plus specific evidence/definition | Recognition persists; native power does not automatically change |
| Joint distinction | Declared objective and multiple eligible authenticated controllers | Recognition persists; not established by having multiple native bodies |
| Discovery | One company's durable set of facts | Makes operation/configuration options available |
| Campaign asset | One campaign, created by a specific result and assigned once by policy | Changes an eligible future chapter's manifest |
| Complication | One open chapter; bounded and named | Can alter one future encounter/configuration until resolved |
| Campaign consequence | Versioned campaign transition | Applies to future launches; never rewrites an active expedition |

The company's discovery set is monotonic. Campaign assets and chapter choices are not a generic currency. A failed campaign may retain discoveries while its particular uncommitted asset or chapter state follows the declared failure policy.

## Charter definition

Reuse the native/reference identifiers and existing party/save types where compatible. New records should reference them rather than copy parallel species, rune, owner or controller definitions. No new TypeScript or runtime code is proposed in this documentation pass.

A minimal declarative charter definition needs these fields:

| Contract | Minimum meaning |
| --- | --- |
| Definition identity / revision | Stable charter ID, content/rules revision and display name |
| Goal scope | Same operation, same expedition, across distinct expeditions, or campaign chapter; never inferred from the label |
| Eligibility | Compatible branches/depths, generated-branch adapter, hero/controller policy and ordinary/practice/wizard exclusions |
| Encounter package | Existing vault/tag selection plus typed operation configuration; one main package and any bounded opening encounter |
| Activation / commitment | When the operation exists, when its declared risk begins, and which actions are consequential |
| Success / failure | Exact native facts; irreversible objective failure, declared return, terminal result, or an explicit combination |
| Completion seal | Objective/run IDs, definition revision, durable native commit identity and recoverable delivery state |
| Recipient policy | Personal, joint, company and campaign recipients; membership/controller eligibility window |
| Consequences | A discovery, distinction or valid campaign transition with a specific target and lifetime |
| Exit / recovery | Bypass, abandoned attempt, disconnect, restart, rollback/migration and missing evidence rules |

A fixed launch manifest pins the campaign/chapter generation, selected asset commitment, operation variant, branch adapter, roster policy, rules/content revision, seed policy and outcome definition. A seed alone is not a manifest. An active save resumes that manifest even if the Hall has advanced.

## Mid-run completion and durability

Proposed lifecycle:

1. **Offered:** the compatible operation exists in the generated run. Seeing it does not create a failure liability.
2. **Committed:** a declared action begins the operation. Existing consequential-entry prompts can explain the commitment; no extra modal is needed for ordinary reversible viewing.
3. **Resolved:** the native engine determines success or irreversible loss. A snapshot or client message does not invent the outcome.
4. **Sealed:** the result and its native state are durably committed. The completion delivery can be replayed safely after a crash/reconnect.
5. **Credited:** the server records completion for the eligible recipients exactly once, derives discoveries/distinctions and attempts an eligible chapter transition.
6. **Consequence chosen:** when a branch/asset choice is required, an authorized steward commits one choice. Future manifests use it; other active runs stay fixed.

Step 4 is an **unproven new native/server boundary**. Existing snapshots, log offsets and stable IDs do not by themselves establish an atomic completion seal. Design its persistence and redelivery explicitly before awarding progression from nonterminal events. A crash between native resolution and server acknowledgement must neither lose a saved success nor let an unsaved rollback create a second completion.

There is no “claim reward” button when evidence and recipient policy are settled. An unresolved delivery shows pending progress with a recovery path. Missing evidence is unknown, not failure. Later terminal death cannot revoke an already sealed earlier operation; it can still fail a separate declared escape objective.

## Who gets credit

Credit is an outcome policy, not a damage leaderboard. The baseline should prefer explainable participation over attempts to infer every player's causal importance.

| Situation | Proposed credit |
| --- | --- |
| Enrolled participant acts within the declared contested operation scope | Receives the operation's team completion on success; no last-hit or DPS requirement |
| Holding an authored position, interrupting, covering a route or using a valid support action | Can establish participation through explicit native operation events; contribution need not be damage |
| Solo controller using companions | Receives solo/company development; not a multiple-controller joint distinction |
| Late join | Eligible for a future operation, or a still-open participation window stated in the manifest; never retroactive credit for an already resolved objective |
| Downed after participating | Retains earned participation; being downed is not required for a Recovery charter |
| Brief disconnect after participating | Does not erase participation; does not supply new actions or automatic success |
| Connected elsewhere, parked off-floor or merely receiving shared XP | No operation participation is inferred; an explicitly recorded earlier remote contribution can count only if that charter allows it |
| Spectator | Can observe under existing visibility rules; no gameplay contribution credit |
| Company member offline during the run | Benefits from the company's shared discovery; receives no fictitious personal completion |
| Guest enrolled in an expedition attached to a company | Receives valid personal/joint recognition; the attached company receives the charter consequence; no surprise company membership |

An ordinary team completion can use a broad participation window: enrolled before resolution, in the eligible operation scope during its contested phase, with an owned native action. This may count movement and covering rather than demanding a named special action. A stricter **joint maneuver** distinction requires explicit events showing the authored cooperating actions from multiple controllers. Keep these predicates distinct instead of quietly applying a hidden activity score to all rewards.

Do not require constant movement or punish a tactically appropriate wait. Authored holding/covering can produce an explicit participation event. Exclude routine automation outside the contested scope, overhealing and repeat toggles from special contribution distinctions. Missing event fields block only the unsupported distinction, not every native rune/escape fact.

Controller/account mapping comes from the authenticated reservation path and native acknowledgements, with intervals covering joins/reconnects. `CRAWL_OWNER_ID`, roster slot number, hero count and host account are not interchangeable. Multiple authenticated controllers are observable; distinct physical humans are not proven merely by two accounts.

## Fair party variation and recovery

Lock the operation variant and reward/encounter budget at its declared activation using the manifest policy. Record **hero count** and **authenticated controller count** separately. Downing, disconnection, switching browser tabs or briefly adding/removing a participant cannot redraw the operation or mint a larger reward.

Late joining and a smaller fallback need explicit authored rules. A fallback may preserve ordinary objective progress while the joint distinction remains unmet; it must not silently downgrade already generated native threats or transfer another player's character control.

Campaign logic also does not solve the existing native scheduling problem of a disconnected participant whose action is required on a threatened floor. Reservations and native reconnect/recovery policy still apply. Other floors may progress under their existing clocks; the campaign must not pretend that a scripted fallback grants independent control of the missing hero.

## Concurrency and membership

A company can have independent charters running in parallel. For a campaign chapter, several expeditions may have launched against the same **chapter generation** and fixed commitment.

- The first valid success closes that generation and creates its declared transition/asset once.
- A failure creates at most one complication while that generation remains open. A late failure from an old attempt cannot reverse a closed successful chapter.
- Another successful expedition retains personal/team completion and provenance, and may establish a previously missing company discovery. It does not duplicate the chapter asset or apply the next transition twice.
- Recovery attempts can fulfill the same open chapter goal under their declared adapter. Changing a specific fixed asset commitment creates a new explicit campaign decision/generation; it does not mutate running manifests.
- Delayed results carry their actual campaign/chapter and definition identities. They are never reinterpreted as the current chapter merely because the company's Hall moved on.

An expedition attaches to one company/campaign context. Leaving or being removed from a company does not delete personal history or secretly reassign an in-flight result to a different company. Freeze the declared recipient context at commitment; apply the departure/archival policy transparently. An archived campaign can retain late result history without reopening or advancing itself.

Only an authorized steward can allocate a persistent campaign asset, change chapter commitments or archive/reset the campaign. Native save ownership and hero reservations remain with their existing owners. No campaign permission grants access to a private save or control of another hero. Launch/ready shows consequential rules before consent; it does not invite a vote on every tactical action.

## Clocks, floors and world response

Use native floor time for a same-floor tactical objective. Use durable action/completion state for the first planar multi-wing operation. Wall-clock attendance and actions on another floor do not automatically advance a native objective's threats.

Cross-floor simultaneous countdowns, off-floor entity effects and arbitrary objective relocation are deferred. Existing floor packages are not proof that a new listener/relationship survives unload/reload. Every chosen realm needs its own tested lifecycle boundary, particularly Pan's generated realms.

Campaign world response is scoped to authored future encounters/configurations. It is not a simulation of a global persistent dungeon. This keeps a company consequence observable, bounded, reversible through a declared campaign path, and isolated from unrelated solo runs and other companies.

## Failure policy table

| Event | Company/campaign result |
| --- | --- |
| Bypass before commitment | No failure; ordinary run proceeds |
| Save / lobby / reconnect | Same attempt and manifest; no failure |
| Crash or uncertain delivery | Pending/recoverable; never assumed dead or completed |
| Irreversible objective loss after commitment | One declared failed attempt; at most one chapter complication |
| Native terminal end before an uncompleted committed goal | Resolve according to that charter's declared failure rule |
| Hero dies after an earlier sealed success | Earlier fact remains; separate escape goal can fail |
| Delete private save | Does not revoke sealed public history or create success; explicit abandonment policy is distinct from native death |
| Repeat charter | Revisit/play/compare is allowed; duplicate discovery and chapter asset are not awarded |
| Wizard / disposable QA / incompatible practice mode | Separate diagnostic/practice record; no ordinary campaign completion |
| Terminal result arrives after chapter/campaign closed | Keep accurate history/eligible personal completion; do not reapply the transition |

Failure never grants a general resource, permanent starting power or an exclusive profitable content unlock. A complication cannot compound without bound. Recovery remains a valid option with ordinary fresh heroes, and archiving/restarting remains possible under the stated ownership policy.

## Reuse and implementation boundary

The original map's P1-P7 are sufficient starting seams. Develop only the slice required for the first selected content.

| Mechanism | Reusable core | DCSS-specific adapter/content |
| --- | --- | --- |
| Objective state (P1) | Stable instance, typed states/events, valid transitions, persistence and recipient scope | Vault/monster/terrain actions, native timers and floor lifecycle |
| Completion evidence (P2) | Definition version, source identity, durable seal, idempotent credit and recovery | Rune/Orb predicates, native checkpoint and terminal observations |
| Participation (P3) | Controller/subject intervals and explicit eligible event scope | Party reservations, native heroes, downed state and vision/floor policy |
| Run configuration (P5/P6) | Immutable manifest, compatibility, bounded package allocation | Branch generation pairs, vault tags, solo/party variants and loot/threat budgets |
| Campaign transitions (P7) | Versioned chapter generations, asset allocation, legal next states, archive and retry | Lantern Compact's chapter graph, Waystation commitments and realm discoveries |

Use existing storage/identity contracts where sound. Keep presentation, lore, branch names and charter definitions outside the reusable transition/completion mechanism. Do not build a cross-game campaign framework or a new general quest language ahead of the first demonstrated need.

## Discriminating assessments

None of the following gameplay/model probes was executed in this pass. This work authored the designs and refreshed the source boundary; it performed document consistency checks only.

| Probe | Competing interpretations and control | Observable acceptance / what failure means |
| --- | --- | --- |
| Meaningful persistence | Compare the same early success followed by a badge-only next screen and by the Waystation's two concrete next operations | Players can explain different next plans and care about the consequence; indifference weakens this reward design, not all metaprogression |
| Mid-run banking | Known-working native save/terminal fact as control; success → save → continue → death; crash before/after seal and replay delivery | Saved success credited once without requiring death; unsaved rollback cannot duplicate it; broken save control is setup failure |
| Scope and credit | Solo, solo companions, two controllers, guest, late join, downed participant, parked off-floor peer and spectator | Precisely eligible personal/joint/company recipients; host-only snapshots must remain insufficient for controller attribution |
| Campaign concurrency | Two successful attempts and one late failure against one generation; then repeat after archive | One transition/asset, correct histories, no post-success reversal; failure rejects the transition policy or implementation, not charter content |
| Solo/co-op decisions | Ordinary vault as control; H01/H05 variants with fragile/ranged and durable/melee contexts, then two and four heroes | At least two credible plans, solo sequence works, cooperation changes position/priority/resource use; simple burst dominance rejects the selected encounter relationship |
| Fresh hero / veteran company | Compare a new company and a mature company with a newcomer using the same native starting build | No hidden starting-stat gap; optional early encounter remains appropriate and the newcomer can earn real credit; unfair loot/threat must be retuned |
| Extended return | Known native realm entry/exit as control; one Hell operation and same-floor Pan, then save/unload/source loss | Native restrictions remain coherent; operation success and return are separately proven; failed ordinary exit is not evidence against the objective design |
| Campaign economy | Early success, failure, recovery, repeated easy successes, intentional quits and a full normal conclusion | No repeatable resource faucet, no mandatory farm, bounded complication and valid conclusion; a badge cap alone does not prove the loop is enjoyable |

The recommended first paper comparison uses [the five-expedition sequence](charters.md#worked-campaign-the-lantern-compact). Then select one early operation and one campaign consequence for a disposable native assessment. Multiplayer Orb extraction and extended realm operations remain later frontiers until their specific outcome/lifecycle contracts are established.
