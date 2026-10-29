#include "AppHdr.h"

#include "hermit-crab.h"
#include "coord.h"
#include "coordit.h"
#include "delay.h"
#include "message.h"
#include "mon-util.h"
#include "movement.h"
#include "nearby-danger.h"
#include "player.h"
#include "player-equip.h"
#include "prompt.h"
#include "spl-cast.h"
#include "state.h"
#include "terrain.h"

namespace hermit_crab
{
namespace
{
const char* const SHELL_SIZE = "hermit_crab_shell_size";
const char* const LAST_GROWTH = "hermit_crab_last_growth";
const char* const MOULT_CHANCES = "hermit_crab_moult_chances";
const char* const LAST_MOULT_LEVEL = "hermit_crab_last_moult_level";
const char* const WALK_UNTIL = "hermit_crab_walk_until";
const char* const SHELL_ESCAPE_PENDING = "hermit_crab_escape_pending";

class MoultDelay : public Delay
{
public:
    MoultDelay() : Delay(4) {}
    const char* name() const override { return "hermit_moult"; }
    const char* cooperative_activity_name() const override { return "molting"; }
    bool try_interrupt(bool) override
    {
        mpr("Your molting is interrupted.");
        return true;
    }
private:
    void start() override { mpr("You begin to molt, leaving yourself vulnerable."); }
    void tick() override
    {
        you.time_taken = BASELINE_DELAY;
        you.turn_is_over = true;
        if (duration == 0)
            finish_moult();
        else
            mprf(MSGCH_MULTITURN_ACTION, "You continue molting.");
    }
    void finish() override {}
};
}

size_type shell_size(const player& p)
{
    if (!p.props.exists(SHELL_SIZE))
        return SIZE_MEDIUM;
    return static_cast<size_type>(max(static_cast<int>(SIZE_TINY),
        min(static_cast<int>(SIZE_GIANT), p.props[SHELL_SIZE].get_int())));
}

int armour_bonus(const player& p)
{
    return p.species == SP_HERMIT_CRAB ? 2 * shell_size(p) : 0;
}

bool grow_shell(player& p, int level)
{
    if (p.species != SP_HERMIT_CRAB || level <= 0 || level % 8 != 0
        || (p.props.exists(LAST_GROWTH) && p.props[LAST_GROWTH].get_int() >= level))
        return false;
    p.props[LAST_GROWTH].get_int() = level;
    const size_type current = shell_size(p);
    if (current >= SIZE_GIANT)
        return false;
    p.props[SHELL_SIZE].get_int() = static_cast<int>(current) + 1;
    p.redraw_armour_class = true;
    p.redraw_evasion = true;
    p.redraw_status_lights = true;
    return true;
}

int moult_chances(const player& p)
{
    return p.species == SP_HERMIT_CRAB && p.props.exists(MOULT_CHANCES)
           ? max(0, p.props[MOULT_CHANCES].get_int()) : 0;
}

bool gain_moult_chance(player& p, int level)
{
    if (p.species != SP_HERMIT_CRAB || level <= 1
        || (p.props.exists(LAST_MOULT_LEVEL)
            && p.props[LAST_MOULT_LEVEL].get_int() >= level))
        return false;
    p.props[LAST_MOULT_LEVEL].get_int() = level;
    p.props[MOULT_CHANCES].get_int() = moult_chances(p) + 1;
    return true;
}

string moult_reason(const player& p)
{
    if (p.species != SP_HERMIT_CRAB)
        return "Only Hermit Crabs can molt.";
    if (moult_chances(p) <= 0)
        return "You need a molting opportunity; gain one at each new experience level.";
    if (p.form != p.default_form)
        return "You must return to your natural form to molt.";
    if (p.duration[DUR_DEATHS_DOOR])
        return "You cannot molt while in Death's Door.";
    return "";
}

spret begin_moult()
{
    const string reason = moult_reason(you);
    if (!reason.empty())
    {
        mpr(reason);
        return spret::abort;
    }
    if (!i_feel_safe(false, false, true)
        && !yesno("Molt while enemies are nearby?", false, 'n'))
        return spret::abort;
    you.props[MOULT_CHANCES].get_int()--;
    you.redraw_status_lights = true;
    start_delay<MoultDelay>();
    return spret::success;
}

void finish_moult()
{
    you.duration[DUR_POISONING] = 0;
    you.duration[DUR_CONF] = 0;
    set_hp(you.hp_max);
    you.redraw_hit_points = true;
    you.redraw_status_lights = true;
    mpr("You finish molting and feel renewed.");
}

bool break_shell(player& p)
{
    if (p.species != SP_HERMIT_CRAB || shell_size(p) <= SIZE_TINY)
        return false;
    p.props[SHELL_SIZE].get_int() = static_cast<int>(shell_size(p)) - 1;
    p.props[SHELL_ESCAPE_PENDING].get_bool() = true;
    p.redraw_armour_class = true;
    p.redraw_evasion = true;
    p.redraw_status_lights = true;
    return true;
}

void reconcile_equipment()
{
    if (you.species != SP_HERMIT_CRAB)
        return;
    const vector<item_def*> to_remove = you.equipment.get_forced_removal_list(true);
    for (item_def* item : to_remove)
    {
        mprf("%s no longer fits and falls away!", item->name(DESC_YOUR).c_str());
        unequip_item(*item, false);
    }
    you.equipment.update();
}

void start_crab_walk(player& p)
{
    if (p.species == SP_HERMIT_CRAB && p.props.exists(SHELL_ESCAPE_PENDING)
        && p.props[SHELL_ESCAPE_PENDING].get_bool())
    {
        p.props[WALK_UNTIL].get_int() = p.elapsed_time + 10 * BASELINE_DELAY;
        p.props.erase(SHELL_ESCAPE_PENDING);
    }
}

int crab_walk_remaining(const player& p)
{
    if (p.species != SP_HERMIT_CRAB || !p.props.exists(WALK_UNTIL))
        return 0;
    return max(0, p.props[WALK_UNTIL].get_int() - p.elapsed_time);
}

bool crab_walk_ready(const player& p)
{
    return crab_walk_remaining(p) > 0;
}

bool crab_walk_shape(const coord_def& from, const coord_def& to)
{
    const coord_def delta = to - from;
    return (abs(delta.x) == 1 && abs(delta.y) == 2)
           || (abs(delta.x) == 2 && abs(delta.y) == 1);
}

vector<coord_def> crab_walk_targets()
{
    vector<coord_def> targets;
    for (radius_iterator ri(you.pos(), 2, C_SQUARE, LOS_NO_TRANS, false); ri; ++ri)
        if (crab_walk_shape(you.pos(), *ri) && !cell_is_solid(*ri))
            targets.push_back(*ri);
    return targets;
}

spret crab_walk(const coord_def& target)
{
    if (!crab_walk_ready(you) || !in_bounds(target)
        || !crab_walk_shape(you.pos(), target) || !you.see_cell_no_trans(target)
        || cell_is_solid(target) || actor_at(target)
        || you.get_beholder(target) || you.get_fearmonger(target))
    {
        mpr("You cannot scuttle there.");
        return spret::abort;
    }
    if (!check_moveto(target, "scuttle", false, false) || cancel_harmful_move())
        return spret::abort;
    if (!you.attempt_escape())
        return spret::success;
    you.time_taken = player_overall_move_delay(BASELINE_DELAY);
    you.move_to(target, MV_DELIBERATE);
    crawl_state.cancel_cmd_again();
    crawl_state.cancel_cmd_repeat();
    mpr("You scuttle sideways.");
    return spret::success;
}
}
