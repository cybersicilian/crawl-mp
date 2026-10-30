#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "dungeon.h"
#include "env.h"
#include "god-companions.h"
#include "god-abil.h"
#include "item-name.h"
#include "item-prop.h"
#include "jobs.h"
#include "mercenary.h"
#include "mercenary-transit.h"
#include "mon-transit.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "shopping.h"
#include "test_vellum_fixture.h"

namespace
{
struct hire_fixture : vellum_fixture
{
    hire_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        init_companions();
        the_lost_ones.clear();
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.on_current_level = true;
    }
    ~hire_fixture()
    {
        init_companions();
        the_lost_ones.clear();
        if (party::player_count() > 1)
            party::get_player(1).save = nullptr;
        party::set_multiplayer(false);
        party::set_player_count(1);
        dgn_reset_level(false);
    }
};
}

TEST_CASE_METHOD(hire_fixture, "Mercenary contracts preserve a named role and price",
                 "[mercenary][shop]")
{
    item_def contract;
    contract.base_type = OBJ_MISCELLANY;
    contract.sub_type = MISC_MERCENARY_CONTRACT;
    contract.quantity = 1;
    CHECK_FALSE(mercenary::is_contract(contract));
    mercenary::make_contract(contract, MONS_MERC_FIGHTER);
    REQUIRE(mercenary::is_contract(contract));
    CHECK(contract.name(DESC_PLAIN).find("hired soldier") != string::npos);
    CHECK(contract.name(DESC_PLAIN).find("contract") != string::npos);
    CHECK(mercenary::contract_value(contract) >= 100);
    CHECK(str_to_shoptype("mercenary") == SHOP_MERCENARY);
    CHECK(string(shoptype_to_str(SHOP_MERCENARY)) == "mercenary");
    CHECK(SHOP_LEGACY_MISCELLANY == SHOP_GENERAL + 1);
    CHECK(SHOP_MERCENARY == SHOP_LEGACY_MISCELLANY + 1);
    CHECK(str_to_shoptype("removed miscellaneous") == SHOP_UNASSIGNED);
    CHECK_FALSE(gozag_shop_type_valid(SHOP_LEGACY_MISCELLANY));
    CHECK_FALSE(gozag_shop_type_valid(SHOP_MERCENARY));
    CHECK(gozag_shop_type_valid(SHOP_GENERAL));
}

TEST_CASE_METHOD(hire_fixture, "Caravan's first companion is owned and created once",
                 "[mercenary][party]")
{
    REQUIRE(mercenary::ensure_starter_companion());
    REQUIRE(companion_list.size() == 1);
    const mid_t first = companion_list.begin()->first;
    monster* hired = monster_by_mid(first);
    REQUIRE(hired);
    CHECK(mercenary_owned_by(*hired, you));
    CHECK(mercenary::valid_role(hired->type));
    REQUIRE(mercenary::ensure_starter_companion());
    CHECK(companion_list.size() == 1);
    CHECK(companion_list.count(first) == 1);
}

TEST_CASE_METHOD(hire_fixture, "Each Caravan starts with equipped pouch and fixed tools",
                 "[mercenary][party][bag-storage]")
{
    init_item_name_cache();
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;

    // The pipe is an item-set member; choosing the other member proves the
    // starting kit does not silently lose it to random item-set exclusions.
    const item_set_type allies = item_set_by_name("ally misc");
    REQUIRE(allies != NUM_ITEM_SET_TYPES);
    for (int slot = 0; slot < 2; ++slot)
    {
        party::scoped_player_context context(slot);
        you.species = SP_HUMAN;
        you.char_class = JOB_CARAVAN;
        you.religion = GOD_NO_GOD;
        initialise_item_sets(true);
        force_item_set_choice(allies, MISC_BOX_OF_BEASTS);
        REQUIRE(item_excluded_from_set(OBJ_MISCELLANY, MISC_PIPE_OF_RECALL));
        give_job_equipment(JOB_CARAVAN);

        const item_def* pouch = you.equipment.get_first_slot_item(SLOT_BAG);
        REQUIRE(pouch);
        CHECK(pouch->is_type(OBJ_MISCELLANY, MISC_POUCH));
        CHECK(pouch->link >= 0);
        CHECK(pouch->link < MAX_GEAR);
        bool pipe = false, mist = false;
        for (const item_def& item : you.inv)
        {
            pipe |= item.is_type(OBJ_MISCELLANY, MISC_PIPE_OF_RECALL);
            mist |= item.is_type(OBJ_MISCELLANY, MISC_HEALING_MIST);
        }
        CHECK(pipe);
        CHECK(mist);
    }
}

TEST_CASE_METHOD(hire_fixture, "An unavailable hire leaves the contract and gold intact",
                 "[mercenary][shop]")
{
    item_def contract;
    contract.base_type = OBJ_MISCELLANY;
    contract.sub_type = MISC_MERCENARY_CONTRACT;
    contract.quantity = 1;
    mercenary::make_contract(contract, MONS_MERC_FIGHTER);
    you.gold = 500;
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_ROCK_WALL;
    env.grid[you.pos().x][you.pos().y] = DNGN_FLOOR;
    CHECK_FALSE(mercenary::recruit(contract));
    CHECK(you.gold == 500);
    CHECK(mercenary::is_contract(contract));
    CHECK(companion_list.empty());
}

TEST_CASE_METHOD(hire_fixture, "Caravan hires in scoped party contexts get distinct IDs",
                 "[mercenary][party]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.set_position(you.pos() + coord_def(5, 0));
    other.on_current_level = true;
    // Model newly initialized players before either starter has been placed.
    other.last_mid = you.last_mid;

    REQUIRE(mercenary::ensure_starter_companion());
    REQUIRE(companion_list.size() == 1);
    const mid_t first = companion_list.begin()->first;
    REQUIRE(monster_by_mid(first));
    CHECK(mercenary_owned_by(*monster_by_mid(first), you));
    {
        party::scoped_player_context context(1);
        REQUIRE(mercenary::ensure_starter_companion());
    }

    REQUIRE(companion_list.size() == 2);
    for (const auto& entry : companion_list)
    {
        monster* hire = monster_by_mid(entry.first);
        REQUIRE(hire);
        CHECK(hire->mid == entry.first);
        CHECK(mercenary_owned_by(*hire, entry.first == first ? you : other));
    }
    CHECK(you.last_mid == other.last_mid);
    CHECK(you.last_mid > first);
}
