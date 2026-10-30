#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "imus-prism.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Imus prism is stationary and respects light blindness immunity", "[imus-prism]")
{
    init_monsters();
    CHECK(mons_class_is_stationary(MONS_IMUS_PRISM));
    monster orc;
    orc.type = MONS_ORC;
    orc.set_position(you.pos() + coord_def(1, 0));
    CHECK(imus_prism_can_dazzle(orc));
    monster prism;
    prism.type = MONS_IMUS_PRISM;
    prism.set_position(you.pos() + coord_def(2, 0));
    CHECK_FALSE(imus_prism_can_dazzle(prism));
}
