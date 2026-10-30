# Stats: gameplay statistics and reference encyclopedia

`/stats` is a read-only section of the WebTiles site with two halves:

1. **Gameplay stats** aggregated from every game played on this server
   (solo and co-op), filterable by account, mode (solo/party) and time range.
2. **Reference stats** dumped from the engine's own data tables, so every fork
   change (new monsters, items, species, jobs, spells...) is reflected exactly.

The overview starts with a **Best runs leaderboard**: the top 25 completed hero
runs by recorded score, highest first. Equal scores share a rank, with newer
runs first. Solo and party heroes are listed individually, using the existing
game records and expedition links. Account, mode and date filters apply;
in-progress runs, missing or invalid scores, wizard runs (even when included
elsewhere on the page), and disposable test accounts are excluded. A recorded
zero is a valid score. This is a raw-score record, independent of Global Elo.

## Data flow

```
crawl -stats-json  ──────────────►  rcs/stats/reference.json  (cached, keyed on binary mtime+size)
crawl (in game)    ── append ────►  <save_dir>/stats_events.jsonl  (+ ./rcs/stats_events.jsonl fallback)
xlogfile / milestones / morgues ─┐
coop_chronicle.db / .jsonl ──────┼─► webtiles/stats.py ingest ─► rcs/stats/stats.sqlite
library index.sqlite / events ───┘
                                        │
                     /stats, /stats/<section>[/<key>]   (HTML, templates/stats.html)
                     /api/stats/<section>[/<key>]       (JSON)
```

## Contract 1: `crawl -stats-json` (engine → web)

Prints one JSON object to stdout and exits 0, like `-playable-json`. Must not
require a save, a TTY or network. Top-level keys (all arrays of objects unless
noted). Every object has a stable string `key` (lowercase, `_`-separated
enum-derived identifier, e.g. `orc_warrior`, `long_sword`) and a display `name`.
Unknown/inapplicable numeric fields are omitted rather than faked.

```jsonc
{
  "version": "0.33-a0...",           // string, long version
  "generated_by": "crawl -stats-json",
  "monsters": [{
    "key", "name", "glyph", "colour", "genus", "species",
    "hd", "hp_avg", "hp_min", "hp_max", "ac", "ev", "will",  // will: number or "immune"
    "speed", "move_energy", "xp",                            // xp = exper value at its HD
    "size", "holiness": [..], "intelligence", "habitat",
    "attacks": [{"type", "flavour", "damage"}],
    "resists": {"fire": -1..3, "cold", "elec", "poison", "neg", "acid", "torment": bool, ...},
    "flags": ["see_invis", "flies", "unique", ...],
    "spells": [{"key", "name", "freq", "flags": [...]}],     // all spellbooks merged, deduped
    "corpse": bool, "unique": bool,
    "description": "..."                                     // may be "" if not in db
  }],
  "items": {
    "weapons":   [{"key","name","skill","damage","hit","delay","min_delay","size","hands","range" (if ranged),"ammo"?,"price","commonness","tags":[]}],
    "armour":    [{"key","name","slot","ac","ev_penalty","str_req"?, "price", "commonness", "intrinsic": [..]}],
    "missiles":  [{"key","name","damage", ...}],
    "wands":     [{"key","name","charges"?, "description"}],
    "staves":    [{"key","name","description"}],
    "potions":   [{"key","name","description","price"}],
    "scrolls":   [{"key","name","description","price"}],
    "jewellery": [{"key","name","kind":"ring|amulet","description"}],
    "misc":      [{"key","name","description"}],            // evokers etc.
    "talismans": [{"key","name","form","description"}],
    "books":     [{"key","name","spells":[spell keys]}],
    "weapon_brands": [{"key","name","description"}],
    "armour_egos":   [{"key","name","description"}],
    "unrands":   [{"key","name","base","properties": {"rF":1,...}, "description"}]
  },
  "spells":   [{"key","name","level","schools":[..],"range","noise","flags":[..],"description","books":[book keys]}],
  "species":  [{"key","name","abbrev","str","int","dex","hp_mod","mp_mod","will_mod","xp_mod","size","aptitudes":{"skill_name":int},"mutations":[..],"playable":bool}],
  "jobs":     [{"key","name","abbrev","str","int","dex","skills":{"skill_name":int},"equipment":[..],"spells":[..],"playable":bool}],
  "combos":   [{"species","job","str","int","dex","hp","mp","recommended":bool}],   // only legal combos
  "gods":     [{"key","name","description","abilities":[..]}],
  "mutations":[{"key","name","levels","description"}],
  "skills":   [{"key","name"}],
  "branches": [/* same shape as -branches-json */]
}
```

