"""Review selections from published packs; never draws or alters icon pixels."""

# role | original Fugue basename (empty means unresolved) | confidence | reason
FUGUE = """
zoom-in|magnifier-zoom-in|direct|Published magnifier with plus.
zoom-out|magnifier-zoom-out|direct|Published magnifier with minus.
zoom-reset|magnifier-zoom-actual-equal|direct|Published actual-size magnifier with equals.
camp|briefcase|metaphor|Expedition menu as travel case; lacks a tent.
layout|layout-4|direct|Four-pane layout.
move|arrow-move|direct|Four-way panel movement.
expand|arrow-resize-135|direct|Diagonal panel resizing.
camera|camera|direct|Camera; distinct from magnifier and control hand.
save|disk|direct|Conventional save disk.
map|map|direct|Folded map.
navigate|navigation|direct|Travel direction arrow.
signal|flag|direct|Rally flag.
user|user|direct|Person.
plus|plus|direct|Green plus.
compact|arrow-in|direct|Inward arrows.
chevron-up|control-090|direct|Up triangle.
remove|minus|direct|Red minus.
question|question|direct|Question mark.
faith|church|metaphor|Religion building is culturally specific; generic faith symbol absent.
faith-none||gap|No matching secular/no-deity partner to church.
coin|money-coin|direct|Gold coin; shared gold remains one visual.
confusion|smiley-confuse|direct|Confused face.
silence|speaker-volume-control-mute|direct|Muted speaker.
book|book|direct|Closed blue book.
chat|balloon|direct|Speech bubble.
poison|poison-green|direct|Green poison flask and skull.
flame|fire|direct|Flame.
frost|weather-snowflake|direct|Snowflake; faint on paper at 16px.
bolt|lightning|direct|Lightning bolt.
shield|shield|direct|Shield; existing willpower alias is preserved, not resolved by sourcing.
speed|rocket-fly|metaphor|Fast rocket; modern object, not haste.
slow|hourglass|metaphor|Elapsed time; paired with clock for time.
wing||gap|No suitable wing or flight silhouette.
eye|eye|direct|Open eye.
moon|weather-moon|direct|Moon; round rather than crescent.
heart|heart|direct|Red heart.
skull|skull|direct|Skull.
spark|wand-magic|metaphor|Magic wand with spark; not a magic-point droplet.
blade||gap|No sword; a gavel would misrepresent combat.
trait|molecule|metaphor|Connected molecule for mutation; requires label.
ready|tick|direct|Green check.
rune||gap|No generic rune; actual native rune artwork stays untouched.
stairs|stairs|direct|Staircase without direction.
loot|wooden-box|metaphor|Wooden crate; no fantasy treasure chest.
potion|flask|metaphor|Laboratory flask instead of stoppered potion.
helmet||gap|No helmet.
boots|shoe|metaphor|Brown shoe; lacks boots silhouette.
gloves||gap|No glove; bare hand would collide with control.
cloak||gap|No cloak.
danger|exclamation|direct|Yellow warning triangle.
corrosion||gap|No acid/corrosion symbol; flask would collide with potion.
strength||gap|No fist or muscle; weight measures mass rather than this stat.
intelligence|brain|direct|Pink brain; distinct from skull.
dexterity|hand-finger|metaphor|Single finger for manual dexterity; close to control hand.
armour||gap|No breastplate; plain T-shirt is insufficient for AC.
evasion|footprints|metaphor|Footsteps for movement; dark marks lose contrast on HUD.
sound|speaker-volume|direct|Speaker with sound waves.
blink||gap|No teleport/blink; arrows alone imply travel.
holy||gap|No appropriate neutral holy-energy symbol.
reflection|image-reflection|metaphor|Image reflected below itself; technical rather than magical.
chain|chain|direct|Chain links; subdued contrast on HUD.
explore|binocular|metaphor|Binoculars for exploration; not the inspect magnifier.
autofight|target|metaphor|Target for combat automation; no sword/auto combination.
rest|smiley-sleep|direct|Sleeping face.
pickup|inbox-download|metaphor|Down arrow into tray; modern transfer metaphor.
inventory|box|metaphor|Cardboard box; not a rucksack.
abilities|light-bulb|metaphor|Idea bulb; distinct from spellbook but modern.
spells|book-open|metaphor|Open book; no mystical mark.
powers|wand|metaphor|Plain wand; distinct from open spellbook.
skills|auction-hammer|metaphor|Practice/tool metaphor; gavel may suggest auction.
codex|book-open-list|direct|Reference book with list.
overview|document-text-image|direct|Summary document.
stairs-up||gap|No authored stairs-plus-up; do not draw or overlay arrows.
stairs-down||gap|No authored stairs-plus-down; do not duplicate the same stairs for both.
floor|layer|metaphor|One layer for current floor; preserve floor text.
inspect|magnifier|direct|Magnifier distinct from camera and control.
control|hand|metaphor|Open hand for taking control; needs label.
cycle-hero|users|metaphor|Multiple people without cycle arrow; rotation is not explicit.
claim-hero|user--arrow|metaphor|User with arrow; claiming is not explicit.
add-hero|user--plus|direct|User plus.
ping-look|flag--arrow|metaphor|Flag with arrow; lacks eye marker.
ping-danger|flag--exclamation|direct|Flag with warning.
ping-loot|flag--plus|metaphor|Flag with plus; lacks loot marker and needs label.
ping-stairs||gap|No flag with stairs; blue flag alone would rely on color.
filter-all|table-select-all|direct|Whole table selected.
filter-equipped||gap|No equipped gear symbol; T-shirt is too generic.
filter-pack|paper-bag|metaphor|Paper bag for carried items; not a pack.
inventory-open|box-share|metaphor|Box with outgoing arrow for opening full inventory.
experience|medal|metaphor|Achievement medal for experience; retain exact XP text.
time|clock|direct|Clock, distinct from slowing hourglass.
quiver||gap|No quiver or ammunition bundle.
contamination|radioactivity|metaphor|Radioactivity for magical contamination; not literal radiation.
doom|headstone|metaphor|Gravestone for doom; distinct from skull.
slot-add|plus-button|direct|Framed plus.
slot-clear|cross-button|direct|Framed red cross.
slot-missing|question-button|direct|Framed question mark.
tray-expand|control-eject|metaphor|Up triangle over tray bar.
search|magnifier-left|direct|Search magnifier; shares concept with inspect.
exit|door-open-out|direct|Door with outward arrow; preserve save-and-exit wording.
equipped|tick-circle|metaphor|Check in green circle for equipped state.
level-cap|trophy|metaphor|Trophy for cap; preserve exact cap and level text.
jewellery|ring|direct|Ring.
scroll||gap|No parchment scroll; generic document would collide with overview.
wand|wand-small|direct|Small magic wand.
ammo||gap|No arrow or missile item; navigation arrows are unsuitable.
staff||gap|No staff; do not substitute the wand asset.
supplies|box-small|metaphor|Small supply box.
banes|skull-mad|metaphor|Angry skull for harmful effects.
bestiary|book-question|metaphor|Book with question mark; lacks creature silhouette.
arcane-deck|playing-card|direct|Playing cards.
compass-rose||gap|Only an assembled compass exists; no independently authored rose layer.
compass-needle||gap|No isolated rotating compass needle; preserve layer contract.
"""

