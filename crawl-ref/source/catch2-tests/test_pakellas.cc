#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "beam.h"
#include "env.h"
#include "evocation.h"
#include "evoke.h"
#include "god-pakellas.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "recharge-account.h"
#include "religion.h"
#include "store.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "xp-evoker-data.h"

TEST_CASE("Recharge accounts preserve credit and overheat across cheaper and dearer devices", "[pakellas][recharge]")
{
    for (int capacity : {9000, 12000, 16000, 20000})
        for (int debt = 0; debt <= capacity + 24000; debt += 1000)
            for (int next : {9000, 12000, 16000, 20000})
            {
                recharge::account a{capacity, 3000, debt, 24000};
                const int credit = max(0, capacity - debt);
                const int overheat = max(0, debt - capacity);
                a.reconfigure(next, 8000);
                REQUIRE(max(0, a.capacity - a.debt) <= credit);
                REQUIRE(max(0, a.debt - a.capacity) == overheat);
                REQUIRE(a.loan == 24000);
                a.reconfigure(capacity, 3000);
                REQUIRE(max(0, a.capacity - a.debt) <= credit);
            }
}

TEST_CASE("Borrowed recovery is paid before any device work", "[pakellas][recharge]")
{
    recharge::account a{10000, 10000, 15000, 0};
    REQUIRE(a.ready() == 0);
    REQUIRE(a.borrow());
    REQUIRE(a.loan == 20000);
    REQUIRE(a.debt == 15000);
    REQUIRE_FALSE(a.borrow());
    for (int i = 0; i < 7; ++i)
        a.recover(a.repay(3000) * 3 / 2);
    REQUIRE(a.loan == 0);
    REQUIRE(a.debt == 13500);
    REQUIRE(a.ready() == 0);
    REQUIRE_FALSE(a.spend(true));
}

TEST_CASE("Enhanced capacity rounds up native work and never reports negative readiness", "[pakellas][recharge]")
{
    recharge::account a{9000, 3000, 0, 0};
    REQUIRE(a.ready() == 3);
    REQUIRE(a.spend(true));
    REQUIRE(a.debt == 5000);
    REQUIRE(a.ready() == 1);
    REQUIRE(a.spend(true));
    REQUIRE(a.debt == 10000);
    REQUIRE(a.ready() == 0);
    REQUIRE_FALSE(a.spend(false));
    a.recover(1000);
    REQUIRE(a.ready() == 0);
    a.recover(3000);
    REQUIRE(a.ready() == 1);
}

TEST_CASE("XP conversion retains fractional progress across award packets and rate changes", "[pakellas][recharge]")
{
    int remainder = 0, previous = 0;
    const int whole = recharge::convert_xp(1001, 237, 13, remainder, previous);
    int split_remainder = 0, split_previous = 0, split = 0;
    for (int i = 0; i < 1001; ++i)
        split += recharge::convert_xp(1, 237, 13, split_remainder, split_previous);
    REQUIRE(split == whole);
    REQUIRE(split_remainder == remainder);
    int half = 1, denominator = 2;
    REQUIRE(recharge::convert_xp(0, 100, 1, half, denominator) == 0);
    REQUIRE(half == 50);
    REQUIRE(denominator == 100);
}

TEST_CASE("Evocation payment is scoped and committed exactly once", "[pakellas][evocation]")
{
    int calls = 0;
    evocation request;
    request.damage_percent = 135;
    request.duration_percent = 135;
    request.payment = [&]() { ++calls; return true; };
    REQUIRE(request.commit());
    REQUIRE(request.commit());
    REQUIRE(calls == 1);
    REQUIRE(request.damage(10) == 13);
    REQUIRE(request.duration(100) == 135);
    REQUIRE(evocation{}.damage(10) == 10);
    evocation rejected;
    rejected.payment = []() { return false; };
    REQUIRE_FALSE(rejected.commit());
    REQUIRE_FALSE(rejected.committed);
    bolt beam;
    beam.damage = {10, 1};
    REQUIRE(beam.roll_damage() == 10);
    beam.damage_percent = 135;
    REQUIRE(beam.roll_damage() == 13);
}

