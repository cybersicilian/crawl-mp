# Curated content port: audit, reconciliation and validation (30 October 2026)

Continuation of the curated port described in `port-manifest.md`, picking up from the
Codex handoff checkpoint (`docs/diagnostics/2026-10-29-content-port-checkpoint.md`,
Codex evidence `cubus-grape-validation-r9`). Work happened in the git worktree
`claude/dcss-content-port-071894`; the uncommitted port work of the main checkout
(661 entries at HEAD `0dc5e2ceeb`) was mirrored into it first as commit
`f63b93bf87` so that nothing in the main checkout was touched.

Evidence for every gated phase below lives under
`/Users/iancaltabiano/.claude/projects/-Users-iancaltabiano-Documents-Projects-dcss/evidence/content-port-20261030/`
(`phase.json` request ids, `reservation.json`, `closure.json`, logs). All phases ran
under the shared host-heavy gate with their own reservation and were released with
all-owned-processes-gone evidence.

## 1. Reconciliation against r9

- Every one of the 19,611 source files bound by r9 (`source-binding.json`) matched the
  live checkout byte for byte except `init.txt` (a runtime rc file) and Xcode
  framework symlinks under `contrib/`.
- The live checkout's generated `mon-data.h` was stale (eight monster yaml files newer
  than it). Regenerating with `util/mon-gen.py` reproduces r9's hash exactly
  (`2365bb16…`), as does the rebuilt atlas (`player.png` `6e6475f4…`,
  `main.png` `15d9c7eb…`). Generated outputs are build products (git-ignored); they
  were regenerated in the isolated candidates, not copied into the checkout.

## 2. Isolated WebTiles candidate and native validation

| Phase | What | Result |
|---|---|---|
| `web-candidate-r1` | WEBTILES build (`-DUSE_TILE_WEB -DWIZARD -DASSERTS`, no SAVE_DIR_PATH/SHARED_DIR_PATH/DGAMELAUNCH), `crawl` + `webserver` assets + `catch2-tests-executable`; node checks creature-roster, party-data, grape-ui-browser | build and the three UI checks passed; single-process Catch2 aborted at case 41/830 (harness, see §4) |
| `catch2-full-r2` | per-file Catch2 run on that binary | 809/830 passed; 8 failures and 13 aborts, all traced to test-harness initialisation and console animation in a WEBTILES binary (fixed in §4), none to game code |
| `two-client-cubus-grape-r1..r3` | prepared Codex draft fixture, bound to the candidate with a reviewed isolation attestation (private runtime, `shared_dir = <runtime>/rcs/saves`, per-game `CRAWL_SAVE_DIR` under the private library, accounts deleted afterwards) | see §3 |
| `web-candidate-r2..r4` | DEBUG WebTiles builds of the combined source after the audit fixes; per-file Catch2, UI checks, builddb (compiles every des, so the new vaults parse), Lua fixtures (`curated_port_golemforge`, `curated_port_zot_hall`, `curated_port_step6`, `curated_port_imus`, `burrows`) | build, builddb, UI checks and all five Lua fixtures passed; Catch2 844/852 in r4 (22 new cases, all passing). Remaining: 3 failures and 5 aborts, see below |

Remaining Catch2 items after r4, none in ported game code: the Fallen umbra test and
the new gauntlets-of-Distortion blink test both throw a `basic_string` exception from
actor movement in the headless WEBTILES harness (the Fallen case passed in the Codex r9
local-tiles debug harness); `test_pakellas.cc` "Every live wand and XP evoker has an
explicit Prototype profile" fails in isolation (fork-own Pakellas); five Vellum tests
abort on a DEBUG-only `CrawlStoreValue` type assertion (fork-own Vellum, latent in
release builds). Catch2 harness fixes made along the way: a listener initialises the
static game tables and resets the level grids once per process, cursor validation is
skipped before the console starts, and the poison fixture disables animations; these
let a single file or case run alone with the same result as the full suite.

## 3. Two-client Cubus / grape fixture

