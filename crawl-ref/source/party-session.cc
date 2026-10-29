/** Per-floor and per-region scheduling for one authoritative multiplayer expedition. */
#include "AppHdr.h"
#include "party.h"

#include <algorithm>
#include <climits>

#include "coord.h"
#include "cloud.h"
#include "dgn-event.h"
#include "env.h"
#include "god-vorr.h"
#include "level-id.h"
#include "level-time.h"
#include "losglobal.h"
#include "monster.h"
#include "nearby-danger.h"
#include "player.h"

namespace
{
bool configured_multiplayer = false;
const char* const mode_key = "multiplayer_session";
const char* const clock_key = "multiplayer_aut_clock";
const char* const floor_key = "multiplayer_aut_floor";
const char* const region_clock_key = "multiplayer_region_clock";
const char* const region_id_key = "multiplayer_region_id";
const char* const last_action_key = "multiplayer_last_action_aut";

string floor_name(const player& member)
{
    return level_id(member.where_are_you, member.depth).describe();
}

string world_key(const string& floor)
{
    return "multiplayer_floor_clock_" + floor;
}

int world_clock(const string& floor)
{
    const auto& props = party::get_player(0).props;
    const string key = world_key(floor);
    return props.exists(key) ? props[key].get_int() : 0;
}

bool same_floor(int left, int right)
{
    return floor_name(party::get_player(left)) == floor_name(party::get_player(right));
}

bool slot_living(int slot)
{
    return slot >= 0 && slot < party::player_count()
           && !party::is_player_downed(slot)
           && party::get_player(slot).hp > 0;
}

void ensure_member_floor_state(int slot)
{
    if (slot < 0 || slot >= party::MAX_PARTY_PLAYERS)
        return;

    player& member = party::get_player(slot);
    const string floor = floor_name(member);
    if (!member.props.exists(floor_key) || member.props[floor_key].get_string() != floor)
    {
        int debt = 0;
        if (member.props.exists(floor_key) && member.props.exists(clock_key))
        {
            const string old_floor = member.props[floor_key].get_string();
            const int old_base = member.props.exists(region_clock_key)
                ? member.props[region_clock_key].get_int()
                : world_clock(old_floor);
            debt = max(0, member.props[clock_key].get_int() - old_base);
        }
        const int base = world_clock(floor);
        member.props[clock_key] = base + debt;
        member.props[region_clock_key] = base;
        member.props[region_id_key] = slot;
        member.props[floor_key] = floor;
    }
    else
    {
        if (!member.props.exists(region_clock_key))
            member.props[region_clock_key] = world_clock(floor);
        if (!member.props.exists(region_id_key))
            member.props[region_id_key] = slot;
        if (!member.props.exists(clock_key))
            member.props[clock_key] = member.props[region_clock_key].get_int();
    }
}

bool sees_position(const player& viewer, const coord_def& pos)
{
    return in_bounds(viewer.pos()) && in_bounds(pos)
           && grid_distance(viewer.pos(), pos) <= viewer.current_vision
           && cell_see_cell(viewer.pos(), pos, LOS_DEFAULT);
}

bool sees_actor(const player& viewer, const actor& target)
{
    return sees_position(viewer, target.pos()) && target.visible_to(&viewer);
}

bool shared_encounter(int slot_a, int slot_b)
{
    if (!party::multiplayer_enabled())
        return true;
    const player& pa = party::get_player(slot_a);
    const player& pb = party::get_player(slot_b);
    if (!in_bounds(pa.pos()) || !in_bounds(pb.pos()))
        return true;
    if (sees_actor(pa, pb) || sees_actor(pb, pa))
        return true;

    // A genuinely floor-wide timer still needs one chronology. Keep this
    // dependency explicit until that subsystem has a spatial time adapter.
    if (pa.where_are_you == BRANCH_SHOALS
        || env.forest_awoken_until > env.elapsed_time
        || dungeon_events.has_global_listeners(DET_TURN_ELAPSED))
    {
        return true;
    }
    // The ground-resource ledger still uses a floor-wide expiry clock.
    // Preserve that explicit dependency rather than silently aging a pool in
    // another encounter; its spatial adapter can later remove this barrier.
    if (env.properties.exists(vorr::blood_key))
        for (const auto& value : env.properties[vorr::blood_key].get_vector())
            if (value.get_table()["expires"].get_int() > env.elapsed_time)
                return true;

    for (int i = 0; i < MAX_MONSTERS; ++i)
    {
        const monster& m = env.mons[i];
        if (!m.alive() || party::is_proxy_monster(m))
            continue;
        if (!in_bounds(m.pos()))
            continue;
        const bool a_sees = sees_actor(pa, m);
        const bool b_sees = sees_actor(pb, m);
        if (!m.wont_attack() && (a_sees || m.can_see(pa))
            && (b_sees || m.can_see(pb)))
        {
            return true;
        }
        if ((m.summoner == pa.mid && b_sees)
            || (m.summoner == pb.mid && a_sees))
        {
            return true;
        }
    }
    for (const auto& entry : env.cloud)
    {
        const auto& cloud = entry.second;
        const bool a_sees = sees_position(pa, cloud.pos);
        const bool b_sees = sees_position(pb, cloud.pos);
        if ((a_sees && b_sees)
            || (cloud.source == pa.mid && b_sees)
            || (cloud.source == pb.mid && a_sees))
        {
            return true;
        }
    }
    return false;
}

int first_region_action_clock(int actor)
{
    int first = INT_MAX;
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (party::same_region(slot, actor) && slot_living(slot))
            first = min(first, party::member_aut_clock(slot));
    }
    return first == INT_MAX ? party::member_aut_clock(actor) : first;
}

