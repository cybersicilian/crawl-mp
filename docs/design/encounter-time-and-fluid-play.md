# Encounter time and fluid multiplayer play

20 October 2026. In-game UX and native synchronization design following the user's requirement: pings are visible to the pinger; play is fluid; a player who cannot see any participant in a combat can continue independently.

## Delivery boundary

Implemented in source in this slice:

- All player ping entry points use one floor-bound sender, including map clicks, alternate/middle clicks, the context menu and the toolbar's self-location ping.
- Accepted pings echo to their sender even before reconnect delivery metadata is restored. Other recipients remain floor-scoped. Late pings from an old floor are rejected by the client. Pings use no native command or game time.
- A native snapshot explicitly reporting `region_combat: false` removes that hero's server presentation cooldown, without waiting for idle peers. Native eligibility, one in-flight command and command acknowledgements remain authoritative. Unknown safety is not treated as safe.

Native candidate implemented and validated in an isolated build:

- Native sight and shared creature/cloud dependencies replace the 18/22-tile grouping policy. Unloaded floors retain their last authoritative partition until their native package is loaded.
- Existing recovery-preserving clock rebasing is retained. Entity ownership prefers a participant that can actually interact with the entity over a nearer, wall-separated explorer.
- Monsters and lurking creatures retain persistent logical ages. Native cooldowns, daze, revival, vortex and curse deadlines use the entity age, so independent progress and region rebasing do not expire them. Remembered invisible-entity observations use the same entity clock.
- Local environment sources, active markers, temporary terrain and lurker scheduling advance only with their owning region. Environment processing uses the region delta even when another region has already advanced the floor's high-water timestamp.
- Truly floor-wide chronology remains a conservative explicit dependency: Shoals tides, active awakened forest, global turn-event listeners and expiring Vorr ground resources. These currently join the loaded floor's participants; spatial adapters for those systems remain future work.
- Campaign deadlines remain separate from encounter time. The concurrent global-clock change is included in the isolated candidate: Zot and gem clocks follow the maximum personal elapsed time, while encounter recovery and entity ages remain local.
- HUD, action availability and click planning prefer the controlled hero's explicit `region_combat` state. The multiplayer renderer owns its status banner so a generic controls refresh cannot overwrite encounter, intent or recovery feedback.

The native candidate has not been installed or deployed. Its validation status is recorded below. This is the first native encounter milestone, not completion of every in-game UX recommendation in the earlier brief.

The separate concurrent global-time display delta in `tileweb.cc` is included as source-only handoff material. It is not part of this local native build or browser result; the combined validator must reconcile and validate it with the other source packets.

## The player-facing rule

**Explore independently. Enter the shared microturn schedule when you can see a participant in an active encounter. Resume independent play when the encounter no longer has a sight or effect dependency on you.**

A participant includes a fighting teammate as well as a hostile. A player who sees their ally fighting joins the encounter even if the enemy is hidden from their own perception. They do not receive that ally's live monster information. Two adjacent players exploring safely do not require a shared ready step.

Distance alone does not establish participation. A nearby hero behind an opaque wall should continue moving, inspecting, collecting and resting while the other hero fights. A separate fight elsewhere has its own schedule. Ordinary actions are accepted immediately when native rules allow; presentation never demands a ready click per move.

Line of sight supplies the ordinary boundary. A committed interaction can add a temporary causal dependency: a projectile in flight, a shared damaging cloud, a cross-boundary attack or another effect still able to affect the encounter. This exception needs an explicit native rule; hiding behind a wall must not erase the cost or consequences of an action already committed. Report a generic danger/effect reason where needed without revealing hidden actors.

## Existing machinery and the actual mismatch

`party-session.cc` already has region IDs, independent region clocks, per-character action clocks and recovery debt. Joining regions rebase onto a common clock and preserve the relative debt. Monsters and clouds are assigned to one region with a stable tie break. Floor changes also carry recovery debt.

