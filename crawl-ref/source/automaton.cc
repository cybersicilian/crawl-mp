#include "AppHdr.h"

#include "automaton.h"
#include "act-iter.h"
#include "auras.h"
#include "beam.h"
#include "cloud.h"
#include "coordit.h"
#include "delay.h"
#include "env.h"
#include "exclude.h"
#include "externs.h"
#include "fight.h"
#include "fprop.h"
#include "level-state-type.h"
#include "mapmark.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "spl-cast.h"
#include "spl-damage.h"
#include "spl-other.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"
#include "target.h"
#include "terrain.h"
#include "unwind.h"

namespace automaton
{
namespace
{
const char *const COMBAT_HEAT_UNTIL = "automaton_combat_heat_until";
const char *const VISIBLE_THREATS = "automaton_visible_threats";
const char *const TOXIC_ENGRAVING = "automaton_toxic_engraving";
const char *const BEE_WINDING = "automaton_bee_winding";
const char *const BEE_TARGET = "automaton_bee_target";
const char *const BEE_FRESH = "automaton_bee_fresh";
bool casting_engraving = false;
enum class trigger_phase { attack, escape, encounter };

// Scoped damage contexts can temporarily hide the previously active hero's
// proxy. Actor-grid checks alone would then miss that party member.
bool other_party_member_at(const coord_def& pos)
{
    if (!party::is_enabled())
        return false;
    for (int i = 0; i < party::player_count(); ++i)
    {
        const player& member = party::get_player(i);
        if (i != party::active_slot() && !party::is_player_downed(i)
            && member.where_are_you == you.where_are_you
            && member.depth == you.depth && member.pos() == pos)
            return true;
    }
    return false;
}

string cooldown_key(spell_type spell)
{
    return make_stringf("automaton_engraving_%d", static_cast<int>(spell));
}

bool nearby_hostile()
{
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        const monster& mon = **mi;
        if (you.can_see(mon) && mons_is_threatening(mon)
            && !mon.wont_attack() && !mon.neutral()
            && !party::is_proxy_monster(mon))
            return true;
    }
    return false;
}

bool self_engraving_ready(spell_type spell, trigger_phase phase)
{
    const spell_flags flags = get_spell_flags(spell);
    if (!(flags & spflag::selfench)
        || (flags & (spflag::obj | spflag::aim_at_space | spflag::monster
                     | spflag::testing | spflag::dummy)))
        return false;
    const bool escape_spell = bool(flags & (spflag::escape | spflag::recovery))
                              || spell == SPELL_SWIFTNESS;
    if (phase == trigger_phase::escape && !escape_spell)
        return false;
    if (phase == trigger_phase::attack && escape_spell)
        return false;
    if (phase == trigger_phase::encounter && escape_spell
        && spell != SPELL_INVISIBILITY)
        return false;
    // Aura spells share one stance. Do not renew the active stance or
    // replace it with another learned engraving while it is still running.
    if (find(auras::spells.begin(), auras::spells.end(), spell)
        != auras::spells.end())
        return !you.duration[DUR_PALADIN_ZEAL];
    switch (spell)
    {
    case SPELL_OZOCUBUS_ARMOUR: return !you.duration[DUR_ICY_ARMOUR];
    case SPELL_CONFUSING_TOUCH: return !you.duration[DUR_CONFUSING_TOUCH];
    case SPELL_DEATH_CHANNEL: return !you.duration[DUR_DEATH_CHANNEL];
    case SPELL_FUGUE_OF_THE_FALLEN: return !you.duration[DUR_FUGUE];
    case SPELL_JINXBITE: return !you.duration[DUR_JINXBITE];
    case SPELL_DETONATION_CATALYST: return !you.duration[DUR_DETONATION_CATALYST];
    case SPELL_AEGIS_LINK: return !you.duration[DUR_AEGIS_LINK];
    case SPELL_BALLAD_OF_THE_VANGUARD: return !you.duration[DUR_BALLAD_VANGUARD];
    default: return true;
    }
}

bool summon_engraving_ready(spell_type spell, trigger_phase phase)
{
    if (phase != trigger_phase::attack || spell_removed(spell)
        || spell == SPELL_MALIGN_GATEWAY || spell == SPELL_SUMMON_FOREST
        || (spell == SPELL_DRAGON_CALL
            && (you.duration[DUR_DRAGON_CALL]
                || you.duration[DUR_DRAGON_CALL_COOLDOWN]))
        || ((spell == SPELL_FORGE_BLAZEHEART_GOLEM || spell == SPELL_WALKING_ALEMBIC
             || spell == SPELL_PHALANX_BEETLE)
            && count_summons(&you, spell) > 0)
        || !stop_summoning_reason(MR_NO_FLAGS, M_NO_FLAGS).empty())
        return false;
    const spell_flags flags = get_spell_flags(spell);
    // Forgecraft moved several friendly summons out of the Summonings school.
    const bool friendly_construct = spell == SPELL_BATTLESPHERE
        || spell == SPELL_FORGE_LIGHTNING_SPIRE
        || spell == SPELL_FORGE_BLAZEHEART_GOLEM
        || spell == SPELL_WALKING_ALEMBIC
        || spell == SPELL_PHALANX_BEETLE
        || spell == SPELL_AWAKEN_ARMOUR
        || spell == SPELL_SPELLSPARK_SERVITOR
        || spell == SPELL_HOARFROST_CANNONADE;
    return (bool(get_spell_disciplines(spell) & spschool::summoning)
            || friendly_construct)
        && !(flags & (spflag::targeting_mask | spflag::selfench
                      | spflag::monster | spflag::testing | spflag::dummy));
}

// Foxfire is a conjuration, but creates friendly seekers rather than using a
// targeted beam. Its targeter describes spawn cells, not cells it damages.
bool foxfire_engraving_ready(spell_type spell, trigger_phase phase)
{
    if (spell != SPELL_FOXFIRE || phase != trigger_phase::attack)
        return false;
    for (adjacent_iterator ai(you.pos()); ai; ++ai)
        if (!cell_is_solid(*ai) && !actor_at(*ai)
            && !other_party_member_at(*ai))
            return true;
    return false;
}

bool fear_engraving_ready(spell_type spell, trigger_phase phase)
{
    if (spell != SPELL_CAUSE_FEAR || phase != trigger_phase::escape)
        return false;
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        const monster& mon = **mi;
        if (you.can_see(mon) && mons_is_threatening(mon) && !mon.wont_attack()
            && !mon.neutral() && !party::is_proxy_monster(mon)
            && !mon.has_ench(ENCH_FEAR) && mon.can_feel_fear(true)
            && could_harm(&you, &mon))
            return true;
    }
    return false;
}

