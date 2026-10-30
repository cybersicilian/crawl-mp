define(["./tileinfo-gui", "item-properties", "./shell-dash-art"], function (gui, properties, shellDash) {
    "use strict";
    // Exact native names -> atlas symbols, from spl-data.h and tileidx_ability
    // in tilepick.cc. The source-parity test covers additions and renamed art.
    // Dynamic ability variants require the authoritative snapshot tile field.
    var spells = {
        "Engraved Laser": "BOLT_OF_LIGHT",
        "Shackle": "SHACKLE", "False Image": "FALSE_IMAGE",
        "Mana Rupture": "GRAVITAS", "Icicle Burst": "ICICLE_BURST",
        "Steam Barrier": "STEAM_BARRIER", "Blight": "BLIGHT",
        "Scorpion Form": "SCORPION_FORM", "Eringya's Rootspike": "ERINGYAS_ROOTSPIKE",
        "Olgreb's Last Mercy": "OLGREBS_LAST_MERCY", "Elemental Weapon": "ELEMENTAL_WEAPON",
        "Kindled Veins": "FLAMING_CLOUD", "Winter's Due": "FREEZE",
        "Borrowed Thunder": "SHOCK", "Scarlet Fetters": "SIGIL_OF_BINDING",
        "Stolen Sight": "ENFEEBLE",
        "Cause Fear": "CAUSE_FEAR", "Magic Dart": "MAGIC_DART",
        "Fireball": "FIREBALL", "Apportation": "APPORTATION",
        "Volatile Blastmotes": "BLASTMOTE", "Dig": "DIG",
        "Bolt of Fire": "BOLT_OF_FIRE", "Bolt of Cold": "BOLT_OF_COLD",
        "Lightning Bolt": "LIGHTNING_BOLT", "Arcjolt": "ARCJOLT",
        "Plasma Beam": "PLASMA_BEAM", "Permafrost Eruption": "PERMAFROST_ERUPTION",
        "Blinkbolt": "BLINKBOLT", "Vhi's Electric Charge": "ELECTRIC_CHARGE",
        "Vhi's Electrolunge": "ELECTRIC_CHARGE", "Bolt of Magma": "BOLT_OF_MAGMA",
        "Polymorph": "POLYMORPH", "Slow": "SLOW",
        "Haste": "HASTE", "Petrify": "PETRIFY",
        "Confuse": "CONFUSE", "Invisibility": "INVISIBILITY",
        "Throw Flame": "THROW_FLAME", "Throw Frost": "THROW_FROST",
        "Disjunction": "DISJUNCTION", "Freezing Cloud": "FREEZING_CLOUD",
        "Freezing Gust": "FREEZING_CLOUD", "Mephitic Cloud": "MEPHITIC_CLOUD",
        "Venom Bolt": "VENOM_BOLT", "Olgreb's Toxic Radiance": "OLGREBS_TOXIC_RADIANCE",
        "Teleport Other": "TELEPORT_OTHER", "Death's Door": "DEATHS_DOOR",
        "Mass Confusion": "MASS_CONFUSION", "Smiting": "SMITING",
        "Summon Small Mammal": "SUMMON_SMALL_MAMMAL", "Abjuration": "MASS_ABJURATION",
        "Bolt of Draining": "BOLT_OF_DRAINING", "Lehudib's Crystal Spear": "LEHUDIBS_CRYSTAL_SPEAR",
        "Polar Vortex": "POLAR_VORTEX", "Poisonous Cloud": "POISONOUS_CLOUD",
        "Fire Storm": "FIRE_STORM", "Call Down Damnation": "CALL_DOWN_DAMNATION",
        "Call Down Lightning": "CALL_DOWN_LIGHTNING", "Blink": "BLINK",
        "Blink Range": "BLINK", "Blink Away": "BLINK",
        "Blink Close": "BLINK", "Iskenderun's Mystic Blast": "ISKENDERUNS_MYSTIC_BLAST",
        "Summon Horrible Things": "SUMMON_HORRIBLE_THINGS", "Malign Gateway": "MALIGN_GATEWAY",
        "Charm": "CHARMING", "Animate Dead": "ANIMATE_DEAD",
        "Pain": "PAIN", "Soul Splinter": "NECROTISE",
        "Vampiric Draining": "VAMPIRIC_DRAINING", "Haunt": "HAUNT",
        "Martyr's Knell": "MARTYRS_KNELL", "Borgnjor's Revivification": "BORGNJORS_REVIVIFICATION",
        "Freeze": "FREEZE", "Ozocubu's Refrigeration": "OZOCUBUS_REFRIGERATION",
        "Sticky Flame": "STICKY_FLAME", "Summon Ice Beast": "SUMMON_ICE_BEAST",
        "Ozocubu's Armour": "OZOCUBUS_ARMOUR", "Call Imp": "CALL_IMP",
        "Deflect Missiles": "DEFLECT_MISSILES", "Berserker Rage": "BERSERKER_RAGE",
        "Dispel Undead": "DISPEL_UNDEAD", "Poison Arrow": "POISON_ARROW",
        "Banishment": "BANISHMENT", "Sting": "STING",
        "Sublimation of Blood": "SUBLIMATION_OF_BLOOD", "Tukima's Dance": "TUKIMAS_DANCE",
        "Summon Demon": "SUMMON_DEMON", "Summon Greater Demon": "SUMMON_GREATER_DEMON",
        "Cigotuvi's Putrefaction": "CORPSE_ROT", "Iron Shot": "IRON_SHOT",
        "Bombard": "IRON_SHOT", "Stone Arrow": "STONE_ARROW",
        "Shock": "SHOCK", "Swiftness": "SWIFTNESS",
        "Debugging Ray": "DEBUGGING_RAY", "Agonising Touch": "AGONY",
        "Curse of Agony": "AGONY", "Mindburst": "MINDBURST",
        "Death Channel": "DEATH_CHANNEL", "Symbol of Torment": "SYMBOL_OF_TORMENT",
        "Siphon Essence": "SIPHON_ESSENCE", "Throw Icicle": "THROW_ICICLE",
        "Airstrike": "AIRSTRIKE", "Momentum Strike": "MOMENTUM_STRIKE",
        "Shadow Creatures": "SUMMON_SHADOW_CREATURES", "Confusing Touch": "CONFUSING_TOUCH",
        "Passwall": "PASSWALL", "Ignite Poison": "IGNITE_POISON",
        "Call Canine Familiar": "CALL_CANINE_FAMILIAR", "Summon Dragon": "SUMMON_DRAGON",
        "Ensorcelled Hibernation": "ENSORCELLED_HIBERNATION", "Metabolic Englaciation": "METABOLIC_ENGLACIATION",
        "Silence": "SILENCE", "Shatter": "SHATTER",
        "Dispersal": "DISPERSAL", "Static Discharge": "STATIC_DISCHARGE",
        "Corona": "CORONA", "Alistair's Intoxication": "ALISTAIRS_INTOXICATION",
        "Lee's Rapid Deconstruction": "LEES_RAPID_DECONSTRUCTION", "Sandblast": "SANDBLAST",
        "Sculpt Simulacrum": "SIMULACRUM", "Conjure Ball Lightning": "CONJURE_BALL_LIGHTNING",
        "Chain Lightning": "CHAIN_LIGHTNING", "Portal Projectile": "PORTAL_PROJECTILE",
        "Monstrous Menagerie": "MONSTROUS_MENAGERIE", "Passage of Golubria": "PASSAGE_OF_GOLUBRIA",
        "Fulminant Prism": "FULMINANT_PRISM", "Paralyse": "PARALYSE",
        "Minor Healing": "MINOR_HEALING", "Major Healing": "MAJOR_HEALING",
        "Woodweal": "WOODWEAL", "Hurl Damnation": "HURL_DAMNATION",
        "Brain Bite": "BRAIN_BITE", "Noxious Cloud": "NOXIOUS_CLOUD",
        "Steam Ball": "STEAM_BALL", "Ufetubi Swarm": "UFETUBI_SWARM",
        "Summon Sin Beast": "SUMMON_SIN_BEAST", "Bolt of Devastation": "ENERGY_BOLT",
        "Spit Poison": "SPIT_POISON", "Summon Undead": "SUMMON_UNDEAD",
        "Cantrip": "CANTRIP", "Quicksilver Bolt": "QUICKSILVER_BOLT",
        "Metal Splinters": "METAL_SPLINTERS", "Splinterspray": "METAL_SPLINTERS",
        "Miasma Breath": "MIASMA_BREATH", "Summon Drakes": "SUMMON_DRAKES",
        "Blink Other": "BLINK_OTHER", "Blink Other Close": "BLINK_OTHER",
        "Summon Mushrooms": "SUMMON_MUSHROOMS", "Spit Acid": "SPIT_ACID",
        "Caustic Breath": "SPIT_ACID", "Pyre Arrow": "STICKY_FLAME_RANGE",
        "Fire Breath": "FIRE_BREATH", "Searing Breath": "FIRE_BREATH",
        "Chaos Breath": "CHAOS_BREATH", "Cold Breath": "COLD_BREATH",
        "Glacial Breath": "COLD_BREATH", "Summon Water Elementals": "WATER_ELEMENTALS",
        "Porkalator": "PORKALATOR", "Spawn Tentacles": "CREATE_TENTACLES",
        "Summon Eyeballs": "SUMMON_EYEBALLS", "Haste Other": "HASTE_OTHER",
        "Touch of Paradox": "TOUCH_OF_PARADOX", "Summon Earth Elementals": "EARTH_ELEMENTALS",
        "Summon Air Elementals": "AIR_ELEMENTALS", "Summon Fire Elementals": "FIRE_ELEMENTALS",
        "Sleep": "SLEEP", "Mara Summon": "FAKE_MARA_SUMMON",
        "Summon Illusion": "SUMMON_ILLUSION", "Primal Wave": "PRIMAL_WAVE",
        "Call Tide": "CALL_TIDE", "Orb of Destruction": "IOOD",
        "Ink Cloud": "INK_CLOUD", "Might": "MIGHT",
        "Might Other": "MIGHT", "Awaken Forest": "AWAKEN_FOREST",
        "Druid's Call": "DRUIDS_CALL", "Brothers in Arms": "BROTHERS_IN_ARMS",
        "Trog's Hand": "TROGS_HAND", "Summon Mortal Champion": "SUMMON_MORTAL_CHAMPION",
        "Vanquished Vanguard": "SUMMON_SPECTRAL_ORCS", "Summon Holies": "SUMMON_HOLIES",
        "Heal Other": "HEAL_OTHER", "Holy Flames": "HOLY_FLAMES",
        "Holy Breath": "HOLY_BREATH", "Injury Mirror": "INJURY_MIRROR",
        "Drain Life": "DRAIN_LIFE", "Leda's Liquefaction": "LEDAS_LIQUEFACTION",
        "Summon Hydra": "SUMMON_HYDRA", "Mesmerise": "MESMERISE",
        "Hellfire Court": "HELLFIRE_COURT", "Petrifying Cloud": "PETRIFYING_CLOUD",
        "Inner Flame": "INNER_FLAME", "Ensnare": "ENSNARE",
        "Greater Ensnare": "ENSNARE", "Thunderbolt": "THUNDERBOLT",
        "Iskenderun's Battlesphere": "BATTLESPHERE", "Summon Minor Demon": "SUMMON_MINOR_DEMON",
        "Sticks to Snakes": "STICKS_TO_SNAKES", "Malmutate": "MALMUTATE",
        "Gloom": "GLOOM", "Beckoning Gale": "BECKONING_GALE",
        "Force Lance": "FORCE_LANCE", "Sentinel's Mark": "SENTINEL_MARK",
        "Word of Recall": "RECALL", "Injury Bond": "INJURY_BOND",
        "Spectral Cloud": "SPECTRAL_CLOUD", "Ghostly Fireball": "GHOSTLY_FIREBALL",
        "Call Lost Souls": "CALL_LOST_SOULS", "Dimension Anchor": "DIMENSIONAL_ANCHOR",
        "Blink Allies Encircling": "BLINK_ALLIES_ENCIRCLING", "Awaken Vines": "AWAKEN_VINES",
        "Volley of Thorns": "THORN_VOLLEY", "Cage of Brambles": "WALL_OF_BRAMBLES",
        "Waterstrike": "WATERSTRIKE", "Wind Blast": "WIND_BLAST",
        "Strip Willpower": "STRIP_WILLPOWER", "Fugue of the Fallen": "FUGUE_OF_THE_FALLEN",
        "Summon Vermin": "SUMMON_VERMIN", "Malign Offering": "MALIGN_OFFERING",
        "Searing Ray": "SEARING_RAY", "Discord": "DISCORD",
        "Invisibility Other": "INVISIBILITY", "Virulence": "VIRULENCE",
        "Orb of Electricity": "ORB_OF_ELECTRICITY", "Flash Freeze": "FLASH_FREEZE",
        "Creeping Frost": "CREEPING_FROST", "Legendary Destruction": "LEGENDARY_DESTRUCTION",
        "Forceful Invitation": "FORCEFUL_INVITATION", "Plane Rend": "PLANE_REND",
        "Chain of Chaos": "CHAIN_OF_CHAOS", "Call of Chaos": "CALL_OF_CHAOS",
        "Sign of Ruin": "ABILITY_KIKU_SIGN_OF_RUIN", "Sap Magic": "SAP_MAGIC",
        "Major Destruction": "MAJOR_DESTRUCTION", "Blink Allies Away": "BLINK_ALLIES_AWAY",
        "Summon Forest": "SUMMON_FOREST", "Forge Lightning Spire": "FORGE_LIGHTNING_SPIRE",
        "Forge Blazeheart Golem": "FORGE_BLAZEHEART_GOLEM", "Rebounding Blaze": "REBOUNDING_BLAZE",
        "Rebounding Chill": "REBOUNDING_CHILL", "Glaciate": "ICE_STORM",
        "Dragon's Call": "SUMMON_DRAGON", "Spellspark Servitor": "SPELLSPARK_SERVITOR",
        "Summon Mana Viper": "SUMMON_MANA_VIPER", "Phantom Mirror": "PHANTOM_MIRROR",
        "Diminish Spells": "DIMINISH_SPELLS", "Corrosive Bolt": "CORROSIVE_BOLT",
        "Bolt of Light": "BOLT_OF_LIGHT", "Bolt of Antimagic": "BOLT_OF_ANTIMAGIC",
        "Bolt of Flesh": "BOLT_OF_FLESH", "Awaken Flesh": "AWAKEN_FLESH",
        "gehenna serpent of hell breath": "FIRE_BREATH", "cocytus serpent of hell breath": "COLD_BREATH",
        "dis serpent of hell breath": "LEHUDIBS_CRYSTAL_SPEAR", "tartarus serpent of hell breath": "MIASMA_BREATH",
        "Summon Emperor Scorpions": "SUMMON_EMPEROR_SCORPIONS", "Irradiate": "IRRADIATE",
        "Spit Lava": "SPIT_LAVA", "Electrical Bolt": "LIGHTNING_BOLT",
        "Flaming Cloud": "FLAMING_CLOUD", "Throw Barbs": "THROW_BARBS",
        "Battlecry": "BATTLECRY", "Warning Cry": "WARNING_CRY",
        "Hunting Call": "HUNTING_CALL", "Funeral Dirge": "FUNERAL_DIRGE",
        "Seal Doors": "SEAL_DOORS", "Flay": "FLAY",
        "Berserk Other": "BERSERK_OTHER", "Corrupting Pulse": "CORRUPTING_PULSE",
        "Siren Song": "SIREN_SONG", "Avatar Song": "AVATAR_SONG",
        "Murky Legion": "MURKY_LEGION", "Paralysis Gaze": "PARALYSIS_GAZE",
        "Confusion Gaze": "CONFUSION_GAZE", "Antimagic Gaze": "ANTIMAGIC_GAZE",
        "Draining Gaze": "DRAINING_GAZE", "Weakening Gaze": "WEAKENING_GAZE",
        "Mourning Wail": "MOURNING_WAIL", "Death Rattle": "DEATH_RATTLE",
        "March of Sorrows": "MARCH_OF_SORROWS", "Summon Scarabs": "SUMMON_SCARABS",
        "Throw Ally": "THROW_ALLY", "Cleansing Flame": "CLEANSING_FLAME",
        "Gell's Gravitas": "GRAVITAS", "Yara's Violent Unravelling": "VIOLENT_UNRAVELLING",
        "Entropic Weave": "ENTROPIC_WEAVE", "Summon Executioners": "SUMMON_EXECUTIONERS",
        "Oblivion Howl": "OBLIVION_HOWL", "Prayer of Brilliance": "PRAYER_OF_BRILLIANCE",
        "Iceblast": "ICEBLAST", "Slug Dart": "SLUG_DART",
        "Fleetfoot": "SWIFTNESS", "Infernal Servant": "ABILITY_MAKHLEB_GREATER_SERVANT",
        "Bind Souls": "DEATH_CHANNEL", "Infestation": "INFESTATION",
        "Still Winds": "STILL_WINDS", "Resonance Strike": "RESONANCE_STRIKE",
        "Ghostly Sacrifice": "GHOSTLY_FIREBALL", "Dream Dust": "DREAM_DUST",
        "Lesser Beckoning": "BECKONING", "Upheaval": "ABILITY_QAZLAL_UPHEAVAL",
        "Mercury Arrow": "STING", "Poisonous Vapours": "POISONOUS_CLOUD",
        "Ignition": "IGNITION", "Borgnjor's Vile Clutch": "BORGNJORS_VILE_CLUTCH",
        "Fastroot": "GRASPING_ROOTS", "Warp Space": "WARP_SPACE",
        "Sojourning Bolt": "SOJOURNING_BOLT", "Harpoon Shot": "HARPOON_SHOT",
        "Grasping Roots": "GRASPING_ROOTS", "Throw Bolas": "THROW_BOLAS",
        "Throw Klown Pie": "THROW_KLOWN_PIE", "Sporulate": "SPORULATE",
        "Launch Sporangium": "LAUNCH_SPORANGIUM", "Starburst": "STARBURST",
        "Foxfire": "FOXFIRE", "Marshlight": "FOXFIRE",
        "Hailstorm": "HAILSTORM", "Eringya's Noxious Bog": "NOXIOUS_BOG",
        "Agony": "AGONY", "Dispel Undead Range": "DISPEL_UNDEAD",
        "Frozen Ramparts": "FROZEN_RAMPARTS", "Maxwell's Capacitive Coupling": "MAXWELLS_COUPLING",
        "Roll": "ROLL", "Hurl Sludge": "HURL_SLUDGE",
        "Summon Tzitzimitl": "SUMMON_TZITZIMITL", "Summon Hell Sentinel": "SUMMON_HELL_SENTINEL",
        "Awaken Armour": "AWAKEN_ARMOUR", "Manifold Assault": "MANIFOLD_ASSAULT",
        "Concentrate Venom": "CONCENTRATE_VENOM", "Eruption": "ERUPTION",
        "Pyroclastic Surge": "PYROCLASTIC_SURGE", "Stunning Burst": "STUNNING_BURST",
        "Corrupt": "CORRUPT", "Conjure Living Spells": "CONJURE_LIVING_SPELLS",
        "Summon Cactus Giant": "SUMMON_CACTUS_GIANT", "Stoke Flames": "STOKE_FLAMES",
        "Seracfall": "ICEBLAST", "Scorch": "SCORCH",
        "Flame Wave": "FLAME_WAVE", "Enfeeble": "ENFEEBLE",
        "Summon Spiders": "SUMMON_SPIDERS", "Anguish": "ANGUISH",
        "Summon Scorpions": "SUMMON_SCORPIONS", "Sheza's Dance": "SHEZAS_DANCE",
        "Divine Armament": "DIVINE_ARMAMENT", "Kiss of Death": "KISS_OF_DEATH",
        "Jinxbite": "JINXBITE", "Sigil of Binding": "SIGIL_OF_BINDING",
        "Dimensional Bullseye": "PORTAL_PROJECTILE", "Brom's Barrelling Boulder": "BOULDER",
        "Vitrify": "VITRIFY", "Vitrifying Gaze": "VITRIFYING_GAZE",
        "Crystallising Shot": "CRYSTALLISING_SHOT", "Tremorstone": "LEES_RAPID_DECONSTRUCTION",
        "Regenerate Other": "REGENERATION", "Mass Regeneration": "MASS_REGENERATION",
        "Noxious Breath": "NOXIOUS_CLOUD", "Hurl Torchlight": "ABILITY_YRED_HURL_TORCHLIGHT",
        "Combustion Breath": "FIRE_BREATH", "Nullifying Breath": "QUICKSILVER_BOLT",
        "Steam Breath": "STEAM_BALL", "Mud Breath": "LEDAS_LIQUEFACTION",
        "Galvanic Breath": "ARCJOLT", "Maxwell's Portable Piledriver": "PILEDRIVER",
        "Gell's Gavotte": "GAVOTTE", "Magnavolt": "MAGNAVOLT",
        "Fulsome Fusillade": "FULSOME_FUSILLADE", "Rimeblight": "RIMEBLIGHT",
        "Hoarfrost Cannonade": "HOARFROST_CANNONADE", "Seismic Stomp": "SEISMIC_STOMP",
        "Hoarfrost Bullet": "HOARFROST_BULLET", "Flashing Balestra": "TUKIMAS_DANCE",
        "Phantom Blitz": "PHANTOM_BLITZ", "Bestow Arms": "BESTOW_ARMS",
        "Hellfire Mortar": "HELLFIRE_MORTAR", "Shadow Shard": "SHADOW_SHARD",
        "Shadow Beam": "SHADOW_BEAM", "Shadowball": "SHADOWBALL",
        "Creeping Shadow": "CREEPING_SHADOW", "Shadow Tempest": "SHADOW_TEMPEST",
        "Shadow Prism": "SHADOW_PRISM", "Shadow Puppet": "SHADOW_PUPPET",
        "Shadow Turret": "SHADOW_TURRET", "Shadow Shot": "SHADOW_SHARD",
        "Shadow Bind": "SHADOW_BIND", "Shadow Torpor": "SHADOW_TORPOR",
        "Shadow Draining": "SHADOW_DRAINING", "Grave Claw": "GRAVE_CLAW",
        "Launch Clockwork Bee": "CLOCKWORK_BEE", "Construct Spike Launcher": "SPIKE_LAUNCHER",
        "Kinetic Grapnel": "KINETIC_GRAPNEL", "Diamond Sawblades": "DIAMOND_SAWBLADES",
        "Shred": "DIAMOND_SAWBLADES", "Eringya's Surprising Crocodile": "SURPRISING_CROCODILE",
        "Platinum Paragon": "PLATINUM_PARAGON", "Alistair's Walking Alembic": "WALKING_ALEMBIC",
        "Forge Monarch Bomb": "MONARCH_BOMB", "Launch Bomblet": "LAUNCH_BOMBLET",
        "Splinterfrost Shell": "SPLINTERFROST_SHELL", "Nazja's Percussive Tempering": "PERCUSSIVE_TEMPERING",
        "Nazja's All-Purpose Tempering": "PERCUSSIVE_TEMPERING", "Fortress Blast": "FORTRESS_BLAST",
        "Summon Seismosaurus Egg": "SUMMON_SEISMOSAURUS_EGG", "Forge Phalanx Beetle": "PHALANX_BEETLE",
        "Rending Blade": "RENDING_BLADE", "Magma Barrage": "MAGMA_BARRAGE",
        "Vex": "VEX", "Ravenous Swarm": "RAVENOUS_SWARM",
        "Dominate Undead": "DOMINATE_UNDEAD", "Detonation Catalyst": "DETONATION_CATALYST",
        "Rust Breath": "MEPHITIC_CLOUD", "Golden Breath": "FIRE_BREATH",
        "Sphinx Sisters": "SPHINX_SISTERS", "Ill Omen": "ILL_OMEN",
        "Doom Bolt": "DOOM_BOLT", "Warp Body": "WARP_BODY",
        "Ostracise": "OSTRACISE", "Mutagenic Gaze": "MUTAGENIC_GAZE",
        "Acid Ball": "ACID_BALL", "Pyrrhic Recollection": "ABILITY_ENKINDLE",
        "Planar Overlay": "PLANAR_OVERLAY", "Doomsaying": "ILL_OMEN",
        "Sleetstrike": "SLEETSTRIKE", "Landbreaker": "SEISMIC_STOMP",
        "Stampede": "STAMPEDE", "Bolster": "BOLSTER",
        "Phase Shift": "PHASE_SHIFT", "Dragon Veins": "DRAGON_VEINS",
        "Dragon Vein (Fire)": "DRAGON_VEINS", "Dragon Vein (Ice)": "DRAGON_VEINS",
        "Dragon Vein (Air)": "DRAGON_VEINS", "Dragon Vein (Earth)": "DRAGON_VEINS",
        "Ice Thorns": "ICE_THORNS", "Sirocco": "SIROCCO",
        "Fulsome Distillation": "FULSOME_DISTILLATION", "Evaporate": "EVAPORATE",
        "Linked Ward": "PASSAGE_OF_GOLUBRIA", "Song of Fellowship": "FUGUE_OF_THE_FALLEN",
        "Cleansing Mist": "REGENERATION", "Aura of Protection": "PASSAGE_OF_GOLUBRIA",
        "Aura of Zeal": "FUGUE_OF_THE_FALLEN", "Aura of Rime": "FROZEN_RAMPARTS",
        "Aura of Vitality": "REGENERATION", "Aura of Sanctuary": "PASSAGE_OF_GOLUBRIA",
        "Aura of Passage": "SWIFTNESS", "Aura of Resonance": "SPELLSPARK_SERVITOR",
        "Controlled Blink": "BLINK", "Regeneration": "REGENERATION",
        "Shroud of Golubria": "PASSAGE_OF_GOLUBRIA", "Song of Slaying": "FUGUE_OF_THE_FALLEN",
        "Scattershot": "METAL_SPLINTERS", "Cloud Cone": "CLOUD_CONE",
        "Conjure Flame": "FLAMING_CLOUD"
    };
    var abilities = {
        "Chain Lash": "ABILITY_CHAIN_LASH", "Reel In": "ABILITY_REEL_IN",
        "Pinning Chain": "ABILITY_PINNING_CHAIN", "Release Chain": "ABILITY_RELEASE_CHAIN",
        "Profane Altar": "ABILITY_PROFANE_ALTAR", "Invoke Elder Rites": "ABILITY_ELDER_RITE",
        "Delete Spell": "ABILITY_SIF_MUNA_AMNESIA", "Crab Walk": "ABILITY_HOP",
        "Molt": "SPLINTERFROST_SHELL", "Passwall": "ABILITY_ENT_PASSWALL",
        "Burialize Weapon": "ABILITY_BURIALIZE", "Release Buried Weapon": "ABILITY_RELEASE_CHAIN",
        "Charm Monsters": "CHARMING", "Invoke Smite": "SMITING", "Step Behind": "ABILITY_BLINK",
        "Activate Golem Armour": "ABILITY_GOLEM_FORM",
        "Deploy Shield": "ABILITY_TSO_DIVINE_SHIELD",
        "Weave Enchantments": "ABILITY_VELLUM_WEAVE",
        "Stolen Dazzle": "ABILITY_IMUS_PRISMATIC_PRISM",
        "Borrowed Resistance": "ABILITY_WYRM_CITRINITAS",
        "Call Redback": "ABILITY_AGRAPHEDE_SUMMON_SPIDER",
        "Prismatic Prism": "ABILITY_IMUS_PRISMATIC_PRISM",
        "Spectrum": "ABILITY_IMUS_SPECTRUM",
        "Fragmentation": "ABILITY_IMUS_FRAGMENTATION",
        "Infuse Essence": "ABILITY_WYRM_INFUSE", "Nigredo": "ABILITY_WYRM_NIGREDO",
        "Albedo": "ABILITY_WYRM_ALBEDO", "Citrinitas": "ABILITY_WYRM_CITRINITAS",
        "Viriditas": "ABILITY_WYRM_VIRIDITAS", "Rubedo": "ABILITY_WYRM_RUBEDO",
        "Fulsome Distillation": "ABILITY_WYRM_FULSOME_DISTILLATION",
        "Evaporate": "ABILITY_WYRM_EVAPORATE",
        "Create Web": "ABILITY_AGRAPHEDE_WEB",
        "Convert Curing Potion": "ABILITY_AGRAPHEDE_CONVERT_POISON",
        "Enchant Poison": "ABILITY_AGRAPHEDE_ENCHANT_POISON",
        "Ball of Web": "ABILITY_AGRAPHEDE_TRAP",
        "Hornet Sting": "ABILITY_AGRAPHEDE_HORNET_STING",
        "Summon Spider": "ABILITY_AGRAPHEDE_SUMMON_SPIDER",
        "Assimilate": "ABILITY_ASSIMILATE", "Retract into Shell": "SPLINTERFROST_SHELL",
        "Shell Dash": "ABILITY_SHELL_DASH",
        "Dismiss Rite": "ABILITY_END_TRANSFORMATION",
        "Amplify Scarlet Fetters": "SIGIL_OF_BINDING", "Amplify Stolen Sight": "ENFEEBLE",
        "Spit Poison": "ABILITY_SPIT_POISON", "Golden Breath": "ABILITY_GOLDEN_BREATH",
        "Combustion Breath": "ABILITY_BREATHE_FIRE", "Glacial Breath": "ABILITY_BREATHE_FROST",
        "Breathe Poison Gas": "ABILITY_BREATHE_POISON", "Noxious Breath": "ABILITY_BREATHE_MEPHITIC",
        "Galvanic Breath": "ABILITY_BREATHE_LIGHTNING", "Nullifying Breath": "ABILITY_BREATHE_ENERGY",
        "Steam Breath": "ABILITY_BREATHE_STEAM", "Caustic Breath": "ABILITY_BREATHE_ACID",
        "Mud Breath": "ABILITY_BREATHE_MUD", "Hurl Damnation": "ABILITY_HURL_DAMNATION",
        "Word of Chaos": "ABILITY_WORD_OF_CHAOS", "Dig": "ABILITY_DIG",
        "Shaft Self": "ABILITY_SHAFT_SELF", "Hop": "ABILITY_HOP",
        "Blinkbolt": "ABILITY_BLINKBOLT", "Siphon Essence": "ABILITY_SIPHON_ESSENCE",
        "Heal Wounds": "ABILITY_HEAL_WOUNDS", "Imbue Servitor": "ABILITY_IMBUE_SERVITOR",
        "Imprint Weapon": "ABILITY_IMPRINT_WEAPON", "End Transformation": "ABILITY_END_TRANSFORMATION",
        "Invent Gizmo": "ABILITY_INVENT_GIZMO", "Cacophony": "ABILITY_CACOPHONY",
        "Bat Swarm": "ABILITY_BAT_SWARM", "Enkindle": "ABILITY_ENKINDLE",
        "Jump": "ABILITY_JUMP", "Watery Grave": "ABILITY_WATERY_GRAVE",
        "Bestial Takedown": "ABILITY_BESTIAL_TAKEDOWN", "Breathe Rust": "ABILITY_BREATHE_RUST",
        "Evoke Blink": "ABILITY_BLINK", "Evoke Invisibility": "ABILITY_EVOKE_INVISIBILITY",
        "Evoke Damnation": "ABILITY_EVOKE_DISPATER", "Evoke the Staff of Olgreb": "ABILITY_EVOKE_OLGREB",
        "Recite": "ABILITY_ZIN_RECITE", "Vitalisation": "ABILITY_ZIN_VITALISATION",
        "Imprison": "ABILITY_ZIN_IMPRISON", "Sanctuary": "ABILITY_ZIN_SANCTUARY",
        "Donate Gold": "ABILITY_ZIN_DONATE_GOLD", "Divine Shield": "ABILITY_TSO_DIVINE_SHIELD",
        "Cleansing Flame": "ABILITY_TSO_CLEANSING_FLAME", "Summon Divine Warrior": "ABILITY_TSO_DIVINE_WARRIOR",
        "Brand Weapon With Silver": "ABILITY_ZIN_BLESS_WEAPON",
        "Brand Weapon With Pacifying": "ABILITY_ELYVILON_BLESS_WEAPON",
        "Brand Weapon With Slimifying": "ABILITY_JIYVA_BLESS_WEAPON",
        "Brand Weapon With Sluggish": "ABILITY_CHEIBRIADOS_BLESS_WEAPON",
        "Brand Weapon With Holy Wrath": "ABILITY_TSO_BLESS_WEAPON", "Unearth Wretches": "ABILITY_KIKU_UNEARTH_WRETCHES",
        "Sign of Ruin": "ABILITY_KIKU_SIGN_OF_RUIN", "Receive Forbidden Knowledge": "ABILITY_KIKU_NECRONOMICON",
        "Brand Weapon With Pain": "ABILITY_KIKU_BLESS_WEAPON", "Light the Black Torch": "ABILITY_YRED_LIGHT_THE_TORCH",
        "Recall Undead Harvest": "ABILITY_YRED_RECALL", "Hurl Torchlight": "ABILITY_YRED_HURL_TORCHLIGHT",
        "Bind Soul": "ABILITY_YRED_BIND_SOUL", "Fathomless Shackles": "ABILITY_YRED_FATHOMLESS_SHACKLES",
        "Heroism": "ABILITY_OKAWARU_HEROISM", "Finesse": "ABILITY_OKAWARU_FINESSE",
        "Duel": "ABILITY_OKAWARU_DUEL", "Receive Weapon": "ABILITY_OKAWARU_GIFT_WEAPON",
        "Give Mercenary Equipment": "ABILITY_OKAWARU_GIFT_WEAPON",
        "Receive Armour": "ABILITY_OKAWARU_GIFT_ARMOUR", "Globe of Annihilation": "ABILITY_MAKHLEB_GLOBE_OF_ANNIHILATION",
        "Infernal Servant": "ABILITY_MAKHLEB_LESSER_SERVANT", "Infernal Legion": "ABILITY_MAKHLEB_LESSER_SERVANT",
        "Vessel of Slaughter": "ABILITY_MAKHLEB_VESSEL_OF_SLAUGHTER", "Channel Magic": "ABILITY_SIF_MUNA_CHANNEL",
        "Forget Spell": "ABILITY_SIF_MUNA_AMNESIA", "Divine Exegesis": "ABILITY_SIF_MUNA_EXEGESIS",
        "Berserk": "ABILITY_TROG_BERSERK", "Trog's Hand": "ABILITY_TROG_HAND",
        "Brothers in Arms": "ABILITY_TROG_BROTHERS_IN_ARMS", "Purification": "ABILITY_ELYVILON_PURIFICATION",
        "Pacify": "ABILITY_ELYVILON_PACIFY", "Heal Self": "ABILITY_ELYVILON_HEAL_SELF",
        "Divine Alms": "ABILITY_ELYVILON_DIVINE_ALMS", "Aura of Vigour": "ABILITY_ELYVILON_AURA_OF_VIGOUR",
        "Depart the Abyss": "ABILITY_LUGONU_EXIT_ABYSS", "Banish": "ABILITY_LUGONU_BANISH",
        "Corrupt": "ABILITY_LUGONU_CORRUPT", "Enter the Abyss": "ABILITY_LUGONU_ENTER_ABYSS",
        "Brand Weapon With Distortion": "ABILITY_LUGONU_BLESS_WEAPON", "Draw Destruction": "ABILITY_NEMELEX_DRAW_DESTRUCTION",
        "Draw Escape": "ABILITY_NEMELEX_DRAW_ESCAPE", "Draw Summoning": "ABILITY_NEMELEX_DRAW_SUMMONING",
        "Draw Stack": "ABILITY_NEMELEX_DRAW_STACK", "Triple Draw": "ABILITY_NEMELEX_TRIPLE_DRAW",
        "Deal Four": "ABILITY_NEMELEX_DEAL_FOUR", "Stack Five": "ABILITY_NEMELEX_STACK_FIVE",
        "Smiting": "ABILITY_BEOGH_SMITE", "Recall Apostles": "ABILITY_BEOGH_RECALL",
        "Recruit Apostle": "ABILITY_BEOGH_RECRUIT_APOSTLE", "Blood for Blood": "ABILITY_BEOGH_BLOOD_FOR_BLOOD",
        "Oozemancy": "ABILITY_JIYVA_OOZEMANCY", "Slimify": "ABILITY_JIYVA_SLIMIFY",
        "Wall of Briars": "ABILITY_FEDHAS_WALL_OF_BRIARS", "Grow Ballistomycete": "ABILITY_FEDHAS_GROW_BALLISTOMYCETE",
        "Overgrow": "ABILITY_FEDHAS_OVERGROW", "Grow Oklob": "ABILITY_FEDHAS_GROW_OKLOB",
        "Bend Time": "ABILITY_CHEIBRIADOS_BEND_TIME", "Temporal Distortion": "ABILITY_CHEIBRIADOS_TEMPORAL_DISTORTION",
        "Slouch": "ABILITY_CHEIBRIADOS_SLOUCH", "Step From Time": "ABILITY_CHEIBRIADOS_TIME_STEP",
        "Ritual of Binding": "ABILITY_ASHENZARI_CURSE", "Shatter the Chains": "ABILITY_ASHENZARI_UNCURSE",
        "Shadow Step": "ABILITY_DITHMENOS_SHADOWSLIP", "Shadow Form": "ABILITY_DITHMENOS_NIGHTFALL",
        "Shadowslip": "ABILITY_DITHMENOS_SHADOWSLIP", "Aphotic Marionette": "ABILITY_DITHMENOS_PANTOMIME",
        "Primordial Nightfall": "ABILITY_DITHMENOS_NIGHTFALL", "Draw Out Power": "ABILITY_RU_DRAW_OUT_POWER",
        "Power Leap": "ABILITY_RU_POWER_LEAP", "Apocalypse": "ABILITY_RU_APOCALYPSE",
        "Sacrifice Purity": "ABILITY_RU_SACRIFICE_PURITY", "Sacrifice Words": "ABILITY_RU_SACRIFICE_WORDS",
        "Sacrifice Drink": "ABILITY_RU_SACRIFICE_DRINK", "Sacrifice Essence": "ABILITY_RU_SACRIFICE_ESSENCE",
        "Sacrifice Health": "ABILITY_RU_SACRIFICE_HEALTH", "Sacrifice Stealth": "ABILITY_RU_SACRIFICE_STEALTH",
        "Sacrifice Artifice": "ABILITY_RU_SACRIFICE_ARTIFICE", "Sacrifice Love": "ABILITY_RU_SACRIFICE_LOVE",
        "Sacrifice Courage": "ABILITY_RU_SACRIFICE_COURAGE", "Sacrifice Arcana": "ABILITY_RU_SACRIFICE_ARCANA",
        "Sacrifice Nimbleness": "ABILITY_RU_SACRIFICE_NIMBLENESS", "Sacrifice Durability": "ABILITY_RU_SACRIFICE_DURABILITY",
        "Sacrifice a Hand": "ABILITY_RU_SACRIFICE_HAND", "Sacrifice Experience": "ABILITY_RU_SACRIFICE_EXPERIENCE",
        "Sacrifice Skill": "ABILITY_RU_SACRIFICE_SKILL", "Sacrifice an Eye": "ABILITY_RU_SACRIFICE_EYE",
        "Sacrifice Resistance": "ABILITY_RU_SACRIFICE_RESISTANCE", "Sacrifice Forms": "ABILITY_RU_SACRIFICE_FORMS",
        "Reject Sacrifices": "ABILITY_RU_REJECT_SACRIFICES", "Potion Petition": "ABILITY_GOZAG_POTION_PETITION",
        "Call Merchant": "ABILITY_GOZAG_CALL_MERCHANT", "Bribe Branch": "ABILITY_GOZAG_BRIBE_BRANCH",
        "Upheaval": "ABILITY_QAZLAL_UPHEAVAL", "Elemental Force": "ABILITY_QAZLAL_ELEMENTAL_FORCE",
        "Disaster Area": "ABILITY_QAZLAL_DISASTER_AREA", "Stomp": "ABILITY_USKAYAW_STOMP",
        "Line Pass": "ABILITY_USKAYAW_LINE_PASS", "Grand Finale": "ABILITY_USKAYAW_GRAND_FINALE",
        "Recall Ancestor": "ABILITY_HEP_RECALL", "Transference": "ABILITY_HEP_TRANSFERENCE",
        "Idealise": "ABILITY_HEP_IDEALISE", "Ancestor Life: Knight": "ABILITY_HEP_KNIGHT",
        "Ancestor Life: Elementalist": "ABILITY_HEP_ELEMENTALIST", "Ancestor Life: Hexer": "ABILITY_HEP_HEXER",
        "Ancestor Identity": "ABILITY_HEP_IDENTITY", "Serpent's Lash": "ABILITY_WU_JIAN_SERPENTS_LASH",
        "Heavenly Storm": "ABILITY_WU_JIAN_HEAVENLY_STORM", "Wall Jump": "ABILITY_WU_JIAN_WALL_JUMP",
        "Designate Prototype": "ABILITY_SIF_MUNA_CHANNEL", "Evoke Prototype": "ABILITY_SIF_MUNA_CHANNEL",
        "Receive Field Kit": "ABILITY_SIF_MUNA_CHANNEL", "Overclock": "ABILITY_OKAWARU_FINESSE",
        "Breakthrough": "ABILITY_QAZLAL_ELEMENTAL_FORCE",
        "Rupture": "ABILITY_VORR_RUPTURE", "Red Passage": "ABILITY_VORR_RED_PASSAGE",
        "The Great Letting": "ABILITY_VORR_GREAT_LETTING",
        "Fiery Armour": "ABILITY_IGNIS_FIERY_ARMOUR", "Foxfire Swarm": "ABILITY_IGNIS_FOXFIRE",
        "Rising Flame": "ABILITY_IGNIS_RISING_FLAME", "Quick Charge": "ABILITY_SIF_MUNA_CHANNEL",
        "Device Surge": "ABILITY_OKAWARU_FINESSE", "Capacitor Overcharge": "ABILITY_QAZLAL_ELEMENTAL_FORCE",
        "Prayer of Fellowship": "ABILITY_ELYVILON_HEAL_SELF", "Lay on Hands & Intervene": "ABILITY_ELYVILON_AURA_OF_VIGOUR",
        "Aura of Crusader's Zeal": "ABILITY_TSO_CLEANSING_FLAME", "Aura of Vitality & Warding": "ABILITY_TSO_DIVINE_SHIELD",
        "Renounce Religion": "ABILITY_RENOUNCE_RELIGION", "Convert to Beogh": "ABILITY_CONVERT_TO_BEOGH",
        "Build terrain": "ABILITY_WIZ_BUILD_TERRAIN", "Set terrain to build": "ABILITY_WIZ_SET_TERRAIN",
        "Clear terrain to floor": "ABILITY_WIZ_CLEAR_TERRAIN"
    };

    var allowed = { spell: new Set(), ability: new Set() };
    [ ["spell", spells], ["ability", abilities] ].forEach(function (group) {
        Object.keys(group[1]).forEach(function (name) {
            var index = gui[group[1][name]];
            if (Number.isInteger(index)) allowed[group[0]].add(index);
        });
    });
    // Dynamic variants (Makhleb marks, fallen apostles, repeated Exegesis).
    Object.keys(gui).forEach(function (symbol) {
        if (symbol.indexOf("ABILITY_") === 0 && Number.isInteger(gui[symbol]))
            allowed.ability.add(gui[symbol]);
    });
    allowed.spell.forEach(function (index) { allowed.ability.add(index); });

    function resolve(power, kind) {
        if (!power || (kind !== "spell" && kind !== "ability")) return null;
        var name = typeof power.name === "string" ? power.name.replace(/[‘’]/g, "'") : "";
        // Compatibility with servers predating the dedicated native shell tile.
        if (kind === "ability" && name === "Shell Dash" && power.tile === gui.ABILITY_JUMP)
            return gui.ABILITY_SHELL_DASH;
        if (Number.isInteger(power.tile) && allowed[kind].has(power.tile)
            && gui.get_tile_info(power.tile)) return power.tile;
        var catalog = kind === "spell" ? spells : abilities;
        if (!Object.prototype.hasOwnProperty.call(catalog, name)) return null;
        var index = gui[catalog[name]];
        return Number.isInteger(index) && gui.get_tile_info(index) ? index : null;
    }
    function atlas() { return document.getElementById("gui"); }
    function ready() {
        var image = atlas();
        return Boolean(image && image.complete && image.naturalWidth);
    }
    var fallbackImages = Object.create(null);
    function placeholder(canvas, label) {
        var sprite = properties.iconSprite("question");
        canvas.width = sprite.width; canvas.height = sprite.height;
        canvas.classList.add("power-art-fallback");
        canvas.setAttribute("data-power-art", "unavailable");
        canvas.setAttribute("data-ui-icon", "question");
        canvas.setAttribute("aria-label", label);
        var image = fallbackImages[sprite.url];
        if (!image) {
            image = document.createElement("img");
            fallbackImages[sprite.url] = image; image.src = sprite.url;
        }
        function drawFallback() {
            // Native art may finish before this separate UI atlas loads.
            if (canvas.getAttribute("data-power-art") !== "unavailable" || !image.naturalWidth) return;
            var context = canvas.getContext("2d");
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = false;
            context.drawImage(image, sprite.x, sprite.y, sprite.width, sprite.height,
                0, 0, sprite.width, sprite.height);
        }
        if (image.complete) drawFallback();
        else image.addEventListener("load", drawFallback, { once: true });
    }
    function create(power, kind) {
        if (kind === "ability" && power && power.name === "Shell Dash" && !Number.isInteger(gui.ABILITY_SHELL_DASH)) return shellDash.create();
        var canvas = document.createElement("canvas"), index = resolve(power, kind);
        canvas.width = canvas.height = 32;
        canvas.className = "power-art";
        canvas.setAttribute("role", "img");
        var name = power && typeof power.name === "string" ? power.name : "Unknown power";
        function draw() {
            var image = atlas(), info = index === null ? null : gui.get_tile_info(index);
            if (!info || !ready()) {
                placeholder(canvas, name + (info && image && !image.complete
                    ? " artwork loading" : " artwork unavailable"));
                return;
            }
            canvas.width = canvas.height = 32;
            var context = canvas.getContext("2d");
            if (!context) return;
            context.clearRect(0, 0, 32, 32); context.imageSmoothingEnabled = false;
            context.drawImage(image, info.sx, info.sy, info.ex - info.sx, info.ey - info.sy,
                info.ox + 16 - info.w / 2, info.oy + 32 - info.h,
                info.ex - info.sx, info.ey - info.sy);
            canvas.classList.remove("power-art-fallback");
            canvas.removeAttribute("data-ui-icon");
            canvas.setAttribute("data-power-art", "native");
            canvas.setAttribute("data-native-tile", String(index));
            canvas.setAttribute("aria-label", name);
        }
        draw();
        var image = atlas();
        if (index !== null && image && !ready()) {
            image.addEventListener("load", draw, { once: true });
            image.addEventListener("error", draw, { once: true });
        }
        return canvas;
    }
    return { create: create, resolve: resolve, ready: ready };
});