## Contract 2: `stats_events.jsonl` (engine → web)

One JSON object per line, appended (never rewritten). Written next to
`coop_chronicle.jsonl` using the same path logic (`Options.save_dir` with
`./rcs/` fallback). Each hero in a party produces its own lines.

```jsonc
{"type":"hero_snapshot",            // emitted on every save AND at game end
 "final": false|true,                // true only at death/win/quit
 "game_id": "<CRAWL_GAME_ID or ''>", "hero_id": "<native hero UUID>",
 "account_id": "<CRAWL_OWNER_ID or ''>",
 "name","species","job","slot","party_size","seed","version",
 "start": "YYYYMMDDHHMMSS", "time": "<ISO UTC now>",
 "xl","turns","aut","place","branch","depth","max_depth":{"D":12,...},
 "god","piety","runes":[..],"gems":[..],"gold","score",
 "hp_max","mp_max","ac","ev","sh","str","int","dex",
 "skills":{"Fighting":12.3,...},
 "outcome": "alive|dead|won|quit|left", "killer": "...", "ktyp": "...",
 "kills": {"<monster key>": count, ...},            // this hero's kills only
 "kill_total": n,
 "actions": {"<category>": {"<name>": count}},      // from you.action_count (cast/evoke/quaff/read/ability/melee...)
 "equipment": [{"slot","name","base_key","ego"?, "artefact": bool}],
 "spells_known": [spell keys],
 "branches_visited": [..]
}
```

The ingester keeps the latest snapshot per `(game_id, hero_id)` (falling back
to `(name, start)` when IDs are empty), so in-progress co-op games count with
`outcome:"alive"`.

## Backfill

For games with no `hero_snapshot`, `stats.py` derives what it can from:
xlogfile + milestones (all `logfile`/`milestones` files under `rcs/`, including
library save dirs), morgue `.txt` files (Vanquished Creatures, Action table,
skills, equipment), `coop_chronicle.db` (ghosts, party comps, notable items) and
the library index/events. Dedup key: `(name, start)`. Final results take
precedence over in-progress snapshots for score, outcome and other scalar
run fields; within each group, snapshots win over xlogfile which wins over
morgue-only. Rich snapshot details, hero/expedition identity and earlier
observations remain available when an xlog supplies the final result.

## Verification

```sh
crawl-ref/source/crawl -stats-json | python3 -m json.tool > /dev/null
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.stats_test -v
```

## Web side (`webtiles/stats*.py`)

| Module | Role |
|---|---|
| `stats.py` | `StatsStore`: discovery, incremental ingest, reference cache, merged games; CLI |
| `stats_parse.py` | xlog/milestone (`::` escapes, zero-based xlog months), snapshot and morgue parsers; constants |
| `stats_reference.py` | `Reference` indexes (name/plural/key resolution, item matching) + `-playable-json` fallback |
| `stats_merge.py` | Dedup and merge into one record per game |
| `stats_views.py`, `stats_sections.py` | Filters, aggregation and per-section view models (`build_section`) |
| `stats_http.py` | `StatsPageHandler` (renders `templates/stats.html`) and `StatsAPIHandler` |

Assets: `static/tabletop/stats.css`, `static/scripts/stats.js` (sorting with
`aria-sort`, per-table search and session restoration), and
`static/scripts/stats-search.js` (progressive archive lookup; no dependencies).
`stats_catalog.py` projects the existing reference indexes into a shared,
declarative section directory and search results. It does not maintain a separate
content store. Nav links: the library chapter
bar (`templates/library.html`) and the lobby chapter index
(`static/scripts/lobby-navigation.js`, a plain link outside the workspace views).

### Routes (all GET, read-only, `Cache-Control: no-store`)

`/stats` (overview), `/stats/<section>`, `/stats/<section>/<key>` and the same
under `/api/stats/...` as JSON. Sections and detail keys:

| Section | Detail key | Shows |
|---|---|---|
| `overview` | — | totals, recent games, deadliest foes, most-slain monsters, popular combos, chronicle finds |
| `combos` | `<species_key>.<job_key>` | species × background heatmap; combo record, starting stats, aptitudes, starting skills/kit |
| `species`, `jobs` | key | reference stats/aptitudes/skills/kit + gameplay and per-combo breakdown |
| `monsters` | key | full bestiary (HD/HP/AC/EV/speed/XP, attacks, resists, spells, flags) + times slain, heroes slain, top hunters |
| `items` | `<category>.<key>` | every category incl. brands/egos/unrands + equipped-at-last-record, use counts (Action table), chronicle finds |
| `spells` | key | reference + times cast, heroes knowing, monster casters, books |
| `gods` | key or `_none` | followers, win rate, average piety, abilities |
| `branches` | key | visits (snapshot/morgue/milestones), deaths, deepest level, killers |
| `deaths` | — | killers, places, ktyp, recent deaths, co-op ghosts |
| `players` | account or hero name | adventurers and heroes, linking to `/players/<id>` and `/games/<id>` when the library knows them |
| `skills`, `mutations` | key | aptitudes across species / trained levels; mutation reference |

