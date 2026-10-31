#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "mon-info.h"
#include "mon-util.h"

TEST_CASE("Monster conditions retain native names and creature-relative effect kinds", "[monster-conditions]")
{
    init_monsters();
    monster_info info(MONS_ORC);
    info.mb.set(MB_HASTED);
    info.mb.set(MB_POISONED);
    info.mb.set(MB_TELEPORTING);
    const auto conditions = info.conditions();
    const auto find = [&](monster_info_flags id) -> const monster_condition& {
        auto found = std::find_if(conditions.begin(), conditions.end(),
            [id](const monster_condition& condition) { return condition.id == id; });
        REQUIRE(found != conditions.end());
        return *found;
    };
    CHECK(find(MB_HASTED).kind == monster_condition_kind::beneficial);
    CHECK(find(MB_HASTED).name == "fast");
    CHECK(find(MB_POISONED).kind == monster_condition_kind::harmful);
    CHECK(find(MB_POISONED).description == "poisoned");
    CHECK(find(MB_TELEPORTING).kind == monster_condition_kind::neutral);
    const vector<string> expected{"fast", "poisoned", "about to teleport"};
    CHECK(info.attributes() == expected);

    info.mb.set(MB_PARALYSED);
    info.mb.set(MB_FROZEN_IN_TERROR);
    const auto terror = info.conditions();
    CHECK(std::none_of(terror.begin(), terror.end(), [](const monster_condition& condition) {
        return condition.id == MB_PARALYSED;
    }));
    CHECK(std::any_of(terror.begin(), terror.end(), [](const monster_condition& condition) {
        return condition.id == MB_FROZEN_IN_TERROR && condition.kind == monster_condition_kind::harmful;
    }));
}
