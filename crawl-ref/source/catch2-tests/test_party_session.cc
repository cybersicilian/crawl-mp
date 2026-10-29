#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "env.h"
#include "feature.h"
#include "delay.h"
#include "travel.h"
#include "zot.h"
#include "dungeon.h"
#include "cloud.h"
#include "message.h"
#include "tags.h"
#include "level-time.h"
#include "losglobal.h"
#include "mon-util.h"
#include "mon-energy.h"
#include "mon-act.h"
#include "dgn-event.h"
#include "mapmark.h"
#include "hermit-crab.h"
#include "timed-effects.h"
#include "party.h"
#include "player.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

namespace
{
struct session_fixture : MockPlayerYouTestsFixture
{
    session_fixture()
    {
        init_show_table();
        party::reset_activities();
        party::set_player_count(2);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 20;
        you.set_position(coord_def(40, 35));
        player& other = party::get_player(1);
        other = you;
        other.mid = party::mid_for_slot(1);
        other.save = nullptr;
        other.depth = 2;
        party::set_multiplayer(true);
        env.elapsed_time = 0;
    }
    ~session_fixture()
    {
        party::reset_activities();
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
    }
};

struct encounter_map
{
    vector<pair<coord_def, dungeon_feature_type>> original;
    encounter_map()
    {
        for (int x = 24; x <= 55; ++x)
            for (int y = 30; y <= 40; ++y)
            {
                const coord_def pos(x, y);
                original.push_back({pos, env.grid(pos)});
                env.grid(pos) = DNGN_FLOOR;
            }
        invalidate_los();
    }
    void wall(int x)
    {
        for (int y = 30; y <= 40; ++y)
            env.grid(coord_def(x, y)) = DNGN_ROCK_WALL;
        invalidate_los();
    }
    void door(int x)
    {
        env.grid(coord_def(x, 35)) = DNGN_OPEN_DOOR;
        invalidate_los();
    }
    ~encounter_map()
    {
        for (const auto& entry : original)
            env.grid(entry.first) = entry.second;
        invalidate_los();
    }
};

struct encounter_monster
{
    monster original = env.mons[0];
    encounter_monster(coord_def pos)
    {
        auto& entity = env.mons[0];
        entity = monster();
        entity.type = MONS_RAT;
        entity.hit_points = entity.max_hit_points = 10;
        entity.set_position(pos);
    }
    ~encounter_monster() { env.mons[0] = original; }
};
}

TEST_CASE_METHOD(session_fixture, "Occupied floors have independent action clocks", "[party-session]")
{
    REQUIRE(party::advance_floor_clock(10) == 10);
    REQUIRE(party::floor_aut_clock(0) == 10);
    REQUIRE(party::floor_aut_clock(1) == 0);
    {
        party::scoped_player_context actor(1);
        REQUIRE(party::select_next_acting_player() == 1);
        REQUIRE(party::member_can_act(1));
        REQUIRE(party::advance_floor_clock(6) == 6);
        REQUIRE(party::advance_floor_clock(6) == 6);
    }
    REQUIRE(party::floor_aut_clock(0) == 10);
    REQUIRE(party::floor_aut_clock(1) == 12);
    REQUIRE(party::advance_floor_clock(0) == 0);
}

