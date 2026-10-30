#include "AppHdr.h"

#include "mercenary-transit.h"

#include <vector>

#include "actor.h"
#include "god-companions.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-other.h"

namespace
{
constexpr const char* MERCENARY_KEY = "mercenary";
constexpr const char* MERCENARY_OWNER_KEY = "mercenary_owner_mid";
}

bool is_hired_mercenary(const monster& mon)
{
    return mon.props.exists(MERCENARY_KEY)
           && mon.props[MERCENARY_KEY].get_bool()
           && mon.props.exists(MERCENARY_OWNER_KEY);
}

bool mercenary_owned_by(const monster& mon, const actor& owner)
{
    return owner.is_player() && is_hired_mercenary(mon)
           && mon.props[MERCENARY_OWNER_KEY].get_int()
                  == static_cast<int>(owner.mid);
}

void register_mercenary(monster& mon, const actor& owner)
{
    ASSERT(mon.alive());
    ASSERT(owner.is_player());
    mon.props[MERCENARY_KEY] = true;
    mon.props[MERCENARY_OWNER_KEY] = static_cast<int>(owner.mid);
    add_companion(&mon);
}

bool recall_owned_mercenaries(const actor& owner)
{
    // try_recall and off-level placement use the active player's position.
    if (!owner.is_player() || owner.mid != you.mid)
        return false;
    // Recall can place monsters and update companion records; avoid iterating
    // the registry while making those changes.
    vector<mid_t> mids;
    for (const auto& entry : companion_list)
    {
        const monster& saved = entry.second.mons.mons;
        if (saved.alive() && saved.friendly()
            && mercenary_owned_by(saved, owner))
            mids.push_back(entry.first);
    }

    bool recalled = false;
    for (mid_t mid : mids)
    {
        if (companion_is_elsewhere(mid, true))
            recalled |= recall_offlevel_ally(mid);
        else if (const monster* current = monster_by_mid(mid))
        {
            if (current->alive() && current->friendly()
                && mercenary_owned_by(*current, owner))
                recalled |= try_recall(mid);
        }
    }
    return recalled;
}