bool ramparts_engraving_ready(spell_type spell, trigger_phase phase)
{
    if (spell != SPELL_FROZEN_RAMPARTS || phase != trigger_phase::attack
        || you.duration[DUR_FROZEN_RAMPARTS]
        // Wall ice is shared level state; ending either caster's ramparts
        // currently clears terrain that could belong to another caster.
        || (env.level_state & LSTATE_ICY_WALL))
        return false;
    const vector<coord_def> walls = find_ramparts_walls();
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        const monster& mon = **mi;
        if (!you.can_see(mon) || !mons_is_threatening(mon)
            || mon.wont_attack() || mon.neutral()
            || party::is_proxy_monster(mon) || !could_harm_enemy(&you, &mon))
            continue;
        for (const coord_def& wall : walls)
            if (adjacent(wall, mon.pos()))
                return true;
    }
    return false;
}

bool discharge_engraving_ready(spell_type spell, trigger_phase phase)
{
    if (spell != SPELL_DISCHARGE || phase != trigger_phase::attack)
        return false;

    // Discharge can arc through any conducting actor, including the caster
    // and unseen creatures. Explore the entire connected component rather
    // than relying on the visible targeting preview or a random arc length.
    vector<coord_def> pending {you.pos()};
    bool has_foe = false;
    string adj, suffix;
    bool penance = false;
    for (size_t i = 0; i < pending.size(); ++i)
    {
        for (adjacent_iterator ai(pending[i]); ai; ++ai)
        {
            if (!in_bounds(*ai)
                || find(pending.begin(), pending.end(), *ai) != pending.end())
                continue;
            if (other_party_member_at(*ai))
                return false;
            const actor* act = actor_at(*ai);
            if (!act || !act->alive() || act->res_elec() >= 3)
                continue;
            pending.push_back(*ai);
            const monster* mon = act->as_monster();
            if (!mon)
                continue;
            if (party::is_proxy_monster(*mon) || mon->wont_attack()
                || mon->neutral() || bad_attack(mon, adj, suffix, penance))
                return false;
            if (adjacent(you.pos(), mon->pos()) && you.can_see(*mon)
                && mons_is_threatening(*mon))
                has_foe = true;
        }
    }
    return has_foe;
}

bool safe_visible_engraving_impl(spell_type spell)
{
    // Ignite Poison converts poisonous clouds to fire, including the cloud
    // under the caster. Avoid the confirmation and the resulting hazard.
    if (spell == SPELL_IGNITE_POISON)
        if (const cloud_struct* cloud = cloud_at(you.pos()))
            if (cloud->type == CLOUD_POISON || cloud->type == CLOUD_MEPHITIC)
                return false;

    bool has_target = false;
    string adj, suffix;
    bool penance = false;
    for (distance_iterator di(you.pos(), false, true, LOS_RADIUS); di; ++di)
    {
        if (!you.see_cell_no_trans(*di))
            continue;
        if (other_party_member_at(*di))
            return false;
        const monster* mon = monster_at(*di);
        if (!mon || !mon->alive())
            continue;
        // Check actual occupants, even invisible ones, before casting.
        // Ignition can also affect clouds and bogs under those occupants.
        if (party::is_proxy_monster(*mon) || mon->wont_attack() || mon->neutral()
            || bad_attack(mon, adj, suffix, penance))
            return false;
        if (!you.can_see(*mon) || !mons_is_threatening(*mon))
            continue;
        if (spell == SPELL_IGNITE_POISON && mon->has_ench(ENCH_POISON)
            && mon->res_fire() < 3)
            has_target = true;
        if (spell == SPELL_INTOXICATE && mons_intel(*mon) >= I_HUMAN
            && !mon->clarity() && mon->res_poison() < 3
            && !mon->has_ench(ENCH_CONFUSION))
            has_target = true;
    }
    return has_target;
}

