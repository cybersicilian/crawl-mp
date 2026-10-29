# Vorr native prototype

18 October 2026. This is a local playable prototype. Numerical tuning, sprite polish and ordinary-run balance remain open.

## Implemented

- Native deity registration, worship, blood-bearing kill piety, descriptions, altar, wrath and ability bindings. Existing saved god and terrain IDs retain their values; Vorr is appended.
- Red Wake: finite per-victim blood budgets, one wound release, death deposits, forceful larger bursts, armour and a bounded secondary explosion phase. Native reward eligibility excludes summons, unrewarding and tesseract spawns. Bloodless creatures supply no blood, healing, piety or bloody explosions.
- Fresh blood uses saved floor properties with independent 120-aut expiry, three units per cell, visible legal terrain and atomic payment. Old cosmetic blood remains inert. Nearby fuel appears in status and hero snapshots; tile inspection reports quantity and expiry. WebTiles marks fresh density and fading blood.
- Sparse grants: Rupture at one star; passive Blood Communion and Red Passage at three; Great Letting at five. Native targeting, ally warnings, quick actions and authoritative disabled reasons are reused.
- Communion heals from actual removed HP, with fractional credit and a shared per-worshipper recovery cap. Standing on fresh blood adds regeneration through native healing restrictions.
- Red Passage consumes one unit at each endpoint, uses native relocation checks, releases constriction and nets, resolves its arrival strike, then finalizes movement and destination hazards. Great Letting selects eight units in its targeted area and hits each affected target once.
- Provisional transparent 32×32 altar and rite PNGs are registered in the native atlases. Vorr's portrait plinth uses the existing shrine renderer, including favor tiers, penance, unknown favor and reduced motion. Sources and hashes are in [native-assets.json](native-assets.json).

## Reuse boundaries

[`cell-resource`](../../../crawl-ref/source/cell-resource.h) owns expiring cell quantities, ordering, serialization and transactional debits. It has no religion, blood, player or UI policy. Partial selection supports mixed resource payments while the existing full selector retains its all-or-nothing contract. The Vorr adapter supplies eligibility, terrain, piety and costs. A small generic final-effect callback reuses native deferred combat resolution. The Blood Liturgist's bloodcraft spells retain their own rules.

## Corpse fuel, self-exsanguination and attack speed — 19 October

The follow-up uses fresh ground blood first, then consumes intact blood-bearing
corpses for one unit each. Self-exsanguination covers each missing unit with
`ceil(maximum HP / 10)` HP. Bloodless worshippers and characters under Death's
Door cannot use that fallback, and payment must leave at least one HP. The
target preview binds the selected sources; commit revalidates them before any
blood, corpses or HP are spent. Cancelled and failed rites preserve resources.
The native confirmation shows the exact health payment after targeting.

Rupture draws fuel within four cells. Red Passage can supply either endpoint
with a corpse or health payment. The Great Letting draws blood and corpses
within two cells of its center; health substitution creates blades around that
center. Self-exsanguination creates no persistent blood pool. Corpse fuel is
shown in the existing blood status, and the native ability-help keys now resolve
the expanded effect, damage, range and payment descriptions correctly.

At three stars, Blood Communion also shortens weapon attack delay by 2% per
visible fresh blood unit within four cells, capped at 20%. The native melee,
ranged and unarmed attack-delay path applies the bonus with ordinary unbiased
rounding. Movement, casting and throwing are unchanged. Corpses and health
payments grant no speed bonus; spending blood, expiry, lost sight and penance
update eligibility through the existing ledger and worship checks.

Release `20261019T183400Z-vorr-rites` is deployed. The Ubuntu candidate passed
439 assertions in 40 native cases, 76 backend tests, runtime-user previews and
compatibility checks on 11 copied checkpoints. Isolated and public HTTPS
fresh-game checks confirmed starting Vorr worship and the actual corpse and
maximum-HP tooltip. Earlier fixture failures remain in the evidence.

All 13,215 frozen file hashes matched after activation. Snapshot
`dcss-pre-vorr-rites-20261019t183432z` reached READY first; the prior Blood
Liturgist release remains available for rollback. Application, health and
recovery checks passed, and all task-owned remote helper groups closed.

