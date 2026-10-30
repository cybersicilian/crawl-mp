#include "catch_amalgamated.hpp"

#include "AppHdr.h"
#include "branch.h"
#include "mon-book.h"
#include "mon-info.h"
#include "mon-pick.h"
#include "mon-util.h"
#include "ng-init-branches.h"

TEST_CASE( "create_brentry_validity", "[single-file]" ) {
    FixedVector<level_id, NUM_BRANCHES> candidate_brentry;
    candidate_brentry = create_brentry();


    for (branch_iterator it; it; ++it)
    {
        bool correct = candidate_brentry[it->id].is_valid()
                        || is_random_subbranch(it->id)
                        || skip_branch_brentry(it);

        CAPTURE(it->id);

        REQUIRE(correct);
    }
}

TEST_CASE("greenwood witch joins the Forest with its original spell kit",
          "[greenwood-witch]")
{
    init_monsters();
    const monsterentry* witch = get_monster_data(MONS_GREENWOOD_WITCH);
    REQUIRE(witch != nullptr);
    CHECK(string(witch->name) == "greenwood witch");
    CHECK(witch->sec == MST_GREENWOOD_WITCH);
    CHECK(witch->speed == 13);
#if TAG_MAJOR_VERSION == 34
    CHECK(monster_in_population(BRANCH_FOREST, MONS_GREENWOOD_WITCH));
#endif
    const auto info = monster_info(MONS_GREENWOOD_WITCH, MONS_GREENWOOD_WITCH);
    const auto spells = get_unique_spells(info);
    for (spell_type wanted : {SPELL_SLEEP, SPELL_POLYMORPH, SPELL_BOLT_OF_DRAINING})
        CHECK(std::any_of(spells.begin(), spells.end(),
                          [wanted](const mon_spell_slot& slot)
                          { return slot.spell == wanted; }));
}

TEST_CASE("Orb Demons join Zot with their destructive and mobile spell kit",
          "[orb-demon]")
{
    init_monsters();
    const monsterentry* demon = get_monster_data(MONS_ORB_DEMON);
    REQUIRE(demon != nullptr);
    CHECK(string(demon->name) == "Orb Demon");
    CHECK(demon->sec == MST_ORB_DEMON);
    CHECK(demon->attack[0].flavour == AF_BLINK);
    CHECK(demon->attack[0].damage == 20);
    CHECK(monster_in_population(BRANCH_ZOT, MONS_ORB_DEMON));
    const auto info = monster_info(MONS_ORB_DEMON, MONS_ORB_DEMON);
    const auto spells = get_unique_spells(info);
    for (spell_type wanted : {SPELL_BOLT_OF_DEVASTATION, SPELL_DEFLECT_MISSILES,
                              SPELL_IOOD, SPELL_BLINK_RANGE, SPELL_DIG})
        CHECK(std::any_of(spells.begin(), spells.end(),
                          [wanted](const mon_spell_slot& slot)
                          { return slot.spell == wanted; }));
}

TEST_CASE( "select_exactly_one_of_each_lair_group", "[single-file]" ) {
    FixedVector<level_id, NUM_BRANCHES> candidate_brentry;

    for (int i=0; i < 100; i++)
    {
        candidate_brentry = create_brentry();

        // != functions as xor here, testing if *exactly* one branch is
        // valid
        REQUIRE(candidate_brentry[BRANCH_SWAMP].is_valid()
                != candidate_brentry[BRANCH_SHOALS].is_valid());

        const int land_branches = candidate_brentry[BRANCH_SPIDER].is_valid()
                                + candidate_brentry[BRANCH_SNAKE].is_valid();
        REQUIRE(land_branches == 1);
    }
}