// This aura persists after the activating attack, so check the entire actual
// area both before casting and before each subsequent damage tick.
bool toxic_protected_actor_in_sight()
{
    string adj, suffix;
    bool penance = false;
    for (distance_iterator di(you.pos(), false, true, LOS_RADIUS); di; ++di)
    {
        if (!you.see_cell_no_trans(*di))
            continue;
        if (other_party_member_at(*di))
            return true;
        const monster* mon = monster_at(*di);
        if (mon && mon->alive()
            && (party::is_proxy_monster(*mon) || mon->wont_attack()
                || mon->neutral() || bad_attack(mon, adj, suffix, penance)))
            return true;
    }
    return false;
}

// Prism spells require an empty destination near the attacked monster, not
// the monster's own square. Avoid placing the delayed blast near allies.
bool prism_engraving_aim(const coord_def& target, coord_def& result)
{
    const monster* victim = monster_at(target);
    if (!victim || victim->wont_attack() || victim->neutral()
        || party::is_proxy_monster(*victim) || !you.can_see(*victim))
        return false;
    const int power = calc_spell_power(SPELL_FULMINANT_PRISM);
    const int range = spell_range(SPELL_FULMINANT_PRISM, &you, power);
    unique_ptr<targeter> area = find_spell_targeter(SPELL_FULMINANT_PRISM, power, range);
    if (!area)
        return false;
    string adj, suffix;
    bool penance = false;
    if (bad_attack(victim, adj, suffix, penance))
        return false;
    int choices = 0;
    for (adjacent_iterator ai(target); ai; ++ai)
    {
        if (cell_is_solid(*ai) || actor_at(*ai) || other_party_member_at(*ai)
            || !area->valid_aim(*ai)
            || !area->set_aim(*ai) || area->is_affected(target) <= AFF_NO
            || area->is_affected(you.pos()) > AFF_NO)
            continue;
        bool unsafe = false;
        for (distance_iterator di(you.pos(), false, true, LOS_RADIUS); di; ++di)
        {
            if (other_party_member_at(*di) && area->is_affected(*di) > AFF_NO)
            {
                unsafe = true;
                break;
            }
            const monster* mon = monster_at(*di);
            if (mon && area->is_affected(*di) > AFF_NO
                && (party::is_proxy_monster(*mon) || mon->wont_attack()
                    || mon->neutral() || bad_attack(mon, adj, suffix, penance)))
            {
                unsafe = true;
                break;
            }
        }
        if (!unsafe && one_chance_in(++choices))
            result = *ai;
    }
    return choices > 0;
}

}

bool safe_ignite_engraving()
{
    return safe_visible_engraving_impl(SPELL_IGNITE_POISON);
}

bool safe_intoxication_engraving()
{
    return safe_visible_engraving_impl(SPELL_INTOXICATE);
}

bool safe_toxic_engraving()
{
    if (you.duration[DUR_TOXIC_RADIANCE] || toxic_protected_actor_in_sight())
        return false;
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        const monster& mon = **mi;
        if (you.can_see(mon) && mons_is_threatening(mon)
            && mon.res_poison() < 1 && could_harm_enemy(&you, &mon))
            return true;
    }
    return false;
}

bool safe_bog_engraving()
{
    if (you.duration[DUR_NOXIOUS_BOG])
        return false;
    const vector<coord_def> cells = find_bog_locations(you.pos());
    bool has_foe = false;
    string adj, suffix;
    bool penance = false;
    for (const coord_def& cell : cells)
    {
        // Avoid modifying traps, special floors, water, or another temporary
        // effect when the cast has not been chosen explicitly by the player.
        if (env.grid(cell) != DNGN_FLOOR || is_temp_terrain(cell)
            || other_party_member_at(cell))
            return false;
        const monster* mon = monster_at(cell);
        if (!mon || !mon->alive())
            continue;
        if (party::is_proxy_monster(*mon) || mon->wont_attack() || mon->neutral()
            || bad_attack(mon, adj, suffix, penance))
            return false;
        if (you.can_see(*mon) && mons_is_threatening(*mon) && !mon->airborne()
            && could_harm_enemy(&you, mon))
            has_foe = true;
    }
    return has_foe;
}

bool spike_wall_has_foe(const coord_def& wall)
{
    if (!you.see_cell_no_trans(wall))
        return false;
    string adj, suffix;
    bool penance = false;
    for (adjacent_iterator ai(wall); ai; ++ai)
    {
        const monster* mon = monster_at(*ai);
        if (mon && you.can_see(*mon) && mons_is_threatening(*mon)
            && !mon->wont_attack() && !mon->neutral()
            && !party::is_proxy_monster(*mon)
            && !bad_attack(mon, adj, suffix, penance)
            && could_harm_enemy(&you, mon))
            return true;
    }
    return false;
}

bool safe_spike_engraving()
{
    if (!env.markers.get_active_features(DNGN_SPIKE_LAUNCHER, you.mid).empty())
        return false;
    for (const coord_def& wall : find_spike_launcher_walls(you.pos()))
        if (spike_wall_has_foe(wall))
            return true;
    return false;
}

static bool safe_sigil_engraving()
{
    for (map_marker* mark : env.markers.get_all(MAT_TERRAIN_CHANGE))
    {
        const auto* change = static_cast<map_terrain_change_marker*>(mark);
        if (change->change_type == TERRAIN_CHANGE_BINDING_SIGIL
            && change->source_mid == you.mid)
            return false;
    }
    bool available = false;
    for (const coord_def& pos : find_sigil_locations(false))
        if (!other_party_member_at(pos))
            available = true;
    if (!available)
        return false;
    string adj, suffix;
    bool penance = false;
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
        if (you.can_see(**mi) && mons_is_threatening(**mi)
            && !(*mi)->wont_attack() && !(*mi)->neutral()
            && !party::is_proxy_monster(**mi)
            && !bad_attack(*mi, adj, suffix, penance))
            return true;
    return false;
}

