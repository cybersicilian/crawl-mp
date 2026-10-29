# Port Manifest — the curated set

The single consolidated set of content to port from bloatcrawl2 / bcrawl / kimjoy2002-crawl
into this fork. Deduped across the three forks, name-collisions resolved against our tree
(custom species: oni, tortle, chain-devil, coglin, gale-centaur, oozle, poltergeist, revenant,
eldritch…; taken job names: alchemist, healer, paladin, reaver, shapeshifter, stalker, monk…).
Everything jokey is cut. Source in parentheses; see fork-content-survey.md for full inventory.

Design rules applied:
- One design per niche. Where forks overlap, the stronger mechanic wins and absorbs the other.
- Our 0.35-dev tree wins every name collision; imports get rebranded.
- No reworks of existing trunk species/gods/systems (keeps upstream merges cheap). Rework
  ideas live in the appendix as optional cherry-picks only.
- The joke layer is excluded; a couple of the best jokes are listed at the end as optional.

## Species (13) + one meta-system

1. **Automaton** (kimjoy) — flagship. Engraved spells auto-fire; Heat gauge instead of MP.
   Absorbs bloatcrawl2's *Robot* (laser breath becomes an engravable option).
2. **Hydra** (kimjoy) — head-per-XL cleave, amulet growth, no weapons.
3. **Two-Headed Ogre** (kimjoy) — true dual-wield, two amulets, no shield.
4. **Hermit Crab** (bloatcrawl2) — breakable upgradable shell; absorbs kimjoy *Crustacean*'s
   per-XL molt and "crab walk" as polish.
5. **Protean** (bloatcrawl2) — amoeba whose HP/size scale with mutation count.
6. **Faerie Dragon** (bloatcrawl2) — flight + −1 MP spells + defense-from-−stealth. Absorbs
   bcrawl's *Fairy* entirely (same niche; faerie dragon is the richer frame).
