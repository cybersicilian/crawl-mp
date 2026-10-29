#include "AppHdr.h"
#include "shell.h"

#include "coord.h"
#include "directn.h"
#include "env.h"
#include "exercise.h"
#include "fight.h"
#include "god-conduct.h"
#include "hints.h"
#include "options.h"
#include "items.h"
#include "level-id.h"
#include "mon-behv.h"
#include "mon-util.h"
#include "movement.h"
#include "mutation.h"
#include "party.h"
#include "player.h"
#include "prompt.h"
#include "quiver.h"
#include "skills.h"
#include "spl-transloc.h"
#include "spl-cast.h"
#include "state.h"
#include "stringutil.h"
#include "target-compass.h"
#include "target.h"
#include "terrain.h"
#include "travel.h"
#include "view.h"
#ifdef USE_TILE_WEB
#include "tileweb.h"
#endif
#ifdef USE_TILE_LOCAL
#include "rltiles/tiledef-main.h"
#endif

namespace shell
{
namespace
{
constexpr const char* retracted_key = "shell_retracted";

class dash_preview : public targeter
{
public:
    dash_preview()
    {
        agent = &you;
        origin = aim = you.pos();
        obeys_mesmerise = true;
    }

    bool valid_aim(coord_def position) override
    {
        const coord_def delta = position - origin;
        if (delta.origin() || (delta.x && delta.y && abs(delta.x) != abs(delta.y)))
        {
            why_not = "Choose one of the eight compass directions.";
            return false;
        }
        if (!you.see_cell(position))
        {
            why_not = "You cannot see that direction's target.";
            return false;
        }
        return true;
    }

    bool set_aim(coord_def position) override
    {
        path.clear();
        if (!valid_aim(position) || !targeter::set_aim(position))
            return false;
        const coord_def delta(sgn(aim.x - origin.x), sgn(aim.y - origin.y));
        for (coord_def cell = origin + delta;
             in_bounds(cell) && you.see_cell(cell); cell += delta)
        {
            // Preview only visible information. Unseen creatures and traps
            // can interrupt the actual traversal without leaking into aiming.
            if (feat_is_solid(env.grid(cell))
                || !you.can_pass_through_feat(env.grid(cell))
                || !you.is_habitable(cell))
                break;
            path.push_back(cell);
            const monster* victim = monster_at(cell);
            const player* peer = party::player_at(cell);
            if ((peer && you.can_see(*peer)) || (victim && you.can_see(*victim)))
                break;
        }
        return true;
    }

    aff_type is_affected(coord_def cell) override
    {
        const auto found = find(path.begin(), path.end(), cell);
        if (found == path.end())
            return AFF_NO;
        return cell == path.back() ? AFF_YES : AFF_MAYBE;
    }

