#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "icicle-burst.h"
#include "losglobal.h"
#include "player.h"
#include "spl-cast.h"
#include "test_vellum_fixture.h"

namespace
{
struct icicle_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    icicle_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~icicle_fixture()
    {
        dgn_reset_level(false);
        brdepth[BRANCH_DUNGEON] = old_depth;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(icicle_fixture, "Icicle Burst previews the same spread it casts",
                 "[icicle-burst]")
{
    CHECK(icicle_burst_count(0) == 3);
    CHECK(icicle_burst_count(100) == 11);
    const coord_def origin = you.pos();
    icicle_burst_targeter preview(&you, 100, 5);
    REQUIRE(preview.set_aim(origin + coord_def(3, 0)));
    CHECK(preview.rays.size() == 11);
    CHECK(preview.is_affected(origin) == AFF_NO);
    CHECK(preview.is_affected(origin + coord_def(1, 0)) > AFF_NO);
    CHECK(preview.is_affected(origin + coord_def(-1, 0)) == AFF_NO);
    CHECK_FALSE(preview.valid_aim(origin));
    CHECK_FALSE(preview.valid_aim(origin + coord_def(6, 0)));
    CHECK(cast_icicle_burst(100, origin, false) == spret::abort);
    CHECK(cast_icicle_burst(100, origin + coord_def(3, 0), true) == spret::fail);
}
