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

[`cell-resource`](../../../crawl-ref/source/cell-resource.h) owns expiring cell quantities, ordering, serialization and transactional debits. It has no religion, blood, player or UI policy. The Vorr adapter supplies eligibility, terrain, piety and costs. A small generic final-effect callback reuses native deferred combat resolution. The existing Blood Hunter mechanics retain their own rules.

## Verification

Build with `make -j4 WEBTILES=y STDFLAG=-std=c++14 crawl catch2-tests-executable`. Run `./catch2-tests-executable '[vorr],[bloodcraft]' --reporter compact`. The explicit C++14 flag is required by this checkout's Catch2 version.

- Native build and targeted C++ regression results are recorded in `validation.json`.
- Controlled browser shrine coverage checks all 28 deity identities, seven favor tiers, native atlas art, geometry, inspection and reduced motion.
- `webserver/tests/vorr-native.cjs` creates a fresh disposable localhost game. It checks real worship, sparse grants, the live plinth, a melee kill and Red Passage through the native action and targeting paths. It uses the existing native-client fixture and never touches an existing campaign.

[Native game screenshot](evidence/vorr-native-game.png) · [Live plinth](evidence/vorr-live-plinth.png) · [Verification record](validation.json)

This is separate from full campaign balance, native two-client co-op acceptance, legacy-save migration proof and production deployment. The original prototype receipt records a missing `Kindled Veins` fallback. Combined release preparation added the five Blood Hunter spell and three ability mappings from their native definitions; the full power-art parity check now passes for 444 spells and 165 static abilities. The original receipt remains a record of the earlier prototype checks.