    bool can_affect_walls() override { return true; }
private:
    vector<coord_def> path;
};

bool reject(const string& reason, bool quiet)
{
    if (!quiet)
        mpr(reason);
    return false;
}

void redraw()
{
    you.redraw_armour_class = you.redraw_evasion = true;
    you.redraw_status_lights = true;
}

void hit(monster& victim, int distance)
{
    if (!could_harm(&you, &victim, true, true))
        return;

    god_conduct_trigger conducts[3];
    set_attack_conducts(conducts, victim, you.aware_of(victim));
    const int damage = victim.apply_ac(dash_damage(distance).roll());
    mprf("You slam into %s%s", victim.name(DESC_THE).c_str(),
         damage ? "!" : ", but do no damage.");
    you.attempted_attack = true;
    exercise(SK_UNARMED_COMBAT, 1);
    victim.hurt(&you, damage, BEAM_MISSILE, KILLED_BY_BEAM, "", "shell dash");
    if (victim.alive())
    {
        behaviour_event(&victim, ME_WHACK, &you);
        if (you.can_see(victim))
            print_wounds(victim);
    }
}

void hit(player& victim, int distance)
{
    if (!could_harm(&you, &victim, true, true))
        return;
    player* attacker = &you;
    const int damage_roll = dash_damage(distance).roll();
    const int slot = party::player_slot_at(victim.pos());
    mprf("You slam into %s!", victim.your_name.c_str());
    you.attempted_attack = true;
    exercise(SK_UNARMED_COMBAT, 1);
    // Player damage and armour queries require the recipient's native context.
    party::scoped_player_context context(slot);
    const int damage = you.apply_ac(damage_roll);
    you.hurt(attacker, damage, BEAM_MISSILE, KILLED_BY_BEAM,
             attacker->your_name, "shell dash");
}
}

bool retracted()
{
    return you.has_mutation(MUT_ARMOURED_SHELL)
           && you.props.exists(retracted_key)
           && you.props[retracted_key].get_bool();
}

bool can_retract(bool quiet)
{
    if (!you.has_mutation(MUT_ARMOURED_SHELL))
        return reject("You have no shell to retract into.", quiet);
    return true;
}

std::string dash_block_reason()
{
    if (you.duration[DUR_SHELL_DASH_COOLDOWN])
        return make_stringf("Your shell is recovering (%d turns). "
                            "You cannot dash yet.",
                            (you.duration[DUR_SHELL_DASH_COOLDOWN]
                             + BASELINE_DELAY - 1) / BASELINE_DELAY);
    if (!retracted())
        return "You must retract into your shell first.";
    const string reason = movement_impossible_reason();
    if (!reason.empty())
        return reason;
    if (you.is_constricted())
        return "You cannot roll while constricted.";
    if (you.confused())
        return "You are too confused to steer your shell.";
    return "";
}

bool can_dash(bool quiet)
{
    const string reason = dash_block_reason();
    return reason.empty() || reject(reason, quiet);
}

void emerge(bool quiet)
{
    const bool was_retracted = retracted();
    you.props.erase(retracted_key);
    if (was_retracted)
    {
        redraw();
        if (!quiet)
            mpr("You emerge from your shell.");
    }
}

spret retract()
{
    if (!can_retract())
        return spret::abort;
    if (retracted())
        emerge();
    else
    {
        you.props[retracted_key] = true;
        redraw();
        mpr("You retract into your shell. You move at half speed; use Shell Dash to launch yourself!");
    }
    return spret::success;
}

dice_def dash_damage(int distance)
{
    // Actual tiles traversed, including the final impact into a creature.
    return dice_def(2, 3 + you.experience_level / 2
                       + you.skill(SK_UNARMED_COMBAT) + 2 * max(0, distance));
}

int dash_recoil(int distance, bool impact)
{
    return min(5, 1 + max(0, distance) / 4 + (impact ? 1 : 0));
}

std::unique_ptr<targeter> dash_targeter()
{
    return make_unique<dash_preview>();
}

spret dash(const coord_def& direction)
{
    if (!can_dash())
        return spret::abort;
    if (direction.origin() || abs(direction.x) > 1 || abs(direction.y) > 1)
        return spret::abort;

    int distance = 0;
    bool attacked = false;
    bool announced = false;
    vector<coord_def> trail = {you.pos()};
    const level_id origin_level = level_id::current();
    while (you.alive())
    {
        const coord_def next = you.pos() + direction;
        if (!in_bounds(next) || feat_is_solid(env.grid(next)))
            break;
        if (player* victim = party::player_at(next))
        {
            if (could_harm(&you, victim) && !crawl_state.disables[DIS_CONFIRMATIONS]
                && !yesno(make_stringf("Really roll into %s?", victim->your_name.c_str()).c_str(),
                          false, 'n'))
                break;
            hit(*victim, distance + 1);
            trail.push_back(next);
            attacked = true;
            break;
        }
        if (monster* victim = monster_at(next))
        {
            if (you.get_beholder(next) || you.get_fearmonger(next))
                break;
            if (could_harm(&you, victim) && stop_attack_prompt(victim, false, next))
                break;
            hit(*victim, distance + 1);
            trail.push_back(next);
            attacked = true;
            break; // Even a killing impact stops the shell.
        }
        if (!you.can_pass_through_feat(env.grid(next))
            || !you.is_habitable(next))
            break;
        if (you.get_beholder(next) || you.get_fearmonger(next))
        {
            mpr("You cannot roll in that direction while afraid or mesmerised.");
            break;
        }
        // Each step uses ordinary movement warnings and location effects.
        // Cancelling after some movement still spends the dash's turn.
        if (!check_moveto(next, "roll", false)
            || (!distance && cancel_harmful_move()))
            break;
        if (!announced)
        {
            mpr("You launch yourself in a spinning shell!");
            announced = true;
        }
        you.move_to(next, MV_NO_TRAVEL_STOP, true);
        ++distance;
        trail.push_back(next);
        you.finalise_movement();
        // A trap may teleport, shaft, restrain, or otherwise interrupt us.
        if (you.pos() != next || level_id::current() != origin_level
            || !you.on_current_level || !retracted()
            || !can_dash(true))
            break;
    }
    stop_running();
    crawl_state.cancel_cmd_repeat();
    if (!distance && !attacked)
    {
        mpr("You have no room to roll that way.");
        return spret::abort;
    }
    you.time_taken = player_speed();
    you.turn_is_over = true;
    // The native turn loop immediately subtracts this action's delay. Leave
    // five full standard turns of recovery, independent of haste or slow.
    you.duration[DUR_SHELL_DASH_COOLDOWN] = 5 * BASELINE_DELAY + you.time_taken;
    you.redraw_status_lights = true;
    if (you.alive())
    {
        const int recoil = min(you.hp - 1, dash_recoil(distance, attacked));
        if (recoil > 0)
        {
            dec_hp(recoil, false);
            mprf("The roll jars you for %d damage.", recoil);
        }
    }
    if (level_id::current() == origin_level && you.on_current_level
        && (Options.use_animations & UA_BEAM))
    {
#ifdef USE_TILE_WEB
        tiles.send_traversal_effect(trail, attacked, "shell");
#else
        // Console and local tiles share the native overlay animation contract.
        for (const coord_def& cell : trail)
            if (you.see_cell(cell))
            {
#ifdef USE_TILE_LOCAL
                flash_tile(cell, BROWN, 0, TILE_CLOUD_DUST);
#else
                flash_tile(cell, BROWN, 0);
#endif
            }
        animation_delay(80, true);
        view_clear_overlays();
#endif
    }
    if (distance)
    {
        player_did_deliberate_movement();
        request_autopickup();
    }
    emerge();
    return spret::success;
}

spret choose_dash_direction(dist* target)
{
    if (!can_dash())
        return spret::abort;
    if (target && target->isCancel)
        return spret::abort;
    if (target && target->isValid && !target->isCancel)
    {
        const coord_def delta = target->isTarget ? target->target - you.pos()
                                                : target->delta;
        // Positional targets must lie on one of the eight compass rays.
        if (delta.x && delta.y && abs(delta.x) != abs(delta.y))
        {
            mpr("Choose one of the eight compass directions.");
            return spret::abort;
        }
        return dash(coord_def(sgn(delta.x), sgn(delta.y)));
    }
    mpr("Shell Dash: choose a direction (you roll until blocked).");
    const coord_def delta = prompt_compass_direction();
    if (delta.origin())
        return spret::abort;
    return dash(delta);
}

void prepare_command(command_type command)
{
    if (!retracted())
        return;
    if (command == CMD_FIRE || command == CMD_PRIMARY_ATTACK)
    {
        const auto action = command == CMD_FIRE ? you.quiver_action.get()
                                                : quiver::get_primary_action();
        if (*action == *quiver::ability_to_action(ABIL_SHELL_DASH))
            return;
    }
    // Looking, waiting, saving and movement preserve the stance. Physical
    // actions emerge automatically, avoiding an extra ability-menu visit.
    if ((command >= CMD_ATTACK_LEFT && command <= CMD_CLOSE_DOOR)
        || (command >= CMD_GO_UPSTAIRS && command <= CMD_GO_DOWNSTAIRS)
        || (command >= CMD_PICKUP && command <= CMD_DROP_LAST)
        || (command >= CMD_EVOKE && command <= CMD_FIRE)
        || (command >= CMD_FIRE_ITEM_NO_QUIVER && command <= CMD_REMOVE_JEWELLERY)
        || (command >= CMD_ZAP_WAND && command <= CMD_MEMORISE_SPELL)
        || command == CMD_QUAFF || command == CMD_READ || command == CMD_SHOUT
        || (command >= CMD_AUTOFIGHT && command <= CMD_UNEQUIP))
        emerge();
}
}
