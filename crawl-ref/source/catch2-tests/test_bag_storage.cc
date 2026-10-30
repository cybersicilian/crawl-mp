#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "bag.h"
#include "art-enum.h"
#include "artefact.h"
#include "branch.h"
#include "equipment-profile.h"
#include "item-def.h"
#include "item-prop-enum.h"
#include "item-prop.h"
#include "invent.h"
#include "items.h"
#include "json-wrapper.h"
#include "options.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "pattern.h"
#include "potion-type.h"
#include "random.h"
#include "tags.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct bag_storage_fixture : vellum_fixture
{
    ~bag_storage_fixture()
    {
        // Party state synchronization can share the leader's test save with
        // other members. Detach those aliases before the base fixture closes
        // the save, including when a REQUIRE exits a test early.
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            if (party::get_player(slot).save == you.save)
                party::get_player(slot).save = nullptr;
        party::remove_all_proxies();
        party::set_multiplayer(false);
        party::set_player_count(1);
    }
};

item_def container(misc_item_type subtype)
{
    item_def result;
    result.base_type = OBJ_MISCELLANY;
    result.sub_type = subtype;
    result.quantity = 1;
    return result;
}

item_def potion(potion_type subtype, int quantity = 1)
{
    item_def result;
    result.base_type = OBJ_POTIONS;
    result.sub_type = subtype;
    result.quantity = quantity;
    return result;
}
}

TEST_CASE_METHOD(bag_storage_fixture, "Bag slots respect species anatomy and two-headed ogres get one",
                 "[bag-storage][equipment]")
{
    for (species_type species : {SP_HUMAN, SP_TWO_HEADED_OGRE, SP_COGLIN, SP_ENT})
    {
        you.species = species;
        INFO(species);
        CHECK(get_player_equip_slot_count(SLOT_BAG) == 1);
    }
    for (species_type species : {SP_POLTERGEIST, SP_FELID, SP_HYDRA,
                                 SP_PROTEAN, SP_OOZLE, SP_HERMIT_CRAB,
                                 SP_OCTOPODE})
    {
        you.species = species;
        INFO(species);
        CHECK(get_player_equip_slot_count(SLOT_BAG) == 0);
    }
}

TEST_CASE_METHOD(bag_storage_fixture, "Bags enforce stack capacity and preserve item data",
                 "[bag-storage]")
{
    item_def pouch = container(MISC_POUCH);
    item_def satchel = container(MISC_SATCHEL);
    item_def large = container(MISC_BAG_OF_PLENTY);
    CHECK(bag::capacity(pouch) == 4);
    CHECK(bag::capacity(satchel) == 8);
    CHECK(bag::capacity(large) == 12);

    item_def robe;
    robe.base_type = OBJ_ARMOUR;
    robe.sub_type = ARM_ROBE;
    robe.quantity = 1;
    for (int i = 0; i < 12; ++i)
    {
        CHECK(bag::store(large, robe, 1));
        if (i < 8)
            CHECK(bag::store(satchel, robe, 1));
    }
    CHECK_FALSE(bag::store(satchel, robe, 1));
    CHECK_FALSE(bag::store(large, robe, 1));
    CHECK(bag::used(satchel) == 8);
    CHECK(bag::used(large) == 12);

    item_def first = potion(POT_CURING, 5);
    first.inscription = "keep";
    first.props["bag_test_marker"] = 123;
    first.props[ITEM_UNIQUE_ID] = 88;
    int stored_index = -1;
    REQUIRE(bag::store(pouch, first, 3, &stored_index));
    REQUIRE(stored_index == 0);
    REQUIRE(bag::at(pouch, stored_index));
    bag::at(pouch, stored_index)->flags |= ISFLAG_HANDLED;
    CHECK(bag::contents(pouch)[0].flags & ISFLAG_HANDLED);
    CHECK(first.quantity == 5); // Caller commits the source separately.
    CHECK_FALSE(bag::contents(pouch)[0].props.exists(ITEM_UNIQUE_ID));
    REQUIRE(bag::store(pouch, first, 2, &stored_index));
    CHECK(stored_index == 0);
    CHECK(bag::used(pouch) == 1);
    CHECK(bag::contents(pouch)[0].quantity == 5);
    CHECK(bag::contents(pouch)[0].inscription == "keep");
    CHECK(bag::contents(pouch)[0].props["bag_test_marker"].get_int() == 123);

    REQUIRE(bag::store(pouch, potion(POT_HEAL_WOUNDS), 1));
    REQUIRE(bag::store(pouch, potion(POT_HASTE), 1));
    REQUIRE(bag::store(pouch, potion(POT_MIGHT), 1));
    CHECK(bag::used(pouch) == 4);
    CHECK_FALSE(bag::store(pouch, potion(POT_BERSERK_RAGE), 1));
    CHECK_FALSE(bag::store(pouch, satchel, 1));
    CHECK_FALSE(bag::store(pouch, first, 0));
    CHECK_FALSE(bag::store(pouch, first, 6));
    CHECK(bag::used(pouch) == 4);

    item_def taken;
    REQUIRE(bag::take(pouch, 0, 2, taken));
    CHECK(taken.quantity == 2);
    CHECK_FALSE(taken.props.exists(ITEM_UNIQUE_ID));
    CHECK(taken.props["bag_test_marker"].get_int() == 123);
    CHECK(bag::contents(pouch)[0].quantity == 3);
    CHECK_FALSE(bag::take(pouch, 0, 4, taken));
    CHECK_FALSE(bag::take(pouch, 9, 1, taken));
    CHECK(bag::contents(pouch)[0].quantity == 3);
    REQUIRE(bag::take(pouch, 0, 3, taken));
    CHECK(bag::used(pouch) == 3);
}

