#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "god-abil.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "ronin.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ronin first faith applies only once", "[ronin]")
{
    you.char_class = JOB_RONIN;
    you.worshipped.init(0);
    you.religion = GOD_RU;
    you.props[RU_SACRIFICE_DELAY_KEY] = 50;
    REQUIRE(ronin_first_faith());
    apply_ronin_first_faith();
    CHECK(you.props[RU_SACRIFICE_DELAY_KEY].get_int() == 25);
    you.worshipped[GOD_TROG] = 1;
    CHECK_FALSE(ronin_first_faith());
    apply_ronin_first_faith();
    CHECK(you.props[RU_SACRIFICE_DELAY_KEY].get_int() == 25);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ronin's first Gozag fee is halved", "[ronin]")
{
    you.worshipped.init(0);
    you.attribute[ATTR_GOLD_GENERATED] = 1000;
    you.char_class = JOB_FIGHTER;
    const int ordinary_fee = gozag_service_fee();
    REQUIRE(ordinary_fee > 1);
    you.char_class = JOB_RONIN;
    CHECK(gozag_service_fee() == ordinary_fee / 2);
    you.worshipped[GOD_TROG] = 1;
    CHECK(gozag_service_fee() == ordinary_fee);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ronin gains piety on first ordinary faith", "[ronin]")
{
    you.char_class = JOB_RONIN;
    you.worshipped.init(0);
    you.religion = GOD_TROG;
    you.raw_piety = 0;
    you.gift_timeout = 0;
    apply_ronin_first_faith();
    CHECK(you.raw_piety == 20);
    you.worshipped[GOD_TROG] = 1;
    apply_ronin_first_faith();
    CHECK(you.raw_piety == 20);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ronin first faith uses the active party member", "[ronin]")
{
    you.char_class = JOB_RONIN;
    you.worshipped.init(0);
    you.religion = GOD_RU;
    you.props[RU_SACRIFICE_DELAY_KEY] = 50;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.props[RU_SACRIFICE_DELAY_KEY] = 80;
    party::set_multiplayer(true);
    {
        party::scoped_player_context ctx(1);
        apply_ronin_first_faith();
        CHECK(you.props[RU_SACRIFICE_DELAY_KEY].get_int() == 40);
        CHECK(party::get_player(0).props[RU_SACRIFICE_DELAY_KEY].get_int() == 50);
    }
    party::set_multiplayer(false);
    other.save = nullptr;
    party::set_player_count(1);
}
