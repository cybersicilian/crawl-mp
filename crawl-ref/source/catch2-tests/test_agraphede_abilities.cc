#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "agraphede-abilities.h"
#include "env.h"
#include "potion-type.h"
#include "spl-cast.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Agraphede poison costs are exact and nonlethal",
                 "[agraphede][agraphede-abilities]")
{
    you.hp = 20;
    you.duration[DUR_POISONING] = 12500;
    CHECK(agraphede_abilities::poison_cost(ABIL_AGRAPHEDE_WEB) == 5);
    CHECK(agraphede_abilities::poison_cost(ABIL_AGRAPHEDE_ENCHANT_POISON) == 12);
    CHECK(agraphede_abilities::poison_cost(ABIL_AGRAPHEDE_TRAP) == 12);
    CHECK(agraphede_abilities::can_pay(ABIL_AGRAPHEDE_TRAP, true));
    agraphede_abilities::pay(ABIL_AGRAPHEDE_WEB);
    CHECK(you.hp == 15);
    CHECK(you.duration[DUR_POISONING] == 7500);
    you.hp = 7;
    CHECK_FALSE(agraphede_abilities::can_pay(ABIL_AGRAPHEDE_TRAP, true));
    CHECK(you.duration[DUR_POISONING] == 7500);
    you.hp = 8;
    agraphede_abilities::pay(ABIL_AGRAPHEDE_TRAP);
    CHECK(you.hp == 1);
    CHECK(you.duration[DUR_POISONING] == 0);
    CHECK_FALSE(agraphede_abilities::can_pay(ABIL_AGRAPHEDE_WEB, true));
}

TEST_CASE_METHOD(vellum_fixture, "Agraphede poison conversion is atomic",
                 "[agraphede][agraphede-abilities]")
{
    item_def& curing = carry(0, OBJ_POTIONS, POT_CURING, false);
    curing.quantity = 2;
    CHECK(agraphede_abilities::convert_curing_slot(0, 3, true) == spret::fail);
    CHECK(curing.quantity == 2);
    CHECK(agraphede_abilities::convert_curing_slot(0, 2, false) == spret::abort);
    CHECK(curing.quantity == 2);
    env.grid(you.pos()) = DNGN_LAVA;
    CHECK(agraphede_abilities::convert_curing_slot(0, 4, false) == spret::abort);
    CHECK(curing.quantity == 2);
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(agraphede_abilities::convert_curing_slot(0, 4, false) == spret::success);
    CHECK(curing.quantity == 1);
    int poison_count = 0;
    for (stack_iterator si(you.pos()); si; ++si)
        if (si->is_type(OBJ_POTIONS, POT_POISON))
            poison_count += si->quantity;
    CHECK(poison_count == 4);
}

TEST_CASE_METHOD(vellum_fixture, "Agraphede invalid web placement spends nothing",
                 "[agraphede][agraphede-abilities]")
{
    you.hp = 20;
    you.duration[DUR_POISONING] = 9000;
    CHECK(agraphede_abilities::create_web(you.pos(), false) == spret::abort);
    CHECK(you.hp == 20);
    CHECK(you.duration[DUR_POISONING] == 9000);
}
