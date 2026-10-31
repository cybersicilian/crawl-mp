# Evidence and research boundary

[Map index](README.md) · [Progression](progression.md) · [Systems](systems.md) · [Concepts](concepts.md)

Date: 18 October 2026. Repository: `cybersicilian/crawl-mp`, checkout `/Users/iancaltabiano/Documents/Projects/dcss`. HEAD at research start: `3688bb2859` (`Fix thy/thine agreement in insults.`). This checkout has extensive existing tracked and untracked changes. HEAD alone does not identify its content; selected file hashes and native executable hash are in [catalogue-summary.json](catalogue-summary.json). No source freeze is claimed.

## Evidence labels and delivery

| Label | Meaning here |
| --- | --- |
| Observed | A command was executed successfully in this local environment; its output supports only the described observation |
| Source-backed | Concrete implementation or authored content was inspected; no fresh behavior follows merely from its existence |
| Proposed composition | New design combining capabilities; not implemented by this research |
| Unproven primitive | Essential contract not established by available source/observations |
| Ruled out in tested conditions | Requires an actual discriminating experiment; no new gameplay design is assigned this label here |

Delivery statuses are separate. These documents are **authored**. CLI catalogue exports are **observed**. Gameplay capabilities are **source-backed**; existing documents report historical QA/deployment. Concepts are **proposed**. No new gameplay was integrated, deployed, behaviorally verified or balanced.

## Commands actually executed

