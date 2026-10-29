#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "protean.h"
#include "mutation-type.h"
#include "mutation.h"
#include "newgame-def.h"
#include "ng-restr.h"
#include "species.h"
#include "player.h"
#include "player-equip.h"
#include "status.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#include "transform.h"

TEST_CASE("Protean growth counts non-innate mutations per hero", "[protean]")
{
    player first;
    player second;
    first.species = second.species = SP_PROTEAN;
    first.mutation[MUT_EVOLUTION] = 2;
    first.innate_mutation[MUT_EVOLUTION] = 2;
    first.mutation[MUT_TOUGH_SKIN] = 2;
    first.temp_mutation[MUT_TOUGH_SKIN] = 1;
    CHECK(protean::mutation_levels(first) == 2);
    CHECK(protean::health_bonus_percent(first) == 8);
    CHECK(protean::health_bonus_percent(second) == 0);
    first.species = SP_HUMAN;
    CHECK(protean::health_bonus_percent(first) == 0);
}

TEST_CASE("Protean size follows maximum health thresholds", "[protean]")
{
    CHECK(protean::size_for_hp(49) == SIZE_TINY);
    CHECK(protean::size_for_hp(50) == SIZE_LITTLE);
    CHECK(protean::size_for_hp(100) == SIZE_SMALL);
    CHECK(protean::size_for_hp(150) == SIZE_MEDIUM);
    CHECK(protean::size_for_hp(200) == SIZE_LARGE);
    CHECK(protean::size_for_hp(300) == SIZE_GIANT);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Protean growth is visible and prevents transformations", "[protean]")
{
    you.species = SP_PROTEAN;
    you.mutation[MUT_TOUGH_SKIN] = 2;
    you.hp_max = 100;
    CHECK(you.body_size(PSIZE_TORSO, true) == SIZE_SMALL);
    status_info status;
    REQUIRE(fill_status_info(STATUS_PROTEAN_BODY, status));
    CHECK(status.light_text == "Growth +8%");
    CHECK(status.long_text.find("small") != string::npos);
    CHECK(status_light_description(status) == status.long_text);
    CHECK(cant_transform_reason(transformation::dragon, false, true).find("protean") != string::npos);
    you.species = SP_HUMAN;
    CHECK_FALSE(fill_status_info(STATUS_PROTEAN_BODY, status));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Protean mutation gain and loss update maximum health", "[protean]")
{
    you.species = SP_PROTEAN;
    you.experience_level = 10;
    calc_hp();
    const int baseline = you.hp_max;
    you.hp = baseline;
    REQUIRE(mutate(MUT_STRONG, "growth test", false, true));
    CHECK(you.hp_max > baseline);
    status_info status;
    REQUIRE(fill_status_info(STATUS_PROTEAN_BODY, status));
    CHECK(status.light_text == "Growth +4%");
    REQUIRE(delete_mutation(MUT_STRONG, "growth test", false, true));
    CHECK(you.hp_max == baseline);
    REQUIRE(fill_status_info(STATUS_PROTEAN_BODY, status));
    CHECK(status.light_text == "Growth +0%");
}

TEST_CASE_METHOD(vellum_fixture, "Protean size changes remove equipment that no longer fits", "[protean]")
{
    you.species = SP_PROTEAN;
    you.experience_level = 20;
    you.hp_max_adj_perm = 40;
    calc_hp();
    REQUIRE(you.body_size(PSIZE_TORSO, true) == SIZE_MEDIUM);
    you.on_current_level = true;
    you.equipment.update();
    carry(0, OBJ_ARMOUR, ARM_GLOVES, false);
    wear(0, SLOT_GLOVES);
    REQUIRE(you.equipment.get_first_slot_item(SLOT_GLOVES));
    you.hp_max_adj_perm += 60;
    calc_hp();
    REQUIRE(you.body_size(PSIZE_TORSO, true) == SIZE_LARGE);
    CHECK_FALSE(you.equipment.get_first_slot_item(SLOT_GLOVES));
    CHECK(you.inv[0].defined());
}

TEST_CASE("Protean starting choices reflect their small size and fixed form", "[protean]")
{
    CHECK_FALSE(character_is_allowed(SP_PROTEAN, JOB_HUNTER));
    CHECK_FALSE(character_is_allowed(SP_PROTEAN, JOB_HEXSLINGER));
    CHECK_FALSE(character_is_allowed(SP_PROTEAN, JOB_SHAPESHIFTER));
    CHECK_FALSE(character_is_allowed(SP_PROTEAN, JOB_STALKER));
    CHECK(character_is_allowed(SP_PROTEAN, JOB_FIGHTER));
    if (species::is_starting_species(SP_PROTEAN))
    {
        newgame_def ng;
        ng.species = SP_PROTEAN;
        ng.job = JOB_FIGHTER;
        CHECK(weapon_restriction(WPN_UNARMED, ng) == CC_UNRESTRICTED);
        CHECK(weapon_restriction(WPN_WAR_AXE, ng) == CC_BANNED);
    }
}
