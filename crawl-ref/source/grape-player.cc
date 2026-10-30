#include "AppHdr.h"

#include "grape-player.h"

#include <algorithm>
#include <cstdint>
#include <limits>

#include "bag.h"
#include "item-def.h"
#include "item-prop.h"
#include "item-use.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"

namespace
{
const char* const grape_meld_key = "interdimensional_grape_group";
const char* const grape_root_key = "interdimensional_grape_root";

int reserve_group_id()
{
    mid_t newest = you.last_item_uid;
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
            newest = max(newest, party::get_player(slot).last_item_uid);
    // Item properties and savefile counters use signed 32-bit integers.
    // Refuse a new group rather than wrap into a duplicate or negative ID.
    if (newest >= static_cast<mid_t>(std::numeric_limits<int32_t>::max()))
        return 0;
    const mid_t next = newest + 1;
    const int id = static_cast<int>(next);
    you.last_item_uid = next;
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
            party::get_player(slot).last_item_uid = next;
    return id;
}

bool eligible(item_def& item, vector<item_def*>& group)
{
    if (!item.defined() || item.base_type != OBJ_ARMOUR
        || item.link < 0 || item.link >= ENDOFPACK
        || &you.inv[item.link] != &item
        || grape_player::suppressed(item) || item.props.exists(grape_root_key))
    {
        return false;
    }
    bool worn = false;
    for (const player_equip_entry& entry : you.equipment.items)
        if (entry.item == item.link)
        {
            if (entry.melded)
                return false;
            worn = true;
        }
    if (!worn)
        return false;

    // Use the same closure as ordinary equipment melding, but never impose a
    // second meld on an item already owned by another effect.
    group = {&item};
    if (!handle_chain_removal(group, false))
        return false;
    vector<item_def*> unique;
    for (item_def* member : group)
        if (find(unique.begin(), unique.end(), member) == unique.end())
            unique.push_back(member);
    group.swap(unique);
    for (item_def* dependent : group)
    {
        if (bag::is_bag(*dependent) || grape_player::suppressed(*dependent)
            || dependent->props.exists(grape_root_key))
            return false;
        for (const player_equip_entry& entry : you.equipment.items)
            if (entry.item == dependent->link && entry.melded)
                return false;
    }
    return true;
}
}

bool grape_player::suppressed(const item_def& item)
{
    return item.props.exists(grape_meld_key)
           && item.props[grape_meld_key].get_int() > 0;
}

bool grape_player::affected()
{
    for (const player_equip_entry& entry : you.equipment.items)
        if (!entry.is_overflow && suppressed(entry.get_item()))
            return true;
    return false;
}

bool grape_player::suppress(item_def& item)
{
    vector<item_def*> group;
    if (!eligible(item, group))
        return false;
    const int id = reserve_group_id();
    if (!id)
        return false;
    item.props[grape_root_key].get_int() = id;
    for (item_def* member : group)
        member->props[grape_meld_key].get_int() = id;
    you.equipment.meld_equipment(group);
    return true;
}

bool grape_player::restore(item_def& item)
{
    if (item.link < 0 || item.link >= ENDOFPACK
        || &you.inv[item.link] != &item || !suppressed(item))
        return false;
    const int id = item.props[grape_meld_key].get_int();
    vector<item_def*> group;
    bool root_worn = false;
    for (const player_equip_entry& entry : you.equipment.items)
    {
        if (entry.is_overflow)
            continue;
        item_def* member = &entry.get_item();
        const bool is_root = member->props.exists(grape_root_key)
                             && member->props[grape_root_key].get_int() == id;
        root_worn |= is_root;
        if (suppressed(*member) && member->props[grape_meld_key].get_int() == id)
        {
            // Restore the slot-granting root before its dependants.
            if (is_root)
                group.insert(group.begin(), member);
            else
                group.push_back(member);
        }
    }
    bool changed = false;
    for (item_def* member : group)
    {
        bool form_blocked = false;
        for (const player_equip_entry& entry : you.equipment.items)
            if (entry.item == member->link && slot_is_melded(entry.slot))
                form_blocked = true;
        if (!root_worn && form_blocked)
            continue; // Wait until the form no longer obscures available slots.
        member->props.erase(grape_meld_key);
        if (you.equipment.unmeld_item(*member) || form_blocked)
            changed = true;
        else if (!root_worn)
        {
            // The item that supplied this slot is gone. The dependent was
            // already inactive, so remove its equipment entry without firing
            // unequip effects a second time; the item stays in inventory.
            mprf("%s returns to your pack because its equipment slot is gone.",
                 member->name(DESC_YOUR).c_str());
            unequip_item(*member, false, true, false);
            changed = true;
        }
        else
            member->props[grape_meld_key].get_int() = id;
    }
    bool pending = false;
    for (const player_equip_entry& entry : you.equipment.items)
        if (!entry.is_overflow && suppressed(entry.get_item())
            && entry.get_item().props[grape_meld_key].get_int() == id)
        {
            pending = true;
            break;
        }
    if (!pending)
        for (player_equip_entry& entry : you.equipment.items)
            if (!entry.is_overflow
                && entry.get_item().props.exists(grape_root_key)
                && entry.get_item().props[grape_root_key].get_int() == id)
            {
                entry.get_item().props.erase(grape_root_key);
            }
    return changed;
}

bool grape_player::suppress_one()
{
    vector<item_def*> candidates;
    for (const player_equip_entry& entry : you.equipment.items)
        if (!entry.is_overflow)
        {
            vector<item_def*> group;
            if (eligible(entry.get_item(), group))
                candidates.push_back(&entry.get_item());
        }
    return !candidates.empty() && suppress(*candidates[random2(candidates.size())]);
}

bool grape_player::restore_one()
{
    vector<item_def*> candidates;
    vector<int> groups;
    for (const player_equip_entry& entry : you.equipment.items)
        if (!entry.is_overflow && suppressed(entry.get_item())
            && find(groups.begin(), groups.end(),
                    entry.get_item().props[grape_meld_key].get_int()) == groups.end())
        {
            candidates.push_back(&entry.get_item());
            groups.push_back(entry.get_item().props[grape_meld_key].get_int());
        }
    return !candidates.empty() && restore(*candidates[random2(candidates.size())]);
}

void grape_player::forget(item_def& item)
{
    if (item.props.exists(grape_meld_key))
        item.props.erase(grape_meld_key);
    if (item.props.exists(grape_root_key))
        item.props.erase(grape_root_key);
}
