# DCSS production deployment

Production target: **https://dcss.iancaltabiano.com**.

Current deployment uses project `chuk-437319`, VM `dcss-coop-server`, state disk
`dcss-coop-server-data`, network `dcss-coop`, and address `136.64.61.41`.
Cloudflare DNS is managed separately from the deployment script.

## Minimal runtime

- One Ubuntu 24.04 Compute Engine `e2-medium` in `us-central1-a`.
- 40 GiB balanced boot disk and a separate 10 GiB balanced state disk.
- A reserved public IPv4 address, plus an existing-provider DNS A record.
- Caddy handles HTTPS, certificate renewal, and WebSocket proxying.
- The native game and Python/Tornado WebTiles run under a dedicated service user.
- The VM has no cloud service account. Administrative SSH uses IAP; public
  ingress is limited to ports 80 and 443 on this game's isolated network.

Use `customer=rogue,app=dcss-coop` on resources supporting labels. The configured
Google Cloud project must have billing enabled. The CLI verifies its active
account and project before creating resources.

## Deploy

To collect changes without activating production, freeze a bundle outside the
checkout. Tracked edits and new source files are included together. The command
rejects edits during packaging and writes an archive, a per-file manifest,
checksums, source provenance, and an optional comparison with a previous manifest.

```sh
python3 deploy/prepare_release.py create "$PWD" /tmp/dcss-webview-release
python3 deploy/prepare_release.py verify /tmp/dcss-webview-release --source "$PWD"
./deploy_gcloud.sh --project PROJECT_ID --bundle /tmp/dcss-webview-release --dry-run
```

The source check reports additions, modifications and deletions after the freeze.
Verification without `--source` checks the frozen bundle independently of later
checkout edits. To deploy that exact bundle after validation, remove `--dry-run`.
The deployment uses the bundle's release ID and bootstrap; it does not repackage
the checkout or delete the reviewed archive. A source bundle still needs its
Ubuntu native build, save compatibility checks, snapshot, and activation checks.

```sh
./deploy_gcloud.sh --project PROJECT_ID --dry-run
./deploy_gcloud.sh --project PROJECT_ID --domain dcss.iancaltabiano.com
```

The script packages tracked and new working source, preserving uncommitted game
and UI changes. It excludes local credentials, accounts, saves, and host build
artifacts. Each release builds in its own directory under `/opt/dcss/releases`.
The initial full build can use `BUILD_JOBS` on a temporarily larger VM; runtime
returns to `e2-medium`. Normal updates compile with two workers and 4 GiB swap.
Before activation, native creation contracts run alongside backend tests.
`verify_preview_runtime.py` also exercises real previews as the `dcss` service
user, so root-only build success cannot hide read-only release permission errors.

Set the DNS record to the reserved IP printed by the deployment, initially in
DNS-only mode. A successful local service health check is not proof that public
DNS, HTTPS, or gameplay works; complete the verification below.

The optional `--mode cloudrun` path is an ephemeral demonstration. It retains
its original container deployment capability, but does not preserve accounts or
expeditions across container replacement.

## Persistent state and backups

`/var/lib/dcss` is a separate disk retained when the VM is deleted. Releases
symlink their native `rcs` and `saves` directories to this disk. Account and
settings databases also live here, outside application releases.
`CRAWL_LIBRARY_DIR=/var/lib/dcss/rcs/library` keeps stored native package paths
independent of the physical release directory. In particular,
`rcs/library/` contains the save index, native packages, and event records;
`rcs/coop_chronicle.db` contains Chronicle data.

Daily snapshots start in the 04:00 UTC hour and retain seven days. Snapshots
are stored off the VM and survive deletion of the source disk. They capture
the latest on-disk native checkpoint; unsaved turns in memory are not a backup.
Hourly recovery jobs additionally use SQLite's online backup API and integrity
checks to store independent database copies in `recovery/sqlite/` on the state
disk. These copies are included in disk snapshots.

Restore a snapshot into a **new disk**, attach it separately, and inspect its
SQLite integrity, recovery manifest, and native packages before switching the
service to recovered data. Preserve the original disk until recovery is verified.
Never overwrite the only copy of a save as a recovery test.

## Operations

