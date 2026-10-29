# Forest:4 generation failure and JediJosh recovery

Status: deployed and JediJosh's live save recovered on 21 October 2026 at
19:33 UTC, following explicit user authorization. The public expedition record
is saved and loadable on Forest:4.

JediJosh's 21 October crash reports consistently identify:

```
Builder failure while generating 'Forest:4'!
Last builder error: 'Forest:4: Isolated areas with no stairs.'
```

The `forest_heart_of_arcadia` ending encloses two five-cell shallow ponds in
unbroken tree rings. Shallow water is traversable, so each pond is an isolated
walkable region without an exit stair. The mandatory ending makes all builder
retries fail. The engine preserves the character while waiting for the missing
floor to be generated; replacing the save is unnecessary.

## Repair

`crawl-ref/source/dat/des/branches/forest.des` opens one tree cell in the south
edge of each pond ring. The enemies, loot, rune and surrounding layout remain
the same. This is a map-data change and requires no native rebuild.

`crawl-ref/source/test/forest-gen.lua` checks ten full Forest:4 generations for
one connected walkable region and the mossy rune. Its item search uses the
allocated native grid, since the smaller builder rectangle is centered within
that grid and is not an absolute coordinate bound.

## Evidence

The tested production source was
`/opt/dcss/releases/20261021T011926Z-creature-roster-r2/crawl-ref/source`.
Native binary SHA-256:
`76b6e73aabe123595f5d67447757e36f12fa5678a98b3824a57f6efeda56dae9`.

- Static vault connectivity changed from three regions (193, 5, 5 cells) to
  one region (205 cells).
- The installed, unchanged vault failed the native placement probe.
- The repaired vault passed ten placements and ten full Forest:4 generations
  with connectivity and rune checks.
- A private copy of JediJosh's save loaded on Forest:4, saved cleanly and
  loaded again. Character: level 22 Minotaur Fighter of Qazlal, HP 225/225,
  gold 5,898, turn 45,306. No gameplay commands other than save-and-exit ran.
- A second recovery ran as the `dcss` service user using copies of the original
  map caches. Normal loading refreshed the stale cache successfully. Hero
  fields and inventory matched across save/reload.
- All pre-existing saved level chunks remained byte-identical. `Forest:4` was
  the only added chunk; no chunks were removed.
- During isolated validation, the live save and production map retained their
  original hashes. All test engines exited before the later authorized deployment.

Early harness failures are preserved separately: the stock placement script
filled a rectangle at the origin instead of the allocated grid, and the first
recovery harness inherited a save-directory environment override. Those setup
failures were corrected before the successful proofs above.

## Deployment and live recovery

Active release: `/opt/dcss/releases/20261021T193000Z-forest-recovery`.
The previous release remains available at `/opt/dcss/previous`. Only the map
changed at runtime; 13,366 other existing files were retained via hard links.
The native binary hash is unchanged. Installed map SHA-256:
`a703ce3aaee18dbc50597d6b350aec139d2ec2ab67f3fdf4058fd811303cbf49`.

The deployment acquired both production release locks, checked that no native
games were running, and stopped WebTiles briefly. A ready state-disk snapshot
(`dcss-pre-forest-recovery-20261021t1925`), full expedition save-directory backup,
event backup and verified SQLite backup were retained. Recovery evidence and
backups are in `/var/lib/dcss/recovery/forest-recovery-20261021T193000Z/`.

The latest live checkpoint was loaded by the native engine, saved normally and
loaded and saved again as the `dcss` service user. It was not replaced by an
earlier test copy. Both loads reached Forest:4 with the same character identity,
inventory, level, HP, gold and turn count. No gameplay turns were advanced.
Forest:4 was the only added save chunk; all existing level chunks remained
byte-identical. No manual cache deletion was needed.

- Original live checkpoint SHA-256:
  `5f8e8e89f63a78c508c48f490dacc7c9c3315084e417dd7f002a741a0719139e`.
- Recovered checkpoint SHA-256:
  `9f7ca8041e4b26f23b784e24b1b4791caeb987e7a4701ce2814aac7ad4b3d855`.
- Public expedition:
  <https://dcss.iancaltabiano.com/games/ab4f89d6-bbdd-412b-bfd4-cb71453ae77e>.
  Its API confirms `status: saved`, `loadable: true`, JediJosh, level 22,
  HP 225/225 and Forest:4. The HTML record returned HTTP 200.
- WebTiles and Caddy are active; application, disk and public HTTPS health
  checks passed. SQLite recovery copies refreshed successfully and both release
  locks were released.

The first activation automatically rolled back because the temporary deployment
script incorrectly checked `/healthz` on Tornado's port. That route belongs to
Caddy. Activation then succeeded using the canonical `/status/version/` endpoint
and public HTTPS `/healthz`; save recovery was not repeated. Both attempt receipts
are retained. Native live-save loading and public HTTP were verified; no browser
gameplay commands were issued.

Credential-free reports, patch and deployment plan are in
`/Users/iancaltabiano/.codex/visualizations/2026/10/21/01a15f7b-33af-7c42-a7d4-a1b46cc5ebf0/forest-recovery/`.