// A boundary entity advances with exactly one region. Stable ties prevent a
// midpoint monster or cloud from receiving time from both independent clocks.
int owning_region(const coord_def& pos, int actor, int& distance,
                  const monster* entity = nullptr)
{
    party::reconcile_floor_regions();
    int owner = -1;
    bool owner_sees = false;
    distance = INT_MAX;
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (!slot_living(slot) || !same_floor(actor, slot))
            continue;
        const player& member = party::get_player(slot);
        if (!in_bounds(member.pos()))
            continue;
        const int candidate = grid_distance(pos, member.pos());
        const int region = member.props[region_id_key].get_int();
        const bool visible = entity
            ? sees_actor(member, *entity) || entity->can_see(member)
            : sees_position(member, pos);
        if ((visible && !owner_sees)
            || (visible == owner_sees
                && (candidate < distance || (candidate == distance && region < owner))))
        {
            distance = candidate;
            owner = region;
            owner_sees = visible;
        }
    }
    return owner;
}
}

namespace party
{
bool multiplayer_enabled()
{
    const auto& props = get_player(0).props;
    return configured_multiplayer || (props.exists(mode_key) && props[mode_key].get_bool());
}

void set_multiplayer(bool enabled)
{
    if (enabled && !multiplayer_enabled() && in_bounds(you.pos()))
        env.elapsed_time = you.elapsed_time;
    configured_multiplayer = enabled;
    for (int slot = 0; slot < MAX_PARTY_PLAYERS; ++slot)
        get_player(slot).props[mode_key] = enabled;
}

int global_elapsed_time()
{
    int elapsed = you.elapsed_time;
    if (multiplayer_enabled())
        for (int slot = 0; slot < player_count(); ++slot)
            elapsed = max(elapsed, get_player(slot).elapsed_time);
    return elapsed;
}

int global_time_delta(int time_taken)
{
    const int step = max(0, time_taken);
    // Read before the actor records this action in their personal elapsed_time.
    // Keep downed heroes' timestamps in the maximum so the clock cannot rewind.
    return max(0, step - (global_elapsed_time() - you.elapsed_time));
}

int floor_aut_clock(int slot)
{
    return world_clock(floor_name(get_player(slot)));
}

int member_aut_clock(int slot)
{
    ensure_member_floor_state(slot);
    return get_player(slot).props[clock_key].get_int();
}

int member_last_action_aut(int slot)
{
    if (slot < 0 || slot >= player_count())
        return 0;
    const auto& props = get_player(slot).props;
    return props.exists(last_action_key) ? props[last_action_key].get_int() : 0;
}

void reconcile_floor_regions()
{
    const int count = player_count();
    int old_reg_id[MAX_PARTY_PLAYERS] = {};
    int old_reg_clock[MAX_PARTY_PLAYERS] = {};
    int old_mem_clock[MAX_PARTY_PLAYERS] = {};
    int debt[MAX_PARTY_PLAYERS] = {};

    for (int s = 0; s < count; ++s)
    {
        ensure_member_floor_state(s);
        player& p = get_player(s);
        old_reg_id[s] = p.props[region_id_key].get_int();
        old_reg_clock[s] = p.props[region_clock_key].get_int();
        old_mem_clock[s] = p.props[clock_key].get_int();
        debt[s] = max(0, old_mem_clock[s] - old_reg_clock[s]);
    }

    bool adj[MAX_PARTY_PLAYERS][MAX_PARTY_PLAYERS] = {};
    for (int i = 0; i < count; ++i)
    {
        adj[i][i] = true;
        if (!slot_living(i))
            continue;
        for (int j = i + 1; j < count; ++j)
        {
            if (!slot_living(j) || !same_floor(i, j))
                continue;
            // The loaded map is authoritative for sight. Keep the last known
            // partition on other floors until their native package is loaded.
            const bool linked = same_floor(i, active_slot())
                ? shared_encounter(i, j)
                : old_reg_id[i] == old_reg_id[j];

            if (linked)
                adj[i][j] = adj[j][i] = true;
        }
    }

    for (int k = 0; k < count; ++k)
        for (int i = 0; i < count; ++i)
            for (int j = 0; j < count; ++j)
                if (adj[i][k] && adj[k][j])
                    adj[i][j] = true;

    for (int i = 0; i < count; ++i)
    {
        if (!slot_living(i))
            continue;

        int leader_id = i;
        int merged_reg_clock = old_reg_clock[i];
        for (int j = 0; j < count; ++j)
        {
            if (!adj[i][j] || !slot_living(j))
                continue;
            leader_id = min(leader_id, j);
            merged_reg_clock = max(merged_reg_clock, old_reg_clock[j]);
        }

        player& p = get_player(i);
        p.props[region_id_key] = leader_id;
        p.props[region_clock_key] = merged_reg_clock;
        p.props[clock_key] = merged_reg_clock + debt[i];
    }

    // Attach downed/dead players to the nearest living player on their floor.
    for (int s = 0; s < count; ++s)
    {
        if (slot_living(s))
            continue;

        int best_ally = -1;
        int best_dist = INT_MAX;
        const player& ps = get_player(s);
        for (int j = 0; j < count; ++j)
        {
            if (!slot_living(j) || !same_floor(s, j))
                continue;
            const int d = (in_bounds(ps.pos()) && in_bounds(get_player(j).pos()))
                ? grid_distance(ps.pos(), get_player(j).pos())
                : 0;
            if (d < best_dist)
            {
                best_dist = d;
                best_ally = j;
            }
        }

        player& p = get_player(s);
        if (best_ally >= 0)
        {
            const int reg_clk = get_player(best_ally).props[region_clock_key].get_int();
            p.props[region_id_key] = get_player(best_ally).props[region_id_key].get_int();
            p.props[region_clock_key] = reg_clk;
            p.props[clock_key] = reg_clk;
        }
        else
        {
            const int fl_clk = world_clock(floor_name(p));
            p.props[region_id_key] = s;
            p.props[region_clock_key] = fl_clk;
            p.props[clock_key] = fl_clk;
        }
    }
}

int member_region_id(int slot)
{
    if (!is_enabled() || slot < 0 || slot >= player_count())
        return 0;
    reconcile_floor_regions();
    return get_player(slot).props[region_id_key].get_int();
}

int member_region_clock(int slot)
{
    if (slot < 0 || slot >= player_count())
        return 0;
    reconcile_floor_regions();
    return get_player(slot).props[region_clock_key].get_int();
}

bool same_region(int slot_a, int slot_b)
{
    if (slot_a < 0 || slot_a >= player_count()
        || slot_b < 0 || slot_b >= player_count())
    {
        return false;
    }
    if (slot_a == slot_b)
        return true;
    if (!same_floor(slot_a, slot_b))
        return false;
    reconcile_floor_regions();
    return get_player(slot_a).props[region_id_key].get_int()
           == get_player(slot_b).props[region_id_key].get_int();
}

bool region_feels_safe(int slot)
{
    if (!is_enabled())
        return i_feel_safe();
    if (slot < 0 || slot >= player_count())
        return true;

    reconcile_floor_regions();
    if (!same_floor(slot, active_slot()))
        return true;

    for (int q = 0; q < player_count(); ++q)
    {
        if (!slot_living(q) || !same_region(slot, q))
            continue;
        if (!in_bounds(get_player(q).pos()))
            continue;

        scoped_player_context ctx(q);
        if (!i_feel_safe())
            return false;
    }
    return true;
}

bool region_combat_locked(int slot)
{
    return !region_feels_safe(slot);
}

bool member_can_act(int slot)
{
    if (slot < 0 || slot >= player_count() || is_player_downed(slot)
        || get_player(slot).hp <= 0)
    {
        return false;
    }
    reconcile_floor_regions();
    // A different floor has its own eligibility. Its danger/queue is checked
    // after loading that floor, before accepting the action.
    if (!same_floor(slot, active_slot()) || region_feels_safe(slot))
        return true;
    // A departure can leave every remaining hero ahead of the region clock.
    // The earliest recovery can still act; its pending cost is settled with
    // that action rather than stranding the region with no eligible player.
    return member_aut_clock(slot) <= max(member_region_clock(slot),
                                         first_region_action_clock(slot));
}

int advance_region_clock(int time_taken, int *out_floor_delta)
{
    prepare_level_entity_clocks();
    reconcile_floor_regions();

    const int actor = active_slot();
    const int step = max(0, time_taken);
    player& actor_plr = get_player(actor);
    actor_plr.props[last_action_key] = step;

    const string floor = floor_name(actor_plr);
    const int before_reg = member_region_clock(actor);
    actor_plr.props[clock_key] = member_aut_clock(actor) + step;

    int after_reg = first_region_action_clock(actor);
    if (region_feels_safe(actor))
    {
        after_reg = member_aut_clock(actor);
        for (int slot = 0; slot < player_count(); ++slot)
        {
            if (same_region(slot, actor) && member_aut_clock(slot) < after_reg)
                get_player(slot).props[clock_key] = after_reg;
        }
    }
    after_reg = max(before_reg, after_reg);

    // Membership is already reconciled. Re-entering same_region() while only
    // some clocks are updated would count the remaining recovery debt twice.
    const int region = actor_plr.props[region_id_key].get_int();
    for (int slot = 0; slot < player_count(); ++slot)
    {
        player& member = get_player(slot);
        if (same_floor(slot, actor)
            && member.props[region_id_key].get_int() == region)
        {
            member.props[region_clock_key] = after_reg;
        }
    }

    const int before_floor = world_clock(floor);
    const int after_floor = max(before_floor, after_reg);
    get_player(0).props[world_key(floor)] = after_floor;
    if (out_floor_delta)
        *out_floor_delta = max(0, after_floor - before_floor);

    return max(0, after_reg - before_reg);
}

int advance_floor_clock(int time_taken)
{
    return advance_region_clock(time_taken, nullptr);
}

bool monster_in_active_region(const monster &mon, int actor_slot)
{
    if (!multiplayer_enabled())
        return true;

    const int actor = (actor_slot >= 0 && actor_slot < player_count())
        ? actor_slot
        : active_slot();

    if (is_proxy_monster(mon))
    {
        const int pslot = proxy_slot(mon);
        if (pslot >= 0 && pslot < player_count())
            return same_region(actor, pslot);
        return true;
    }

    if (!in_bounds(mon.pos()))
        return false;

    int dist_active;
    const int owner = owning_region(mon.pos(), actor, dist_active, &mon);
    if (owner < 0)
        return true;
    if (owner != get_player(actor).props[region_id_key].get_int())
        return false;

    if (dist_active <= REGION_ACTIVE_MONS_RADIUS)
        return true;

    if (!mon.asleep())
    {
        if (mon.foe == MHITYOU && same_region(actor, active_slot()))
            return true;
        if (mon.foe < MAX_MONSTERS && is_proxy_monster(env.mons[mon.foe]))
        {
            const int fslot = proxy_slot(env.mons[mon.foe]);
            if (fslot >= 0 && same_region(actor, fslot))
                return true;
        }
        if (is_party_mid(mon.summoner))
        {
            const int sslot = slot_for_mid(mon.summoner);
            if (sslot >= 0 && same_region(actor, sslot))
                return true;
        }
    }

    return false;
}

bool position_in_active_region(const coord_def &pos, int actor_slot)
{
    if (!multiplayer_enabled())
        return true;
    if (!in_bounds(pos))
        return false;

    const int actor = (actor_slot >= 0 && actor_slot < player_count())
        ? actor_slot
        : active_slot();

    int distance;
    const int owner = owning_region(pos, actor, distance);
    if (owner < 0)
        return true;
    return owner == get_player(actor).props[region_id_key].get_int()
           && distance <= REGION_ACTIVE_MONS_RADIUS;
}

bool cloud_in_active_region(const coord_def &pos, int actor_slot)
{
    return position_in_active_region(pos, actor_slot);
}
}

