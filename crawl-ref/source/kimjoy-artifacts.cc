#include "AppHdr.h"

#include "kimjoy-artifacts.h"

#include "actor.h"
#include "art-enum.h"
#include "message.h"
#include "mon-ench.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "spl-transloc.h"
#include "transform.h"

bool vipers_fang_virulence(actor* attacker, actor* defender, int damage)
{
    if (!attacker || !defender || damage <= 0 || !defender->alive()
        || !defender->is_monster())
        return false;
    monster* target = defender->as_monster();
    if (party::is_proxy_monster(*target))
        return false;
    const bool was_vulnerable = target->has_ench(ENCH_POISON_VULN);
    if (was_vulnerable)
        return false;
    if (!target->add_ench(mon_enchant(ENCH_POISON_VULN, attacker,
                                      random_range(20, 30) * BASELINE_DELAY)))
        return false;
    simple_monster_message(*target, " grows more vulnerable to poison.");
    return true;
}

bool golem_armour_complete(const player& wearer)
{
    return wearer.unrand_equipped(UNRAND_GOLEM_ARMOUR)
           && wearer.unrand_equipped(UNRAND_GOLEM_BOOTS)
           && wearer.unrand_equipped(UNRAND_GOLEM_GLOVES)
           && wearer.unrand_equipped(UNRAND_GOLEM_HELMET);
}

bool activate_golem_armour()
{
    if (!golem_armour_complete(you))
        return false;
    return transform(0, transformation::golem);
}

void deactivate_golem_armour()
{
    if (you.form == transformation::golem)
        untransform();
}

void unseen_dragon_after_damage(int damage)
{
    if (damage <= 0 || !you.alive()
        || !you.unrand_equipped(UNRAND_UNSEEN_DRAGON)
        || !invis_allowed(true) || !one_chance_in(4))
        return;
    const int duration = 10 + random2(5);
    if (!you.duration[DUR_INVIS])
    {
        mpr("The scales of the Unseen Dragon turn transparent around you!");
        you.increase_duration(DUR_INVIS, duration, 100);
        contaminate_player(duration * 40 + random2(duration * 40));
    }
    else
    {
        mpr("The scales of the Unseen Dragon sustain your invisibility.");
        you.increase_duration(DUR_INVIS, duration / 2, 100);
        contaminate_player(duration * 20 + random2(duration * 20));
    }
}

void distortion_gauntlets_after_damage(int damage)
{
    if (damage <= 1 || !you.alive() || you.hp_max <= 0
        || !you.unrand_equipped(UNRAND_GAUNTLETS_DISTORTION))
        return;
    if (x_chance_in_y(damage, you.hp_max))
        uncontrolled_blink(true);
}
