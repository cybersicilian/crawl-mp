# Fork content survey — bloatcrawl2 / bcrawl / kimjoy2002(crawl)

Date: 2026-10-27 · Survey of three DCSS content forks for portable content, filtered
against local master (0.35-dev + custom work). Everything listed below is **absent from
(or meaningfully different from) our tree** unless flagged otherwise.

| Fork | Base era | Fork commits | Scale | Character |
|---|---|---|---|---|
| Hellmonk/bloatcrawl2 | ~0.23 | 338 | +10.3k lines | Content pack: 47 species, 45 backgrounds, game-modifier framework. Mixed serious/joke tone. |
| b-crawl/bcrawl (bhauth) | ~0.23/24 | 4,699 | +47.7k lines | Deep balance/mechanics fork with own content: new branch, species, spells, unrands, god reworks. Serious tone. |
| kimjoy2002/crawl ("kimchi-crawl") | ~0.23, active to 2023 | 2,004 | +61.3k lines | Largest content additions: 12+ species, 4 new gods, spell packs, retains pre-0.26 hunger. Korean community votes. |

Name/design collisions already in our tree: **Oni** (our forgecraft oni vs bloatcrawl's
spell-discovery oni vs bcrawl's oni — three different designs), **Reaver** (ours =
spell-sword; bcrawl's = Vehumet start), **Alchemist/Paladin** job slots (bloatcrawl), 
**Shapeshifter** (our job vs bloatcrawl species), Archaeologist exists in **both**
bloatcrawl2 (crate→unrand quest) and bcrawl (whip/curare/acquirement) in different forms.

---

## 1. Species

### bloatcrawl2 (47 species, `dat/species/*.yaml`; serious ones first)
- **Hermit Crab** — shell AC upgrades at XL breakpoints; a big hit breaks the shell, find a smaller replacement; can't train Armour.
- **Mirror Eidolon** — new undead state; HP continuously fades, restored by killing.
- **Sloth of Wrath** — great apts, slow; berserks monsters on melee hits.
- **Irit** — spells cost HP as well as MP; low armour-encumbrance casting (heavy-armour caster).
- **Bol Xi** — all apts −9, periodically shuffles ALL aptitudes and attributes on a timer.
- **Ember Elf** — −50% max MP, fast MP regen; spells stronger but wilder with XL.
- **Faerie Dragon** — spells cost 1 less MP; +AC/+SH at −stealth; no body armour.
- **Fungoid** — cannot move while monsters in LOS; confusing spores when attacked.
- **Silent Spectre** — permanent silence aura (blocks own casting too).
- **Kitsune** — activated Charm ability; frail.
- **Protean** — max HP and size class grow with mutation count; auto-unequips gear at breakpoints.
- **Gnome, Grue, Bunyip, Argon (gas being), Astral (no resists possible), Crystal Dwarf, Flan (jelly: body armour only), Ratling (fast maturity), Robot (laser breath), Unipode (one ring slot), Xeno Elf (MP drains near enemies), Yeti (passive freeze aura), Quill Orc (fast reading), Shapeshifter-species (polymorphs to imitate nearby monsters), Januvian (alternating melee/magic apts), Unfathomable Dwarf (no healing except on kills), Angel→Profane Servitor (Yred conversion), Ancient Gnoll (stat-locked), Butterfly (monsters turn neutral on first sight), Leprechaun (lucky loot flag), Nelexian (random card effects), Moonotaur** *(borderline joke: max 1 dmg/hit, −90% HP)*.
- Hard jokes (skip or rename): Boomer, Dab Dwarf, Weed Elf, Turtle + TMNT variants, Mayflytaur, Slitherier Naga, Squat Elf (power squat), Hedgehog ("sonic" speed), Zodach.
- Species-yaml plumbing worth stealing: `walking_verb`, `altar_action`, `fake_mutations`, per-species recommended jobs.

### bcrawl (5 new + major reworks of 6)
- **Fairy** — −1 MP cost on all spells, can't wear armour.
- **Sand Dwarf** — no spellcasting penalty in armour.
- **Ent** — +40% HP, innate Passwall (through trees too), 2H weapon + shield; 1.4× action time, no body armour, no forms.
- **High Elf (resurrected)** — refuses to train any skill below XL/3.
- **Avariel** — Deep Elf + Tengu merge (winged elves).
- Reworks: **Skeleton** (guardian spirit, heals HP when casting), **Vampire** (bat form above Satiated, resists below), **Vine Stalker evolves at XL 8** into Mana/Twilight/Jungle Stalker, **Ghoul** (½ torment r, range-4 hop), **Troll** (no body armour, innate AC, gains regen/rF/rC by XL).
- Also: Hill Orc Fighting-for-all-weapons; Felid XP model overhaul; Formicid giant clubs.

### kimjoy (12 new, `dat/species/added_*.yaml`; wiki specs at github.com/kimjoy2002/crawl/wiki)
- **Automaton** — cannot cast directly; engraved spells auto-fire in combat; **Heat gauge instead of MP**; corrodes instead of mutating. Flagship design, incl. webtiles heat bar.
- **Hydra** — no weapons; +1 head per XL, +1 amulet slot per 3 XLs; cleave by head count.
- **Two-Headed Ogre** — true dual-wield + 2 amulet slots, no shield.
- **Wight** — draining melee; can bury/curse its weapon to enchant it semi-permanently.
- **Sparkborn** — blink-bolt counterattack when hit; water discharges into −Cast.
- **Homunculus** — casting stacks Wild Magic, melee relieves it; XL 14 specialization (Blossom/Adaption).
- **Lesser Lich** — combat MP regen with enemies in LOS; can become a permanent playable Lich.
- **Mantis** — automatic hop-attack when closing.
- **Crustacean** — deterioration offset by per-XL molt; knight-like "crab walk" movement.
- **Meliai** — bee-folk with built-in faith amulet + Smite.
- **Angel** (different design from bloatcrawl's) — starts worshipping a good god, wrath immunity pre-XL 15.
- **Pearl Draconian** — draconian worshipping a good god evolves at XL 7.
- Restored removals: High Elf, Lava Orc, Sludge Elf, Deep Dwarf, Centaur, Palentonga.

---

## 2. Backgrounds

### bloatcrawl2 (45)
- **God-zealot starts** (forced god + thematic kit): Blood Knight (Makhleb), Bound (Ash), Dancer (Uskayaw), Death Bishop (Yred), Disciple (Wu Jian), Doctor (Ely), Gambler (Nemelex), Gardener (Fedhas), Hermit (Ru), Inheritor (Hep), Kikumancer, Librarian (Sif), Merchant (Gozag), Night Knight (Dith), Paladin (TSO), Slime Priest (Jiyva, pre-mutated), Storm Cleric (Qazlal + air horn), Torpor Knight (Chei), Warrior (Oka), Witness (Beogh), Annihilator (Vehumet), Overseer (demonic patron).
- **Archaeologist** — dusty tome becomes a 700pt manual; finishing it converts the ancient crate into a random unrandart. Best-in-class gimmick.
- Kit/gimmick starts: Fencer (acrobat amulet pre-equipped), Sniper (harm amulet), Meteorologist (thematic evokers), Entomologist (sack of spiders), Aspirant (library + XP instead of manual), Soothslayer, Caveperson, Chaincaster, Deprived, Ronin (first-god piety bonus).
- Jokes: Billionaire, Neckbeard, Uncle, Gonger, Derserker, Misfortunate, Philosopher.

### bcrawl (4)
- **Rogue** — Assassin+Artificer merge. **Sloth Apostle** — Chei + wand of paralysis + Slow. **Martial Artist** — Wu Jian + Confusing Touch. **Spelunker** — digging wand/lamp/noise kit. Plus **Archaeologist** (curare + acquirement at XL 5 — different from bloatcrawl's).

### kimjoy (5)
- **Caravan** — hire a mercenary companion at start (14 merc types, gold economy, free item-giving).
- **Collector** — artefact acquirement scroll: rerollable "collection" or type-a-fixedart-name "wish" (locked until religious).
- **Melted Knight** (Jiyva from turn 0), **Arcane Warrior** (war-mage kit), **Weapon Master** (2H start).
- Restored: Assassin, Gladiator, Skald, Warper, Transmuter, Arcane Marksman, Venom Mage, Abyssal Knight.

---

## 3. Gods

### kimjoy — 4 brand-new gods + Pakellas restored
- **Imus Thea, the Refracted** — mirror/illusion god; reflects ALL projectiles incl. beams; Spectrum/Prism/Fragmentation powers; fragile body trade-off.
- **The Great Wyrm** — alchemy god; potion→essence transmutation powers (Nigredo/Albedo/Citrinitas/Rubedo).
- **Agraphede, Primal Vermin** — poison/vermin god; webs, traps, hornets, poison conversion.
- **Legion from Beyond** — pact-based summoning god (Legion Immortal/Positioning).
- **Pakellas reworked** — upgradable prototype rod with ~10 rod spells; no longer blocks MP.
- Cross-god **6★ weapon blessings with new brands**: Ely→pacifying, Chei→sluggish, Zin→silver, Jiyva→slimifying, Yred→vampiric, Trog→antimagic.
- Reworks: Trog (Furious Charge dash, book-burning, powers while berserk), Hep (battlemage ancestor, rune-scaled HP), Beogh (growable orc uniques II forms, follower recall), Yred (Return from Death — rise once as undead), Nemelex (Deck of Wonders + restored cards), Jiyva (level corruption, temporary pet jellies).

### bcrawl — no new gods, but 16 deep reworks
- Dithmenos (shadow clone step, noise-halving umbra), Jiyva (piety from kills, AC from mut count), Fedhas (piety from kills), Wu Jian, Cheibriados (Defer blink-away, potion doubling), Qazlal (Become The Storm), Makhleb (Hew dash), Uskayaw (lunges, silence immunity), Ashenzari (free curse/costly uncurse, SInv amulet), Yred (passive corpse animation), Trog (torment immunity 4★), Sif (Moment of Magic instant cast), Hep (Incarnate), Lugonu (3★ = all melee distortion), Kiku (miasma buffs, 75% torment r), Ely (absolute HP/MP vigour), Gozag (time-scaled shop costs).
- **God mutual-respect table**: some gods won't punish conversion to specific others.

---

## 4. Spells

### bcrawl (12 player spells)
Shackle (L2 Hex, root), False Image (L3 decoy you can shoot through), Blink Other (player), Time Stop (L8 — cast <L5 spells instantly), Mana Rupture (L7, dmg ∝ enemy MR), Icicle Burst (L7 scattershot), Flaming Arrows (L2, MP/projectile), Steam Barrier (L5/6, steam + AC scaling), Necrotize (L1 Pain+zombie), Blight (L7 AoE drain/slow), Tree Form (L4), Scorpion Form (L7, rF++/rCorr/+poison enh), Summon Fire Elementals (L7 player version), Confusing Touch redesign.

### kimjoy
Eringya's Rootspike (L5 smite partially ignoring rPois), Olgreb's Last Mercy (L7 poison-stack detonation), Cigotuvi's Plague (L5 infectious; corpses→abominations), Elemental Weapon (L3 weapon-branding), Flame Strike (L3 MP-fed cleave), Shrapnel Curtain (L1), Animate Armour (L4), Summon Hooded Malice / Lively Mass (L6 healers), Will of Earth (L4 wall-eating), Wall Camouflage (wall-merge stabs), Eldritch Form (L9), Heal Wounds spell. New books: Memoirs of the Virtuoso, Tome of Valor, Book of Aid, Book of Armaments, Akashic Record restored.

### bloatcrawl2
None (no spell changes at all).

---

## 5. Monsters

- **kimjoy**: Cubus (disarms weapons/strips jewellery), fire fox + Rin the nine-tailed unique, **interdimensional grape** (aura slowly melds your equipment), machine golem, quicksilver ooze, pavise/barricade/Imus mirror constructs, 14 mercenary types, uniques (Asclepia the Therapist, Brandagoth, Lichbane, the Fallen). Restored removals: doom hound, blood saint, corrupter, warmonger, black sun, the Enchantress, etc.
- **bcrawl**: Orb Demon, ironheart beastmaster (whip + beast-haste aura), ancient automaton (Slime), greenwood witch. (Rockslime, wendigo, goliath frog, will-o'-wisp were ported into trunk already — excluded.)
- **bloatcrawl2**: THE GIAGGOSTUONO (deliberate joke Pan unique).

---

## 6. Items / artefacts / brands

- **bcrawl**: ring of insulation, scarf of stasis, iron dragon scales, seeking brand (+50 skill on bows), robe ego "magic recovery" (2× MP regen). Unrands: Fists of Thunder (elec unarmed wraps), Scorpio (beckoning hand crossbow), butterfly sword, Sharur (cleaving venom great mace), sapphire dagger (flash freeze), Staff of Battle (lajatang + spectral weapon), Hendrick's axe, Autumn Katana (grants Wu Jian walljump), Leech (antimagic mana-restoring), serpentine sling (petrify brand).
- **kimjoy**: crystal spear (new 1H base weapon), **Golem Armour set** (collect 4 pieces → transformation power), Erysichthon's Jaw, scales of the Unseen Dragon (turns invisible when struck), gauntlets of Distortion, viper's Fang (virulence: strips rPois per hit), bag (free-form storage + `auto_bag_items` rc), pipe (recall allies), flask of healing mist, **bunker shield ego** (deploy shield as barricade), god-blessing brands (pacifying/sluggish/silver/slimifying), scrolls of collection/wish.
- **bloatcrawl2**: air horn (Sonic Wave + self-Mark), ancient crate + dusty tome (Archaeologist quest props).

---

## 7. Mutations

- ~38 bloatcrawl2 mutations, mostly species-scoped (listed under species); generic-interest ones: LUCKY (loot-quality flag through makeitem.cc), HEAL_ON_KILL, BLOOD_MAGIC, SILENT_AURA, ALWAYS_FAST, HERMIT_SHELL, PROTEAN_BODY.
- bcrawl: MUT_FAIRY_FLIGHT, MUT_NO_ARMOUR_CAST_PENALTY, MUT_MAGIC_HEAL, MUT_HALF_TORMENT_RESISTANCE; Flexible Skeleton demonspawn facet.
- kimjoy: blinkbolt, combat mana regeneration (3 lvl), burialize weapon, faithfulness, hop/strong legs, iron fist, slime body, strong nose (scent detection), word of power (buffed holy-word scrolls).

---

## 8. Branches / vaults / level design

- **bcrawl — Spriggan Forest**: full Lair-side branch (`dat/des/branches/forest.des`, 839 lines), new monster set, alternates with Elven Halls; Slime moves to Orc. Mind the `BRANCH_FOREST` enum collision with trunk's vestigial Enchanted Forest slot. Also: nicolae-carpathia's Slime Pits vault pack + new layout, Zot:5 Hall of Zot variant, structural changes (no-rune Vaults, 3-floor Lair branches, Hell=2 floors/branch).
- **kimjoy**: two new mini-portals — **Golemforge** and **the Hive** (killer bee larvae restored); unrand vaults (golem armour, Erysichthon's Jaw), mercenary shops; restored Pakellas vaults.
- **bloatcrawl2**: none (game modifiers instead, see below).

---

## 9. Mechanics / systems (big-ticket engineering)

1. **bloatcrawl2 Game Modifiers framework** (highest systemic value): character-creation modifiers with full webtiles UI — play ANY species as Mummy/Zombie/Vampire/Ghost (`undead-mutations.h` drives it), Chaoskin (permanent Xom), No-rune-locks, Traps toggle (normal/none/floor-only/random), EXP modifier (−25/−50/+50%). Tags.cc save support included.
2. **kimjoy retained hunger/food system** (pre-0.26: food.cc, chunks, drinkable fountains, mutagenic corpses, Evaporate+Fulsome Distillation combos) — port only if the fork wants hunger back.
3. bloatcrawl2 **player-size rework** (player_size() split, auto-unequip on size change) and **Oni spell-discovery** (level-up spells ignoring schools).
4. bcrawl systems: AC/EV/SH random-rounding + decimal display; weapon damage rescale ((26+str)/36, short blades scale with dex, long blades +SH); GDR ∝ √(dex+armour skill), always displayed; ammo always mulches; stair-teleport hazard replacing exploration traps; adventure mode (2 extra lives); rune auto-ID of all items; ration auto-eat; regen `0.1 + HP/600`; allied kills give full XP.
5. kimjoy systems: maces/flails corpse knockback; friendly summons fight outside LOS; clouds persist outside LOS; Draconian overhaul (wear dragon-scale armour, forms inherit scale resists); poison ticks faster; M&F projectile stacks ×3; banishment full XP.
6. kimjoy monster equipping interference: Cubus disarm + interdimensional-grape equipment melding.

---

## 10. QoL / interface

- **bcrawl**: weapon displays adjusted base damage (str/skill factored); monster info shows max damage with your current weapon + spell damage numbers; autofight auto-swaps melee↔launcher by range; missiles refuse friendly-fire; macro menu; decimal AC/EV/SH; scroll of identify on pickup; failed pickup auto-inscribes.
- **kimjoy**: `auto_bag_items` rc option; artefact menu colouring tags; hydra head counter UI; quiet multi-attack messages; webtiles gauges (Automaton heat, second weapon for Two-Headed Ogre).
- **bloatcrawl2**: newgame menu overhaul (extended hotkeys, per-species job recommendations, difficulty columns); milestones + more() prompts for species evolutions; game-modifier selection screen incl. webtiles.

---

## 11. Porting shortlist (recommended order)

**Tier 1 — self-contained, high value, low risk:**
1. bcrawl **spell pack** (~12 spells, spl-data + spl-* only)
2. bcrawl **unrand pack** (art-data.txt entries are self-contained)
3. bloatcrawl2 **game-modifier framework** (bigger lift, but the most distinctive feature: undead-any-species, chaoskin, no-rune-locks)
4. bcrawl **item bits** (insulation ring, stasis scarf, seeking brand, mana-regen ego)
5. bloatcrawl2 **god-zealot background set** (20 backgrounds sharing one pattern)

**Tier 2 — meaty content:**
6. bcrawl **Spriggan Forest** branch + nicolae Slime vaults (resolve BRANCH_FOREST enum collision)
7. kimjoy **Automaton** (heat gauge) or **Hydra** species — flagship designs, need webtiles glue
8. kimjoy **new gods** — Imus Thea / Great Wyrm / Agraphede / Legion (one at a time; each is god-abil+god-passive+descript)
9. bloatcrawl2 serious species: Hermit Crab, Mirror Eidolon, Sloth of Wrath, Irit, Ember Elf (+ species-yaml key plumbing)
10. kimjoy **cross-god 6★ weapon blessings** (new brands) and **Pakellas rework**

**Tier 3 — mechanics to cherry-pick deliberately:**
11. bcrawl QoL: adjusted weapon damage display, autofight launcher swap, decimal AC/EV/SH
12. bloatcrawl2 Archaeologist (crate/tome unrand quest) — reconcile with bcrawl's version
13. kimjoy draconian armour overhaul, corpse knockback, summons-outside-LOS
14. bcrawl god mutual-respect conversion table

**Watch-outs:**
- Oni ×3 designs collide; pick one design or rename (ours stays "Oni", others need new names).
- kimjoy fork uses the pre-0.26 job/item enum systems and old mon-data — ports from it need rebasing onto our modern yaml/enums, not cherry-picks.
- bloatcrawl2's yaml species format matches our species-gen.py — easiest species source.
- Anything already trunk-adopted (rockslime, wendigo, goliath frog, kobold brigand, tile_show_threat_levels) was excluded.
