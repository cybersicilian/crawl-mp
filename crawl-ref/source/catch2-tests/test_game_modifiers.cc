#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "game-modifiers.h"
#include "character-trait.h"
#include "dungeon.h"
#include "env.h"
#include "feature.h"
#include "fprop.h"
#include "party.h"
#include "player.h"
#include "tags.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "traps.h"
#include "unwind.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Campaign modifier defaults and trap modes",
                 "[game-modifiers]")
{
    using namespace game_modifiers;
    CHECK_FALSE(rune_locks_disabled(you));
    CHECK_FALSE(shared_fate(you));
    CHECK(trap_mode(you) == traps::normal);

    struct mode_case { traps mode; bool floor; bool random; const char *name; };
    for (const auto test : {mode_case{traps::normal, true, true, "normal"},
                            mode_case{traps::none, false, false, "none"},
                            mode_case{traps::floor_only, true, false, "floor"},
                            mode_case{traps::random_only, false, true, "random"}})
    {
        set_campaign(you, true, test.mode);
        CHECK(string(trap_mode_name(trap_mode(you))) == test.name);
        CHECK(rune_locks_disabled(you));
        CHECK(floor_traps_enabled(you) == test.floor);
        CHECK(random_traps_enabled(you) == test.random);
        CHECK(trap_is_bad_for_player(DNGN_TRAP_ALARM) == test.floor);
        CHECK(trap_is_bad_for_player(DNGN_TRAP_PLATE));
        CHECK(floor_trap_suppressed(DNGN_TRAP_ALARM, false) == !test.floor);
        // These are the ordinary hazards used by the alternate Zot end hall.
        for (const auto feature : {DNGN_TRAP_ZOT, DNGN_TRAP_DISPERSAL,
                                   DNGN_TRAP_NET, DNGN_TRAP_ALARM})
        {
            CHECK(floor_trap_suppressed(feature, true) == !test.floor);
        }
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_PLATE, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_PASSAGE_OF_GOLUBRIA, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_TELEPORT_PERMANENT, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_TELEPORT, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_SHAFT, true));
        CHECK(floor_trap_suppressed(DNGN_TRAP_TELEPORT, false) == !test.floor);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Agraphede webs survive trap suppression and clear on replacement",
                 "[game-modifiers][agraphede-web]")
{
    using namespace game_modifiers;
    // MockPlayerYouTestsFixture does not initialise a dungeon. Terrain changes
    // inspect the item/monster grids, so give them a real empty level and a
    // small traversable neighbourhood before exercising temporary overlays.
    init_show_table();
    dgn_reset_level(false);
    unwinder reset_level([] { dgn_reset_level(false); });
    const coord_def pos(20, 20);
    for (int x = pos.x - 1; x <= pos.x + 1; ++x)
        for (int y = pos.y - 1; y <= pos.y + 1; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    const dungeon_feature_type old_feature = env.grid(pos);
    const terrain_property_t old_properties = env.pgrid(pos);
    const auto old_mode = trap_mode(you);
    const bool old_runes = rune_locks_disabled(you);
    const bool old_fate = shared_fate(you);
    REQUIRE_FALSE(is_temp_terrain(pos));
    struct restore_web_test
    {
        coord_def pos;
        dungeon_feature_type feature;
        terrain_property_t properties;
        traps mode;
        bool runes;
        bool fate;
        ~restore_web_test()
        {
            revert_terrain_change(pos, TERRAIN_CHANGE_FLOOD, false);
            env.grid(pos) = feature;
            env.pgrid(pos) = properties;
            set_campaign(you, runes, mode, fate);
        }
    } restore{pos, old_feature, old_properties, old_mode, old_runes, old_fate};

    env.grid(pos) = DNGN_FLOOR;
    env.pgrid(pos) &= ~(FPROP_AGRAPHEDE_WEB | FPROP_AGRAPHEDE_WEB_TEMP);
    REQUIRE(place_agraphede_web(pos, true));
    CHECK(env.grid(pos) == DNGN_TRAP_WEB);
    CHECK(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB_TEMP));

    for (const auto mode : {traps::normal, traps::none, traps::floor_only,
                            traps::random_only})
    {
        set_campaign(you, false, mode);
        CHECK_FALSE(floor_trap_suppressed_at(pos));
        CHECK(floor_trap_suppressed(DNGN_TRAP_WEB, false)
              == !floor_traps_enabled(you));
    }

    // Level pgrid is serialized as an integer; both saved bits must survive.
    vector<unsigned char> bytes;
    writer output(&bytes);
    marshallInt(output, env.pgrid(pos).flags);
    reader input(bytes, TAG_MINOR_VERSION);
    terrain_property_t restored;
    restored.flags = unmarshallInt(input);
    CHECK(static_cast<bool>(restored & FPROP_AGRAPHEDE_WEB));
    CHECK(static_cast<bool>(restored & FPROP_AGRAPHEDE_WEB_TEMP));

    // A temporary overlay must not erase the underlying web's provenance.
    temp_change_terrain(pos, DNGN_SHALLOW_WATER, 100, TERRAIN_CHANGE_FLOOD);
    CHECK(env.grid(pos) == DNGN_SHALLOW_WATER);
    REQUIRE(revert_terrain_change(pos, TERRAIN_CHANGE_FLOOD, false));
    CHECK(env.grid(pos) == DNGN_TRAP_WEB);
    CHECK(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB));
    CHECK(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB_TEMP));

    dungeon_terrain_changed(pos, DNGN_FLOOR);
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB));
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB_TEMP));
    REQUIRE(place_agraphede_web(pos, false));
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB_TEMP));
    REQUIRE(feat_is_trap(env.grid(pos)));
    destroy_trap(pos);
    CHECK(env.grid(pos) == DNGN_FLOOR);
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB));
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB_TEMP));
    env.grid(pos) = DNGN_TRAP_WEB;
    set_campaign(you, false, traps::none);
    CHECK(floor_trap_suppressed_at(pos));

    // A web placed on temporary floor vanishes with that floor, rather than
    // leaving a marker that could make a later ordinary web unsuppressed.
    env.grid(pos) = DNGN_ROCK_WALL;
    temp_change_terrain(pos, DNGN_FLOOR, 100, TERRAIN_CHANGE_FLOOD);
    REQUIRE(place_agraphede_web(pos, false));
    REQUIRE(revert_terrain_change(pos, TERRAIN_CHANGE_FLOOD, false));
    CHECK(env.grid(pos) == DNGN_ROCK_WALL);
    CHECK_FALSE(static_cast<bool>(env.pgrid(pos) & FPROP_AGRAPHEDE_WEB));

}

