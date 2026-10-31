#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "env.h"
#include "fight.h"
#include "fineff.h"
#include "message.h"
#include "ouch.h"
#include "options.h"
#include "output.h"
#include "party.h"
#include "player.h"
#include "species.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "status.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Sparkborn lightning and water rules are character-specific", "[sparkborn]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    init_spell_descs();
    you.set_position(coord_def(40, 35));
    unwind_var<dungeon_feature_type> terrain(env.grid(you.pos()), DNGN_FLOOR);
    you.species = SP_SPARKBORN;
    REQUIRE(species::is_starting_species(SP_SPARKBORN));
    you.experience_level = 5;
    you.magic_points = you.max_magic_points = 12;
    CHECK(you.res_elec() == 4);
    CHECK(resist_adjust_damage(&you, BEAM_ELECTRICITY, 100) == 0);
    {
        unwind_var<bool> percentages(Options.show_resist_percent, true);
        const string overview = dump_overview_screen();
        const size_t electricity = overview.find("rElec");
        REQUIRE(electricity != string::npos);
        CHECK(overview.substr(electricity, 80).find("(0%)") != string::npos);
    }
    CHECK(can_cast_spells(true));
    env.grid(you.pos()) = DNGN_SHALLOW_WATER;
    REQUIRE(you.in_water());
    CHECK_FALSE(can_cast_spells(true));
    CHECK(casting_uselessness_reason(SPELL_MAGIC_DART, true).find("water") != string::npos);
    status_info status;
    REQUIRE(fill_status_info(STATUS_TERRAIN, status));
    CHECK(status.light_text == "Water(-Cast)");
    CHECK(status.short_text == "water prevents spellcasting");
    CHECK(status_light_description(status).find("prevents you from casting") != string::npos);
    CHECK(you.magic_points == 12); // Standing in water does not drain MP.
    you.duration[DUR_FLIGHT] = 10;
    CHECK_FALSE(you.in_water());
    CHECK(can_cast_spells(true));
    you.duration[DUR_FLIGHT] = 0;
    expose_player_to_element(BEAM_WATER, 1, false);
    CHECK(you.magic_points == 0);
    you.species = SP_HUMAN;
    you.magic_points = 12;
    CHECK(can_cast_spells(true));
    expose_player_to_element(BEAM_WATER, 1, false);
    CHECK(you.magic_points == 12);
    CHECK(you.res_elec() < 4);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Sparkborn injury defers a single response and respects stasis", "[sparkborn]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    init_monsters();
    you.set_position(coord_def(40, 35));
    unwind_var<dungeon_feature_type> terrain(env.grid(you.pos()), DNGN_FLOOR);
    you.species = SP_SPARKBORN;
    you.hp = you.hp_max = 100;
    you.duration[DUR_DIMENSION_ANCHOR] = 100;
    you.duration[DUR_BLINKBOLT_COOLDOWN] = 0;
    SECTION("A significant hit schedules the response once")
    {
        ouch(20, KILLED_BY_MONSTER, MID_NOBODY, nullptr, nullptr, true);
        CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 1);
        ouch(20, KILLED_BY_MONSTER, MID_NOBODY, nullptr, nullptr, true);
        CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 1);
        fire_final_effects();
        CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 0);
        CHECK(you.pos() == coord_def(40, 35));
    }
    SECTION("Poison does not trigger the response")
    {
        ouch(20, KILLED_BY_POISON, MID_NOBODY, nullptr, nullptr, true);
        CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 0);
        fire_final_effects();
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Deferred Sparkborn retaliation belongs to the injured party member", "[sparkborn]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    init_monsters();
    you.set_position(coord_def(40, 35));
    unwind_var<dungeon_feature_type> leader_terrain(env.grid(you.pos()), DNGN_FLOOR);
    unwind_var<dungeon_feature_type> other_terrain(env.grid(coord_def(41, 35)), DNGN_FLOOR);
    you.species = SP_HUMAN;
    you.hp = you.hp_max = 100;
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    you.on_current_level = true;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.species = SP_SPARKBORN;
    other.set_position(coord_def(41, 35));
    other.duration[DUR_DIMENSION_ANCHOR] = 100;
    other.duration[DUR_BLINKBOLT_COOLDOWN] = 0;
    party::set_multiplayer(true);
    party::sync_all_proxies();
    {
        party::scoped_player_context injured(1, true);
        ouch(20, KILLED_BY_MONSTER, MID_NOBODY, nullptr, nullptr, true);
        CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 1);
    }
    CHECK(party::active_slot() == 0);
    CHECK(you.duration[DUR_BLINKBOLT_COOLDOWN] == 0);
    fire_final_effects();
    CHECK(party::active_slot() == 0);
    CHECK(other.duration[DUR_BLINKBOLT_COOLDOWN] == 0);
    CHECK(other.hp == 80);
    CHECK(you.hp == 100);
    party::remove_all_proxies();
    party::set_multiplayer(false);
    other.save = nullptr;
    party::set_player_count(1);
}
