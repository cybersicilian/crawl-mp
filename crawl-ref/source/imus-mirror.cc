#include "AppHdr.h"

#include "imus-mirror.h"

#include "beam.h"
#include "coordit.h"
#include "god-type.h"
#include "losglobal.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-ench.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-pathfind.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "religion.h"
#include "spl-cast.h"
#include "spl-summoning.h"
#include "spl-zap.h"
#include "throw.h"
#include "terrain.h"
#include "viewchar.h"

namespace imus_mirror
{
static const char* const MIRROR_KEY = "imus_mirror";
static const char* const TARGET_KEY = "imus_echo_target";
static const char* const SPELL_KEY = "imus_echo_spell";
static const char* const POWER_KEY = "imus_echo_power";
static const char* const ITEM_KEY = "imus_echo_item";
static const char* const PROJECTION_KEY = "imus_echo_projection";

// Unlike a plain actor_at check, the party check also protects a companion
// whose proxy is temporarily absent while player contexts are switching.
static bool recall_spot(coord_def& result)
{
    int count = 0;
    for (radius_iterator ri(you.pos(), 3, C_SQUARE, true); ri; ++ri)
    {
        if (actor_at(*ri) || party::player_at(*ri)
            || !cell_see_cell(you.pos(), *ri, LOS_NO_TRANS)
            || !monster_habitable_grid(MONS_IMUS_MIRROR, *ri))
            continue;
        if (one_chance_in(++count))
            result = *ri;
    }
    return count > 0;
}

static bool echoable_spell(spell_type spell)
{
    return battlesphere_can_mirror(spell) || spell == SPELL_FREEZE
           || spell == SPELL_STICKY_FLAME || spell == SPELL_SANDBLAST
           || spell == SPELL_AIRSTRIKE || spell == SPELL_SEARING_RAY;
}

monster* find(const actor& owner)
{
    if (!owner.props.exists(MIRROR_KEY))
        return nullptr;
    monster* mirror = monster_by_mid(owner.props[MIRROR_KEY].get_int());
    return mirror && mirror->alive() && mirror->type == MONS_IMUS_MIRROR
           && mirror->summoner == owner.mid ? mirror : nullptr;
}

void abandon()
{
    monster* mirror = find(you);
    you.props.erase(MIRROR_KEY);
    you.duration[DUR_IMUS_SPECTRUM] = 0;
    if (mirror)
        monster_die(*mirror, KILL_RESET, NON_MONSTER);
}

spret cast(int power, bool fail)
{
    monster* mirror = find(you);
    if (!mirror && !player_summon_check(MONS_IMUS_MIRROR))
        return spret::abort;
    fail_check();
    const int duration = min((7 + roll_dice(2, max(1, power))) * BASELINE_DELAY, 500);
    if (mirror)
    {
        bool recalled = false;
        if (!you.can_see(*mirror))
        {
            coord_def spot;
            if (recall_spot(spot)
                && mirror->move_to(spot, MV_TRANSLOCATION, true))
                recalled = true;
        }
        mon_enchant timer = mirror->get_ench(ENCH_SUMMON_TIMER);
        timer.duration = min(timer.duration + duration, 500);
        mirror->update_ench(timer);
        if (recalled)
        {
            mirror->finalise_movement();
            mpr("You recall and strengthen your fragmentation.");
        }
        else
            mpr("You strengthen your fragmentation.");
        return spret::success;
    }
    // Stale IDs can occur after a summon expires or its owner changes levels.
    you.props.erase(MIRROR_KEY);
    mgen_data data(MONS_IMUS_MIRROR, BEH_FRIENDLY, you.pos(), you.mindex(),
                   MG_FORCE_BEH, GOD_IMUS_THEA);
    data.set_summoned(&you, 0, duration, false);
    data.hd = max(1, 1 + div_rand_round(power, 11));
    mirror = create_monster(data);
    if (!mirror)
    {
        canned_msg(MSG_NOTHING_HAPPENS);
        return spret::success;
    }
    you.props[MIRROR_KEY] = static_cast<int>(mirror->mid);
    mirror->foe = you.mindex();
    mirror->target = you.pos();
    mpr("Your reflection steps out of the air.");
    return spret::success;
}

// Fire only when the line contains a foe and no allies. The tracer uses the
// summoning player's identity, including their party context.
static bool safe_line(bolt& beam)
{
    targeting_tracer tracer;
    beam.fire(tracer);
    return tracer.friend_info.count == 0 && tracer.hurt_player_count == 0
           && tracer.foe_info.count > 0;
}

static const actor* echo_target(const coord_def& target, const vector<coord_def>& path)
{
    const actor* victim = actor_at(target);
    if (victim && you.can_see(*victim) && !mons_aligned(&you, victim))
        return victim;
    // Fork behavior follows the parent's beam and locks the furthest enemy,
    // rather than guessing an unrelated target for an empty-space aim.
    for (auto i = path.rbegin(); i != path.rend(); ++i)
    {
        victim = actor_at(*i);
        if (victim && you.can_see(*victim) && !mons_aligned(&you, victim))
            return victim;
    }
    return nullptr;
}

void replay_spell(spell_type spell, int power, const coord_def& target,
                  const vector<coord_def>& path)
{
    if (!in_good_standing(GOD_IMUS_THEA))
        return;
    monster* mirror = find(you);
    const actor* victim = echo_target(target, path);
    if (!mirror || !echoable_spell(spell)
        || !in_bounds(target) || mirror->pos() == target || !victim
        || mons_aligned(&you, victim))
        return;
    mirror->props[TARGET_KEY] = static_cast<int>(victim->mid);
    mirror->props[SPELL_KEY] = static_cast<int>(spell);
    mirror->props[POWER_KEY] = power;
    mirror->props.erase(ITEM_KEY);
    mirror->props.erase(PROJECTION_KEY);
}

void replay_projectile(const ranged_attack_beam& original)
{
    if (!in_good_standing(GOD_IMUS_THEA))
        return;
    monster* mirror = find(you);
    const actor* victim = echo_target(original.beam.target, original.beam.path_taken);
    if (!mirror || !in_bounds(original.beam.target) || !victim
        || mons_aligned(&you, victim) || !original.atk.weapon
        || (original.atk.weapon->base_type == OBJ_MISSILES
            && (original.atk.weapon->sub_type == MI_DART
                || original.atk.weapon->sub_type == MI_THROWING_NET))
        || mirror->pos() == original.beam.target)
        return;
    mirror->props[TARGET_KEY] = static_cast<int>(victim->mid);
    mirror->props[SPELL_KEY] = static_cast<int>(SPELL_NO_SPELL);
    mirror->props[ITEM_KEY] = *original.atk.weapon;
    mirror->props[PROJECTION_KEY] = original.atk.is_illusory_projection();
}

bool act(monster& mirror)
{
    if (!mirror.props.exists(TARGET_KEY) || !mirror.props.exists(SPELL_KEY))
        return false;
    const int slot = party::slot_for_mid(mirror.summoner);
    if (slot < 0)
        return false;
    party::scoped_player_context context(slot);
    if (!in_good_standing(GOD_IMUS_THEA))
    {
        mirror.props.erase(TARGET_KEY);
        mirror.props.erase(SPELL_KEY);
        mirror.props.erase(POWER_KEY);
        mirror.props.erase(ITEM_KEY);
        mirror.props.erase(PROJECTION_KEY);
        return false;
    }
    const mid_t target_mid = static_cast<mid_t>(mirror.props[TARGET_KEY].get_int());
    actor* victim = actor_by_mid(target_mid);
    const spell_type spell = static_cast<spell_type>(mirror.props[SPELL_KEY].get_int());
    // One action schedules one echo. If its target is gone, discard it.
    mirror.props.erase(TARGET_KEY);
    mirror.props.erase(SPELL_KEY);
    if (!victim || !victim->alive() || mons_aligned(&you, victim))
    {
        mirror.props.erase(ITEM_KEY);
        return false;
    }

    unique_ptr<ranged_attack_beam> projectile;
    bolt spell_beam;
    if (spell == SPELL_NO_SPELL)
    {
        if (!mirror.props.exists(ITEM_KEY))
            return false;
        item_def& item = mirror.props[ITEM_KEY].get_item();
        const bool projection = mirror.props.exists(PROJECTION_KEY)
                                && mirror.props[PROJECTION_KEY].get_bool();
        projectile = make_unique<ranged_attack_beam>(you, item, projection);
        projectile->beam.drop_item = false;
    }
    else
    {
        const zap_type zap = spell_to_zap(spell);
        if (!mirror.props.exists(POWER_KEY))
            return false;
        if (zap != NUM_ZAPS)
            zappy(zap, mirror.props[POWER_KEY].get_int(), true, spell_beam);
        else
        {
            // Non-zap conjurations used the fork's default battlesphere beam.
            spell_beam.name = "barrage of energy";
            spell_beam.flavour = BEAM_MMISSILE;
            spell_beam.damage = dice_def(2, 5 + mirror.get_hit_dice());
            spell_beam.hit = AUTOMATIC_HIT;
            spell_beam.colour = MAGENTA;
            spell_beam.glyph = dchar_glyph(DCHAR_FIRED_ZAP);
        }
        spell_beam.set_agent(&you);
    }
    bolt& beam = projectile ? projectile->beam : spell_beam;
    beam.source = mirror.pos();
    beam.target = victim->pos();
    beam.range = LOS_RADIUS;
    beam.source_name = "fragmentation";

    bool can_fire = safe_line(beam);
    if (!can_fire)
    {
        monster_pathfind path;
        path.fill_traversability(&mirror, 2, true);
        for (distance_iterator di(mirror.pos(), true, true, 2); di; ++di)
        {
            if (*di == victim->pos() || actor_at(*di) || cell_is_solid(*di)
                || !you.see_cell(*di) || !path.is_reachable(*di))
                continue;
            beam.source = *di;
            if (!safe_line(beam))
                continue;
            const coord_def old = mirror.pos();
            if (!mirror.move_to(*di, MV_DELIBERATE, true))
                continue;
            mirror.check_redraw(old);
            mirror.finalise_movement();
            can_fire = true;
            break;
        }
    }
    if (can_fire)
    {
        beam.set_is_tracer(false);
        simple_monster_message(mirror, " echoes your attack.");
        if (projectile)
            projectile->fire();
        else
            beam.fire();
        mirror.speed_increment -= BASELINE_DELAY;
    }
    mirror.props.erase(ITEM_KEY);
    mirror.props.erase(PROJECTION_KEY);
    mirror.props.erase(POWER_KEY);
    return can_fire;
}
}
