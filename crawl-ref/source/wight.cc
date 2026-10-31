#include "AppHdr.h"
#include "wight.h"

#include "actor.h"
#include "god-passive.h"
#include "item-prop.h"
#include "item-status-flag-type.h"
#include "items.h"
#include "message.h"
#include "mon-ench.h"
#include "monster.h"
#include "ouch.h"
#include "party.h"
#include "player.h"

namespace wight
{
namespace
{
constexpr const char* bonus_key = "wight_burial_bonus";
constexpr const char* curse_key = "wight_burial_owns_curse";
}

bool buried(const item_def& item)
{
    return item.base_type == OBJ_WEAPONS && item.props.exists(bonus_key);
}

bool owns_curse(const item_def& item)
{
    return buried(item) && item.props.exists(curse_key)
        && item.props[curse_key].get_bool();
}

int weapon_bonus(const item_def& item)
{
    return buried(item) && item.cursed() ? max(0, item.props[bonus_key].get_int()) : 0;
}

std::string burial_reason(const item_def* item)
{
    if (you.species != SP_WIGHT || you.experience_level < 12)
        return "Only an experienced Wight can bind a weapon this way.";
    if (!item || item->base_type != OBJ_WEAPONS)
        return "Wield a weapon to bind it in your memories.";
    if (buried(*item))
        return "This weapon is already bound in your memories.";
    if (you.hp_max <= 1)
        return "You are too drained to bind a weapon.";
    return "";
}

bool bury(item_def& item)
{
    if (!burial_reason(&item).empty() || !drain_player(150, false, true))
        return false;
    int bonus = max(3, property(item, PWPN_DAMAGE) / 3);
    if (you.hands_reqd(item) == HANDS_TWO)
        bonus *= 2;
    const bool was_cursed = item.cursed();
    item.props[bonus_key] = bonus;
    item.props[curse_key] = !was_cursed;
    item.flags |= ISFLAG_CURSED;
    you.wield_change = true;
    ash_check_bondage();
    mprf("%s is bound in your memories.", item.name(DESC_YOUR).c_str());
    return true;
}

bool release(item_def& item)
{
    if (!buried(item))
        return false;
    const bool clear_curse = owns_curse(item);
    item.props.erase(bonus_key);
    item.props.erase(curse_key);
    if (clear_curse)
        item.flags &= ~ISFLAG_CURSED;
    you.wield_change = true;
    ash_check_bondage();
    mpr("You release the weapon from your memories.");
    return true;
}

void drain_target(actor& target)
{
    if (you.species != SP_WIGHT || you.experience_level < 6 || !target.alive())
        return;
    if (monster* mon = target.as_monster())
    {
        if (party::is_proxy_monster(*mon))
        {
            const int slot = party::proxy_slot(*mon);
            const int degree = you.experience_level >= 18 ? 2 : 1;
            const int power = 10 + degree * random2(max(1, you.experience_level / 9));
            if (!party::slot_is_alive(slot))
                return;
            party::scoped_player_context victim(slot);
            if (you.holiness() & MH_NATURAL)
                drain_player(power, false);
            return;
        }
        if (!(mon->holiness() & MH_NATURAL) || mon->res_negative_energy() >= 3)
            return;
        int duration = random_range(50, 100);
        if (mon->res_negative_energy() > 0)
            duration /= 2 * mon->res_negative_energy();
        const int degree = you.experience_level >= 18 ? 2 : 1;
        if (mon->add_ench(mon_enchant(ENCH_DRAINED, &you, duration, degree))
            && you.can_see(*mon))
        {
            mprf("%s is drained!", mon->name(DESC_THE).c_str());
        }
    }
}
}
