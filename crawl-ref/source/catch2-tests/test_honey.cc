#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "env.h"
#include "monster.h"
#include "mon-util.h"
#include "player.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Honey slows walking more than water and respects flight", "[burrows][honey]")
{
    you.set_position(coord_def(40,35));
    const unwind_var<dungeon_feature_type> terrain(env.grid(you.pos()),DNGN_FLOOR);
    const int dry=player_movement_speed();
    env.grid(you.pos())=DNGN_SHALLOW_WATER;
    const int water=player_movement_speed();
    env.grid(you.pos())=DNGN_SHALLOW_HONEY;
    CHECK(player_movement_speed()>water);
    CHECK(player_movement_speed()==dry+BASELINE_DELAY);
    CHECK(player_movement_speed(false)==dry);
    CHECK(feat_has_solid_floor(DNGN_SHALLOW_HONEY));
    CHECK_FALSE(feat_has_dry_floor(DNGN_SHALLOW_HONEY));
    CHECK_FALSE(feat_is_water(DNGN_SHALLOW_HONEY));
    CHECK_FALSE(is_feat_dangerous(DNGN_SHALLOW_HONEY));
    you.duration[DUR_FLIGHT]=100;
    REQUIRE(you.airborne());
    CHECK(player_movement_speed()==dry);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Honey penalises grounded monsters without slowing attacks", "[burrows][honey]")
{
    init_monsters();
    const coord_def p(40,36);
    const unwind_var<dungeon_feature_type> terrain(env.grid(p),DNGN_FLOOR);
    for (monster_type type : {MONS_WAX_BEETLE,MONS_NAGA_WARRIOR,MONS_VENOM_WASP})
    {
        CAPTURE(type);
        monster mon;
        mon.type=type;
        mon.base_attitude=ATT_HOSTILE;
        mon.set_position(p);
        env.grid(p)=DNGN_FLOOR;
        const int movement=mon.action_energy(EUT_MOVE);
        const int attack=mon.action_energy(EUT_ATTACK);
        env.grid(p)=DNGN_SHALLOW_HONEY;
        CHECK(mon.action_energy(EUT_MOVE)==movement+(mon.airborne()?0:BASELINE_DELAY));
        CHECK(mon.action_energy(EUT_ATTACK)==attack);
    }
}