static bool safe_blastmote_engraving(const coord_def& target)
{
    if (cloud_at(you.pos()) || is_sanctuary(you.pos())
        || (env.level_state & LSTATE_STILL_WINDS))
        return false;
    const monster* mon = monster_at(target);
    if (!mon || !you.can_see(*mon) || !mons_is_threatening(*mon)
        || mon->wont_attack() || mon->neutral() || party::is_proxy_monster(*mon))
        return false;
    string adj, suffix;
    bool penance = false;
    return !bad_attack(mon, adj, suffix, penance);
}

static bool has_owned_clockwork_bee()
{
    for (monster_iterator mi; mi; ++mi)
        if (mi->was_created_by(you, SPELL_CLOCKWORK_BEE))
            return true;
    return false;
}

int bee_winding_remaining(const player& p)
{
    return p.props.exists(BEE_WINDING) ? max(0, p.props[BEE_WINDING].get_int()) : 0;
}

bool safe_bee_engraving(const coord_def& target)
{
    return !bee_winding_remaining(you)
        && you.attribute[ATTR_CHANNELLED_SPELL] != SPELL_CLOCKWORK_BEE
        && !has_owned_clockwork_bee()
        && stop_summoning_reason(MR_NO_FLAGS, M_NO_FLAGS).empty()
        && safe_attack_engraving(SPELL_CLOCKWORK_BEE, target);
}

bool start_bee_engraving(const coord_def& target)
{
    if (!safe_bee_engraving(target))
        return false;
    const monster* mon = monster_at(target);
    if (!mon)
        return false;
    you.props[BEE_WINDING].get_int() = 3 * BASELINE_DELAY;
    you.props[BEE_TARGET].get_int() = mon->mid;
    you.props[BEE_FRESH].get_bool() = true;
    you.redraw_status_lights = true;
    mpr("Your clockwork bee begins winding.");
    return true;
}

void interrupt_bee_engraving()
{
    if (!you.props.exists(BEE_WINDING))
        return;
    you.props.erase(BEE_WINDING);
    you.props.erase(BEE_TARGET);
    you.props.erase(BEE_FRESH);
    you.redraw_status_lights = true;
    mpr("Your clockwork bee stops winding.");
}

void advance_bee_engraving()
{
    if (!you.props.exists(BEE_WINDING))
        return;
    const mid_t target_mid = you.props[BEE_TARGET].get_int();
    monster* target = monster_by_mid(target_mid);
    string adj, suffix;
    bool penance = false;
    if (you.species != SP_AUTOMATON || !you.has_spell(SPELL_CLOCKWORK_BEE)
        || !can_cast_spells(true) || has_owned_clockwork_bee()
        || you.attribute[ATTR_CHANNELLED_SPELL] == SPELL_CLOCKWORK_BEE
        || !stop_summoning_reason(MR_NO_FLAGS, M_NO_FLAGS).empty()
        || !target || !target->alive() || !you.can_see(*target)
        || !you.see_cell_no_trans(target->pos()) || target->wont_attack()
        || target->neutral() || party::is_proxy_monster(*target)
        || bad_attack(target, adj, suffix, penance))
    {
        interrupt_bee_engraving();
        return;
    }
    if (you.props.exists(BEE_FRESH) && you.props[BEE_FRESH].get_bool())
    {
        you.props.erase(BEE_FRESH);
        return;
    }
    int& remaining = you.props[BEE_WINDING].get_int();
    remaining -= max(0, you.time_taken);
    you.redraw_status_lights = true;
    if (remaining > 0)
        return;
    you.props.erase(BEE_WINDING);
    you.props.erase(BEE_TARGET);
    you.props.erase(BEE_FRESH);
    you.props[CLOCKWORK_BEE_TARGET].get_int() = target_mid;
    launch_clockwork_bee(you);
}

void mark_toxic_engraving()
{
    if (you.duration[DUR_TOXIC_RADIANCE])
        you.props[TOXIC_ENGRAVING].get_bool() = true;
}

void protect_toxic_engraving()
{
    if (!you.props.exists(TOXIC_ENGRAVING))
        return;
    if (!you.duration[DUR_TOXIC_RADIANCE])
        you.props.erase(TOXIC_ENGRAVING);
    else if (toxic_protected_actor_in_sight())
    {
        you.duration[DUR_TOXIC_RADIANCE] = 0;
        you.props.erase(TOXIC_ENGRAVING);
        you.redraw_status_lights = true;
        mpr("Your toxic aura wanes.");
    }
}

bool summon_attack_engraving_ready(spell_type spell)
{
    return summon_engraving_ready(spell, trigger_phase::attack);
}

bool safe_passwall_destination(const coord_def& dest)
{
    if (!in_bounds(dest) || env.grid(dest) != DNGN_FLOOR
        || env.map_knowledge(dest).feat() != DNGN_FLOOR
        || env.map_knowledge(dest).cloud() != CLOUD_NONE || cloud_at(dest)
        || is_excluded(dest) || actor_at(dest))
        return false;
    // A scoped proxy-damage context does not create a proxy for the previously
    // active hero. Check player positions directly as well as the actor grid.
    if (other_party_member_at(dest))
        return false;
    for (monster_iterator mi; mi; ++mi)
    {
        const monster& mon = **mi;
        if (mons_is_threatening(mon) && !mon.wont_attack() && !mon.neutral()
            && !party::is_proxy_monster(mon) && grid_distance(dest, mon.pos()) <= 2)
            return false;
    }
    return true;
}