7. **Ent** (bcrawl) — slow giant, innate Passwall, 2H+shield, no forms.
8. **High Elf** (bcrawl version) — resurrected with the XL/3 skill-floor rule. (kimjoy also
   restores a HE; bcrawl's skill-floor gimmick is the one worth taking.)
9. **Irit** (bloatcrawl2) — blood-magic heavy-armour caster. Absorbs bcrawl *Sand Dwarf*'s
   niche. **Djinni differentiation** (Djinni: MP pool abolished, casts from HP only, frail
   floating +11-all-schools caster): Irit keeps a real MP pool and casts cost **HP in
   addition to** MP — it gambles with the mana system, it doesn't leave it. Irit's perks go
   the other direction from Djinni's frailty: strength-weighted, armour-trained, and with
   reduced encumbrance penalty on low-level spells (the armoured battle-caster Djinni can
   never be). If our WIP **bloodcraft** school lands HP-costed spells, Irit should get
   discounted bloodcraft HP costs as its racial hook.
10. **Sparkborn** (kimjoy) — blink-bolt retaliation, water discharge risk.
11. **Wight** (kimjoy) — draining melee + weapon-burial enchanting. The martial undead niche
    the undead modifier (below) doesn't cover.
12. **Kitsune** (bloatcrawl2) — activated Charm, frail trickster. Weave in kimjoy's Rin the
    nine-tailed as its patron unique.
13. **Meliai** (kimjoy) — bee-folk with built-in amulet of faith + Smite. Canonized as the
    Hive's people: our WIP Hive already names a `hive_meliai_cache` vault; Meliai are what
    it belongs to. (Also folds kimjoy's Hive salvage — bee larvae cast — into one theme.)

**Undead traits** (bloatcrawl2 game-modifier framework): choose None, Mummy, Zombie,
or Ghost independently for each eligible party member. Mummy becomes a trait rather
than a selectable new-game species; existing Mummy saves retain their legacy identity.
Revenant and Poltergeist remain species and cannot select additional undead traits.
Nonliving species are also ineligible. Ghost draws on *Mirror Eidolon* while retaining
the host species' identity. Vampire and all food-based mechanics are excluded.

## Backgrounds — the Elder Pantheon + 9 standalones

**The Elder Pantheon** (replaces both the zealot job set and the Devotee modifier):
canonically, eight primordial gods form the Elder Pantheon — but only five keep mortal
birthright orders; every other god, elder or not, is discovered through altars in the
dungeon. The elders, and who carries their start:

| Elder god | Birthright start | Status |
|---|---|---|
| The Shining One | **Paladin** | exists here |
| Elyvilon | **Healer** | exists here |
| Trog | **Berserker** | exists here |
| Zin | **Preacher** | new (bc2 "Zinja" kit, renamed) |
| Sif Muna | **Sage** | new (bc2 "Librarian" kit, renamed) |
| Okawaru | — | elder, no mortal order (exploration-only) |
| Kikubaaqudgha | — | elder, no mortal order (exploration-only) |
| Cheibriados | — | elder, no mortal order (exploration-only) |

The three silent elders (Okawaru, Kiku, Chei) are canonically among the oldest powers but
take no birthright devotees — finding their altars is the only way in. Their bc2 kits
(Warrior, Kikumancer, Torpor Knight) are cut.

Canonized as *non-elder* powers whose existing/devotee starts stay as special cases:
Xom (chaos-knight/jester — chaos predates pantheons, and doesn't do birthrights),
Ignis (cinder-acolyte — a dying god), Vorr (blood-hunter — our custom god), Yredelemnul
(death-knight), Lugonu (abyssal-knight). Makhleb, Vehumet, Nemelex, Fedhas, and the
young/strange gods stay exploration-only — that's the intended default for most of the
pantheon.

Standalone picks (each adds a mechanic a god-start can't):
- **Hermit** (bc2) — starts worshipping Ru with an early *sacrifice* already made: you begin
  weakened. Ru is young by definition; this is a special case, not an elder.
- **Slime Priest** (bc2) — starts pre-mutated with Jiyva mutations. Same special-case logic.
- **Archaeologist** (merged): bloatcrawl2's crate/tome unrand quest + bcrawl's whip/curare
  starting kit for flavor. One design, one name.
- **Caravan** (kimjoy) — mercenary companion economy.
- **Collector** (kimjoy) — wish/collection scroll start.
- **Rogue** (bcrawl) — assassin+artificer merge. (bcrawl's Reaver cut: name taken.)
- **Fencer** (bloatcrawl2) — pre-equipped acrobat kit.
- **Ronin** (bloatcrawl2) — first-god piety bonus; harmonizes with the elder rule as the
  "undecided faithful" start.
- **Apothecary** (renamed bc2 "Alchemist": homebrew potions start; our `alchemist` is taken).
- **Billionaire** (bc2) — bathrobe, a pile of gold, stealth/dodging; a start that dares you
  to buy your way out.
- **Neckbeard** (bc2) — fedora, cape, rusty katana, teleport-behind-you gimmick.
- **Philosopher** (bc2) — the thinking hat and very little else.
Cut: Meteorologist (fold its evoker kit into Wanderer pool), bcrawl Martial Artist, Sloth
Apostle, Spelunker (our `delver` covers the niche), Weapon Master, Arcane Warrior, Melted
Knight, and the remaining bc2 zealot kits whose gods didn't make the eight (Blood Knight,
Bound, Dancer, Death Bishop, Disciple, Gambler, Gardener, Inheritor, Merchant, Night
Knight, Annihilator); the joke jobs except Billionaire, Neckbeard, Philosopher
(kept by request), and Derserker.

## Gods (3 new + one system)

- **Imus Thea, the Refracted** (kimjoy) — reflection god; reflects all projectiles.
- **The Great Wyrm** (kimjoy) — alchemy god; potion→essence distillations.
- **Agraphede, the Primal Vermin** (kimjoy) — webs/traps/poison conversion.
- Cut: Legion from Beyond (summoning-god niche is full: Yred/Hep/Uskayaw), Pakellas rework
  (restoring a removed god fights upstream).
- **6★ weapon blessings system** (kimjoy): Ely→pacifying, Chei→sluggish, Zin→silver,
  Jiyva→slimifying brand gifts. Adopt as a cross-god capstone.
- **God mutual-respect conversion table** (bcrawl): some gods don't punish conversion to
  specific others. Small, adopt.

## Spells (11)

From bcrawl: **Shackle**, **False Image**, **Mana Rupture**, **Icicle Burst**,
**Steam Barrier**, **Blight**, **Scorpion Form**.
From kimjoy: **Eringya's Rootspike**, **Olgreb's Last Mercy** (the poison pair),
**Elemental Weapon**, **Animate Armour**.
Cut: Time Stop (engine fiddly), Summon Fire Elementals (trunk has coverage), Heal Wounds
spell, Hooded Malice/Lively Mass, Eldritch Form, Wall Camouflage, Blink Other, Tree Form,
Flame Strike, Shrapnel Curtain, Flaming Arrows, Necrotize, Cigotuvi's Plague (plague niche
reserved; Plague Shambler etc. already exist in trunk).

## Monsters

- **The gear-griefers pair** (kimjoy): **Cubus** (disarms weapons, strips jewellery) +
  **interdimensional grape** (equipment-melding aura). One mechanic, two monsters.
- **Fire fox + Rin the nine-tailed** (kimjoy) — Lair flavor + unique; ties to Kitsune.
- **bcrawl pack**: Orb Demon, ironheart beastmaster, ancient automaton, greenwood witch.
- **kimjoy uniques**: Asclepia, Brandagoth, Lichbane, the Fallen.
- **Mercenary monster roster** (kimjoy) — ships with Caravan + mercenary shops.
- Cut: THE GIAGGOSTUONO (joke; optional appendix), restored removals (doom hound et al. —
  we track trunk, removing things trunk removed is fine).

## Items & artefacts

- **bcrawl item bits**: ring of insulation, scarf of stasis, iron dragon scales (drop),
  seeking bow brand, robe ego magic-recovery.
- **Unrands (6)**: Fists of Thunder, Scorpio, Autumn Katana, Staff of Battle,
  sapphire dagger, butterfly sword (bcrawl); renames as needed if flavors clash.
- **Golem Armour set** (kimjoy) — 4-piece collectable that unlocks a transformation.
- **kimjoy artifacts**: viper's Fang (virulence), gauntlets of Distortion, scales of the
  Unseen Dragon (invisible-when-struck), Erysichthon's Jaw.
- **Utility items**: pipe of recall, flask of healing mist (kimjoy); air horn, ancient crate,
  dusty tome (bloatcrawl2); scrolls of collection/wish (Collector).
- **The bag, promoted to an equipment slot** (kimjoy, redesigned): kimjoy ships `MISC_BAG`,
  a free-form container misc item with an `auto_bag_items` rc option. We take its storage
  plumbing but make it **equippable**: a new `EQ_BAG` ("back") slot, one per humanoid
  species (excluded for incorporeals like poltergeist; two-headed ogre gets no extra).
  Base types scale capacity — pouch (+4 slots), satchel (+8), bag of plenty (+12) — with
  the kimjoy auto-store behavior and rc option intact. Unequipping over capacity forces a
  drop prompt. Kept rare: it's a direct release-valve on crawl's deliberate inventory
  pressure, so treat it like a good ego drop, not shop stock. Canonical tie: caravan trade
  goods — Caravans start with a plain pouch, and the bigger bags surface in mercenary-shop
  stock.
- **bunker** shield ego (kimjoy).
- Cut: crystal spear base weapon (weapon bloat), restored rods/wands era, Lajatang/brand
  reworks that fight trunk versions (Sharur vs Undeadhunter, Plutonium Sword, Wucad Mu).

## Branches & vaults (revised after reviewing our WIP)

Our WIP already restructures the mid-game: Lair:bottom → **Burrows** (4 floors) →
**Wormlands** (fills depth to Depths:1) with **the Hive** (2 floors) branching off
Burrows:2; the **Enchanted Forest** is being revived as a *rune* branch off Vaults:2–3
on the same vestigial `BRANCH_FOREST` enum bcrawl's Spriggan Forest uses; and the **Hall
of Blades** sits off Vaults. Against that:

- **Spriggan Forest (bcrawl) — CUT.** Same enum slot, same `forest.des` path, near-identical
  monster cast (spriggan rider/druid/mangrove) as our own Forest revival. Instead, *mine*
  bcrawl's 839-line `forest.des` and its monster pack for our branch: **greenwood witch**
  (Sleep/Polymorph/Bolt of Draining) fits our Forest cast directly.
- **The Hive (kimjoy portal) — CUT.** Same theme and the enum name `BRANCH_HIVE` is
  literally taken by ours. Portable salvage: kimjoy's hive restores **killer bee larvae**
  and its queen/brood structure — usable as population/vault feedstock for our Hive, which
  already nods at the same lineage (`hive_meliai_cache`).
- **Golemforge** portal (kimjoy) — **adopted, made canon with our forge flavor**: retcon it as
  a forge-temple ruin of the first coglins, abandoned by the forgewrights, now guarded by
  machine golems, iron golems, and crystal guardians (kimjoy's Golemforge cast). The
  **Golem Armour set** is its treasure — the abandoned masterwork of the forge-temple
  itself, which gives the 4-piece collection quest a home and a story. Portal entrance
  vaults themed as sealed forge-doors.
- **nicolae-carpathia Slime Pits pack + Slime layout** — compatible; our WIP doesn't touch
  Slime.
- **Zot:5 hall variant** (bcrawl) — compatible.
- **Unrand vaults + mercenary shops** — compatible.
- Cut: bcrawl's structural reshuffle (D:12, no-rune Vaults, 3-floor Lair branches) —
  our Burrows/Wormlands redesign supersedes it in spirit already.

### Burrows integration checkpoint — 28 October 2026

The encounter revision in [the native balance report](docs/design/burrows-playtest/tuning-20261028/README.md)
ships alongside this curated port. Keep our guaranteed, rune-free Burrows:1–4,
optional Hive:1–2 off Burrows:2, and mushroom-themed Wormlands:1–4 to Depths.
The port's step 1 modifier framework keeps the existing XP system; these branch
budgets and the two explicit brute XP valuations are content data, not a new XP
formula. Native band, party and HP scaling remain in effect.

Preserve the tuned ordinary populations, the shared initial-arrival placement
masks in Hive/Wormlands endings, native honey movement and connected dry paths.
Kimjoy Hive salvage and the playable Meliai remain step 2 feedstock: add neither
a second Hive nor automatic meliai/bee packs to the tuned population. Any new
larvae or brood vaults replace existing encounter weight and must retain rough
per-floor XP parity with comparable progression (Snake/Spider for Burrows/Hive;
late Dungeon through Depths:1 for Wormlands). Do not pad XP with harmless larvae.

[The integration record](docs/design/burrows-playtest/tuning-20261028/port-integration/source-inclusion.json)
checks exact encounter files in the port snapshot. The standard test-object
list includes the honey and population-budget contracts alongside the port
modifier/trait checks. Branch generation and native contracts are separate from full-route combat acceptance: no tested fixture has
cleared the complete route, so encounter balance remains provisional. The existing
Forest and Hall of Blades work is preserved; no branch enum or rune identity is
repurposed by this integration.

## Mechanics

1. **Game-modifier framework** (bloatcrawl2): per-character undead traits plus shared
   no-rune-locks and trap modes. Keep the existing XP system unchanged. Skip chaoskin
   (permanent Xom), Vampire, and food-based mechanics. Trap modes preserve essential
   puzzle mechanisms and passages.
2. **bloatcrawl2 yaml plumbing**: walking_verb, altar_action, fake_mutations,
   per-species job recommendations.
3. **Bag equipment slot** (kimjoy storage plumbing + new `EQ_BAG` slot, species slot masks,
   tiles, overflow-unequip prompt) alongside the set-collection and mercenary economies.
4. **M&F corpse knockback** (kimjoy) — contained, fun.
5. QoL trio (bcrawl): adjusted weapon-damage display, autofight melee↔launcher swap,
   monster max-damage/spell info. Decimal AC/EV/SH displays optional.
Cut: bcrawl combat-math overhaul, hunger/food restoration, draconian overhaul, XP/regen
formula changes — all fight upstream drift for flavor-level gains.

## Explicitly cut (appendix)

- All joke content (Boomer..Zodach, TMNT turtles, Billionaire, Gonger, etc.). Optional
  single exception: THE GIAGGOSTUONO as an easter-egg Pan unique, behind a vault weight of ~0.
- Species: Astral, Silent Spectre, Fungoid, Bol Xi, Nelexian, Leprechaun, Ancient Gnoll,
  Butterfly, Januvian, Unipode, Quill Orc, Ratling, Gnome, Grue, Bunyip, Argon, Flan,
  Xeno Elf, Crystal Dwarf, Unfathomable Dwarf, Avariel, Lesser Lich, Homunculus, Meliai,
  Mantis, Shapeshifter-species, Pearl Draconian, Angel (both versions — good-god species
  fights trunk's post-0.3x design direction; revisit if wanted). bcrawl's
  Skeleton/Vampire/Ghoul/Troll/Vine Stalker reworks (upstream-drift rule).
- kimjoy's restored trunk cuts (species/jobs/spells/items/foods) — excluded by rule 3.
- bcrawl Spriggan Forest (our Enchanted Forest revival takes the enum, the file path, and
  the monster cast; we mine it for greenwood witch + vault ideas instead) and kimjoy's Hive
  portal (ours exists; salvage = killer bee larvae as population, folded into the Meliai
  species land).

## Suggested implementation order

1. Game-modifier framework (per-character undead traits, no-rune-locks, trap modes;
   existing XP unchanged)
2. yaml plumbing + species batch (Automaton, Hydra, THO first — they're kimjoy flagships;
   Meliai lands with the Hive feedstock pass)
3. Elder Pantheon batch (Preacher + Sage — one pattern, two jobs, plus canon text for the
   five start-keeping elders and the three silent ones)
4. Background batch (Hermit, Slime Priest, Archaeologist merge, Rogue, Fencer, Ronin,
   Apothecary, Billionaire, Neckbeard, Philosopher; Caravan/Collector later with the
   mercenary economy)
5. Spell pack (spl-data + helpers)
6. Slime vault pack + Zot:5 variant (+ greenwood witch into our Forest)
7. Gods (one at a time: Imus Thea → Great Wyrm → Agraphede)
8. 6★ weapon blessings + unrand/items batch
9. Golemforge (canon forge-temple ruin) + mercenary economy + Caravan/Collector
10. QoL trio