TEST_CASE_METHOD(session_fixture, "Global time follows the latest personal timestamp", "[party-session][global-clock]")
{
    you.elapsed_time = 120;
    party::get_player(1).elapsed_time = 100;
    env.elapsed_time = 17;
    REQUIRE(party::global_elapsed_time() == 120);
    REQUIRE(party::global_time_delta(13) == 13);
    REQUIRE(party::global_time_delta(0) == 0);
    REQUIRE(party::global_time_delta(-10) == 0);
    {
        party::scoped_player_context actor(1);
        REQUIRE(party::global_elapsed_time() == 120);
        REQUIRE(party::global_time_delta(6) == 0);
        REQUIRE(party::global_time_delta(20) == 0);
        REQUIRE(party::global_time_delta(25) == 5);
        // Rejoining the same floor cannot change campaign chronology.
        you.depth = 1;
        REQUIRE(party::global_time_delta(25) == 5);
    }
    REQUIRE(you.elapsed_time == 120);
    REQUIRE(party::get_player(1).elapsed_time == 100);
    REQUIRE(env.elapsed_time == 17);
    REQUIRE(party::floor_aut_clock(0) == 0);
    REQUIRE(party::floor_aut_clock(1) == 0);

    // A fallen leader's persisted timestamp still prevents time rewinding.
    you.hp = 0;
    {
        party::scoped_player_context actor(1);
        REQUIRE(party::global_elapsed_time() == 120);
        REQUIRE(party::global_time_delta(25) == 5);
    }
    party::set_multiplayer(false);
    REQUIRE(party::global_elapsed_time() == you.elapsed_time);
    REQUIRE(party::global_time_delta(6) == 6);
}

TEST_CASE_METHOD(session_fixture, "Zot advances even while encounter time waits for a teammate", "[party-session][zot][global-clock]")
{
    encounter_map map;
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(38, 35));
    you.duration[DUR_STICKY_FLAME] = 1;
    peer.duration[DUR_STICKY_FLAME] = 1;
    you.elapsed_time = peer.elapsed_time = 0;
    you.props.erase("ZOT_AUTS");
    peer.props.erase("ZOT_AUTS");
    decr_zot_clock();
    const int before = zot_clock_remaining_aut();
    int floor_delta = -1;
    REQUIRE(party::record_player_turn_and_get_world_delta(10, &floor_delta) == 0);
    REQUIRE(floor_delta == 0);
    incr_party_zot_clocks(party::global_time_delta(10));
    you.elapsed_time += 10;
    REQUIRE(zot_clock_remaining_aut() == before - 10);
    {
        party::scoped_player_context actor(1);
        REQUIRE(zot_clock_remaining_aut() == before - 10);
        REQUIRE(party::record_player_turn_and_get_world_delta(6, &floor_delta) == 6);
        REQUIRE(party::global_time_delta(6) == 0);
        incr_party_zot_clocks(party::global_time_delta(6));
        you.elapsed_time += 6;
        REQUIRE(zot_clock_remaining_aut() == before - 10);
    }
    REQUIRE(party::global_elapsed_time() == 10);
    REQUIRE(party::member_region_clock(0) == 6);
}

