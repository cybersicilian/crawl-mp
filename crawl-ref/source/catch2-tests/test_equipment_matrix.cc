#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <cstdlib>
#include <fstream>
#include <set>

#include "artefact.h"
#include "env.h"
#include "equipment-profile.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-use.h"
#include "items.h"
#include "json-wrapper.h"
#include "libunix.h"
#include "mutation.h"
#include "mutation-type.h"
#include "player.h"
#include "player-equip.h"
#include "prompt.h"
#include "random.h"
#include "species.h"
#include "startup.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "transform.h"

namespace
{
string text(JsonNode* object, const char* key)
{
    const auto node = json_find_member(object, key);
    return node && node->tag == JSON_STRING ? node->string_ : "";
}
JsonNode* slot(JsonNode* profile, const string& key)
{
    for (auto node = json_find_member(profile, "slots")->children.head; node; node = node->next)
        if (text(node, "key") == key) return node;
    return nullptr;
}
void capacity(JsonNode* profile, const string& type, int expected)
{
    auto first = slot(profile, type + ":0");
    REQUIRE(first);
    REQUIRE(json_find_member(first, "capacity")->number_ == expected);
}
void capacity(const string& type, int expected)
{
    JsonWrapper profile(equipment_profile_json());
    REQUIRE_FALSE(text(profile.node, "unarmed_attack").empty());
    capacity(profile.node, type, expected);
}
void refresh()
{
    you.equipment.update();
    you.set_position(coord_def(GXM / 2, GYM / 2));
    env.grid(you.pos()) = DNGN_FLOOR;
}
void species_setup(species_type sp)
{
    // Level mutations can change abilities and refresh the local tile layout.
    // This fixture has no tile regions, so use the normal headless test setup.
    enter_headless_mode();
    static const bool ready = []() {
        cio_init();
        cgotoxy(1, 1);
        return true;
    }();
    (void)ready;
    you.species = sp;
    you.experience_level = 27;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(sp);
    if (sp == SP_DEMONSPAWN) roll_demonspawn_mutations();
    for (int xl = 2; xl <= 27; ++xl) give_level_mutations(sp, xl);
    refresh();
}
int add_item(const char* name)
{
    INFO(name);
    int index = 0;
    while (index < ENDOFPACK && you.inv[index].defined()) ++index;
    REQUIRE(index < ENDOFPACK);
    REQUIRE(get_item_by_exact_name(you.inv[index], name));
    you.inv[index].link = index;
    you.inv[index].pos = ITEM_IN_INVENTORY;
    you.inv[index].slot = index_to_letter(index);
    return index;
}
void wear(int index)
{
    auto& item = you.inv[index];
    REQUIRE(can_equip_item(item, true));
    you.equipment.add(item, get_item_slot(item));
    refresh();
}
void unrand(int which)
{
    int index = 0;
    while (index < ENDOFPACK && you.inv[index].defined()) ++index;
    REQUIRE(index < ENDOFPACK);
    you.inv[index].clear(); you.inv[index].quantity = 1;
    REQUIRE(make_item_unrandart(you.inv[index], which));
    you.inv[index].link = index;
    you.inv[index].pos = ITEM_IN_INVENTORY;
    you.inv[index].slot = index_to_letter(index);
    wear(index);
}
void probes()
{
    for (const char* name : { "helmet", "hat", "pair of gloves", "pair of boots", "barding",
             "cloak", "robe", "plate armour", "buckler", "great sword", "dagger",
             "ring of protection", "amulet of reflection" }) add_item(name);
}
// Verify the serialized contract against native queries, then optionally export
// native-produced data for the browser suite. These are controlled player
// fixtures, not claims that each state was reached through gameplay.
void capture(const string& label, const string& group)
{
    INFO(label);
    const auto before = rng::peek_uint64();
    JsonWrapper profile(equipment_profile_json());
    REQUIRE_FALSE(text(profile.node, "unarmed_attack").empty());
    REQUIRE(rng::peek_uint64() == before);
    JsonWrapper repeat(equipment_profile_json());
    REQUIRE(profile.to_string() == repeat.to_string());
    auto node = json_find_member(profile.node, "slots")->children.head;
    std::set<string> keys;
    for (int value = SLOT_WEAPON; value < NUM_EQUIP_SLOTS; ++value)
    {
        const auto type = static_cast<equipment_slot>(value);
        const int count = get_player_equip_slot_count(type);
        for (int index = 0; index < std::max(1, count); ++index)
        {
            REQUIRE(node);
            REQUIRE(keys.insert(text(node, "key")).second);
            REQUIRE(json_find_member(node, "capacity")->number_ == count);
            if (!count) REQUIRE(text(node, "state") == "unavailable");
            const auto owner = json_find_member(node, "inv_slot");
            if (owner) REQUIRE(you.inv[int(owner->number_)].defined());
            node = node->next;
        }
    }
    REQUIRE_FALSE(node);
    for (auto item = json_find_member(profile.node, "items")->children.head; item; item = item->next)
    {
        const int index = json_find_member(item, "inv_slot")->number_;
        if (item_type_is_equipment(you.inv[index].base_type))
        {
            string reason;
            const bool fits = can_equip_item(you.inv[index], true, &reason);
            REQUIRE(json_find_member(item, "fits")->bool_ == fits);
            if (!fits) REQUIRE(text(item, "reason") == reason);
        }
    }
    const char* output = std::getenv("DCSS_EQUIPMENT_MATRIX");
    if (!output) return;
    JsonWrapper hero(json_mkobject());
    const auto str = [&](const char* key, const string& value) {
        json_append_member(hero.node, key, json_mkstring(value.c_str()));
    };
    str("name", label); str("case_group", group); str("species", species::name(you.species));
    json_append_member(hero.node, "alive", json_mkbool(true));
    json_append_member(hero.node, "inventory_known", json_mkbool(true));
    json_append_member(hero.node, "xl", json_mknumber(you.experience_level));
    json_append_member(hero.node, "hp", json_mknumber(you.hp));
    json_append_member(hero.node, "hp_max", json_mknumber(you.hp_max));
    JsonNode* inventory = json_mkarray();
    for (const auto& item : you.inv)
    {
        if (!item.defined()) continue;
        JsonNode* entry = json_mkobject();
        json_append_member(entry, "slot", json_mknumber(item.link));
        json_append_member(entry, "letter", json_mkstring(string(1, item.slot).c_str()));
        json_append_member(entry, "name", json_mkstring(item.name(DESC_PLAIN, true).c_str()));
        json_append_member(entry, "kind_name", json_mkstring(item_class_name(item.base_type)));
        json_append_member(entry, "equipped", json_mkbool(item_is_equipped(item)));
        json_append_element(inventory, entry);
    }
    json_append_member(hero.node, "inventory", inventory);
    json_append_member(hero.node, "equipment_profile", profile.node); profile.node = nullptr;
    std::ofstream file(output, std::ios::app);
    REQUIRE(file.good());
    file << hero.to_string() << '\n';
}
}

