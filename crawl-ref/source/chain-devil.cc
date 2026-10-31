#include "AppHdr.h"
#include "chain-devil.h"

#include "act-iter.h"
#include "actor-displacement.h"
#include "bloodcraft.h"
#include "directn.h"
#include "env.h"
#include "fight.h"
#include "god-conduct.h"
#include "level-time.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-util.h"
#include "mutation.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "state.h"
#include "stringutil.h"
#include "terrain.h"
#include "transform.h"

namespace chains
{
namespace
{
constexpr const char* relation_key = "living_chain";
constexpr const char* target_key = "living_chain_target";
constexpr int tension_per_tile = 10;

player* source(monster& target)
{
    if (!target.props.exists(relation_key))
        return nullptr;
    return party::player_by_mid(target.props[relation_key].get_table()["source"].get_int());
}

void detach(monster& target)
{
    if (!target.props.exists(relation_key))
        return;
    player* owner = source(target);
    if (owner && owner->can_see(target))
        simple_monster_message(target, " is released from the living chain.");
    target.props.erase(relation_key);
    target.props[bloodcraft::recovery_key] = level_elapsed_time(target) + 30;
    if (owner)
    {
        owner->props.erase(target_key);
        // Durations use the owner's clock, never the target's floor clock.
        owner->duration[DUR_CHAIN_RECOVERY] = max(owner->duration[DUR_CHAIN_RECOVERY], 50);
        owner->redraw_status_lights = true;
    }
}

monster* owned(player& owner)
{
    if (!owner.props.exists(target_key))
        return nullptr;
    monster* target = monster_by_mid(owner.props[target_key].get_int());
    if (target && source(*target) == &owner)
        return target;
    owner.props.erase(target_key);
    owner.duration[DUR_CHAIN_RECOVERY] = max(owner.duration[DUR_CHAIN_RECOVERY], 50);
    return nullptr;
}

bool valid(monster& target, bool check_reach = true)
{
    player* owner = source(target);
    if (!owner)
        return false;
    const auto& row = target.props[relation_key].get_table();
    const bool pinned = row["pinned"].get_bool();
    const coord_def anchor = pinned
        ? coord_def(row["x"].get_int(), row["y"].get_int()) : owner->pos();
    const int slot = party::slot_for_mid(owner->mid);
    return target.alive() && owner->alive() && owner->on_current_level
        && (slot < 0 || !party::is_player_downed(slot)) && has_body(*owner)
        && row["expires"].get_int() > level_elapsed_time(target)
        && (!check_reach || grid_distance(target.pos(), anchor) <= row["radius"].get_int())
        && owner->can_see(target) && owner->see_cell_no_trans(target.pos());
}

bool mobile(monster& target)
{
    return !target.props[relation_key].get_table()["pinned"].get_bool();
}

void recover_after_attack()
{
    you.duration[DUR_CHAIN_RECOVERY] = 50 + BASELINE_DELAY;
    you.redraw_status_lights = true;
}
}

bool has_body(const player& owner)
{
    return owner.species == SP_CHAIN_DEVIL && !form_changes_anatomy(owner.form)
        && !get_form(owner.form)->changes_substance;
}

bool held(monster& target)
{
    if (!target.props.exists(relation_key))
        return false;
    if (valid(target))
        return true;
    detach(target);
    return false;
}

bool attachment_eligible(monster& target)
{
    return !held(target) && !target.is_stationary() && !target.res_constrict()
        && !target.is_constricted() && !target.caught()
        && !bloodcraft::bound(target) && !bloodcraft::binding_recovery(target);
}

bool attach(monster& target)
{
    if (!has_body(you) || owned(you) || you.duration[DUR_CHAIN_RECOVERY]
        || !attachment_eligible(target) || !you.can_see(target)
        || !you.see_cell_no_trans(target.pos())
        || grid_distance(you.pos(), target.pos()) > lash_range)
        return false;
    CrawlHashTable row;
    row["version"] = 1;
    row["source"] = static_cast<int>(you.mid);
    row["radius"] = grid_distance(you.pos(), target.pos());
    row["expires"] = level_elapsed_time(target)
        + (you.experience_level >= 13 ? 160 : you.experience_level >= 7 ? 120 : 80);
    row["pinned"] = false;
    row["x"] = target.pos().x;
    row["y"] = target.pos().y;
    target.props[relation_key] = row;
    you.props[target_key] = static_cast<int>(target.mid);
    you.redraw_status_lights = true;
    return true;
}

void release(player& owner)
{
    if (monster* target = owned(owner))
        detach(*target);
}

void owner_moved(player& owner, coord_def previous, movement_type flags)
{
    if (owner.pos() == previous || (flags & MV_INTERNAL))
        return;
    monster* target = owned(owner);
    if (!target)
        return;
    if (flags & MV_TRANSLOCATION)
    {
        detach(*target);
        return;
    }
    auto& row = target->props[relation_key].get_table();
    if (row["pinned"].get_bool())
        return;
    const int reach = row["radius"].get_int();
    const int distance = grid_distance(owner.pos(), target->pos());
    if (distance <= reach)
        return;
    // Only a still-valid tether may give under tension. A movement cannot
    // rescue an expired, hidden or already overextended relationship.
    if (!valid(*target, false) || grid_distance(previous, target->pos()) > reach)
    {
        detach(*target);
        return;
    }
    const int strength = owner.strength();
    if (x_chance_in_y(strength, strength + tension_per_tile * (distance - reach)))
    {
        row["radius"] = distance;
        owner.redraw_status_lights = true;
        if (&owner == &you)
            mpr("You hold firm as your living chain stretches.");
    }
    else
    {
        if (&owner == &you)
            mpr("Your grip fails as the chain pulls taut!");
        detach(*target);
    }
}

void refresh()
{
    for (monster_iterator target; target; ++target)
        held(**target);
    if (you.props.exists(target_key))
        owned(you);
}

bool may_step(monster& target, coord_def destination)
{
    if (!held(target))
        return true;
    const auto& row = target.props[relation_key].get_table();
    const coord_def anchor = row["pinned"].get_bool()
        ? coord_def(row["x"].get_int(), row["y"].get_int()) : source(target)->pos();
    return grid_distance(destination, anchor) <= row["radius"].get_int();
}

bool strain(monster& target)
{
    if (!held(target))
        return false;
    auto& deadline = target.props[relation_key].get_table()["expires"].get_int();
    deadline -= BASELINE_DELAY;
    simple_monster_message(target, " strains against the living chain.");
    held(target);
    return true;
}

std::string reason(ability_type ability)
{
    refresh();
    if (ability == ABIL_RELEASE_CHAIN)
        return owned(you) ? "" : "You hold no chain.";
    if (!has_body(you))
        return "Your current body cannot use living chains.";
    if (you.confused() || you.berserk() || you.cannot_act())
        return "You cannot direct your chains in this state.";
    monster* target = owned(you);
    if (ability == ABIL_CHAIN_LASH)
        return target ? "Release your current chain first."
            : you.duration[DUR_CHAIN_RECOVERY] ? "Your chains are recovering." : "";
    if (!target || !mobile(*target))
        return "You need a mobile tether.";
    if (ability == ABIL_REEL_IN)
    {
        if (you.experience_level < 7)
            return "Reel In requires XL7.";
        if (target->resists_dislodge("being reeled")
            || physical_pull_path(*target, you.pos(), 2).empty())
            return "There is no legal step toward you.";
    }
    if (ability == ABIL_PINNING_CHAIN)
    {
        if (you.experience_level < 13)
            return "Pinning Chain requires XL13.";
        const int remaining = target->props[relation_key].get_table()["expires"].get_int()
            - level_elapsed_time(*target);
        if (remaining < 20 || !feat_has_solid_floor(env.grid(target->pos())))
            return "Pinning needs solid floor and two turns of tether remaining.";
    }
    return "";
}

std::string summary()
{
    refresh();
    if (monster* target = owned(you))
    {
        const auto& row = target->props[relation_key].get_table();
        const int strength = you.strength();
        const std::string tension = mobile(*target)
            ? make_stringf(" Retreat hold, one extra tile: %d%% (Str %d).",
                100 * strength / (strength + tension_per_tile), strength) : "";
        return make_stringf("%s: %s, %.1f turns remaining; reach %d.%s",
            mobile(*target) ? "Tether" : "Pin", target->name(DESC_THE).c_str(),
            (row["expires"].get_int() - level_elapsed_time(*target)) / 10.0,
            row["radius"].get_int(), tension.c_str());
    }
    return you.duration[DUR_CHAIN_RECOVERY]
        ? make_stringf("Chains recovering: %.1f turns.", you.duration[DUR_CHAIN_RECOVERY] / 10.0)
        : "Living chains ready.";
}

view snapshot()
{
    refresh();
    view result;
    if (monster* target = owned(you))
    {
        const auto& row = target->props[relation_key].get_table();
        result.active = true;
        result.pinned = !mobile(*target);
        result.source = you.pos();
        result.target = target->pos();
        result.anchor = result.pinned
            ? coord_def(row["x"].get_int(), row["y"].get_int()) : you.pos();
        result.radius = row["radius"].get_int();
    }
    return result;
}

spret invoke(ability_type ability, dist* supplied)
{
    const std::string blocked = reason(ability);
    if (!blocked.empty())
    {
        mpr(blocked);
        return spret::abort;
    }
    if (ability == ABIL_RELEASE_CHAIN)
    {
        release(you);
        mpr("You release your living chain.");
        return spret::success;
    }
    if (ability == ABIL_CHAIN_LASH)
    {
        dist selected;
        if (supplied && supplied->isCancel)
            return spret::abort;
        if (supplied && supplied->isValid)
            selected = *supplied;
        else
        {
            direction_chooser_args args;
            args.restricts = DIR_TARGET;
            args.mode = TARG_HOSTILE;
            args.range = lash_range;
            args.needs_path = true;
            args.top_prompt = "Lash which foe? Ineligible bodies take impact damage only.";
            direction(selected, args);
        }
        if (!selected.isValid || selected.isCancel)
            return spret::abort;
        monster* target = monster_at(selected.target);
        if (!target || target->wont_attack() || !you.can_see(*target)
            || !you.see_cell_no_trans(target->pos())
            || grid_distance(target->pos(), you.pos()) > lash_range)
            return spret::abort;
        god_conduct_trigger conducts[3];
        set_attack_conducts(conducts, *target, you.aware_of(*target));
        you.attempted_attack = true;
        // Native EV and shield contests, without weapon/brand/auxiliary hooks.
        const int accuracy = 16 + you.experience_level;
        const bool blocked_hit = target->shield_bonus() > 0
            && random2(accuracy * 130 / 100) < target->shield_bonus();
        if (blocked_hit || random2(accuracy) < random2(target->evasion()))
        {
            if (blocked_hit)
                target->shield_block_succeeded(&you);
            mprf("Your chain %s %s.", blocked_hit ? "is blocked by" : "misses",
                 target->name(DESC_THE).c_str());
            recover_after_attack();
        }
        else
        {
            const int damage = target->apply_ac(1 + random2(5 + you.experience_level / 3));
            mprf("Your chain strikes %s.", target->name(DESC_THE).c_str());
            target->hurt(&you, damage, BEAM_MISSILE, KILLED_BY_BEAM, "", "living chain");
            if (!target->alive() || !attach(*target))
                recover_after_attack();
            else
                simple_monster_message(*target, " is caught by your chain!");
            if (target->alive())
                behaviour_event(target, ME_WHACK, &you);
        }
        return spret::success;
    }
    monster* target = owned(you);
    if (ability == ABIL_REEL_IN)
    {
        const auto path = physical_pull_path(*target, you.pos(), 2);
        release(you);
        for (const auto& cell : path)
        {
            if (!target->alive() || actor_at(cell) || !target->move_to(cell, MV_DEFAULT, true))
                break;
            target->finalise_movement(&you);
            if (target->pos() != cell)
                break;
        }
        mpr("You reel your quarry toward you.");
    }
    else
    {
        auto& row = target->props[relation_key].get_table();
        row["pinned"] = true;
        row["radius"] = 1;
        row["x"] = target->pos().x;
        row["y"] = target->pos().y;
        row["expires"] = min(row["expires"].get_int(), level_elapsed_time(*target) + 80);
        mpr("You fasten the chain to the dungeon floor.");
    }
    return spret::success;
}
}
