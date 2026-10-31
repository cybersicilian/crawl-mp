# Restored equipment sprites

Spiked flails and scythes appeared as question marks because the restored
weapon subtypes had no inventory tile mapping. Hammers, cutlasses and
fustibali had the same omission. Their equipped appearances were also absent.
Centaur barding lacked both inventory and equipped mappings.

The repair connects each subtype to native artwork, restores 16 unchanged
PNGs from `rltiles/UNUSED`, and declares the inventory enchantment/artefact
variants in the normal tile compiler inputs. Hammer and scythe artwork was
already registered. The cutlass shares the falchion's equipped silhouette;
spiked flails and fustibali use their preserved single equipped sprite.
Centaur barding uses its original inventory and equipped artwork.

Retained blessed blade save subtypes now use the corresponding ordinary
blade's sprites. Retained blowguns also have an equipped sprite. No item
subtype values, mechanics or save format were changed.

`restored-assets.json` records each original path, active path and SHA-256.
The existing tile compiler generates the matching native definitions, atlas
PNGs and WebTiles metadata. These must be built and released together.

## Validation

An isolated source snapshot regenerated the atlases and compiled the native
Catch2 executable with WebTiles enabled and two compiler jobs. The focused
`[item-tiles]` suite passed **4,040 assertions across six test cases**.

Coverage includes every retained weapon subtype with ordinary, glowing,
runed, shiny and random artefact appearances; inventory, equipped and
mirrored sprites; dedicated artwork and real random artefact generation for
the five restored weapons; centaur barding; and the existing identification
and artefact appearance checks. All 25 inspected generated atlas regions
were nonempty and within bounds. The regenerated inventory atlas was also
visually inspected.

Validation used the shared host reservation and released it after verifying
that all owned processes were gone. An earlier preflight rejected an
unrelated generated source change before any build; its failed receipt was
preserved separately. The successful phase pinned the scoped repair inputs
and recorded a frozen source manifest before compilation.

This is local source, atlas and native test evidence. This task did not
deploy or establish live gameplay acceptance.
