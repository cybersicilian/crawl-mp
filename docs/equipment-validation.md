# Equipment menu validation — 17 October 2026

The menu was validated against the native equipment rules, with separate native
contract, creation-preview, controlled-browser and disposable-game evidence.
Native rule fixtures are constructed player states; they do not prove that every
combination was reached through normal gameplay.

## Coverage

| Layer | Coverage | Result |
| --- | --- | --- |
| Native equipment contracts | 14,023 assertions in eight Catch2 test cases | Passed |
| Species fixtures | All 47 non-removed species, including derived Draconian colours | Passed |
| Starting characters | All 38 selectable species, repeated with another world seed and checked for save writes | Passed |
| Mutation fixtures | 31 level cases across 16 equipment-related mutations | Passed |
| Form fixtures | All 39 native definitions, including normal form and legacy compatibility definitions; return/unmeld checks | Passed |
| Special equipment | Eight cases covering five slot-granting artefacts, their combination, Lear's hauberk and a two-handed weapon | Passed |
| Cross-feature fixtures | Ten selected interactions | Passed |
| Browser menu | All 173 native-produced states at 1280, 768, 390 and 320 pixels wide | Passed; zero recorded issues or page errors |
| Existing equipment browser tests | Inspection/focus return, search/filter persistence, item-property and randart controls | Passed |
| Legacy folio tests | Older snapshot fallback, inventory filters, action gates and escaped item content | Passed |
| Disposable native gameplay | Slot grants/loss, mutations/removal, forms/unmelding and five species transitions | Passed |

The cross-feature cases include eleven-ring Octopodes, missing-hand Octopodes,
Troll auxiliary glove slots, Octopode and Felid sphinx anatomy, Coglin fortress
crab support, horned serpent headgear, Poltergeist skull-granted headgear,
swimming Merfolk and equipped Coglin gizmos.

## Gaps fixed

1. **Missing unarmed names without a weapon socket.** The native profile now
   includes an optional `unarmed_attack` name. The portrait shows it for anatomy
   without a weapon socket and when a form blocks or melds the weapon. Empty
   weapon sockets retain native names such as Claws and Tentacles.
2. **Melded gear looked active in the backpack.** A shared native-profile state
   resolver identifies melded items. The backpack labels them `Melded · inactive`
   and preserves native inspection access and their place in the Equipped filter.
3. **A disappearing socket lost keyboard focus.** Losing a mutation- or
   item-dependent socket clears its filter and moves focus to inventory search.
4. **Two-handed support showed no matching weapons.** Native `support_only`
   metadata lets support sockets filter using required slots. Primary equipment
   filters retain their original target-slot semantics. Older profiles retain
   support-slot compatibility through the existing presentation type adapter.
5. **Coglin gizmos were classified as supplies.** Gear filtering now uses the
   native equipment flag, with the existing kind-based fallback for old data.

No species permissions, mutation effects, equipment costs or transformation rules
were reimplemented in browser code. New profile fields are additive to version 1.
The current native executable and its matching atlases must be deployed together;
existing game processes need a save/resume with the rebuilt executable to emit
the new optional native fields.

## Reproduction

The Catch2 matrix can export newline-delimited native fixtures for the browser:

```sh
DCSS_EQUIPMENT_MATRIX=/tmp/equipment-matrix.jsonl ./catch2-tests-executable '[equipment-profile]'
python3 webserver/tests/equipment-profile-native.py --binary ./crawl --all-species --output /tmp/equipment-species.json
```

Use a new or empty export file for each run; the fixture exporter appends records.
The focused Catch2 build uses `test_equipment_profile.o`,
`test_equipment_matrix.o` and `test_player_fixture.o`; normal Catch2 registration
is also included in `Makefile.obj`.

```sh
EQUIPMENT_MATRIX=/tmp/equipment-matrix.jsonl EQUIPMENT_SPECIES=/tmp/equipment-species.json EQUIPMENT_NATIVE_ROOT=/path/to/matching/native/source node webserver/tests/equipment-matrix.cjs
node webserver/tests/equipment-paperdoll.cjs
node webserver/tests/folio-controls.cjs
```

For real native transitions, run the test only against a disposable localhost
server with isolated accounts and saves:

```sh
WEBTILES_URL=http://127.0.0.1:8898 node webserver/tests/equipment-variation-native.cjs
```

The live run verified necklace equip/remove and filter clearing; horns, claws and
hooves plus their removal; bat, amphisbaena, fortress crab and normal forms; and
Felid, Naga, Octopode, Poltergeist and Coglin species changes. The live variation
test uses the native wizard interface and freezes world time
to keep unrelated simulation activity out of the checks. It does not establish
active-world timing, multiplayer behaviour or exhaustive Cartesian coverage of
all species, mutations, forms and artefacts. Normal vertical scrolling remains
necessary for large inventories and narrow screens. No formal accessibility
certification or deployment claim follows from these results.

The isolated run's logs, native fixtures, browser evidence, screenshots and
source/build hashes are retained under `/tmp/dcss-equipment-validation`.
Successful evidence and matching atlases are also saved in the task's
[persistent evidence folder](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14b58-e0f4-7b91-ab13-4abbcdfd77e0/equipment-validation/README.md).
These changes were subsequently deployed as release
`20261017T202009Z-equipment-complete`. Ubuntu builds, the 173-state browser
matrix, live HTTPS equipment menus, save/resume and public asset hashes passed.
See [deployment evidence](deployment-2026-10-17-equipment.md).