bool passwall_escape_aim(coord_def& aim)
{
    // The native spell can prompt for these conditions, and its delay must
    // never be inserted into an existing activity without the player's input.
    if (you_are_delayed() || you.is_constricted()
        || you.duration[DUR_ICY_ARMOUR] || you.duration[DUR_FROZEN_RAMPARTS])
        return false;

    bool found = false;
    int best_distance = -1;
    for (adjacent_iterator ai(you.pos()); ai; ++ai)
    {
        const passwall_path path(you, *ai - you.pos(),
                                 spell_range(SPELL_PASSWALL, &you));
        if (!path.is_valid(nullptr) || !path.spell_succeeds()
            || !safe_passwall_destination(path.actual_dest))
            continue;

        bool known = true;
        for (const coord_def& cell : path.path)
        {
            if (!in_bounds(cell) || is_excluded(cell)
                || env.map_knowledge(cell).feat() != env.grid(cell))
            {
                known = false;
                break;
            }
        }
        if (!known)
            continue;

        int closest = LOS_RADIUS + 1;
        for (monster_iterator mi; mi; ++mi)
        {
            const monster& mon = **mi;
            if (mons_is_threatening(mon) && !mon.wont_attack() && !mon.neutral()
                && !party::is_proxy_monster(mon))
                closest = min(closest, grid_distance(path.actual_dest, mon.pos()));
        }
        if (closest <= 2 || closest <= best_distance)
            continue;
        found = true;
        best_distance = closest;
        aim = *ai;
    }
    return found;
}

static bool area_engraving_spell(spell_type spell)
{
    switch (spell)
    {
    case SPELL_HAILSTORM:
    case SPELL_IRRADIATE:
    case SPELL_ISKENDERUNS_MYSTIC_BLAST:
    case SPELL_SCORCH:
    case SPELL_ARCJOLT:
    case SPELL_DISPERSAL:
    case SPELL_MANIFOLD_ASSAULT:
    case SPELL_OZOCUBUS_REFRIGERATION:
    case SPELL_ENGLACIATION:
    case SPELL_MASS_CONFUSION:
    case SPELL_ANGUISH:
    case SPELL_IGNITION:
    case SPELL_STARBURST:
        return true;
    default:
        return false;
    }
}

// These immediate effects visit every cell in visible LOS, including actors
// omitted by targeter previews. Keep their safety and target checks together.
static bool los_hex_engraving(spell_type spell)
{
    return spell == SPELL_ENGLACIATION || spell == SPELL_MASS_CONFUSION
           || spell == SPELL_ANGUISH;
}

static bool susceptible_los_hex(spell_type spell, const monster& mon)
{
    if (!could_harm(&you, &mon) || mon.is_firewood())
        return false;
    if (spell == SPELL_ENGLACIATION)
        return mon.res_cold() <= 0 && !mon.is_peripheral() && !mon.stasis()
               && !mon.is_stationary() && !mon.has_ench(ENCH_SLOW);
    if (mon.willpower() == WILL_INVULN)
        return false;
    if (spell == SPELL_MASS_CONFUSION)
        return !mon.has_ench(ENCH_CONFUSION);
    return mons_intel(mon) > I_BRAINLESS && !mon.has_ench(ENCH_ANGUISH);
}

// These untargeted spells have targeters that describe their actual victims.
// Other static targeters can instead describe spawn sites or delayed hazards.
bool safe_area_engraving(spell_type spell)
{
    if (!area_engraving_spell(spell))
        return false;
    const int power = calc_spell_power(spell);
    const int range = spell_range(spell, &you, power);
    unique_ptr<targeter> area;
    if (spell == SPELL_IGNITION)
        area = make_unique<targeter_ignition>(
            &you, get_ignition_blast_sources(&you, false));
    else
        area = find_spell_targeter(spell, power, range);
    if (!area)
        return false;
    // The preview omits invisible creatures, which can conduct the actual
    // arc into an ally outside the spell's initial radius.
    const vector<coord_def> chain = spell == SPELL_ARCJOLT
                                    ? arcjolt_targets(you, true)
                                    : vector<coord_def>();
    bool has_foe = false;
    string adj, suffix;
    bool penance = false;
    for (distance_iterator di(you.pos(), false, true, LOS_RADIUS); di; ++di)
    {
        // The chain cannot include a hero whose proxy is temporarily absent.
        // Avoid an automatic arc whenever that hero is visible nearby.
        if (spell == SPELL_ARCJOLT && other_party_member_at(*di)
            && !actor_at(*di) && you.see_cell_no_trans(*di))
            return false;
        const bool affected = spell == SPELL_ARCJOLT
            ? find(chain.begin(), chain.end(), *di) != chain.end()
            : (spell == SPELL_OZOCUBUS_REFRIGERATION || los_hex_engraving(spell))
              ? you.see_cell_no_trans(*di) : area->is_affected(*di) > AFF_NO;
        if (!affected)
            continue;
        if (other_party_member_at(*di))
            return false;
        const monster* mon = monster_at(*di);
        if (!mon)
            continue;
        if (party::is_proxy_monster(*mon) || mon->wont_attack() || mon->neutral()
            || bad_attack(mon, adj, suffix, penance))
            return false;
        if (you.can_see(*mon) && mons_is_threatening(*mon)
            && (!los_hex_engraving(spell) || susceptible_los_hex(spell, *mon)))
            has_foe = true;
    }
    return has_foe;
}

