#include "AppHdr.h"
#include "grape-monster.h"

#include "areas.h"
#include "item-def.h"
#include "item-prop.h"
#include "monster.h"

namespace grape_monster
{
static const char* key(mon_inv_type slot)
{
    switch (slot)
    {
    case MSLOT_ARMOUR: return "grape_meld_body_uid";
    case MSLOT_AUX_ARMOUR: return "grape_meld_aux_uid";
    case MSLOT_SHIELD: return "grape_meld_shield_uid";
    default: return nullptr;
    }
}

bool suppressed(const monster& mon, mon_inv_type slot)
{
    const char* prop = key(slot);
    const item_def* item = mon.mslot_item(slot);
    return prop && item && mon.props.exists(prop)
           && item->props.exists(ITEM_UNIQUE_ID)
           && mon.props[prop].get_int() == item->props[ITEM_UNIQUE_ID].get_int();
}

bool suppress(monster& mon, mon_inv_type slot)
{
    const char* prop = key(slot);
    item_def* item = mon.mslot_item(slot);
    if (!prop || !item || item->base_type != OBJ_ARMOUR || suppressed(mon, slot))
        return false;
    mon.props[prop] = item->give_unique_id();
    if (item_affects_agrid(*item))
        invalidate_agrid();
    return true;
}

bool restore(monster& mon, mon_inv_type slot)
{
    const char* prop = key(slot);
    if (!prop || !mon.props.exists(prop))
        return false;
    const bool was_suppressed = suppressed(mon, slot);
    const item_def* item = mon.mslot_item(slot);
    mon.props.erase(prop);
    if (was_suppressed && item_affects_agrid(*item))
        invalidate_agrid();
    return was_suppressed;
}

item_def* effective_item(const monster& mon, mon_inv_type slot)
{
    return suppressed(mon, slot) ? nullptr : mon.mslot_item(slot);
}

int effective_index(const monster& mon, mon_inv_type slot)
{
    return suppressed(mon, slot) ? NON_ITEM : mon.inv[slot];
}
}
