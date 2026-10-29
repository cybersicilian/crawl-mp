# Vellum core validation — 2026-10-21

**Passed on the exact native source recorded in `validation/source.json`.**
Request: `9de545cb57aed4d333974961b0163850b89528fcf0db5632a94a454562bf0430`.
The working native inputs matched that manifest after the run. The isolated
candidate is `/private/tmp/dcss-vellum-baae6b032ea87023/crawl-ref/source`.
Binary hashes, logs, comparison rows and process-closure evidence are retained
in `validation/`. The shared reservation was released after process closure.

| Check | Result |
| --- | --- |
| Native game and Catch2 build, WebTiles, C++17, assertions enabled | Passed |
| Native database generation | Passed |
| Vellum contracts | 24 cases, 765 assertions passed |
| Matched god/loadout comparisons | 18 combinations, 153 assertions passed |
| Pakellas, Oozle, item memory, party, save and cooperative-delay regressions | 103 cases, 4,822 assertions passed |
| Vellum web action identity, owner, availability and prompt checks | Passed |
| Pakellas web action regression checks and modified JS syntax | Passed |

Suite filters overlap: these row counts must not be added as distinct tests.
The Vellum cases include a real native Wyrmbane kill callback: transferred growth
increased the recipient's effective enchantment, left the donor unchanged, and
survived serialization. A separate case confirms that harvesting enchantment
levels before the unique power does not duplicate those levels.

## What the comparisons show

All scenarios use a Human with the same weapon, armour, cold-resistance ring and
base skills. Stages are XL 8/15/25 with nominal piety 50/120/200. Vellum's donor
properties are supplied by the fixture; extraction costs are paid. Ashenzari
uses five actually cursed equipped items, so its native piety recalculates to 86.
Okawaru's row measures Heroism and Finesse while active, not their uptime or cost.
Pakellas's wand readiness is asserted separately from weapon performance.

| God at XL 15 | Str / Int / Dex | rF / rC | Long Blades | Expected attack delay |
| --- | --- | --- | ---: | ---: |
| Godless | 11 / 10 / 15 | 0 / 1 | 7.0 | 10.5 aut |
| Vellum | 15 / 10 / 15 | 1 / 1 | 7.0 | 10.5 aut |
| Cheibriados | 22 / 21 / 26 | 0 / 1 | 7.0 | 10.5 aut |
| Okawaru, active abilities | 11 / 10 / 15 | 0 / 1 | 12.0 | 4.0 aut |
| Ashenzari, five curses | 11 / 10 / 15 | 0 / 1 | 11.2 | 8.4 aut |
| Pakellas, designated wand | 11 / 10 / 15 | 0 / 1 | 7.0 | 10.5 aut |

The Vellum fixture spends three capacity at XL 8 on Str+4 and rF+. At XL 15 and
25 it also adds rPois and SInv, spending all six capacity. Its total extraction
cost is 10 piety early and 20 later. The tests establish correct capacity and
native stat integration; they do not establish that these choices maximize power.

For this loadout Vellum supplies selected equipment coverage, while Cheibriados
supplies larger broad stat gains, Ash supplies skill gains tied to cursed gear,
and active Okawaru abilities provide a much larger attack-speed improvement.
Pakellas's primary benefit is device availability and is not represented by a
weapon-delay column. This is a useful baseline without treating unlike god
benefits as a single interchangeable score.

## Limits and next balance work

There is no campaign win-rate, donor-drop distribution, piety-income simulation,
browser gameplay or deployed-server proof in this result. Unique powers retain
their original activation conditions, and this suite does not individually
exercise every native artifact script. The fixtures cover representative
identity, state, callback, save, and conservation paths.

Keep Overweave excluded while playtesting scarce donors, high-value drawback
suppression, unique-power combinations, and the long-term cost of reconfiguration.
The initial six-capacity prices are a testable baseline, not a final balance claim.

## Retained attempts

Earlier attempts are preserved as `validation-attempt-1` through `-8`. They record
Python/dependency setup failures, compile errors, fixture corrections, and one
source-freeze rejection caused by unrelated concurrent web work. Attempt 8
passed before the final native-power prerequisite and growth tests were added.
The native input scope now excludes unrelated web files; their focused action
checks remain separate. No failed attempt is represented as a successful test.