TEST_CASE_METHOD(bag_storage_fixture, "Auto-store uses a bag with a full pack without changing failed pickups",
                 "[bag-storage][pickup]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    Options.auto_bag_items.reset();
    Options.auto_bag_items.set(OBJ_ARMOUR);
    you.species = SP_HUMAN;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();
    for (int i = 1; i < MAX_GEAR; ++i)
        carry(i, OBJ_ARMOUR, ARM_ROBE, false);

    item_def incoming;
    incoming.base_type = OBJ_ARMOUR;
    incoming.sub_type = ARM_GLOVES;
    incoming.quantity = 1;
    incoming.rnd = 1;
    incoming.inscription = "keep me";
    incoming.flags = ISFLAG_UNOBTAINABLE;
    REQUIRE(move_item_to_inv(incoming));
    REQUIRE(bag::used(pouch) == 1);
    const auto stored = bag::contents(pouch);
    REQUIRE(stored.size() == 1);
    CHECK(stored[0].sub_type == ARM_GLOVES);
    CHECK(stored[0].inscription == "keep me");
    CHECK(stored[0].flags & ISFLAG_HANDLED);
    CHECK(stored[0].flags & ISFLAG_SEEN);
    CHECK_FALSE(stored[0].flags & ISFLAG_UNOBTAINABLE);

    item_def robe;
    robe.base_type = OBJ_ARMOUR;
    robe.sub_type = ARM_ROBE;
    robe.quantity = 1;
    for (int i = 0; i < 3; ++i)
        REQUIRE(bag::store(pouch, robe, 1));
    REQUIRE(bag::used(pouch) == 4);
    item_def rejected = robe;
    rejected.sub_type = ARM_HELMET;
    rejected.rnd = 1;
    rejected.flags = ISFLAG_UNOBTAINABLE;
    CHECK_FALSE(move_item_to_inv(rejected));
    CHECK(rejected.quantity == 1);
    CHECK(rejected.flags == ISFLAG_UNOBTAINABLE);
    CHECK(bag::used(pouch) == 4);
}