For an operator-requested account cleanup, first review an explicit allowlist plan
with `deploy/archive_records.py`. Its default scope covers game records only.
Supplying `--accounts-db /var/lib/dcss/accounts.db3` and
`--settings-db /var/lib/dcss/settings.db3` additionally archives other login
accounts, recovery tokens, settings, and account rc/macro files. Use the installed
webserver package for the canonical record parsers. Before applying account
cleanup, quiesce the service and finish other deployment or gameplay checks.
`--apply --archive /var/lib/dcss/recovery/UNIQUE_DIRECTORY` creates online SQLite
backups and moves removed files outside ingestion. Restart the service afterward
to clear old login sessions and derived in-memory views. Check the completion
manifest, retained-file hashes, database integrity, and public player list.

```sh
gcloud compute ssh dcss-coop-server --project PROJECT_ID \
  --zone us-central1-a --tunnel-through-iap \
  --command='sudo systemctl status dcss-coop caddy; sudo journalctl -u dcss-coop -n 40 --no-pager'
```

`dcss-health.timer` checks the application and state-disk free space every
minute. `/healthz` exposes only health flags and a timestamp. The production
Monitoring uptime check validates HTTPS and those flags from three US regions
at five-minute intervals. `deploy/monitoring.sh PROJECT DOMAIN OWNER_CHANNEL`
creates the check and an alert policy using an existing owner notification
channel. The policy waits for failures in at least two regions for five minutes. No VM cloud credentials or extra metrics agent are needed.

`dcss-recovery.timer` refreshes verified SQLite recovery copies hourly. Inspect
failed systemd units as well as service logs during operation.

A new release is built and tested before stopping the running service. It is
activated by switching `/opt/dcss/current`; the previous release remains in
`/opt/dcss/previous`. A failed application health check restores that previous
release. Database migrations must remain compatible with the intended rollback.
Updates briefly disconnect players; a single VM provides no automatic failover.

## Validation

```sh
python3 -m unittest discover -s deploy -p 'test_*.py' -v
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest \
  webtiles.chat_tags_test webtiles.game_library_test
node deploy/live_smoke.cjs save
# Restart the remote service, refresh recovery copies, and capture a snapshot.
node deploy/live_smoke.cjs resume
```

The deployment smoke check targets this production hostname explicitly. It
creates new disposable accounts, checks two-client co-op and chat, writes a
native save, and verifies hero identities/state after a real service restart.
It checks owner isolation and public record pages without enabling wizard mode.
Credentials are kept only in a mode-0600 local proof file; screenshots and
credential-free evidence are stored under `/tmp/dcss-live-proof` by default.
Playwright and an installed Chrome browser are required for this test.

## Launch evidence — 16 October 2026

- Runtime confirmed as `e2-medium`; the larger initial-build size was temporary.
- Trusted HTTPS, HTTP redirect, fresh registration, two-client co-op, bidirectional
  chat, and a normal native save passed through the public hostname.
- After a real service restart, browser login and native resume preserved hero
  IDs, HP/MP limits and current values, level, and location. Cross-account load
  was rejected and public record pages rendered successfully.
- All 22 backend chat/library tests passed on Ubuntu; four local deployment
  tests cover source/state isolation, SQLite WAL recovery, and stable save paths.
- Snapshot `dcss-launch-20261016-stable` was restored to a separate read-only
  disk. All 15 recovered SQLite databases passed integrity checks, and the native
  save package matched the live saved checkpoint byte-for-byte. The disposable
  verification disk and superseded snapshot were removed afterward.
- Daily snapshot policy: `dcss-daily`, 04:00 UTC, seven-day retention.
- Uptime check: `dcss-availability-and-disk-6faYrLOfync`.
- Alert policy: `6809948887770889384`, using the existing owner email channel.
- Credential-free launch evidence and screenshots: `/tmp/dcss-live-proof/` on
  the deployment operator's computer. Test credentials are private and excluded
  from source packages.

## Lobby release — 17 October 2026 UTC

Release `20261017T034814Z` is active. The native binary was rebuilt on Ubuntu
with wizard mode disabled. All 39 backend release tests, native creation
contracts, runtime-user preview checks and the real service sandbox preview
probe passed. Public HTTPS checks matched frozen browser assets and complete
native fighter, caster-companion and Wanderer snapshots, including descriptions,
casting details and equipped doll layers; the content-addressed atlas verified.
All five previously loadable checkpoint copies retained identical native save
metadata and loadability. Health/recovery units succeeded; the prior verified
release `20261016T230350Z` remains available through `/opt/dcss/previous`.

