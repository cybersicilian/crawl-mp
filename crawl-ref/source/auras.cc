#include "AppHdr.h"
#include "auras.h"

#include "coord.h"
#include "losglobal.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "terrain.h"

namespace auras
{
const std::array<spell_type, 7> spells = {{
    SPELL_AURA_OF_PROTECTION, SPELL_AURA_OF_ZEAL, SPELL_AURA_OF_RIME,
    SPELL_AURA_OF_VITALITY, SPELL_AURA_OF_SANCTUARY,
    SPELL_AURA_OF_PASSAGE, SPELL_AURA_OF_RESONANCE,
}};

int clamp_power(int power)
{
    return max(0, min(power_cap, power));
}

int duration_turns(int power)
{
    return 12 + clamp_power(power) / 5;
}

int radius(const player& caster)
{
    return base_radius + min(4, max(0, caster.skill(SK_AURAMANCY, 1, true, false) / 6));
}

int strength(int power)
{
    return 1 + clamp_power(power) / 50;
}

int power(const player& caster, spell_type spell)
{
    if (caster.hp <= 0 || caster.duration[DUR_PALADIN_ZEAL] <= 0
        || !caster.props.exists("active_aura_spell")
        || caster.props["active_aura_spell"].get_int() != spell)
    {
        return 0;
    }
    return caster.props.exists("active_aura_pow")
           ? max(1, clamp_power(caster.props["active_aura_pow"].get_int())) : 1;
}

bool reaches(const player& caster, const coord_def& target, int range_limit)
{
    const int range = range_limit < 0 ? radius(caster)
                                     : min(radius(caster), range_limit);
    return in_bounds(caster.pos()) && in_bounds(target)
           && grid_distance(caster.pos(), target) <= range
           && cell_see_cell(caster.pos(), target, LOS_NO_TRANS);
}

int movement_discount(const coord_def& from, const coord_def& to)
{
    if (you.religion == GOD_CHEIBRIADOS || you.duration[DUR_SWIFTNESS]
        || you.duration[DUR_HASTE])
    {
        return 0;
    }
    int discount = 0;
    for (int slot : party::aura_sources_near(from, SPELL_AURA_OF_PASSAGE))
    {
        if (slot == party::active_slot())
            continue;
        const player& caster = party::get_player(slot);
        if (grid_distance(to, caster.pos()) < grid_distance(from, caster.pos()))
            discount = max(discount, 10 + power(caster, SPELL_AURA_OF_PASSAGE) / 10);
    }
    return discount;
}

int intercept_damage(int damage)
{
    if (damage <= 0 || you.hp_max <= 0)
        return damage;
    int selected = -1;
    int best_power = -1;
    for (int slot : party::aura_sources_near(you.pos(), SPELL_AURA_OF_SANCTUARY))
    {
        if (slot == party::active_slot())
            continue;
        const player& caster = party::get_player(slot);
        if (caster.hp_max <= 0 || caster.hp <= max(1, (caster.hp_max + 2) / 3)
            || caster.hp * you.hp_max <= you.hp * caster.hp_max)
        {
            continue;
        }
        const int caster_power = power(caster, SPELL_AURA_OF_SANCTUARY);
        if (caster_power > best_power)
        {
            selected = slot;
            best_power = caster_power;
        }
    }
    if (selected >= 0)
    {
        player& guardian = party::get_player(selected);
        const int redirected = min(damage * (15 + best_power * 15 / 100) / 100,
                                   guardian.hp - max(1, (guardian.hp_max + 2) / 3));
        if (redirected > 0)
        {
            guardian.hp -= redirected;
            guardian.redraw_hit_points = true;
            party::sync_player_to_proxy(selected);
            mprf(MSGCH_FRIEND_ACTION, "%s's sanctuary bears %d of your damage!",
                 guardian.your_name.c_str(), redirected);
            return damage - redirected;
        }
    }
    return damage;
}
}
