#include "AppHdr.h"
#include "account-start.h"

#include "coordit.h"
#include "env.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "stringutil.h"
#include "terrain.h"

namespace account_start
{
namespace
{
bool receives_acquirement_scrolls(int slot)
{
    // Never infer an account from a character name or the party's host.
    const string key = make_stringf("CRAWL_ACCOUNT_%d", slot);
    const char* account = getenv(key.c_str());
    const auto& member = party::get_player(slot);
    return account && lowercase_string(account) == "rogue"
           && (member.species == SP_OOZLE
               || lowercase_string(party::starting_name(slot)) == "tav");
}

void place_jiyva_altar(const coord_def& start)
{
    for (adjacent_iterator cell(start); cell; ++cell)
        if (in_bounds(*cell) && env.grid(*cell) == DNGN_ALTAR_JIYVA)
            return;

    // Prefer existing floor. A cramped entrance can instead gain a one-cell
    // alcove in ordinary rock, preserving stairs, doors and other features.
    for (const auto terrain : { DNGN_FLOOR, DNGN_ROCK_WALL })
        for (adjacent_iterator cell(start); cell; ++cell)
            if (in_bounds(*cell) && env.grid(*cell) == terrain)
            {
                dungeon_terrain_changed(*cell, DNGN_ALTAR_JIYVA, false, true);
                return;
            }
}
}

void give_items()
{
    if (receives_acquirement_scrolls(party::active_slot()))
        newgame_make_item(OBJ_SCROLLS, SCR_ACQUIREMENT, 2);
}

void place_features()
{
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        const auto& member = party::get_player(slot);
        if (member.species == SP_OOZLE && in_bounds(member.pos())
            && member.where_are_you == you.where_are_you && member.depth == you.depth)
        {
            place_jiyva_altar(member.pos());
        }
    }
}
}
