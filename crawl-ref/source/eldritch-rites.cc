#include "AppHdr.h"
#include "eldritch.h"

#include "act-iter.h"
#include "cloud.h"
#include "coordit.h"
#include "env.h"
#include "fight.h"
#include "level-time.h"
#include "level-id.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-util.h"
#include "nearby-danger.h"
#include "ouch.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "religion.h"
#include "stringutil.h"
#include "terrain.h"
#include "transform.h"

namespace eldritch
{
namespace
{
constexpr const char* rite_key = "eldritch_rite";
constexpr const char* trial_key = "elder_rite_actor";

int value(const char* key)
{
    return you.props.exists(key) ? you.props[key].get_int() : 0;
}

std::vector<coord_def> spaces()
{
    std::vector<coord_def> result;
    // Open, visible, ordinary floor keeps every spawn reachable and legal.
    // Require a complete path of ordinary floor from the invoking character.
    std::vector<coord_def> frontier{you.pos()};
    std::set<coord_def> seen{you.pos()};
    for (unsigned i = 0; i < frontier.size(); ++i)
        for (adjacent_iterator cell(frontier[i]); cell; ++cell)
            if (in_bounds(*cell) && grid_distance(*cell, you.pos()) <= 3
                && env.grid(*cell) == DNGN_FLOOR && you.see_cell_no_trans(*cell)
                && seen.insert(*cell).second)
            {
                frontier.push_back(*cell);
                if (!actor_at(*cell))
                    result.push_back(*cell);
            }
    return result;
}

bool spawn_wave(int stage, int wave)
{
    const monster_type roster[3][2][2] = {
        {{MONS_OGRE, MONS_WOLF}, {MONS_YAK, MONS_ORC_WARRIOR}},
        {{MONS_CYCLOPS, MONS_ORC_WARRIOR}, {MONS_OGRE_MAGE, MONS_YAK}},
        {{MONS_STONE_GIANT, MONS_HELL_KNIGHT}, {MONS_STONE_GIANT, MONS_HELL_KNIGHT}}
    };
    auto cells = spaces();
    if (cells.size() < 2)
        return false;
    std::vector<mid_t> created;
    for (int i = 0; i < 2; ++i)
    {
        mgen_data mg(roster[stage][wave][i], BEH_HOSTILE, cells[i], MHITYOU,
                     MG_FORCE_PLACE | MG_FORCE_BEH);
        mg.set_summoned(&you, MON_SUMM_WRATH, 0, false, false);
        mg.extra_flags |= MF_NO_REWARD | MF_HARD_RESET;
        monster* mon = create_monster(mg);
        if (!mon)
        {
            for (mid_t id : created)
                if (monster* partial = monster_by_mid(id))
                    monster_die(*partial, KILL_RESET, NON_MONSTER, true);
            return false;
        }
        mon->props[trial_key] = static_cast<int>(you.mid);
        created.push_back(mon->mid);
    }
    auto& members = env.properties[rite_key].get_table()["actors"].get_vector();
    for (mid_t member : created)
        members.push_back(CrawlStoreValue(static_cast<int>(member)));
    return true;
}

void wrath_summon(monster_type type, int count = 1)
{
    for (int i = 0; i < count; ++i)
    {
        mgen_data mg(type, BEH_HOSTILE, you.pos(), MHITYOU, MG_FORCE_BEH);
        mg.set_summoned(nullptr, MON_SUMM_WRATH, 0, false, false);
        mg.extra_flags |= MF_NO_REWARD | MF_HARD_RESET;
        if (monster* mon = create_monster(mg))
            mon->props["eldritch_wrath_actor"] = true;
    }
}

void punish(god_type god)
{
    mprf(MSGCH_WARN, "%s answers your profanation!", god_name(god).c_str());
    const int brief = 30;
    switch (god)
    {
    case GOD_ZIN: you.confuse(nullptr, brief); break;
    case GOD_SHINING_ONE:
        you.increase_duration(DUR_CORONA, 3);
        you.duration[DUR_INVIS] = 0;
        break;
    case GOD_KIKUBAAQUDGHA: case GOD_VEHUMET: case GOD_LUGONU:
        ouch(resist_adjust_damage(&you, god == GOD_KIKUBAAQUDGHA ? BEAM_NEG
            : god == GOD_VEHUMET ? BEAM_FIRE : BEAM_MMISSILE,
            3 + random2(4 + you.experience_level)), KILLED_BY_DIVINE_WRATH,
            MID_NOBODY, god_name(god).c_str());
        break;
    case GOD_YREDELEMNUL: wrath_summon(MONS_WRAITH); break;
    case GOD_XOM:
        if (coinflip()) you.confuse(nullptr, brief);
        else you.increase_duration(DUR_SLOW, 3);
        break;
    case GOD_OKAWARU: case GOD_WU_JIAN:
        wrath_summon(you.experience_level < 15 ? MONS_ORC_WARRIOR : MONS_HELL_KNIGHT);
        break;
    case GOD_MAKHLEB: wrath_summon(you.experience_level < 15 ? MONS_HELLWING : MONS_SIXFIRHY); break;
    case GOD_SIF_MUNA: you.duration[DUR_ELDER_SAP] = brief; break;
    case GOD_TROG: wrath_summon(MONS_DEEP_TROLL); break;
    case GOD_NEMELEX_XOBEH:
        if (you.transform_uncancellable)
            mpr("Your body resists the Swine's shape.");
        else
            transform(3, transformation::pig, false, true);
        break;
    case GOD_ELYVILON: you.duration[DUR_ELDER_HEAL_DRAIN] = brief; break;
    case GOD_BEOGH: wrath_summon(MONS_ORC_WARRIOR, 2); break;
    case GOD_JIYVA: you.corrode(); break;
    case GOD_FEDHAS: wrath_summon(MONS_WANDERING_MUSHROOM, 2); break;
    case GOD_CHEIBRIADOS: case GOD_USKAYAW: you.increase_duration(DUR_SLOW, 3); break;
    case GOD_ASHENZARI: case GOD_RU: you.increase_duration(DUR_WEAK, 3); break;
    case GOD_DITHMENOS: wrath_summon(MONS_SHADOWGHAST); break;
    case GOD_GOZAG:
        for (monster_near_iterator mon(you.pos(), LOS_NO_TRANS); mon; ++mon)
            if (mon->hostile() && !party::is_proxy_monster(**mon))
            {
                mon->add_ench(mon_enchant(ENCH_MIGHT, nullptr, brief));
                break;
            }
        break;
    case GOD_QAZLAL:
        you.props["eldritch_cloud_x"] = you.pos().x;
        you.props["eldritch_cloud_y"] = you.pos().y;
        you.props["eldritch_cloud_warning"] = you.elapsed_time + BASELINE_DELAY;
        mprf(MSGCH_WARN, "An elemental cloud gathers at your feet. Move clear!");
        break;
#if TAG_MAJOR_VERSION == 34
    case GOD_PAKELLAS: you.duration[DUR_ELDER_EVO_DRAIN] = brief; break;
#endif
    case GOD_HEPLIAKLQANA: wrath_summon(MONS_ANCESTOR_KNIGHT); break;
    case GOD_IGNIS: wrath_summon(MONS_FIRE_ELEMENTAL); break;
    case GOD_VORR:
        if (you.has_blood())
            ouch(2 + random2(4), KILLED_BY_DIVINE_WRATH, MID_NOBODY, "Vorr's bleeding");
        break;
    case GOD_VELLUM:
        you.duration[DUR_ELDER_UNRAVEL] = brief;
        you.equipment.update();
        break;
    case GOD_IMUS_THEA: wrath_summon(MONS_SHINING_EYE); break;
    case GOD_GREAT_WYRM: wrath_summon(MONS_FIRE_ELEMENTAL); break;
    case GOD_AGRAPHEDE: wrath_summon(MONS_REDBACK); break;
    default: break;
    }
    you.redraw_armour_class = you.redraw_evasion = you.redraw_status_lights = true;
}

std::string floor_of(const player& owner)
{
    return level_id(owner.where_are_you, owner.depth).describe();
}

bool pending_rite(player& owner)
{
    if (!owner.props.exists("eldritch_rite_active"))
        return false;
    if (owner.props.exists("eldritch_rite_floor")
        && owner.props["eldritch_rite_floor"].get_string() != floor_of(owner))
    {
        owner.props.erase("eldritch_rite_active");
        owner.props.erase("eldritch_rite_floor");
        return false;
    }
    return true;
}

void discard_rite()
{
    const auto& attempt = env.properties[rite_key].get_table();
    const int owner_id = attempt["owner"].get_int();
    player* owner = party::player_by_mid(owner_id);
    // A late cleanup on an abandoned floor must not erase a newer attempt.
    if (owner && (!owner->props.exists("eldritch_rite_floor")
        || !attempt.exists("floor")
        || owner->props["eldritch_rite_floor"].get_string() == attempt["floor"].get_string()))
    {
        owner->props.erase("eldritch_rite_active");
        owner->props.erase("eldritch_rite_floor");
    }
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists(trial_key) && mon->props[trial_key].get_int() == owner_id)
            monster_die(**mon, KILL_RESET, NON_MONSTER, true);
    env.properties.erase(rite_key);
}
}

