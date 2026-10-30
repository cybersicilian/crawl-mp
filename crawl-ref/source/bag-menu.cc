#include "AppHdr.h"

#include "bag-menu.h"

#include "bag.h"
#include "env.h"
#include "invent.h"
#include "inventory-transfer.h"
#include "item-def.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-use.h"
#include "items.h"
#include "macro.h"
#include "message.h"
#include "menu-type.h"
#include "player.h"
#include "player-equip.h"
#include "party.h"
#include "prompt.h"
#include "spl-cast.h"
#include "stringutil.h"
#include "terrain.h"

namespace bag
{
namespace
{
constexpr const char* contents_key = "bag_contents";
constexpr const char* action_key = "bag_direct_action";
constexpr const char* action_sequence_key = "bag_direct_action_sequence";

item_def* worn_bag()
{
    item_def* item = you.equipment.get_first_slot_item(SLOT_BAG);
    return item && is_bag(*item) ? item : nullptr;
}

// Inventory auto-lettering can move equipment while an item is withdrawn.
// Find the original bag again instead of committing to a stale inventory index.
bool carried_bag(const item_def& item)
{
    return is_bag(item) && in_inventory(item) && item.link >= 0
           && item.link < ENDOFPACK && &you.inv[item.link] == &item;
}

item_def* find_carried_bag(int uid, const string& token)
{
    for (int i = 0; i < ENDOFPACK; ++i)
    {
        item_def& item = you.inv[i];
        if (carried_bag(item) && item.props.exists(ITEM_UNIQUE_ID)
            && item.props[ITEM_UNIQUE_ID].get_int() == uid
            && item.props.exists(action_key)
            && item.props[action_key].get_string() == token)
            return &item;
    }
    return nullptr;
}

void install_contents(item_def& destination, const item_def& staged)
{
    if (staged.props.exists(contents_key))
        destination.props[contents_key] = staged.props[contents_key];
    else
        destination.props.erase(contents_key);
}

spret put_menu()
{
    vector<const item_def*> choices;
    for (const item_def& item : you.inv)
        if (item.defined() && in_inventory(item) && !is_bag(item)
            && !item_is_equipped(item))
        {
            choices.push_back(&item);
        }
    if (choices.empty())
    {
        mpr("You have nothing available to put in your bag.");
        return spret::abort;
    }
    const vector<SelItem> selected = select_items(choices, "Put what in your bag?",
                                                   false, menu_type::sel_one);
    if (selected.empty())
        return spret::abort;
    const SelItem& choice = selected.front();
    if (!put_inventory(choice.slot, choice.quantity))
    {
        mpr("You cannot put that in your bag.");
        return spret::abort;
    }
    mpr("You put the item in your bag.");
    return spret::success;
}

spret take_menu(item_def& container)
{
    vector<item_def> stored = contents(container);
    if (stored.empty())
    {
        mpr("Your bag is empty.");
        return spret::abort;
    }
    vector<const item_def*> choices;
    for (int i = 0; i < static_cast<int>(stored.size()); ++i)
    {
        // These are menu identities, not inventory indices.
        stored[i].link = i;
        stored[i].slot = index_to_letter(i);
        choices.push_back(&stored[i]);
    }
    const string title = make_stringf("Take what from your bag? (%d/%d slots)",
                                      used(container), capacity(container));
    const vector<SelItem> selected = select_items(choices, title.c_str(), false,
                                                   menu_type::sel_one);
    if (selected.empty())
        return spret::abort;
    const SelItem& choice = selected.front();
    if (!take_inventory(container, choice.slot, choice.quantity))
    {
        mpr("You need room in the matching inventory category to take that item out.");
        return spret::abort;
    }
    mpr("You take the item from your bag.");
    return spret::success;
}
}

bool put_inventory(int inventory_slot, int quantity)
{
    item_def* container = worn_bag();
    if (!container || inventory_slot < 0 || inventory_slot >= ENDOFPACK)
        return false;
    const item_def& source = you.inv[inventory_slot];
    if (!source.defined() || is_bag(source) || item_is_equipped(source))
        return false;
    if (quantity <= 0)
        quantity = source.quantity;
    item_def staged = *container;
    bool merged_device = false;
    const bool xp_evoker = is_xp_evoker(source);
    if (source.base_type == OBJ_WANDS || xp_evoker)
        for (int index = 0; index < used(staged); ++index)
        {
            item_def* existing = at(staged, index);
            if (existing && existing->base_type == source.base_type
                && existing->sub_type == source.sub_type)
            {
                if (source.base_type == OBJ_WANDS)
                    existing->charges += source.charges;
                merged_device = true;
                break;
            }
        }
    if (!merged_device && !store(staged, source, quantity))
        return false;
    // No interaction or allocation occurs between staging and the source
    // update, so cancellation cannot leave a half-completed transfer.
    install_contents(*container, staged);
    if (merged_device && xp_evoker && evoker_plus(source.sub_type) < MAX_EVOKER_ENCHANT)
    {
        if (++evoker_plus(source.sub_type) == MAX_EVOKER_ENCHANT)
            set_item_autopickup(source, AP_FORCE_OFF);
    }
    dec_inv_item_quantity(inventory_slot, quantity);
    // A stored stack is no longer a direct inventory pickup. Retaining this
    // slot would make drop-last target a later item that reused it.
    you.last_pickup.erase(inventory_slot);
    return true;
}

bool take_inventory(int bag_index, int quantity)
{
    item_def* container = worn_bag();
    return container && take_inventory(*container, bag_index, quantity);
}

bool take_inventory(item_def& container, int bag_index, int quantity)
{
    if (!carried_bag(container))
        return false;
    const vector<item_def> stored = contents(container);
    if (bag_index < 0 || bag_index >= static_cast<int>(stored.size()))
        return false;
    if (quantity <= 0)
        quantity = stored[bag_index].quantity;
    item_def staged = container;
    item_def portion;
    if (!take(staged, bag_index, quantity, portion))
        return false;

    // A merge may reassign inventory letters and move the bag. Its stable UID
    // lets us commit the staged contents to the same equipped item afterward.
    const auto original_inventory = you.inv;
    const auto original_equipment = you.equipment;
    const auto original_last_pickup = you.last_pickup;
    const int original_last_uid = you.last_item_uid;
    const int uid = container.give_unique_id();
    const int sequence = you.props.exists(action_sequence_key)
                         ? you.props[action_sequence_key].get_int() + 1 : 1;
    you.props[action_sequence_key] = sequence;
    const string token = make_stringf("%d:%d:%d", party::active_slot(), uid, sequence);
    container.props[action_key] = token;
    int inventory_slot = -1;
    if (!merge_items_into_inv(portion, quantity, inventory_slot, true))
    {
        you.inv = original_inventory;
        you.last_item_uid = original_last_uid;
        return false;
    }
    item_def* current = find_carried_bag(uid, token);
    if (!current)
    {
        // Defensive rollback: never strand a withdrawn item or duplicate it
        // if an inventory hook unexpectedly moved or removed the bag.
        you.inv = original_inventory;
        you.equipment = original_equipment;
        you.last_pickup = original_last_pickup;
        you.last_item_uid = original_last_uid;
        return false;
    }
    install_contents(*current, staged);
    current->props.erase(action_key);
    return true;
}

int drop_overflow_item(const item_def& item, const coord_def& position)
{
    return copy_item_to_grid(item, position, item.quantity, true, true);
}

bool prepare_unequip(item_def& container, bool reserve_gear_slot)
{
    if (&container != worn_bag())
        return !used(container);
    const vector<item_def> stored = contents(container);
    if (stored.empty())
        return used(container) == 0;
    const int bag_slot = container.link;
    if (bag_slot < 0 || bag_slot >= ENDOFPACK || &you.inv[bag_slot] != &container)
        return false;

    // Stage the complete inventory without mutating the player. Equipment
    // indexes stay stable because no existing inventory slot is moved.
    vector<item_def> staged_inventory;
    for (int i = 0; i < ENDOFPACK; ++i)
        staged_inventory.push_back(you.inv[i]);
    vector<item_def> overflow;
    vector<int> staged_evoker_upgrades(NUM_MISCELLANY, 0);
    int gear_room = MAX_GEAR - inv_count(INVENT_GEAR) - (reserve_gear_slot ? 1 : 0);
    if (gear_room < 0)
        return false;
    for (size_t i = 0; i < stored.size(); ++i)
    {
        bool merges = false;
        if (stored[i].base_type == OBJ_WANDS || is_xp_evoker(stored[i]))
            for (int index = MAX_GEAR; index < ENDOFPACK; ++index)
            {
                item_def& held = staged_inventory[index];
                if (held.base_type != stored[i].base_type
                    || held.sub_type != stored[i].sub_type)
                    continue;
                if (held.base_type == OBJ_WANDS)
                    held.charges += stored[i].charges;
                else if (evoker_plus(held.sub_type)
                         + staged_evoker_upgrades[held.sub_type]
                         < MAX_EVOKER_ENCHANT)
                    ++staged_evoker_upgrades[held.sub_type];
                merges = true;
                break;
            }
        if (is_stackable_item(stored[i]))
            for (item_def& held : staged_inventory)
                if (items_stack(held, stored[i]))
                {
                    if (held.inscription.empty())
                        held.inscription = stored[i].inscription;
                    held.quantity += stored[i].quantity;
                    merges = true;
                    break;
                }
        if (merges)
            continue;

        const bool gear = inventory_category_for(stored[i]) == INVENT_GEAR;
        const int start = gear ? 0 : MAX_GEAR;
        const int end = gear ? MAX_GEAR : ENDOFPACK;
        int free_index = -1;
        if (!gear || gear_room > 0)
            for (int index = start; index < end; ++index)
                if (!staged_inventory[index].defined())
                {
                    free_index = index;
                    break;
                }

        int letter = free_index >= 0 && gear ? index_to_letter(free_index) : 0;
        if (free_index >= 0 && !gear)
        {
            bool taken[52] = {};
            const operation_types operation = item_to_oper(&stored[i]);
            for (int index = MAX_GEAR; index < ENDOFPACK; ++index)
            {
                const item_def& held = staged_inventory[index];
                if (held.defined() && item_to_oper(&held) == operation
                    && isalpha(held.slot))
                {
                    taken[letter_to_index(held.slot)] = true;
                }
            }
            for (int index = 0; index < 52; ++index)
                if (!taken[index])
                {
                    letter = index_to_letter(index);
                    break;
                }
        }

        if (free_index < 0 || !letter)
        {
            overflow.push_back(stored[i]);
            continue;
        }
        item_def& target = staged_inventory[free_index];
        target = stored[i];
        target.link = free_index;
        target.slot = letter;
        target.pos = ITEM_IN_INVENTORY;
        if (gear)
            --gear_room;
    }

    if (!overflow.empty())
    {
        if (feat_destroys_items(env.grid(you.pos())))
        {
            mpr("You cannot safely put the overflow on this terrain.");
            return false;
        }
        // copy_item_to_grid uses reserve 10. Ensure it cannot cull unrelated
        // items or fail partway through the planned drops.
        int free_floor_slots = 0;
        for (int i = 0; i < MAX_ITEMS - 10; ++i)
            if (!env.item[i].defined())
                ++free_floor_slots;
        if (free_floor_slots < static_cast<int>(overflow.size()))
        {
            mpr("There is no room to put the bag's contents on the ground.");
            return false;
        }
        const string prompt = make_stringf(
            "Removing your bag will drop %d item stack%s, including %s. Continue?",
            static_cast<int>(overflow.size()), overflow.size() == 1 ? "" : "s",
            overflow.front().name(DESC_A).c_str());
        if (!yesno(prompt.c_str(), false, 'n'))
            return false;
    }

    // The only potential floor failures have been ruled out above. Do not
    // remove the originals from the bag until every drop is placed.
    for (const item_def& item : overflow)
    {
        const int placed = drop_overflow_item(item, you.pos());
        ASSERT(placed != NON_ITEM);
    }
    staged_inventory[bag_slot].props.erase(contents_key);
    for (int index = 0; index < ENDOFPACK; ++index)
        you.inv[index] = staged_inventory[index];
    for (int subtype = 0; subtype < NUM_MISCELLANY; ++subtype)
        if (staged_evoker_upgrades[subtype])
        {
            evoker_plus(subtype) += staged_evoker_upgrades[subtype];
            if (evoker_plus(subtype) == MAX_EVOKER_ENCHANT)
                for (const item_def& held : you.inv)
                    if (held.is_type(OBJ_MISCELLANY, subtype))
                    {
                        set_item_autopickup(held, AP_FORCE_OFF);
                        break;
                    }
        }
    return true;
}

spret open(item_def& container)
{
    if (!carried_bag(container))
    {
        mpr("You must carry the bag to use it.");
        return spret::abort;
    }
    if (&container != worn_bag())
    {
        if (used(container) == 0)
        {
            mpr("You must wear an empty bag before using it.");
            return spret::abort;
        }
        mpr("You can take items from this unequipped bag.");
        const spret result = take_menu(container);
        if (result == spret::success)
            you.turn_is_over = true;
        return result;
    }
    mprf(MSGCH_PROMPT, "Bag (%d/%d slots): (p)ut in, (t)ake out, or Esc to cancel?",
         used(container), capacity(container));
    flush_prev_message();
    const int choice = getchm();
    spret result = spret::abort;
    if (choice == 'p' || choice == 'P')
        result = put_menu();
    else if (choice == 't' || choice == 'T')
        result = take_menu(container);
    else
        canned_msg(MSG_OK);
    if (result == spret::success)
        you.turn_is_over = true;
    return result;
}
}
