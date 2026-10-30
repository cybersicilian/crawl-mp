# Party manager, multiplayer discovery and class insignia

Local UI update following the visual character builder. Production is unchanged.

## Behavior

- A persistent four-seat roster shows native equipped portraits, player ownership, readiness and direct Edit/Sheet actions above the character editors.
- Hosts set unoccupied seats to companion, AI, friend reservation or not joining directly from the roster. The existing room-update command handles each change.
- Guests edit their own hero; other character controls remain available for inspection. Ready state and joining counts follow the server's `launch_slots`, including multiplayer exclusions.
- Closing an occupied party or changing an occupied seat's controller retains consequential confirmation.
- Gathering-room discovery sorts available rooms ahead of full rooms, displays open-seat and readiness counts, and lets a joining player choose an authoritative `available_slots` entry before joining.
- Immediate All/Open/Gathering/Live filters combine with the retained text search. Clear filters resets both. Live expeditions offer separate Join co-op and Watch actions.
- Library controls rebuild after lobby content is replaced, preserving search/status/sort context rather than retaining detached controls.
- Every one of the 47 current native backgrounds has a distinct scalable class emblem, used in character choices, the party roster and room discovery.

## Integration and reuse

`class-art.js` is the shared class-art registry and renderer. It takes the canonical character-catalog background record; category controls its palette. A future background should add geometry here and will be caught by the catalog-coverage assertion.

`party-room-list.js` owns presentation of authoritative room snapshots. It does not infer native live capacity or issue commands. `party-manager.js` projects the existing builder controls into a compact table, preserving the existing room protocol. Native preview updates replace only portraits so that in-progress control focus is preserved.

No new server protocol, party persistence or native game mechanism is introduced.

## Validation

Prepared browser acceptance binds the current web sources and uses the previously validated isolated native binary `47c66a7c67018dd327aa74ad38715bd1085b44f0e63addd00a845c6bbc6a6027`. Accounts, room state, saves and generated UI assets live in a fresh disposable runtime.

Checks: exact P3 joining with two accounts; ownership/readiness synchronization; occupied-party confirmation dismissal; native starting-sheet inspection; distinct icons covering the complete catalog; phone/tablet/desktop fit; full/legacy/live room availability; existing builder and lobby-navigation workflows.

The first gated pass confirmed room availability, character decisions and trait guides, immediate collection filters, and the existing party-setup workflow. The new two-account fixture required blurring the hero-name field before its read-only inspection assertion. The existing lobby-navigation fixture used a numeric query matching every fixture turn counter; it now searches for a distinctive expedition name while retaining its exact resume-identity and context assertions.

The final gated integration pass succeeded with Aster and Mira: P3 selection, ownership, readiness, read-only sheets, occupied-seat/party confirmation dismissal, four fully loaded native portraits, all 47 distinct class emblems, and 390/768/1440px layouts. Host readiness remains advisory, matching the existing protocol; the host sees the unready-hero warning. The complete lobby-navigation suite also passed, including independent Watch/Join intent, exact expedition resume identity, search persistence, late updates, content replacement, reload/account controls, archives, daily seed setup and Chronicle builds.

Final evidence: `/private/tmp/dcss-party-management/phase-3/`. Screenshots and compact evidence are copied to `/Users/iancaltabiano/.codex/visualizations/2026/10/30/01a18b22-0213-7362-87db-ca5dc5818240/party-manager/`. Shared-host reservation `e2d54594-1a17-4be7-987b-47d6b02d69e5` was released after the gate confirmed its full process group was gone. Earlier negative fixture results remain under phases 1 and 2.
