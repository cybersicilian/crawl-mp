#include "AppHdr.h"

#include "neckbeard.h"

#include "cloud.h"
#include "env.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "movement.h"
#include "orb.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "spl-cast.h"
#include "state.h"
#include "target.h"
#include "terrain.h"

namespace neckbeard
{
coord_def landing(const coord_def& origin, const coord_def& foe)
{
    return foe + (foe - origin).sgn();
}

std::string blocked_reason()
{
    if (you.duration[DUR_BLINK_COOLDOWN])
        return "You are still too unstable to blink.";
    const string reason = you.no_tele_reason(true);
    if (!reason.empty())
        return reason;
    if (orb_limits_translocation())
        return "The Orb's influence prevents this precise translocation.";
    return "";
}

static bool valid_target(const coord_def& pos, bool preview)
{
    if (!in_bounds(pos) || !you.see_cell_no_trans(pos))
        return false;
    const monster* foe = monster_at(pos);
    if (!foe || !you.can_see(*foe) || foe->wont_attack() || foe->neutral()
        || party::is_proxy_monster(*foe) || foe->is_firewood())
        return false;
    const coord_def dest = landing(you.pos(), pos);
    if (!in_bounds(dest) || !you.see_cell_no_trans(dest) || cell_is_solid(dest)
        || party::player_at(dest) || you.get_beholder(dest) || you.get_fearmonger(dest))
        return false;
    const actor* occupant = actor_at(dest);
    return !occupant || (preview && !you.can_see(*occupant));
}

class step_preview final : public targeter_smite
{
public:
    step_preview() : targeter_smite(&you, LOS_RADIUS, 0, 0, true) {}

    bool valid_aim(coord_def pos) override
    {
        if (!targeter_smite::valid_aim(pos))
            return false;
        if (!valid_target(pos, true))
        {
            why_not = "No clear landing place behind that enemy.";
            return false;
        }
        return true;
    }

    aff_type is_affected(coord_def pos) override
    {
        if (!valid_aim(aim))
            return AFF_NO;
        return pos == landing(origin, aim) ? AFF_YES
             : pos == aim ? AFF_MAYBE : AFF_NO;
    }
};

std::unique_ptr<targeter> step_targeter()
{
    return make_unique<step_preview>();
}

spret step_behind(const coord_def& target)
{
    const string reason = blocked_reason();
    if (!reason.empty())
    {
        mpr(reason);
        return spret::abort;
    }
    if (!valid_target(target, false))
    {
        mpr("You cannot step behind that enemy.");
        return spret::abort;
    }
    const coord_def dest = landing(you.pos(), target);
    if (!check_moveto(dest, "blink", false, false) || cancel_harmful_move(false))
        return spret::abort;
    // The confirmation may yield to another party member's action.
    if (!blocked_reason().empty() || landing(you.pos(), target) != dest
        || !valid_target(target, false))
    {
        mpr("You cannot step behind that enemy anymore.");
        return spret::abort;
    }
    you.stop_being_constricted(false, "blink");
    place_cloud(CLOUD_TLOC_ENERGY, you.pos(), 1 + random2(3), &you);
    you.move_to(dest, MV_DELIBERATE | MV_TRANSLOCATION);
    you.increase_duration(DUR_BLINK_COOLDOWN, 5);
    crawl_state.cancel_cmd_again();
    crawl_state.cancel_cmd_repeat();
    return spret::success;
}
}