Public verification found the engine's no-save package needs a scratch file in
its working directory. Preview subprocesses now receive a private temporary CWD
and save directory while resolving game data from the immutable release. A
regression test covers a read-only release and cleanup; future deployments check
the actual runtime user before activation. The corrected Python-only release
reused the verified native binary without another native rebuild.

Existing-account login and its saved expedition rendered through public HTTPS.
Automatic approval review rejected creating a new production test party because
it would create production state, so no such party was created. Tooltip data,
starting builds, asset identity and atlas delivery were verified read-only;
the lobby tooltip UI had already been checked locally against these assets.
Evidence: `/tmp/dcss-lobby-tooltip-deployment-proof/`.

## Multiplayer control repair — 17 October 2026

Release `20261017T134734Z-party-control` is active. The scoped update preserved
the preceding tooltip release and rebuilt the native engine with wizard mode
disabled. All 67 backend tests, native creation contracts and runtime-user
previews passed before activation; all 15 scoped source hashes matched afterward.

Two fresh QA accounts then passed ten real native actions through public HTTPS:
alternating keyboard and pointer movement changed only the sender's hero,
explicit host companion selection survived guest input, claimed heroes could
not be taken, shared prompts rejected the other player's keys, and reconnects
retained the guest's hero. The test expedition was saved and exited. Application,
disk, health and recovery checks passed. Evidence and screenshots are in
`/tmp/dcss-party-control-live-proof/`; the preceding release remains available
through `/opt/dcss/previous`.

## Unified tooltip release — 17 October 2026

Release `20261017T133100Z-tooltips` updates 12 browser assets over the verified
`20261017T034814Z` release. The native binary hash and persistent-state symlink
targets are identical. The previous release remains available for rollback.

Lobby, character creation, HUD, map, action-panel and nested help now share a
300 ms hover delay. Keyboard focus remains immediate. Shared placement avoids
the source and important controls, fits the viewport and keeps nested cards
apart; constrained chains offer Back. Native browser title hints join the same
system, retaining accessible names and dynamic updates. Escape, outside actions
and focus loss dismiss previews, and competing game roots close each other.

Local browser checks passed for shared timing/cancellation, five viewport sizes,
nested glossary travel, item rendering, character-sheet scrolling/focus and
character guidance. Fresh isolated native checks passed for HUD workflows,
spell/ability descriptions and map hover timing/dismissal without consuming turns.
All changed web code files remain under 600 lines.

Production activation checked all asset hashes, the asset-revision contract and
three real runtime-user character previews before switching. Health and recovery
jobs succeeded. Trusted public HTTPS delivered matching shared/lobby assets;
the public page and keyboard tooltip rendered without JavaScript errors.
Production gameplay was not advanced for this release check. Small viewports
can still require previews over background content; the hovered control stays
clear, long content scrolls, and Escape dismisses the preview.

Evidence: `/tmp/dcss-tooltip-release/`, `/tmp/dcss-tooltip-overlap-proof/` and
`/tmp/dcss-tooltip-power-native-proof/` on the deployment operator's computer.

## HUD and hotkey release — 17 October 2026

Release `20261017T174328Z-hud-hotkeys` is active. It includes the compact party
HUD, 16 px sprites, deity/status effects, consolidated player details and action
areas, and the completed native-menu hotkey repairs. The native engine was
rebuilt on Ubuntu with wizard mode disabled. All 108 unittest cases and 27
additional pytest cases passed, along with native creation contracts and three
runtime-user character previews. Nine read-only checkpoint copies retained
compatible metadata and loadability; existing human expeditions were not played.

Installed hashes matched 295 frozen source files. Trusted public HTTPS delivered
all 223 checked browser assets with matching hashes. Public Chrome checks passed
178 intercepted key-routing probes, 20 browser key combinations, five retained
web panels, real native spell browsing and the game menu, 16 px sprite rendering,
and a four-hero save/resume with identities and player state preserved. The QA
expedition was saved and exited. Local native pickup/menu workflows also passed;
the intercepted routing matrix does not represent 178 native gameplay actions.

Application, disk, health and recovery checks passed. Pre-release state snapshot
`dcss-pre-hud-20261017-174328` is ready; release
`20261017T134734Z-party-control` remains available through `/opt/dcss/previous`.
Credential-free evidence is in
`/tmp/dcss-release-20261017T174328Z-hud-hotkeys/public-evidence.json`, with the
public browser screenshots in its `public-hotkeys/` directory. Replacement icon
set sourcing continues separately and is not included in this release.

