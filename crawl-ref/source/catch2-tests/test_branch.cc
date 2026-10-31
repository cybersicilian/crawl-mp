#include "catch_amalgamated.hpp"

#include "AppHdr.h"
#include "branch.h"

TEST_CASE( "is_random_subbranch_test", "[single-file]" ) {

    for (branch_iterator it; it; ++it)
    {
        branch_type branch = it->id;

        CAPTURE(branch);

        // Burrows is a guaranteed Lair child in this fork's mid-game layout,
        // so it is deliberately not one of the alternative Lair branches.
        bool old_is_random_subbranch = parent_branch(branch) == BRANCH_LAIR
                                        && branch != BRANCH_SLIME
                                        && branch != BRANCH_BURROWS;

        REQUIRE(old_is_random_subbranch == is_random_subbranch(branch));
    }
}
