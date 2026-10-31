#include "AppHdr.h"

#include "party-trade.h"

#include "coord.h"
#include "inventory-transfer.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "los-def.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "quiver.h"

namespace party
{
string trade_block_reason(int giver_slot, int recipient_slot)
{
    if (!is_enabled() || giver_slot < 0 || giver_slot >= player_count()
        || recipient_slot < 0 || recipient_slot >= player_count()
        || giver_slot == recipient_slot)
    {
        return "Choose another party member.";
    }
    if (!slot_is_alive(giver_slot) || is_player_downed(giver_slot)
        || !slot_is_alive(recipient_slot) || is_player_downed(recipient_slot))
    {
        return "Downed heroes cannot trade.";
    }
    const player& giver = get_player(giver_slot);
    const player& recipient = get_player(recipient_slot);
    if (giver.where_are_you != recipient.where_are_you
        || giver.depth != recipient.depth)
    {
        return "This party member is on another floor.";
    }
    bool visible = false;
    if (in_bounds(giver.pos()) && in_bounds(recipient.pos())
        && (giver.pos() - recipient.pos()).rdist() <= giver.current_vision)
    {
        // Cached global LOS uses the acting hero's radius. Party queries must
        // also work for companions with a different personal sight radius.
        los_def sight(giver.pos(), opc_default,
                      circle_def(giver.current_vision, C_SQUARE));
        sight.update();
        visible = sight.see_cell(recipient.pos());
    }
    if (!visible)
    {
        return "This party member is outside your hero's line of sight.";
    }
    return "";
}

string transfer_item(int recipient_slot, int inventory_slot, int quantity)
{
    const string blocked = trade_block_reason(active_slot(), recipient_slot);
    if (!blocked.empty())
        return blocked;
    if (inventory_slot < 0 || inventory_slot >= ENDOFPACK
        || !you.inv[inventory_slot].defined() || quantity <= 0
        || quantity > you.inv[inventory_slot].quantity)
    {
        return "The item or quantity changed. Choose it again.";
    }
    if (you.equipment.find_equipped_slot(you.inv[inventory_slot]) != SLOT_UNUSED)
        return "Remove this item from your loadout before trading it.";
    if (item_is_stationary(you.inv[inventory_slot]))
        return "This item cannot be traded.";

    item_def transferred = you.inv[inventory_slot];
    transferred.quantity = quantity;
    const string description = quant_name(transferred, quantity, DESC_A);
    const string recipient_name = get_player(recipient_slot).your_name;
    {
        scoped_player_context recipient_context(recipient_slot);
        int destination = -1;
        if (!merge_items_into_inv(transferred, quantity, destination, true))
            return "This party member has no room for that item.";
        quiver::on_actions_changed();
    }
    dec_inv_item_quantity(inventory_slot, quantity);
    you.last_pickup.erase(inventory_slot);
    if (you.last_unequip == inventory_slot)
        you.last_unequip = -1;
    quiver::on_actions_changed();
    mprf("You give %s to %s.", description.c_str(), recipient_name.c_str());
    you.turn_is_over = true;
    return "";
}
}
