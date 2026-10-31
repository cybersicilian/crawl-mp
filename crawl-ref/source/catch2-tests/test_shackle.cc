#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-shackle.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Shackle restrains movement without paralysis",
                 "[shackle]")
{
    init_monsters();
    monster victim;
    victim.type = MONS_RAT;
    REQUIRE_FALSE(victim.cannot_move());
    REQUIRE(shackle_monster(victim, &you, 30));
    CHECK(victim.has_ench(ENCH_SHACKLE));
    CHECK(victim.cannot_move());
    CHECK_FALSE(victim.cannot_act());
    CHECK(victim.get_ench(ENCH_SHACKLE).source == you.mid);
    victim.del_ench(ENCH_SHACKLE, true, true);
    CHECK_FALSE(victim.cannot_move());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Shackle cannot bind slime or insubstantial monsters",
                 "[shackle]")
{
    init_monsters();
    monster slime;
    slime.type = MONS_JELLY;
    CHECK_FALSE(shackle_monster(slime, &you, 100));
    CHECK_FALSE(slime.has_ench(ENCH_SHACKLE));
    monster ghost;
    ghost.type = MONS_WRAITH;
    REQUIRE(ghost.is_insubstantial());
    CHECK_FALSE(shackle_monster(ghost, &you, 100));
    CHECK_FALSE(ghost.has_ench(ENCH_SHACKLE));
}
