#include "AppHdr.h"

#include "spl-rupture-blight.h"

#include "beam.h"
#include "cloud.h"
#include "message.h"
#include "mon-death.h"
#include "mon-ench.h"
#include "monster.h"
#include "ouch.h"
#include "player.h"
#include "random.h"

dice_def mana_rupture_damage(int will, int power)
{
    const int effective_will = will == WILL_INVULN ? 200 : min(200, max(0, will));
    return dice_def(6, div_rand_round(effective_will * (30 + max(0, power)), 1350));
}

bool mana_rupture_dismiss(monster& victim, const actor* agent)
{
    if (!victim.is_summoned())
        return false;
    simple_monster_message(victim, " loses its magical cohesion.");
    monster_die(victim, KILL_RESET, actor_to_death_source(agent));
    return true;
}

void mana_rupture_weaken(monster& victim, actor* agent)
{
    victim.strip_willpower(agent, 7 + random2(8));
}

void blight_monster(monster& victim, actor* agent, int power)
{
    const int hd = max(1, victim.get_experience_level());
    int drain = div_rand_round(max(0, power), 18);
    if (drain >= hd)
    {
        const coord_def where = victim.pos();
        simple_monster_message(victim, " disintegrates into miasma!");
        monster_die(victim, agent);
        place_cloud(CLOUD_MIASMA, where, 2 + random2avg(8, 2), agent);
        return;
    }
    const mon_enchant existing = victim.get_ench(ENCH_DRAINED);
    drain -= existing.degree;
    if (drain > 0)
        victim.add_ench(mon_enchant(ENCH_DRAINED, agent,
                                   max(existing.duration, 400 + random2(200)), drain));
    const int base = max(0, power) * 10 / (hd + 3);
    const int relative = base + random2(base);
    if (coinflip())
        victim.add_ench(mon_enchant(ENCH_SLOW, agent, relative + 10));
    else
        victim.add_ench(mon_enchant(ENCH_CONFUSION, agent,
                                   div_rand_round(relative, 3) + 10));
    const int resistance = victim.res_poison();
    if (resistance < 3)
        poison_monster(&victim, agent, resistance ? 2 : 4, true);
}

// Called in the target player's context by the bolt engine.
void blight_player(actor* agent, int power)
{
    drain_player(40 + random2(15), false, true);
    const int half_power = max(0, power) / 2;
    const int poison = 2 + half_power + random2(half_power);
    const int resistance = you.res_poison();
    if (resistance < 3)
        poison_player(resistance ? poison / 2 : poison,
                      agent ? agent->name(DESC_A, true) : "", "vile blight");
    if (coinflip())
        slow_player(10 + half_power + random2(half_power));
    else
        confuse_player(2 + random2(3));
}
