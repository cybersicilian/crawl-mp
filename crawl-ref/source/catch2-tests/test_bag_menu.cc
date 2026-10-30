#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "bag.h"
#include "bag-menu.h"
#include "item-prop-enum.h"
#include "item-prop.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "potion-type.h"
#include "spl-cast.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Bag inventory transfers preserve item ownership",
                 "[bag-menu]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(0, SLOT_BAG);
    item_def& sword = carry(1, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    const int sword_uid = sword.give_unique_id();
    you.last_pickup[1] = 1;

    REQUIRE(bag::put_inventory(1, 1));
    CHECK(you.last_pickup.count(1) == 0);
    CHECK_FALSE(you.inv[1].defined());
    REQUIRE(bag::used(pouch) == 1);
    REQUIRE(bag::take_inventory(0, 1));
    CHECK(bag::used(*you.equipment.get_first_slot_item(SLOT_BAG)) == 0);
    bool found = false;
    for (const item_def& item : you.inv)
        if (item.defined() && item.props.exists(ITEM_UNIQUE_ID)
            && item.props[ITEM_UNIQUE_ID].get_int() == sword_uid)
            found = true;
    CHECK(found);
}

TEST_CASE_METHOD(vellum_fixture, "Transferred bags with matching UIDs keep their own contents",
                 "[bag-menu][party]")
{
    item_def& first = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    item_def& second = carry(1, OBJ_MISCELLANY, MISC_POUCH, false);
    first.props[ITEM_UNIQUE_ID] = 41;
    second.props[ITEM_UNIQUE_ID] = 41;
    item_def potion;
    potion.base_type = OBJ_POTIONS;
    potion.sub_type = POT_CURING;
    potion.quantity = 2;
    potion.props[ITEM_UNIQUE_ID] = 42;
    identify_item(potion);
    REQUIRE(bag::store(first, potion, 2));
    REQUIRE(bag::store(second, potion, 2));
    REQUIRE(bag::take_inventory(second, 0, 2));
    CHECK(bag::contents(first)[0].quantity == 2);
    CHECK(bag::used(second) == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Putting duplicate devices in a bag merges them",
                 "[bag-menu][pickup]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(0, SLOT_BAG);
    item_def wand;
    wand.base_type = OBJ_WANDS;
    wand.sub_type = WAND_FLAME;
    wand.quantity = 1;
    wand.charges = 3;
    wand.rnd = 1;
    REQUIRE(bag::store(pouch, wand, 1));
    item_def& carried_wand = carry(MAX_GEAR, OBJ_WANDS, WAND_FLAME, false);
    carried_wand.charges = 5;
    REQUIRE(bag::put_inventory(MAX_GEAR, 1));
    REQUIRE(bag::used(pouch) == 1);
    CHECK(bag::at(pouch, 0)->charges == 8);
    CHECK_FALSE(you.inv[MAX_GEAR].defined());

    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    rod.rnd = 1;
    REQUIRE(bag::store(pouch, rod, 1));
    carry(MAX_GEAR, OBJ_MISCELLANY, MISC_LIGHTNING_ROD, false);
    evoker_plus(MISC_LIGHTNING_ROD) = 0;
    REQUIRE(bag::put_inventory(MAX_GEAR, 1));
    CHECK(bag::used(pouch) == 2);
    CHECK(evoker_plus(MISC_LIGHTNING_ROD) == 1);
    CHECK_FALSE(you.inv[MAX_GEAR].defined());
}

TEST_CASE_METHOD(vellum_fixture, "A forcibly unequipped carried bag can be emptied",
                 "[bag-menu]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    const int pouch_uid = pouch.give_unique_id();
    wear(0, SLOT_BAG);
    carry(1, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    REQUIRE(bag::put_inventory(1, 1));
    you.equipment.remove(pouch);
    you.equipment.update();
    CHECK_FALSE(bag::put_inventory(1, 1));
    REQUIRE(bag::take_inventory(pouch, 0, 1));
    bool found_bag = false;
    for (const item_def& item : you.inv)
        if (bag::is_bag(item) && item.props.exists(ITEM_UNIQUE_ID)
            && item.props[ITEM_UNIQUE_ID].get_int() == pouch_uid)
        {
            found_bag = true;
            CHECK(bag::used(item) == 0);
        }
    CHECK(found_bag);
    CHECK(you.equipment.get_first_slot_item(SLOT_BAG) == nullptr);
}

TEST_CASE_METHOD(vellum_fixture, "Unequipping a bag returns contents when space is available",
                 "[bag-menu]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(0, SLOT_BAG);
    carry(1, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    REQUIRE(bag::put_inventory(1, 1));
    REQUIRE(bag::prepare_unequip(pouch));
    CHECK(bag::used(you.inv[0]) == 0);
    int swords = 0;
    for (const item_def& item : you.inv)
        if (item.is_type(OBJ_WEAPONS, WPN_SHORT_SWORD))
            ++swords;
    CHECK(swords == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Bag removal merges devices only after a successful transfer",
                 "[bag-menu][pickup]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(0, SLOT_BAG);
    item_def wand;
    wand.base_type = OBJ_WANDS;
    wand.sub_type = WAND_FLAME;
    wand.quantity = 1;
    wand.charges = 3;
    wand.rnd = 1;
    REQUIRE(bag::store(pouch, wand, 1));
    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    rod.rnd = 1;
    REQUIRE(bag::store(pouch, rod, 1));
    item_def sword;
    sword.base_type = OBJ_WEAPONS;
    sword.sub_type = WPN_SHORT_SWORD;
    sword.quantity = 1;
    sword.rnd = 1;
    REQUIRE(bag::store(pouch, sword, 1));
    item_def& carried_wand = carry(MAX_GEAR, OBJ_WANDS, WAND_FLAME, false);
    carried_wand.charges = 5;
    carry(MAX_GEAR + 1, OBJ_MISCELLANY, MISC_LIGHTNING_ROD, false);
    evoker_plus(MISC_LIGHTNING_ROD) = 0;
    for (int slot = 1; slot < MAX_GEAR; ++slot)
        carry(slot, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    env.grid(you.pos()) = DNGN_LAVA;

    CHECK_FALSE(bag::prepare_unequip(pouch));
    CHECK(bag::used(pouch) == 3);
    CHECK(you.inv[MAX_GEAR].charges == 5);
    CHECK(evoker_plus(MISC_LIGHTNING_ROD) == 0);

    // Releasing a gear slot makes the entire transfer possible without a
    // destructive overflow prompt.
    you.inv[1].clear();
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(bag::prepare_unequip(pouch));
    CHECK(bag::used(you.inv[0]) == 0);
    CHECK(you.inv[MAX_GEAR].charges == 8);
    CHECK(evoker_plus(MISC_LIGHTNING_ROD) == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Unsafe overflow leaves the worn bag and contents intact",
                 "[bag-menu]")
{
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(0, SLOT_BAG);
    item_def& stored = carry(1, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    const int uid = stored.give_unique_id();
    REQUIRE(bag::put_inventory(1, 1));
    for (int slot = 1; slot < MAX_GEAR; ++slot)
        carry(slot, OBJ_WEAPONS, WPN_SHORT_SWORD, false);
    env.grid(you.pos()) = DNGN_LAVA;

    CHECK_FALSE(bag::prepare_unequip(pouch));
    REQUIRE(bag::used(pouch) == 1);
    const auto contents = bag::contents(pouch);
    REQUIRE(contents[0].props.exists(ITEM_UNIQUE_ID));
    CHECK(contents[0].props[ITEM_UNIQUE_ID].get_int() == uid);
    CHECK(you.equipment.get_first_slot_item(SLOT_BAG) == &pouch);
    env.grid(you.pos()) = DNGN_FLOOR;
}

TEST_CASE_METHOD(vellum_fixture, "Bag overflow uses normal dropped-item marking",
                 "[bag-menu][pickup]")
{
    const int previous_floor_items = env.igrid(you.pos());
    env.igrid(you.pos()) = NON_ITEM;
    item_def potion;
    potion.base_type = OBJ_POTIONS;
    potion.sub_type = POT_CURING;
    potion.quantity = 1;
    potion.rnd = 1;
    potion.flags |= ISFLAG_THROWN;

    const int index = bag::drop_overflow_item(potion, you.pos());
    REQUIRE(index != NON_ITEM);
    CHECK(env.item[index].flags & ISFLAG_DROPPED);
    CHECK_FALSE(env.item[index].flags & ISFLAG_THROWN);
    CHECK(env.item[index].pos == you.pos());
    destroy_item(index, true);
    env.igrid(you.pos()) = previous_floor_items;
}
