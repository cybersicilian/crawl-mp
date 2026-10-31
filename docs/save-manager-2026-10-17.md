# Save manager cleanup — 17 October 2026

Release `20261018T015800Z-save-manager` is live. Continue now lists resumable
checkpoints or actually running expeditions in compact rows, with readable Resume
labels, grouped actions, immediate search, counts and a direct My history link.
Terminal outcomes block direct and automatic resume even if a package remains.
Later shutdown callbacks cannot turn an ended expedition back into a saved run.

Cleared 60 confirmed fallen expeditions' save-manager entries and leftover save
directories. Native checkpoint files had already been removed by the engine.
All 94 game records, seven account identities and 102 linked entities remain.
All four surviving checkpoints kept their hashes and passed the unchanged native
engine's compatibility check on temporary copies. Rogue has one resumable game;
JediJosh has two. No human game was played during validation.

The library refresh now cleans up each owner's confirmed fallen saves, protecting
running/detached processes and retaining public history. Low HP, downed party
members, missing checkpoints and crashes do not qualify as death evidence.

52 backend cases passed locally and on the server. Controlled browser checks with
the complete stylesheet cascade passed cancellation, keyboard deletion, error and
busy states, running protection, retained search/focus, empty states, history,
primary label contrast and layouts from 320 to 2674 pixels wide. Installed source
and public browser asset hashes matched. HTTPS health, preserved record pages,
resume eligibility APIs and database integrity passed. Browser interaction checks
used controlled protocol fixtures; native checks inspected copied checkpoints.

The first activation rolled back automatically because its application health
probe targeted the proxy-only `/healthz` route. After correcting it to the
documented `/status/version/` endpoint, activation and health checks passed.
The previous release and a pre-cleanup recovery copy are retained:

- Previous release: `/opt/dcss/releases/20261018T010235Z-character-lock`
- Persistent recovery: `/var/lib/dcss/recovery/save-manager-20261018T015800Z`
- Browser revision: `5c9664eb834907a69b6e`
- Native SHA-256: `9f821cf47dce2ac23305a583082bbd1afd854052459c80bb510b3a19f9f801af`

Only five runtime files changed. Independently pending party-persistence work was
excluded from this release. Every changed JavaScript/CSS file stays below 600 lines.
