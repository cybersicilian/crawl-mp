# Absorbed equipment and native effects

The owner of an absorbed effect is the ooze. Item class describes the source,
not a required recipient. Numeric properties use the existing strongest-value
projection and the 35–100% Shapeshifting curve; native techniques and special
powers retain their native rules. One newest inherited weapon brand applies
when a physical weapon does not supply a brand. Natural acid remains separate.

Each memory stores a detached copy of its original equipment alongside its
extracted property bundle. Native unique identity queries expose passive and
activated powers through the existing player/ability interfaces. A shared
source adapter dispatches native equip, removal, turn, kill, hit, block and
projectile hooks. The item's own state is saved with the memory, including
scripted enchantment growth. No inventory link or equipped recipient is needed.

Sources are selected once per native identity (or ordinary equipment subtype),
with the newest remembered copy winning. A physically active copy takes
precedence for the same identity, so callbacks cannot fire twice. Event routing
runs in the current player's context; queries for another player read only that
player's memories. FIFO replacement removes the old lifecycle before activating
the new source. Old saves without item copies retain their recorded properties.

This adapter reuses the game's native item catalogue, callbacks, activation
menus, costs, targeting and failure rules. Item-specific effects remain in their
existing native implementation. Shared FIFO/projection code has no dependency
on a player, inventory, UI or callback implementation. Consumables and general
evokables are outside this equipment contract.
