#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>

#include "acquire.h"
#include "artefact.h"
#include "art-enum.h"
#include "dungeon.h"
#include "god-item.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-status-flag-type.h"
#include "items.h"
#include "mon-util.h"
#include "newgame-def.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Collectors preserve unique artefact reservations",
                 "[collector][party]")
{
    you.species = SP_HUMAN;
    you.unique_items.init(UNIQ_NOT_EXISTS);
    party::set_player_count(2);
    party::get_player(1).unique_items.init(UNIQ_NOT_EXISTS);
    party::set_multiplayer(true);
    int candidate = -1;
    for (int index = UNRAND_START + 1; index < UNRAND_LAST; ++index)
        if (collector_wish_eligible(index))
        {
            candidate = index;
            break;
        }
    REQUIRE(candidate > UNRAND_START);
    auto available = collector_wish_candidates();
    CHECK(find(available.begin(), available.end(), candidate) != available.end());
    CHECK(find(available.begin(), available.end(), UNRAND_GOLEM_ARMOUR)
          == available.end());
    party::get_player(1).unique_items[candidate - UNRAND_START] = UNIQ_EXISTS;
    CHECK_FALSE(collector_wish_eligible(candidate));
    available = collector_wish_candidates();
    CHECK(find(available.begin(), available.end(), candidate) == available.end());
    party::get_player(1).unique_items[candidate - UNRAND_START] = UNIQ_NOT_EXISTS;
    CHECK(collector_wish_eligible(candidate));
    CHECK_FALSE(collector_wish_eligible(UNRAND_START));
    CHECK_FALSE(collector_wish_eligible(UNRAND_LAST));
    CHECK_FALSE(collector_wish_eligible(UNRAND_GOLEM_ARMOUR));
    CHECK_FALSE(collector_wish_eligible(UNRAND_GOLEM_BOOTS));
    CHECK_FALSE(collector_wish_eligible(UNRAND_GOLEM_GLOVES));
    CHECK_FALSE(collector_wish_eligible(UNRAND_GOLEM_HELMET));
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(vellum_fixture, "Collector choice is distinct from ordinary scrolls",
                 "[collector]")
{
    item_def scroll;
    scroll.base_type = OBJ_SCROLLS;
    scroll.sub_type = SCR_COLLECTION;
    scroll.quantity = 1;
    scroll.props[COLLECTOR_CHOICE_KEY] = true;
    scroll.flags |= ISFLAG_IDENTIFIED;
    CHECK(scroll.name(DESC_PLAIN).find("Collector's Choice") != string::npos);
    item_def ordinary = scroll;
    ordinary.props.erase(COLLECTOR_CHOICE_KEY);
    CHECK_FALSE(items_stack(scroll, ordinary));
    CHECK(items_stack(scroll, scroll));
    scroll.props.erase(COLLECTOR_CHOICE_KEY);
    CHECK(scroll.name(DESC_PLAIN).find("collection") != string::npos);
    CHECK(string(scroll_type_name(SCR_WISH)) == "wish");
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Collectors start knowing their scroll",
                 "[collector]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_COLLECTOR;
    ng.weapon = WPN_SHORT_SWORD;
    init_item_name_cache();
    give_items_skills(ng);
    identify_inventory();
    const item_def *scroll = nullptr;
    for (const item_def& item : you.inv)
        if (item.is_type(OBJ_SCROLLS, SCR_COLLECTION))
            scroll = &item;
    REQUIRE(scroll);
    CHECK(scroll->props.exists(COLLECTOR_CHOICE_KEY));
    CHECK(item_type_known(*scroll));
    CHECK(scroll->name(DESC_PLAIN).find("Collector's Choice") != string::npos);
}

TEST_CASE_METHOD(vellum_fixture, "Collector's Choice stays sealed until its level",
                 "[collector]")
{
    item_def scroll;
    scroll.base_type = OBJ_SCROLLS;
    scroll.sub_type = SCR_COLLECTION;
    scroll.quantity = 1;
    scroll.flags |= ISFLAG_IDENTIFIED;
    item_def ordinary = scroll;
    scroll.props[COLLECTOR_CHOICE_KEY] = true;

    you.experience_level = COLLECTOR_CHOICE_XL - 1;
    CHECK_FALSE(cannot_read_item_reason(&scroll, true, true).empty());
    CHECK(cannot_read_item_reason(&ordinary, true, true).empty());
    // Character creation discards permanently useless items.
    CHECK_FALSE(is_useless_item(scroll, false));

    you.experience_level = COLLECTOR_CHOICE_XL;
    CHECK(cannot_read_item_reason(&scroll, true, true).empty());
}

TEST_CASE_METHOD(vellum_fixture, "Collector shortlists are small and cannot be rerolled",
                 "[collector]")
{
    you.species = SP_HUMAN;
    you.unique_items.init(UNIQ_NOT_EXISTS);
    const auto shortlist = collector_wish_shortlist();
    REQUIRE(static_cast<int>(shortlist.size()) == COLLECTOR_SHORTLIST_SIZE);
    for (int index : shortlist)
        CHECK(collector_wish_eligible(index));
    CHECK(collector_wish_shortlist() == shortlist);

    // An artefact that stops being available is replaced; the others stay.
    you.unique_items[shortlist[0] - UNRAND_START] = UNIQ_EXISTS;
    const auto refilled = collector_wish_shortlist();
    REQUIRE(refilled.size() == shortlist.size());
    CHECK(find(refilled.begin(), refilled.end(), shortlist[0]) == refilled.end());
    CHECK(find(refilled.begin(), refilled.end(), shortlist[1]) != refilled.end());
    CHECK(find(refilled.begin(), refilled.end(), shortlist[2]) != refilled.end());
    you.props.erase(COLLECTOR_SHORTLIST_KEY);
}

TEST_CASE("Collector wish pages keep every artefact reachable with unique keys",
          "[collector]")
{
    vector<int> candidates;
    for (int i = 1; i <= 130; ++i)
        candidates.push_back(i);
    vector<int> seen;
    for (size_t page = 0; page < 3; ++page)
    {
        const auto entries = collector_wish_page_entries(candidates, page);
        // Every entry receives one of the 52 distinct a-z/A-Z menu keys.
        CHECK(entries.size() <= 52);
        CHECK(find(entries.begin(), entries.end(), WISH_RANDOM) != entries.end());
        CHECK(find(entries.begin(), entries.end(), WISH_SEARCH) != entries.end());
        CHECK((find(entries.begin(), entries.end(), WISH_PREVIOUS_PAGE)
               != entries.end()) == (page != 0));
        CHECK((find(entries.begin(), entries.end(), WISH_NEXT_PAGE)
               != entries.end()) == (page != 2));
        for (int entry : entries)
            if (entry > 0)
                seen.push_back(entry);
    }
    CHECK(seen == candidates);
    CHECK(collector_wish_page_entries({}, 0).size() == 2);
}

TEST_CASE_METHOD(vellum_fixture, "A failed collection placement retains its offer",
                 "[collector]")
{
    item_def offer;
    offer.base_type = OBJ_WEAPONS;
    offer.sub_type = WPN_DAGGER;
    offer.quantity = 1;
    auto &offers = you.props[COLLECTION_ITEMS_KEY].get_vector();
    offers.push_back(offer);
    env.grid(you.pos()) = DNGN_LAVA;
    CHECK_FALSE(collector_claim_collection_item(0));
    REQUIRE(you.props.exists(COLLECTION_ITEMS_KEY));
    CHECK(you.props[COLLECTION_ITEMS_KEY].get_vector().size() == 1);
    env.grid(you.pos()) = DNGN_FLOOR;
}

TEST_CASE_METHOD(vellum_fixture, "Collection offers respect current restrictions",
                 "[collector]")
{
    you.species = SP_HUMAN;
    item_def offer;
    offer.base_type = OBJ_ARMOUR;
    offer.sub_type = ARM_TOWER_SHIELD;
    offer.quantity = 1;
    offer.flags |= ISFLAG_IDENTIFIED;
    auto &offers = you.props[COLLECTION_ITEMS_KEY].get_vector();
    offers.push_back(offer);
    you.inv[0].base_type = OBJ_SCROLLS;
    you.inv[0].sub_type = SCR_COLLECTION;
    you.inv[0].quantity = 1;
    REQUIRE_FALSE(is_useless_item(offer, false));
    REQUIRE_FALSE(god_forbids_item(offer));

    SECTION("a new god forbids the offer")
    {
        you.religion = GOD_IMUS_THEA;
        REQUIRE(god_forbids_item(offer));
    }
    SECTION("a new anatomy cannot use the offer")
    {
        you.mutation[MUT_NO_GRASPING] = 1;
        REQUIRE(is_useless_item(offer, false));
    }

    CHECK_FALSE(collector_claim_collection_item(0));
    REQUIRE(you.props.exists(COLLECTION_ITEMS_KEY));
    REQUIRE(you.props[COLLECTION_ITEMS_KEY].get_vector().size() == 1);
    CHECK(you.props[COLLECTION_ITEMS_KEY].get_vector()[0].get_item().sub_type
          == ARM_TOWER_SHIELD);
    CHECK(you.inv[0].is_type(OBJ_SCROLLS, SCR_COLLECTION));
    CHECK(you.inv[0].quantity == 1);
}

TEST_CASE_METHOD(vellum_fixture, "A full floor item table does not consume a collection",
                 "[collector]")
{
    init_monsters();
    dgn_reset_level(false);
    you.set_position(coord_def(40, 35));
    env.grid(you.pos()) = DNGN_FLOOR;
    item_def offer;
    offer.base_type = OBJ_WEAPONS;
    offer.sub_type = WPN_DAGGER;
    offer.quantity = 1;
    you.props[COLLECTION_ITEMS_KEY].get_vector().push_back(offer);
    // Unlinked occupied slots cannot be culled, so placement must fail.
    for (item_def &item : env.item)
    {
        item.base_type = OBJ_GOLD;
        item.quantity = 1;
    }
    CHECK_FALSE(collector_claim_collection_item(0));
    CHECK(you.props.exists(COLLECTION_ITEMS_KEY));
    if (you.props.exists(COLLECTION_ITEMS_KEY))
        CHECK(you.props[COLLECTION_ITEMS_KEY].get_vector().size() == 1);
    for (item_def &item : env.item)
        item.clear();
    dgn_reset_level(false);
}
