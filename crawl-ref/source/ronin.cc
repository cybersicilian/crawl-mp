#include "AppHdr.h"

#include "ronin.h"

#include "god-abil.h"
#include "player.h"
#include "religion.h"

bool ronin_first_faith()
{
    return you.char_class == JOB_RONIN && had_gods() == 0;
}

void apply_ronin_first_faith()
{
    if (!ronin_first_faith())
        return;
    if (you_worship(GOD_RU))
        you.props[RU_SACRIFICE_DELAY_KEY] =
            you.props[RU_SACRIFICE_DELAY_KEY].get_int() / 2;
    else if (you_worship(GOD_USKAYAW))
        gain_piety(15, 1, false);
    else
        gain_piety(20, 1, false);
}