TEST_CASE_METHOD(bag_storage_fixture, "Bag contents survive native item serialization",
                 "[bag-storage][save-compatibility]")
{
    item_def original = container(MISC_SATCHEL);
    item_def source = potion(POT_CURING, 3);
    // Both the outer container and its nested item are serialized item_defs.
    // Match the initialized appearance supplied by normal item generation.
    original.rnd = 1;
    source.rnd = 1;
    source.inscription = "travel";
    source.props["bag_test_marker"] = 999;
    REQUIRE(original.is_valid());
    REQUIRE(source.is_valid());
    REQUIRE(bag::store(original, source, 3));
    REQUIRE(bag::contents(original)[0].is_valid());

    vector<unsigned char> bytes;
    writer output(&bytes);
    marshallItem(output, original);
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    item_def restored;
    unmarshallItem(input, restored);
    REQUIRE(bag::used(restored) == 1);
    const vector<item_def> restored_items = bag::contents(restored);
    REQUIRE(restored_items.size() == 1);
    CHECK(restored_items[0].sub_type == POT_CURING);
    CHECK(restored_items[0].quantity == 3);
    CHECK(restored_items[0].inscription == "travel");
    CHECK(restored_items[0].props["bag_test_marker"].get_int() == 999);
    CHECK_FALSE(input.valid());
}

TEST_CASE_METHOD(bag_storage_fixture, "Auto-stored items receive Ash identification and inscriptions",
                 "[bag-storage][pickup]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    unwind_var<vector<pair<text_pattern, string>>> restore_inscriptions(Options.autoinscriptions);
    Options.auto_bag_items.reset();
    Options.auto_bag_items.set(OBJ_POTIONS);
    Options.autoinscriptions.clear();
    Options.autoinscriptions.emplace_back(text_pattern("curing", true), "keep bag");
    you.species = SP_HUMAN;
    you.religion = GOD_ASHENZARI;
    you.raw_piety = 200;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();
    item_def incoming = potion(POT_CURING);
    incoming.rnd = 1;
    incoming.flags = ISFLAG_DROPPED;
    REQUIRE(move_item_to_inv(incoming));
    const auto stored = bag::contents(pouch);
    REQUIRE(stored.size() == 1);
    CHECK(stored[0].is_identified());
    CHECK(stored[0].inscription.find("keep bag") != string::npos);
    CHECK(stored[0].flags & ISFLAG_DROPPED);
    CHECK(stored[0].flags & ISFLAG_HANDLED);
}

