# Pakellas implementation and validation

The rework is implemented in native source with explicit payment and effect
requests. The C++17 WebTiles game and Catch2 executable link, the native
Pakellas and party regression suites pass, and the isolated local browser
scenario passes. The corrected Linux release candidate passes its native
contracts and all six controlled-fixture browser groups. Its save loader also
handles the wizard-only hotkeys that previously prevented fixture restoration.
The [design specification](README.md) remains the
reference for the initial balance values.

## Native mechanisms

| Mechanism | Source | Behavior |
| --- | --- | --- |
| Recharge accounting | [recharge-account.h](../../../crawl-ref/source/recharge-account.h), [recharge-account.cc](../../../crawl-ref/source/recharge-account.cc) | Fixed-point work, bounded readiness, credit-preserving reconfiguration, one outstanding loan and repayment before recovery. No dependency on a deity, item or UI. |
| Explicit evocation | [evocation.h](../../../crawl-ref/source/evocation.h), [evoke.cc](../../../crawl-ref/source/evoke.cc) | Per-activation damage, duration, application and support parameters. A payment callback commits once after targeting; ordinary evocation retains native item payment. |
| Workshop policy | [god-pakellas.cc](../../../crawl-ref/source/god-pakellas.cc) | Profiles, per-character saved accounts, Prototype identity, recovery, once-only Field Kit and legacy migration. |
| Divine actions | [god-pakellas-abilities.cc](../../../crawl-ref/source/god-pakellas-abilities.cc) | Device and funding choice, authoritative restrictions, exact piety costs, borrowing and rollback after native cancellation. |

The old Pakellas ability IDs remain 1230, 1231 and 1232. New Field Kit and
Prototype activation IDs occupy the following unused entries. Existing
one-time Supercharge history is preserved separately from new gift and loan
state. The native saved property table stores versioned workshop state and
item ownership marks; inventory letters do not own the account.

Wand reserve use and finite-charge use remain separate. Ordinary wands retain
equipment charge-conservation behavior. Funded Overclock pays its explicit
capacity price, and a borrowed activation does not also debit ordinary charges.
Legacy MP-on-kill, random Pakellas charge conservation, blanket party recharging
and the one-time capacitor storm are replaced by the new progression.

Every current wand has an explicit reserve profile. All thirteen current XP
evokers have enhancement descriptions and native effect adapters. Digging can
be a renewable Prototype but receives no paid Overclock enhancement.

## Direct actions and ownership

Item context menus expose designation, Prototype use, Overclock and
Breakthrough with native costs, enhancements and blocked reasons. Combat
actions can be pinned directly from the quickbar catalogue. A Prototype pin
follows a deliberate new designation; an Overclock pin for a particular
device follows its native unique ID across inventory moves. Removing its
reserve funding makes that pin unavailable rather than spending finite
charges instead.

Requests carry the expected character, item name, unique item ID and workshop
state. The native engine revalidates the action and its payment before the
effect. Normal targeting, ally warnings, resistance, silence where required,
summoning limits and companion eligibility remain in the native effect path.
Per-character status and descriptions show readiness and loan progress.

## Verification

The focused JavaScript contracts currently pass:

- [pakellas-actions.cjs](../../../crawl-ref/source/webserver/tests/pakellas-actions.cjs)
  checks item identity, inventory moves, changing Prototype, funding changes,
  blocked actions and legacy binding compatibility.
- [quickbar-model.cjs](../../../crawl-ref/source/webserver/tests/quickbar-model.cjs)
  retains existing quickbar and inventory-slot contracts.

Syntax parsing passes for the modified quickbar, workflow and item-menu
JavaScript. Each modified web code file remains below the 600-line limit.

The [native Pakellas suite](../../../crawl-ref/source/catch2-tests/test_pakellas.cc)
passes all sixteen cases and 2,719 assertions. It covers recharge conservation, overheat,
packet-independent XP conversion, loan ordering, scoped payment, progression,
rebinding, native subtype debt, ownership, serialization, legacy history,
rejected-action payment, retention of native evocation restrictions, and Field
Kit transfer without an unlinked temporary copy.

