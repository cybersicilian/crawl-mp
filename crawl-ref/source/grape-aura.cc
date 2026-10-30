#include "AppHdr.h"
#include "grape-aura.h"

#include "act-iter.h"
#include "env.h"
#include "grape-monster.h"
#include "grape-player.h"
#include "item-def.h"
#include "losglobal.h"
#include "message.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"

namespace grape_aura
{
namespace
{
const char* const clock_key = "grape_aura_countdown";

bool in_field(const coord_def& pos)
{
    if (!in_bounds(pos))
        return false;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_INTERDIMENSIONAL_GRAPE
            && grid_distance(mi->pos(), pos) <= radius
            && cell_see_cell(mi->pos(), pos, LOS_DEFAULT))
        {
            return true;
        }
    return false;
}

bool relevant()
{
    for (monster_iterator mi; mi; ++mi)
    {
        if (mi->type == MONS_INTERDIMENSIONAL_GRAPE
            || grape_monster::suppressed(**mi, MSLOT_ARMOUR)
            || grape_monster::suppressed(**mi, MSLOT_SHIELD)
            || grape_monster::suppressed(**mi, MSLOT_AUX_ARMOUR))
        {
            return true;
        }
    }
    if (!party::is_enabled())
        return grape_player::affected();
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (!party::slot_is_alive(slot) || !party::slot_is_on_current_floor(slot))
            continue;
        party::scoped_player_context context(slot, true);
        if (grape_player::affected())
            return true;
    }
    return false;
}

void affect_player()
{
    if (in_field(you.pos()))
        grape_player::suppress_one();
    else
        grape_player::restore_one();
}

void pulse()
{
    if (party::is_enabled())
    {
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            if (!party::slot_is_alive(slot)
                || !party::slot_is_on_current_floor(slot))
            {
                continue;
            }
            party::scoped_player_context context(slot, true);
            affect_player();
        }
    }
    else
        affect_player();

    for (monster_iterator mi; mi; ++mi)
    {
        if (party::is_proxy_monster(**mi))
            continue;
        static const mon_inv_type slots[] =
            { MSLOT_ARMOUR, MSLOT_SHIELD, MSLOT_AUX_ARMOUR };
        const int slot_count = mi->mslot_item(MSLOT_AUX_ARMOUR) ? 3 : 2;
        const mon_inv_type slot = slots[random2(slot_count)];
        const item_def* item = mi->mslot_item(slot);
        const bool in_aura = in_field(mi->pos());
        const bool changed = in_aura ? grape_monster::suppress(**mi, slot)
                                     : grape_monster::restore(**mi, slot);
        if (changed && item && you.can_see(**mi))
            mprf("%s %s %s.", item->name(DESC_THE).c_str(),
                 in_aura ? "melds into" : "unmelds from",
                 mi->name(DESC_THE).c_str());
    }
}
}

bool exposed(const coord_def& pos)
{
    return in_field(pos);
}

void advance_clock(int delta, int& remaining,
                   const std::function<int()>& next_interval,
                   const std::function<void()>& tick)
{
    if (delta <= 0)
        return;
    if (remaining <= 0)
        remaining = next_interval();
    ASSERT(remaining > 0);
    while (delta >= remaining)
    {
        delta -= remaining;
        tick();
        remaining = next_interval();
        ASSERT(remaining > 0);
    }
    remaining -= delta;
}

void advance(int floor_delta)
{
    if (floor_delta <= 0)
        return;
    if (!relevant())
    {
        env.properties.erase(clock_key);
        return;
    }
    int remaining = env.properties.exists(clock_key)
        ? env.properties[clock_key].get_int() : 0;
    advance_clock(floor_delta, remaining, [] { return random_range(100, 300); },
                  [] { pulse(); });
    env.properties[clock_key] = remaining;
}
}
