#include "AppHdr.h"
#include "god-vorr.h"
#include "god-vorr-internal.h"

#include <set>

#include "env.h"
#include "items.h"
#include "level-time.h"
#include "message.h"
#include "mon-util.h"
#include "player.h"
#include "species.h"
#include "stringutil.h"

namespace vorr
{
namespace
{
bool usable_corpse(const item_def& item)
{
    return item.defined() && item.is_type(OBJ_CORPSES, CORPSE_BODY)
        && item.freshness > 0 && !invalid_monster_type(item.mon_type)
        && mons_has_blood(item.mon_type) && visible_fuel(item.pos);
}

void select_segment(rite_payment& plan, const coord_def& center, int radius, int needed)
{
    const auto eligible = [&](const coord_def& pos) {
        return visible_fuel(pos) && grid_distance(pos, center) <= radius;
    };
    const auto blood = cell_resource::select_up_to(plan.entries, center, needed,
                                                  level_elapsed_time(), eligible);
    plan.blood.insert(plan.blood.end(), blood.begin(), blood.end());
    for (const auto& part : blood)
        plan.cells.push_back(plan.entries[part.index].pos);
    needed -= cell_resource::total(blood);
    std::vector<int> corpses;
    for (int i = 0; i < MAX_ITEMS && needed; ++i)
        if (usable_corpse(env.item[i]) && eligible(env.item[i].pos))
            corpses.push_back(i);
    std::stable_sort(corpses.begin(), corpses.end(), [&](int a, int b) {
        return grid_distance(env.item[a].pos, center) < grid_distance(env.item[b].pos, center);
    });
    for (int index : corpses)
    {
        const auto& item = env.item[index];
        const int units = std::min(needed, int(item.quantity));
        plan.corpses.push_back({index, units, item.pos, item.mon_type, item.freshness});
        plan.cells.push_back(item.pos);
        needed -= units;
        if (!needed)
            break;
    }
    if (needed)
    {
        plan.missing += needed;
        plan.cells.push_back(center);
    }
}
}

int self_blood_cost()
{
    return std::max(1, (you.hp_max + 9) / 10);
}

bool self_blood_available()
{
    return species::has_blood(you.species) && you.has_blood();
}

int corpse_fuel_at(const coord_def& pos)
{
    int units = 0;
    if (active() && visible_fuel(pos))
        for (const auto& item : env.item)
            if (item.pos == pos && usable_corpse(item))
                units += item.quantity;
    return units;
}

int nearby_corpses()
{
    int units = 0;
    if (active())
        for (const auto& item : env.item)
            if (usable_corpse(item) && grid_distance(item.pos, you.pos()) <= 4)
                units += item.quantity;
    return units;
}

rite_payment plan_payment(ability_type ability, const coord_def& aim)
{
    rite_payment result;
    result.entries = blood_ledger();
    if (ability == ABIL_VORR_RED_PASSAGE)
    {
        select_segment(result, you.pos(), 0, 1);
        select_segment(result, aim, 0, 1);
    }
    else if (ability == ABIL_VORR_RUPTURE)
        select_segment(result, you.pos(), 4, 2);
    else if (ability == ABIL_VORR_GREAT_LETTING)
        select_segment(result, aim, 2, 8);
    result.hp = result.missing * self_blood_cost();
    return result;
}

std::string payment_reason(const rite_payment& plan)
{
    if (!plan.hp)
        return "";
    if (!self_blood_available())
        return "Your species or current body has no blood for self-exsanguination; supply blood or corpses.";
    if (you.duration[DUR_DEATHS_DOOR])
        return "You cannot self-exsanguinate while under Death's Door.";
    if (you.hp <= plan.hp)
        return make_stringf("Replacing %d missing blood requires %d HP (10%% of maximum HP each); "
                            "you must survive self-exsanguination.", plan.missing, plan.hp);
    return "";
}

bool commit_payment(const rite_payment& plan)
{
    if (!active() || plan.cells.empty() || plan.hp != plan.missing * self_blood_cost()
        || !payment_reason(plan).empty())
        return false;
    auto entries = blood_ledger();
    if (entries.size() != plan.entries.size()
        || !std::equal(entries.begin(), entries.end(), plan.entries.begin(),
            [](const cell_resource::deposit& a, const cell_resource::deposit& b) {
                return a.pos == b.pos && a.units == b.units && a.expires == b.expires;
            }))
        return false;
    std::set<int> seen;
    for (const auto& part : plan.corpses)
    {
        if (!seen.insert(part.index).second || part.index < 0 || part.index >= MAX_ITEMS
            || part.units <= 0)
            return false;
        const auto& item = env.item[part.index];
        if (!usable_corpse(item) || item.pos != part.pos || item.mon_type != part.kind
            || item.freshness != part.freshness || item.quantity < part.units)
            return false;
    }
    if (!plan.blood.empty())
    {
        if (!cell_resource::commit(entries, plan.blood, level_elapsed_time()))
            return false;
        save_blood(entries);
    }
    int bodies = 0;
    for (const auto& part : plan.corpses)
    {
        dec_mitm_item_quantity(part.index, part.units);
        bodies += part.units;
    }
    if (bodies)
        mprf("Vorr consumes %d corpse%s to fuel the rite.", bodies, bodies == 1 ? "" : "s");
    if (plan.hp)
    {
        pay_hp(plan.hp);
        mprf("You self-exsanguinate for %d HP, replacing %d missing blood.", plan.hp, plan.missing);
    }
    you.redraw_status_lights = true;
    return true;
}
}