bool rite_active() { return env.properties.exists(rite_key); }

bool party_rite_active()
{
    if (rite_active())
    {
        const auto& attempt = env.properties[rite_key].get_table();
        const player* owner = party::player_by_mid(attempt["owner"].get_int());
        if (owner && (!attempt.exists("floor") || floor_of(*owner) == attempt["floor"].get_string()))
            return true;
        discard_rite();
    }
    if (pending_rite(you))
        return true;
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
            if (pending_rite(party::get_player(slot)))
                return true;
    return false;
}

spret start_rite()
{
    if (!reason(ABIL_ELDER_RITE).empty() || !i_feel_safe(false) || spaces().size() < 4)
    {
        mpr("Begin your Elder Rite on safe, open ground with room for both waves.");
        return spret::abort;
    }
    CrawlHashTable attempt;
    attempt["owner"] = static_cast<int>(you.mid);
    attempt["floor"] = floor_of(you);
    attempt["stage"] = rank();
    attempt["wave"] = 1;
    attempt["next"] = level_elapsed_time() + 40;
    attempt["actors"].new_vector(SV_INT);
    attempt["defeated"].new_vector(SV_INT);
    env.properties[rite_key] = attempt;
    if (!spawn_wave(rank(), 0))
    {
        env.properties.erase(rite_key);
        return spret::abort;
    }
    you.props["eldritch_rite_active"] = true;
    you.props["eldritch_rite_floor"] = floor_of(you);
    mpr("Your Elder Rite begins. A second wave will arrive in four turns.");
    return spret::success;
}

