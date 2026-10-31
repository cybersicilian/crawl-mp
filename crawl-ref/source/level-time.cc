#include "AppHdr.h"
#include "level-time.h"

#include "env.h"
#include "monster.h"
#include "mon-lurk.h"
#include "party.h"
#include "player.h"

namespace
{
const char* const entity_clock_key = "multiplayer_entity_clock";

void initialize_clock(monster& entity)
{
    if (!entity.props.exists(entity_clock_key))
        entity.props[entity_clock_key] = env.elapsed_time;
}
}

int level_elapsed_time()
{
    return party::multiplayer_enabled() ? env.elapsed_time : you.elapsed_time;
}

void prepare_level_entity_clocks()
{
    if (!party::multiplayer_enabled())
        return;
    for (auto& entity : env.mons)
        if (entity.alive())
            initialize_clock(entity);
    for (auto& lurker : env.lurkers)
        initialize_clock(lurker.mon.mons);
}

int level_elapsed_time(const monster& entity)
{
    if (!party::multiplayer_enabled())
        return level_elapsed_time();
    // Reads never mutate an entity, including native inspection projections.
    return entity.props.exists(entity_clock_key)
        ? entity.props[entity_clock_key].get_int() : env.elapsed_time;
}

void advance_level_entity_clock(monster& entity, int delta)
{
    if (!party::multiplayer_enabled() || delta <= 0)
        return;
    initialize_clock(entity);
    entity.props[entity_clock_key] = level_elapsed_time(entity) + delta;
}
