#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "mutation.h"
#include "env.h"
#include "player.h"
#include "player-equip.h"
#include "species.h"
#include "spl-book.h"
#include "spl-util.h"
#include "status.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Faerie Dragon wings and scales protect at the cost of stealth", "[faerie-dragon]")
{
    you.species = SP_HUMAN;
    you.experience_level = 1;
    you.base_stats[STAT_DEX] = 30;
    const int baseline_ac = you.armour_class_scaled(100);
    const int baseline_sh = player_displayed_shield_class(100, false);
    const int baseline_stealth = player_stealth();
    REQUIRE(baseline_stealth > STEALTH_PIP);
    you.species = SP_FAERIE_DRAGON;
    CHECK(species::is_starting_species(you.species));
    give_basic_mutations(you.species);
    CHECK(you.has_innate_mutation(MUT_BIG_WINGS));
    CHECK(you.racial_permanent_flight());
    CHECK(you.armour_class_scaled(100) == baseline_ac + 600);
    CHECK(player_displayed_shield_class(100, false) == baseline_sh + 300);
    CHECK(player_stealth() == max(0, baseline_stealth - STEALTH_PIP));
    string reason;
    CHECK(get_player_equip_slot_count(SLOT_BODY_ARMOUR, &reason) == 0);
    CHECK(reason.find("wings") != string::npos);
    you.experience_level = 27;
    CHECK(you.armour_class_scaled(100) == baseline_ac + 1200);
    CHECK(player_displayed_shield_class(100, false) == baseline_sh + 1200);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Faerie Dragon spell discount uses the native cost path", "[faerie-dragon]")
{
    init_spell_descs();
    you.species = SP_HUMAN;
    const int dart = spell_mana(SPELL_MAGIC_DART);
    const int blink = spell_mana(SPELL_BLINK);
    REQUIRE(dart == 1);
    REQUIRE(blink > 1);
    you.species = SP_FAERIE_DRAGON;
    CHECK(spell_mana(SPELL_MAGIC_DART) == 0);
    you.magic_points = 0;
    CHECK(enough_mp(spell_mana(SPELL_MAGIC_DART), true, false));
    CHECK(spell_mana(SPELL_BLINK) == blink - 1);
    CHECK(spell_mana(SPELL_MAGIC_DART, false) == dart);
    CHECK(spell_mana(SPELL_BLINK, false) == blink);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Faerie Dragon flight increases evasion", "[faerie-dragon]")
{
    you.set_position(coord_def(40, 35));
    unwind_var<dungeon_feature_type> terrain(env.grid(you.pos()), DNGN_FLOOR);
    you.species = SP_FAERIE_DRAGON;
    you.mutation[MUT_BIG_WINGS] = 0;
    you.innate_mutation[MUT_BIG_WINGS] = 0;
    you.duration[DUR_FLIGHT] = 0;
    REQUIRE_FALSE(you.airborne());
    CHECK(you.evasion_scaled(100) == you.evasion_scaled(100, false));

    you.duration[DUR_FLIGHT] = 10;
    REQUIRE(you.airborne());
    const int ordinary_ev = you.evasion_scaled(100, false);
    CHECK(you.evasion_scaled(100) == ordinary_ev + max(100, ordinary_ev / 10));
    status_info flight;
    REQUIRE(fill_status_info(STATUS_AIRBORNE, flight));
    CHECK(status_light_description(flight).find("increases evasion") != string::npos);

    you.species = SP_HUMAN;
    CHECK(you.airborne());
    CHECK(you.evasion_scaled(100) == you.evasion_scaled(100, false));
}
