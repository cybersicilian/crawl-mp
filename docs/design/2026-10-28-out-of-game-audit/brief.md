# Pebble Broth: out-of-game experience audit

Baseline · 28 October 2026, America/Denver · Prepared by Codex · Evidence cutoff: source inspection on 28 October 2026

## Overall assessment

The lobby already groups work into Play, Saved expeditions, Join friends and Chronicle, preserves view context, and exposes direct resume and immediate search. These are valuable foundations. Its multiple visual generations and repeated entry points still make secondary material compete with the actions players came to perform. The opportunity is to make current progress and the next useful action prominent, clarify where settings live, and give planning, discovery and history a consistent reading order while retaining dense, practical controls.

This is a source-based baseline, not a visual or usability study. Proposed benefits and click counts are targets requiring runtime verification. Source may differ from the deployed game.

## Scope and coverage

| Surface | Evidence and inspected state | Coverage and boundary |
| --- | --- | --- |
| Play home | `static/scripts/lobby-overview.js`, `tabletop/lobby-dashboard.css`: empty and populated code paths | Source reviewed; actual layout and save loading not exercised |
| Navigation and account | `static/scripts/lobby-navigation.js`, `workspace-views.js`: four views, account, stored scroll and focus | Source reviewed; keyboard and responsive behavior unverified in a browser |
| Party staging and alternate modes | `templates/client.html`, `static/scripts/lobby-modes.js`, `tabletop/party-setup.css` | Source reviewed; party creation and launch not executed |
| Saved expeditions | `static/scripts/library-ui.js`: empty, saved, running, unavailable and deletion controls | Source reviewed; real save and destructive actions not executed |
| Join friends | `static/scripts/lobby-discovery.js`: rooms, live games, search and empty states | Source reviewed; populated rooms, joining and watching not exercised |
| Chronicle | `static/scripts/lobby-browser.js`, `templates/client.html`: categories, search, records and refresh | Source reviewed; records and refresh not exercised |
| Account, graphics, profile, statistics, game records and logged-out flow | Navigation destinations and template links only | Partial/unreviewed; page contents, themes and account operations not inspected |
| Settings | Existing RC dialog and account menu source | Source reviewed; persistence and save failure feedback unverified |

No production accounts, saves, party rooms or deployments were changed for this audit. No screen dimensions, actual clicks, visual contrasts, or assistive-technology outcomes were measured.

## Strengths and constraints

Preserve one-action resume from the home page, immediate local search, existing native game and expedition links, party roster and view state, keyboard-accessible navigation, game-mode availability, and consequential deletion confirmation. Preserve thematic identity and readable game information. Changes should not create a parallel data model or infer that a game was launched or saved.

## Priorities

| ID | Priority | Finding and impact | Effort | Confidence |
| --- | --- | --- | --- | --- |
| D-01 | P1 | A generic opening message precedes saved progress, competing with the frequent return-to-game job | Medium | Source observation high; impact untested |
| D-02 | P1 | Game settings are reached through alternate modes or a party-only action; account navigation omits them | Small | Source observation high; discoverability impact untested |
| D-03 | P2 | Party header combines setup actions, long labels and repeated pacing/status material; empty party view duplicates create | Medium | Source observation high; visual impact untested |
| D-04 | P2 | Chronicle uses technical, uppercase labels and verbose tooltips around already distinct categories | Small | Source observation high; comprehension impact untested |
| D-05 | P2 | Shared surfaces are styled through several overlapping systems with inconsistent heading, spacing and action emphasis | Medium | Source observation high; current rendered differences unverified |
| D-06 | P2 | Discovery counts combine gathering rooms and live games under the term expeditions | Small | Source observation high; interpretation untested |

Effort is relative and excludes runtime and deployment acceptance.

## Detailed findings and recommendations

### D-01 · Prioritize continuing play
Evidence: `lobby-overview.js` renders a large generic introduction, create/join actions, then recent expeditions alongside a daily seed. Resume links retain the library's exact identity. Recommendation: promote recent progress into the primary reading path when present, give empty states an explicit next action, and retain new, join and daily entry points. Acceptance: a saved game is identifiable and resumable directly from Play; an empty account can create or learn; no route or identity changes. Actual interaction count and responsive layout need testing.

### D-02 · Locate preferences with account controls
Evidence: `lobby-modes.js` places the RC link after mode choices; the additional settings button belongs to party staging. `lobby-navigation.js` places appearance and profile in the account menu but not game settings. Recommendation: add a contextual Game settings entry in the account menu that invokes the existing RC link, retain contextual access, and clarify that changes apply on the next game process start. Acceptance: settings can be opened from any lobby view without visiting modes, and the appropriate existing RC route is used. Multiple RC paths need explicit labels if configured.

