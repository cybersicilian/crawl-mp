"""Selections from real native 16px art; gaps are deliberately left unassigned.

Raven: original fa<number>.png. Shikashi: zero-based 16px sheet cell.
D = direct object/control, M = proposed metaphor requiring meaning review.
"""

RAVEN = """
camp|23|M|Campfire for the expedition menu.
save|10|D|Published floppy/save icon with green marker; fantasy palette.
navigate|3|M|Direction arrow; no pathfinding or hero marker.
signal|41|D|Green rally flag.
user|636|D|Person figure.
chevron-up|631|D|Single upward triangle.
question|13|D|Question mark.
faith|15|M|Ceremonial chalice for faith; deity artwork remains native.
coin|158|M|Money purse; no forced modern currency symbol.
confusion|688|M|Spiral rings for dizziness; not uniquely confusion.
silence|680|M|Ellipsis for quiet; no explicit muted horn.
book|289|D|Closed red book.
chat|950|D|Speech bubble with ellipsis.
poison|697|M|Afflicted green heart; toxin meaning requires label.
flame|693|D|Fire droplet.
frost|694|D|Ice shard.
bolt|1025|D|Lightning bolt.
shield|664|D|Silver shield.
speed|667|D|Boot with motion bars.
wing|241|M|Feather for flight; no isolated wing verified.
eye|719|D|Open eye.
moon|977|D|Crescent moon.
heart|659|D|Heart.
skull|863|D|Skull.
spark|670|D|Golden spark.
blade|671|D|Sword.
trait|666|M|Violet spiral for mutable traits; needs label.
ready|880|D|Thumbs up.
loot|6|D|Treasure chest.
potion|281|D|Stoppered red potion.
helmet|1905|D|Metal helmet.
boots|1937|D|Grey boots.
cloak|1959|D|Teal hooded cloak.
danger|695|M|Flaming danger symbol; lacks conventional exclamation triangle.
strength|657|D|Flexed muscle.
intelligence|660|D|Peach brain; distinct from skull and strength.
dexterity|658|M|Foot/agility symbol; no hand-agility stat verified.
armour|2|D|Breastplate, distinct from shield.
evasion|651|M|Running figure; dodge interpretation needs label.
sound|947|D|Musical notes; sound rather than speaker hardware.
blink|925|M|Sparkling magical orb; teleport is not explicit.
holy|1144|M|Golden radiating figure for holy energy.
reflection|1084|M|Violet magical barrier; reflection is not explicit.
chain|128|D|Shackles/chain.
explore|970|M|Eight-point navigation star; no literal exploration action.
autofight|635|M|Warrior figure; automation not explicit.
rest|687|D|Sleeping Zs.
inventory|158|M|Purse/bag; intentionally shares money-bag art.
abilities|663|M|Raised fist for active abilities.
spells|662|D|Marked grimoire.
powers|669|M|Blue empowered brain; needs powers label.
skills|639|M|Hammer for learned skills.
codex|289|M|Reference book; intentionally shares closed-book art.
overview|14|M|Stack of colored stat counters.
stairs-up|631|M|Up arrow only, not an authored staircase-plus-arrow icon.
stairs-down|632|M|Down arrow only, not an authored staircase-plus-arrow icon.
cycle-hero|637|M|Two people; cycling not explicit.
ping-look|719|M|Eye reused without a rally badge.
ping-danger|695|M|Danger mark reused without a rally badge.
ping-loot|6|M|Chest reused without a rally badge.
ping-stairs|633|M|Double up-arrow; lacks a staircase or rally badge.
filter-equipped|1863|M|Armour/gear silhouette for equipped items.
filter-pack|158|M|Purse/bag reused for carried items.
inventory-open|9|M|Blue chest for opening inventory; no outward-arrow mark.
experience|12|M|Star for experience; retain exact XP.
time|140|D|Hourglass.
contamination|1081|M|Violet magic haze; contamination meaning needs label.
doom|24|M|Gravestone for impending doom.
slot-clear|640|D|Red X.
slot-missing|13|D|Question mark reused for missing action.
tray-expand|633|D|Double upward triangle.
exit|16|D|Door.
equipped|880|M|Thumbs up reused for equipped state.
level-cap|15|M|Chalice/trophy; retain exact cap value.
jewellery|1849|D|Gold-edged ring.
scroll|8|D|Parchment scroll.
wand|81|D|Short magical rod.
ammo|401|D|Arrow item, distinct from navigation arrow.
staff|87|D|Green gem staff.
supplies|9|M|Supply chest reused from inventory-open.
banes|864|M|Red skull for harmful effects.
"""