The existing party session and trade suites pass all eighteen cases and 425
assertions. The native build, matching generated tile assets and test execution
used a frozen source binding under the canonical host-heavy gate, with two
compiler jobs. An initial complete build established the object cache;
subsequent passes retained only this chat's objects with unchanged source,
dependency and compiler-flag bindings. Missing includes in adjacent Oozle
files were corrected, and the isolated archive build supplies its required
`util/release_ver` metadata. All owned build/test processes exited and the
successful reservation was explicitly released.

Validation uses `WEBTILES=y STDFLAG=-std=c++17 NO_OPTIMIZE=y`, followed by
`catch2-tests-executable '[pakellas]'` and
`catch2-tests-executable '[party-session],[party-trade]'`.

The frozen [browser scenario](../../../crawl-ref/source/webserver/tests/pakellas-native.cjs)
passes against the corrected binary and matching assets. It checks actual quickbar
pinning and targeting cancellation, distinct funding sources, borrowing,
depleted reserve pins, stale-item rejection and save/reload in a disposable game.
All six browser check groups pass with no page errors. Their sixteen observed
owned processes, including separate browser and game sessions, exited; an
independent process check confirmed closure before the reservation was released.
All 2,108 bound inputs still matched after teardown. Earlier fixture failures
remain recorded. They led to explicit welcome-prompt handling, a guard for
message packets without message arrays, and the Field Kit transfer regression.

The assertions and setup are now shared by explicit runtime adapters. The
[Linux consumer](../../../crawl-ref/source/webserver/tests/pakellas-linux-native.cjs)
uses a disposable, visibly wizard-marked saved fixture with the exact unchanged
NOWIZARD binary. It uses normal melee XP and native save/reload; its fixture
generation and candidate-runtime acceptance require distinct scheduled phases.
The corrected Linux release build passes 73 cases and 3,855 assertions across
the combined feature, party and save-compatibility suites, including all sixteen
Pakellas cases. All-spells, native starts, catalog, backend and runtime preview
checks also pass. Its build root and observed processes have closed, and the
remote coordination lock was independently acquired after closure. That native
result does not establish candidate browser behavior.

The controlled fixture was created through native wizard setup, saved normally
and exported without changing its bytes or wizard marker. Its original package
and exported copy match exactly. On the first Linux consumer run, native loading
rejected saved terrain-editor hotkey 10000 because `NOWIZARD` builds omit those
abilities from their enum range. That negative result remains recorded separately
from acceptance of the corrected binary.

The compatibility correction decodes only the three known unavailable
wizard hotkeys as unassigned in release builds. It keeps the character's wizard
history, original range and zero checks, and all other saved state. Wizard builds
retain those bindings. The [serialization regression](../../../crawl-ref/source/catch2-tests/test_tags.cc)
checks ordinary bindings, the three editor IDs and neighboring unknown IDs.
All sixteen release-build assertions pass, and the unchanged fixture restores
successfully with its wizard marker and Pakellas state. A subsequent browser
preflight exposed a test assumption: native game identity persists inside the
save, while importing creates a new library database row. The consumer now
retains both acknowledgements outside its bounded packet log and verifies each
against its own exact expected ID. Save-header metadata alone is not
full-save-load proof.

All six unchanged shared gameplay groups now pass on the corrected Linux
`NOWIZARD` binary (`86a4bd2357e4e7ea74ee2a88518256c4e977eba6c15148e8b646ddd83a9528e7`).
The actual melee kill took three attempts and reduced the loan from 100% to
99%, preserving the four finite charges and pausing reserve recovery. Native
save/reload preserved item identity, charge debt and gift history. Both the new
library row and original saved native game ID matched their expected values.
There were no page errors. The root and twenty observed owned processes closed,
the coordination lock was released, and all bound source, candidate and original
fixture inputs still matched after teardown.

This is controlled gameplay evidence using an explicitly wizard-marked fixture
on the release binary. It does not establish an untouched ordinary playthrough
or production activation.

Run-level balance requires the mixed encounters described in the design.
