#include "AppHdr.h"
#include "false-image.h"

#include "message.h"
#include "mgen-data.h"
#include "mon-place.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "spl-cast.h"
#include "spl-util.h"

spret cast_false_image(int power, const coord_def& where, god_type god, bool fail)
{
    if (!in_bounds(where) || grid_distance(where, you.pos()) > spell_range(SPELL_FALSE_IMAGE, &you, power))
    {
        mpr("That's too far away.");
        return spret::abort;
    }
    if (!monster_habitable_grid(MONS_FALSE_IMAGE, where))
    {
        mpr("You can't cast it there.");
        return spret::abort;
    }
    if (const player* companion = party::player_at(where, false))
    {
        if (you.can_see(*companion))
        {
            mpr("That space is already occupied.");
            return spret::abort;
        }
        // Match an unseen monster so an unseen party member is not disclosed.
        fail_check();
        mpr("Something you can't see is blocking your illusion!");
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
        mpr("Something you can't see is blocking your illusion!");
        return spret::success;
    }
    fail_check();
    mgen_data image(MONS_FALSE_IMAGE, BEH_FRIENDLY, where, MHITYOU,
                    MG_FORCE_BEH | MG_FORCE_PLACE | MG_AUTOFOE, god);
    image.set_summoned(&you, SPELL_FALSE_IMAGE, 2);
    image.hd = max(1, div_rand_round(power, 10));
    if (create_monster(image))
        mpr("You stand beside yourself.");
    else
        canned_msg(MSG_NOTHING_HAPPENS);
    return spret::success;
}
