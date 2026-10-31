#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "items.h"
#include "party.h"
#include "party-tally.h"
#include "player.h"
#include "test_player_fixture.h"

namespace
{
struct tally_fixture : MockPlayerYouTestsFixture
{
    tally_fixture()
    {
        party::set_multiplayer(true);
        party::set_player_count(2);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 30;
        player& partner = party::get_player(1);
        partner = you;
        partner.your_name = "Partner";
        partner.mid = party::mid_for_slot(1);
        partner.save = nullptr;
        // Off the map, so healing the partner places no proxy monster.
        partner.set_position(coord_def());
        // Fresh heroes carry no saved tallies, so this zeroes every count.
        party::restore_tallies();
    }
    ~tally_fixture()
    {
        party::set_seasoning_heavy_pebbles(false);
        party::remove_all_proxies();
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
        party::set_multiplayer(false);
        party::restore_tallies();
    }
};
}

TEST_CASE_METHOD(tally_fixture, "Helping a partner earns support credit", "[party-tally]")
{
    party::get_player(1).hp = 10;
    party::heal_or_buff_party_member(1, 5);
    REQUIRE(party::slot_support_acts(0) == 1);
    REQUIRE(party::slot_mvp_title(0) == "Master Ladler");

    SECTION("Healing yourself earns nothing")
    {
        you.hp = 10;
        party::heal_or_buff_party_member(0, 5);
        REQUIRE(party::slot_support_acts(0) == 1);
    }
    SECTION("A heal that changes nothing earns nothing")
    {
        party::get_player(1).hp = party::get_player(1).hp_max;
        party::heal_or_buff_party_member(1, 5);
        REQUIRE(party::slot_support_acts(0) == 1);
    }
}

TEST_CASE_METHOD(tally_fixture, "Tallies survive save and restore", "[party-tally]")
{
    party::get_player(1).hp = 10;
    party::heal_or_buff_party_member(1, 5);
    party::save_tallies();
    REQUIRE(you.props["party_support_acts"].get_int() == 1);

    party::get_player(1).props["party_citation_points"] = 750;
    party::restore_tallies();
    REQUIRE(party::slot_support_acts(0) == 1);
    REQUIRE(party::slot_citation_points(1) == 750);
}

TEST_CASE_METHOD(tally_fixture, "Older saves treat already-seen floors as claimed", "[party-tally]")
{
    you.props.erase("party_floor_firsts");
    party::get_player(1).props["visited_levels"].get_table()["D:4"] = true;
    party::restore_tallies();
    auto &firsts = you.props["party_floor_firsts"].get_table();
    REQUIRE(firsts.exists("D:4"));
    REQUIRE(firsts["D:4"].get_int() == -1);
}

TEST_CASE_METHOD(tally_fixture, "Heavy Pebbles doubles relic and rune citations", "[party-tally]")
{
    item_def rune;
    rune.base_type = OBJ_RUNES;
    rune.sub_type = RUNE_SLIME;
    rune.quantity = 1;
    item_def potion;
    potion.base_type = OBJ_POTIONS;
    potion.sub_type = POT_EXPERIENCE;
    potion.quantity = 1;

    party::award_item_citation(rune, 500);
    party::award_item_citation(potion, 180);
    REQUIRE(party::slot_citation_points(0) == 680);

    party::set_seasoning_heavy_pebbles(true);
    party::award_item_citation(rune, 500);
    party::award_item_citation(potion, 180);
    REQUIRE(party::slot_citation_points(0) == 680 + 1000 + 180);
}
