#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "branch.h"
#include "bunker.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "items.h"
#include "level-id.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player-equip.h"
#include "player.h"
#include "spl-cast.h"
#include "test_vellum_fixture.h"

namespace
{
struct bunker_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    bunker_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        item_def& shield = you.inv[0];
        shield.clear();
        shield.base_type = OBJ_ARMOUR;
        shield.sub_type = ARM_BUCKLER;
        shield.brand = SPARM_BUNKER;
        shield.quantity = 1;
        shield.plus = 4;
        shield.link = 0;
        shield.slot = 'a';
        shield.pos = ITEM_IN_INVENTORY;
        you.equipment.add(shield, SLOT_OFFHAND);
        you.equipment.update();
    }
    ~bunker_fixture()
    {
        dgn_reset_level(false);
        brdepth[BRANCH_DUNGEON] = old_depth;
    }
};
}

TEST_CASE_METHOD(bunker_fixture, "A bunker transfers and retrieves the same shield",
                 "[bunker]")
{
    REQUIRE(bunker::available(you));
    const coord_def start = you.pos();
    const coord_def target = start + coord_def(1, 0);
    REQUIRE(bunker::deploy(target) == spret::success);
    monster* shield_mon = bunker::find(you);
    REQUIRE(shield_mon);
    CHECK_FALSE(you.shield());
    REQUIRE(shield_mon->inv[MSLOT_SHIELD] != NON_ITEM);
    const item_def& carried = env.item[shield_mon->inv[MSLOT_SHIELD]];
    CHECK(carried.plus == 4);
    CHECK(get_armour_ego_type(carried) == SPARM_BUNKER);
    CHECK(shield_mon->summoner == you.mid);
    bunker::retrieve_after_moving();
    CHECK(bunker::find(you) == shield_mon);
    you.set_position(start + coord_def(-1, 0));
    bunker::retrieve_after_moving();
    CHECK_FALSE(bunker::find(you));
    REQUIRE(you.shield());
    CHECK(you.shield()->plus == 4);
    CHECK(get_armour_ego_type(*you.shield()) == SPARM_BUNKER);
}

TEST_CASE_METHOD(bunker_fixture, "A bunker refuses invalid positions without losing its shield",
                 "[bunker]")
{
    REQUIRE(bunker::available(you));
    CHECK(bunker::deploy(you.pos()) == spret::abort);
    CHECK(bunker::deploy(you.pos() + coord_def(2, 0)) == spret::abort);
    REQUIRE(you.shield());
    CHECK(you.shield()->plus == 4);
}

TEST_CASE_METHOD(bunker_fixture, "Floor departure retrieves a bunker even without movement",
                 "[bunker]")
{
    REQUIRE(bunker::deploy(you.pos() + coord_def(1, 0)) == spret::success);
    bunker::retrieve_on_departure();
    CHECK_FALSE(bunker::find(you));
    REQUIRE(you.shield());
    CHECK(you.shield()->plus == 4);
}

TEST_CASE_METHOD(bunker_fixture, "A full inventory drops the shield on recovery",
                 "[bunker]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    REQUIRE(bunker::deploy(target) == spret::success);
    monster* mon = bunker::find(you);
    REQUIRE(mon);
    const int item_slot = mon->inv[MSLOT_SHIELD];
    REQUIRE(item_slot != NON_ITEM);
    for (int i = 0; i < MAX_GEAR; ++i)
    {
        item_def& item = you.inv[i];
        item.clear();
        item.base_type = OBJ_ARMOUR;
        item.sub_type = ARM_CLOAK;
        item.quantity = 1;
        item.link = i;
        item.slot = 'a' + i;
        item.pos = ITEM_IN_INVENTORY;
    }
    bunker::retrieve_on_departure();
    CHECK_FALSE(bunker::find(you));
    REQUIRE(env.item[item_slot].defined());
    CHECK(env.item[item_slot].pos == target);
    CHECK(env.item[item_slot].plus == 4);
    CHECK(get_armour_ego_type(env.item[item_slot]) == SPARM_BUNKER);
    for (int i = 0; i < MAX_GEAR; ++i)
        CHECK(get_armour_ego_type(you.inv[i]) != SPARM_BUNKER);
}

TEST_CASE_METHOD(bunker_fixture, "Party floor departure retrieves each owner's bunker",
                 "[bunker]")
{
    party::set_player_count(2);
    party::set_multiplayer(false);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(0, 2));
    REQUIRE(bunker::deploy(you.pos() + coord_def(1, 0)) == spret::success);
    REQUIRE(bunker::find(you));
    const mid_t first_mid = bunker::find(you)->mid;
    // Normal gameplay synchronizes the world's monster ID counter between
    // party actions. This fixture switches contexts directly instead.
    party::sync_shared_state_from_active();
    {
        party::scoped_player_context context(1);
        REQUIRE(bunker::deploy(you.pos() + coord_def(1, 0)) == spret::success);
        REQUIRE(bunker::find(you));
        CHECK(bunker::find(you)->mid != first_mid);
    }
    REQUIRE(bunker::find(you));
    CHECK(bunker::find(you)->mid == first_mid);
    const int active = party::active_slot();
    bunker::retrieve_party_on_departure(level_id(BRANCH_DUNGEON, 1), true);
    CHECK(party::active_slot() == active);
    REQUIRE(you.shield());
    CHECK(you.shield()->plus == 4);
    {
        // player::shield() resolves equipment through the active context.
        party::scoped_player_context context(1);
        REQUIRE(you.shield());
        CHECK(you.shield()->plus == 4);
    }
    CHECK_FALSE(bunker::find(you));
    CHECK_FALSE(bunker::find(companion));
}

TEST_CASE_METHOD(bunker_fixture, "A destroyed bunker drops its original shield",
                 "[bunker]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    REQUIRE(bunker::deploy(target) == spret::success);
    monster* mon = bunker::find(you);
    REQUIRE(mon);
    const int item_slot = mon->inv[MSLOT_SHIELD];
    REQUIRE(item_slot != NON_ITEM);
    monster_die(*mon, KILL_NON_ACTOR, NON_MONSTER);
    CHECK_FALSE(bunker::find(you));
    REQUIRE(env.item[item_slot].defined());
    CHECK(env.item[item_slot].pos == target);
    CHECK(env.item[item_slot].plus == 4);
    CHECK(get_armour_ego_type(env.item[item_slot]) == SPARM_BUNKER);
}

TEST_CASE_METHOD(bunker_fixture, "A deployed bunker belongs to its bearer",
                 "[bunker]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    REQUIRE(bunker::deploy(you.pos() + coord_def(1, 0)) == spret::success);
    REQUIRE(bunker::find(you));
    // Even a stale or copied property cannot claim another member's bunker.
    companion.props["bunker_shield"] = static_cast<int>(bunker::find(you)->mid);
    CHECK_FALSE(bunker::find(companion));
}
