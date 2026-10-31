#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "env.h"
#include "map-knowledge.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "test_player_fixture.h"

namespace
{
struct contact_fixture : MockPlayerYouTestsFixture
{
    contact_fixture()
    {
        party::set_player_count(2);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.set_position(coord_def(40, 35));
        you.wizard_vision = true; // Keep this memory-routing test independent of LOS caches.
        party::get_player(1) = you;
        party::get_player(1).save = nullptr;
        party::set_multiplayer(true);
        env.elapsed_time = 0;
    }
    ~contact_fixture()
    {
        party::set_multiplayer(false);
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
    }
};
}

TEST_CASE_METHOD(contact_fixture, "Invisible location hints belong to their observer", "[invisible-contacts]")
{
    monster unseen;
    unseen.type = MONS_ORC;
    unseen.mid = 900001;
    unseen.hit_points = unseen.max_hit_points = 10;
    unseen.set_position(coord_def(10, 10)); // Outside both heroes' sight.
    invis_monster_knowledge knowledge;
    knowledge.update(unseen);
    CHECK(knowledge.personal_view(0).last_known_pos(unseen) == coord_def(10, 10));
    CHECK(knowledge.personal_view(1).last_known_pos(unseen).origin());
    {
        party::scoped_player_context observer(1);
        knowledge.update(unseen, false); // A sound is not a location hint.
    }
    CHECK(knowledge.personal_view(1).last_known_pos(unseen).origin());
    CHECK(knowledge.personal_view(0).last_known_pos(unseen) == coord_def(10, 10));
    unseen.set_position(coord_def(11, 10));
    {
        party::scoped_player_context observer(1);
        knowledge.update(unseen);
    }
    CHECK(knowledge.personal_view(0).last_known_pos(unseen) == coord_def(10, 10));
    CHECK(knowledge.personal_view(1).last_known_pos(unseen) == coord_def(11, 10));
    knowledge.update(unseen, false); // General awareness preserves specificity.
    CHECK(knowledge.personal_view(0).last_known_pos(unseen) == coord_def(10, 10));
    env.elapsed_time = 151;
    CHECK(knowledge.personal_view(0).last_known_pos(unseen).origin());
    CHECK(knowledge.personal_view(1).last_known_pos(unseen).origin());
}
