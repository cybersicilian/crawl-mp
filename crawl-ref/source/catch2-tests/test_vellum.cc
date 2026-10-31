#include "test_vellum_fixture.h"
#include "ability.h"
#include "delay.h"
#include "oozle-memory-effects.h"
#include "store.h"
#include "tags.h"

using namespace enchantment_transfer;

TEST_CASE("Transfer ledger conserves full enchantments under the six-capacity ceiling", "[vellum][transfer]")
{
    for (int first = 1; first <= 8; ++first)
        for (int second = 1; second <= 8; ++second)
        {
            ledger state;
            const int a = extract(state, 101, {ARTP_STRENGTH, first * 2}, first);
            const int b = extract(state, 102, {ARTP_FIRE, second}, second);
            REQUIRE(valid(state, 6)); // Archiving is not binding.
            REQUIRE(bind(state, a, 201, 0, 6) == (first <= 6));
            const int before = used(state);
            REQUIRE(bind(state, b, 202, 0, 6) == (before + second <= 6));
            REQUIRE(used(state) <= 6);
            REQUIRE(valid(state, 6));
            REQUIRE_FALSE(extract(state, 101, {ARTP_STRENGTH, first * 2}, first));
        }
}

TEST_CASE("A personal property cannot be duplicated across dropped or unequipped bindings", "[vellum][transfer]")
{
    ledger state;
    const int first = extract(state, 101, {ARTP_FIRE, 1}, 1);
    const int second = extract(state, 102, {ARTP_FIRE, 2}, 2);
    REQUIRE(bind(state, first, 201, 0, 6));
    REQUIRE_FALSE(bind(state, second, 202, 0, 6));
    REQUIRE(used(state) == 1);
    REQUIRE(archive(state, first));
    REQUIRE(bind(state, second, 202, 1, 6));
    REQUIRE(contribution({ARTP_FIRE, 2}, 1) == 1);
    REQUIRE(contribution({ARTP_STRENGTH, -4}, 0) == -4);
    REQUIRE(contribution({ARTP_STRENGTH, -4}, 2) == 0);
    REQUIRE(contribution({ARTP_BRAND, SPWPN_FLAMING}, SPWPN_FREEZING)
            == SPWPN_FLAMING - SPWPN_FREEZING);
}

TEST_CASE("Masterworks permit two distinct threads without increasing personal capacity", "[vellum][transfer]")
{
    ledger state;
    state.masterwork = 201;
    const int first = extract(state, 101, {ARTP_FIRE, 3}, 3);
    const int second = extract(state, 102, {ARTP_COLD, 3}, 3);
    const int third = extract(state, 103, {ARTP_SEE_INVISIBLE, 1}, 1);
    REQUIRE(bind(state, first, 201, 0, 6));
    REQUIRE(bind(state, second, 201, 0, 6));
    REQUIRE_FALSE(bind(state, third, 201, 0, 6));
    REQUIRE(bind(state, third, 201, 0, 6, first));
    REQUIRE(find(state, first)->target == 0);
    REQUIRE(destroy_target(state, 201));
    REQUIRE(used(state) == 0);
    REQUIRE_FALSE(bind(state, second, 202, 0, 6));
    REQUIRE_FALSE(extract(state, 102, {ARTP_COLD, 3}, 3));
}

TEST_CASE_METHOD(vellum_fixture, "All nonzero native enchantment types have a transfer price", "[vellum]")
{
    for (int p = 0; p < ART_PROPERTIES; ++p)
    {
        const auto prop = static_cast<artefact_prop_type>(p);
        CAPTURE(p);
        for (int value : {-4, -1, 1, 4, 12})
            if (prop != ARTP_NO_UPGRADE && artp_value_is_valid(prop, value))
                CHECK(vellum::price({prop, value}) > 0);
    }
    CHECK(vellum::price({ARTP_STRENGTH, 14}) == 7);
    CHECK(vellum::price({ARTP_NO_UPGRADE, 1}) == 0); // Save-definition metadata, not an effect.
    CHECK(vellum::price({ARTP_STRENGTH, -14}) == 7);
    CHECK(vellum::price({ARTP_NUM_PROPERTIES, UNRAND_WUCAD_MU, effect_kind::unique_power}) == 6);
}

