# Automaton heat dissipation — 2026-10-30

This rework supersedes the earlier change that disabled mana-dependent effects.
Automatons now use thermal equivalents of those effects:

- Magic regeneration becomes heat dissipation.
- Magic restoration dissipates heat; resource spending or draining builds heat.
- Magical-power bonuses increase heat capacity.
- Guardian spirit absorbs damage by building heat. At full heat it cannot absorb
  additional damage until some capacity is recovered.
- Channelling, MP-powered equipment, party recovery, and borrowed resource
  bonuses work with the same thermal reserve.

`player::uses_magic_reserve()` distinguishes the shared resource from HP casting;
`has_mana()` still correctly identifies an automaton as having no actual mana.
These queries read the owning hero's state, independent of the active hero.
The existing MP fields retain the inverse heat reserve for save compatibility.

Visible item names and descriptions use thermal wording, including amulets of
heat dissipation, rings of heat capacity, and potions of cooling. Database names
and stored item types remain canonical, preserving item lookup and save
compatibility. Recovery messages, ability costs, character metrics, and heat
help use the same model. Ordinary mana users retain their existing terminology.

Natural cooling and aborted-spell refunds use explicit thermal recovery. Cooling
also signals full-resource attunement, so dissipation gear can attune normally.
The existing engraving triggers, combat cooling delay, and berserk behavior are
preserved.

## Verification

The isolated C++17 native test executable built successfully.

- Focused `[automaton-thermal]`: 6 tests, 61 assertions, all passed.
- Full `[automaton]`: 121 tests, 877 assertions, all passed (includes focused tests).
- Heat-help unit contracts, companion stats Node contracts, and JavaScript
  syntax checks passed. Browser-only companion checks were not run because
  Playwright was unavailable in the test module path.
- `git diff --check` passed; all edited web-language files remain below 600 lines.
- The final frozen native snapshot matched current source after verification.
- Every heavy phase used the shared host gate; its exact reservation was
  released after all owned process groups exited.

Final binding:
`c8de8a82c82825f7e185477d084fd8c938f517dcbaad4a80d593345670831e8a`.

Frozen inputs and test evidence are under
`/private/tmp/dcss-automaton-thermal-01a18e41/`.
No deployment or saved-game migration was performed.
