#include "AppHdr.h"
#include "imus-prism.h"

#include "beam.h"
#include "colour.h"
#include "coordit.h"
#include "fight.h"
#include "viewchar.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-ench.h"
#include "mon-place.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "spl-cast.h"
#include "target.h"

bool imus_prism_can_dazzle(const monster& target)
{
    return target.res_blind() <= 1 && !party::player_at(target.pos());
}

spret cast_imus_prism(int power, const coord_def& where, bool fail)
{
    if (!in_bounds(where) || grid_distance(where, you.pos()) > 4
        || !you.see_cell(where) || !monster_habitable_grid(MONS_IMUS_PRISM, where))
    {
        mpr("You cannot create a prism there.");
        return spret::abort;
    }
    if (const player* companion = party::player_at(where))
    {
        if (you.can_see(*companion))
        {
            mpr("That space is already occupied.");
            return spret::abort;
        }
        fail_check();
        canned_msg(MSG_GHOSTLY_OUTLINE);
        return spret::success;
    }
    if (monster* occupant = monster_at(where))
    {
        if (you.can_see(*occupant))
        {
            mpr("That space is already occupied.");
            return spret::abort;
        }
        fail_check();
        canned_msg(MSG_GHOSTLY_OUTLINE);
        return spret::success;
    }
    targeter_smite area(&you, 4, 2, 2);
    if (!area.set_aim(where)
        || stop_attack_prompt(area, "dazzle creatures", [](const actor* target)
        {
            return target->is_monster()
                   && imus_prism_can_dazzle(*target->as_monster());
        }))
        return spret::abort;
    fail_check();
    mgen_data prism(MONS_IMUS_PRISM, BEH_FRIENDLY, where, MHITYOU,
                    MG_FORCE_BEH | MG_FORCE_PLACE, you.religion);
    prism.set_summoned(&you, SPELL_NO_SPELL, 0, false, false);
    prism.hd = max(1, div_rand_round(power, 10));
    if (create_monster(prism))
        mpr("You conjure a prism of dazzling light.");
    else
        canned_msg(MSG_NOTHING_HAPPENS);
    return spret::success;
}

void imus_prism_act(monster& prism)
{
    bolt flash;
    flash.name = "dazzling light";
    flash.flavour = BEAM_VISUAL;
    flash.set_agent(&prism);
    flash.colour = ETC_RANDOM;
    flash.glyph = dchar_glyph(DCHAR_EXPLOSION);
    flash.range = flash.ex_size = 2;
    flash.is_explosion = true;
    flash.source = flash.target = prism.pos();
    flash.hit = AUTOMATIC_HIT;
    flash.loudness = 0;
    flash.explode(true, true);

    for (radius_iterator ri(prism.pos(), 2, C_SQUARE, LOS_SOLID_SEE, true);
         ri; ++ri)
    {
        monster* target = monster_at(*ri);
        if (!target || target == &prism || !imus_prism_can_dazzle(*target))
            continue;
        simple_monster_message(*target, " is dazzled.");
        const int duration = (grid_distance(prism.pos(), *ri) + 2) * BASELINE_DELAY;
        target->add_ench(mon_enchant(ENCH_BLIND, &prism, duration, 1));
    }
    if (++prism.prism_charge >= 3)
    {
        simple_monster_message(prism, " shatters.", false, MSGCH_WARN);
        prism.suicide();
    }
    else
    {
        simple_monster_message(prism, " sparkles brightly.", false, MSGCH_WARN);
        prism.speed_increment -= BASELINE_DELAY;
    }
}
