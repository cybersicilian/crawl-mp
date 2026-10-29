#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "branch.h"
#include "party.h"
#include "player.h"
#include "state.h"
#include "unwind.h"
#include "zot.h"
#include "test_player_fixture.h"

namespace
{
struct party_clock_cleanup
{
    ~party_clock_cleanup()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::player_count(); ++slot)
        {
            party::get_player(slot).mutation[MUT_SHORT_LIFESPAN] = 0;
            party::get_player(slot).save = nullptr;
        }
        party::set_player_count(1);
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Multiplayer Zot deadlines follow global time across floors", "[zot][global-clock]")
{
    party::set_player_count(4);
    party_clock_cleanup cleanup;
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    you.elapsed_time = 0;
    you.props.erase("ZOT_AUTS");
    you.props.erase("ZOT_LIFESPAN_DIVISORS");
    for (int slot = 1; slot < 4; ++slot)
    {
        party::get_player(slot) = you;
        party::get_player(slot).save = nullptr;
        party::get_player(slot).depth = slot + 1;
    }
    party::get_player(2).where_are_you = BRANCH_ORC;
    party::get_player(3).where_are_you = BRANCH_ABYSS;
    party::set_multiplayer(true);
    decr_zot_clock();
    {
        party::scoped_player_context actor(2);
        decr_zot_clock();
    }
    int initial[4];
    for (int slot = 0; slot < 4; ++slot)
    {
        party::scoped_player_context actor(slot);
        initial[slot] = zot_clock_remaining_aut();
    }

    const auto act = [&](int slot, int cost, int expected_delta, int global_time)
    {
        party::scoped_player_context actor(slot);
        you.time_taken = cost;
        int action_costs[4];
        for (int member = 0; member < 4; ++member)
            action_costs[member] = party::get_player(member).time_taken;
        const int delta = party::global_time_delta(cost);
        REQUIRE(delta == expected_delta);
        incr_party_zot_clocks(delta);
        REQUIRE(you.time_taken == cost);
        you.elapsed_time += cost;
        REQUIRE(party::global_elapsed_time() == global_time);
        for (int member = 0; member < 4; ++member)
        {
            party::scoped_player_context recipient(member);
            CAPTURE(slot, cost, member, global_time);
            REQUIRE(you.time_taken == action_costs[member]);
            const int spent = member == 3 ? 0 : global_time;
            REQUIRE(zot_clock_remaining_aut() == initial[member] - spent);
        }
    };
    act(0, 10, 10, 10);
    act(1, 6, 0, 10);   // Catching up is free to the global clock.
    act(1, 8, 4, 14);   // Only the overtake counts.
    act(0, 13, 9, 23);
    act(2, 25, 2, 25);  // Another branch can lead the expedition.
    act(3, 30, 5, 30);  // Abyss immunity pauses only that hero's Zot clock.
    act(1, 0, 0, 30);
    REQUIRE(party::get_player(0).elapsed_time == 23);
    REQUIRE(party::get_player(1).elapsed_time == 14);
    REQUIRE(party::get_player(2).elapsed_time == 25);
    REQUIRE(party::get_player(3).elapsed_time == 30);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Party short lifespans shorten native Zot deadlines", "[zot]")
{
    party::set_player_count(4);
    party_clock_cleanup cleanup;
    for (int slot = 1; slot < party::player_count(); ++slot)
    {
        player &hero = party::get_player(slot);
        hero = player();
        hero.species = SP_HUMAN;
        hero.where_are_you = BRANCH_DUNGEON;
    }
    you.where_are_you = BRANCH_DUNGEON;
    you.props.erase("ZOT_AUTS");
    you.props.erase("ZOT_LIFESPAN_DIVISORS");
    decr_zot_clock();
    const int floor_turns = zot_clock_per_floor() / BASELINE_DELAY;
    REQUIRE(turns_until_zot() == floor_turns);
    REQUIRE(zot_lifespan_divisor() == 1);
    const int capacity = zot_clock_capacity_aut();
    for (int count = 1; count <= 4; ++count)
    {
        party::get_player(count - 1).mutation[MUT_SHORT_LIFESPAN] = 1;
        REQUIRE(zot_short_lifespan_count() == count);
        REQUIRE(zot_lifespan_divisor() == 1 + 9 * count);
        REQUIRE(turns_until_zot() == floor_turns / (1 + 9 * count));
        REQUIRE(zot_clock_capacity_aut() == capacity / (1 + 9 * count));
    }

    // Removing traits restores the remaining allowance without resetting time.
    for (int slot = 0; slot < 4; ++slot)
        party::get_player(slot).mutation[MUT_SHORT_LIFESPAN] = 0;
    REQUIRE(turns_until_zot() == floor_turns);
    party::get_player(1).mutation[MUT_SHORT_LIFESPAN] = 1;
    you.time_taken = BASELINE_DELAY;
    incr_zot_clock();
    REQUIRE(turns_until_zot() == floor_turns / 10 - 1);
    party::get_player(2).mutation[MUT_SHORT_LIFESPAN] = 1;
    REQUIRE(turns_until_zot() == (floor_turns - 10) / 19);
    const int before = zot_clock_remaining_aut();
    incr_zot_clock();
    REQUIRE(zot_clock_remaining_aut() == before - BASELINE_DELAY);
    set_turns_until_zot(50);
    REQUIRE(turns_until_zot() == 50);
    REQUIRE(bezotting_level() == 1);
    set_turns_until_zot(4);
    REQUIRE(bezotting_level() == 3);

    // Floor grants scale with the whole party, including on a different hero.
    {
        unwind_var<player*> context(real_you, &party::get_player(1));
        // Start a fresh branch clock; the earlier party grant already reached
        // this hero. Its current short lifespan sets the native storage units.
        you.props.erase("ZOT_AUTS");
        you.props.erase("ZOT_LIFESPAN_DIVISORS");
        decr_zot_clock();
        REQUIRE(turns_until_zot() == floor_turns / 19);
        set_turns_until_zot(50);
        REQUIRE(turns_until_zot() == 50);
        you.props.erase("ZOT_LIFESPAN_DIVISORS");
        REQUIRE(turns_until_zot() == 50); // Legacy short-lifespan save migration.
        you.religion = GOD_CHEIBRIADOS;
        REQUIRE(turns_until_zot() == 75);
        set_turns_until_zot(30);
        REQUIRE(turns_until_zot() == 30);
        you.where_are_you = BRANCH_ABYSS;
        REQUIRE_FALSE(zot_clock_active());
        set_turns_until_zot(200);
        const int paused = zot_clock_remaining_aut();
        you.time_taken = BASELINE_DELAY;
        incr_zot_clock();
        REQUIRE(zot_clock_remaining_aut() == paused);
    }
}