namespace
{
struct pakellas_fixture : MockPlayerYouTestsFixture
{
    pakellas_fixture()
    {
        static const bool messages = []() { msg::initialise_mpr_streams(); return true; }();
        (void)messages;
        party::set_multiplayer(false);
        party::set_player_count(1);
        you.religion = GOD_PAKELLAS;
        you.raw_piety = 200;
        you.piety_hysteresis = 0;
    }
    item_def& device(int slot, object_class_type base, int subtype)
    {
        item_def& item = you.inv[slot];
        item.clear();
        item.base_type = base;
        item.sub_type = subtype;
        item.quantity = 1;
        item.charges = base == OBJ_WANDS ? 6 : 0;
        item.link = slot;
        item.slot = 'a' + slot;
        item.pos = coord_def(-1, -1);
        identify_item(item);
        return item;
    }
};
}

TEST_CASE_METHOD(pakellas_fixture, "Pakellas retains old ability IDs and grants the new native progression", "[pakellas]")
{
    REQUIRE(ABIL_PAKELLAS_DEVICE_SURGE == 1230);
    REQUIRE(ABIL_PAKELLAS_QUICK_CHARGE == 1231);
    REQUIRE(ABIL_PAKELLAS_SUPERCHARGE == 1232);
    REQUIRE(player_has_ability(ABIL_PAKELLAS_EVOKE_PROTOTYPE));
    REQUIRE(ability_name(ABIL_PAKELLAS_DEVICE_SURGE) == "Overclock");
    REQUIRE(ability_name(ABIL_PAKELLAS_SUPERCHARGE) == "Breakthrough");
    you.props["pakellas_kit"] = 1;
    REQUIRE(fixup_ability(ABIL_PAKELLAS_FIELD_KIT) == ABIL_NON_ABILITY);
}

TEST_CASE_METHOD(pakellas_fixture, "Field Kit transfers its generated wand without leaving an unlinked copy", "[pakellas]")
{
    const int generated = pakellas::field_kit(0);
    REQUIRE(generated != NON_ITEM);
    REQUIRE_FALSE(env.item[generated].defined());
    int wands = 0;
    for (const auto& item : you.inv)
        if (item.defined() && item.base_type == OBJ_WANDS)
        {
            ++wands;
            REQUIRE(item.sub_type == WAND_FLAME);
            REQUIRE(item.charges == 6);
        }
    REQUIRE(wands == 1);
    REQUIRE(pakellas::kit_claimed());
    REQUIRE(pakellas::field_kit(0) == NON_ITEM);
}

TEST_CASE_METHOD(pakellas_fixture, "Rebinding wands conserves earned work without refilling", "[pakellas]")
{
    auto& flame = device(0, OBJ_WANDS, WAND_FLAME);
    auto& acid = device(1, OBJ_WANDS, WAND_ACID);
    REQUIRE(pakellas::designate(flame));
    REQUIRE(pakellas::ready(flame) == 3);
    REQUIRE(pakellas::designate(acid));
    REQUIRE(pakellas::ready(acid) == 1);
    REQUIRE(pakellas::workshop().debt == 7000);
    REQUIRE_FALSE(pakellas::designated(flame));
    REQUIRE(pakellas::designate(flame));
    REQUIRE(pakellas::workshop().debt == 0);
    auto a = pakellas::workshop();
    a.debt = a.capacity + 6000;
    a.loan = 24000;
    pakellas::save_workshop(a);
    REQUIRE(pakellas::designate(acid));
    REQUIRE(pakellas::workshop().debt == 22000);
    REQUIRE(pakellas::workshop().loan == 24000);
    REQUIRE(pakellas::ready(acid) == 0);
}

