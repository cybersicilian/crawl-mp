#include "AppHdr.h"
#include "cubus.h"

#include "actor.h"
#include "env.h"
#include "item-prop.h"
#include "item-use.h"
#include "items.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "terrain.h"

namespace cubus
{
static bool suitable(const monster& caster, const actor& target, effect which)
{
    return target.alive() && caster.can_see(target)
        && caster.see_cell_no_trans(target.pos())
        && could_harm_enemy(&caster, &target)
        && (which != effect::allure
            || (!target.undead_or_demonic() && !target.is_nonliving()
                && !target.is_holy()));
}

static vector<item_def*> player_items(effect which)
{
    vector<item_def*> result;
    for (const player_equip_entry& entry : you.equipment.items)
    {
        if (entry.melded || entry.is_overflow)
            continue;
        item_def& item = you.inv[entry.item];
        const bool matching = which == effect::disarm
            ? (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
                  && (entry.slot == SLOT_WEAPON || entry.slot == SLOT_WEAPON_OR_OFFHAND)
            : item.base_type == OBJ_JEWELLERY;
        // Avoid chained removals and accidental destruction of temporary gear.
        if (!matching || item.summoned() || !item_granted_slots(item).empty()
            || !can_unequip_item(item, true) || flight_removal_hazard({&item}))
            continue;
        result.push_back(&item);
    }
    return result;
}

static bool monster_item_safe(const monster& target, effect which)
{
    const mon_inv_type slot = which == effect::disarm ? MSLOT_WEAPON : MSLOT_JEWELLERY;
    const item_def* item = target.mslot_item(slot);
    return item && !item->summoned() && !item->cursed()
        && in_bounds(target.pos()) && !feat_eliminates_items(env.grid(target.pos()));
}

static int player_slot(const actor& target)
{
    if (target.is_player())
        return party::slot_for_mid(target.mid);
    if (target.is_monster() && party::is_proxy_monster(*target.as_monster()))
        return party::proxy_slot(*target.as_monster());
    return -1;
}

bool can_affect(const monster& caster, actor& target, effect which)
{
    const int slot = player_slot(target);
    if (slot >= 0)
    {
        party::scoped_player_context context(slot);
        return suitable(caster, you, which) && !player_items(which).empty();
    }
    return suitable(caster, target, which) && target.is_monster()
        && (which == effect::disarm || adjacent(caster.pos(), target.pos()))
        && monster_item_safe(*target.as_monster(), which);
}

bool apply(monster& caster, actor& target, effect which, int power, bool check_will)
{
    const int slot = player_slot(target);
    if (slot >= 0)
    {
        party::scoped_player_context context(slot);
        if (!suitable(caster, you, which))
            return false;
        if (which == effect::disarm && check_will && you.check_willpower(&caster, power) > 0)
        {
            mpr("You resist the attempt to disarm you.");
            return false;
        }
        vector<item_def*> candidates = player_items(which);
        if (candidates.empty() || (which == effect::allure && !coinflip()))
            return false;
        item_def& item = **random_iterator(candidates);
        mprf(MSGCH_WARN, which == effect::disarm ? "You are disarmed of %s!"
                                                : "You remove %s under the cubus's allure!",
             item.name(DESC_YOUR).c_str());
        return unequip_item(item, false, false, false);
    }
    if (!suitable(caster, target, which) || !target.is_monster()
        || (which == effect::allure && !adjacent(caster.pos(), target.pos())))
        return false;
    monster& victim = *target.as_monster();
    if (which == effect::disarm && check_will && victim.check_willpower(&caster, power) > 0)
        return false;
    if (!monster_item_safe(victim, which))
        return false;
    return victim.drop_item(which == effect::disarm ? MSLOT_WEAPON : MSLOT_JEWELLERY,
                            you.can_see(victim));
}
}