`/stats/search?q=<query>` and `/api/stats/search?q=<query>` search reference
names, canonical keys, categories, descriptions and selected aliases, plus legal
combos and the account/hero names in matching games. Exact names rank first,
followed by name prefixes, name substrings and other keyword matches. Queries
are normalized and capped at 160 characters. The API's `search` object includes
`query`, `total`, `results` (at most 100) and `limited`; each result has a name,
category, short description and canonical detail URL. Live lookup shows the first
10 matches and links to the full GET results page. Reference entries remain
searchable even when no gameplay records match the current filters.

The overview directory and persistent section navigation share three groups:
Server records, Character building, and Dungeon reference. Multi-part pages have
an on-page index. Detail breadcrumbs return to the relevant category. Table
queries and sort directions are remembered in browser session storage per URL,
including gameplay scope. Storage is optional; unavailable storage does not
disable sorting or search. Mode and wizard-mode changes apply immediately; text
and date filters commit on blur or Enter. Ordinary GET forms remain available
without JavaScript. Stats assets use versioned URLs so an existing browser picks
up revised scripts and styles after an update.

Filters (query string, preserved by every internal link): `account` (account
name/id or hero name), `mode=solo|party`, `since`/`until` (`YYYY-MM-DD`,
inclusive, on the game's end/last-update time), `include_wizmode=1`
(wizard/explore games — `ktyp=wizmode`, `wiz=1`, `explore=1`, snapshot
`wizard` — are excluded by default). Unknown sections/keys return 404. Output
is autoescaped; JSON additionally escapes `<`, `>` and `&`. No filesystem path
is ever included.

### Ingestion details

- Scans `rcs/**` (skipping `rcs/stats`, `db/`, `running/`) for
  `stats_events.jsonl`, `logfile*`, `milestones*`, `morgue-*-YYYYMMDD-HHMMSS.txt`
  and `coop_chronicle.jsonl`. Append-only files are read incrementally from the
  last complete line (offset reset if a file shrinks); morgues are re-parsed only
  when size/mtime change. Per-save character dumps (`<name>.txt`) and crash
  reports are ignored.
- Snapshot `start` is read as a calendar-month `YYYYMMDDHHMMSS` (xlog's month is
  zero-based and normalised). Snapshot rows are keyed by `(game_id, hero_id)`;
  a line older (by `time`) than the stored one never overwrites it.
- Morgues merge into the xlog/snapshot game with the same name whose end time is
  within 3 minutes (filename timestamp); their Vanquished Creatures, Action
  table, skills, equipment and spells fill details the winner lacks.
- Library heroes merge by `(name, seed)`; otherwise they appear as in-progress
  games owned by the library account. Party size comes from snapshots, library
  mode (`coop-2p…`) or a chronicle `party_comp` with the same seed (whose host
  becomes the account).
- `coop_chronicle.db` is refreshed through `chronicle.ingest_jsonl_events` and
  copied read-only; chronicle JSONL files elsewhere (library save dirs) are
  parsed directly.
- Requests trigger a throttled (30 s) background ingest; a cold cache ingests
  synchronously once. `server.py` also schedules a 5-minute periodic ingest.

### Reference cache

`reference()` never blocks: a fresh engine dump in `rcs/stats/reference.json`
(signature = binary call + mtime + size) > `webserver/util/fixtures/stats-reference.json`
> a partial dump from `-playable-json`/`-branches-json` (species, jobs, combos,
branches) > empty. When the binary signature changes it is regenerated on a
background thread. The binary is the first configured game's `crawl_binary`
(+ `pre_options`) that exists, or `CRAWL_STATS_BINARY`.

Rebuild by hand (from `crawl-ref/source`, where the server runs):

```sh
PYTHONPATH=webserver ../../.venv/bin/python -m webtiles.stats --rebuild --reference
```

`--rebuild` deletes and re-ingests `rcs/stats/stats.sqlite`; `--reference`
regenerates `reference.json`. Deleting `rcs/stats/` is always safe.

### Tests

```sh
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.stats_test webtiles.game_library_test -v
```

Covers canonical cross-category search links, filter-independent reference
lookup, navigation coverage, safe search output, xlog `::` escapes and month normalisation, morgue parsing, latest-wins
snapshots, snapshot > xlog > morgue > library dedup, milestones, filters,
wizmode exclusion, reference fallback/caching, every HTML/JSON route, empty
states and HTML escaping. (HTTP tests bind a localhost port.)

## Win/score attribution and global account Elo

The outcome of a run is observed. A counterfactual outcome after making a
different choice is not. These pages therefore report **matched observational
associations**, with explicit missing evidence; they do not claim causal effects
or calibrated live win probabilities.

```text
reference catalog ───────────────────────────────► every feature, including unknowns
snapshot stream ─► first non-final snapshot/XL band ─┐
merged terminal results ─► account expeditions ──────┼─► matched comparisons ─► impact pages
                        └─► chronological Elo replay┘                       and reference columns
                                 └─► global leaderboard + account history
```

### Units and evidence

An analytical unit is one account expedition. Solo uses the merged game ID;
party heroes share the native game ID and must all have terminal records before
one rating/result is emitted. A party win means at least one hero escaped with
the Orb. Party final score is the sum of the heroes' final scores, and is unknown
if any score is absent. No party without a native game ID and its full roster is
rated. Wizard and disposable QA records never enter either model, even if the
page includes wizard games. A legacy account name is explicitly unverified;
an unambiguous name-to-account-ID link joins its history to the account.

| Feature | Evidence used | Limits |
|---|---|---|
| Species and class/background | Starting choice from a completed record | No estimate without comparable alternative choices |
| God | Following at an earlier snapshot | Does not measure conversion or abandonment decisions |
| Equipment, brands and egos | Active equipment at that snapshot | Melded equipment excluded; missing inventory/gear is not observed absence |
| Consumables and other item actions | Positive cumulative action counts before that snapshot | Presence of use, not per-dose marginal benefit |
| Enemy | Defeated before that snapshot | Does not measure encounters, retreat or damage taken; survival selection remains |
| Spell | Known or cast before that snapshot | Does not measure a particular cast's causal benefit |
| Other recorded actions | Positive action counts, preserving category and subtype | Unrecorded interactions remain unknown |

Every catalog item/species/class/god/enemy/spell has a row, including books and
other classes with no measurable exposure yet. Action-specific rows are
discovered from actual snapshots. Finding an item, carrying an unequipped book,
enemy encounters without kills, and individual attack targets are not currently
recorded by this stream; no numerical effect is invented for them. Later
telemetry can extend the adapter without changing the statistical core.

`landmarks` retains the earliest snapshot by `(turns, updated)` for each native
hero and XL band: 1–4, 5–9, 10–14, 15–19, 20–27. Non-final, alive, non-wizard
snapshots only; no final loadout or fatal killer is a predictor. An existing
cache replays event files once on migration, using original JSONL history.
Deleting the cache reconstructs both landmarks and ratings. Old morgue/xlog-only
records support starting choices and ratings, not acquired-feature attribution.
Every party hero needs a snapshot in the selected band. Incomplete exposure
fields exclude that observation from the corresponding comparison.

### Estimates and interactions

Comparisons match exact rules version, party size, pre-run Elo in 200-point
bands, other starting choices, and (for acquired features) exact snapshot XL.
The historical Elo covariate includes only results completed strictly before
the run started. Each expedition appears once in a comparison. Page filters
select expeditions, preserving the full party; they never retrain Elo.

For each matched stratum, compute exposed minus control win proportion and
mean final score, then weight by its exposed population. Report sample counts,
account counts, matched strata, win rates and uncertainty ranges. Require at
least five expeditions and three accounts in **every** comparison cell; otherwise
the numerical estimate is `null`, not zero. Score estimates use their own
complete strata and denominators; missing scores are never filled with zero.
Win bounds propagate [Wilson proportion intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
Score ranges use a normal approximation to variance of the matched means.
These descriptive ranges do not correct dependence between one player's runs,
unmeasured confounding or multiple comparisons, and are not significance tests.

Pair interactions use four cells:

`interaction = (both − first only) − (second only − neither)`.

This distinguishes a combination's association from its separate associations.
Impossible or sparsely observed combinations stay unknown. No Cartesian product
is materialized: arbitrary pairs are computed on request, while details offer
the 50 most observed partners. The comparison search accepts any known feature
or recorded action. It works as an ordinary GET form and adds immediate linked
suggestions when JavaScript is available.

### Global PvE Elo

This is a **server-archive-wide account rating**, not a cross-server identity
service or human-versus-human chess ladder. A dungeon challenge is the tuple
`(exact version, party size, sorted starting species/background composition)`.
Both accounts and challenges start at 1500. For each completed expedition:

`expected = 1 / (1 + 10 ** ((challenge_rating − account_rating) / 400))`

`change = K * (won − expected)`

Add the change to the account and subtract it from the challenge. K is 32 for
an account's first 20 results, then 16. Replay completion timestamps with a
stable tie order; duplicates do not add results. Win = 1; death, quit and leaving
without the Orb = 0. An in-progress expedition never changes rating. All known
accounts have an initial 1500, shown as Unrated until eligible history exists;
the first 20 rated results are Provisional. The public rank includes rated
accounts only. Difficulty and player estimates are sparse early on and depend
on overlap between players' challenge choices; disconnected challenge pools
are anchored only by the common initial rating. Calibrated win prediction and
individual attribution to co-op human controllers require further evidence.

Elo stays global when filtering account, dates, solo/party or wizard visibility.
The filters only select displayed accounts; the profile history exposes the
latest 50 global updates and their model expectations. Final score affects the
separate score-impact calculation, not the win-based Elo result.

The update follows the expected-versus-actual result mechanism described by
the [FIDE rating regulations](https://handbook.fide.com/chapter/B022024), with
explicit project-specific PvE opponents, initialization and K rules.

### Added routes and modules

| Route | Purpose |
|---|---|
| `/stats/impacts` | Every feature's estimate and evidence state |
| `/stats/impacts/<feature>` | Feature, observed actions and interaction partners |
| `/stats/impacts/<first>::<second>` | Four-cell interaction |
| `/stats/impacts?q=curing&compare=species:minotaur` | Arbitrary-pair search |
| `/stats/ratings` | Global account Elo; profiles also show Elo and history |

All have `/api/stats/...` JSON equivalents. Feature identifiers are
`section:key`, e.g. `items:weapons.war_axe`, `species:minotaur`, `jobs:fighter`,
`gods:trog`, `monsters:hobgoblin`. An observed action suffix is `~<action>`, e.g.
`items:potions.curing~quaff`. URL-encode identifiers. `stage=1|5|10|15|20`
selects the acquired-feature snapshot band (default 1); starting-choice
comparisons always use the start cohort. `lookup=1` returns at most 30 feature
suggestions without building the full estimate table. JSON exports preserve
search, comparison and gameplay scope; unknown/same-feature pairs return 404.

`skill_rating.py` and `outcome_effects.py` are reusable calculation cores, with
no Crawl, storage or UI dependencies. `stats_analysis.py` supplies record,
identity, exposure and challenge adapters; `stats_observations.py` handles
bounded snapshot retention; `stats_analysis_views.py` supplies presentation.
No engine rebuild is needed: all ingestion uses the existing snapshot contract.

```sh
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest webtiles.stats_analysis_test webtiles.stats_test -v
```

Numerical fixtures cover known effects, four-cell interactions, a Simpson's
paradox control, missing scores, sparse/account support, deterministic Elo,
concurrent-run leakage, party dedup, wizard/QA exclusion, and cache migration.
HTTP and browser checks cover global-filter invariance, unknown rows, arbitrary
pair lookup, preserved context, escaping, and progressive interaction search.

For the browser check, start the isolated synthetic fixture in one terminal:

```sh
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python crawl-ref/source/webserver/tests/helpers/stats-fixture.py
```

Pass its printed localhost URL as `STATS_TEST_URL` when running
`node crawl-ref/source/webserver/tests/stats-impacts.cjs` with Playwright available
in `NODE_PATH`. The fixture uses temporary storage and never touches the real
archive. On 2026-10-17, all 51 stats/analysis/library tests and these browser
workflows passed, including mobile overflow and ordinary forms without JS.
Synthetic effects of +35 win percentage points and a +30-point/+300-score
interaction validated the calculations and presentation; these are fixtures,
not measured gameplay effects. Screenshots were inspected for desktop/mobile.

A read-only audit of the launcher's actual local archive
(`crawl-ref/source/rcs`, not the repository-root cache) found 146 public hero
records: 145 alive and one dead; zero eligible completed account expeditions,
zero supported effect estimates, and 1,737 catalog features. More eligible
completed games and pre-result snapshots are required for real estimates.
This validates the local implementation, not deployment, fresh native gameplay
or prediction calibration. Existing unrelated working-tree edits were preserved.
