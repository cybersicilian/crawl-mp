#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "mon-book.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "spl-util.h"

TEST_CASE("Hired companions have distinct monster data and preserve their roles",
          "[mercenary-roster]")
{
    init_monsters();
    for (const monster_type type : {
             MONS_MERC_FIGHTER, MONS_MERC_KNIGHT, MONS_MERC_DEATH_KNIGHT,
             MONS_MERC_PALADIN, MONS_MERC_SKALD, MONS_MERC_INFUSER,
             MONS_MERC_TIDEHUNTER, MONS_MERC_WITCH, MONS_MERC_SORCERESS,
             MONS_MERC_ELEMENTALIST, MONS_MERC_BRIGAND, MONS_MERC_ASSASSIN,
             MONS_MERC_CLEANER, MONS_MERC_SHAMAN, MONS_MERC_SHAMAN_II,
             MONS_MERC_SHAMAN_III})
    {
        CAPTURE(type);
        const monsterentry* entry = get_monster_data(type);
        REQUIRE(entry != nullptr);
        CHECK(entry->mc == type);
        CHECK(mons_class_flag(type, M_NO_POLY_TO));
        CHECK(mons_class_flag(type, M_NO_GEN_DERIVED));
    }

    CHECK(get_monster_data(MONS_MERC_SKALD)->habitat == HT_AMPHIBIOUS);
    CHECK(get_monster_data(MONS_MERC_TIDEHUNTER)->habitat == HT_AMPHIBIOUS);
    CHECK(get_monster_data(MONS_MERC_FIGHTER)->sec == MST_NO_SPELLS);
    CHECK(get_monster_data(MONS_MERC_WITCH)->sec == MST_MERC_WITCH);
    CHECK(get_monster_data(MONS_MERC_SHAMAN)->sec == MST_MERC_SHAMAN);
    CHECK(get_monster_data(MONS_MERC_SHAMAN_III)->sec == MST_MERC_SHAMAN_III);
}
