#include "AppHdr.h"

#include "mercenary.h"

#include <algorithm>
#include <array>

#include "item-def.h"
#include "item-prop-enum.h"
#include "mercenary-gift.h"
#include "mercenary-transit.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"

namespace mercenary
{
namespace
{
constexpr const char* ROLE_KEY = "mercenary_contract_role";
constexpr const char* NAME_KEY = "mercenary_name";
constexpr const char* START_KEY = "caravan_mercenary_pending";
constexpr const char* DONE_KEY = "caravan_mercenary_started";

const array<monster_type, 16> roles = {
    MONS_MERC_FIGHTER, MONS_MERC_KNIGHT, MONS_MERC_DEATH_KNIGHT,
    MONS_MERC_PALADIN, MONS_MERC_SKALD, MONS_MERC_INFUSER,
    MONS_MERC_TIDEHUNTER, MONS_MERC_WITCH, MONS_MERC_SORCERESS,
    MONS_MERC_ELEMENTALIST, MONS_MERC_BRIGAND, MONS_MERC_ASSASSIN,
    MONS_MERC_CLEANER, MONS_MERC_SHAMAN, MONS_MERC_SHAMAN_II,
    MONS_MERC_SHAMAN_III,
};
const array<monster_type, 5> starters = {
    MONS_MERC_FIGHTER, MONS_MERC_SKALD, MONS_MERC_WITCH,
    MONS_MERC_BRIGAND, MONS_MERC_SHAMAN,
};

monster* create_for_owner(monster_type type)
{
    if (!valid_role(type) || !you.on_current_level)
        return nullptr;
    // A starting or newly joined Caravan may be initialized in a scoped
    // player context without a normal party switch. Share the allocator both
    // before and after creation so simultaneous hires cannot reuse an MID.
    party::sync_monster_ids();
    mgen_data data(type, BEH_FRIENDLY, you.pos(), MHITNOT, MG_FORCE_BEH);
    monster* mon = create_monster(data, false);
    party::sync_monster_ids();
    if (!mon)
        return nullptr;
    if (const item_def* weapon = mon->mslot_item(MSLOT_WEAPON))
        mercenary::refresh_witch_spells(*mon, *weapon);
    register_mercenary(*mon, you);
    return mon;
}
}

bool valid_role(monster_type type)
{
    return find(roles.begin(), roles.end(), type) != roles.end();
}

bool is_contract(const item_def& item)
{
    return item.is_type(OBJ_MISCELLANY, MISC_MERCENARY_CONTRACT)
           && item.props.exists(ROLE_KEY)
           && valid_role(static_cast<monster_type>(item.props[ROLE_KEY].get_int()));
}

void make_contract(item_def& item, monster_type type)
{
    ASSERT(valid_role(type));
    item.props[ROLE_KEY] = static_cast<int>(type);
    item.props[NAME_KEY] = mons_class_name(type);
}

monster_type random_role()
{
    return random_choose_weighted(
        20, MONS_MERC_FIGHTER, 5, MONS_MERC_KNIGHT,
        1, MONS_MERC_DEATH_KNIGHT, 1, MONS_MERC_PALADIN,
        20, MONS_MERC_SKALD, 5, MONS_MERC_INFUSER,
        1, MONS_MERC_TIDEHUNTER, 20, MONS_MERC_WITCH,
        5, MONS_MERC_SORCERESS, 1, MONS_MERC_ELEMENTALIST,
        20, MONS_MERC_BRIGAND, 5, MONS_MERC_ASSASSIN,
        1, MONS_MERC_CLEANER, 20, MONS_MERC_SHAMAN,
        5, MONS_MERC_SHAMAN_II, 1, MONS_MERC_SHAMAN_III);
}

int contract_value(const item_def& item)
{
    if (!is_contract(item))
        return 0;
    return max(100, 50 * mons_class_hit_dice(
        static_cast<monster_type>(item.props[ROLE_KEY].get_int())));
}

bool recruit(const item_def& contract)
{
    if (!is_contract(contract))
        return false;
    monster* mon = create_for_owner(
        static_cast<monster_type>(contract.props[ROLE_KEY].get_int()));
    if (!mon)
    {
        mpr("There is no room for your mercenary to join you.");
        return false;
    }
    mprf("%s joins you as a mercenary.", mon->name(DESC_THE).c_str());
    return true;
}

bool ensure_starter_companion()
{
    if (you.props.exists(DONE_KEY))
        return true;
    if (!you.props.exists(START_KEY))
        you.props[START_KEY] = static_cast<int>(starters[random2(starters.size())]);
    const auto type = static_cast<monster_type>(you.props[START_KEY].get_int());
    monster* mon = create_for_owner(type);
    if (!mon)
        return false;
    you.props.erase(START_KEY);
    you.props[DONE_KEY] = true;
    mprf("%s joins your caravan.", mon->name(DESC_THE).c_str());
    return true;
}
}
