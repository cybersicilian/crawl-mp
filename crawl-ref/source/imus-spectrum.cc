#include "AppHdr.h"

#include "imus-spectrum.h"

#include "beam.h"
#include "fight.h"
#include "icicle-burst.h"
#include "message.h"
#include "player.h"
#include "random.h"
#include "religion.h"
#include "skills.h"
#include "spl-util.h"
#include "spl-zap.h"

namespace
{
// The chosen aim must be visible, but a ray endpoint can be behind a wall.
class spectrum_ray_targeter : public targeter_beam
{
public:
    spectrum_ray_targeter(const actor* caster, int range)
        : targeter_beam(caster, range, ZAP_DEBUGGING_RAY, SPELL_NO_SPELL,
                        0, 0, 0) {}
    bool can_affect_unseen() override { return true; }
};
}

imus_spectrum_targeter::imus_spectrum_targeter(const actor* caster, int radius,
                                               const bolt& prototype)
    : range(radius), projectiles{prototype}, geometry(caster, 20, radius)
{
    agent = caster;
    origin = aim = caster->pos();
}

void imus_spectrum_targeter::add_projectile(const bolt& projectile)
{
    projectiles.push_back(projectile);
}

bool imus_spectrum_targeter::valid_aim(coord_def where)
{
    return geometry.valid_aim(where);
}

bool imus_spectrum_targeter::set_aim(coord_def where)
{
    ends.clear();
    beams.clear();
    if (!geometry.set_aim(where) || !targeter::set_aim(where))
        return false;
    for (size_t i = 0; i < geometry.rays.size(); ++i)
    {
        ray_def ray = geometry.rays[i];
        for (int step = 0; step < range; ++step)
            ray.advance();
        const coord_def endpoint = i == geometry.rays.size() / 2 ? where : ray.pos();
        ends.push_back(endpoint);
    }
    for (const bolt& projectile : projectiles)
        for (const coord_def& endpoint : ends)
        {
            auto beam = make_unique<spectrum_ray_targeter>(agent, range);
            bolt ray_bolt = projectile;
            ray_bolt.chose_ray = false;
            beam->set_projectile(ray_bolt);
            if (!beam->set_aim(endpoint))
                return false;
            beams.push_back(std::move(beam));
        }
    return true;
}

aff_type imus_spectrum_targeter::is_affected(coord_def where)
{
    aff_type affected = AFF_NO;
    for (const auto& beam : beams)
        affected = max(affected, beam->is_affected(where));
    return affected;
}

bolt imus_spectrum_spell_projectile(spell_type spell, int power, int range)
{
    bolt beam;
    beam.set_agent(&you);
    beam.source = you.pos();
    beam.range = range;
    beam.origin_spell = spell;
    zappy(spell_to_zap(spell), power, false, beam);
    return beam;
}

void imus_spectrum_trace_side_rays(const bolt& projectile,
                                   const imus_spectrum_targeter& preview,
                                   player_beam_tracer& tracer)
{
    for (size_t ray = 0; ray < preview.endpoints().size(); ++ray)
    {
        if (ray == preview.endpoints().size() / 2)
            continue;
        bolt side = projectile;
        side.target = preview.endpoints()[ray];
        side.chose_ray = false;
        // Only the actual central projectile owns and drops the item.
        side.drop_item = false;
        side.fire(tracer);
    }
}

bool imus_spectrum_spell(spell_type spell)
{
    const zap_type zap = spell_to_zap(spell);
    return zap != NUM_ZAPS && !zap_explodes(zap)
           && !zap_is_enchantment(zap) && spell != SPELL_DIG;
}

bool imus_spectrum_active()
{
    return you.duration[DUR_IMUS_SPECTRUM]
           && in_good_standing(GOD_IMUS_THEA);
}

void imus_spectrum_activate()
{
    const int power = 11 + you.skill(SK_INVOCATIONS, 7);
    you.increase_duration(DUR_IMUS_SPECTRUM, 8 + roll_dice(2, power), 100);
    mpr("Your projectiles shimmer with a prismatic spectrum.");
}

spret imus_spectrum_zap(spell_type spell, int power, bolt& beam, bool fail)
{
    bolt prototype = imus_spectrum_spell_projectile(spell, power, beam.range);
    imus_spectrum_targeter preview(&you, beam.range, prototype);
    if (!preview.set_aim(beam.target))
        return spret::abort;
    player_beam_tracer tracer;
    for (const coord_def& end : preview.endpoints())
    {
        bolt traced = prototype;
        traced.target = end;
        traced.chose_ray = false;
        fire_partial_player_tracer(spell_to_zap(spell), power, tracer, traced);
    }
    if (cancel_beam_prompt(prototype, tracer))
        return spret::abort;
    fail_check();
    for (const coord_def& end : preview.endpoints())
    {
        bolt shard = prototype;
        shard.target = end;
        shard.chose_ray = false;
        shard.fire();
    }
    return spret::success;
}
