# Profile texture packs

The world artwork is a per-account preference, independent of native game state
and other party members. Classic is the default for new and existing profiles.
Illustrated opts into the painted stone/natural materials, connected borders,
continuous world surfaces, tree sprites and atlas color grading. Classic returns
the exact original atlas objects and skips the added ground/border adapters.
The journal interface retains its shared art direction in both modes.

## Account and rendering contracts

- `/profile` contains two accessible radio-card choices. Selection applies
  immediately and saves without an additional confirmation or Save action.
- `/api/profile/appearance` reads the authenticated account's setting. Its POST
  accepts exactly `{"texture_pack":"classic"}` or `{"texture_pack":"illustrated"}`.
  The login cookie owns identity; the body cannot select another username.
  The profile's account header must match that identity, so an old profile tab
  cannot write to a different account after sign-in changes elsewhere.
  Every write requires a valid XSRF token, including when global XSRF is disabled.
- `profile_appearance.py` stores the choice in the existing settings database,
  using an additive, case-insensitive account table. It does not change saves,
  combat, native options, turns or shared party state.
- Login queues the current preference before the game opens. Successful writes
  push the authoritative choice to that account's open WebSocket clients.
  An account-scoped browser cache and storage events apply local changes to
  other tabs immediately; the server setting follows the account across devices.
  Signing out or changing accounts resets the current selection appropriately.
- `texture-pack.js` owns frontend selection and the change event. Renderers read
  that state rather than introducing separate options or cache keys. The event
  invalidates visible ground, existing mounted item art, and visible enemy
  portraits. Classic avoids the extra neighbour invalidation work.
- Concurrent changes from one profile page are serialized so its last choice
  wins. A failed save restores the previously confirmed choice. The account
  menu, archive navigation and game menu expose the same profile page; opening
  it from a running game uses another tab to preserve the active expedition.

## Evidence boundary

Focused checks cover account isolation, persistence, validation, XSRF, login
state, cache isolation and browser-storage failure. The browser cases exercise
real HTTP persistence, cross-tab application, reload, rapid choices, failed-save
rollback, keyboard controls and narrow layouts. Controlled atlas rendering also
checks exact Classic sources and the Illustrated round trip.

The strengthened native consumer selects Illustrated through the actual
profile before character creation. Later it changes packs from a second profile
tab, verifies exact Classic atlases, restores Illustrated and checks that the
world clock did not advance. That native execution remains a separate acceptance
step; source and controlled-browser checks alone do not establish it.