TEST_CASE_METHOD(vellum_fixture, "Earned capacity survives piety spending and the starter is once per character", "[vellum]")
{
    auto& vessel = carry(0, OBJ_ARMOUR, ARM_ROBE, false);
    you.raw_piety = you.piety_max[GOD_VELLUM] = 15;
    CHECK(vellum::capacity(you) == 1);
    vellum::request starter;
    starter.action = vellum::operation::starter;
    starter.target = vellum::item_id(vessel);
    starter.vessel = true;
    starter.magic = {ARTP_STRENGTH, 2};
    finish(starter);
    CHECK(you.raw_piety == 15);
    CHECK_FALSE(vellum::preview(starter).blocked.empty());
    you.piety_max[GOD_VELLUM] = 120;
    CHECK(vellum::capacity(you) == 6);
    you.religion = GOD_NO_GOD;
    CHECK(vellum::capacity(you) == 6);
    CHECK_FALSE(vellum::active(you));
    CHECK(player_has_ability(ABIL_VELLUM_WEAVE));
    you.religion = GOD_VELLUM;
    CHECK_FALSE(vellum::preview(starter).blocked.empty());
}

TEST_CASE_METHOD(vellum_fixture, "Real property transfer preserves donor identity and excludes borrowed memory", "[vellum]")
{
    auto& donor = carry(0);
    auto& target = carry(1, OBJ_ARMOUR, ARM_CLOAK);
    const int donor_id = vellum::item_id(donor);
    const auto work = transfer(0, 1, ARTP_FIRE, 2);
    wear(1, SLOT_CLOAK);
    const int piety = you.raw_piety;
    finish(work);
    CHECK(you.raw_piety == piety - 6);
    CHECK(vellum::item_id(donor) == donor_id);
    CHECK(native_artefact_property(donor, ARTP_FIRE) == 0);
    CHECK(native_artefact_property(target, ARTP_FIRE) == 0);
    CHECK(artefact_property(target, ARTP_FIRE) == 2);
    CHECK(you.scan_artefacts(ARTP_FIRE) == 2);
    for (const auto& property : equipment_memory::intrinsic_profile(target).properties)
        CHECK(property.type != ARTP_FIRE);
    you.penance[GOD_VELLUM] = 1;
    CHECK(you.scan_artefacts(ARTP_FIRE) == 0);
    you.penance[GOD_VELLUM] = 0;
    you.equipment.items.front().melded = true;
    CHECK(you.scan_artefacts(ARTP_FIRE) == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Stale quotes and seven-capacity installations leave both items and piety intact", "[vellum]")
{
    auto& donor = carry(0);
    carry(1, OBJ_ARMOUR, ARM_CLOAK);
    auto work = transfer(0, 1, ARTP_STRENGTH, 14);
    const int piety = you.raw_piety;
    CHECK_FALSE(vellum::preview(work).blocked.empty());
    work.target = 0;
    CHECK(vellum::preview(work).blocked.empty());
    work = transfer(0, 1, ARTP_STRENGTH, 4);
    const auto quote = vellum::preview(work);
    REQUIRE(quote.blocked.empty());
    ++donor.plus;
    CHECK_FALSE(vellum::commit(quote));
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == 4);
    CHECK(you.raw_piety == piety);
    CHECK(vellum::load(you).threads.empty());
}

TEST_CASE_METHOD(vellum_fixture, "Drawbacks and weapon brands move as complete enchantments", "[vellum]")
{
    auto& donor = carry(0, OBJ_WEAPONS, WPN_LONG_SWORD);
    auto& target = carry(1, OBJ_WEAPONS, WPN_LONG_SWORD);
    finish(transfer(0, 1, ARTP_STRENGTH, -4));
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == 0);
    CHECK(artefact_property(target, ARTP_STRENGTH) == -4);
    vellum::request archive;
    archive.action = vellum::operation::archive;
    archive.thread = vellum::load(you).threads.front().id;
    finish(archive);
    artefact_set_property(target, ARTP_BRAND, SPWPN_FREEZING);
    finish(transfer(0, 1, ARTP_BRAND, SPWPN_FLAMING));
    CHECK(get_weapon_brand(target) == SPWPN_FLAMING);
    CHECK(native_artefact_property(target, ARTP_BRAND) == SPWPN_FREEZING);
    CHECK(get_weapon_brand(donor) == SPWPN_NORMAL);
}

