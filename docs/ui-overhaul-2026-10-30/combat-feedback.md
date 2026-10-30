# Combat feedback — UI overhaul, 30 October 2026

Scope: the action queue, map overlays and hit feedback that make tactics
legible on the map. The engine stays authoritative; no messages, commands or
contracts changed. One native command stays in flight and the plan-id
acknowledgement path in `tactical-planner.js` is byte-for-byte the same.

## What changed

| Area | Files | Result |
| --- | --- | --- |
| Action queue | `game_data/static/tactical-planner.js`, `styles/tactical-planner.css` | Header "Plan for <hero>" with action count and estimated aut (hero `move_aut` / `atk_aut`, 10 aut per wait; powers read "engine" because the engine prices them). Ordered chips per action (`1 Move → 8 aut ×`), colour-keyed by kind, remove on click (a removed move drops later steps, as before). Go is the single primary button, Clear/Esc is quiet, Plan and Wait are secondary. Running shows "Step n of N" progress and Go becomes Stop. Engine/map interruptions (new enemy, route changed, movement interrupted, awaiting result, rejected, zero-turn, connection) render as a warn callout with "Paused · Go resumes, Clear discards". `data-plan-state` = idle/ready/planning/running/paused/unsupported drives the border colour. Power chips use the hero's own spell/ability names. |
| Hero/teammate rings | `cell-renderer-overlays.js` | Controlled hero: solid double ring in its party colour; teammates: dashed ring; downed/ghost: grey dotted. Recovery arc is a stroke just inside the ring (the old opaque pie no longer hides the sprite). Nameplate, HP sliver and status badge kept. All sizes derive from the device-pixel cell size, so they stay crisp on Retina and at every zoom. |
| Threat reticle | `cell-renderer-overlays.js`, `encounter-banner.js` | Enemies from the native `enemy_initiative` readings with `ready === true` and adjacent (Chebyshev 1) to a living hero get red corner ticks and a "!" plate: they can strike before that hero's next action. Nothing is inferred from speed or energy. The banner module asks the renderer to repaint only the cells whose reticle appeared/disappeared, so dirty-chunk repainting is preserved. |
| Hover tile | `cell-renderer-overlays.js` | Soft fill and inset outline under the native mouse cursor cell (`view_data.cursor_locs[CURSOR_MOUSE]`); the cursor's own repaint already covers old/new cells. |
| Pings | `cell-renderer-overlays.js` | Existing `crawl_party.pings` hook only; same pulse, scaled line widths, "DANGER · Rook" plate. |
| Planned route | `planned-route.js` | Dashed line in the controlled hero's party colour over a dark halo, numbered step discs, the pending step inverted, a diamond at the destination. Still a separate fixed canvas sized to the dungeon canvas's device pixels. |
| Hero damage numbers | `hero-feedback.js`, `styles/hero-feedback.css` | "−5 HP" / "+3 HP" / "LEVEL 4" float from the hero tile with an underline in the hero's party colour and a brief tile flash on damage. Numbers are still only net deltas between confirmed snapshots (`hero-feedback-model.js` unchanged). Reduced motion: no canvas, no echo, no Web Animations; the hero card gets a 700 ms static outline class (`is-feedback-damage|heal|level`). |
| Enemy hits | `encounter-feedback-paint.js` | Wound-band increases show "HIT" / "HIT!" / "CRUSHED" labels in enemy colour; no numbers are invented (the model's band-only contract is unchanged). |
| Encounter banner | `encounter-banner.js` (new), `styles/tactical-planner.css` | On a confirmed `party_state_rendered` transition of `party.inCombat` for the controlled hero: "Tactical combat — Turn order engaged" or "Area clear — Free exploration resumed", 2.2 s, `role=status`, non-blocking, inside `#dungeon_viewport`. First snapshot, floor and control changes are baselines, not transitions. Attached from `dungeon_renderer.js` (guarded, so fixtures that stub modules keep working). |

Ids/classes kept: `#tactical_planner`, `.plan-tools`, `[data-plan=toggle|run|wait|clear]`,
`.plan-actions` (one `<button>` per queued action, as tests count), `.plan-status`,
`.planned-route`, `.hero-feedback-layer`, `.hero-hp-echo`, `.encounter-feedback-layer`,
`dataset.effects`. Colour tokens: `--ui-enemy` and `--ui-ally` are used where published; no per-slot `--ui-hero-N` exists yet, so party colours are
defined locally (`--cf-hero-1..4` in the planner CSS; the same hex list in JS,
matching `party-model.colours`).

## Why

The old strip was four equal buttons and a bare list ("1 Move ↑ ×"). A tactics
player needs to see whose plan it is, how much time it costs, which step is
executing, why it paused, and on the map which hero is mine, who is about to
hit us and where the route goes.

## How to verify (light)

- `node --check` on every touched JS file; `node --test tests/hero-feedback.test.cjs
  tests/encounter-feedback.test.cjs tests/traversal-effects.test.cjs
  tests/chain-view.test.cjs tests/shell-animation.test.cjs` (23 pass);
  `node tests/tactical-planner.cjs` and `node tests/display-frames.cjs` pass.
- A stub-DOM/stub-canvas smoke run rendered chips, Go→Stop progress, the paused
  callout and the overlay painter without errors.
- Not verified here (shared-host rule): browser fixtures `tests/tactical-ui-browser.cjs`,
  `hero-feedback-browser.cjs`, `encounter-feedback-browser.cjs`, and real gameplay.
  Visual checks to do when a browser run is allowed: ring legibility at 1024×768,
  banner placement under the context bar, contrast theme borders.

## Open requests for other areas

- Design system: publish `--ui-hero-1..4` party colour tokens; the planner CSS,
  `cell-renderer-overlays.js`, `planned-route.js` and `hero-feedback.js` carry the
  same four hex values locally and should switch to the tokens.
- Sidebar/party cards: `.party-member-card` receives `is-feedback-damage|heal|level`
  under reduced motion; keep `data-party-slot` and `#party_hp_<slot>` as they are.
- Gameplay shell: `#dungeon_viewport` is the banner host; keep `position: relative;
  overflow: hidden` on it.
- Engine (future): a per-enemy "can reach hero next action" reading would let the
  reticle cover ranged/reaching enemies; today it is readiness + adjacency only.
  Misses/dodges are not in any snapshot, so there is no "miss" cue.