SHIKASHI = """
camp|3,4|D|Camping tent.
map|12,29|D|Worn map.
navigate|13,29|M|Location map; travel route not explicit.
signal|7,25|M|War horn for rally signals.
chevron-up|0,2|D|Up arrow.
faith|18,16|M|Prayer beads; deity artwork remains native.
coin|4,26|D|Bronze coin.
confusion|5,0|M|Dizzy stars; confusion needs label.
silence|3,0|M|Speech bubble with ellipsis; not an explicit silence slash.
book|0,28|D|Closed book.
chat|0,4|D|Square speech bubble.
poison|1,0|D|Green poison mark.
flame|9,3|D|Ring of flame.
frost|9,35|D|Snowflake.
bolt|8,0|D|Lightning bolt.
shield|8,8|D|Round shield.
speed|7,2|M|Fast blue arrow; movement speed requires label.
slow|17,24|M|Hourglass for slowing; shares time symbol.
wing|9,34|M|Feather for flight; no isolated wing.
eye|2,0|M|Closed eye; not suitable for a positive see-invisible state.
moon|8,35|D|Crescent moon.
heart|0,1|D|Anatomical heart.
skull|17,25|D|Skull.
spark|5,0|D|Golden sparks.
blade|1,5|D|Sword.
trait|14,3|M|Psychic waves around a head; mutable traits need label.
rune|0,25|D|Inscribed runestone.
loot|12,25|D|Treasure chest.
potion|0,17|D|Orange potion.
helmet|9,12|D|Metal helmet.
boots|2,16|D|Boots.
gloves|0,16|D|Glove.
cloak|7,15|D|Hooded cloak.
strength|4,1|D|Strong arm.
intelligence|3,1|D|Brain.
dexterity|3,6|M|Dagger as nimble/agile weapon; stat meaning is indirect.
armour|6,10|D|Breastplate.
evasion|8,4|M|Thief/running figure for evasion.
sound|3,25|D|Instrument.
blink|10,3|M|Disintegrating silhouette; teleport is not explicit.
holy|15,3|M|Sunrays for holy energy.
reflection|1,25|D|Mirror.
chain|2,25|D|Shackles.
explore|8,24|M|Telescope for exploration.
autofight|2,3|M|Blade strike; automation not explicit.
rest|7,0|D|Sleeping Zs.
pickup|10,26|M|Receive-money hand; too narrow for general pickup.
inventory|0,24|D|Knapsack.
abilities|5,35|M|Hand casting magic; suitable action but not every ability.
spells|7,4|D|Open spellbook.
powers|14,3|M|Psychic-waves head reused for powers.
skills|4,4|M|Blacksmith skill; too narrow for all skills.
codex|0,29|D|Open book.
overview|11,29|M|Written paper for overview.
stairs-up|0,2|M|Up arrow only; no staircase.
stairs-down|1,2|M|Down arrow only; no staircase.
inspect|9,24|D|Magnifying glass.
cycle-hero|6,2|M|Repeat arrows; no hero figure.
ping-look|8,24|M|Telescope reused without rally badge.
ping-loot|12,25|M|Chest reused without rally badge.
ping-stairs|0,2|M|Up arrow only; no stairs or rally badge.
filter-equipped|0,10|M|Armour for equipped gear.
filter-pack|0,24|M|Knapsack reused for carried items.
inventory-open|1,24|M|Leather pouch; opening is not explicit.
experience|16,26|M|Green gem for experience.
time|17,24|D|Hourglass.
contamination|14,3|M|Psychic aura; contamination not explicit.
doom|0,0|M|Skull and bones for doom.
tray-expand|0,2|M|Up arrow; no tray.
search|9,24|D|Magnifier reused for search.
jewellery|9,16|D|Gem ring.
scroll|2,29|D|Tied scroll.
wand|16,7|M|Orb staff; separate short wand not verified.
ammo|2,7|D|Arrow item.
staff|12,7|D|Green gem staff.
supplies|0,35|M|Wicker basket for supplies.
banes|0,0|M|Skull and bones reused for harmful effects.
arcane-deck|15,29|D|Playing card.
"""

GROUPS = [
    ("Statistics and defences", "armour evasion shield strength intelligence dexterity"),
    ("Inventory and equipment", "inventory filter-equipped filter-pack helmet boots gloves cloak quiver"),
    ("Actions and knowledge", "abilities spells skills codex explore autofight rest pickup"),
    ("Conditions and properties", "flame frost bolt poison heart skull moon reflection chain"),
    ("Control and navigation", "inspect camera control navigate stairs-up stairs-down save exit"),
    ("Remaining control gaps", "zoom-in zoom-out zoom-reset layout slot-add slot-clear compass-rose compass-needle"),
]
