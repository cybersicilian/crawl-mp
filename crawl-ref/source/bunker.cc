#include "AppHdr.h"

#include "bunker.h"

#include "env.h"
#include "inventory-transfer.h"
#include "item-prop.h"
#include "item-use.h"
#include "items.h"
#include "level-id.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player-equip.h"
#include "player.h"
#include "skills.h"
#include "spl-cast.h"
#include "terrain.h"

namespace bunker
{
static const char* const SHIELD_KEY = "bunker_shield";
static const char* const OWNER_POS_KEY = "bunker_owner_pos";

bool available(const actor& owner)
{
    const item_def* shield = owner.shield();
    return shield && get_armour_ego_type(*shield) == SPARM_BUNKER;
}

monster* find(const actor& owner)
{
    if (!owner.props.exists(SHIELD_KEY))
        return nullptr;
    monster* mon = monster_by_mid(owner.props[SHIELD_KEY].get_int());
    return mon && mon->alive() && mon->type == MONS_BUNKER_SHIELD
           && mon->summoner == owner.mid ? mon : nullptr;
}

spret deploy(const coord_def& target)
{
    item_def* shield = you.shield();
    if (!available(you) || find(you))
        return spret::abort;
    if (!in_bounds(target) || grid_distance(target, you.pos()) != 1
        || !monster_habitable_grid(MONS_BUNKER_SHIELD, target)
        || party::player_at(target) || actor_at(target))
    {
        mpr("You cannot deploy your shield there.");
        return spret::abort;
    }
    if (!can_unequip_item(*shield))
        return spret::abort;
    const int slot = get_mitm_slot();
    if (slot == NON_ITEM)
    {
        mpr("There is no room to deploy your shield.");
        return spret::abort;
    }
    mgen_data data(MONS_BUNKER_SHIELD, BEH_FRIENDLY, target, you.mindex(),
                   MG_FORCE_BEH | MG_FORCE_PLACE);
    data.set_summoned(&you, 0, 0, false);
    data.hp = 15 + 5 * you.skill(SK_SHIELDS);
    monster* mon = create_monster(data);
    if (!mon)
    {
        canned_msg(MSG_NOTHING_HAPPENS);
        return spret::abort;
    }
    const int inv_slot = shield->link;
    env.item[slot] = *shield;
    env.item[slot].set_holding_monster(*mon);
    mon->inv[MSLOT_SHIELD] = slot;
    mon->props[OWNER_POS_KEY] = you.pos();
    if (!unequip_item(*shield, false))
    {
        mon->inv[MSLOT_SHIELD] = NON_ITEM;
        env.item[slot].clear();
        monster_die(*mon, KILL_RESET, NON_MONSTER);
        return spret::abort;
    }
    dec_inv_item_quantity(inv_slot, 1);
    you.props[SHIELD_KEY] = static_cast<int>(mon->mid);
    mpr("You pin your shield to the ground.");
    return spret::success;
}

static void retrieve(bool departure)
{
    monster* mon = find(you);
    if (!mon || (!departure && (!mon->props.exists(OWNER_POS_KEY)
        || mon->props[OWNER_POS_KEY].get_coord() == you.pos())))
        return;
    you.props.erase(SHIELD_KEY);
    const int item_slot = mon->inv[MSLOT_SHIELD];
    if (item_slot != NON_ITEM)
    {
        item_def& shield = env.item[item_slot];
        int inv_slot = -1;
        if (merge_items_into_inv(shield, 1, inv_slot, true))
        {
            mon->inv[MSLOT_SHIELD] = NON_ITEM;
            shield.clear();
            if (inv_slot >= 0 && !you.shield()
                && (!you.weapon() || !is_shield_incompatible(*you.weapon(),
                                                              &you.inv[inv_slot])))
                equip_item(SLOT_OFFHAND, inv_slot, false);
            mpr("You retrieve your shield.");
        }
        else
            mpr("You leave your shield on the ground.");
    }
    // Preserve the real shield when a full pack prevented its recovery.
    monster_die(*mon, KILL_RESET_KEEP_ITEMS, NON_MONSTER);
}

void retrieve_after_moving()
{
    retrieve(false);
}

void retrieve_on_departure()
{
    retrieve(true);
}

void retrieve_party_on_departure(const level_id& source, bool transport_party)
{
    retrieve_on_departure();
    if (!transport_party || !party::is_enabled())
        return;
    const int active = party::active_slot();
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (slot == active)
            continue;
        const player& member = party::get_player(slot);
        // The only loaded monster grid is the departing floor.
        if (member.where_are_you != source.branch || member.depth != source.depth)
            continue;
        party::scoped_player_context context(slot);
        retrieve_on_departure();
    }
}
}