The preceding grouping policy linked living heroes within 18 tiles, kept an existing link until 22 tiles, and added a hostile-proximity bridge. Those tests could join players who could not see the encounter. `region_feels_safe()` aggregated safety across that whole group, so a nonparticipating explorer could inherit the combat schedule. The native candidate replaces those distance links with native sight and explicit dependencies.

`ActivityPump` adds a separate, short millisecond pacing layer. The source change removes that layer when native state explicitly reports safety. The native candidate supplies the finer encounter grouping; genuine shared-effect dependencies can still place heroes in the same group.

The main world-reaction path already separates region delta and floor delta. However, floor elapsed time, environment effects, marker processing, tides, terrain timers, noises, summons and expiration timestamps require an ownership audit before finer regions are accepted. Changing `can_act` or proximity thresholds alone would not prove simulation isolation.

## Proposed reusable mechanism: encounter dependencies and clock domains

Keep one authoritative engine, processing one native command at a time. Fluidity comes from avoiding irrelevant waits and advancing only the affected logical domain. It does not require concurrent native mutations or browser-driven time.

Use a dependency graph derived from authoritative native perception and active effects:

1. Identify active encounters from meaningful hostile interactions and native danger, preserving existing threat and hazard semantics.
2. Attach a hero who personally sees a hostile participant or a teammate already participating in that encounter. Apply transitive visibility so a chain of genuinely observing participants shares a schedule.
3. Add explicit native effect dependencies where an interaction can affect multiple groups. Reconcile these before that effect is resolved.
4. Keep safe outsiders independent, including players near a fight but behind walls. Do not import distance hysteresis as a hidden combat requirement.
5. Recompute at native action boundaries and after changes to sight, movement, terrain, participants or effects. End inactive encounters; preserve only real unresolved dependencies.

The engine needs an internal distinction between geometrical sight, personally visible actors and causal effect reach. Reuse native perception and range rules rather than approximating LoS with a browser map or a distance radius. An encounter membership indicator cannot become a way to discover invisible enemies.

The reusable core is dependency membership plus explicit ownership of logical time. DCSS supplies the perception adapter, combat eligibility, action costs and effect rules. Reuse the existing regions and identity contracts instead of introducing a second scheduler.

## Rejoining two different clocks

Clocks measure local progress; they are not a balance of free actions. Suppose a fight is at local time 120, an explorer is at 900, and the explorer still owes 4 units from their last action.

At the native joining boundary:

- Select one common domain base, using the existing maximum-clock rebasing approach as the starting mechanism.
- Translate each member's clock to that base while preserving remaining recovery. The explorer still owes 4; no participant receives 780 units of free actions.
- Preserve each attached effect's remaining lifetime and each entity's action energy. Translate relative deadlines rather than replaying 780 units or silently expiring effects from an unrelated absolute timestamp.
- Account for the action that crossed the boundary exactly once, including normal movement, door, attack and spell costs. Reconcile before resolving cross-domain world reactions and before the next command executes.
- Pause an executing route when the transition introduces new threat or invalidates its assumptions. Show the new state without a confirmation for each harmless step.

On splitting, each domain inherits the current base and its members' unpaid recovery. Do not reset attack recovery, poison, recharge, summons or cooldowns. Native effect semantics continue inside the assigned domain. A split must not create copies of an entity, refund time, or produce a burst of extra enemy actions.

## Timer and effect ownership

