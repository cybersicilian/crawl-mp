# Production account cleanup — 24 October 2026

Applied the user's exact, case-insensitive keep list: Rogue and JediJosh.
Production now contains those two login and library accounts. Removed 52 other
accounts and 44 expeditions, including their source files, cached statistics,
Chronicle records, preferences, and account graphics settings.

Retained 177 expeditions: 105 owned by Rogue and 72 by JediJosh. All retained
database rows, credentials, preferences, and 8,757 protected files were unchanged
during archival. All five databases passed SQLite integrity checks. Canonical
statistics ingestion followed by a new cleanup plan found zero remaining target
rows, files, or shared-source changes.

No native game was running. The operation acquired both production release
locks, briefly stopped WebTiles, and restarted it to invalidate removed-account
sessions and refresh cached views. The active application release remained
`20261024T170515Z-render-assets`. Local development and separate staging state
were outside this operation.

The private recovery archive on the production state disk is
`/var/lib/dcss/recovery/account-cleanup-20261024T183323Z-rogue-jedijosh/`.
It contains SQLite backups, moved files, original filtered streams, the reviewed
plan, the exact operator script, a completion manifest, and verification.
Reconcile subsequent gameplay before restoring any earlier database or stream.

Public HTTPS checks returned 200 for health, expeditions, players, player
statistics, and their checked JSON APIs. Public library, statistics, and Elo
account lists contain exactly Rogue and JediJosh; the expedition API contains
their 177 retained games. Health reports healthy application and disk.

Evidence: [database and preservation verification](/Users/iancaltabiano/.codex/visualizations/2026/10/24/01a16f2d-b97a-7493-90c4-92d53ec2e49a/cleanup-evidence/verification.json)
and [public verification](/Users/iancaltabiano/.codex/visualizations/2026/10/24/01a16f2d-b97a-7493-90c4-92d53ec2e49a/cleanup-evidence/public-verification.json).

The reusable cleanup tool now also handles existing `profile_graphics` and
`profile_appearance` tables while preserving retained settings. Its five focused
operator tests passed, including the new preference-preservation assertions.
