#include "AppHdr.h"

#include "spl-kimjoy.h"

#include "attack.h"
#include "beam.h"
#include "colour.h"
#include "fight.h"
#include "god-conduct.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "shout.h"
#include "spl-monench.h"
#include "spl-util.h"
#include "target.h"
#include "terrain.h"
#include "view.h"
#include "viewchar.h"

int rootspike_constriction_damage(actor& caster, monster& target, int damage)
{
    const int poison = damage * 60 / 100;
    const int adjusted = damage - poison
                         + resist_adjust_damage(&target, BEAM_POISON, poison);
    if (adjusted > 0 && (adjusted < damage ? !one_chance_in(3) : one_chance_in(3)))
        poison_monster(&target, &caster);
    return adjusted;
}

spret cast_eringyas_rootspike(int power, coord_def target, bool fail)
{
    if (cell_is_invalid_target(target))
    {
        canned_msg(MSG_UNTHINKING_ACT);
        return spret::abort;
    }
    // Treat a party proxy like an empty square, including when it is hidden.
    monster* victim = party::player_at(target, false) ? nullptr : monster_at(target);
    if (!victim)
    {
        fail_check();
        canned_msg(MSG_SPELL_FIZZLES);
        return spret::success;
    }
    if (stop_attack_prompt(victim, false, you.pos()))
        return spret::abort;
    fail_check();

    god_conduct_trigger conducts[3];
    set_attack_conducts(conducts, *victim);
    noisy(spell_effect_noise(SPELL_ERINGYAS_ROOTSPIKE), target);
    const int raw = roll_dice(2, 10 + power / 8);
    // Kimjoy's root spikes resist 60% of their damage as poison. Keep
    // the remaining physical damage effective against poison-immune foes.
    const int poison = raw * 60 / 100;
    const int damage = raw - poison + resist_adjust_damage(victim, BEAM_POISON, poison);
    mprf("Poisonous roots strike %s%s", victim->name(DESC_THE).c_str(),
         attack_strength_punctuation(damage).c_str());
    flash_tile(target, LIGHTGREEN);
    if (damage == raw || coinflip())
        poison_monster(victim, &you, 1, true);
    victim->hurt(&you, damage, BEAM_MMISSILE);
    if (victim->alive())
    {
        const int duration = 4 + random2avg(div_rand_round(power, 10), 2);
        if (start_ranged_constriction(you, *victim, duration, CONSTRICT_ROOTS))
        {
            you.props[FASTROOT_POWER_KEY] = power;
            victim->props[ROOTSPIKE_CONSTRICTION_KEY] = true;
        }
    }
    return spret::success;
}

spret cast_olgrebs_last_mercy(int power, coord_def target, bool fail)
{
    if (cell_is_invalid_target(target))
    {
        canned_msg(MSG_UNTHINKING_ACT);
        return spret::abort;
    }
    monster* victim = party::player_at(target, false) ? nullptr : monster_at(target);
    if (!victim)
    {
        fail_check();
        canned_msg(MSG_SPELL_FIZZLES);
        return spret::success;
    }
    // A lethal strike can hit neighbours, so prompt for the possible blast
    // before committing the spell, regardless of its eventual damage roll.
    targeter_smite area(&you, LOS_RADIUS, 0, 1);
    area.set_aim(target);
    if (stop_attack_prompt(area, "detonate poison",
                           [](const actor*) { return true; }, nullptr,
                           nullptr, false, true))
        return spret::abort;
    fail_check();

    const mon_enchant poison = victim->get_ench(ENCH_POISON);
    if (poison.ench == ENCH_NONE || poison.degree <= 0)
    {
        canned_msg(MSG_SPELL_FIZZLES);
        return spret::success;
    }
    god_conduct_trigger conducts[3];
    set_attack_conducts(conducts, *victim);
    const dice_def dice = calc_dice(3, 36 + power * 18 / 100);
    int damage = 0;
    for (int i = 0; i < poison.degree; ++i)
        damage += dice.roll();
    const int max_hp = victim->max_hit_points;
    const string name = victim->name(DESC_THE);
    flash_tile(target, LIGHTGREEN);
    mprf("Poison erupts inside %s%s", name.c_str(),
         attack_strength_punctuation(damage).c_str());
    victim->hurt(&you, damage, BEAM_MMISSILE);
    if (victim->alive())
    {
        victim->del_ench(ENCH_POISON, true);
        behaviour_event(victim, ME_WHACK, &you);
    }
    else
    {
        bolt blast;
        blast.name = "burst of toxic energy";
        blast.flavour = BEAM_MMISSILE;
        blast.set_agent(&you);
        blast.colour = LIGHTGREEN;
        blast.glyph = dchar_glyph(DCHAR_EXPLOSION);
        blast.range = 1;
        blast.ex_size = 1;
        blast.is_explosion = true;
        blast.damage = calc_dice(4, max_hp * 2 + 6 + div_rand_round(power, 40));
        blast.source = blast.target = target;
        blast.hit = AUTOMATIC_HIT;
        blast.loudness = spell_effect_noise(SPELL_OLGREBS_LAST_MERCY);
        blast.explode();
    }
    return spret::success;
}
