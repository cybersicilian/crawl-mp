#include "AppHdr.h"

#include "corpse-knockback.h"

#include "actor.h"
#include "beam-type.h"
#include "env.h"
#include "items.h"
#include "kill-method-type.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "terrain.h"

void corpse_knockback::launch(item_def& corpse, actor& attacker,
                              const coord_def& origin, int distance, int damage)
{
    if (!corpse.is_type(OBJ_CORPSES, CORPSE_BODY) || distance <= 0)
        return;
    const coord_def start = item_pos(corpse);
    if (!in_bounds(start))
        return;
    const coord_def delta(start.x == origin.x ? 0 : start.x > origin.x ? 1 : -1,
                          start.y == origin.y ? 0 : start.y > origin.y ? 1 : -1);
    if (delta == coord_def(0, 0))
        return;

    coord_def dest = start;
    actor* struck = nullptr;
    for (int i = 0; i < distance; ++i)
    {
        const coord_def next = dest + delta;
        if (!in_bounds(next) || cell_is_solid(next)
            || feat_eliminates_items(env.grid(next)))
        {
            break;
        }
        if ((struck = actor_at(next)))
            break;
        dest = next;
    }

    const string corpse_name = corpse.name(DESC_THE);
    const bool seen = you.see_cell(start);
    if (dest != start)
    {
        int index = corpse.index();
        if (!move_item_to_grid(&index, dest, true) || index == NON_ITEM)
            return;
        if (seen)
            mprf("%s is knocked away!", corpse_name.c_str());
    }
    if (!struck || !struck->alive())
        return;
    if (struck->is_monster()
        && !party::is_proxy_monster(*struck->as_monster())
        && (struck->attitude() == ATT_FRIENDLY
            || struck->attitude() == ATT_GOOD_NEUTRAL))
    {
        return;
    }
    if (!could_harm(&attacker, struck))
        return;

    if (seen && you.can_see(*struck))
        mprf("%s collides with %s!", corpse_name.c_str(),
             struck->name(DESC_THE).c_str());
    if (struck->is_monster())
        behaviour_event(struck->as_monster(), ME_WHACK, &attacker);
    const string target_name = struck->name(DESC_A, true);
    const int collision_damage = struck->apply_ac(max(0, damage));
    struck->hurt(&attacker, collision_damage, BEAM_MISSILE, KILLED_BY_COLLISION,
                 target_name, corpse_name);
    if (collision_damage && struck->is_monster() && struck->alive())
        print_wounds(*struck->as_monster());
}
