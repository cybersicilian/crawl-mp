#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "player.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Steam barrier changes defensive stats", "[steam-barrier]")
{
    you.duration[DUR_STEAM_BARRIER] = 0;
    const int fire = player_res_fire(false, true, false);
    const int cold = player_res_cold(false, true, false);
    const int ac = you.armour_class_scaled(100);
    you.duration[DUR_STEAM_BARRIER] = 120;
    CHECK(player_res_fire(false, true, false) == fire + 1);
    CHECK(player_res_cold(false, true, false) == cold - 1);
    CHECK(you.armour_class_scaled(100) == ac + 800);
    CHECK(player_res_fire(false, false, false) == fire);
    CHECK(player_res_cold(false, false, false) == cold);
}