TEST_CASE_METHOD(vellum_fixture, "Named donor depletion survives definition refresh", "[vellum][save-compatibility]")
{
    auto& donor = unique(0, UNRAND_AUGMENTATION);
    carry(1, OBJ_ARMOUR, ARM_CLOAK);
    const int value = native_artefact_property(donor, ARTP_STRENGTH);
    REQUIRE(value > 0);
    finish(transfer(0, 1, ARTP_STRENGTH, value));
    setup_unrandart(donor, false);
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == 0);
    const auto before = vellum::load(you);
    vellum::save(you, before);
    CHECK(vellum::load(you).threads.front().magic.value == value);
}

TEST_CASE_METHOD(vellum_fixture, "A unique power is conserved and spends the full budget", "[vellum][unique-power]")
{
    auto& donor = unique(0, UNRAND_WUCAD_MU);
    auto& target = carry(1, OBJ_ARMOUR, ARM_ORB);
    artefact_set_property(target, ARTP_BRAND, SPARM_ENERGY);
    wear(0, SLOT_OFFHAND);
    vellum::request work;
    work.action = vellum::operation::extract;
    work.source = vellum::item_id(donor);
    work.target = vellum::item_id(target);
    work.magic = {ARTP_NUM_PROPERTIES, UNRAND_WUCAD_MU, effect_kind::unique_power};
    finish(work);
    CHECK_FALSE(has_unrand_effect(donor, UNRAND_WUCAD_MU));
    CHECK_FALSE(you.unrand_equipped(UNRAND_WUCAD_MU));
    you.equipment.items.clear();
    wear(1, SLOT_OFFHAND);
    vellum::refresh();
    CHECK(you.unrand_equipped(UNRAND_WUCAD_MU));
    CHECK(has_unrand_effect(target, UNRAND_WUCAD_MU));
    CHECK(used(vellum::load(you)) == 6);
    CHECK(oozle::effect_sources().size() == 1);
    setup_unrandart(donor, false);
    CHECK_FALSE(has_unrand_effect(donor, UNRAND_WUCAD_MU));
    you.religion = GOD_OKAWARU;
    vellum::refresh();
    CHECK_FALSE(you.unrand_equipped(UNRAND_WUCAD_MU));
    CHECK_FALSE(has_unrand_effect(target, UNRAND_WUCAD_MU));
}

TEST_CASE_METHOD(vellum_fixture, "Dropped binding reserves capacity and destruction cannot restore a donor", "[vellum]")
{
    carry(0);
    auto& target = carry(1, OBJ_ARMOUR, ARM_CLOAK);
    finish(transfer(0, 1, ARTP_FIRE, 3));
    const item_def floor_copy = target;
    target.clear();
    CHECK(used(vellum::load(you)) == 3);
    CHECK(vellum::item_bonus(you, floor_copy, ARTP_FIRE) == 0);
    vellum::on_destroyed(floor_copy);
    CHECK(used(vellum::load(you)) == 0);
    CHECK(vellum::load(you).threads.front().target == -1);
    CHECK(native_artefact_property(you.inv[0], ARTP_FIRE) == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Archived drawbacks reserve capacity and return when favour or ownership is lost", "[vellum]")
{
    auto& donor = carry(0);
    finish(transfer(0, -1, ARTP_STRENGTH, -4));
    CHECK(used(vellum::load(you)) == 2);
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == 0);
    const item_def traded_copy = donor;
    CHECK(native_artefact_property(traded_copy, ARTP_STRENGTH) == -4);
    you.religion = GOD_NO_GOD;
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == -4);
    you.religion = GOD_VELLUM;
    vellum::request restore;
    restore.action = vellum::operation::sever;
    restore.thread = vellum::load(you).threads.front().id;
    finish(restore);
    CHECK(used(vellum::load(you)) == 0);
    CHECK(native_artefact_property(donor, ARTP_STRENGTH) == -4);
}

TEST_CASE("Speed modifiers are priced by effect rather than by their negative sign", "[vellum]")
{
    CHECK_FALSE(drawback({ARTP_BASE_DELAY, -3}));
    CHECK(vellum::price({ARTP_BASE_DELAY, -3}) == 6);
    CHECK(drawback({ARTP_BASE_DELAY, 3}));
}
