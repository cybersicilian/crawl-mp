#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <cstdint>
#include <limits>

#include "equipment-profile.h"
#include "grape-player.h"
#include "invent.h"
#include "item-def.h"
#include "item-prop.h"
#include "items.h"
#include "json-wrapper.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "tags.h"
#include "test_vellum_fixture.h"
#include "transform.h"

namespace
{
struct grape_player_fixture : vellum_fixture
{
    grape_player_fixture()
    {
        you.species = SP_HUMAN;
        you.form = you.default_form = transformation::none;
        you.fishtail = false;
        you.religion = GOD_NO_GOD;
        you.equipment.items.clear();
        you.equipment.update();
    }
    ~grape_player_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
    }
    item_def& robe()
    {
        item_def& item = carry(0, OBJ_ARMOUR, ARM_ROBE, false);
        item.plus = 3;
        wear(0, SLOT_BODY_ARMOUR);
        return item;
    }
};
}

TEST_CASE_METHOD(grape_player_fixture, "Grape suppression deactivates and restores armour once",
                 "[grape][equipment]")
{
    item_def& armour = robe();
    const int original_ac = you.armour_class_scaled(100);
    REQUIRE(grape_player::suppress(armour));
    CHECK(grape_player::affected());
    CHECK(item_is_melded(armour));
    CHECK(you.armour_class_scaled(100) < original_ac);
    CHECK_FALSE(grape_player::suppress(armour));
    REQUIRE(grape_player::restore(armour));
    CHECK_FALSE(grape_player::affected());
    CHECK_FALSE(item_is_melded(armour));
    CHECK(you.armour_class_scaled(100) == original_ac);
    CHECK_FALSE(grape_player::restore(armour));
}

TEST_CASE_METHOD(grape_player_fixture, "Grape and transformation melding have independent lifetimes",
                 "[grape][equipment][transform]")
{
    item_def& armour = robe();
    REQUIRE(grape_player::suppress(armour));
    you.form = transformation::bat;
    you.equipment.meld_equipment(get_form()->blocked_slots, true);
    you.equipment.unmeld_all_equipment(true);
    CHECK(item_is_melded(armour));
    SECTION("form ends while grape suppression remains")
    {
        you.form = transformation::none;
        you.equipment.unmeld_all_equipment(true);
        CHECK(item_is_melded(armour));
        REQUIRE(grape_player::restore(armour));
        CHECK_FALSE(item_is_melded(armour));
    }
    SECTION("grape suppression ends while form still blocks the armour")
    {
        REQUIRE(grape_player::restore(armour));
        CHECK_FALSE(grape_player::suppressed(armour));
        CHECK(item_is_melded(armour));
        you.form = transformation::none;
        you.equipment.unmeld_all_equipment(true);
        CHECK_FALSE(item_is_melded(armour));
    }
}

TEST_CASE_METHOD(grape_player_fixture, "Grape suppression survives item serialization",
                 "[grape][equipment][save]")
{
    item_def& armour = robe();
    armour.rnd = 1;
    CHECK_FALSE(grape_player::suppressed(armour)); // Existing items need no new field.
    REQUIRE(grape_player::suppress(armour));
    vector<unsigned char> bytes;
    writer out(&bytes);
    marshallItem(out, armour);
    item_def restored;
    reader in(bytes, TAG_MINOR_VERSION);
    unmarshallItem(in, restored);
    CHECK(grape_player::suppressed(restored));
    grape_player::forget(restored);
    CHECK_FALSE(grape_player::suppressed(restored));
}

TEST_CASE_METHOD(grape_player_fixture, "Grape restoration does not unmeld a merfolk tail's boots",
                 "[grape][equipment][transform]")
{
    item_def& boots = carry(0, OBJ_ARMOUR, ARM_BOOTS, false);
    wear(0, SLOT_BOOTS);
    REQUIRE(grape_player::suppress(boots));
    you.fishtail = true;
    REQUIRE(grape_player::restore(boots));
    CHECK(item_is_melded(boots));
    you.fishtail = false;
    you.equipment.unmeld_slot(SLOT_BOOTS);
    CHECK_FALSE(item_is_melded(boots));
}

TEST_CASE_METHOD(grape_player_fixture, "Equipment inspection names grape suppression",
                 "[grape][equipment][ui]")
{
    item_def& armour = robe();
    REQUIRE(grape_player::suppress(armour));
    JsonWrapper profile(equipment_profile_json());
    const JsonNode* slots = json_find_member(profile.node, "slots");
    REQUIRE(slots);
    bool found = false;
    for (const JsonNode* node = slots->children.head; node; node = node->next)
    {
        const JsonNode* index = json_find_member(node, "inv_slot");
        const JsonNode* reason = json_find_member(node, "reason");
        if (index && index->number_ == armour.link && reason
            && reason->tag == JSON_STRING)
        {
            CHECK(string(reason->string_).find("Interdimensional") != string::npos);
            const JsonNode* suppression = json_find_member(node, "suppression");
            REQUIRE(suppression);
            REQUIRE(suppression->tag == JSON_STRING);
            CHECK(string(suppression->string_) == "interdimensional_grape");
            found = true;
        }
    }
    CHECK(found);
}