void rite_tick()
{
    if (!rite_active())
        return;
    const int owner = env.properties[rite_key].get_table()["owner"].get_int();
    const int slot = party::slot_for_mid(owner);
    const player* invoking = party::player_by_mid(owner);
    const auto& saved = env.properties[rite_key].get_table();
    if (slot < 0 || !invoking || (saved.exists("floor")
        && saved["floor"].get_string() != floor_of(*invoking)))
    {
        discard_rite();
        return;
    }
    if (!invoking->alive() || !invoking->on_current_level
        || invoking->where_are_you != you.where_are_you || invoking->depth != you.depth
        || (party::is_enabled() && party::is_player_downed(slot)))
        return;
    party::scoped_player_context context(slot);
    auto& attempt = env.properties[rite_key].get_table();
    if (attempt["wave"].get_int() == 1
        && level_elapsed_time() >= attempt["next"].get_int())
    {
        if (!spawn_wave(attempt["stage"].get_int(), 1))
        {
            // Lack of legal spawn space pauses placement, never grants victory
            // or deletes a wave. Retry only as the actual floor advances.
            attempt["next"] = level_elapsed_time() + BASELINE_DELAY;
            return;
        }
        attempt["wave"] = 2;
        mpr("The second wave of your Elder Rite arrives!");
    }
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists(trial_key) && mon->props[trial_key].get_int() == owner)
            return; // Converted/pacified survivors still prevent victory.
    if (attempt["wave"].get_int() < 2 || attempt["actors"].get_vector().size() != 4
        || attempt["defeated"].get_vector().size() != 4)
        return;
    you.props["eldritch_rites"] = attempt["stage"].get_int() + 1;
    env.properties.erase(rite_key);
    you.props.erase("eldritch_rite_active");
    you.props.erase("eldritch_rite_floor");
    you.redraw_status_lights = you.redraw_armour_class = you.redraw_evasion = true;
    mpr("You complete the Elder Rite. Your stolen powers deepen.");
}

