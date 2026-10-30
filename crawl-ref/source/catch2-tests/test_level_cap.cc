#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "message.h"
#include "mutation.h"
#include "party.h"
#include "player.h"
#include "tags.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Permanent level-cap loss stacks beyond mutation limits and survives saves",
                 "[level-cap]")
{
    CHECK(you.get_max_xl() == 27);
    const auto experience = you.experience;
    for (int loss = 1; loss <= 5; ++loss)
    {
        reduce_level_cap(1);
        CHECK(you.get_max_xl() == 27 - loss);
        CHECK(you.experience_level == 1);
        CHECK(you.experience == experience);
    }
    CHECK(you.get_mutation_level(MUT_INEXPERIENCED) == 0);
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.props.read(input);
    CHECK(restored.get_max_xl() == 22);
    CHECK(restored.permanent_xl_cap_loss() == 5);
    reduce_level_cap(100);
    CHECK(you.get_max_xl() == 1);
    reduce_level_cap(1);
    CHECK(you.get_max_xl() == 1);
    reduce_level_cap(-10);
    CHECK(you.get_max_xl() == 1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Resurrection potential loss adds to Ru without granting Ru sacrifices",
                 "[level-cap]")
{
    // Establish Ru's existing mutation independently of this persistent cost.
    you.mutation[MUT_INEXPERIENCED] = 2;
    REQUIRE(you.get_max_xl() == 25);
    reduce_level_cap(1);
    CHECK(you.get_max_xl() == 24);
    CHECK(you.get_mutation_level(MUT_INEXPERIENCED) == 2);
    CHECK(you.sacrifices[MUT_INEXPERIENCED] == 0);
    you.mutation[MUT_INEXPERIENCED] = 0;
    CHECK(you.get_max_xl() == 26);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "A lowered cap clamps an over-cap hero even with virtual-level experience",
                 "[level-cap]")
{
    static const bool messages = [] { msg::initialise_mpr_streams(); return true; }();
    (void)messages;
    you.religion = GOD_NO_GOD;
    you.experience_level = 27;
    you.max_level = 30;
    you.experience = exp_needed(30);
    const auto experience = you.experience;
    reduce_level_cap(1);
    CHECK(you.get_max_xl() == 26);
    CHECK(you.experience_level == 26);
    CHECK(you.experience == experience);
    level_change();
    CHECK(you.experience_level == 26);
    reduce_level_cap(1);
    CHECK(you.experience_level == 25);
    CHECK(you.hp_max > 0);
}