TEST_CASE("Campaign modifier startup tokens", "[game-modifiers]")
{
    player candidate;
    party::configure_from_arg("runelocks=off,traps=random,shared_fate=on");
    party::apply_starting_campaign_modifiers(candidate);
    CHECK(game_modifiers::rune_locks_disabled(candidate));
    CHECK(game_modifiers::trap_mode(candidate) == game_modifiers::traps::random_only);
    CHECK(game_modifiers::shared_fate(candidate));
    party::configure_from_arg("runelocks=on,traps=normal,shared_fate=off");
    party::apply_starting_campaign_modifiers(candidate);
    CHECK_FALSE(game_modifiers::shared_fate(candidate));
}

TEST_CASE("Campaign modifiers survive save serialization", "[game-modifiers]")
{
    player original;
    game_modifiers::set_campaign(original, true, game_modifiers::traps::floor_only, true);
    vector<unsigned char> bytes;
    writer output(&bytes);
    original.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.props.read(input);
    CHECK(game_modifiers::rune_locks_disabled(restored));
    CHECK(game_modifiers::trap_mode(restored) == game_modifiers::traps::floor_only);
    CHECK(game_modifiers::shared_fate(restored));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Campaign rules are shared across the party",
                 "[game-modifiers]")
{
    party::set_player_count(2);
    player& member = party::get_player(1);
    member = you;
    member.save = nullptr;
    you.species = SP_HUMAN;
    you.char_class = JOB_FIGHTER;
    member.species = SP_MINOTAUR;
    member.char_class = JOB_FIGHTER;
    REQUIRE(set_character_trait(you, character_trait::mummy) == trait_restriction::allowed);
    REQUIRE(set_character_trait(member, character_trait::ghost) == trait_restriction::allowed);
    game_modifiers::set_campaign(you, true, game_modifiers::traps::random_only, true);
    party::sync_shared_state_from_active();
    CHECK(game_modifiers::rune_locks_disabled(member));
    CHECK(game_modifiers::trap_mode(member) == game_modifiers::traps::random_only);
    CHECK(game_modifiers::shared_fate(member));
    CHECK(get_character_trait(you) == character_trait::mummy);
    CHECK(get_character_trait(member) == character_trait::ghost);
    member.save = nullptr; // The fixture owns the leader's shared save.
    party::set_player_count(1);
}