coord_def area_engraving_aim(spell_type spell, const coord_def& origin)
{
    // An eight-way fan still needs a nonzero direction to construct its beams.
    return spell == SPELL_STARBURST ? origin + coord_def(0, -1) : origin;
}

int heat(const player& p)
{
    return max(0, p.max_magic_points - p.magic_points);
}

bool overheat_from_berserk(player& p)
{
    if (p.species != SP_AUTOMATON)
        return false;
    p.magic_points = 0;
    p.redraw_magic_points = true;
    return true;
}

bool unlock_laser(player& p)
{
    if (p.species != SP_AUTOMATON || p.experience_level < 5
        || p.spell_library[SPELL_AUTOMATON_LASER])
        return false;
    p.spell_library.set(SPELL_AUTOMATON_LASER, true);
    return true;
}

bool casting_automatically()
{
    return casting_engraving;
}

namespace
{
enum class engraving_trigger
{
    invalid, unsupported, passwall, dragon_call, escape, attack, summon,
    self, targeted, toxic_aura, bog, searing_ray, clockwork_bee, spike_launcher,
    blazeheart, alembic
};

// This classification drives both the description and memorisation warning.
// Individual casts still check the actual target, resources and cooldown.
engraving_trigger classify_engraving(spell_type spell)
{
    if (!is_valid_spell(spell) || spell_removed(spell))
        return engraving_trigger::invalid;
    if (spell == SPELL_PASSWALL)
        return engraving_trigger::passwall;
    if (spell == SPELL_SIGIL_OF_BINDING)
        return engraving_trigger::attack;
    if (spell == SPELL_PHALANX_BEETLE)
        return engraving_trigger::summon;
    if (spell == SPELL_BLASTMOTE)
        return engraving_trigger::attack;
    if (spell == SPELL_SUMMON_FOREST)
        return engraving_trigger::unsupported;
    if (spell == SPELL_CLOCKWORK_BEE)
        return engraving_trigger::clockwork_bee;
    if (spell == SPELL_SPIKE_LAUNCHER)
        return engraving_trigger::spike_launcher;
    if (spell == SPELL_FORGE_BLAZEHEART_GOLEM)
        return engraving_trigger::blazeheart;
    if (spell == SPELL_WALKING_ALEMBIC)
        return engraving_trigger::alembic;
    if (spell == SPELL_SEARING_RAY)
        return engraving_trigger::searing_ray;
    if (spell == SPELL_DRAGON_CALL)
        return engraving_trigger::dragon_call;
    if (spell == SPELL_OLGREBS_TOXIC_RADIANCE)
        return engraving_trigger::toxic_aura;
    if (spell == SPELL_NOXIOUS_BOG)
        return engraving_trigger::bog;
    if (spell == SPELL_CAUSE_FEAR || spell == SPELL_DISPERSAL)
        return engraving_trigger::escape;
    if (spell == SPELL_FOXFIRE || spell == SPELL_FROZEN_RAMPARTS
        || spell == SPELL_IGNITE_POISON || spell == SPELL_INTOXICATE
        || spell == SPELL_DISCHARGE || spell == SPELL_FULMINANT_PRISM
        || area_engraving_spell(spell))
        return engraving_trigger::attack;

    const spell_flags flags = get_spell_flags(spell);
    const bool friendly_construct = spell == SPELL_BATTLESPHERE
        || spell == SPELL_FORGE_LIGHTNING_SPIRE || spell == SPELL_AWAKEN_ARMOUR
        || spell == SPELL_SPELLSPARK_SERVITOR || spell == SPELL_HOARFROST_CANNONADE;
    if (spell != SPELL_MALIGN_GATEWAY
        && (bool(get_spell_disciplines(spell) & spschool::summoning) || friendly_construct)
        && !(flags & (spflag::targeting_mask | spflag::selfench | spflag::monster
                      | spflag::testing | spflag::dummy)))
        return engraving_trigger::summon;
    if ((flags & spflag::selfench)
        && !(flags & (spflag::obj | spflag::aim_at_space | spflag::monster
                      | spflag::testing | spflag::dummy)))
    {
        if (flags & (spflag::escape | spflag::recovery) || spell == SPELL_SWIFTNESS)
            return engraving_trigger::escape;
        return engraving_trigger::self;
    }
    if ((flags & spflag::targeting_mask)
        && !(flags & (spflag::helpful | spflag::obj | spflag::aim_at_space
                      | spflag::selfench | spflag::escape | spflag::recovery
                      | spflag::monster | spflag::testing | spflag::dummy)))
        return engraving_trigger::targeted;
    return engraving_trigger::unsupported;
}
}

bool has_automatic_trigger(spell_type spell)
{
    const engraving_trigger trigger = classify_engraving(spell);
    return trigger != engraving_trigger::invalid
           && trigger != engraving_trigger::unsupported;
}

