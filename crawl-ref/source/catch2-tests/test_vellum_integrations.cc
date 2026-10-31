#include "test_vellum_fixture.h"
#include "delay.h"
#include "oozle-memory-effects.h"
#include "store.h"
#include "tags.h"
#include "monster.h"
#include "mon-util.h"

using namespace enchantment_transfer;

TEST_CASE_METHOD(vellum_fixture, "Armour egos retain their family and cannot turn into weapon brands", "[vellum]")
{
    auto& donor = carry(0, OBJ_ARMOUR, ARM_ROBE);
    auto& target = carry(1, OBJ_ARMOUR, ARM_ROBE);
    carry(2, OBJ_WEAPONS, WPN_LONG_SWORD);
    auto work = transfer(0, 2, ARTP_BRAND, SPARM_FIRE_RESISTANCE);
    CHECK_FALSE(vellum::preview(work).blocked.empty());
    work.target = vellum::item_id(target);
    finish(work);
    wear(1);
    CHECK(get_armour_ego_type(target) == SPARM_FIRE_RESISTANCE);
    CHECK(get_armour_ego_type(donor) == SPARM_NORMAL);
    CHECK(you.res_fire() == 1);
    CHECK(used(vellum::load(you)) == 3);
}

TEST_CASE_METHOD(vellum_fixture, "Weapon and armour enchantment levels move intact and remain owner bound", "[vellum]")
{
    auto& donor = carry(0, OBJ_WEAPONS, WPN_LONG_SWORD);
    auto& target = carry(1, OBJ_ARMOUR, ARM_ROBE);
    donor.plus = 5;
    target.plus = 2;
    vellum::request work;
    work.source = vellum::item_id(donor);
    work.target = vellum::item_id(target);
    work.magic = {ARTP_NUM_PROPERTIES, 5, effect_kind::enchantment};
    finish(work);
    CHECK(donor.plus == 0);
    CHECK(target.plus == 2);
    CHECK(effective_item_enchantment(target) == 5);
    CHECK(used(vellum::load(you)) == 5);
    const item_def copy = target;
    CHECK(effective_item_enchantment(copy) == 2);
    you.penance[GOD_VELLUM] = 1;
    CHECK(effective_item_enchantment(target) == 2);
}

TEST_CASE_METHOD(vellum_fixture, "Negative enchantment levels reserve capacity and return on abandonment", "[vellum]")
{
    auto& donor = carry(0, OBJ_WEAPONS, WPN_LONG_SWORD);
    donor.plus = -3;
    vellum::request work;
    work.source = vellum::item_id(donor);
    work.magic = {ARTP_NUM_PROPERTIES, -3, effect_kind::enchantment};
    finish(work);
    CHECK(native_item_enchantment(donor) == 0);
    CHECK(used(vellum::load(you)) == 3);
    you.religion = GOD_NO_GOD;
    CHECK(native_item_enchantment(donor) == -3);
}

TEST_CASE_METHOD(vellum_fixture, "Masterwork compatibility includes both imported enchantments", "[vellum]")
{
    carry(0);
    auto& target = carry(1);
    carry(2);
    vellum::request masterwork;
    masterwork.action = vellum::operation::masterwork;
    masterwork.target = vellum::item_id(target);
    finish(masterwork);
    finish(transfer(0, 1, ARTP_BLINK, 1));
    const auto conflicting = transfer(2, 1, ARTP_PREVENT_TELEPORTATION, 1);
    CHECK_FALSE(vellum::preview(conflicting).blocked.empty());
    CHECK(native_artefact_property(you.inv[2], ARTP_PREVENT_TELEPORTATION) == 1);
    CHECK(used(vellum::load(you)) == 3);
}