TEST_CASE_METHOD(bag_storage_fixture, "Bag values remain independent across party contexts",
                 "[bag-storage][party]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    you.inv[0] = container(MISC_POUCH);
    party::get_player(1).inv[0] = container(MISC_POUCH);
    REQUIRE(bag::store(you.inv[0], potion(POT_CURING), 1));
    {
        party::scoped_player_context context(1);
        CHECK(bag::used(you.inv[0]) == 0);
        REQUIRE(bag::store(you.inv[0], potion(POT_HASTE), 1));
    }
    CHECK(bag::contents(you.inv[0])[0].sub_type == POT_CURING);
    CHECK(bag::contents(party::get_player(1).inv[0])[0].sub_type == POT_HASTE);
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(bag_storage_fixture, "Stored XP evokers recharge for their owner",
                 "[bag-storage][party]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    REQUIRE(bag::store(pouch, rod, 1));
    evoker_debt(MISC_LIGHTNING_ROD) = 23;
    FixedVector<item_def*, NUM_MISCELLANY> evokers(nullptr);
    list_charging_evokers(evokers);
    REQUIRE(evokers[MISC_LIGHTNING_ROD]);
    CHECK(evokers[MISC_LIGHTNING_ROD]->sub_type == MISC_LIGHTNING_ROD);
    {
        party::scoped_player_context context(1);
        evoker_debt(MISC_LIGHTNING_ROD) = 31;
        FixedVector<item_def*, NUM_MISCELLANY> other(nullptr);
        list_charging_evokers(other);
        CHECK(other[MISC_LIGHTNING_ROD] == nullptr);
    }
    CHECK(evoker_debt(MISC_LIGHTNING_ROD) == 23);
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(bag_storage_fixture, "A scratch-slot bag is not a carried evoker",
                 "[bag-storage][pickup]")
{
    item_def& scratch = you.inv[ENDOFPACK];
    scratch = container(MISC_POUCH);
    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    rod.rnd = 1;
    REQUIRE(bag::store(scratch, rod, 1));
    evoker_debt(MISC_LIGHTNING_ROD) = 23;
    FixedVector<item_def*, NUM_MISCELLANY> evokers(nullptr);
    list_charging_evokers(evokers);
    CHECK(evokers[MISC_LIGHTNING_ROD] == nullptr);
    scratch.clear();
}

TEST_CASE_METHOD(bag_storage_fixture, "Auto-stored devices merge without duplicating charges or evokers",
                 "[bag-storage][pickup]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    Options.auto_bag_items.reset();
    Options.auto_bag_items.set(OBJ_WANDS);
    Options.auto_bag_items.set(OBJ_MISCELLANY);
    you.species = SP_HUMAN;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();

    item_def wand;
    wand.base_type = OBJ_WANDS;
    wand.sub_type = WAND_FLAME;
    wand.quantity = 1;
    wand.charges = 3;
    wand.rnd = 1;
    REQUIRE(move_item_to_inv(wand));
    REQUIRE(bag::used(pouch) == 1);
    REQUIRE(bag::at(pouch, 0));
    CHECK(bag::at(pouch, 0)->charges == 3);
    wand.charges = 5;
    REQUIRE(move_item_to_inv(wand));
    REQUIRE(bag::used(pouch) == 1);
    CHECK(bag::at(pouch, 0)->charges == 8);

    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    rod.rnd = 1;
    evoker_plus(MISC_LIGHTNING_ROD) = 0;
    REQUIRE(move_item_to_inv(rod));
    REQUIRE(bag::used(pouch) == 2);
    REQUIRE(move_item_to_inv(rod));
    CHECK(bag::used(pouch) == 2);
    CHECK(evoker_plus(MISC_LIGHTNING_ROD) == 1);
}

TEST_CASE_METHOD(bag_storage_fixture, "Device auto-store preserves ordinary main-pack merges",
                 "[bag-storage][pickup]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    Options.auto_bag_items.reset();
    Options.auto_bag_items.set(OBJ_WANDS);
    you.species = SP_HUMAN;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();
    item_def& carried = carry(MAX_GEAR, OBJ_WANDS, WAND_FLAME, false);
    carried.charges = 2;
    item_def incoming = carried;
    incoming.charges = 4;
    REQUIRE(move_item_to_inv(incoming));
    CHECK(carried.charges == 6);
    CHECK(bag::used(pouch) == 0);
}

TEST_CASE_METHOD(bag_storage_fixture, "Carried bag devices merge even without auto-store",
                 "[bag-storage][pickup]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    Options.auto_bag_items.reset();
    you.species = SP_HUMAN;
    // A forced species change can leave a nonempty bag carried but unworn.
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    item_def wand;
    wand.base_type = OBJ_WANDS;
    wand.sub_type = WAND_FLAME;
    wand.quantity = 1;
    wand.charges = 3;
    wand.rnd = 1;
    REQUIRE(bag::store(pouch, wand, 1));
    wand.charges = 5;
    REQUIRE(move_item_to_inv(wand, true));
    REQUIRE(bag::used(pouch) == 1);
    REQUIRE(bag::at(pouch, 0));
    CHECK(bag::at(pouch, 0)->charges == 8);
    for (int i = MAX_GEAR; i < ENDOFPACK; ++i)
        CHECK_FALSE(you.inv[i].is_type(OBJ_WANDS, WAND_FLAME));

    item_def rod;
    rod.base_type = OBJ_MISCELLANY;
    rod.sub_type = MISC_LIGHTNING_ROD;
    rod.quantity = 1;
    rod.rnd = 1;
    evoker_plus(MISC_LIGHTNING_ROD) = 0;
    REQUIRE(bag::store(pouch, rod, 1));
    REQUIRE(move_item_to_inv(rod));
    CHECK(bag::used(pouch) == 2);
    CHECK(evoker_plus(MISC_LIGHTNING_ROD) == 1);
    for (int i = MAX_GEAR; i < ENDOFPACK; ++i)
        CHECK_FALSE(you.inv[i].is_type(OBJ_MISCELLANY, MISC_LIGHTNING_ROD));
}

TEST_CASE_METHOD(bag_storage_fixture, "Archaeology quest items bypass automatic bag storage",
                 "[bag-storage][pickup][archaeologist]")
{
    unwind_var<FixedBitVector<NUM_OBJECT_CLASSES>> restore_auto_bag(Options.auto_bag_items);
    Options.auto_bag_items.reset();
    Options.auto_bag_items.set(OBJ_MISCELLANY);
    you.species = SP_HUMAN;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();
    for (auto subtype : {MISC_ANCIENT_CRATE, MISC_DUSTY_TOME})
    {
        item_def quest_item;
        quest_item.base_type = OBJ_MISCELLANY;
        quest_item.sub_type = subtype;
        quest_item.quantity = 1;
        quest_item.rnd = 1;
        REQUIRE(move_item_to_inv(quest_item));
        CHECK(bag::used(pouch) == 0);
    }
}

TEST_CASE_METHOD(bag_storage_fixture, "Equipment profile exposes only its owner's equipped bag",
                 "[bag-storage][equipment-profile][party]")
{
    rng::generator inspection(rng::UI);
    party::set_player_count(2);
    party::set_multiplayer(true);
    you.species = SP_HUMAN;
    item_def& pouch = carry(0, OBJ_MISCELLANY, MISC_POUCH, false);
    const int uid = pouch.give_unique_id();
    REQUIRE(bag::store(pouch, potion(POT_CURING, 3), 3));
    you.equipment.add(pouch, SLOT_BAG);
    you.equipment.update();
    {
        JsonWrapper profile(equipment_profile_json());
        JsonNode* projected = json_find_member(profile.node, "bag");
        REQUIRE(projected);
        REQUIRE(json_find_member(projected, "capacity"));
        REQUIRE(json_find_member(projected, "used"));
        REQUIRE(json_find_member(projected, "uid"));
        CHECK(json_find_member(projected, "capacity")->number_ == 4);
        CHECK(json_find_member(projected, "used")->number_ == 1);
        CHECK(json_find_member(projected, "uid")->number_ == uid);
        JsonNode* entries = json_find_member(projected, "items");
        REQUIRE(entries);
        REQUIRE(entries->children.head);
        REQUIRE(json_find_member(entries->children.head, "quantity"));
        CHECK(json_find_member(entries->children.head, "quantity")->number_ == 3);
    }
    {
        party::scoped_player_context context(1);
        JsonWrapper other(equipment_profile_json());
        CHECK_FALSE(json_find_member(other.node, "bag"));
    }
    you.equipment.remove(pouch);
    you.equipment.update();
    {
        JsonWrapper unequipped(equipment_profile_json());
        CHECK_FALSE(json_find_member(unequipped.node, "bag"));
    }
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(bag_storage_fixture, "Losing or destroying a bag reports contained artefacts",
                 "[bag-storage][save-compatibility]")
{
    item_def pouch = container(MISC_POUCH);
    item_def& unique_item = unique(1, UNRAND_PONDERING);
    unique_item.orig_place.branch = BRANCH_ABYSS;
    REQUIRE(bag::store(pouch, unique_item, 1));
    you.where_are_you = BRANCH_ABYSS;
    set_unique_item_status(unique_item, UNIQ_EXISTS);
    item_was_lost(pouch);
    CHECK(get_unique_item_status(UNRAND_PONDERING) == UNIQ_LOST_IN_ABYSS);
    set_unique_item_status(unique_item, UNIQ_EXISTS);
    item_was_destroyed(pouch);
    CHECK(get_unique_item_status(UNRAND_PONDERING) == UNIQ_LOST_IN_ABYSS);
}
