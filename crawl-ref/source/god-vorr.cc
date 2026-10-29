#include "AppHdr.h"
#include "god-vorr.h"
#include "god-vorr-internal.h"

#include "act-iter.h"
#include "areas.h"
#include "bloodspatter.h"
#include "coordit.h"
#include "env.h"
#include "fineff.h"
#include "level-time.h"
#include "message.h"
#include "mon-death.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "religion.h"
#include "shout.h"
#include "skills.h"
#include "stringutil.h"
#include "terrain.h"
#include "unwind.h"

namespace vorr
{
namespace
{
constexpr const char* budget_key = "vorr_yield";
constexpr const char* wound_key = "vorr_wound_released";
constexpr const char* death_key = "vorr_death_released";
constexpr const char* force_key = "vorr_forceful";
bool resolving_burst = false;

int sponsor()
{
    if (active())
        return party::active_slot();
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            const player& member = party::get_player(slot);
            if (!party::is_player_downed(slot) && member.religion == GOD_VORR
                && !member.penance[GOD_VORR] && member.where_are_you == you.where_are_you
                && member.depth == you.depth)
            {
                return slot;
            }
        }
    return -1;
}

int& budget(monster& victim)
{
    if (!victim.props.exists(budget_key))
        victim.props[budget_key] = mons_threat_level(victim) == MTHRT_TRIVIAL ? 1
            : victim.get_hit_dice() >= 12 ? 6 : 4;
    return victim.props[budget_key].get_int();
}

bool burst_phase_started()
{
    return resolving_burst || (you.props.exists("vorr_burst_turn")
        && you.props["vorr_burst_turn"].get_int() == you.num_turns
        && you.props["vorr_burst_clock"].get_int() == level_elapsed_time());
}

void burst(const coord_def& origin, int radius, int hd)
{
    if (!active() || !you.alive())
        return;
    unwind_var<bool> phase(resolving_burst, true);
    you.props["vorr_burst_turn"] = you.num_turns;
    you.props["vorr_burst_clock"] = level_elapsed_time();
    noisy(8, origin);
    std::vector<mid_t> targets;
    for (monster_near_iterator mon(origin, LOS_SOLID); mon; ++mon)
        if (grid_distance(mon->pos(), origin) <= radius && mon->hostile()
            && !party::is_proxy_monster(**mon))
        {
            targets.push_back(mon->mid);
        }
    for (mid_t id : targets)
        if (monster* mon = monster_by_mid(id))
        {
            int damage = 1 + random2(4 + min(hd, 16));
            if (grid_distance(mon->pos(), origin) > 1)
                damage /= 2;
            damage = mon->apply_ac(damage);
            mon->hurt(&you, damage, BEAM_MMISSILE);
        }
}

void kill_for_sponsor(monster& victim)
{
    if (victim.props.exists(death_key))
        return;
    victim.props[death_key] = true;
    const coord_def origin = victim.pos();
    const int units = budget(victim);
    budget(victim) = 0;
    release_blood(origin, units);
    blood_spray(origin, victim.type, units * 3);
    if (burst_phase_started())
        return;
    const int radius = victim.props.exists(force_key)
        && victim.props[force_key].get_bool() ? 2 : 1;
    const int hd = victim.get_hit_dice();
    const int slot = party::active_slot();
    const mid_t owner = you.mid;
    const level_id floor = level_id::current();
    if (you.can_see(victim))
        simple_monster_message(victim, " bursts in a crimson spray!");
    schedule_function_fineff([origin, radius, hd, slot, owner, floor]() {
        if (level_id::current() != floor)
            return;
        if (slot == party::active_slot())
        {
            if (you.mid == owner)
                burst(origin, radius, hd);
        }
        else if (party::is_enabled() && slot < party::player_count()
                 && party::get_player(slot).mid == owner && !party::is_player_downed(slot))
        {
            party::scoped_player_context context(slot);
            burst(origin, radius, hd);
        }
    });
}

void steal_life(int damage)
{
    if (!active(3) || you.duration[DUR_DEATHS_DOOR] || !you.alive() || you.hp >= you.hp_max)
        return;
    const int now = level_elapsed_time();
    if (!you.props.exists("vorr_heal_clock")
        || now < you.props["vorr_heal_clock"].get_int()
        || now - you.props["vorr_heal_clock"].get_int() >= BASELINE_DELAY)
    {
        you.props["vorr_heal_clock"] = now;
        you.props["vorr_heal_used"] = 0;
        you.props["vorr_heal_fraction"] = 0;
    }
    int& used = you.props["vorr_heal_used"].get_int();
    int& fraction = you.props["vorr_heal_fraction"].get_int();
    fraction += damage * 8;
    const int cap = 3 + you.skill(SK_INVOCATIONS) / 6;
    const int healing = min(fraction / 100, max(0, cap - used));
    fraction %= 100;
    const int recovered = min(healing, you.hp_max - you.hp);
    used += recovered;
    if (recovered)
    {
        inc_hp(recovered, true);
        you.redraw_hit_points = true;
    }
}
}

bool active(int rank)
{
    return you_worship(GOD_VORR) && !player_under_penance()
        && (rank == 0 || you.piety() >= piety_breakpoint(rank - 1));
}

bool worthy(const monster& victim)
{
    return victim.has_blood() && victim.hostile() && mons_gives_xp(victim, you)
        && !victim.is_unrewarding() && !victim.is_firewood()
        && !party::is_proxy_monster(victim);
}

cell_resource::ledger blood_ledger()
{
    return cell_resource::load(env.properties, blood_key, level_elapsed_time());
}

void save_blood(const cell_resource::ledger& entries)
{
    cell_resource::save(env.properties, blood_key, entries, level_elapsed_time());
    you.redraw_status_lights = true;
}

