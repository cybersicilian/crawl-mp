#include "AppHdr.h"
#include "god-abil.h"

#include "areas.h"
#include "cloud.h"
#include "english.h"
#include "env.h"
#include "message.h"
#include "movement.h"
#include "player.h"
#include "target-dithmenos.h"
#include "terrain.h"
#include "traps.h"
#include "travel.h"

spret dithmenos_shadow_step(coord_def target, bool fail)
{
    // You can shadow-step anywhere within your umbra.
    ASSERT(you.umbra_radius() > -1);

    targeter_shadow_step tgt(&you, you.umbra_radius());
    if (!tgt.valid_aim(target) || !tgt.set_aim(target) || tgt.landing_site.origin())
    {
        mpr(tgt.why_not);
        return spret::abort;
    }

    // Check for hazards.
    bool zot_trap_prompted = false,
         trap_prompted = false,
         exclusion_prompted = false,
         cloud_prompted = false,
         terrain_prompted = false;

    for (auto site : tgt.additional_sites)
    {
        if (!cloud_prompted
            && !check_moveto_cloud(site, "shadow step", &cloud_prompted))
        {
            canned_msg(MSG_OK);
            return spret::abort;
        }

        if (!zot_trap_prompted)
        {
            if (env.grid(site) == DNGN_TRAP_ZOT)
            {
                if (!check_moveto_trap(site, "shadow step",
                                       &trap_prompted))
                {
                    canned_msg(MSG_OK);
                    return spret::abort;
                }
                zot_trap_prompted = true;
            }
            else if (!trap_prompted
                     && !check_moveto_trap(site, "shadow step",
                                           &trap_prompted))
            {
                canned_msg(MSG_OK);
                return spret::abort;
            }
        }

        if (!exclusion_prompted
            && !check_moveto_exclusion(site, "shadow step",
                                       &exclusion_prompted))
        {
            canned_msg(MSG_OK);
            return spret::abort;
        }

        if (!terrain_prompted
            && !check_moveto_terrain(site, "shadow step", "",
                                     &terrain_prompted))
        {
            canned_msg(MSG_OK);
            return spret::abort;
        }
    }

    fail_check();

    you.stop_being_constricted(false, "step");

    // XXX: This only ever fails if something's on the landing site;
    // perhaps this should be handled more gracefully.
    if (tgt.step_is_blocked || actor_at(tgt.landing_site))
    {
        mpr("Something blocks your shadow step.");
        return spret::success;
    }

    const actor *victim = actor_at(target);
    mprf("You step into %s shadow.",
         apostrophise(victim->name(DESC_THE)).c_str());
    you.move_to(tgt.landing_site, MV_DELIBERATE | MV_TRANSLOCATION);

    return spret::success;
}

int dithmenos_shadow_form_duration()
{
    const int power = you.skill(SK_INVOCATIONS, 2);
    return min(100, 20 + random2(power) + random2(power));
}