Run on the `web-candidate-r1` binary (`crawl` sha256 `ca0cf5a5…671d`) through the
isolated `qa_server.py` runtime with two freshly registered, later deleted accounts
(`two-client-cubus-grape-r4/evidence.json`, `success: true`, no client errors):

- two authenticated clients each control their own party slot;
- the Cubus disarmed the intended hero each time (guest first, then host), the weapon
  stayed in that hero's inventory, the other hero's inventory was unchanged, and the
  victim re-wielded through ordinary input;
- only the guest inside the grape aura was suppressed; the map packet carried
  `aura_radius: 2` and the equipment slot carried the interdimensional-grape reason
  (first melded slot: the buckler);
- dismissing one of two overlapping grapes preserved the suppression;
- suppression and ownership survived a save, library reload and two-client reconnect;
- the guest descending to D:2 had its gear restored there (29 ticks) while the D:1
  host stayed untouched; a grape next to the host then suppressed only the host.

Fixture adaptations from the Codex draft, all recorded in r1-r3 closures: turns are
advanced for every hero that reports `can_act` (shared combat time otherwise stalls a
lone client), monster actions are frozen across the floor split (a mobile grape walked
to the host in r3), and the lane-blocker probe is informational (a paralysed orc
stalled the scheduler in r1; the Cubus reached melee past a plant in r2 and r4). The
probe therefore proves nothing about beam interception; the draft said as much.

## 4. Manifest audit: findings and what was done