void record_trial_defeat(const monster& target, killer_type killer)
{
    if (!rite_active() || !target.props.exists(trial_key)
        || killer == KILL_RESET || killer == KILL_RESET_KEEP_ITEMS
        || killer == KILL_TIMEOUT || killer == KILL_TENTACLE_CLEANUP
#if TAG_MAJOR_VERSION == 34
        || killer == KILL_UNSUMMONED
#endif
        || killer == KILL_PACIFIED || killer == KILL_BOUND || killer == KILL_SLIMIFIED)
        return;
    auto& attempt = env.properties[rite_key].get_table();
    if (target.props[trial_key].get_int() != attempt["owner"].get_int())
        return;
    auto& defeated = attempt["defeated"].get_vector();
    for (const auto& member : defeated)
        if (member.get_int() == static_cast<int>(target.mid))
            return;
    for (const auto& member : attempt["actors"].get_vector())
        if (member.get_int() == static_cast<int>(target.mid))
        {
            defeated.push_back(CrawlStoreValue(static_cast<int>(target.mid)));
            return;
        }
}

void leave_floor()
{
    if (rite_active()
        && env.properties[rite_key].get_table()["owner"].get_int() == static_cast<int>(you.mid))
    {
        discard_rite();
        mpr("The unfinished Elder Rite is abandoned. Completed rites remain yours.");
    }
}

void tick()
{
    rite_tick();
    if (you.species != SP_ELDRITCH)
        return;
    if (!you.berserk())
        you.props.erase("eldritch_rage");
    if (you.props.exists("eldritch_cloud_warning")
        && you.elapsed_time >= value("eldritch_cloud_warning"))
    {
        const coord_def cell(value("eldritch_cloud_x"), value("eldritch_cloud_y"));
        you.props.erase("eldritch_cloud_warning");
        if (in_bounds(cell) && !cell_is_solid(cell))
            place_cloud(CLOUD_FIRE, cell, 3, nullptr);
    }
    if (rite_active() || value("eldritch_wrath_cooldown") > you.elapsed_time)
        return;
    const int threshold = max(50u, (exp_needed(you.experience_level + 1)
        - exp_needed(you.experience_level)) / 20);
    if (value("eldritch_wrath_credit") < threshold)
        return;
    std::vector<god_type> angry;
    for (const auto& row : powers())
        if (wrath_remaining(you, row.god))
            angry.push_back(row.god);
    if (angry.empty())
        return;
    you.props["eldritch_wrath_credit"] = value("eldritch_wrath_credit") - threshold;
    you.props["eldritch_wrath_cooldown"] = you.elapsed_time + 150;
    punish(angry[random2(angry.size())]);
}
}
