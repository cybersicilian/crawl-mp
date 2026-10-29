#include "AppHdr.h"
#include "god-vorr.h"
#include "god-vorr-internal.h"

#include "act-iter.h"
#include "beam.h"
#include "directn.h"
#include "env.h"
#include "fight.h"
#include "level-time.h"
#include "losglobal.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "prompt.h"
#include "random.h"
#include "shout.h"
#include "skills.h"
#include "spl-transloc.h"
#include "state.h"
#include "stringutil.h"
#include "target.h"
#include "terrain.h"

namespace vorr
{
namespace
{
bool is_rite(ability_type ability)
{
    return ability == ABIL_VORR_RUPTURE || ability == ABIL_VORR_RED_PASSAGE
        || ability == ABIL_VORR_GREAT_LETTING;
}

class blood_targeter : public targeter
{
public:
    explicit blood_targeter(ability_type rite) : ability(rite)
    {
        agent = &you;
        origin = aim = you.pos();
        obeys_mesmerise = rite == ABIL_VORR_RED_PASSAGE;
    }
    bool valid_aim(coord_def pos) override
    {
        why_not.clear();
        const int range = vorr::ability_range(ability);
        if (!in_bounds(pos) || !you.see_cell_no_trans(pos)
            || grid_distance(pos, origin) > range)
            why_not = "That place is outside your visible ritual range.";
        else if (ability == ABIL_VORR_RUPTURE)
        {
            const monster* victim = monster_at(pos);
            if (!victim || !you.can_see(*victim) || !victim->hostile() || party::is_proxy_monster(*victim))
                why_not = "Choose a visible hostile creature.";
            else if (!victim->has_blood())
                why_not = "There is no blood to call from that creature.";
        }
        else if (ability == ABIL_VORR_RED_PASSAGE)
        {
            if (pos == origin || feat_is_solid(env.grid(pos)) || cell_vetoes_teleport(pos))
                why_not = "You cannot emerge there.";
            else if (you.get_beholder(pos) || you.get_fearmonger(pos))
                why_not = "You cannot break free in that direction.";
        }
        if (!why_not.empty())
            return false;
        why_not = payment_reason(plan_payment(ability, pos));
        if (!why_not.empty())
            return false;
        return true;
    }
    bool set_aim(coord_def pos) override
    {
        if (!valid_aim(pos))
            return false;
        aim = pos;
        payment = plan_payment(ability, pos);
        fuel = payment.cells;
        return true;
    }
    aff_type is_affected(coord_def pos) override
    {
        if (!in_bounds(pos) || !you.see_cell_no_trans(pos))
            return AFF_NO;
        if (ability == ABIL_VORR_RUPTURE)
        {
            if (pos == aim)
                return AFF_YES;
            if (grid_distance(pos, aim) <= 2 && cell_see_cell(aim, pos, LOS_SOLID))
                return AFF_MAYBE;
        }
        else if (ability == ABIL_VORR_RED_PASSAGE)
        {
            if (pos == aim)
                return AFF_LANDING;
            if (grid_distance(pos, aim) == 1 && cell_see_cell(aim, pos, LOS_SOLID))
                return AFF_YES;
        }
        else
            for (const auto& cell : fuel)
                if (grid_distance(pos, cell) <= 1 && cell_see_cell(cell, pos, LOS_SOLID))
                    return AFF_YES;
        return std::find(fuel.begin(), fuel.end(), pos) != fuel.end() ? AFF_TRACER : AFF_NO;
    }
    bool harmful_to_player() override { return false; }
    const rite_payment& payment_plan() const { return payment; }
private:
    ability_type ability;
    rite_payment payment;
    std::vector<coord_def> fuel;
};

void strike(blood_targeter& area, int dice, int sides)
{
    std::vector<mid_t> targets;
    for (monster_near_iterator mon(you.pos(), LOS_NO_TRANS); mon; ++mon)
        if (area.is_affected(mon->pos()) >= AFF_YES)
            targets.push_back(mon->mid);
    for (mid_t id : targets)
        if (monster* mon = monster_by_mid(id))
            mon->hurt(&you, mon->apply_ac(roll_dice(dice, sides)), BEAM_MMISSILE);
}
}

std::string ability_reason(ability_type ability)
{
    if (!is_rite(ability))
        return "";
    const int rank = ability == ABIL_VORR_RUPTURE ? 1 : ability == ABIL_VORR_RED_PASSAGE ? 3 : 5;
    if (!active(rank))
        return "Vorr has not granted you this rite.";
    if (ability == ABIL_VORR_RED_PASSAGE)
    {
        if (you.no_tele(true))
            return "You cannot pass through blood while prevented from blinking.";
        if (you.duration[DUR_BLINK_COOLDOWN])
            return "You are still too unstable to open a Red Passage.";
    }
    else if (ability == ABIL_VORR_RUPTURE)
        return payment_reason(plan_payment(ability, you.pos()));
    return "";
}

int ability_range(ability_type ability)
{
    return ability == ABIL_VORR_RUPTURE ? 5 : 6;
}

std::string damage_description(ability_type ability)
{
    const int invo = you.skill(SK_INVOCATIONS);
    if (ability == ABIL_VORR_RUPTURE)
        return make_stringf("2d%d (reduced by armour)", 8 + invo / 2);
    if (ability == ABIL_VORR_RED_PASSAGE)
        return make_stringf("1d%d on arrival (reduced by armour)", 6 + invo / 3);
    return make_stringf("3d%d once per creature (reduced by armour)", 10 + invo / 2);
}

std::string cost_description(ability_type ability)
{
    if (!self_blood_available())
        return make_stringf("%d Blood/corpses%s; no self-exsanguination (bloodless)",
            ability == ABIL_VORR_GREAT_LETTING ? 8 : 2,
            ability == ABIL_VORR_GREAT_LETTING ? ", Piety" : "");
    return make_stringf("%d Blood/corpses%s; 10%% max HP per missing blood (%d HP each)",
        ability == ABIL_VORR_GREAT_LETTING ? 8 : 2,
        ability == ABIL_VORR_GREAT_LETTING ? ", Piety" : "", self_blood_cost());
}

std::string detailed_cost_description(ability_type ability)
{
    std::string result = cost_description(ability) + ".\n"
        "Fresh ground blood is used first, then intact blood-bearing corpses (one unit each). "
        "Self-exsanguination replaces each missing unit with 10% of your maximum HP, "
        "rounded up per unit. Bloodless species and bloodless forms cannot self-exsanguinate. "
        "You must survive the complete payment. "
        "The exact HP cost is confirmed after targeting. Cancellation and failed rites spend no fuel or HP.";
    if (ability == ABIL_VORR_RED_PASSAGE)
        result += " Each endpoint costs one unit; self-exsanguination can supply either endpoint.";
    if (ability == ABIL_VORR_RUPTURE)
    {
        result += make_stringf("\nCurrent nearby fuel: %d blood units and %d corpses; "
                              "%s", nearby_blood(), nearby_corpses(),
            self_blood_available()
                ? make_stringf("self-exsanguination would cost %d HP.",
                    plan_payment(ability, you.pos()).hp).c_str()
                : "self-exsanguination is unavailable.");
    }
    return result;
}

std::unique_ptr<targeter> ability_targeter(ability_type ability)
{
    return std::unique_ptr<targeter>(new blood_targeter(ability));
}

spret invoke(ability_type ability, bool fail, const coord_def* target)
{
    if (!is_rite(ability))
        return spret::abort;
    const std::string reason = ability_reason(ability);
    if (!reason.empty())
    {
        mpr(reason);
        return spret::abort;
    }
    blood_targeter area(ability);
    coord_def destination;
    if (target)
        destination = *target;
    else
    {
        direction_chooser_args args;
        args.restricts = DIR_TARGET;
        args.mode = ability == ABIL_VORR_RUPTURE ? TARG_HOSTILE : TARG_ANY;
        args.range = vorr::ability_range(ability);
        args.needs_path = false;
        args.hitfunc = &area;
        args.top_prompt = ability == ABIL_VORR_RED_PASSAGE ? "Emerge from which blood?"
            : ability == ABIL_VORR_RUPTURE ? "Rupture which creature?" : "Gather the blood where?";
        dist selected;
        direction(selected, args);
        if (!selected.isValid || crawl_state.seen_hups)
            return crawl_state.seen_hups ? spret::seen_hups : spret::abort;
        destination = selected.target;
    }
    if (!area.set_aim(destination))
    {
        mpr(area.why_not);
        return spret::abort;
    }
    if (ability != ABIL_VORR_RUPTURE)
    {
        if (stop_attack_prompt(area, ability == ABIL_VORR_RED_PASSAGE ? "Red Passage" : "The Great Letting"))
            return spret::abort;
        if (ability == ABIL_VORR_RED_PASSAGE && !check_moveto(destination, "pass through blood", false, false))
            return spret::abort;
    }
    const auto plan = area.payment_plan();
    if (plan.hp && !crawl_state.disables[DIS_CONFIRMATIONS]
        && !yesno(make_stringf("Self-exsanguinate for %d HP to replace %d missing blood?",
                               plan.hp, plan.missing).c_str(), false, 'n'))
    {
        return spret::abort;
    }
    fail_check();
    if (!commit_payment(plan))
    {
        mpr("The ritual's fuel or health cost changed; choose the rite again.");
        return spret::abort;
    }
    const int invo = you.skill(SK_INVOCATIONS);
    if (ability == ABIL_VORR_RUPTURE)
    {
        monster* victim = monster_at(destination);
        const mid_t id = victim->mid;
        victim->props["vorr_rupture"] = true;
        mpr("You wrench the blood from your foe's wounds!");
        victim->hurt(&you, victim->apply_ac(roll_dice(2, 8 + invo / 2)), BEAM_MMISSILE);
        if (monster* survivor = monster_by_mid(id))
            survivor->props.erase("vorr_rupture");
    }
    else if (ability == ABIL_VORR_RED_PASSAGE)
    {
        you.stop_being_constricted(false, "pass through blood");
        you.move_to(destination, MV_DELIBERATE | MV_TRANSLOCATION, true);
        crawl_state.cancel_cmd_again();
        crawl_state.cancel_cmd_repeat();
        mpr("You sink into the blood and erupt from the far pool!");
        noisy(8, destination);
        strike(area, 1, 6 + invo / 3);
        you.finalise_movement();
    }
    else
    {
        mpr("The blood rises. Vorr gathers the red wake!");
        noisy(12, destination);
        strike(area, 3, 10 + invo / 2);
    }
    return spret::success;
}
}