# Exact native PNG names from the author's v1.2 download, not the v1.3 listing.
KYRISE = {
    "shield": "shield_01a", "blade": "sword_01a", "helmet": "helmet_01a",
    "potion": "potion_01a", "coin": "coin_01a", "jewellery": "ring_01a",
    "staff": "staff_01a", "ammo": "arrow_01a", "scroll": "scroll_01a",
    "book": "book_01a", "spells": "spellbook_01a",
}

# Original sheets, zero-based cells, native 16px crops without alteration.
SHADE = {
    "armour": ("armours.png", 3, 8),
    "blade": ("weapons.png", 0, 0),
    "potion": ("potions.png", 1, 0),
    "loot": ("chests.png", 0, 0),
    "book": ("books.png", 0, 0),
    "spells": ("books.png", 4, 0),
    "inventory": ("consumables.png", 0, 6),
    "filter-pack": ("consumables.png", 0, 6),
}

GROUPS = [
    ("Statistics", "armour evasion shield strength intelligence dexterity"),
    ("Confusable objects", "strength quiver abilities intelligence skull"),
    ("Inventory", "inventory filter-all filter-equipped filter-pack inventory-open"),
    ("Inspect / view / act / travel", "inspect camera control navigate explore pickup"),
    ("Zoom", "zoom-in zoom-out zoom-reset"),
    ("Action slots", "slot-add slot-clear slot-missing tray-expand"),
    ("Knowledge", "spells abilities powers skills codex overview"),
    ("Party signals", "signal ping-look ping-danger ping-loot ping-stairs"),
    ("Conditions", "poison flame frost heart slow chain silence"),
    ("Core shapes", "moon bolt danger stairs-up stairs-down time"),
    ("Compass layers", "compass-rose compass-needle"),
]
