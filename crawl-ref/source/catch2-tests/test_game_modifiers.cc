#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "game-modifiers.h"
#include "character-trait.h"
#include "party.h"
#include "player.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "traps.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Campaign modifier defaults and trap modes",
                 "[game-modifiers]")
{
    using namespace game_modifiers;
    CHECK_FALSE(rune_locks_disabled(you));
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
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_PLATE, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_PASSAGE_OF_GOLUBRIA, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_TELEPORT_PERMANENT, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_TELEPORT, true));
        CHECK_FALSE(floor_trap_suppressed(DNGN_TRAP_SHAFT, true));
        CHECK(floor_trap_suppressed(DNGN_TRAP_TELEPORT, false) == !test.floor);
    }
}

TEST_CASE("Campaign modifier startup tokens", "[game-modifiers]")
{
    player candidate;
    party::configure_from_arg("runelocks=off,traps=random");
    party::apply_starting_campaign_modifiers(candidate);
    CHECK(game_modifiers::rune_locks_disabled(candidate));
    CHECK(game_modifiers::trap_mode(candidate) == game_modifiers::traps::random_only);
    party::configure_from_arg("runelocks=on,traps=normal");
}

TEST_CASE("Campaign modifiers survive save serialization", "[game-modifiers]")
{
    player original;
    game_modifiers::set_campaign(original, true, game_modifiers::traps::floor_only);
    vector<unsigned char> bytes;
    writer output(&bytes);
    original.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.props.read(input);
    CHECK(game_modifiers::rune_locks_disabled(restored));
    CHECK(game_modifiers::trap_mode(restored) == game_modifiers::traps::floor_only);
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
    game_modifiers::set_campaign(you, true, game_modifiers::traps::random_only);
    party::sync_shared_state_from_active();
    CHECK(game_modifiers::rune_locks_disabled(member));
    CHECK(game_modifiers::trap_mode(member) == game_modifiers::traps::random_only);
    CHECK(get_character_trait(you) == character_trait::mummy);
    CHECK(get_character_trait(member) == character_trait::ghost);
    member.save = nullptr; // The fixture owns the leader's shared save.
    party::set_player_count(1);
}