TEST_CASE_METHOD(vellum_fixture, "Archiving, replacing and severing cannot avoid removal consequences", "[vellum]")
{
    carry(0);
    auto& target = carry(1);
    carry(2);
    finish(transfer(0, 1, ARTP_DRAIN, 1));
    wear(1);
    const int id = vellum::load(you).threads.front().id;
    for (auto action : {vellum::operation::archive, vellum::operation::sever})
    {
        vellum::request work;
        work.action = action;
        work.thread = id;
        CHECK_FALSE(vellum::preview(work).blocked.empty());
    }
    auto replace = transfer(2, 1, ARTP_FIRE, 1);
    replace.replace = id;
    CHECK_FALSE(vellum::preview(replace).blocked.empty());
    CHECK(artefact_property(target, ARTP_DRAIN) == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Property serialization preserves borrowed scripts without recreating static extras", "[vellum][save-compatibility][unique-power]")
{
    auto& donor = unique(0, UNRAND_WUCAD_MU);
    carry(1, OBJ_ARMOUR, ARM_ORB);
    artefact_set_property(you.inv[1], ARTP_BRAND, SPARM_ENERGY);
    vellum::request work;
    work.source = vellum::item_id(donor);
    work.target = vellum::item_id(you.inv[1]);
    work.magic = {ARTP_NUM_PROPERTIES, UNRAND_WUCAD_MU, effect_kind::unique_power};
    finish(work);
    wear(1, SLOT_OFFHAND);
    vellum::refresh();
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    CrawlHashTable restored;
    restored.read(input);
    you.props = restored;
    REQUIRE(vellum::script_sources(you).size() == 1);
    auto* source = vellum::script_source_by_id(vellum::load(you).threads.front().id);
    REQUIRE(source);
    setup_unrandart(*source, false);
    CHECK(native_artefact_property(*source, ARTP_BRAND) == 0);
    CHECK(has_unrand_effect(you.inv[1], UNRAND_WUCAD_MU));
    CHECK_FALSE(has_unrand_effect(donor, UNRAND_WUCAD_MU));
    CHECK(used(vellum::load(you)) == 6);
}

TEST_CASE_METHOD(vellum_fixture, "A borrowed base modifier cannot be harvested as native equipment memory", "[vellum]")
{
    carry(0, OBJ_WEAPONS, WPN_LONG_SWORD);
    auto& target = carry(1, OBJ_WEAPONS, WPN_LONG_SWORD);
    const int native_damage = property(target, PWPN_DAMAGE);
    finish(transfer(0, 1, ARTP_BASE_DAM, 5));
    CHECK(property(target, PWPN_DAMAGE) == native_damage + 5);
    const auto profile = equipment_memory::intrinsic_profile(target);
    for (const auto& effect : profile.properties)
        if (effect.type == ARTP_BASE_DAM)
            CHECK(effect.value == native_damage);
}

TEST_CASE_METHOD(vellum_fixture, "Weaving commits on the fifth owner action and damage interrupts it atomically", "[vellum][cooperative-delay]")
{
    carry(0);
    carry(1);
    const auto work = transfer(0, 1, ARTP_FIRE, 1);
    const auto prepared = vellum::preview(work);
    REQUIRE(prepared.blocked.empty());
    REQUIRE(vellum::begin(prepared) == spret::success);
    REQUIRE(current_delay());
    for (int action = 2; action <= 4; ++action)
    {
        handle_delay();
        CHECK(vellum::load(you).threads.empty());
        CHECK(you.time_taken == BASELINE_DELAY);
    }
    SECTION("fifth action commits")
    {
        handle_delay();
        CHECK(vellum::load(you).threads.size() == 1);
        CHECK(native_artefact_property(you.inv[0], ARTP_FIRE) == 0);
    }
    SECTION("damage before commitment cancels")
    {
        --you.hp;
        handle_delay();
        CHECK(vellum::load(you).threads.empty());
        CHECK(native_artefact_property(you.inv[0], ARTP_FIRE) == 1);
        CHECK(you.raw_piety == 200);
    }
}

TEST_CASE_METHOD(vellum_fixture, "Two archived drawbacks of one property are rejected without mutation", "[vellum]")
{
    carry(0);
    carry(1);
    finish(transfer(0, -1, ARTP_STRENGTH, -4));
    const auto work = transfer(1, -1, ARTP_STRENGTH, -2);
    CHECK_FALSE(vellum::preview(work).blocked.empty());
    CHECK_FALSE(vellum::commit(vellum::preview(work)));
    CHECK(native_artefact_property(you.inv[1], ARTP_STRENGTH) == -2);
    CHECK(used(vellum::load(you)) == 2);
}

TEST_CASE_METHOD(vellum_fixture, "Moved Wyrmbane grows through its native callback and retains growth on reload", "[vellum][unique-power][save-compatibility]")
{
    init_monsters();
    auto& donor = unique(0, UNRAND_WYRMBANE);
    donor.plus = 12;
    auto& target = carry(1, OBJ_WEAPONS, WPN_LONG_SWORD);
    target.plus = 2;
    wear(1, SLOT_WEAPON);
    vellum::request work;
    work.source = vellum::item_id(donor);
    work.target = vellum::item_id(target);
    work.magic = {ARTP_NUM_PROPERTIES, UNRAND_WYRMBANE, effect_kind::unique_power};
    finish(work);
    CHECK(donor.plus == 8);
    CHECK(effective_item_enchantment(target) == 6);
    monster dragon;
    dragon.type = MONS_IRON_DRAGON;
    dragon.set_hit_dice(18);
    dragon.hit_points = 0;
    REQUIRE(dragon.dragon_level() == 18);
    oozle::melee_effects(&you, &dragon, 0, nullptr, true);
    CHECK(effective_item_enchantment(target) == 7);
    CHECK(donor.plus == 8);
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    CrawlHashTable restored;
    restored.read(input);
    you.props = restored;
    CHECK(effective_item_enchantment(target) == 7);
    CHECK(used(vellum::load(you)) == 6);
}

TEST_CASE_METHOD(vellum_fixture, "A unique power cannot duplicate enchantment levels already harvested", "[vellum][unique-power]")
{
    auto& donor = unique(0, UNRAND_WYRMBANE);
    donor.plus = 12;
    auto& target = carry(1, OBJ_WEAPONS, WPN_LONG_SWORD);
    target.plus = 2;
    wear(1, SLOT_WEAPON);
    vellum::request work;
    work.source = vellum::item_id(donor);
    work.magic = {ARTP_NUM_PROPERTIES, 12, effect_kind::enchantment};
    finish(work); // Oversized positive enchantment remains archived.
    work.target = vellum::item_id(target);
    work.magic = {ARTP_NUM_PROPERTIES, UNRAND_WYRMBANE, effect_kind::unique_power};
    finish(work);
    CHECK(donor.plus == 0);
    CHECK(effective_item_enchantment(target) == 2);
    CHECK(vellum::load(you).threads.front().magic.value == 12);
}