std::string engraving_guidance(spell_type spell)
{
    if (los_hex_engraving(spell))
        return "This engraving may affect susceptible foes in sight during an attack, when no protected creature is in its area.";
    if (spell == SPELL_SIGIL_OF_BINDING)
        return "This engraving may inscribe binding sigils during an attack without replacing existing sigils. Friendly, neutral and protected creatures pass safely.";
    if (spell == SPELL_PHALANX_BEETLE)
        return "This engraving may forge a protective phalanx beetle during an attack, without replacing your existing beetle.";
    if (spell == SPELL_BLASTMOTE)
        return "This engraving may kindle blastmotes beneath you during an attack. Move away: the cloud disperses harmlessly if its explosion would catch a friendly or protected creature.";
    switch (classify_engraving(spell))
    {
    case engraving_trigger::invalid:
        return "This spell cannot be engraved.";
    case engraving_trigger::unsupported:
        return "This spell currently has no automatic engraving trigger.";
    case engraving_trigger::passwall:
        return "This engraving may escape through a known clear wall when badly hurt. Passage takes time and can be interrupted.";
    case engraving_trigger::dragon_call:
        return "This engraving may summon dragons during an attack when the call is ready and it is safe.";
    case engraving_trigger::toxic_aura:
        return "This engraving may radiate poison during an attack. The aura ends if a protected creature comes within range.";
    case engraving_trigger::bog:
        return "This engraving may create a bog on clear, unaltered ground during an attack. It recedes beneath protected creatures.";
    case engraving_trigger::searing_ray:
        return "This engraving may fire one searing ray during an attack without starting a channel.";
    case engraving_trigger::clockwork_bee:
        return "This engraving may wind a clockwork bee during an attack, using heat once. Winding takes three normal-speed turns and stops if you take damage or lose the target; an existing bee is not replaced.";
    case engraving_trigger::spike_launcher:
        return "This engraving may construct a spike launcher in a visible wall beside a hostile. It avoids neutral and friendly creatures and will not replace an existing launcher.";
    case engraving_trigger::blazeheart:
        return "This engraving may forge a blazeheart golem during an attack, without replacing an existing one. Its core cools harmlessly if a protected creature is nearby; otherwise it explodes and leaves fire clouds.";
    case engraving_trigger::alembic:
        return "This engraving may construct a walking alembic during an attack, without replacing an existing one. Its fumes disperse beneath friendly and neutral creatures.";
    case engraving_trigger::escape:
        return "This engraving may activate when badly hurt and threatened.";
    case engraving_trigger::attack:
        return "This engraving may activate during an attack when its effect is safe.";
    case engraving_trigger::summon:
        return "This engraving may summon an ally during an attack when it is safe.";
    case engraving_trigger::self:
        return "This engraving may activate when encountering or attacking a threat.";
    case engraving_trigger::targeted:
        return "This engraving may activate during an attack against a safe target.";
    }
    return "This spell currently has no automatic engraving trigger.";
}

bool beam_requires_confirmation(player_beam_tracer tracer)
{
    return tracer.has_any_warnings();
}

void mark_combat(player& p)
{
    if (p.species == SP_AUTOMATON)
        p.props[COMBAT_HEAT_UNTIL].get_int() = p.elapsed_time + 5 * BASELINE_DELAY;
}

int cooling_rate(const player& p, int base_regeneration)
{
    if (p.species != SP_AUTOMATON)
        return base_regeneration;
    if (p.duration[DUR_BERSERK])
        return 0;

    int rate = base_regeneration * 3 / 2;
    if (!p.props.exists(COMBAT_HEAT_UNTIL)
        || p.elapsed_time >= p.props[COMBAT_HEAT_UNTIL].get_int())
    {
        rate += heat(p) * 10;
    }
    return rate;
}

bool safe_attack_engraving(spell_type spell, const coord_def& target)
{
    if (!is_valid_spell(spell) || spell == SPELL_FULMINANT_PRISM)
        return false;
    const spell_flags flags = get_spell_flags(spell);
    if (!(flags & spflag::targeting_mask)
        || (flags & (spflag::helpful | spflag::obj | spflag::aim_at_space
                     | spflag::selfench | spflag::escape | spflag::recovery
                     | spflag::monster | spflag::testing | spflag::dummy)))
        return false;

    const monster* victim = monster_at(target);
    if (!victim || victim->wont_attack() || victim->neutral()
        || party::is_proxy_monster(*victim)
        || !you.can_see(*victim))
        return false;
    string adj, suffix;
    bool penance = false;
    if (bad_attack(victim, adj, suffix, penance))
        return false;

    const int power = calc_spell_power(spell);
    const int range = spell_range(spell, &you, power);
    unique_ptr<targeter> area = find_spell_targeter(spell, power, range);
    if (!area || !area->valid_aim(target) || !area->set_aim(target)
        || (spell != SPELL_ICE_THORNS && area->is_affected(target) <= AFF_NO))
        return false;
    // Ice Thorns changes every adjacent floor square, even if the targeter's
    // visibility preview omits a square behind a wall.
    if (spell == SPELL_ICE_THORNS)
    {
        for (adjacent_iterator ai(target); ai; ++ai)
        {
            if (!in_bounds(*ai) || !feat_is_floor(env.grid(*ai)))
                continue;
            if (other_party_member_at(*ai))
                return false;
            const monster* mon = monster_at(*ai);
            if (mon && (party::is_proxy_monster(*mon) || mon->wont_attack()
                    || mon->neutral() || bad_attack(mon, adj, suffix, penance)))
                return false;
        }
    }
    if (area->harmful_to_player() && area->is_affected(you.pos()) > AFF_NO)
        return false;
    for (distance_iterator di(you.pos(), false, true, LOS_RADIUS); di; ++di)
    {
        if (area->is_affected(*di) <= AFF_NO)
            continue;
        if (other_party_member_at(*di))
            return false;
        const monster* mon = monster_at(*di);
        if (!mon)
            continue;
        if (party::is_proxy_monster(*mon) || mon->wont_attack() || mon->neutral()
            || bad_attack(mon, adj, suffix, penance))
        {
            return false;
        }
    }
    return true;
}