| System | Required ownership rule |
| --- | --- |
| Hero command cost | The hero's native action; committed exactly once |
| Recovery and combat exposure | The hero's current encounter/domain schedule |
| Regeneration, poison, buffs and recharge | Preserve the native timer's semantics; attach advancement to its actual owner/domain rather than unrelated exploration |
| Monsters and summons | One domain owns their advancement at a time; stable identity and native energy survive transfer |
| Clouds, projectiles and area effects | One owner for aging; explicit dependencies for everyone the effect can influence |
| Inventory, loot and trade | Single authoritative mutation and validation; clocks do not duplicate objects or authorize remote transfers |
| Terrain and local markers | Spatial/domain ownership where effects are local; age once |
| Truly shared floor events | Explicit event barrier or domain-aware adapter; a global maximum timestamp alone cannot establish correct behavior |
| Off-floor state | Existing persistence boundary; other players and wall time do not simulate the absent floor |
| Pings, pointer presence and personal inspection | Turn-free UI/presence time; never advance simulation |

Before changing eligibility, enumerate calls using `level_elapsed_time()`, `env.elapsed_time`, region delta and floor delta. A timer may currently assume a single floor chronology. Supply a compatible adapter for that timer or retain a narrowly scoped dependency until it exists. Broadly allowing independent actions while leaving global aging unchanged would violate the player's rule in practice.

## In-game feedback

- **Exploring:** immediate permitted movement and interactions; no idle-peer presentation delay.
- **In combat:** native recovery, one visible next intention, clear action cost and appropriate threat information.
- **Encounter joined:** brief state change at the boundary; stable camera and preserved selections.
- **Resolving an effect:** identify a real causal wait without inventing a wall-clock recovery countdown or leaking hidden actors.
- **Ping:** the same accepted marker appears for the sender and same-floor recipients, using the existing dungeon and minimap rendering. All entry points bind the current floor. Reconnect/floor changes cannot leave an old marker on the new map.

Ordinary inspection remains available in each state. Explicit native modal interactions still serialize the engine today; this proposal does not imply independent native menu stacks. Stopping a plan cancels its unsent remainder, not an already committed native action.

## Implementation sequence

1. Complete ping/floor delivery and remove safe-region presentation barriers. **Source slice complete.**
2. Define native participant/effect dependencies and audit the existing timer owners. **Implemented; focused native fixtures passed.**
3. Add merge/split normalization for entity energy and effect deadlines as well as hero recovery. **Hero recovery retains the existing rebasing contract; entity ages now remain independent of that coordinate change. Local timer consumers are adapted; named global consumers retain a conservative shared clock.**
4. Replace region membership with the tested dependency policy and wire native participant state into existing HUD/planning checks. **The existing region/safety fields drive the HUD and planner. The isolated two-owner encounter scenario passed.**
5. Validate broader four-client, reconnect and floor-travel combinations, then stage a coordinated release through the existing production owner. The bounded two-owner result does not establish those broader scenarios, installed or hosted behavior.

## Discriminating native/gameplay checks

| Scenario | Observable acceptance |
| --- | --- |
| Host fights; guest is nearby behind an opaque wall | Guest takes repeated normal actions with the host idle; host, enemy energy, combat cloud lifetime and recovery do not advance |
| Same layout with the wall removed or door opened | The relevant sight relation joins the encounter at a native boundary; costs and recovery remain intact |
| Guest sees fighting ally but not enemy | Guest joins without receiving unauthorized enemy data |
| Two independent fights | Each progresses only from its participants; a boundary monster/cloud advances once |
| Explorer at a very different clock joins | No catch-up burst, free healing, extra actions, changed remaining effect duration or discarded recovery |
| Participant breaks LoS | Split only after native causal dependencies permit it; no attack-speed or effect reset exploit |
| Long-range or persistent effect crosses groups | Dependency resolved before effect application; one effect instance and one aging owner |
| Repeated route, new threat and delayed acknowledgement | Each action executes once; correct interruption; no optimistic movement or stale replay |
| Every ping route, including during a peer's prompt | Sender and allowed same-floor peers see it; wrong-floor observers do not; native turns remain unchanged |
| Save/reconnect/floor travel | Character ownership, clock debt and entity identity survive; queued commands are not replayed |