TEST_CASE("Equipment matrix covers every current species", "[equipment-profile][equipment-matrix]")
{
    rng::generator random(rng::GAMEPLAY);
    for (auto sp : species::get_all_species())
    {
        MockPlayerYouTestsFixture fixture;
        species_setup(sp); probes();
        capture(species::name(sp), "species");
    }
}

TEST_CASE("Equipment matrix covers mutation boundaries", "[equipment-profile][equipment-matrix]")
{
    rng::generator random(rng::GAMEPLAY);
    for (auto mut : { MUT_HORNS, MUT_ANTENNAE, MUT_BEAK, MUT_CLAWS, MUT_DEMONIC_TOUCH,
            MUT_HOOVES, MUT_TALONS, MUT_FLOAT, MUT_WEAKNESS_STINGER, MUT_MISSING_HAND,
            MUT_NO_GRASPING, MUT_NO_ARMOUR, MUT_NO_JEWELLERY, MUT_FORMLESS,
            MUT_WIELD_OFFHAND, MUT_QUADRUMANOUS })
    {
        for (int level = 1; level <= mutation_max_levels(mut); ++level)
        {
            MockPlayerYouTestsFixture fixture;
            you.mutation[mut] = level; refresh(); probes();
            capture(string(mutation_name(mut)) + " " + std::to_string(level), "mutation");
        }
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Centaurs equip two pairs of boots alongside barding",
                 "[equipment-profile][centaur-equipment]")
{
    rng::generator random(rng::GAMEPLAY);
    species_setup(SP_GALE_CENTAUR);
    REQUIRE(get_player_equip_slot_count(SLOT_BOOTS) == 2);
    REQUIRE(get_player_equip_slot_count(SLOT_BARDING) == 1);
    const int first = add_item("pair of boots");
    const int second = add_item("pair of boots");
    const int barding = add_item("barding");
    const int initial_ac = you.armour_class_scaled(100);
    REQUIRE(try_equip_item(you.inv[first], true));
    REQUIRE(try_equip_item(you.inv[second], true));
    REQUIRE(try_equip_item(you.inv[barding], true));
    CHECK(you.equipment.get_slot_entries(SLOT_BOOTS).size() == 2);
    CHECK(you.equipment.get_slot_entries(SLOT_BARDING).size() == 1);
    CHECK(you.armour_class_scaled(100) >= initial_ac + 600);
    const int third = add_item("pair of boots");
    bool needs_replacement = false;
    you.equipment.find_slot_to_equip_item(you.inv[third], needs_replacement);
    CHECK(needs_replacement);
    JsonWrapper profile(equipment_profile_json());
    CHECK(text(slot(profile.node, "feet:0"), "state") == "equipped");
    CHECK(text(slot(profile.node, "feet:1"), "state") == "equipped");
    you.form = transformation::bat;
    you.equipment.meld_equipment(get_form()->blocked_slots, true); refresh();
    CHECK(item_is_melded(you.inv[first]));
    CHECK(item_is_melded(you.inv[second]));
    you.form = transformation::none;
    you.equipment.unmeld_all_equipment(true); refresh();
    CHECK_FALSE(item_is_melded(you.inv[first]));
    CHECK_FALSE(item_is_melded(you.inv[second]));
    REQUIRE(unequip_item(you.inv[first], false, true));
    CHECK_FALSE(item_is_equipped(you.inv[first]));
    CHECK(item_is_equipped(you.inv[second]));
    CHECK(item_is_equipped(you.inv[barding]));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Formicids equip four rings and two pairs of gloves",
                 "[equipment-profile][formicid-equipment]")
{
    rng::generator random(rng::GAMEPLAY);
    species_setup(SP_FORMICID);
    REQUIRE(get_player_equip_slot_count(SLOT_GLOVES) == 2);
    REQUIRE(get_player_equip_slot_count(SLOT_RING) == 4);
    const int initial_ac = you.armour_class_scaled(100);
    for (int i = 0; i < 2; ++i)
    {
        const int index = add_item("pair of gloves");
        REQUIRE(try_equip_item(you.inv[index], true));
    }
    for (int i = 0; i < 4; ++i)
    {
        const int index = add_item("ring of protection");
        you.inv[index].plus = 1;
        REQUIRE(try_equip_item(you.inv[index], true));
    }
    CHECK(you.equipment.get_slot_entries(SLOT_GLOVES).size() == 2);
    CHECK(you.equipment.get_slot_entries(SLOT_RING).size() == 4);
    CHECK(you.armour_class_scaled(100) >= initial_ac + 400);
    JsonWrapper profile(equipment_profile_json());
    CHECK(text(slot(profile.node, "hands:1"), "state") == "equipped");
    CHECK(text(slot(profile.node, "ring:3"), "state") == "equipped");
    you.form = transformation::bat;
    you.equipment.meld_equipment(get_form()->blocked_slots, true); refresh();
    for (const auto& entry : you.equipment.get_slot_entries(SLOT_GLOVES))
        CHECK(entry.melded);
    you.form = transformation::none;
    you.equipment.unmeld_all_equipment(true); refresh();
    for (const auto& entry : you.equipment.get_slot_entries(SLOT_GLOVES))
        CHECK_FALSE(entry.melded);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Extra anatomy respects equipment restrictions",
                 "[equipment-profile][centaur-equipment][formicid-equipment]")
{
    rng::generator random(rng::GAMEPLAY);
    species_setup(SP_FORMICID);
    you.mutation[MUT_MISSING_HAND] = 1;
    CHECK(get_player_equip_slot_count(SLOT_RING) == 3);
    you.mutation[MUT_CLAWS] = 3;
    // Quadrumanous grants an independent glove slot even when claws block
    // the ordinary pair.
    CHECK(get_player_equip_slot_count(SLOT_GLOVES) == 1);
    species_setup(SP_GALE_CENTAUR);
    you.mutation[MUT_NO_ARMOUR] = 1;
    CHECK(get_player_equip_slot_count(SLOT_BOOTS) == 0);
    species_setup(SP_MINOTAUR);
    you.mutation[MUT_HOOVES] = 3;
    CHECK(get_player_equip_slot_count(SLOT_BOOTS) == 0);
}

TEST_CASE("Equipment matrix covers every form and returning to normal", "[equipment-profile][equipment-matrix]")
{
    rng::generator random(rng::GAMEPLAY);
    for (int value = 0; value < NUM_TRANSFORMS; ++value)
    {
        MockPlayerYouTestsFixture fixture;
        refresh();
        for (const char* name : { "dagger", "robe", "helmet", "pair of gloves", "pair of boots", "cloak",
                                 "ring of protection", "amulet of reflection" }) wear(add_item(name));
        add_item("great sword");
        you.form = static_cast<transformation>(value);
        you.equipment.meld_equipment(get_form()->blocked_slots, true); refresh();
        capture(get_form()->get_long_name() + " (" + std::to_string(value) + ")", "form");
        you.form = transformation::none;
        you.equipment.unmeld_all_equipment(true); refresh();
        JsonWrapper normal(equipment_profile_json());
        for (auto entry = json_find_member(normal.node, "slots")->children.head; entry; entry = entry->next)
            REQUIRE(text(entry, "state") != "melded");
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Equipment matrix covers anatomy and slot grant interactions",
                 "[equipment-profile][equipment-matrix]")
{
    rng::generator random(rng::GAMEPLAY);
    string label;
    SECTION("Octopode with item-granted rings")
    {
        label = "Octopode with eleven rings"; species_setup(SP_OCTOPODE);
        unrand(UNRAND_FINGER_AMULET); unrand(UNRAND_VAINGLORY); capacity("ring", 11);
    }
    SECTION("Octopode with a missing hand")
    {
        label = "Octopode missing hand"; species_setup(SP_OCTOPODE);
        you.mutation[MUT_MISSING_HAND] = 1; refresh(); capacity("ring", 7); capacity("offhand", 0);
    }
    SECTION("Troll with an auxiliary glove slot")
    {
        label = "Troll fisticloak gloves"; species_setup(SP_TROLL);
        unrand(UNRAND_FISTICLOAK); capacity("hands", 1);
    }
    SECTION("Sphinx equipment on an octopode")
    {
        label = "Octopode sphinx"; species_setup(SP_OCTOPODE);
        you.form = transformation::sphinx; refresh(); capacity("barding", 1); capacity("cloak", 1);
    }
    SECTION("Sphinx equipment respects no-armour anatomy")
    {
        label = "Felid sphinx"; species_setup(SP_FELID);
        you.form = transformation::sphinx; refresh(); capacity("barding", 0);
    }
    SECTION("Coglin support slots in fortress crab form")
    {
        label = "Coglin fortress crab"; species_setup(SP_COGLIN);
        you.form = transformation::fortress_crab; refresh(); capacity("twohander", 1);
    }
    SECTION("Serpent heads override large horns")
    {
        label = "Horned serpent"; you.mutation[MUT_HORNS] = 3;
        you.form = transformation::serpent; refresh(); capacity("head", 2);
    }
    SECTION("Poltergeist with an item-granted head slot")
    {
        label = "Poltergeist skull headgear"; species_setup(SP_POLTERGEIST);
        unrand(UNRAND_SKULL_OF_ZONGULDROK); capacity("head", 1); capacity("haunted_armour", 6);
    }
    SECTION("Swimming merfolk meld their boots")
    {
        label = "Swimming Merfolk"; species_setup(SP_MERFOLK); wear(add_item("pair of boots"));
        you.fishtail = true;
        you.equipment.meld_equipment(1 << SLOT_BOOTS, true); refresh();
        env.grid(you.pos()) = DNGN_SHALLOW_WATER;
        JsonWrapper profile(equipment_profile_json());
        REQUIRE(text(slot(profile.node, "feet:0"), "state") == "melded");
    }
    SECTION("Coglin gizmos are native equipment")
    {
        label = "Coglin equipped gizmo"; species_setup(SP_COGLIN);
        auto& item = you.inv[0]; item.clear(); item.base_type = OBJ_GIZMOS;
        item.sub_type = 0; item.quantity = 1; item.flags |= ISFLAG_IDENTIFIED;
        item.link = 0; item.pos = ITEM_IN_INVENTORY; item.slot = 'a'; wear(0);
    }
    probes(); capture(label, "interaction");
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Equipment matrix covers slot granting and multi-slot artefacts",
                 "[equipment-profile][equipment-matrix]")
{
    rng::generator random(rng::GAMEPLAY);
    refresh();
    string label;
    SECTION("Macabre finger necklace") { label = "Macabre finger necklace"; unrand(UNRAND_FINGER_AMULET); capacity("ring", 3); }
    SECTION("Crown of vainglory") { label = "Crown of vainglory"; unrand(UNRAND_VAINGLORY); capacity("ring", 4); }
    SECTION("Justicar's regalia") { label = "Justicar's regalia"; unrand(UNRAND_JUSTICARS_REGALIA); capacity("amulet", 2); }
    SECTION("Skull of Zonguldrok") { label = "Skull of Zonguldrok"; unrand(UNRAND_SKULL_OF_ZONGULDROK); capacity("head", 2); }
    SECTION("Fungal fisticloak") { label = "Fungal fisticloak"; unrand(UNRAND_FISTICLOAK); capacity("hands", 2); }
    SECTION("Combined slot grants")
    {
        label = "Combined slot grants";
        for (int which : { UNRAND_FINGER_AMULET, UNRAND_VAINGLORY, UNRAND_JUSTICARS_REGALIA,
                           UNRAND_SKULL_OF_ZONGULDROK, UNRAND_FISTICLOAK }) unrand(which);
        JsonWrapper profile(equipment_profile_json());
        capacity(profile.node, "ring", 5); capacity(profile.node, "amulet", 2);
        capacity(profile.node, "head", 2); capacity(profile.node, "hands", 2);
    }
    SECTION("Lear's hauberk") { label = "Lear's hauberk"; unrand(UNRAND_LEAR); }
    SECTION("Two-handed weapon") { label = "Two-handed weapon"; wear(add_item("great sword")); }
    capture(label, "special");
    // Exercise loss of granted capacity as well as its appearance.
    destroy_items_in_player_inventory(); refresh();
    JsonWrapper normal(equipment_profile_json());
    capacity(normal.node, "ring", 2); capacity(normal.node, "amulet", 1);
    capacity(normal.node, "head", 1); capacity(normal.node, "hands", 1);
}
