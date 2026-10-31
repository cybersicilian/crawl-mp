#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "delay.h"
#include "env.h"
#include "feature.h"
#include "party.h"
#include "player.h"
#include "test_player_fixture.h"

namespace
{
class CountingDelay : public Delay
{
    int& ticks;
public:
    CountingDelay(int turns, int& count) : Delay(turns), ticks(count) {}
    const char* name() const override { return "counting"; }
    const char* cooperative_activity_name() const override { return "assimilating"; }
    bool try_interrupt(bool) override { return true; }
    void handle() override
    {
        if (duration <= 0)
            return;
        --duration;
        ++ticks;
        you.time_taken = BASELINE_DELAY;
        you.turn_is_over = true;
    }
};

struct cooperative_fixture : MockPlayerYouTestsFixture
{
    cooperative_fixture()
    {
        init_show_table();
        party::reset_activities();
        party::set_player_count(2);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 20;
        you.set_position(coord_def(40, 35));
        env.grid(you.pos()) = DNGN_FLOOR;
        player& peer = party::get_player(1);
        peer = you;
        peer.mid = party::mid_for_slot(1);
        peer.save = nullptr;
        peer.depth = 2;
        party::set_multiplayer(true);
    }
    ~cooperative_fixture()
    {
        you.delay_queue.clear();
        party::get_player(1).delay_queue.clear();
        party::get_player(1).save = nullptr;
        party::reset_activities();
        party::set_multiplayer(false);
        party::set_player_count(1);
    }
};
}

TEST_CASE_METHOD(cooperative_fixture,
                 "Long tasks yield after one owner action and keep peer work separate",
                 "[cooperative-delay][party-session]")
{
    int own_ticks = 0, peer_ticks = 0;
    auto own = start_delay<CountingDelay>(5, own_ticks);
    REQUIRE(party::member_activity(0) == "assimilating");
    REQUIRE(party::member_activity(1).empty());
    party::step_activity();
    CHECK(own_ticks == 1);
    CHECK(own->duration == 4);
    CHECK(you.time_taken == BASELINE_DELAY);
    REQUIRE(party::advance_floor_clock(you.time_taken) == BASELINE_DELAY);
    {
        party::scoped_player_context context(1);
        auto peer = start_delay<CountingDelay>(3, peer_ticks);
        REQUIRE(party::member_can_act(1));
        party::step_activity();
        CHECK(peer_ticks == 1);
        CHECK(own_ticks == 1);
        CHECK(peer->duration == 2);
        party::cancel_activity();
        CHECK(party::member_activity(1).empty());
    }
    CHECK(party::member_activity(0) == "assimilating");
    CHECK(own->duration == 4);
    party::step_activity();
    CHECK(own_ticks == 2);
    CHECK(peer_ticks == 1);
}

TEST_CASE_METHOD(cooperative_fixture,
                 "Danger interrupts long tasks before another action is spent",
                 "[cooperative-delay][party-session]")
{
    int ticks = 0;
    start_delay<CountingDelay>(5, ticks);
    you.duration[DUR_STICKY_FLAME] = 1;
    you.turn_is_over = false;
    const int clock = party::floor_aut_clock(0);
    party::step_activity();
    CHECK(ticks == 0);
    CHECK_FALSE(you.turn_is_over);
    CHECK(party::member_activity(0).empty());
    CHECK(party::floor_aut_clock(0) == clock);
    you.duration[DUR_STICKY_FLAME] = 0;
}

TEST_CASE("Input macros keep their existing delay contract", "[cooperative-delay]")
{
    MacroDelay macro;
    MacroProcessKeyDelay key;
    CHECK_FALSE(macro.is_cooperative());
    CHECK_FALSE(key.is_cooperative());
}

TEST_CASE_METHOD(cooperative_fixture,
                 "Uninterruptible native work still yields and cannot freeze on danger",
                 "[cooperative-delay][party-session]")
{
    class UninterruptibleDelay : public CountingDelay
    {
    public:
        using CountingDelay::CountingDelay;
        bool try_interrupt(bool) override { return false; }
    };
    int ticks = 0;
    auto task = start_delay<UninterruptibleDelay>(2, ticks);
    you.duration[DUR_STICKY_FLAME] = 1;
    party::step_activity();
    CHECK(ticks == 1);
    CHECK(task->duration == 1);
    CHECK(you.turn_is_over);
    you.duration[DUR_STICKY_FLAME] = 0;
}
