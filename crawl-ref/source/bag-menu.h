#pragma once

struct item_def;
struct coord_def;
enum class spret;

namespace bag
{
// Inventory indexes always belong to the active player. Only a worn bag accepts
// new contents; an unequipped carried bag may be emptied after forced removal.
bool put_inventory(int inventory_slot, int quantity);
bool take_inventory(int bag_index, int quantity);
bool take_inventory(item_def& container, int bag_index, int quantity);
// Use normal drop marking so overflow is not immediately auto-picked up.
int drop_overflow_item(const item_def& item, const coord_def& position);
// Call only after other removal warnings: cancellation leaves contents intact.
bool prepare_unequip(item_def& container, bool reserve_gear_slot = false);
spret open(item_def& container);
}
