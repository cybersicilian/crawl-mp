#include "AppHdr.h"

#include "icicle-burst.h"

#include <cmath>

#include "beam.h"
#include "env.h"
#include "fight.h"
#include "los.h"
#include "losglobal.h"
#include "message.h"
#include "player.h"
#include "random.h"
#include "shout.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "view.h"

int icicle_burst_count(int power)
{
    return 3 + (max(0, power) + 6) / 13;
}

icicle_burst_targeter::icicle_burst_targeter(const actor* caster, int power,
                                             int radius)
    : range(radius)
{
    ASSERT(caster);
    agent = caster;
    origin = caster->pos();
    aim = origin;
    rays.resize(icicle_burst_count(power));
}

bool icicle_burst_targeter::valid_aim(coord_def where)
{
    if (where == origin || (origin - where).rdist() > range)
    {
        why_not = "Out of range.";
        return false;
    }
    if (!cell_see_cell(origin, where, LOS_NO_TRANS))
    {
        why_not = agent->see_cell(where) ? "There's something in the way."
                                         : "You cannot see that place.";
        return false;
    }
    return true;
}

bool icicle_burst_targeter::set_aim(coord_def where)
{
    zapped.clear();
    if (!valid_aim(where) || !targeter::set_aim(where))
        return false;

    ray_def base;
    if (!find_ray(origin, where, base, opc_solid_see))
        base = ray_def(geom::ray(origin.x + 0.5, origin.y + 0.5,
                                 where.x - origin.x, where.y - origin.y));
    const double spread_range = (rays.size() - 1) * PI / 40.0;
    for (size_t i = 0; i < rays.size(); ++i)
    {
        const double spread = -spread_range / 2.0
                              + spread_range * i / (rays.size() - 1);
        ray_def& ray = rays[i];
        ray = ray_def();
        ray.r.start = base.r.start;
        ray.r.dir.x = base.r.dir.x * cos(spread) + base.r.dir.y * sin(spread);
        ray.r.dir.y = -base.r.dir.x * sin(spread) + base.r.dir.y * cos(spread);
        ray_def trace = ray;
        coord_def cell = trace.pos();
        while ((origin - cell).rdist() <= range && map_bounds(cell)
               && opc_solid_see(cell) < OPC_OPAQUE)
        {
            if (cell != origin)
                ++zapped[cell];
            trace.advance();
            cell = trace.pos();
        }
    }
    return true;
}

aff_type icicle_burst_targeter::is_affected(coord_def where)
{
    auto found = zapped.find(where);
    if (found == zapped.end())
        return AFF_NO;
    return found->second == static_cast<int>(rays.size()) ? AFF_YES : AFF_MAYBE;
}

spret cast_icicle_burst(int power, coord_def target, bool fail)
{
    const int range = spell_range(SPELL_ICICLE_BURST, &you, power);
    icicle_burst_targeter hitfunc(&you, power, range);
    if (!hitfunc.set_aim(target)
        || stop_attack_prompt(hitfunc, "fire a burst of icicles"))
        return spret::abort;
    fail_check();

    bolt beam;
    beam.set_agent(&you);
    beam.source = you.pos();
    beam.range = range;
    zappy(ZAP_THROW_ICICLE, power, false, beam);
    beam.origin_spell = SPELL_ICICLE_BURST;
    beam.damage = dice_def(2, 8 + div_rand_round(power, 10));
    beam.hit = 5;
    beam.aux_source = beam.name;
    beam.draw_delay = 0;
    noisy(spell_effect_noise(SPELL_ICICLE_BURST), you.pos());
    mpr("You unleash a burst of icicles!");

    vector<int> pellets(hitfunc.rays.size());
    for (size_t i = 0; i < pellets.size(); ++i)
        ++pellets[random2avg(pellets.size(), 3)];
    for (size_t i = 0; i < pellets.size(); ++i)
    {
        ray_def ray = hitfunc.rays[i];
        for (int step = 0; step < range; ++step)
            ray.advance();
        for (int shot = 0; shot < pellets[i]; ++shot)
        {
            bolt shard = beam;
            shard.target = ray.pos();
            shard.fire();
            scaled_delay(5);
        }
    }
    return spret::success;
}