Use the existing proximity build as a baseline and an otherwise identical opaque-wall fixture as the control. If free movement succeeds but combat state ages, that is a simulation isolation failure, not successful fluid multiplayer. Failure to launch a fixture is a setup failure, not evidence against the design.

Heavy native builds and multi-browser batches must reserve the shared host gate. Native validation uses an independently cloned source snapshot at `/private/tmp/dcss-encounter-sync/source` with a complete source manifest and owned reservation/closure records. Existing user saves and hosted service are outside this validation environment.

## Native validation progress

The first admitted build stopped in generated species/form data because the selected Python lacked PyYAML. Its negative log and exact phase closure were preserved, and its reservation was released. The retry selects the already installed `/usr/local/bin/python3`, whose PyYAML import was verified. No dependency installation or product-source workaround was used.

The isolated native build and focused `[party-session],[zot]` suite passed **31 cases and 382 assertions**. This includes opaque-wall independence, unequal-clock joins/splits, visible teammate chains, shared visible threats/clouds, recovery preservation, wall-aware ownership, persistent entity deadlines, local marker aging and the concurrent campaign deadline contracts.

The first two-owner browser attempt failed during dungeon startup, before its encounter fixture ran. Native diagnostics reported invalid item-grid entries. Its logs, screenshots and all-owned-process closure were retained separately. The frozen source was then rebuilt after discarding inherited native objects and executable files; the same 31 cases and 382 assertions passed again.

The second browser attempt did not reproduce the item-grid errors but also failed before entering the dungeon. Inspection found that the fixture's long temporary runtime path exceeded macOS's 104-byte Unix socket field: the native process created a truncated socket while the server waited for the full path. The retry uses a short disposable runtime path with a length preflight. Neither startup attempt ran the encounter assertions or establishes gameplay acceptance. The native source and browser assertions are unchanged for the short-path retry.

The two-owner browser fixture checks six independent actions, unchanged remote enemy energy and combat cloud, own-encounter cloud aging below the floor high-water clock, self-visible turn-free pings, and sight-based rejoining.

The short-path retry **passed all five scenario checks with no browser errors**. The sender's ping was visible in its captured game screenshot. Both authenticated owners controlled their own heroes. The guest completed six actions with the host idle; the host's clock, enemy initiative and short-lived cloud stayed unchanged. Host actions then expired its own cloud. Opening sight joined the regions without changing the observed recovery balances; closing sight restored independent guest action. Nonzero unequal recovery debts are separately covered by the native fixtures.

Build reservation `265b1b87-9b08-4b19-b8d2-3980a49adb86` and browser reservation `76ff2990-1ce5-44a6-9b5f-abf67f09fe16` were released after their owned processes closed. The earlier negative attempts remain distinct. Durable manifests, logs, screenshots and closures are in `/Users/iancaltabiano/.codex/visualizations/2026/10/20/01a15957-c8bb-7eb0-946f-2b7522e3d5cc/encounter-native-validation/`.

## Focused validation for the implemented slice

- `webtiles.tile_presence_test` and `webtiles.activity_pump_test`: **29 tests passed**. Covers sender echo, missing reconnect metadata, wrong-floor/unclaimed rejection, ping bypass of a peer prompt, safe-region pacing, unknown/combat safety and native eligibility retention.
- `tests/party-ping.cjs`: passed. Exercises the real sender module and accepted-echo client handler, dungeon/minimap invalidation and stale-floor rejection.
- `tests/camera-follow.cjs`: passed. Exercises real map/minimap click dispatch through the new sender, alongside existing camera, exclusion and reconnect checks.
- `tests/party-data.cjs`, `tests/party-status.cjs` and `tests/tactical-planner.cjs`: passed. Covers the explicit safe outsider, legacy safety fallback and ordinary click behavior while a peer fights.

These are focused backend and JavaScript contracts. The separate native build and two-owner gameplay evidence is recorded above; no deployment acceptance is claimed.