TEST_CASE_METHOD(session_fixture, "Region boundary entities advance with one clock", "[party-session]")
{
    encounter_map map;
    party::get_player(1).depth = 1;
    you.set_position(coord_def(26, 35));
    party::get_player(1).set_position(coord_def(50, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    const coord_def boundary(38, 35);
    REQUIRE(party::cloud_in_active_region(boundary, 0));
    REQUIRE_FALSE(party::cloud_in_active_region(boundary, 1));
    REQUIRE_FALSE(party::cloud_in_active_region(coord_def(39, 35), 0));
    REQUIRE(party::cloud_in_active_region(coord_def(39, 35), 1));

    monster enemy;
    enemy.type = MONS_RAT;
    enemy.hit_points = 10;
    enemy.set_position(boundary);
    REQUIRE(party::monster_in_active_region(enemy, 0));
    REQUIRE_FALSE(party::monster_in_active_region(enemy, 1));
    enemy.speed_increment = 73;
    REQUIRE(monster_energy_deficit(enemy.speed_increment) == 7);
    REQUIRE_FALSE(enemy.has_action_energy());
    enemy.speed_increment = 82;
    REQUIRE(monster_energy_deficit(enemy.speed_increment) == 0);
    REQUIRE(enemy.has_action_energy());

    // Entering personal sight joins the clocks without losing recovery.
    you.props["multiplayer_aut_clock"] = party::member_region_clock(0) + 6;
    party::get_player(1).set_position(coord_def(32, 35));
    REQUIRE(party::same_region(0, 1));
    REQUIRE(party::member_aut_clock(0) - party::member_region_clock(0) == 6);
}

TEST_CASE_METHOD(session_fixture, "Opaque walls separate nearby encounter clocks", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    player& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    you.duration[DUR_STICKY_FLAME] = 1;
    REQUIRE(party::advance_region_clock(10) == 10);
    const int combat_clock = party::member_region_clock(0);
    const int combat_time = party::member_aut_clock(0);
    {
        party::scoped_player_context actor(1);
        for (int step = 0; step < 6; ++step)
        {
            REQUIRE(party::member_can_act(1));
            REQUIRE(party::region_feels_safe(1));
            REQUIRE(party::party_feels_safe());
            REQUIRE(party::advance_region_clock(10) == 10);
            CHECK(party::member_region_clock(0) == combat_clock);
            CHECK(party::member_aut_clock(0) == combat_time);
        }
    }
    CHECK_FALSE(party::position_in_active_region(peer.pos(), 0));
    CHECK(party::position_in_active_region(you.pos(), 0));
    you.duration[DUR_STICKY_FLAME] = 0;
}

TEST_CASE_METHOD(session_fixture, "Sight transitions preserve unequal recovery through merge and split", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    party::reconcile_floor_regions();
    you.props["multiplayer_region_clock"] = 120;
    you.props["multiplayer_aut_clock"] = 126;
    peer.props["multiplayer_region_clock"] = 900;
    peer.props["multiplayer_aut_clock"] = 904;
    map.door(42);
    REQUIRE(party::same_region(0, 1));
    CHECK(party::member_region_clock(0) == 900);
    CHECK(party::member_aut_clock(0) == 906);
    CHECK(party::member_aut_clock(1) == 904);
    map.wall(42);
    REQUIRE_FALSE(party::same_region(0, 1));
    CHECK(party::member_aut_clock(0) - party::member_region_clock(0) == 6);
    CHECK(party::member_aut_clock(1) - party::member_region_clock(1) == 4);
}

TEST_CASE_METHOD(session_fixture, "Visible teammate chains share encounter time", "[party-session][encounter-time]")
{
    encounter_map map;
    party::set_player_count(3);
    for (int slot = 1; slot < 3; ++slot)
    {
        auto& member = party::get_player(slot);
        member = you;
        member.save = nullptr;
        member.mid = party::mid_for_slot(slot);
    }
    you.set_position(coord_def(28, 35));
    party::get_player(1).set_position(coord_def(34, 35));
    party::get_player(2).set_position(coord_def(40, 35));
    REQUIRE_FALSE(you.see_cell(party::get_player(2).pos()));
    REQUIRE(party::same_region(0, 2));
    party::set_player_count(2);
}

TEST_CASE_METHOD(session_fixture, "Entity deadlines survive independent progress and rebasing", "[party-session][encounter-time]")
{
    monster entity;
    entity.type = MONS_RAT;
    entity.hit_points = 10;
    env.elapsed_time = 120;
    advance_level_entity_clock(entity, 10);
    REQUIRE(level_elapsed_time(entity) == 130);
    entity.props["example_deadline"] = level_elapsed_time(entity) + 30;
    env.elapsed_time = 900;
    REQUIRE(level_elapsed_time(entity) == 130);
    CHECK(entity.props["example_deadline"].get_int() - level_elapsed_time(entity) == 30);
    advance_level_entity_clock(entity, 7);
    CHECK(level_elapsed_time(entity) == 137);
    CHECK(entity.props["example_deadline"].get_int() - level_elapsed_time(entity) == 23);
    monster saved = entity;
    CHECK(level_elapsed_time(saved) == level_elapsed_time(entity));
    CHECK(saved.props["example_deadline"].get_int() == entity.props["example_deadline"].get_int());
    party::set_multiplayer(false);
    CHECK(level_elapsed_time(entity) == you.elapsed_time);
}

TEST_CASE_METHOD(session_fixture, "Local markers age only with their owning encounter", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    auto* marker = new map_terrain_change_marker(coord_def(39, 35), DNGN_FLOOR,
        DNGN_FLOOR, 0, 0, 100, TERRAIN_CHANGE_FLOOD, 0);
    env.markers.add(marker);
    {
        party::scoped_player_context actor(1);
        timeout_terrain_changes(10);
        CHECK(marker->duration == 100);
    }
    timeout_terrain_changes(10);
    CHECK(marker->duration == 90);
    env.markers.remove(marker);
}

TEST_CASE_METHOD(session_fixture, "A shared visible threat connects heroes outside mutual sight", "[party-session][encounter-time]")
{
    encounter_map map;
    you.set_position(coord_def(26, 35));
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(40, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    encounter_monster threat(coord_def(33, 35));
    REQUIRE(you.see_cell(env.mons[0].pos()));
    REQUIRE(peer.see_cell(env.mons[0].pos()));
    REQUIRE(party::same_region(0, 1));
}

TEST_CASE_METHOD(session_fixture, "Visible combat owns entities nearer a wall-separated explorer", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    you.set_position(coord_def(36, 35));
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    encounter_monster threat(coord_def(41, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    REQUIRE(party::monster_in_active_region(env.mons[0], 0));
    REQUIRE_FALSE(party::monster_in_active_region(env.mons[0], 1));
    REQUIRE(party::cloud_in_active_region(coord_def(41, 35), 0));
    REQUIRE_FALSE(party::cloud_in_active_region(coord_def(41, 35), 1));
}

TEST_CASE_METHOD(session_fixture, "Shared persistent cloud observation joins encounter clocks", "[party-session][encounter-time]")
{
    encounter_map map;
    you.set_position(coord_def(26, 35));
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(40, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    const coord_def pos(33, 35);
    place_cloud(CLOUD_MIST, pos, 10, nullptr, 0);
    REQUIRE(cloud_at(pos));
    CHECK(party::same_region(0, 1));
    delete_cloud(pos);
}

TEST_CASE_METHOD(session_fixture, "Independent activity preserves another encounter summon and sleep flags", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    you.set_position(coord_def(36, 35));
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    encounter_monster threat(coord_def(41, 35));
    env.mons[0].flags |= MF_JUST_SUMMONED | MF_JUST_SLEPT;
    {
        party::scoped_player_context actor(1);
        clear_monster_flags();
        CHECK(static_cast<bool>(env.mons[0].flags & MF_JUST_SUMMONED));
        CHECK(static_cast<bool>(env.mons[0].flags & MF_JUST_SLEPT));
    }
    clear_monster_flags();
    CHECK_FALSE(static_cast<bool>(env.mons[0].flags & MF_JUST_SUMMONED));
    CHECK_FALSE(static_cast<bool>(env.mons[0].flags & MF_JUST_SLEPT));
}

TEST_CASE_METHOD(session_fixture, "Floor-wide timers keep an explicit common clock", "[party-session][encounter-time]")
{
    encounter_map map;
    map.wall(42);
    auto& peer = party::get_player(1);
    peer.depth = 1;
    peer.set_position(coord_def(44, 35));
    REQUIRE_FALSE(party::same_region(0, 1));
    const int forest_time = env.forest_awoken_until;
    env.forest_awoken_until = env.elapsed_time + 20;
    CHECK(party::same_region(0, 1));
    env.forest_awoken_until = forest_time;
    CHECK_FALSE(party::same_region(0, 1));
}

TEST_CASE_METHOD(session_fixture, "Travel carries recovery without moving another floor clock", "[party-session]")
{
    REQUIRE(party::advance_floor_clock(10) == 10);
    // A queued action's unelapsed recovery follows the hero to the new floor.
    you.props["multiplayer_aut_clock"] = 16;
    you.depth = 2;
    REQUIRE(party::member_aut_clock(0) == 6);
    REQUIRE(party::floor_aut_clock(0) == 0);
    you.depth = 1;
    REQUIRE(party::member_aut_clock(0) == 16);
    REQUIRE(party::floor_aut_clock(0) == 10);
    REQUIRE(party::floor_aut_clock(1) == 0);
}

TEST_CASE_METHOD(session_fixture, "Safe group actions settle different recovery costs once", "[party-session]")
{
    party::get_player(1).depth = 1;
    int elapsed = 0;
    for (const auto& action : {pair<int, int>{0, 10}, {1, 6}, {0, 13}, {1, 8}})
    {
        party::scoped_player_context actor(action.first);
        CAPTURE(action.first, action.second);
        REQUIRE(party::member_can_act(action.first));
        REQUIRE(party::advance_floor_clock(action.second) == action.second);
        elapsed += action.second;
        for (int slot = 0; slot < 2; ++slot)
        {
            REQUIRE(party::floor_aut_clock(slot) == elapsed);
            REQUIRE(party::member_region_clock(slot) == elapsed);
            REQUIRE(party::member_aut_clock(slot) == elapsed);
        }
    }
}

TEST_CASE_METHOD(session_fixture, "Native entity timestamps use floor time", "[party-session]")
{
    you.elapsed_time = 230;
    env.elapsed_time = 17;
    REQUIRE(level_elapsed_time() == 17);
    party::get_player(1).elapsed_time = 999;
    party::sync_shared_state_from_active();
    REQUIRE(you.elapsed_time == 230);
    REQUIRE(party::get_player(1).elapsed_time == 999);
    // The same restriction applies when the heroes meet again.
    party::get_player(1).depth = 1;
    party::sync_shared_state_from_active();
    REQUIRE(you.elapsed_time == 230);
    REQUIRE(party::get_player(1).elapsed_time == 999);
    REQUIRE(env.elapsed_time == 17);
    party::set_multiplayer(false);
    REQUIRE(level_elapsed_time() == 230);
}

TEST_CASE_METHOD(session_fixture, "Persistent actor identity does not follow the acting context", "[party-session]")
{
    party::scoped_player_context actor(1);
    REQUIRE(actor_by_mid(party::mid_for_slot(0)) == &party::get_player(0));
    REQUIRE(actor_by_mid(party::mid_for_slot(1)) == &party::get_player(1));
}

TEST_CASE_METHOD(session_fixture, "Downed reservations retain their floor and save state", "[party-session]")
{
    player& other = party::get_player(1);
    const coord_def original_pos = other.pos();
    party::set_player_downed(1, true);
    party::sync_all_proxies();
    REQUIRE(other.depth == 2);
    REQUIRE(other.pos() == original_pos);
    REQUIRE(other.props["party_downed"].get_bool());
    party::restore_downed_state();
    REQUIRE(party::is_player_downed(1));
    REQUIRE_FALSE(party::member_can_act(1));
    party::set_player_downed(1, false);
}

TEST_CASE_METHOD(session_fixture, "A departing participant cannot strand a recovering floor", "[party-session]")
{
    REQUIRE(party::advance_floor_clock(10) == 10);
    you.props["multiplayer_aut_clock"] = 16;
    you.duration[DUR_STICKY_FLAME] = 1;
    REQUIRE_FALSE(party::party_feels_safe());
    REQUIRE(party::member_can_act(0));
    REQUIRE(party::advance_floor_clock(10) == 16);
    REQUIRE(party::floor_aut_clock(0) == 26);
    REQUIRE(party::floor_aut_clock(1) == 0);
    you.duration[DUR_STICKY_FLAME] = 0;
}

TEST_CASE_METHOD(session_fixture, "Native message history preserves private recipients through saves", "[party-session]")
{
    clear_message_store();
    mpr_nojoin(MSGCH_PLAIN, "Host private observation.");
    flush_prev_message();
    {
        party::scoped_player_context actor(1);
        mpr_nojoin(MSGCH_PLAIN, "Guest private observation.");
        flush_prev_message();
        REQUIRE(get_last_messages(20, true).find("Host private") == string::npos);
    }
    vector<unsigned char> bytes;
    { writer output(&bytes); save_messages(output); }
    clear_message_store();
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    load_messages(input);
    REQUIRE(get_last_messages(20, true).find("Host private") != string::npos);
    REQUIRE(get_last_messages(20, true).find("Guest private") == string::npos);
    {
        party::scoped_player_context actor(1);
        REQUIRE(get_last_messages(20, true).find("Guest private") != string::npos);
        REQUIRE(get_last_messages(20, true).find("Host private") == string::npos);
    }
    clear_message_store();
}

TEST_CASE_METHOD(session_fixture, "Clouds preserve the creating hero when another context acts", "[party-session]")
{
    const coord_def position(40, 35);
    const auto original = env.grid(position);
    env.grid(position) = DNGN_FLOOR;
    {
        party::scoped_player_context actor(1);
        place_cloud(CLOUD_MIST, position, 10, &you, 0);
    }
    REQUIRE(cloud_at(position));
    REQUIRE(cloud_at(position)->source == party::mid_for_slot(1));
    REQUIRE(cloud_at(position)->agent() == &party::get_player(1));
    delete_cloud(position);
    env.grid(position) = original;
}

TEST_CASE_METHOD(session_fixture, "Floor generators share world templates and unique vault history", "[party-session]")
{
    you.props[TEMPLE_MAP_KEY] = "test_temple_template";
    you.props["private_character_effect"] = 100;
    party::get_player(1).uniq_map_names.insert("guest_floor_vault");
    party::sync_shared_state_from_active();
    REQUIRE(party::get_player(1).props[TEMPLE_MAP_KEY].get_string() == "test_temple_template");
    REQUIRE_FALSE(party::get_player(1).props.exists("private_character_effect"));
    REQUIRE(you.uniq_map_names.count("guest_floor_vault") == 1);
    REQUIRE(party::get_player(1).depth == 2);
    REQUIRE(party::floor_aut_clock(0) == 0);
    REQUIRE(party::floor_aut_clock(1) == 0);
}

TEST_CASE_METHOD(session_fixture, "Four characters explore fluidly and recover in floor-local combat", "[party-session]")
{
    party::set_player_count(4);
    for (int slot = 1; slot < 4; ++slot)
    {
        auto& member = party::get_player(slot);
        member = you;
        member.save = nullptr;
        member.mid = party::mid_for_slot(slot);
        member.depth = slot == 3 ? 2 : 1;
    }
    for (int slot : {2, 0, 1, 0, 2})
    {
        party::scoped_player_context context(slot);
        REQUIRE(party::member_can_act(slot));
        REQUIRE(party::advance_floor_clock(10) == 10);
    }
    REQUIRE(party::floor_aut_clock(0) == 50);
    REQUIRE(party::floor_aut_clock(3) == 0);
    // A personal hazard enters this floor into combat scheduling.
    you.duration[DUR_STICKY_FLAME] = 1;
    REQUIRE(party::advance_floor_clock(10) == 0);
    REQUIRE_FALSE(party::member_can_act(0));
    for (int slot : {2, 1})
    {
        party::scoped_player_context context(slot);
        REQUIRE(party::member_can_act(slot));
        REQUIRE(party::advance_floor_clock(10) == (slot == 1 ? 10 : 0));
    }
    REQUIRE(party::member_can_act(0));
    REQUIRE(party::floor_aut_clock(3) == 0);
    you.duration[DUR_STICKY_FLAME] = 0;
    party::set_player_count(2);
}

TEST_CASE_METHOD(session_fixture, "Yield is personal, repeatable, cancellable and stops before danger", "[party-session]")
{
    REQUIRE(party::start_yielding());
    REQUIRE(party::member_activity(0) == "yield");
    REQUIRE(party::member_activity(1).empty());
    for (int turn = 0; turn < 3; ++turn)
    {
        party::step_activity();
        REQUIRE(you.turn_is_over);
        REQUIRE(you.time_taken == player_speed());
        REQUIRE(party::advance_floor_clock(you.time_taken) == you.time_taken);
    }
    party::cancel_activity();
    REQUIRE(party::member_activity(0).empty());
    REQUIRE(party::start_yielding());
    you.turn_is_over = false;
    you.duration[DUR_STICKY_FLAME] = 1;
    const int clock = party::floor_aut_clock(0);
    party::step_activity();
    REQUIRE_FALSE(you.turn_is_over);
    REQUIRE(party::member_activity(0).empty());
    REQUIRE(party::floor_aut_clock(0) == clock);
    REQUIRE_FALSE(party::start_yielding());
    you.duration[DUR_STICKY_FLAME] = 0;
}

TEST_CASE_METHOD(session_fixture, "Rest, exploration and yield retain separate continuation state", "[party-session]")
{
    you.running.initialise(RDIR_REST, RMODE_REST_DURATION);
    REQUIRE(party::member_activity(0) == "rest");
    {
        party::scoped_player_context context(1);
        you.running.runmode = RMODE_EXPLORE;
        start_delay<TravelDelay>(false);
        REQUIRE(party::member_activity(1) == "explore");
        REQUIRE(party::member_activity(0) == "rest");
        // The lightweight fixture has no terminal to redraw on run-stop.
        you.running.runmode = RMODE_NOT_RUNNING;
        you.delay_queue.clear();
        REQUIRE(party::member_activity(1).empty());
    }
    REQUIRE(party::member_activity(0) == "rest");
    you.running.runmode = RMODE_NOT_RUNNING;
    you.delay_queue.clear();
    REQUIRE(party::start_yielding());
    REQUIRE(you.delay_queue.empty());
    REQUIRE(party::member_activity(0) == "yield");
    party::reset_activities();
    REQUIRE(party::member_activity(0).empty());
}

TEST_CASE_METHOD(vellum_fixture, "A pending extra life can save the party during the same monster turn",
                 "[party-revival-death]")
{
    init_monsters();
    dgn_reset_level(false);
    for (int x = 1; x < GXM - 1; ++x)
        for (int y = 1; y < GYM - 1; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    you.hp_max = 20;
    you.hp = 0; // The last standing member is now falling.
    you.religion = GOD_NO_GOD;
    you.set_position(coord_def(40, 35));
    party::set_player_count(2);
    player &crab = party::get_player(1);
    crab = you;
    crab.mid = party::mid_for_slot(1);
    crab.save = nullptr;
    crab.species = SP_HERMIT_CRAB;
    crab.your_name = "Crab Companion";
    crab.set_position(coord_def(42, 35));
    REQUIRE(hermit_crab::break_shell(crab));
    crab.pending_revival = true;

    SECTION("a pending shell is resolved before the survivor decision")
    {
        REQUIRE(party::prepare_survivor_for_death(0));
        CHECK(party::active_slot() == 0);
        CHECK(you.hp == 0);
        CHECK(crab.hp > 0);
        CHECK_FALSE(crab.pending_revival);
        REQUIRE(party::get_proxy_monster(1));
        CHECK(party::get_proxy_monster(1)->pos() == crab.pos());
        CHECK_FALSE(party::resolve_pending_revivals());
    }
    SECTION("an off-floor pending shell is not a survivor")
    {
        crab.depth = 2;
        CHECK_FALSE(party::prepare_survivor_for_death(0));
        CHECK(crab.pending_revival);
        CHECK(crab.hp == 0);
    }
    SECTION("a downed member is not a pending extra-life survivor")
    {
        party::set_player_downed(1, true);
        CHECK_FALSE(party::prepare_survivor_for_death(0));
        CHECK(crab.pending_revival);
    }
    SECTION("zero HP without a pending life is not a survivor")
    {
        crab.pending_revival = false;
        CHECK_FALSE(party::prepare_survivor_for_death(0));
        CHECK(crab.hp == 0);
    }

    party::set_player_downed(1, false);
    party::remove_all_proxies();
    crab.save = nullptr;
    party::set_player_count(1);
}