TEST_CASE_METHOD(pakellas_fixture, "Borrowing pauses the selected evoker's recovery but never loses the loan", "[pakellas]")
{
    auto& phial = device(0, OBJ_MISCELLANY, MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::designate(phial));
    evoker_debt(phial.sub_type) = 15;
    auto a = pakellas::workshop();
    a.loan = 20000;
    pakellas::save_workshop(a);
    REQUIRE(pakellas::recover(6, 1) == MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::workshop().loan == 14000);
    REQUIRE(evoker_debt(phial.sub_type) == 15);
    REQUIRE(pakellas::recover(15, 1) == MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::workshop().loan == 0);
    REQUIRE(evoker_debt(phial.sub_type) == 14);
    REQUIRE(evoker_charges(phial.sub_type) == 0);
    REQUIRE(pakellas::recover(1, 1) == MISC_PHIAL_OF_FLOODS);
    REQUIRE(evoker_debt(phial.sub_type) == 12);
}

TEST_CASE_METHOD(pakellas_fixture, "Workshop ownership, loan and reserve survive property serialization", "[pakellas]")
{
    auto& wand = device(0, OBJ_WANDS, WAND_ICEBLAST);
    REQUIRE(pakellas::designate(wand));
    auto a = pakellas::workshop();
    a.debt = 9000;
    a.loan = 16000;
    pakellas::save_workshop(a);
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    CrawlHashTable restored;
    restored.read(input);
    you.props = restored;
    REQUIRE(pakellas::designated(wand));
    REQUIRE(pakellas::workshop().debt == 9000);
    REQUIRE(pakellas::workshop().loan == 16000);
    you.religion = GOD_NO_GOD;
    REQUIRE(pakellas::ready(wand) == 0);
    REQUIRE(pakellas::workshop().loan == 16000);
    you.religion = GOD_PAKELLAS;
    REQUIRE(pakellas::ready(wand) == 0);
    wand.charges = 0;
    REQUIRE(pakellas::preserve_wand(wand));
    wand.props["pakellas_owner"] = static_cast<int>(you.mid) + 1;
    REQUIRE_FALSE(pakellas::designated(wand));
}

TEST_CASE_METHOD(pakellas_fixture, "Leaving Pakellas cannot repay a loan and the selected evoker twice", "[pakellas]")
{
    auto& phial = device(0, OBJ_MISCELLANY, MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::designate(phial));
    evoker_debt(phial.sub_type) = 15;
    auto a = pakellas::workshop();
    a.loan = 20000;
    pakellas::save_workshop(a);
    you.religion = GOD_NO_GOD;
    REQUIRE(pakellas::recover(5, 1) == MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::workshop().loan == 15000);
    REQUIRE(evoker_debt(phial.sub_type) == 15);
    REQUIRE(pakellas::recover(15, 1) == MISC_PHIAL_OF_FLOODS);
    REQUIRE(pakellas::workshop().loan == 0);
    REQUIRE(evoker_debt(phial.sub_type) == 15);
    REQUIRE(pakellas::recover(1, 1) == -1);
}

TEST_CASE_METHOD(pakellas_fixture, "Every live wand and XP evoker has an explicit Prototype profile", "[pakellas]")
{
    for (int type = 0; type < NUM_WANDS; ++type)
    {
        auto& item = device(0, OBJ_WANDS, type);
        REQUIRE(pakellas::eligible(item) == !item_type_removed(OBJ_WANDS, type));
        if (pakellas::eligible(item))
        {
            REQUIRE(pakellas::per_use(item) > 0);
            REQUIRE_FALSE(pakellas::enhancement_description(item).empty());
        }
    }
    for (const auto& profile : xp_evoker_data)
    {
        auto& item = device(0, OBJ_MISCELLANY, profile.first);
        REQUIRE(pakellas::eligible(item));
        REQUIRE(pakellas::per_use(item) == profile.second.charge_xp_debt * recharge::precision);
        REQUIRE_FALSE(pakellas::enhancement_description(item).empty());
    }
}

