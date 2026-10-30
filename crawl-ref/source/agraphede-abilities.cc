#include "AppHdr.h"

#include "agraphede-abilities.h"

#include "env.h"
#include "evoke.h"
#include "fight.h"
#include "item-name.h"
#include "items.h"
#include "makeitem.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "potion-type.h"
#include "prompt.h"
#include "random.h"
#include "skills.h"
#include "spl-cast.h"
#include "spl-summoning.h"
#include "stepdown.h"
#include "stringutil.h"
#include "terrain.h"
#include "traps.h"

namespace agraphede_abilities
{
bool uses_poison(ability_type ability)
{
    return ability == ABIL_AGRAPHEDE_WEB
           || ability == ABIL_AGRAPHEDE_ENCHANT_POISON
           || ability == ABIL_AGRAPHEDE_TRAP
           || ability == ABIL_AGRAPHEDE_HORNET_STING
           || ability == ABIL_AGRAPHEDE_SUMMON_SPIDER;
}

int poison_cost(ability_type ability)
{
    if (!uses_poison(ability))
        return 0;
    const int available = max(0, you.duration[DUR_POISONING] / 1000);
    if (ability == ABIL_AGRAPHEDE_WEB)
        return min(5, available);
    if (ability == ABIL_AGRAPHEDE_ENCHANT_POISON)
        return min(15, available);
    return available;
}

bool can_pay(ability_type ability, bool quiet)
{
    if (!uses_poison(ability))
        return true;
    const int cost = poison_cost(ability);
    if (cost > 0 && you.hp > cost)
        return true;
    if (!quiet)
        mpr(cost ? "You cannot survive spending that much poison."
                 : "You need poison to invoke this power.");
    return false;
}

void pay(ability_type ability)
{
    const int cost = poison_cost(ability);
    ASSERT(cost > 0 && you.hp > cost);
    const int available = you.duration[DUR_POISONING] / 1000;
    dec_hp(cost, false);
    if (cost == available)
        you.duration[DUR_POISONING] = 0;
    else
        you.duration[DUR_POISONING] -= cost * 1000;
}

int poison_enhancement()
{
    const int cap = max(1, you.hp_max / 3);
    const int step = max(1, cap / 3);
    return min(3, min(cap, you.duration[DUR_POISONING] / 1000) / step);
}

int enhanced_power(int base)
{
    int power = max(0, base) * 100;
    for (int i = 0; i < poison_enhancement(); ++i)
        power = power * 15 / 10;
    return stepdown_value(power * 10, 50000, 50000, 150000, 200000) / 1000;
}

spret convert_curing_slot(int slot, int count, bool fail)
{
    if (slot < 0 || slot >= ENDOFPACK || count < 3 || count > 5
        || !you.inv[slot].is_type(OBJ_POTIONS, POT_CURING))
        return spret::abort;
    fail_check();
    int made = items(false, OBJ_POTIONS, POT_POISON, 0);
    if (made == NON_ITEM)
    {
        mpr("There is no room to create the poison.");
        return spret::abort;
    }
    // Forced potion generation can yield a random stack: conversion creates
    // exactly the chosen three to five potions, then spends one reagent.
    env.item[made].quantity = count;
    if (!move_item_to_grid(&made, you.pos()) || made == NON_ITEM)
    {
        if (made != NON_ITEM)
            destroy_item(made);
        mpr("The poison cannot be placed here.");
        return spret::abort;
    }
    identify_item(env.item[made]);
    dec_inv_item_quantity(slot, 1);
    mpr("Agraphede transforms your curing potion into poison.");
    return spret::success;
}

spret convert_curing(bool fail)
{
    for (int slot = 0; slot < ENDOFPACK; ++slot)
        if (you.inv[slot].is_type(OBJ_POTIONS, POT_CURING))
            return convert_curing_slot(slot, random_range(3, 5), fail);
    mpr("You have no potion of curing to transform.");
    return spret::abort;
}

spret create_web(const coord_def& target, bool fail)
{
    if (!can_pay(ABIL_AGRAPHEDE_WEB))
        return spret::abort;
    if (!in_bounds(target) || target == you.pos()
        || grid_distance(you.pos(), target) > 3
        || !you.see_cell_no_trans(target) || env.grid(target) != DNGN_FLOOR)
    {
        mpr("You cannot create a web there.");
        return spret::abort;
    }
    player* member = party::player_at(target);
    monster* mon = member ? nullptr : monster_at(target);
    if (member && you.can_see(*member)
        && !yesno(make_stringf("Really web your ally %s?",
                               member->your_name.c_str()).c_str(), true, 'n'))
        return spret::abort;
    if (mon && stop_attack_prompt(mon, false, target))
        return spret::abort;
    fail_check();

    const int power = 11 + you.skill(SK_INVOCATIONS, 7);
    const int web_hp = 1 + random2(2 + power / 40);
    // Match the fork's direct-capture chance, without exposing unseen actors.
    const bool catch_mon = mon && you.can_see(*mon) && !mon->is_web_immune()
        && !mon->caught()
        && random2(max(1, mon->evasion())) <= 10 + power / 10;
    const bool catch_member = member && you.can_see(*member)
        && !member->is_web_immune() && !member->caught();
    const int remaining_web = web_hp - (catch_mon || catch_member ? 1 : 0);
    // Install any lasting web before committing capture, so a placement veto
    // cannot leave a trapped actor when the ability reports failure.
    if (remaining_web > 0 && !place_agraphede_web(target, remaining_web == 1))
        return spret::abort;
    if (catch_mon && mon->trap_in_web())
    {
        mon->props[NEWLY_TRAPPED_KEY] = true;
    }
    else if (catch_member)
    {
        const int slot = party::slot_for_mid(member->mid);
        if (slot >= 0)
        {
            party::scoped_player_context context(slot);
            you.trap_in_web();
        }
    }
    pay(ABIL_AGRAPHEDE_WEB);
    return spret::success;
}

spret summon_spiders(const coord_def& target, bool fail)
{
    if (!can_pay(ABIL_AGRAPHEDE_SUMMON_SPIDER))
        return spret::abort;
    monster* foe = party::player_at(target) ? nullptr : monster_at(target);
    if (!foe || !you.can_see(*foe) || foe->wont_attack())
    {
        mpr("You see no hostile creature there.");
        return spret::abort;
    }
    if (!player_summon_check(MONS_REDBACK))
        return spret::abort;
    const int enhancement = poison_enhancement();
    const int power = enhanced_power(you.skill(SK_INVOCATIONS));
    const int count = 2 + random2(2) + 2 * enhancement;
    fail_check();
    if (!agraphede_summon_spiders(power, count, target))
    {
        canned_msg(MSG_NOTHING_HAPPENS);
        return spret::abort;
    }
    pay(ABIL_AGRAPHEDE_SUMMON_SPIDER);
    return spret::success;
}
}