### D-03 · Separate setup from status
Evidence: party template repeats pacing and friendly-fire explanations in a header and room banner, and contains both header and empty-state create actions. The discovery renderer moves the empty list into Join friends and hides its create action. Recommendation: distinguish room identity/status from actions, keep the host's friendly-fire control visible and retain party return and launch. Remove or de-emphasize duplicated presentation only where its information remains available. Acceptance: a host can identify the setting, alter it and launch; non-host users can understand it; navigation does not discard the roster. These are proposed outcomes, not runtime observations.

### D-04 · Make Chronicle categories scannable
Evidence: static labels expose storage terms and extended uppercase phrases, while `lobby-browser.js` already supplies concise category names, filters and record links. Recommendation: use plain labels, concise descriptions, stable record links and a consistent empty/search state. Acceptance: party builds, fallen heroes and discoveries are distinguishable without hovering; search and existing restore action remain available.

### D-05 · Establish a coherent surface hierarchy
Evidence: `lobby-experience.css`, `lobby-workspace.css`, `lobby-dashboard.css` and subsequent imports overlap selectors, palette, headings and card styles. Recommendation: define a compact final out-of-game layer using the existing folio tokens: one page title, section headings, a restrained primary action, consistent fields, table surfaces, focus and responsive spacing. Avoid flattening the in-game HUD or account/record pages that were not assessed. Acceptance: target surfaces share legible hierarchy and focus states across narrow and wide layouts; actual contrast and theme behavior require browser inspection.

### D-06 · Describe discovery results accurately
Evidence: `lobby-discovery.js` counts rows from both gathering parties and live expeditions but labels the total as expeditions. Recommendation: use a neutral shared label such as results while filtering and a clear availability label otherwise. Acceptance: searching immediately filters both collections, count is accurate, and zero matches is clear.

## Surface assessment and workflow targets

Play should lead with a meaningful greeting and available progress while keeping new and join paths. Party staging should expose room state and launch without duplicating boilerplate. Saved expeditions already separate Resume, record and Delete; retain that distinction and search. Join friends should distinguish gathering rooms from live runs and retain immediate search. Chronicle should provide category and search controls above clear record sections. Account/settings should use one understandable entry in the account menu, plus contextual links where relevant. Profile, graphics, statistics, login and public records need separate inspection before any redesign claims.

| Job | Current source path / stopping point | Proposed target | Validation still needed |
| --- | --- | --- | --- |
| Resume a saved run | Home recent entry directly links to matching expedition | One direct action | Confirm correct identity and game entry in isolated runtime |
| Start a party | New expedition invokes existing party create control | One action into staging | Verify no duplicate commands and roster preservation |
| Find and join | Join friends, type to filter rooms and live rows, choose action | Immediate filtering and direct action | Verify populated, empty, no-match and return states |
| Change game preference | Other modes → Game preferences or party settings | Account → Game settings | Verify RC round trip, per-mode path and save feedback |
| Review history | Chronicle categories/search; links open records | Direct filter and existing record links | Check populated and empty categories |

Counts are proposed and are not measured results.

## Control map and visual direction

| Control | Proposed location | Retained behavior |
| --- | --- | --- |
| New expedition, Join friends, Resume | Play home and contextual navigation | Existing create, join and exact resume actions |
| Game settings | Account menu plus existing mode/party context | Existing per-account RC editor |
| Party controls and launch | Party staging | Existing host permissions and launch path |
| Saved search, record and delete | Saved expeditions | Immediate search and destructive confirmation |
| Room/live search | Join friends | Immediate filtering with separate room and live sections |
| Chronicle categories, search, refresh, records | Chronicle | Existing data sources, filters and links |

Use the established dark tavern shell, folio reading surfaces, restrained copper accents, strong editorial headings, and compact rows. Give actions predictable prominence and retain informative labels; use rules and spacing instead of repeated decorative containers. Focus, selected and disabled states need non-color indicators. This is a proposed direction, not a screenshot or accessibility certification.

## Sequence and validation

1. Apply shared reading hierarchy and fix misleading copy; preserve existing data and actions.
2. Make settings reachable from account navigation and clarify Play, party and Chronicle paths.
3. Verify desktop and mobile browser flows, keyboard focus, selected/empty/error states, save feedback, accurate account/RC scope and theme variants. Follow with observed user testing before declaring navigation improvements proven.

Unresolved decisions: whether active players prefer the existing daily card's prominence; whether distinct game modes use different RC files in the deployed configuration; which account and record pages should share the lobby system; and whether settings can safely provide immediate save confirmation. Confirm these in an isolated environment and with users. This baseline records recommendations; it does not claim implementation, runtime acceptance, or deployment.
