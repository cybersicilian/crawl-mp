#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "party.h"
#include "player.h"
#include "religion.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Gods tolerate the specified directed conversions",
                 "[god-respect]")
{
    const pair<god_type, god_type> conversions[] = {
        {GOD_FEDHAS, GOD_ELYVILON}, {GOD_USKAYAW, GOD_WU_JIAN},
        {GOD_WU_JIAN, GOD_OKAWARU}, {GOD_OKAWARU, GOD_SHINING_ONE},
        {GOD_NEMELEX_XOBEH, GOD_XOM}, {GOD_MAKHLEB, GOD_LUGONU},
        {GOD_MAKHLEB, GOD_TROG}, {GOD_LUGONU, GOD_RU},
        {GOD_YREDELEMNUL, GOD_KIKUBAAQUDGHA},
        {GOD_SIF_MUNA, GOD_ASHENZARI}, {GOD_SIF_MUNA, GOD_CHEIBRIADOS},
    };
    for (const auto& conversion : conversions)
    {
        INFO(god_name(conversion.first) << " -> " << god_name(conversion.second));
        CHECK_FALSE(god_hates_your_god(conversion.first, conversion.second));
    }
    CHECK(god_hates_your_god(GOD_WU_JIAN, GOD_USKAYAW));
    CHECK(god_hates_your_god(GOD_TROG, GOD_MAKHLEB));
    CHECK(god_hates_your_god(GOD_SIF_MUNA, GOD_TROG));
    CHECK_FALSE(god_hates_your_god(GOD_RU, GOD_TROG));
    CHECK_FALSE(god_hates_your_god(GOD_ZIN, GOD_ELYVILON));
    CHECK(god_hates_your_god(GOD_ZIN, GOD_XOM));
    CHECK(god_hates_your_god(GOD_ELYVILON, GOD_MAKHLEB));

    you.religion = GOD_WU_JIAN;
    you.penance[GOD_USKAYAW] = 10;
    CHECK_FALSE(active_penance(GOD_USKAYAW));
    you.religion = GOD_TROG;
    CHECK(active_penance(GOD_USKAYAW));
}

TEST_CASE_METHOD(vellum_fixture, "Xom respects the active Chaos Knight's departure",
                 "[god-respect][party]")
{
    you.char_class = JOB_CHAOS_KNIGHT;
    CHECK_FALSE(god_hates_your_god(GOD_XOM, GOD_TROG));
    CHECK_FALSE(god_hates_your_god(GOD_XOM, GOD_NO_GOD));
    CHECK(god_hates_your_god(GOD_XOM, GOD_ZIN));
    party::set_player_count(2);
    party::get_player(1).char_class = JOB_FIGHTER;
    party::set_multiplayer(true);
    {
        party::scoped_player_context context(1);
        CHECK(god_hates_your_god(GOD_XOM, GOD_TROG));
    }
    CHECK_FALSE(god_hates_your_god(GOD_XOM, GOD_TROG));
    party::set_multiplayer(false);
    party::set_player_count(1);
}
