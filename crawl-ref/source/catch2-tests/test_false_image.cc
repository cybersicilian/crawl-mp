#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "test_player_fixture.h"

TEST_CASE("False images are immobile and only their caster shoots through them",
          "[false-image]")
{
    REQUIRE(mons_class_is_stationary(MONS_FALSE_IMAGE));
    monster image;
    image.type = MONS_FALSE_IMAGE;
    image.summoner = 12345;
    bolt shot;
    shot.source_id = 12345;
    CHECK(shot.ignores_monster(&image));
    shot.source_id = 12346;
    CHECK_FALSE(shot.ignores_monster(&image));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "False image monster metadata preserves its owner", "[false-image]")
{
    init_monsters();
    monster image;
    image.type = MONS_FALSE_IMAGE;
    image.summoner = 12345;
    image.hit_points = image.max_hit_points = 10;
    image.set_hit_dice(1);
    image.set_position(you.pos() + coord_def(1, 0));
    const monster_info info(&image);
    REQUIRE(info.props.exists("false_image_owner"));
    CHECK(info.props["false_image_owner"].get_int() == 12345);
}
