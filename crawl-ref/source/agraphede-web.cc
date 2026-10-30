#include "AppHdr.h"

#include "agraphede-web.h"

#include "mgen-data.h"
#include "mon-movetarget.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "random.h"
#include "spl-summoning.h"

namespace agra_web
{
bool summon(int power, int count)
{
    if (count <= 0 || !player_summon_check(MONS_AGRAPHEDE_WEB_BALL))
        return false;

    mgen_data data(MONS_AGRAPHEDE_WEB_BALL, BEH_COPY, you.pos(),
                   MHITNOT, MG_AUTOFOE);
    data.hd = 5 + div_rand_round(max(0, power), 20);
    data.set_summoned(&you, SPELL_NO_SPELL, random_range(40, 70), false, false);
    bool created = false;
    for (int i = 0; i < min(count, 4); ++i)
        if (monster* ball = create_monster(data))
        {
            created = true;
            if (!(ball->get_foe() && ball->get_foe()->is_monster()))
                set_random_target(ball);
        }
    return created;
}
}
