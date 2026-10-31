# Three-player combat freeze investigation

A three-player expedition stopped accepting actions while an enemy was present. The server log identifies the expedition but does not expose the command ownership at the point of the freeze, so the cause of this particular incident is not established.

Production baseline `/opt/dcss/releases/categorized-settings-01a1838c-r3` lacks the previously audited native/router ownership and recovery changes described in `../2026-10-26-prompt-ownership/AUDIT.md`. A disposable three-owner regression reproduced the prior ownership deadlock against this baseline. This is evidence of an applicable vulnerability, not proof of the specific incident's cause.

The candidate reconciles the prior patch with the baseline, preserving its 50 ms readiness timer and its deferred completion wake-up. Input handling tests ran locally against the candidate: 45 focused cases and 18 current lifecycle cases passed. Native source was built on Linux with flags matching the deployed object set.

An independent cross-floor clock propagation test failed against both the candidate and unchanged production `player_stream.py`: production does not implement the propagation that the test expects. The candidate test bundle explicitly skips this one pre-existing failure; it does not claim that cross-floor deadline propagation works. This gap is outside the input patch.

The original candidate tests set a private character-save directory but retained the deployed shared bones path. During the candidate test, `/var/lib/dcss/saves/bones/bones.D-1_20` changed; no live game activity was logged at that time. The probe could access that shared file, so test isolation was incomplete. Its prior contents and whether it was consumed or rewritten remain unverified; it was not restored or overwritten. A stricter rerun copies the candidate into a private source tree with private `saves` and `rcs` directories and checks live data before and after. Candidate preparation, isolated regression and activation results are recorded separately. The local baseline files are read-only copies of the installed source taken for this investigation, and candidate files are isolated from the working tree's unrelated modifications.

## Deployment

Deployed `/opt/dcss/releases/combat-freeze-01a185b7-r4` on 29 October 2026 at 04:40 UTC. The guard detected no active native games, backed up and verified 11,253 save-directory files and 350 SQLite databases, switched the release, and verified the save manifest was unchanged across cutover. The backup is `/var/lib/dcss/recovery/combat-freeze-01a185b7-r4`; the previous release is retained. This backup reflects the bones-file change described above, which occurred before the cutover backup.

The candidate passed 85 of 86 backend cases (one pre-existing cross-floor failure skipped), and its two real native input suites passed against an isolated copy with no live file hash changes. Those tests include the original three-owner regression, 96 burst commands and exact-token recovery. The live service, installed runtime hashes, public landing page and version endpoint were checked. The incident itself was not reproduced with the reported expedition, and no public three-player gameplay acceptance was performed.