From the repository (with the executable's source directory as working directory for the initial export check):

```sh
crawl-ref/source/crawl -version
crawl-ref/source/crawl -branches-json
crawl-ref/source/crawl -playable-json
crawl-ref/source/crawl -stats-json
```

All four returned exit status 0. The executable reports version `0.33-a0`, save version `34.344`, and macOS arm64. Its catalogue includes modern trunk and revived fork content; the version label must not be treated as stock 0.33 documentation compatibility. A current local binary's catalogue is still not proof that every matching source edit is compiled or that every listed entity naturally generates.

The research also used scoped file searches, local source reads, a generated catalogue appendix, file hashes, Markdown-link checks and summary/appendix consistency checks. No server was started, save opened, player account altered, network game played or production environment accessed.

## Native catalogue observations

| Category | Export observation | Important limit |
| --- | --- | --- |
| Branch records | 41 | Includes disabled Dwarven Hall/Labyrinth and mode-only places |
| Species | 47, of which 38 marked playable | Draconian forms inflate raw species count |
| Backgrounds | 35 marked playable | A background is an initial kit, not a fixed class progression |
| Starting combos | 1,299 | Legal exported identifiers, not equal-difficulty builds |
| Monster records | 686, of which 99 marked unique | Includes special/generated-context entities; not a spawn audit |
| Spell records | 440, of which 205 marked player spells | Includes monster-only abilities and other entries |
| God records | 27 | Catalogue presence alone does not prove every altar/entry path |
| Mutations | 218 | Includes conditional and special-purpose records |
| Skills | 29 | Not 29 independent progression tracks for every build |
| Item category entries | 501 across 14 categories | Includes brand/ego lists; not 501 distinct physical drops |

[The generated catalogue index](catalogue-index.md) enumerates native names/keys by category. It is an inventory appendix, not an assertion that every entry is available in a normal run. The [summary](catalogue-summary.json) keeps counts, starting names, executable provenance and selected source hashes.

## Source chains used

| Claim / mechanism | Primary evidence inspected | What it establishes / does not establish |
| --- | --- | --- |
| Main branch structure, sizes and rune placement | [branch-data.h](../../crawl-ref/source/branch-data.h), [branch.cc](../../crawl-ref/source/branch.cc), [ng-init-branches.cc](../../crawl-ref/source/ng-init-branches.cc) | Defined topology, branch pairing and unfinished exclusions; special gateways/portal Lua need separate treatment |
| Actual gates and commitments | [main.cc](../../crawl-ref/source/main.cc), [stairs.cc](../../crawl-ref/source/stairs.cc), [defines.h](../../crawl-ref/source/defines.h) | Three-rune Zot gate, Vaults exit lock and zero-rune entry warning, Slime upward-travel restriction |
| Revived Forest / Blade | [forest.des](../../crawl-ref/source/dat/des/branches/forest.des), [blade.des](../../crawl-ref/source/dat/des/branches/blade.des), `branch_is_unfinished` | Authored entries/encounters and Forest rune; not a native end-to-end generation test |
| Rune-accounting mismatch | `MAX_RUNES` in [defines.h](../../crawl-ref/source/defines.h), initialization in [player.cc](../../crawl-ref/source/player.cc) / [dungeon.cc](../../crawl-ref/source/dungeon.cc), [items.cc](../../crawl-ref/source/items.cc), [skills.cc](../../crawl-ref/source/skills.cc) | Fifteen-rune default and downstream predicates coexist with authored Forest rune; no completed sixteen-rune run was tested |
| Vault framework | [authoring introduction](../../crawl-ref/docs/develop/levels/introduction.txt), [dat/des](../../crawl-ref/source/dat/des) | Authored spatial composition, selection and Lua precedents; not a generic objective lifecycle interpreter |
| Existing co-op vault coverage | [coop_vaults.des](../../crawl-ref/source/dat/des/variable/coop_vaults.des) | Three named vaults with D/Lair/Vaults/Depths placement; not proof the entire repository has no other co-op content |
| Support, god politics, consumables and combinations | [party.h](../../crawl-ref/source/party.h), [party.cc](../../crawl-ref/source/party.cc), connected native call sites | Actual implementations and eligibility checks; no new behavioral/balance test of those systems |
| XP sharing | `_give_player_experience` in [mon-death.cc](../../crawl-ref/source/mon-death.cc) | Same awarded XP applied to other non-downed heroes; no floor condition in that loop; not a measured power curve |
| Trade | [party-trade.cc](../../crawl-ref/source/party-trade.cc), [party control documentation](../party-control.md) | Native restrictions/action cost and previously recorded QA; no fresh transfer test in this turn |
| Ownership, floor time and projection | [multiplayer-mechanics.md](../multiplayer-mechanics.md), [party-session.cc](../../crawl-ref/source/party-session.cc), [level-time.cc](../../crawl-ref/source/level-time.cc), [party_control.py](../../crawl-ref/source/webserver/webtiles/party_control.py) | Current source contracts and prior test reports; no fresh two/four-client session |
| Recovery | Downed/revival/last-stand code in [party.cc](../../crawl-ref/source/party.cc), current multiplayer policy document | Several helpers exist; stairs in current multiplayer policy do not auto-revive; exact new rescue lifecycle remains untested |
| Stable identity and record storage | [game-record.cc](../../crawl-ref/source/game-record.cc), [save-library.md](../save-library.md), [game_library.py](../../crawl-ref/source/webserver/webtiles/game_library.py) | Persistent IDs, snapshots, ownership and archive views; not account inventory or unlock grants |
| Record ingestion / outer game | [chronicle.py](../../crawl-ref/source/webserver/webtiles/chronicle.py), [stats.md](../stats.md), [stats-json.cc](../../crawl-ref/source/stats-json.cc) | Available observations and analytical limitations; not causal attribution or complete action telemetry |
| Party analytical outcome | [stats_analysis.py](../../crawl-ref/source/webserver/webtiles/stats_analysis.py), [stats.md](../stats.md) | At least one Orb escape defines party success in analysis; all terminal roster records required; not fresh native escape behavior |
| Alternate modes and run modifiers | [games.d/base.yaml](../../crawl-ref/source/webserver/games.d/base.yaml), [party.cc](../../crawl-ref/source/party.cc) | Configured solo/co-op/seeded/Descent/tutorial/Sprint and modifier parser; not every proposed challenge mode |
| Anti-grinding and meaningful-choice principles | [local manual, Philosophy](../../crawl-ref/docs/crawl_manual.rst) | Native design intent, including no compulsory quest structure; optional fork campaigns are an explicit departure |

## External primary checks

- [Official 0.34 tournament overview](https://crawl.develz.org/tournament/0.34/overview.html): confirms existing individual/clan goals including Nemelex' Choice, streaks, exploration, gems, banners and Ziggurats. This supplies a metagame precedent; tournament population/results were not used to estimate fork balance or infer popular route order.
- [Tagged upstream 0.34.1 branch definitions](https://raw.githubusercontent.com/crawl/crawl/0.34.1/crawl-ref/source/branch-data.h): comparison point for inherited branch topology and compatibility records. A branch record still does not establish active generation; the fork's `branch_is_unfinished` and authored maps were inspected separately.
- [Tagged upstream 0.34.1 manual](https://raw.githubusercontent.com/crawl/crawl/0.34.1/crawl-ref/docs/crawl_manual.rst): contextual comparison. Current fork details were taken from local source rather than assuming this tag describes them.

These are pinned comparison sources or historical tournament sources, not a claim that this checkout is equivalent to the latest official release.

## Prior evidence used with care

A prior local two-client QA summary reported separate hero movement plus startup/guest-control refresh defects. It was used to identify ownership, native behavior and UX as separate evidence questions. Newer local multiplayer/deployment documents describe broader subsequent validation. This map does **not** carry the earlier defects forward as confirmed-current bugs or independently revalidate the later release claims.

The [18 October release document](../deployment-2026-10-18-complete.md) reports production deployment and local/Linux validation. Reading it is documentary evidence only. No current production status, installed hashes or fresh hosted gameplay were checked for this content-design request.

## Deliberate uncertainties

- No fresh gameplay, player interview, route-frequency analysis, encounter timing, win-rate comparison or native balance study was conducted.
- Monster/item/spell lists are complete for the observed export, but individual generation, balance, descriptions and interactions were not exhaustively audited.
- The traditional route templates are practical interpretations of the source's progression graph and threat structure, not statistically established optimal paths.
- Early co-op authoring sparsity is scoped to the inspected named co-op vault file; emergent ordinary combat cooperation is already possible.
- No independent simultaneously executing native menus, cross-floor global objective clock, account-power unlock system, persistent campaign mutation or physical cross-run item transfer was established.
- No proposed test is reported as passed merely because a similar native helper or regression file exists.

## Refreshing the map

Refresh the executable/source provenance and regenerate the catalogue summary/index when gameplay content changes. Recheck active generation as well as branch metadata. Keep observed test environments and evidence attached to the specific capability tested. Version challenge predicates/manifests when rules change; do not silently merge old and new results into an all-time comparative challenge.

## Company asset design revision

The user subsequently rejected accomplishment-led progression and selected tangible persistent assets, equipment and company capabilities. The [current campaign design](company-campaign/README.md) supersedes the earlier badge/chapter-completion foundation. Earlier company drafts are preserved with supersession notices; encounter sketches remain possible content sources.

This revision inspected native identities/records, item serialization and special pickup behavior, same-run inventory transfer, spell memorization, equipment rules, cooperative item effects, XP-evoker auxiliary state and unique-item generation. [The focused contracts](company-campaign/contracts.md) record the exact source boundary. Cross-run storage/transfer, training, research cargo, field services, recovery and advanced starts remain proposed. No new native gameplay or economy test was conducted.

## Guild materials and separate-participant revision

The user added scattered, individually owned materials, voluntary guild deposits, buildings benefiting all members and a guild requirement for persistent assets. The [resource/construction policy](company-campaign/guild-resources.md) and [inheritance/extraction/recovery policy](company-campaign/inheritance-extraction-recovery.md) develop those requirements. Default collector ownership, a six-material palette, departure custody and bounded salvage remain authored recommendations, not observed balance or exact Frosthaven rules.

Additional source inspection: the fatal-damage party path in [ouch.cc](../../crawl-ref/source/ouch.cc) can down/relocate a ghost and return before normal end-game; it does not establish a detached equipment bag. In [end.cc](../../crawl-ref/source/end.cc), terminal paths delete save files and end the game process. [stats_append_final_snapshots](../../crawl-ref/source/stats-json.cc) applies the active outcome across party slots, except downed peers become dead. Separate extraction therefore requires new native participant lifecycle semantics, including host departure; native actor scheduling and authenticated controller reservation must remain authoritative.

Cephalofair's [resource/building article](https://cephalofair.com/blogs/chronicle/what-to-do-with-those-resources) supplied limited primary-source inspiration for competing equipment/building expenditure. Personal title, guild contributions and separate extraction here are original proposed adaptations. Documentation links and illustrative accounting were checked; no materials, guild building, independent native extraction or salvage gameplay was implemented or playtested in this pass.

## Building trees, recipes and numerical economy

Authored [eight building tracks / 23 funded nodes](company-campaign/buildings.md), [47 production/research/service recipes](company-campaign/equipment-recipes.md) and [worked economy budgets](company-campaign/guild-economy.md), using one [numeric catalogue](company-campaign/guild-catalogue.json). Every cost, yield, training floor, library tier and new device effect is a design hypothesis. Numeric consistency checks cover IDs, costs, prerequisite cycles, recipe closure and worked balances; no native balance simulation or crafting implementation is claimed.

Refreshed primary source for ordinary types and enchantment caps, cooperative item data, skill-point calculations, read/drink realm prohibitions and player realm modifiers. Important source-backed findings: [scroll_soul_recall](../../crawl-ref/source/party.cc) can revive downed slots across floors and otherwise recall separated living peers; [evoke.cc](../../crawl-ref/source/evoke.cc) applies visible same-floor eligibility to the cooperative evokers, including a ghost alternative for the astral beacon. [branch-data.h](../../crawl-ref/source/branch-data.h) marks Hells no-items, so proposed material/component installations cannot be inferred from ordinary random loot generation. New realm exceptions, auras, beacons and per-hero lifecycle remain unproven adapters.
