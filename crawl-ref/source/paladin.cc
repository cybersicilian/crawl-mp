#include "AppHdr.h"
#include "paladin.h"

#include "message.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "spl-cast.h"

namespace paladin
{
bool can_intervene(bool quiet)
{
    if (!you.props.exists("paladin_aura") || !you_worship(GOD_SHINING_ONE)
        || player_under_penance())
    {
        if (!quiet)
            mpr("The Shining One does not answer your call.");
        return false;
    }
    if (you.duration[DUR_PALADIN_INTERVENE_COOLDOWN])
    {
        if (!quiet)
            mpr("You must recover before laying on hands again.");
        return false;
    }
    return true;
}

spret intervene(bool fail)
{
    if (!can_intervene())
        return spret::abort;
    fail_check();

    const int skill = you.skill(SK_INVOCATIONS);
    const int turns = 5 + skill / 3;
    const int healing = 6 + skill / 2 + random2(5);
    const int ally_slot = party::nearest_living_ally_slot(
        you.pos(), 3, party::active_slot(), true);
    if (ally_slot >= 0)
    {
        party::heal_or_buff_party_member(ally_slot, healing, DUR_AEGIS_LINK, turns);
        party::get_player(ally_slot).redraw_armour_class = true;
        mprf(MSGCH_FRIEND_ACTION, "Your intervention wards %s!",
             party::get_player(ally_slot).your_name.c_str());
    }
    if (!you.duration[DUR_DEATHS_DOOR])
        inc_hp(ally_slot >= 0 ? healing / 2 : healing);
    you.set_duration(DUR_AEGIS_LINK,
                     max(turns, you.duration[DUR_AEGIS_LINK] / BASELINE_DELAY), 90);
    you.set_duration(DUR_PALADIN_INTERVENE_COOLDOWN, 30);
    you.redraw_armour_class = true;
    you.redraw_status_lights = true;
    mprf(MSGCH_DURATION, "You lay on hands and raise a protective aegis!");
    return spret::success;
}
}
