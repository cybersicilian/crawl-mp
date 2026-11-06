#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>

#include "acquire.h"
#include "dungeon.h"
#include "env.h"
#include "item-def.h"
#include "items.h"
#include "mon-util.h"
#include "mutation.h"
#include "player.h"
#include "player-equip.h"
#include "test_vellum_fixture.h"

namespace
{
struct hydra_acquirement_fixture : vellum_fixture
{
    hydra_acquirement_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        you.set_position(coord_def(40, 35));
        env.grid(you.pos()) = DNGN_FLOOR;
        you.species = SP_HYDRA;
        you.religion = GOD_NO_GOD;
        for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
            you.mutation[mut] = you.innate_mutation[mut] = 0;
        give_basic_mutations(you.species);
        you.equipment.update();
    }
    ~hydra_acquirement_fixture() { dgn_reset_level(false); }
};
}

TEST_CASE_METHOD(hydra_acquirement_fixture,
                 "Hydra acquirement never offers weapons", "[hydra][acquirement]")
{
    CHECK_FALSE(player_can_use_weapons());
    for (int i = 0; i < 200; ++i)
    {
        const auto classes = shuffled_acquirement_classes(true);
        CHECK(find(classes.begin(), classes.end(), OBJ_WEAPONS) == classes.end());
        CHECK(find(classes.begin(), classes.end(), OBJ_STAVES) == classes.end());
    }
}

// Every weapon skill is unusable to a Hydra, so the weapon subtype picker
// used to find no candidates and abort on ASSERT(result != OBJ_RANDOM).
TEST_CASE_METHOD(hydra_acquirement_fixture,
                 "Hydra weapon acquirement does not abort", "[hydra][acquirement]")
{
    for (int i = 0; i < 20; ++i)
    {
        const int index = acquirement_create_item(OBJ_WEAPONS, AQ_SCROLL, true,
                                                  you.pos());
        if (index != NON_ITEM)
            destroy_item(index, true);
    }
    SUCCEED();
}
