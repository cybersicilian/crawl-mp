# Tutorial tips

Friendly, one-at-a-time advice the first time a player meets something new. A
tip never pauses the game, takes keyboard focus or sends a game command.

## What a player sees

A small card appears in a corner of the dungeon view, outside line of sight at
most window shapes. It closes on **Got it**, on `Esc`, after the chosen time, or
as soon as the player does what it describes. `Esc` closes a showing tip before
it opens the game menu. Hovering holds a tip open.

Each tip shows once per account, across characters and devices. Pressing a key a
tip would teach counts as knowing it, so a player who already presses `o` never
gets the Explore tip. Tips are silent in the Tutorial mode, which teaches through
its own map, and for spectators.

## Settings

The Game menu (`Esc`) has **Tutorial tips**, and the account page at
`/settings/graphics#profile_tips` has the same controls. Both save to the
account.

| Setting | Options | Default |
| --- | --- | --- |
| Show tips | All tips, Essentials only, Off | All tips |
| How often | Often (30 s), Now and then (60 s), Rarely (150 s) | Now and then |
| Keep each tip on screen | 10 s, 20 s, 45 s, Until I close it | 20 s |
| Text size | Standard, Large, Extra large | Standard |
| Where tips appear | Top left, Bottom left | Top left |
| Highlight the button | On, Off | On |
| Let Jev choose | On, Off | On |

The in-game dialog also has a sample card that follows the text size, a journal
of every tip already met, and **Show every tip again**.

Urgent tips ignore the wait between tips and replace a showing tip. They cover
immediate danger, native prompts and fallen heroes. They still respect Off and
Essentials, and they are never sent to Jev, so a network call cannot delay them.

Accessibility: the card is announced from a permanent polite live region, so a
screen reader hears it with no focus change. Key names use text key caps, the
highlight is an outline rather than a colour change, and the entrance animation
follows the system and account reduced-motion choices. High Contrast gets a solid
black card with a heavier border.

## How a tip is chosen

`static/tutorial-tips.json` is the one catalog of text, levels, urgency and the
keys that count as practice. Order is priority, and urgent tips come first. The
server sends it in `tips_state`, and `tutorial_tips_test.py` checks its shape.

`tutorial-tips-model.js` holds one rule per tip, and the test suite fails if a
catalog tip has no rule or a rule has no tip. `tutorial-tips.js` builds a plain
view from the same party snapshot and map data the Next step panel reads, at most
every 400 ms. Prefer existing native state; add a native field when the engine
has authoritative information that the snapshot does not expose. Orb ownership,
for example, uses `player_has_orb()` because acquiring it advances the shared
chapter without putting an item in the pack.

A tip with `during` belongs to another input mode: `target` while aiming, `prompt`
during a native prompt, and `downed` for a fallen hero. Everything else appears
only during normal play. A few moments have no state field, so `signals` in the
model reads the engine's own message text and holds each one for 45 seconds.

To add a tip, add a catalog entry and a rule. Check any key against
`cmd-keys.h`: `p` is autofire in this fork, and altars and shops use `<` or `>`.

## Coverage

The catalog has 83 tips. Coverage is checked, not estimated.

`tests/tutorial-tips.test.cjs` reads the engine's source and fails when:

- a native hint event in `hints.h` has no tip and no written reason for having none
- an item class in `invent.cc` has no tip that fires
- a branch, portal, altar or trap in `feature-data.h` is not recognised
- a message signal no longer matches what the engine prints
- a tip names a key that `cmd-keys.h` does not bind

The ten native events with no tip are listed in that test. Nine no longer occur
in the game, and the enemy rail already covers a monster leaving view.

`tests/tutorial-tips-native.cjs` stages situations in a real game with the
engine's scripting and asks the live client which tips fit. It needs a debug
build, because that exposes the wizard console:

```sh
WEBTILES_URL=http://127.0.0.1:8932 TACTICAL_BROWSER_CHANNEL=chrome \
  NODE_PATH=/path/to/node_modules node tests/tutorial-tips-native.cjs
```

This test found bugs the mocked tests could not. Books never reach the pack in
this fork, so a rule that looked for one could never fire.

All 83 catalog rules have passed eligibility checks against real native game
states. The durable ledger is
`docs/releases/continuation-2026-11-01/tutorial-coverage.json` in the repository
root; it lists every proven id, scenario and hashed receipt, including failed
attempts and the fixes that followed them. This proves rule eligibility, not that
every tip was automatically selected and displayed during ordinary play.

The native harnesses cover single-player inventory, terrain, prompts and status
changes; two connected players, split floors and fallen heroes; and additional
scenarios for long-lived games, full packs, Automatons, Orb acquisition and AI
seats. The Orb scenario rejects the nearby glow before pickup and accepts actual
native ownership afterward. Contamination and simple backlighting are separate.
The AI-seat scenario uses an isolated local provider fixture and does not verify
live Jev inference or a production API key.

Run all three native harnesses on a quiet, gate-reserved host:

```sh
for test in tutorial-tips-native tutorial-tips-party-native tutorial-tips-additional-native; do
  WEBTILES_URL=http://127.0.0.1:8932 TACTICAL_BROWSER_CHANNEL=chrome \
    TIPS_PROOF_DIR=/path/to/disposable-proof NODE_PATH=/path/to/node_modules \
    node tests/$test.cjs
done
```

The QA server must enable its isolated test provider for the AI-seat fixture.
`TIPS_PROOF_DIR` records passed scenarios and live diagnostics after each check.
Use a debug build and disposable accounts/saves; these fixtures invoke the wizard
console and deliberately kill a test hero. They do not target production.

## Jev

Jev (System One) is a closed-set chooser, not a writer. When two or more tips fit
a moment, the client sends `tip_choose` with the candidate ids and a short
situation summary. `tip_advisor.py` asks Jev to pick one and the card is labelled
**Jev's tip**. Jev can only return an authored catalog id, so it cannot invent
advice.

| Limit | Value |
| --- | --- |
| Per account | 1 call every 15 s, 30 calls per hour |
| Per server worker | `DCSS_TIP_CALLS_PER_HOUR`, default 600 |
| Request timeout | 3 s on the server, 2.5 s in the browser |
| Candidates | At most 8 |

Tips have their own hourly ceiling, so they can never use up the budget of a
party's AI players. Each account has about 83 tips to meet, and only moments
with two or more candidates make a call, so normal use is a small fixed cost per
player.

With no `TYPESAFE_API_KEY`, a disabled setting, a spent budget, an error or a slow
reply, the client shows its first candidate instead. The player sees a normal
tip and nothing fails. The reply is ignored if the situation changed while it was
pending.

The summary holds health and magic as fractions, level, turn count, place,
species, background, god, status names and nearby creatures. It never holds the
player's name, account or chat. Only lowercase creature names pass the server's
filter, so player ghosts and named characters reach the provider as `creature`.

## Space

Next step used to take all spare rail height. It held a static controls
reference and a rotating tip, which are now contextual tips. The footer strip
also moved beside the map on wide windows. See
[the guidance pass](ui-overhaul-2026-10-30/space-and-guidance-pass.md).

## Tests

```sh
cd crawl-ref/source/webserver
node --test tests/tutorial-tips.test.cjs tests/play-guidance.test.cjs
../../../.venv/bin/python -m unittest webtiles.tutorial_tips_test
```
