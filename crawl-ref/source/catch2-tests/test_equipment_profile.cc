#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "equipment-profile.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "json-wrapper.h"
#include "mutation-type.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "test_player_fixture.h"
#include "transform.h"

namespace
{
string value(JsonNode* node, const char* key)
{
    auto member = json_find_member(node, key);
    return member && member->tag == JSON_STRING ? member->string_ : "";
}
JsonNode* slot(JsonNode* profile, const char* type)
{
    auto slots = json_find_member(profile, "slots");
    for (auto entry = slots->children.head; entry; entry = entry->next)
        if (value(entry, "type") == type) return entry;
    return nullptr;
}
void refresh() { you.equipment.num_slots = get_total_player_equip_slots(); }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Equipment profile follows mutation slot rules", "[equipment-profile]")
{
    rng::generator inspection(rng::UI);
    SECTION("Horns permit hats but restrict hard helmets")
    {
        you.mutation[MUT_HORNS] = 1; refresh();
        get_item_by_exact_name(you.inv[0], "helmet");
        you.inv[0].link = 0; you.inv[0].slot = 'a';
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "head"), "state") == "empty");
        auto restrictions = json_find_member(profile.node, "restrictions");
        REQUIRE(restrictions->children.head);
        REQUIRE(value(restrictions->children.head, "reason").find("horns") != string::npos);
        auto item = json_find_member(profile.node, "items")->children.head;
        REQUIRE_FALSE(json_find_member(item, "fits")->bool_);
        REQUIRE(value(item, "reason").find("horns") != string::npos);
    }
    SECTION("Large horns remove headgear")
    {
        you.mutation[MUT_HORNS] = 3; refresh();
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "head"), "state") == "unavailable");
        REQUIRE(value(slot(profile.node, "head"), "reason").find("horns") != string::npos);
    }
    SECTION("Claws and hooves remove their own equipment slots")
    {
        you.mutation[MUT_CLAWS] = 3; you.mutation[MUT_HOOVES] = 3; refresh();
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "hands"), "state") == "unavailable");
        REQUIRE(value(slot(profile.node, "feet"), "state") == "unavailable");
        REQUIRE(value(slot(profile.node, "body"), "state") == "empty");
    }
    SECTION("Missing hands reduce ring capacity")
    {
        you.mutation[MUT_MISSING_HAND] = 1; refresh();
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "offhand"), "state") == "unavailable");
        REQUIRE(json_find_member(slot(profile.node, "ring"), "capacity")->number_ == 1);
    }
    SECTION("A large body keeps an armour slot but rejects ill-fitting armour")
    {
        you.species = SP_TROLL; refresh();
        get_item_by_exact_name(you.inv[0], "plate armour");
        you.inv[0].link = 0; you.inv[0].slot = 'a';
        get_item_by_exact_name(you.inv[1], "robe");
        you.inv[1].link = 1; you.inv[1].slot = 'b';
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "body"), "state") == "empty");
        auto items = json_find_member(profile.node, "items")->children.head;
        REQUIRE_FALSE(json_find_member(items, "fits")->bool_);
        REQUIRE(json_find_member(items->next, "fits")->bool_);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Equipment inspection preserves gameplay RNG", "[equipment-profile]")
{
    rng::generator world(rng::GAMEPLAY);
    auto before = rng::peek_uint64();
    JsonWrapper first(equipment_profile_json());
    JsonWrapper second(equipment_profile_json());
    REQUIRE(first.to_string() == second.to_string());
    REQUIRE(rng::peek_uint64() == before);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Equipment profile explains form and shared occupancy", "[equipment-profile]")
{
    rng::generator inspection(rng::UI);
    item_def weapon;
    get_item_by_exact_name(weapon, "great sword");
    you.inv[0] = weapon; you.inv[0].link = 0; you.inv[0].slot = 'a';
    you.equipment.items.emplace_back(0, SLOT_WEAPON, false, false, false);
    you.equipment.items.emplace_back(0, SLOT_OFFHAND, false, false, true);
    refresh();
    SECTION("One item owns both hand slots")
    {
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "weapon"), "state") == "equipped");
        REQUIRE(value(slot(profile.node, "offhand"), "state") == "occupied");
        REQUIRE(json_find_member(slot(profile.node, "offhand"), "inv_slot")->number_ == 0);
        REQUIRE(value(slot(profile.node, "offhand"), "reason").find("great sword") != string::npos);
    }
    SECTION("Melded equipment is distinct from an empty slot")
    {
        you.form = transformation::bat;
        for (auto& item : you.equipment.items) item.melded = true;
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(value(slot(profile.node, "weapon"), "state") == "melded");
        REQUIRE(value(slot(profile.node, "body"), "state") == "blocked");
        REQUIRE(value(slot(profile.node, "weapon"), "reason").find("inactive") != string::npos);
    }
}