bool visible_fuel(const coord_def& pos)
{
    return in_bounds(pos) && you.see_cell_no_trans(pos)
        && !feat_is_solid(env.grid(pos)) && !feat_is_water(env.grid(pos))
        && !feat_is_lava(env.grid(pos)) && !is_sanctuary(pos)
        && !is_good_god(feat_altar_god(env.grid(pos)));
}

void release_blood(const coord_def& origin, int units, int radius)
{
    auto entries = blood_ledger();
    std::vector<coord_def> cells;
    for (radius_iterator cell(origin, radius, C_SQUARE, LOS_SOLID); cell; ++cell)
        if (in_bounds(*cell) && !feat_is_solid(env.grid(*cell))
            && !feat_is_water(env.grid(*cell)) && !feat_is_lava(env.grid(*cell))
            && !is_sanctuary(*cell) && !is_good_god(feat_altar_god(env.grid(*cell))))
        {
            cells.push_back(*cell);
        }
    std::stable_sort(cells.begin(), cells.end(), [&](const coord_def& a, const coord_def& b) {
        return grid_distance(a, origin) < grid_distance(b, origin);
    });
    const int now = level_elapsed_time();
    for (const auto& cell : cells)
    {
        const int accepted = cell_resource::add(entries, cell, units, now + 120, now);
        if (accepted)
            bleed_onto_floor(cell, NUM_MONSTERS, accepted * 15);
        units -= accepted;
        if (!units)
            break;
    }
    save_blood(entries);
}

int blood_at(const coord_def& pos)
{
    return blood_visual(pos) & 3;
}

int blood_visual(const coord_def& pos)
{
    if (!active() || !visible_fuel(pos) || !env.properties.exists(blood_key))
        return 0;
    int units = 0, expiry = INT_MAX;
    const int now = level_elapsed_time();
    // Rendering must not allocate and decode the whole ledger per cell.
    for (const auto& value : env.properties[blood_key].get_vector())
    {
        const auto& entry = value.get_table();
        if (entry["pos"].get_coord() == pos && entry["expires"].get_int() > now)
        {
            units += entry["units"].get_int();
            expiry = min(expiry, entry["expires"].get_int());
        }
    }
    return units ? min(3, units) | (expiry - now <= 40 ? 4 : 0) : 0;
}

int nearby_blood()
{
    if (!active())
        return 0;
    int units = 0;
    for (const auto& entry : blood_ledger())
        if (grid_distance(entry.pos, you.pos()) <= 4 && visible_fuel(entry.pos))
            units += entry.units;
    return units;
}

int regeneration_bonus()
{
    return active(3) && !you.duration[DUR_DEATHS_DOOR] && blood_at(you.pos()) ? 100 : 0;
}

int speed_bonus()
{
    return active(3) ? 2 * nearby_blood() : 0;
}

std::string blood_description(const coord_def& pos)
{
    const int units = blood_at(pos);
    const int corpses = corpse_fuel_at(pos);
    if ((!units && !corpses) || !visible_fuel(pos))
        return "";
    int expiry = INT_MAX;
    for (const auto& entry : blood_ledger())
        if (entry.pos == pos)
            expiry = min(expiry, entry.expires);
    std::string result;
    if (units)
        result = make_stringf("Fresh ritual blood: %d unit%s; first expiry in %.1f turns.",
            units, units == 1 ? "" : "s", (expiry - level_elapsed_time()) / 10.0);
    if (corpses)
        result += make_stringf("%sCorpse fuel: %d unit%s; each intact blood-bearing corpse "
                              "is consumed in place of one blood unit.",
            result.empty() ? "" : " ", corpses, corpses == 1 ? "" : "s");
    return result;
}

void on_damage(monster& victim, const actor* agent, int hp_before, int damage, int force)
{
    if (damage <= 0 || !worthy(victim) || sponsor() < 0)
        return;
    victim.props[force_key] = victim.props.exists("vorr_rupture")
        || force >= max(1, victim.max_hit_points / 4);
    if (!agent || !agent->is_player())
        return;
    if (hp_before * 2 >= victim.max_hit_points && victim.hit_points * 2 < victim.max_hit_points
        && !victim.props.exists(wound_key) && budget(victim) > 0)
    {
        victim.props[wound_key] = true;
        --budget(victim);
        release_blood(victim.pos(), 1);
    }
    if (agent->mid == you.mid)
        steal_life(damage);
}

void on_kill(monster& victim, killer_type killer, bool gives_xp, bool pet_kill)
{
    if (!gives_xp || !(YOU_KILL(killer) || pet_kill) || !worthy(victim))
        return;
    const int slot = sponsor();
    if (slot < 0)
        return;
    if (slot == party::active_slot())
        kill_for_sponsor(victim);
    else
    {
        party::scoped_player_context context(slot);
        kill_for_sponsor(victim);
    }
}

void abandon()
{
    bool shared = false;
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
            shared |= slot != party::active_slot() && party::get_player(slot).religion == GOD_VORR;
    if (!shared)
        env.properties.erase(blood_key);
    for (const char* key : {"vorr_heal_clock", "vorr_heal_used", "vorr_heal_fraction"})
        you.props.erase(key);
}

void wrath()
{
    if (you.has_blood())
    {
        mpr("Vorr reopens your wounds!");
        bleed_onto_floor(you.pos(), MONS_PLAYER, 30);
        you.hurt(nullptr, 2 + random2(you.experience_level + 1), BEAM_MMISSILE,
                 KILLED_BY_DIVINE_WRATH, "Vorr's red reckoning");
    }
    else
        mpr("Vorr's thirst finds no blood in you.");
}
}
