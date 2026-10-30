#pragma once

#include "mon-inv-type.h"

class monster;
struct item_def;

namespace grape_monster
{
// Grape suppression belongs to the original item, not merely the slot.
bool suppress(monster& mon, mon_inv_type slot);
bool restore(monster& mon, mon_inv_type slot);
bool suppressed(const monster& mon, mon_inv_type slot);
item_def* effective_item(const monster& mon, mon_inv_type slot);
int effective_index(const monster& mon, mon_inv_type slot);
}