TEST_CASE_METHOD(pakellas_fixture, "Rejected native workshop actions preserve both funding sources", "[pakellas][evocation]")
{
    auto& wand = device(0, OBJ_WANDS, WAND_FLAME);
    REQUIRE(pakellas::designate(wand));
    auto a = pakellas::workshop();
    a.debt = a.capacity;
    pakellas::save_workshop(a);
    you.turn_is_over = false;
    const int piety = you.piety();
    const int charges = wand.charges;
    REQUIRE(pakellas::invoke(ABIL_PAKELLAS_EVOKE_PROTOTYPE, nullptr, 0) == spret::abort);
    REQUIRE(pakellas::invoke(ABIL_PAKELLAS_DEVICE_SURGE, nullptr, 0) == spret::abort);
    REQUIRE(wand.charges == charges);
    REQUIRE(pakellas::workshop().debt == a.debt);
    REQUIRE(you.piety() == piety);
    REQUIRE_FALSE(you.turn_is_over);
    wand.charges = 1;
    REQUIRE(pakellas::invoke(ABIL_PAKELLAS_DEVICE_SURGE, nullptr, 0, true) == spret::abort);
    REQUIRE(wand.charges == 1);
    REQUIRE(you.piety() == piety);
    REQUIRE_FALSE(you.turn_is_over);
}

TEST_CASE_METHOD(pakellas_fixture, "External funding bypasses charge readiness while retaining native restrictions", "[pakellas][evocation]")
{
    auto& wand = device(0, OBJ_WANDS, WAND_FLAME);
    wand.charges = 0;
    REQUIRE_FALSE(cannot_evoke_item_reason(&wand, true, true).empty());
    REQUIRE(cannot_evoke_item_reason(&wand, true, true, nullptr, true).empty());
    you.duration[DUR_BERSERK] = 10;
    REQUIRE_FALSE(cannot_evoke_item_reason(&wand, true, true, nullptr, true).empty());
    evocation request;
    request.externally_funded = true;
    int calls = 0;
    request.payment = [&]() { ++calls; return true; };
    REQUIRE(evoke_device(wand, nullptr, request) == spret::abort);
    REQUIRE(calls == 0);
    REQUIRE_FALSE(request.committed);
    REQUIRE(wand.charges == 0);
}

TEST_CASE_METHOD(pakellas_fixture, "Designation restrictions share a native explanation and preserve the existing account", "[pakellas]")
{
    auto& flame = device(0, OBJ_WANDS, WAND_FLAME);
    auto& acid = device(1, OBJ_WANDS, WAND_ACID);
    REQUIRE(pakellas::designate(flame));
    const auto before = pakellas::workshop();
    you.turn_is_over = false;
    you.duration[DUR_BERSERK] = 10;
    REQUIRE_FALSE(pakellas::designation_reason(acid).empty());
    REQUIRE(pakellas::invoke(ABIL_PAKELLAS_QUICK_CHARGE, nullptr, 1) == spret::abort);
    REQUIRE(pakellas::designated(flame));
    REQUIRE_FALSE(pakellas::designated(acid));
    REQUIRE(pakellas::workshop().debt == before.debt);
    REQUIRE(pakellas::workshop().capacity == before.capacity);
    REQUIRE_FALSE(you.turn_is_over);
}

TEST_CASE_METHOD(pakellas_fixture, "Legacy former worshippers cannot claim a duplicate Field Kit", "[pakellas]")
{
    you.religion = GOD_NO_GOD;
    you.worshipped[GOD_PAKELLAS] = 1;
    you.one_time_ability_used.set(GOD_PAKELLAS);
    you.duration[DUR_DEVICE_SURGE] = 50;
    pakellas::migrate();
    REQUIRE(pakellas::kit_claimed());
    REQUIRE(you.duration[DUR_DEVICE_SURGE] == 0);
    REQUIRE(you.one_time_ability_used[GOD_PAKELLAS]);
    REQUIRE(pakellas::workshop().loan == 0);
    pakellas::migrate();
    REQUIRE(pakellas::kit_claimed());
}