## Complete source and equipment release — 17 October 2026

Release `20261017T202009Z-equipment-complete` is active. All 12,120 frozen
source files match the installed release. The rebuilt native engine passed
15,600 assertions, backend checks passed 119 unittest and 27 pytest cases,
and six deployment tests passed. Thirteen retained checkpoints stayed compatible.
The Ubuntu-produced 173-state equipment browser matrix passed at four widths.

Public HTTPS menus, inspection return, Gear filters and native profile fields
passed for Octopode, Naga, Coglin and Poltergeist. A disposable four-hero
expedition passed save/resume with identities, stats and equipment profiles
preserved, and was saved and exited. All 244 checked public assets matched,
including the current HUD overlay and seven native atlases. Health and recovery
checks passed; both state paths point directly to the persistent disk.

The packager now explicitly includes the declared, verified runtime HUD atlas
even when Git ignores licensed overlays; private source packs remain excluded.
The installer also handles empty validation-created state directories without
nesting symlinks or deleting data. Snapshot
`dcss-pre-equipment-20261017-202009` is ready, and the previous HUD release
remains available through `/opt/dcss/previous`.

See [the deployment report](../docs/deployment-2026-10-17-equipment.md)
for evidence, hashes and validation boundaries.

## WebSocket stability release — 17 October 2026

Release `20261017T212113Z-websocket-stability` is active. Its 20-file overlay
preserves the equipment release and the identical native binary. All 12,130
installed source hashes matched the frozen manifests. Production-runtime checks
passed 133 unittest cases, 27 pytest cases, six deployment tests and three
runtime-user previews. Heartbeat settings adapt to Tornado 6.4 and 6.5 timeout
semantics, preserving a 20-second response window after each protocol ping.

Public HTTPS verified all six changed browser assets. An idle browser remained
on one uninterrupted WebSocket for 45 seconds. Eight real recovery scenarios
passed across compressed and uncompressed traffic: repeated host/guest drops and
offline/online transitions preserved expedition identity, hero control and turn
clocks; native inventory input worked afterward. Both disposable QA expeditions
were saved and exited. The pre-existing expedition remained saved and loadable.

Application, Caddy, health and recovery checks passed. Snapshot
`dcss-pre-ws-20261017-212113` is ready; the equipment release remains available
through `/opt/dcss/previous`. Refresh existing browser tabs to load the update.
Credential-free evidence is in this chat's
[deployment folder](/Users/iancaltabiano/.codex/visualizations/2026/10/17/01a14baa-67c8-7641-9b5f-d1efdbc91703/deployment-20261017T212113Z/release.json).


## Logout release — 17 October 2026 (Denver)

Release `20261018T003457Z-logout` adds an explicit **Log out** button in the
lobby header, Chronicle, stats, and record pages. The shared POST handler revokes
the presented login token, clears the cookie, and redirects to sign-in before
another login can occur. The account menu retains email and password settings.

The scoped 12-file release passed 35 backend tests on the production runtime.
All installed file hashes and four public browser-asset hashes matched the
frozen payload. Public HTTPS browser checks passed all six views at desktop and
mobile widths, including 320 px: keyboard logout returned to sign-in, reload
stayed signed out, and replaying a copied revoked token failed. Verification used
one disposable QA account and launched no game.

The native binary is unchanged. Account and save paths still point to the
persistent disk. Application, Caddy, health, and recovery checks passed;
`20261017T230917Z-all-updates` remains available through `/opt/dcss/previous`.
Refresh an existing browser tab to load the new controls. Local evidence:
`/tmp/dcss-logout-deploy/deployment-receipt.json` and its `public-browser/` folder.

## Multiplayer character control release — 17 October 2026 (Denver)

Release `20261018T010235Z-character-lock` keeps each multiplayer player on their
assigned character, including the host. Joining locks both players to their
reservations; other turns, delayed acknowledgements, downed characters and
browser reconnects cannot transfer ownership. Switch controls disappear in
multiplayer, while solo companion switching remains available.

The scoped 13-file release passed 185 backend unittest cases, 27 pytest cases
and six deployment tests on the production runtime. All installed file hashes
and five public browser asset hashes matched. Public HTTPS verification used
two disposable accounts and eight real native actions to check keyboard and
pointer movement, camera ownership, rejected direct and nested switch/cycle
requests, shared-prompt isolation and reconnects. The QA expedition was saved
and exited; no JavaScript errors occurred.

