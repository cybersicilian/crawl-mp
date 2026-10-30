# Private lobbies and saved expeditions

RPG builder and party-manager continuation. Deployed on 2026-10-30 as `rpg-lobbies-01a18b22-r4`; see `2026-10-30-rpg-lobbies-release/activation.json` for the canonical save-preserving release receipt.

## Requested behavior

- Only heroes actually joining appear in the party roster, character editors, comparison table and public room roster. Unused seats have generic controls in an optional collapsed section, without pretend players.
- New lobbies can be public or private. Hosts can change access, copy a lobby link, or reset a private invite link.
- Private rooms are filtered per authenticated viewer on the server. Guessing a room identity or using an expired invite cannot join it. Private live expeditions also enforce discovery, watch and join access. Existing members retain access when invite links rotate.
- Invite URLs preserve the lobby and capability through sign-in. Recipients choose an actual seat before joining.
- Saved expeditions have a direct Load into lobby action and a selector in the current lobby. Loading preserves the native save package. The existing saved heroes and campaign rules are locked; the lobby displays checkpoint level, HP, floor and turn information rather than level-one previews.
- Resume targets the exact expedition ID and saved native indices. Existing guests keep their matching saved seats when capacity permits; incompatible capacity is rejected before mutation. Unjoined saved multiplayer heroes are available seats rather than fake joined accounts.
- Saving and exiting a party returns it to a checkpoint lobby. Solo saves retain host-controlled companions; a saved solo party is not silently converted into a multiplayer game.

## Mechanisms

`party_access.py` owns viewer-specific room and live-process access, capability rotation and persistence. `party_saved.py` owns checkpoint preflight, immutable roster staging and transactional resume. Existing native save files and exact expedition-resume machinery remain authoritative.

`party-url.js` defines the lobby URL contract. `party-lobby-tools.js` presents sharing, visibility, checkpoint loading and invitation previews. Existing room commands still own readiness and seat changes. Native multiplayer snapshots explicitly identify multiplayer mode, so resumed unjoined heroes can be claimed without misclassifying them as solo companions.

All added or edited web-language code files remain below 600 lines. The existing dirty native work is preserved.

## Validation

Prepared tests cover private/public discovery, token rotation, direct RPC bypasses, save ownership, capacity rejection before mutation, failed-resume rollback, explicit native multiplayer seat claims, and three real browser accounts. The browser scenario creates and saves a native game, compares package hashes before and after loading it into a lobby, resumes the exact expedition, and compares hero identities, positions and turns.

The isolated native binary is `47c66a7c67018dd327aa74ad38715bd1085b44f0e63addd00a845c6bbc6a6027`; every test runtime contains fresh disposable accounts and saves.

Validation passed:

- 72 server tests across access/staging, room ownership, launch rollback, party control, connection handling, session recovery and game-library contracts.
- Existing real native launch/retry/join/save/resume regression.
- Existing room availability, character decisions, collection filtering, party setup, party manager and complete lobby navigation browser checks.
- Three-account private lobby scenario: outsider discovery/direct join/watch denial, expired-link rejection, authenticated invite join, first native save, Load into lobby with unchanged `.cs` hashes, joined-only checkpoint roster, locked saved builds, and exact expedition resume preserving both heroes' identities, positions and turns. Saved lobby layouts fit 390, 768 and 1440px. No browser errors remain.
- Final focused access/staging suite: 11 tests passed, including synchronization of access revisions into both persistent save metadata and the native join cache. This final consistency change prevents a later native join from restoring an older invite token. Only this helper and its focused test changed after the complete browser pass.

The native workflow also exposed and fixed two transition defects: invite URLs initially left the page on the game loading layer, and save/exit returned to the library instead of the checkpoint lobby. Existing game controls now skip HUD refresh after their DOM has been removed, and party members avoid the spectator-only saved-game notice when returning to the lobby. Other exit notifications remain intact.

Final native browser evidence: `/private/tmp/dcss-private-lobbies/phase-6/access/evidence.json`. Full navigation evidence: `/private/tmp/dcss-private-lobbies/phase-6/navigation/evidence.json`. Earlier negative fixture and transition results are retained under phases 1–5. Shared-host reservation `2127b373-0b5e-4c41-9955-777891502dc6` was released after full process-group closure.

Screenshots and compact evidence: `/Users/iancaltabiano/.codex/visualizations/2026/10/30/01a18b22-0213-7362-87db-ca5dc5818240/private-lobbies/`. The web update is deployed. Native-god gameplay remains separate at the user's request.
