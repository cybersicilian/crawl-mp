#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include <cctype>
#include "branch.h"
#include "branch-population.h"

TEST_CASE("Population profiles preserve defaults and validate branch depths", "[burrows][population]")
{
    for (branch_type branch = BRANCH_DUNGEON; branch < NUM_BRANCHES;
         branch = static_cast<branch_type>(branch + 1))
    {
        bool configured = false;
        for (const auto& profile : branch_population_profiles())
            configured |= profile.branch == branch;
        if (!configured)
            CHECK(branch_population_die_size(branch, 1, 11) == 11);
    }
    for (const auto& profile : branch_population_profiles())
    {
        CAPTURE(profile.branch);
        CHECK(profile.dice.size() == static_cast<unsigned>(branches[profile.branch].numlevels));
        CHECK(branch_population_die_size(profile.branch, 0, 11) == 11);
        CHECK(branch_population_die_size(profile.branch, profile.dice.size() + 1, 11) == 11);
        for (int size : profile.dice)
        {
            CHECK(size > 0);
            CHECK(size <= 60);
        }
    }
}

TEST_CASE("New branch travel shortcuts are unambiguous", "[burrows][travel]")
{
    for (branch_type branch : {BRANCH_BURROWS, BRANCH_WORMLANDS, BRANCH_HIVE})
    {
        CAPTURE(branch);
        const unsigned char key = branches[branch].travel_shortcut;
        for (int other = 0; other < NUM_BRANCHES; ++other)
            if (other != branch)
                CHECK(std::tolower(key) != std::tolower(
                    static_cast<unsigned char>(branches[other].travel_shortcut)));
    }
}