TEST_CASE_METHOD(grape_player_fixture, "Grape restores equipment granted by a suppressed artefact",
                 "[grape][equipment]")
{
    item_def& regalia = unique(0, UNRAND_JUSTICARS_REGALIA);
    wear(0, SLOT_BODY_ARMOUR);
    item_def& first = carry(1, OBJ_JEWELLERY, AMU_FAITH, false);
    wear(1, SLOT_AMULET);
    item_def& second = carry(2, OBJ_JEWELLERY, AMU_REFLECTION, false);
    wear(2, SLOT_AMULET);
    REQUIRE(you.equipment.num_slots[SLOT_AMULET] >= 2);
    REQUIRE(grape_player::suppress(regalia));
    CHECK(item_is_melded(regalia));
    CHECK((item_is_melded(first) != item_is_melded(second)));
    SECTION("the group restores immediately")
    {
        REQUIRE(grape_player::restore(regalia));
    }
    SECTION("the granting armour remains blocked by a form")
    {
        you.form = transformation::bat;
        you.equipment.meld_equipment(get_form()->blocked_slots, true);
        REQUIRE(grape_player::restore(regalia));
        CHECK(item_is_melded(regalia));
        you.form = transformation::none;
        you.equipment.unmeld_all_equipment();
        if (grape_player::affected())
            REQUIRE(grape_player::restore_one());
    }
    SECTION("the granting armour is forcibly removed")
    {
        REQUIRE(unequip_item(regalia, false));
        CHECK(grape_player::affected());
        REQUIRE(grape_player::restore_one());
        CHECK_FALSE(grape_player::affected());
        CHECK(first.defined());
        CHECK(second.defined());
        CHECK(item_is_equipped(first) != item_is_equipped(second));
    }
    SECTION("the granting armour is destroyed")
    {
        REQUIRE(unequip_item(regalia, false));
        regalia.clear();
        REQUIRE(grape_player::restore_one());
        CHECK_FALSE(grape_player::affected());
        CHECK(first.defined());
        CHECK(second.defined());
        CHECK(item_is_equipped(first) != item_is_equipped(second));
    }
    CHECK_FALSE(item_is_melded(regalia));
    CHECK_FALSE(item_is_melded(first));
    CHECK_FALSE(item_is_melded(second));
}

TEST_CASE_METHOD(grape_player_fixture, "Grape cannot suppress bags or another player's armour",
                 "[grape][equipment][party]")
{
    item_def& armour = robe();
    item_def& pouch = carry(1, OBJ_MISCELLANY, MISC_POUCH, false);
    wear(1, SLOT_BAG);
    CHECK_FALSE(grape_player::suppress(pouch));
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    party::set_multiplayer(true);
    CHECK_FALSE(grape_player::suppress(other.inv[0]));
    CHECK_FALSE(item_is_melded(armour));
    REQUIRE(grape_player::suppress(armour));
    CHECK_FALSE(grape_player::suppressed(other.inv[0]));
    CHECK_FALSE(grape_player::suppressed(pouch));
    {
        party::scoped_player_context context(1);
        CHECK_FALSE(grape_player::affected());
    }
    CHECK(grape_player::affected());
}

TEST_CASE_METHOD(grape_player_fixture, "Same-pulse party groups remain distinct after saved-state migration",
                 "[grape][equipment][party][save]")
{
    item_def& armour = robe();
    party::set_player_count(2);
    armour.props[ITEM_UNIQUE_ID].get_int() = 99;
    armour.rnd = 1;
    you.last_item_uid = 99;
    player& other = party::get_player(1);
    other = you; // Intentionally retains the same pre-existing item UID.
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.inv[0].sub_type = ARM_BOOTS;
    other.inv[0].props[ITEM_UNIQUE_ID].get_int() = 99;
    other.inv[0].rnd = 1;
    other.equipment.items.clear();
    other.equipment.items.emplace_back(0, SLOT_BOOTS, false, true, false);
    party::set_multiplayer(true);
    other.last_item_uid = you.last_item_uid;

    REQUIRE(grape_player::suppress(armour));
    const int first_group = armour.props["interdimensional_grape_group"].get_int();
    int second_group = 0;
    {
        party::scoped_player_context context(1);
        you.equipment.update();
        REQUIRE(grape_player::suppress(you.inv[0]));
        second_group = you.inv[0].props["interdimensional_grape_group"].get_int();
    }
    CHECK(first_group != second_group);
    CHECK(you.last_item_uid == other.last_item_uid);
    CHECK(armour.props[ITEM_UNIQUE_ID].get_int() == 99);
    CHECK(other.inv[0].props[ITEM_UNIQUE_ID].get_int() == 99);

    // Simulate migration of persisted item state, not a legal in-game trade of
    // melded equipment. Source items have equal historical item UIDs.
    vector<unsigned char> bytes;
    writer out(&bytes);
    marshallItem(out, other.inv[0]);
    reader in(bytes, TAG_MINOR_VERSION);
    item_def restored;
    unmarshallItem(in, restored);
    REQUIRE(grape_player::suppressed(restored));
    you.inv[1] = restored;
    you.inv[1].link = 1;
    other.equipment.items.clear();
    you.equipment.items.emplace_back(1, SLOT_BOOTS, true, true, false);
    you.equipment.update();
    REQUIRE(grape_player::restore(you.inv[0]));
    CHECK_FALSE(grape_player::suppressed(you.inv[0]));
    CHECK(grape_player::suppressed(you.inv[1]));
    REQUIRE(grape_player::restore(you.inv[1]));
    CHECK_FALSE(grape_player::affected());
}

TEST_CASE_METHOD(grape_player_fixture, "Grape group IDs never overflow saved integers",
                 "[grape][equipment][save]")
{
    item_def& armour = robe();
    you.last_item_uid = static_cast<mid_t>(std::numeric_limits<int32_t>::max());
    CHECK_FALSE(grape_player::suppress(armour));
    CHECK_FALSE(grape_player::suppressed(armour));
    CHECK_FALSE(item_is_melded(armour));
    CHECK(you.last_item_uid == static_cast<mid_t>(std::numeric_limits<int32_t>::max()));
}