The native binary and persistent state paths are unchanged. Application, Caddy,
health and recovery checks passed. Pre-release snapshot
`dcss-pre-character-lock-20261018-0105` completed, and the logout release remains
available through `/opt/dcss/previous`. Refresh existing browser tabs to load
the updated controls. Credential-free evidence:
[deployment receipt](/Users/iancaltabiano/.codex/visualizations/2026/10/18/01a14c7a-76a7-7601-917e-6a03c6228c9f/deployment-20261018T010235Z-character-lock/deployment-receipt.json).


## Asset-only context menus — 18 October 2026

Release `20261018T204045Z-context-loader-assets` is active. Sixteen browser assets provide context
menus and deterministic legacy-plugin startup. The native binary is unchanged;
no recompilation was performed. Public asset hashes and menu actions passed
with zero JavaScript errors. Refresh an existing game tab to load the update.
See [deployment details](../docs/deployment-2026-10-18-context-menus.md).

## Blood Liturgist release — 19 October 2026

Release `20261019T174900Z-blood-liturgist` renames Blood Hunter to Blood Liturgist
(`BL`) and starts new characters worshipping Vorr at 35 piety. The original
equipment, spells and saved-job ID are preserved. The scoped overlay retains
the deployed Tortle changes and excludes unrelated later workspace work.

The Ubuntu build, 28 scoped native cases, 76 backend tests, native catalogue,
runtime-user previews and fresh isolated/public character creation passed.
Public gameplay confirmed Vorr worship, one-star piety and Rupture. Eight
retained checkpoints remained compatible; all 13,212 frozen file hashes matched.
Snapshot `dcss-pre-liturgist-20261019t175027z` reached READY before activation;
`20261019T162535Z-tortle-dash` remains the previous release. Health and recovery
passed, and all task-owned remote helper groups closed. Refresh an existing tab.

See [the bloodcraft verification record](../docs/bloodcraft.md#validation).

## Vorr corpse fuel and self-exsanguination — 19 October 2026

Release `20261019T183400Z-vorr-rites` adds intact blood-bearing corpses as
one-unit ritual fuel. Each missing blood unit can instead cost 10% of maximum
HP, rounded up per unit, with a nonlethal confirmation after targeting. Native
descriptions now explain effects, damage, ranges and payment. Three-star Blood
Communion shortens attack delay by 2% per nearby fresh blood unit, capped at 20%.

The scoped 15-file overlay passed 40 native cases (439 assertions), 76 backend
tests, runtime-user previews, and unchanged metadata/loadability on 11 copied
checkpoints. Isolated and public HTTPS fresh-game checks confirmed starting Vorr
worship and the actual corpse/maximum-HP tooltip, with no JavaScript errors.
All 13,215 frozen file hashes matched after activation. Snapshot
`dcss-pre-vorr-rites-20261019t183432z` reached READY first; the Blood Liturgist
release remains available through `/opt/dcss/previous`. Health and recovery
passed, and all task-owned remote helper groups closed.

See [the Vorr implementation record](../docs/design/vorr/implementation-status.md#corpse-fuel-self-exsanguination-and-attack-speed--19-october).

## Uncapped Vorr speed and vampiric starting weapons — 19 October 2026

Release `20261019T184637Z-vorr-speed` gives three-star Blood Communion uncapped
+2% attack and movement speed per visible fresh blood unit within four cells.
Delay is divided by the speed multiplier; engine action time stays positive.
New Blood Liturgists receive vampirism on their selected starting weapon.
Self-exsanguination requires both a blood-bearing species and current body;
bloodless characters see that the health substitution is unavailable.

The scoped 16-source-file overlay and regenerated catalogue passed 44 native
cases (624 assertions), 76 backend tests and runtime-user previews. Twelve
copied checkpoints retained loadability and identical metadata. Isolated and
public HTTPS Human/Gargoyle starts verified vampiric weapons, Vorr worship and
species-correct costs, with no JavaScript errors. All 13,215 frozen file hashes
matched after activation. Snapshot `dcss-pre-vorr-speed-20261019t184709z` reached
READY first; `20261019T183400Z-vorr-rites` remains the previous release.
Health and recovery passed, and task-owned helper groups closed.

See [the current Vorr implementation record](../docs/design/vorr/implementation-status.md#uncapped-speed-and-vampiric-starting-weapons--19-october).