static bool trigger(const coord_def& target, trigger_phase phase, bool ranged = false)
{
    if (you.species != SP_AUTOMATON || casting_engraving
        || !can_cast_spells(true) || !nearby_hostile())
        return false;
    vector<pair<spell_type, coord_def>> ready;
    for (int i = 0; i < MAX_KNOWN_SPELLS; ++i)
    {
        const spell_type spell = you.spells[i];
        if (!is_valid_spell(spell))
            continue;
        if (ranged && spell == SPELL_MANIFOLD_ASSAULT)
            continue;
        const string key = cooldown_key(spell);
        if (you.props.exists(key) && you.props[key].get_int() > you.elapsed_time)
            continue;
        if (!casting_uselessness_reason(spell, true).empty()
            || spell_is_useless(spell, true))
            continue;
        coord_def prism_aim;
        coord_def escape_aim;
        if (self_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (summon_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (foxfire_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (fear_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::escape && spell == SPELL_PASSWALL
                 && passwall_escape_aim(escape_aim))
            ready.emplace_back(spell, escape_aim);
        else if (ramparts_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (discharge_engraving_ready(spell, phase))
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_IGNITE_POISON
                 && safe_ignite_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_INTOXICATE
                 && safe_intoxication_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_OLGREBS_TOXIC_RADIANCE
                 && safe_toxic_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_NOXIOUS_BOG
                 && safe_bog_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_CLOCKWORK_BEE
                 && safe_bee_engraving(target))
            ready.emplace_back(spell, target);
        else if (phase == trigger_phase::attack && spell == SPELL_SPIKE_LAUNCHER
                 && safe_spike_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_SIGIL_OF_BINDING
                 && safe_sigil_engraving())
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_BLASTMOTE
                 && safe_blastmote_engraving(target))
            ready.emplace_back(spell, you.pos());
        else if (phase == trigger_phase::attack && spell == SPELL_FULMINANT_PRISM
                 && prism_engraving_aim(target, prism_aim))
            ready.emplace_back(spell, prism_aim);
        else if ((phase == trigger_phase::attack && spell != SPELL_DISPERSAL
                  || phase == trigger_phase::escape && spell == SPELL_DISPERSAL)
                 && safe_area_engraving(spell))
            ready.emplace_back(spell, area_engraving_aim(spell, you.pos()));
        else if (phase == trigger_phase::attack && spell != SPELL_CLOCKWORK_BEE
                 && safe_attack_engraving(spell, target))
            ready.emplace_back(spell, target);
    }
    if (ready.empty())
        return false;

    const auto& choice = ready[random2(ready.size())];
    const spell_type spell = choice.first;
    dist aim;
    aim.target = choice.second;
    const int previous_time = you.time_taken;
    const bool previous_turn = you.turn_is_over;
    const spell_type previous_spell = you.last_cast_spell;
    unwind_var<bool> in_engraving(casting_engraving, true);
    you.turn_is_over = false;
    const spret result = cast_a_spell(false, spell, &aim);
    you.time_taken = previous_time;
    you.turn_is_over = previous_turn;
    you.last_cast_spell = previous_spell;
    if (result == spret::abort)
        return false;
    if (spell == SPELL_OLGREBS_TOXIC_RADIANCE && result == spret::success)
        mark_toxic_engraving();
    you.props[cooldown_key(spell)].get_int() = you.elapsed_time
        + 1 + random2((spell_mana(spell) + 1) * BASELINE_DELAY);
    return true;
}

bool trigger_attack(const coord_def& target, bool ranged)
{
    return trigger(target, trigger_phase::attack, ranged);
}

bool trigger_escape()
{
    if (you.hp <= 0 || you.hp * 4 > you.hp_max)
        return false;
    return trigger(you.pos(), trigger_phase::escape);
}

void observe_encounter()
{
    if (you.species != SP_AUTOMATON || casting_engraving
        || you.duration[DUR_TIME_STEP] || crawl_state.game_is_arena())
        return;
    if (!you.props.exists(VISIBLE_THREATS))
        you.props[VISIBLE_THREATS].new_vector(SV_INT64);
    CrawlVector& previous = you.props[VISIBLE_THREATS].get_vector();
    vector<int64_t> seen;
    for (const auto& value : previous)
        seen.push_back(value.get_int64());
    vector<int64_t> visible;
    bool new_threat = false;
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        const monster& mon = **mi;
        if (!you.can_see(mon) || !mons_is_threatening(mon) || mon.wont_attack()
            || mon.neutral() || party::is_proxy_monster(mon))
            continue;
        const int64_t id = mon.mid;
        visible.push_back(id);
        if (find(seen.begin(), seen.end(), id) == seen.end())
            new_threat = true;
    }
    previous.clear();
    for (const int64_t id : visible)
        previous.push_back(id);
    if (new_threat)
        trigger(you.pos(), trigger_phase::encounter);
}
}