[Follow-up evidence](/Users/iancaltabiano/.codex/visualizations/2026/10/19/01a15525-ca03-79c2-92df-d410c872a87c/vorr-corpses/evidence/receipt.json).
[Deployment receipt](/Users/iancaltabiano/.codex/visualizations/2026/10/19/01a15525-ca03-79c2-92df-d410c872a87c/vorr-corpses/evidence/deployment/receipt.json).

## Uncapped speed and vampiric starting weapons — 19 October

The speed follow-up replaces the earlier 20% attack-delay reduction limit with
an uncapped +2% attack and movement speed per visible fresh blood unit within
four cells. Both effects begin at three stars. Delay is divided by
`1 + 0.02 * blood units`, so fifty units double speed and halve delay. Ordinary
movement modifiers apply before the blood multiplier; the ordinary movement
minimum does not cap this bonus. The engine retains positive action time.
Spellcasting, throwing, corpses and self-exsanguination do not receive or
contribute to this bonus.

Blood Liturgists receive vampirism on their selected starting weapon through
the existing native item-creation path. Species unable to wield weapons keep
their normal restrictions. Self-exsanguination explicitly requires both a
blood-bearing species and a blood-bearing current body. Bloodless worshippers
can still use external blood and corpses; their ability costs show that the
health substitution is unavailable.

Release `20261019T184637Z-vorr-speed` is live. All 624 assertions in 44 native
cases and 76 backend tests passed. The native suite checks all bloodless species
in the deployed roster, external corpse fuel for bloodless users, both speed
paths at the three-star threshold, bonuses beyond 20%, and positive movement
time at maximum nearby blood density with haste and swiftness.

Fresh isolated and public HTTPS Human and Gargoyle Blood Liturgists both
received `+0 falchion (vamp)` and started worshipping Vorr at one star. The Human
could supply missing blood with HP; the Gargoyle's real tooltip showed
`no self-exsanguination (bloodless)` and its Rupture was blocked without external
fuel. There were no JavaScript errors. The initial browser fixture expected a
long weapon name; its failure is retained alongside the corrected native terse
name check.

Runtime-user previews passed, and 12 copied checkpoints remained loadable with
unchanged metadata. All 13,215 frozen file hashes matched after activation,
including the regenerated character catalogue. Snapshot
`dcss-pre-vorr-speed-20261019t184709z` reached READY before activation; the prior
Vorr rites release remains available for rollback. Health and recovery passed,
and all task-owned helper groups closed.

[Speed and starting-weapon deployment receipt](/Users/iancaltabiano/.codex/visualizations/2026/10/19/01a15525-ca03-79c2-92df-d410c872a87c/vorr-speed/evidence/deployment/receipt.json).

## Verification

Build with `make -j4 WEBTILES=y STDFLAG=-std=c++14 crawl catch2-tests-executable`. Run `./catch2-tests-executable '[vorr],[bloodcraft]' --reporter compact`. The explicit C++14 flag is required by this checkout's Catch2 version.

- Native build and targeted C++ regression results are recorded in `validation.json`.
- Controlled browser shrine coverage checks all 28 deity identities, seven favor tiers, native atlas art, geometry, inspection and reduced motion.
- `webserver/tests/vorr-native.cjs` creates a fresh disposable localhost game. It checks real worship, sparse grants, the live plinth, a melee kill and Red Passage through the native action and targeting paths. It uses the existing native-client fixture and never touches an existing campaign.

[Native game screenshot](evidence/vorr-native-game.png) · [Live plinth](evidence/vorr-live-plinth.png) · [Verification record](validation.json)

This is separate from full campaign balance, native two-client co-op acceptance, legacy-save migration proof and production deployment. The original prototype receipt records a missing `Kindled Veins` fallback. Combined release preparation added the five Blood Hunter spell and three ability mappings from their native definitions; the full power-art parity check now passes for 444 spells and 165 static abilities. The original receipt remains a record of the earlier prototype checks.
