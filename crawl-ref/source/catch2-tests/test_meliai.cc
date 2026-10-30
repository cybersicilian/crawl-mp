#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "mon-util.h"
#include "mutation.h"
#include "player.h"
#include "player-equip.h"
#include "species.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Meliai flight, faith and smiting are innate", "[meliai]")
{
    you.species = SP_MELIAI;
    give_basic_mutations(you.species);
    CHECK(you.faith(false));
    CHECK(you.racial_permanent_flight());
    CHECK(you.get_innate_mutation_level(MUT_FAST) == 2);
    CHECK(you.get_innate_mutation_level(MUT_STINGER) == 3);
    CHECK_FALSE(species::has_feet(SP_MELIAI));
    CHECK(player_res_poison(false, false, false, false) == -1);
    CHECK(player_has_ability(ABIL_MELIAI_SMITE));
    CHECK(make_cost_description(ABIL_MELIAI_SMITE).find("Maximum HP drain") != string::npos);
    string reason;
    CHECK(get_player_equip_slot_count(SLOT_BOOTS, &reason) == 0);
    CHECK(reason.find("no feet") != string::npos);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Trog Meliai may smite while berserk", "[meliai]")
{
    you.species = SP_MELIAI;
    you.hp_max = 100;
    you.duration[DUR_BERSERK] = 10;
    you.religion = GOD_NO_GOD;
    CHECK_FALSE(check_ability_possible(ABIL_MELIAI_SMITE, true));
    you.religion = GOD_TROG;
    CHECK(check_ability_possible(ABIL_MELIAI_SMITE, true));
}

