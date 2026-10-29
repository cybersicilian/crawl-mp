#include "AppHdr.h"

#include "spl-shackle.h"

#include "fight.h"
#include "god-conduct.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-cast.h"
#include "terrain.h"

bool shackle_monster(monster& target, const actor* caster, int power)
{
    if (mons_is_slime(target) || target.is_insubstantial())
        return false;
    const int duration = max(BASELINE_DELAY, (power + 1) * BASELINE_DELAY / 3);
    target.add_ench(mon_enchant(ENCH_SHACKLE, caster, duration));
    return true;
}

spret cast_shackle(int power, const coord_def& where, bool fail)
{
    if (cell_is_invalid_target(where))
    {
        canned_msg(MSG_UNTHINKING_ACT);
        return spret::abort;
    }
    // Party members also have monster proxies. Treat their square like an
    // empty one so they cannot be shackled or exposed by a proxy prompt.
    monster* target = party::player_at(where, false) ? nullptr : monster_at(where);
    if (target && stop_attack_prompt(target, false, you.pos()))
        return spret::abort;
    fail_check();
    if (!target)
    {
        mpr("Nothing happens.");
        return spret::success;
    }
    god_conduct_trigger conducts[3];
    set_attack_conducts(conducts, *target);
    behaviour_event(target, ME_WHACK, &you);
    if (mons_is_slime(*target) || target->is_insubstantial())
        simple_monster_message(*target, " is unaffected.");
    else if (target->check_willpower(&you, power) > 0)
        simple_monster_message(*target, " resists.");
    else if (shackle_monster(*target, &you, power))
        simple_monster_message(*target, " is shackled.");
    if (!you.can_see(*target))
        mpr("Nothing happens.");
    return spret::success;
}
