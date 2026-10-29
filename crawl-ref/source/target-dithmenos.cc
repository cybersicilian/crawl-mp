#include "AppHdr.h"
#include "target-dithmenos.h"

#include "coordit.h"
#include "directn.h"
#include "env.h"
#include "libutil.h"
#include "losglobal.h"
#include "los-def.h"
#include "mon-util.h"
#include "player.h"
#include "ray.h"
#include "terrain.h"

#define notify_fail(x) (why_not = (x), false)

targeter_shadow_step::targeter_shadow_step(const actor* act, int r) :
    range(r)
{
    ASSERT(act);
    agent = act;
    origin = act->pos();
    step_is_blocked = false;
}

bool targeter_shadow_step::valid_aim(coord_def a)
{
    ray_def ray;

    if (origin == a)
        return notify_fail("You cannot target yourself.");
    else if ((origin - a).rdist() > range)
        return notify_fail("Out of range.");
    else if (!cell_see_cell(origin, a, LOS_NO_TRANS))
    {
        if (agent->see_cell(a))
            return notify_fail("There's something in the way.");
        else
            return notify_fail("You cannot see that place.");
    }
    else if (cell_is_solid(a))
        return notify_fail("There's something in the way.");
    else if (!find_ray(agent->pos(), a, ray, opc_solid_see))
        return notify_fail("There's something in the way.");
    else if (!has_additional_sites(a))
    {
        switch (no_landing_reason)
        {
        case shadow_step_blocked::move:
        case shadow_step_blocked::occupied:
            return notify_fail("There is no safe place near that"
                               " location.");
        case shadow_step_blocked::path:
            return notify_fail("There's something in the way.");
        case shadow_step_blocked::no_target:
            return notify_fail("There isn't a shadow there.");
        case shadow_step_blocked::none:
            die("buggy no_landing_reason");
        }
    }
    return true;
}

bool targeter_shadow_step::valid_landing(coord_def a, bool check_invis)
{
    actor *act;
    ray_def ray;

    if (!agent->is_habitable(a))
    {
        blocked_landing_reason = shadow_step_blocked::move;
        return false;
    }
    if (agent->is_player())
    {
        monster* beholder = you.get_beholder(a);
        if (beholder)
        {
            blocked_landing_reason = shadow_step_blocked::move;
            return false;
        }

        monster* fearmonger = you.get_fearmonger(a);
        if (fearmonger)
        {
            blocked_landing_reason = shadow_step_blocked::move;
            return false;
        }
    }
    if (!find_ray(agent->pos(), a, ray, opc_solid_see))
    {
        blocked_landing_reason = shadow_step_blocked::path;
        return false;
    }

    // Check if a landing site is invalid due to a visible monster obstructing
    // the path.
    ray.advance();
    while (map_bounds(ray.pos()))
    {
        act = actor_at(ray.pos());
        if (ray.pos() == a)
        {
            if (act && (!check_invis || agent->can_see(*act)))
            {
                blocked_landing_reason = shadow_step_blocked::occupied;
                return false;
            }
            break;
        }
        ray.advance();
    }
    return true;
}

aff_type targeter_shadow_step::is_affected(coord_def loc)
{
    aff_type aff = AFF_NO;

    if (loc == aim)
        aff = AFF_YES;
    else if (additional_sites.count(loc))
        aff = AFF_LANDING;
    return aff;
}

// If something unseen either occupies the aim position or blocks the
// shadow_step path, indicate that with step_is_blocked, but still return true
// so long there is at least one valid landing position from the player's
// perspective.
bool targeter_shadow_step::set_aim(coord_def a)
{
    if (a == origin)
        return false;
    if (!targeter::set_aim(a))
        return false;

    step_is_blocked = false;

    // Find our set of landing sites, choose one at random to be the
    // destination and see if it's actually blocked.
    set_additional_sites(aim);
    if (additional_sites.size())
    {
        auto it = random_iterator(additional_sites);
        landing_site = *it;
        if (!valid_landing(landing_site, false))
            step_is_blocked = true;
        return true;
    }
    return false;
}

// Determine the set of valid landing sites
void targeter_shadow_step::set_additional_sites(coord_def a)
{
    get_additional_sites(a);
    additional_sites = temp_sites;
}

// Determine the set of valid landing sites for the target, putting the results
// in the private set variable temp_sites. This uses valid_aim(), so it looks
// for uninhabited squares that are habitable by the player, but doesn't check
// against e.g. harmful clouds
void targeter_shadow_step::get_additional_sites(coord_def a)
{
    bool agent_adjacent = grid_distance(a, agent->pos()) == 1;
    temp_sites.clear();

    const actor *victim = actor_at(a);
    if (!victim || !victim->as_monster()
        || victim->is_firewood()
        || victim->as_monster()->friendly()
        || !agent->can_see(*victim)
        || !victim->umbraed())
    {
        no_landing_reason = shadow_step_blocked::no_target;
        return;
    }

    no_landing_reason = shadow_step_blocked::none;
    for (adjacent_iterator ai(a, false); ai; ++ai)
    {
        // See if site is valid, record a putative reason for why no sites were
        // found.
        if (!agent_adjacent || grid_distance(agent->pos(), *ai) > 1)
        {
            if (valid_landing(*ai))
            {
                temp_sites.insert(*ai);
                no_landing_reason = shadow_step_blocked::none;
            }
            else
                no_landing_reason = blocked_landing_reason;
        }
    }
}

// See if we can find at least one valid landing position for the given monster.
bool targeter_shadow_step::has_additional_sites(coord_def a)
{
    get_additional_sites(a);
    return temp_sites.size();
}

