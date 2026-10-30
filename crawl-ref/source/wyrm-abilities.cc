#include "AppHdr.h"
#include "wyrm-abilities.h"

#include "coordit.h"
#include "env.h"
#include "fight.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "potion-type.h"
#include "prompt.h"
#include "random.h"
#include "spl-cast.h"
#include "spl-goditem.h"
#include "stringutil.h"
#include "terrain.h"
#include "wyrm-essence.h"

namespace wyrm_abilities
{
namespace
{
potion_type essence_for(ability_type ability)
{
    switch (ability)
    {
    case ABIL_WYRM_NIGREDO: return POT_NIGREDO;
    case ABIL_WYRM_ALBEDO: return POT_ALBEDO;
    case ABIL_WYRM_CITRINITAS: return POT_CITRINITAS;
    case ABIL_WYRM_VIRIDITAS: return POT_VIRIDITAS;
    case ABIL_WYRM_RUBEDO: return POT_RUBEDO;
    default: return NUM_POTIONS;
    }
}

int choose_potion(const char* prompt, bool essence)
{
    const int slot = prompt_invent_item(prompt, menu_type::invlist,
                                        OBJ_POTIONS, OPER_EVOKE);
    if (prompt_failed(slot))
        return -1;
    const item_def& item = you.inv[slot];
    if (item.base_type != OBJ_POTIONS
        || (essence && !wyrm_essence::is_essence(static_cast<potion_type>(item.sub_type))))
    {
        mpr(essence ? "That is not an essence." : "That is not a potion.");
        return -1;
    }
    return slot;
}

int infusion_duration(enchant_type enchant)
{
    switch (enchant)
    {
    case ENCH_WYRM_NIGREDO: return 10 + you.piety() / 20;
    case ENCH_WYRM_ALBEDO: return 6 + you.piety() / 40;
    case ENCH_WYRM_CITRINITAS: return min(10 + you.piety() / 10 + random2(10), 50);
    case ENCH_WYRM_VIRIDITAS: return min(2 + you.piety() / 50, 10);
    default: return 0;
    }
}

void add_infusion(monster& mon, enchant_type enchant)
{
    mon.add_ench(mon_enchant(enchant, &you,
                             infusion_duration(enchant) * BASELINE_DELAY));
}
}

bool hidden_party_target(const coord_def& target)
{
    const player* member = party::player_at(target);
    return member && member->mid != you.mid && !you.can_see(*member);
}

spret transmute(ability_type ability, bool fail)
{
    const int slot = choose_potion("Transmute which potion?", false);
    if (slot < 0)
        return spret::abort;
    return transmute_slot(ability, slot, fail);
}

spret transmute_slot(ability_type ability, int slot, bool fail)
{
    const potion_type result = essence_for(ability);
    if (result == NUM_POTIONS || slot < 0 || slot >= ENDOFPACK
        || !you.inv[slot].defined() || you.inv[slot].base_type != OBJ_POTIONS)
        return spret::abort;
    fail_check();
    int created = items(false, OBJ_POTIONS, result, 0);
    if (created == NON_ITEM)
    {
        mpr("There is no room to create the essence.");
        return spret::abort;
    }
    // Forced potion generation can produce a stack; transmutation is exactly
    // one reagent into one essence, regardless of normal generation bonuses.
    env.item[created].quantity = 1;
    if (!move_item_to_grid(&created, you.pos()) || created == NON_ITEM)
    {
        if (created != NON_ITEM)
            destroy_item(created);
        mpr("The essence cannot be placed here.");
        return spret::abort;
    }
    identify_item(env.item[created]);
    dec_inv_item_quantity(slot, 1);
    mprf("You transmute %s.", env.item[created].name(DESC_A).c_str());
    return spret::success;
}

spret infuse(const coord_def& target, bool fail)
{
    const int slot = choose_potion("Infuse which essence?", true);
    if (slot < 0)
        return spret::abort;
    return infuse_slot(slot, target, fail);
}

spret infuse_slot(int slot, const coord_def& target, bool fail)
{
    if (slot < 0 || slot >= ENDOFPACK || !you.inv[slot].defined()
        || you.inv[slot].base_type != OBJ_POTIONS
        || !wyrm_essence::is_essence(static_cast<potion_type>(you.inv[slot].sub_type)))
        return spret::abort;
    // Resolve party players before monster proxies so the selected character
    // receives their own effect, and invisible members are not disclosed.
    player* member = party::player_at(target);
    const potion_type potion = static_cast<potion_type>(you.inv[slot].sub_type);
    if (member)
    {
        if (member->mid == you.mid)
        {
            mpr("Drink the essence to use it on yourself.");
            return spret::abort;
        }
        if (!you.can_see(*member))
        {
            mpr("You see nothing there you can infuse.");
            return spret::abort;
        }
        if (potion != POT_CITRINITAS && potion != POT_NIGREDO
            && potion != POT_RUBEDO)
        {
            mpr(potion == POT_ALBEDO
                ? "Albedo can interrupt monsters, but not party members."
                : "That essence cannot be infused into a party member.");
            return spret::abort;
        }
        if (potion == POT_NIGREDO
            && !yesno(make_stringf("Really infuse your ally %s with Nigredo?",
                                   member->your_name.c_str()).c_str(), true, 'n'))
            return spret::abort;
        if (potion != POT_RUBEDO)
        {
            fail_check();
            if (potion == POT_CITRINITAS)
                wyrm_essence::empower_player(*member,
                    infusion_duration(ENCH_WYRM_CITRINITAS), you.mid);
            else
                wyrm_essence::infuse_player_nigredo(*member,
                    infusion_duration(ENCH_WYRM_NIGREDO), you.mid);
            mprf("%s is infused with %s.", member->your_name.c_str(),
                 potion == POT_CITRINITAS ? "Citrinitas" : "Nigredo");
            dec_inv_item_quantity(slot, 1);
            return spret::success;
        }
    }
    monster* mon = member ? nullptr : monster_at(target);
    if (!member && (!mon || party::is_proxy_monster(*mon) || !you.can_see(*mon)))
    {
        mpr("You see nothing there you can infuse.");
        return spret::abort;
    }
    const bool friendly = member || mons_aligned(&you, mon);
    const auto donor_has = [member, mon](enchant_type e)
    {
        if (mon)
            return mon->has_ench(e);
        if (e == ENCH_WYRM_NIGREDO)
            return member->duration[DUR_WYRM_NIGREDO] > 0;
        if (e == ENCH_WYRM_CITRINITAS)
            return member->duration[DUR_WYRM_CITRINITAS] > 0;
        return false;
    };
    enchant_type enchant = ENCH_NONE;
    switch (potion)
    {
    case POT_NIGREDO: enchant = ENCH_WYRM_NIGREDO; break;
    case POT_ALBEDO: enchant = ENCH_WYRM_ALBEDO; break;
    case POT_CITRINITAS: enchant = ENCH_WYRM_CITRINITAS; break;
    case POT_VIRIDITAS: enchant = ENCH_WYRM_VIRIDITAS; break;
    case POT_RUBEDO: break;
    default: return spret::abort;
    }
    if (potion == POT_ALBEDO && !monster_is_debuffable(*mon))
    {
        mpr("That creature has no dispellable magic to interrupt.");
        return spret::abort;
    }
    if (potion == POT_VIRIDITAS && friendly)
    {
        mpr("You cannot infuse an ally with Viriditas.");
        return spret::abort;
    }
    if ((potion == POT_NIGREDO || potion == POT_ALBEDO)
        && stop_attack_prompt(mon, false, you.pos()))
        return spret::abort;
    if (potion == POT_CITRINITAS && !friendly
        && !yesno("This will empower an enemy. Continue?", true, 'n'))
        return spret::abort;
    if (potion == POT_RUBEDO)
    {
        bool any = false;
        for (enchant_type e : {ENCH_WYRM_NIGREDO, ENCH_WYRM_ALBEDO,
                               ENCH_WYRM_CITRINITAS, ENCH_WYRM_VIRIDITAS})
            any |= donor_has(e);
        if (!any)
        {
            mpr("That creature has no infusion to diffuse.");
            return spret::abort;
        }
        bool recipient = false;
        for (radius_iterator ri(you.pos(), LOS_DEFAULT); ri; ++ri)
        {
            monster* other = monster_at(*ri);
            if (!other || other == mon || party::is_proxy_monster(*other)
                || !you.can_see(*other))
                continue;
            for (enchant_type e : {ENCH_WYRM_NIGREDO, ENCH_WYRM_ALBEDO,
                                   ENCH_WYRM_CITRINITAS, ENCH_WYRM_VIRIDITAS})
                if (donor_has(e) && !other->has_ench(e)
                    && (e != ENCH_WYRM_CITRINITAS || mons_aligned(&you, other))
                    && (e != ENCH_WYRM_VIRIDITAS || !mons_aligned(&you, other)))
                    recipient = true;
        }
        if (party::is_enabled())
            for (int i = 0; i < party::player_count(); ++i)
            {
                const player& member = party::get_player(i);
                if (member.mid != you.mid && you.can_see(member)
                    && ((donor_has(ENCH_WYRM_CITRINITAS)
                         && member.duration[DUR_WYRM_CITRINITAS] == 0)
                        || (donor_has(ENCH_WYRM_NIGREDO)
                            && member.duration[DUR_WYRM_NIGREDO] == 0)))
                    recipient = true;
            }
        if (!recipient)
        {
            mpr("There is no one in sight to receive the infusions.");
            return spret::abort;
        }
        // This can spread harmful infusions to allies; do not perform it
        // without an explicit confirmation when a visible ally is present.
        if (donor_has(ENCH_WYRM_NIGREDO) || donor_has(ENCH_WYRM_ALBEDO))
        {
            bool harms_allies = false;
            if (donor_has(ENCH_WYRM_NIGREDO) && party::is_enabled())
                for (int i = 0; i < party::player_count(); ++i)
                {
                    const player& member = party::get_player(i);
                    if (member.mid != you.mid && you.can_see(member)
                        && member.duration[DUR_WYRM_NIGREDO] == 0)
                        harms_allies = true;
                }
            for (radius_iterator ri(you.pos(), LOS_DEFAULT); ri; ++ri)
            {
                monster* other = monster_at(*ri);
                if (other && other != mon && !party::is_proxy_monster(*other)
                    && you.can_see(*other) && mons_aligned(&you, other)
                    && ((donor_has(ENCH_WYRM_NIGREDO)
                         && !other->has_ench(ENCH_WYRM_NIGREDO))
                        || (donor_has(ENCH_WYRM_ALBEDO)
                            && !other->has_ench(ENCH_WYRM_ALBEDO))))
                    harms_allies = true;
            }
            if (harms_allies
                && !yesno("This will spread harmful infusions to allies. Continue?",
                          true, 'n'))
                return spret::abort;
        }
    }
    fail_check();
    if (potion != POT_RUBEDO)
    {
        add_infusion(*mon, enchant);
        if (potion == POT_NIGREDO || potion == POT_ALBEDO || potion == POT_VIRIDITAS)
            behaviour_event(mon, ME_WHACK, &you);
        simple_monster_message(*mon, " is infused with essence.");
    }
    else
    {
        int affected = 0;
        for (radius_iterator ri(you.pos(), LOS_DEFAULT); ri; ++ri)
        {
            monster* other = monster_at(*ri);
            if (!other || other == mon || party::is_proxy_monster(*other)
                || !you.can_see(*other))
                continue;
            for (enchant_type e : {ENCH_WYRM_NIGREDO, ENCH_WYRM_ALBEDO,
                                   ENCH_WYRM_CITRINITAS, ENCH_WYRM_VIRIDITAS})
                if (donor_has(e) && !other->has_ench(e)
                    && (e != ENCH_WYRM_CITRINITAS || mons_aligned(&you, other))
                    && (e != ENCH_WYRM_VIRIDITAS || !mons_aligned(&you, other)))
                {
                    add_infusion(*other, e);
                    ++affected;
                }
        }
        if (party::is_enabled())
            for (int i = 0; i < party::player_count(); ++i)
            {
                player& member = party::get_player(i);
                if (member.mid == you.mid || !you.can_see(member))
                    continue;
                if (donor_has(ENCH_WYRM_CITRINITAS)
                    && member.duration[DUR_WYRM_CITRINITAS] == 0)
                {
                    wyrm_essence::empower_player(member,
                        infusion_duration(ENCH_WYRM_CITRINITAS), you.mid);
                    ++affected;
                }
                if (donor_has(ENCH_WYRM_NIGREDO)
                    && member.duration[DUR_WYRM_NIGREDO] == 0)
                {
                    wyrm_essence::infuse_player_nigredo(member,
                        infusion_duration(ENCH_WYRM_NIGREDO), you.mid);
                    ++affected;
                }
            }
        if (!affected)
        {
            mpr("There is no one in sight to receive the infusions.");
            return spret::abort;
        }
        mpr("The infusions spread through the air.");
    }
    dec_inv_item_quantity(slot, 1);
    return spret::success;
}
}