Five read-only audits covered every manifest line (species and traits, backgrounds,
gods and spells, monsters and vaults, items and mechanics). Present with tests and
descriptions: all 13 species, the trait framework, rune locks and trap modes, Preacher,
Sage, all standalone backgrounds, the three gods, 6★ blessings, the respect table, all
eleven spells (Animate Armour = trunk's Awaken Armour), Cubus, grape, fire fox, Rin,
Orb Demon, ancient automaton, greenwood witch (in our Forest), the four kimjoy uniques,
the mercenary roster and shop, Golemforge, the Zot:5 hall, all listed items, the bag
slot, bunker, corpse knockback and the autofight swap.

Gaps found and fixed in this pass:

- Native species/background screens hard-coded a 20-row `OuterMenu`; the Intermediate
  species column needs 21 rows and the Zealot/Adventurer/Metamorph column 28, which
  asserts in any `-DASSERTS` build. `newgame.cc` now sizes the menu from the group
  tables (`newgame_menu_height`), with `catch2-tests/test_newgame_layout.cc`.
- Ghost trait now draws on bloatcrawl2's Mirror Eidolon as the manifest asks: no
  natural regeneration, 1 HP fades every 15 turns (never below 1), personal kills that
  give XP restore 1 + HD, capped at a quarter of max HP (`character-trait.cc`,
  hooks in `player-reacts.cc`, `mon-death.cc`, `player.cc`; five new tests).
- No species recommended any of the 14 new backgrounds; 22 species yaml files now do,
  checked against `ng-restr.cc` bans, with a test that every ported job is recommended
  by some starting species.
- Caravan and Collector fell to `TILEG_ERROR` in `tileidx_player_job` and lacked
  `class-art.js` glyphs; both fixed.
- Kitsune had no player art (human fallback); the unused `kitsune.png` sprite is now
  `TILEP_BASE_KITSUNE` and the selection icon.
- Meliai `walking_verb` "Flap" produced "Flaper"; now "Flapp". Hermit Crab "scuttl"
  capitalised.
- High Elf yaml renamed from `deprecated-high-elf.yaml` to `high-elf.yaml`.
- Elder Pantheon canon text added to Paladin, Healer, Berserker (and Preacher, Sage)
  background descriptions; the three silent elders are named as such in `gods.txt`.
  `godname.txt` epithets for Imus Thea and Agraphede.
- The three new gods had no altar vaults; one themed overflow vault each in
  `dat/des/altar/overflow.des` (`temple_overflow_<god>` tags, note "the Great Wyrm"
  lowercases to `temple_overflow_the_great_wyrm`).
- Golemforge had a single entrance; two more sealed-forge-door entry vaults share the
  existing `chance_golemforge` roll.
- `caravan_mercenary_shop` lacked the standard shop vault TAGS.
- `auto_bag_items` is now exposed in the WebTiles settings schema (as the item-class
  symbol string the rc option actually is).
- 23 zero-byte `*.o.tmp` files committed by the checkpoint were removed.
- New tests: unique/shop/altar/entry vault definitions and depths
  (`test_curated_vaults.cc`); gauntlets of Distortion, Unseen Dragon, Erysichthon's Jaw,
  Scorpio beckon, seeking brand, iron dragon scale drop, Irit low-level encumbrance
  (see the test files named in §2's final phase log).
- Test harness: `test_main.cc` initialises the static game tables and resets the level
  grids once per run, headless runs skip cursor validation, the kimjoy poison fixture
  disables animations, and `test_branch.cc` treats Burrows as the guaranteed Lair child
  it is.
- Wight granted the removed legacy `MUT_UNBREATHING` (no mutation definition exists);
  undead species are unbreathing through `player::is_unbreathing()`, so the grant was
  dropped.

## 5. Decisions and flags for review

- **Ironheart beastmaster (bcrawl) was not ported.** Trunk already has the ironbound
  beastmaster (beast-commander niche, aura-based). The handoff treated the pair as a
  niche collision under the manifest's "one design per niche" and "no reworks of trunk"
  rules; this pass keeps that reading and flags it. If the bcrawl whip-and-move-energy
  mechanic is wanted, it is a separate, rebranded monster design.
- **Asclepia / Brandagoth fork-only upgraded follower forms were omitted**: they rely
  on old Beogh follower growth that trunk replaced; the base uniques are ported.
- **Provisional balance choices** (unchanged from the handoff, still provisional):
  spawn weights and XP values of Cubus, grape, Orb Demon, ancient automaton, greenwood
  witch and the four uniques; Orb Demon uses Bolt of Devastation and Deflect Missiles for
  removed fork spells; the whole Golem Armour set sits in the Golemforge main vault (a
  "collection" only within that portal); the Ghost trait's fade and harvest numbers;
  Golemforge portal chance 500.
- **Meteorologist's evoker kit** (fan of gales, lamp of fire) no longer exists in trunk;
  the Wanderer pool already draws the modern area/control evokers, so no change was
  made.
- **Slime vault pack**: the nicolae-carpathia vaults are trunk-adopted already; only the
  grid layout was fork-specific and is present. The three bcrawl-only Slime vaults are
  old trunk removals and were not restored (manifest rule 3).
- **Unrand vaults**: neither bcrawl nor kimjoy ship vaults for the ported unrands; they
  generate through the normal unrand pool. No vault was invented.
- **Faerie Dragon** derives AC/SH from XL with a flat stealth penalty rather than
  literally from negative stealth; **Irit** is "strength-weighted" through its stat
  line and trunk's Str-based armour penalty rather than a new casting formula; **Ent**
  is `size: large`. Left as implemented; flagged.
- **Neckbeard / Billionaire flavour**: a −4 long sword, hat and cloak stand in for the
  fedora, cape and rusty katana (no katana base type was added, per the no-bloat rule);
  "bathrobe" exists only in description text.
- **Trait job bans** (good-god starts, Slime Priest, Shapeshifter, Stalker cannot take
  undead traits; Apothecary cannot be a Mummy) are the handoff's addition beyond the
  manifest text; kept.
- **Checkpoint-era content that the manifest's cut list mentions** (Pakellas, revived
  trunk unrands and spells) predates the port and is the fork's own work; it was not
  touched.
- **Killer bee larvae** appear only in the `hive_split_brood` vault, consistent with
  the Burrows checkpoint's "no automatic bee packs" rule.
- **Mercenary shop gameplay test**: not retried (pending user approval).
- **Lane-blocker probe** in the two-client fixture is informational: live AI destroyed
  the plant blocker (r2) and a paralysed orc stalled the shared-time scheduler (r1).
