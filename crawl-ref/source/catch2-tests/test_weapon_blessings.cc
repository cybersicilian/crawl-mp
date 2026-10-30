#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "god-abil.h"
#include "item-name.h"
#include "item-prop-enum.h"
#include "makeitem.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Divine weapon gifts use stable brands and expose their powers", "[weapon-blessings]")
{
    CHECK(NUM_REAL_SPECIAL_WEAPONS == SPWPN_DEVIOUS + 1);
    CHECK(SPWPN_ACID == NUM_REAL_SPECIAL_WEAPONS + 1);
    CHECK(SPWPN_PACIFYING == SPWPN_DEBUG_RANDART + 1);
    CHECK(SPWPN_SLUGGISH == SPWPN_DEBUG_RANDART + 2);
    CHECK(SPWPN_SILVER == SPWPN_DEBUG_RANDART + 3);
    CHECK(SPWPN_SLIMIFYING == SPWPN_DEBUG_RANDART + 4);
    CHECK(string(brand_type_name(SPWPN_PACIFYING, false)) == "pacifying");
    CHECK(string(brand_type_name(SPWPN_SLUGGISH, false)) == "sluggish");
    CHECK(string(brand_type_name(SPWPN_SILVER, false)) == "silver");
    CHECK(string(brand_type_name(SPWPN_SLIMIFYING, false)) == "slimifying");
    for (const auto brand : {SPWPN_PACIFYING, SPWPN_SLUGGISH,
                             SPWPN_SILVER, SPWPN_SLIMIFYING})
    {
        CHECK(is_weapon_brand_ok(WPN_LONG_SWORD, brand, false));
        CHECK_FALSE(is_weapon_brand_ok(WPN_LONGBOW, brand, false));
    }
    CHECK(ability_name(ABIL_ZIN_BLESS_WEAPON) == "Brand Weapon With Silver");
    CHECK(ability_name(ABIL_ELYVILON_BLESS_WEAPON) == "Brand Weapon With Pacifying");
    CHECK(ability_name(ABIL_CHEIBRIADOS_BLESS_WEAPON) == "Brand Weapon With Sluggish");
    CHECK(ability_name(ABIL_JIYVA_BLESS_WEAPON) == "Brand Weapon With Slimifying");
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Jiyva's weapon gift and vault unlock are independent per worshipper", "[weapon-blessings]")
{
    you.religion = GOD_JIYVA;
    you.raw_piety = piety_breakpoint(5);
    you.piety_hysteresis = 0;
    you.penance[GOD_JIYVA] = 0;
    you.one_time_ability_used.set(GOD_JIYVA);
    you.props.erase("jiyva_weapon_blessed");
    CHECK(can_bless_weapon(GOD_JIYVA));
    const god_power* power = god_power_from_ability(ABIL_JIYVA_BLESS_WEAPON);
    REQUIRE(power);
    CHECK(god_power_usable(*power));
    you.props["jiyva_weapon_blessed"] = true;
    CHECK_FALSE(can_bless_weapon(GOD_JIYVA));
    CHECK_FALSE(god_power_usable(*power));
    CHECK(you.one_time_ability_used[GOD_JIYVA]);
    you.props.erase("jiyva_weapon_blessed");
    you.penance[GOD_JIYVA] = 1;
    CHECK_FALSE(can_bless_weapon(GOD_JIYVA));
    you.penance[GOD_JIYVA] = 0;
    you.raw_piety = piety_breakpoint(5) - 1;
    CHECK_FALSE(can_bless_weapon(GOD_JIYVA));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Divine gift eligibility follows the active party member", "[weapon-blessings]")
{
    you.religion = GOD_JIYVA;
    you.raw_piety = piety_breakpoint(5);
    you.piety_hysteresis = 0;
    you.penance[GOD_JIYVA] = 0;
    you.props["jiyva_weapon_blessed"] = true;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.props.erase("jiyva_weapon_blessed");
    party::set_multiplayer(true);
    CHECK_FALSE(can_bless_weapon(GOD_JIYVA));
    {
        party::scoped_player_context context(1);
        CHECK(can_bless_weapon(GOD_JIYVA));
    }
    CHECK_FALSE(can_bless_weapon(GOD_JIYVA));
    other.save = nullptr;
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Each divine gift requires six-star good standing and is once-only", "[weapon-blessings]")
{
    for (const auto god : {GOD_ZIN, GOD_ELYVILON, GOD_CHEIBRIADOS})
    {
        you.religion = god;
        you.penance[god] = 0;
        you.piety_hysteresis = 0;
        you.one_time_ability_used.set(god, false);
        you.raw_piety = piety_breakpoint(5) - 1;
        CHECK_FALSE(can_bless_weapon(god));
        you.raw_piety = piety_breakpoint(5);
        CHECK(can_bless_weapon(god));
        you.penance[god] = 1;
        CHECK_FALSE(can_bless_weapon(god));
        you.penance[god] = 0;
        you.one_time_ability_used.set(god);
        CHECK_FALSE(can_bless_weapon(god));
    }
}
