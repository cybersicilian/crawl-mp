#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "env.h"
#include "item-prop.h"
#include "items.h"
#include "stash.h"
#include "test_player_fixture.h"

namespace
{
    const coord_def stash_pos(20, 20);

    int place_potion(int quantity)
    {
        const int index = get_mitm_slot(0);
        REQUIRE(index != NON_ITEM);
        item_def &item = env.item[index];
        item.base_type = OBJ_POTIONS;
        item.sub_type = POT_CURING;
        item.quantity = quantity;
        item.pos = stash_pos;
        item.link = env.igrid(stash_pos);
        env.igrid(stash_pos) = index;
        return index;
    }
}

// Views skip the costly part of a stash update when the pile looks unchanged,
// so every kind of change has to get through that check.
TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Stashes follow their pile between views",
                 "[stash]")
{
    env.grid(stash_pos) = DNGN_FLOOR;
    env.igrid(stash_pos) = NON_ITEM;
    const int first = place_potion(1);

    Stash stash(stash_pos);
    REQUIRE(stash.get_items().size() == 1);

    stash.update();
    CHECK(stash.get_items().size() == 1);

    env.item[first].quantity = 3;
    stash.update();
    REQUIRE(stash.get_items().size() == 1);
    CHECK(stash.get_items()[0].quantity == 3);

    env.item[first].inscription = "=g";
    stash.update();
    CHECK(stash.get_items()[0].inscription == "=g");

    const int second = place_potion(1);
    stash.update();
    CHECK(stash.get_items().size() == 2);

    // A hero who changes can see a pile differently, so even an untouched pile
    // gets looked at again eventually.
    const int turns = you.num_turns;
    env.item[second].quantity = 1;
    you.num_turns = turns + 64;
    stash.update();
    you.num_turns = turns;
    CHECK(stash.get_items().size() == 2);

    env.igrid(stash_pos) = NON_ITEM;
    env.item[first].clear();
    env.item[second].clear();
    stash.update();
    CHECK(stash.get_items().empty());
}
