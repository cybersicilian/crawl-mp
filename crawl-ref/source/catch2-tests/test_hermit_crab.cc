#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "hermit-crab.h"
#include "ability.h"
#include "branch.h"
#include "delay.h"
#include "dungeon.h"
#include "env.h"
#include "mon-util.h"
#include "nearby-danger.h"
#include "player.h"
#include "party.h"
#include "player-equip.h"
#include "status.h"
#include "species.h"
#include "spl-cast.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

namespace
{
struct revival_party_fixture : vellum_fixture
{
    int old_dungeon_depth = brdepth[BRANCH_DUNGEON];
    revival_party_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 1; x < GXM - 1; ++x)
            for (int y = 1; y < GYM - 1; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 20;
        you.religion = GOD_NO_GOD;
        you.set_position(coord_def(40, 35));
        party::set_player_count(2);
        player &other = party::get_player(1);
        other = you;
        other.mid = party::mid_for_slot(1);
        other.your_name = "Crab Companion";
        other.save = nullptr;
        other.set_position(coord_def(42, 35));
    }
    ~revival_party_fixture()
    {
        brdepth[BRANCH_DUNGEON] = old_dungeon_depth;
        party::set_player_downed(1, false);
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
    }
};
}

TEST_CASE_METHOD(revival_party_fixture, "Active Hermit Crab revival restores Crab Walk",
                 "[hermit-crab]")
{
    you.species = SP_HERMIT_CRAB;
    REQUIRE(hermit_crab::break_shell(you));
    you.hp = 0;
    you.pending_revival = true;
    CHECK(you.hp == 0);
    revive();
    CHECK(bring_to_safety());
    CHECK_FALSE(you.pending_revival);
    CHECK(you.hp > 0);
    CHECK(hermit_crab::crab_walk_ready(you));
}

TEST_CASE("Hermit Crab shells grow once per milestone and belong to each hero",
          "[hermit-crab]")
{
    CHECK(species::is_starting_species(SP_HERMIT_CRAB));
    player crab;
    player other;
    crab.species = other.species = SP_HERMIT_CRAB;
    CHECK(hermit_crab::shell_size(crab) == SIZE_MEDIUM);
    CHECK(hermit_crab::armour_bonus(crab) == 6);
    CHECK_FALSE(hermit_crab::grow_shell(crab, 7));
    CHECK(hermit_crab::grow_shell(crab, 8));
    CHECK(hermit_crab::shell_size(crab) == SIZE_LARGE);
    CHECK(hermit_crab::armour_bonus(crab) == 8);
    CHECK_FALSE(hermit_crab::grow_shell(crab, 8));
    CHECK(hermit_crab::shell_size(other) == SIZE_MEDIUM);
    CHECK(hermit_crab::moult_chances(crab) == 0);
    CHECK(hermit_crab::gain_moult_chance(crab, 2));
    CHECK_FALSE(hermit_crab::gain_moult_chance(crab, 2));
    CHECK(hermit_crab::gain_moult_chance(crab, 3));
    CHECK(hermit_crab::moult_chances(crab) == 2);
    CHECK(hermit_crab::moult_chances(other) == 0);

    vector<unsigned char> bytes;
    writer output(&bytes);
    crab.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    other.props.read(input);
    CHECK(hermit_crab::shell_size(other) == SIZE_LARGE);
    CHECK(hermit_crab::moult_chances(other) == 2);
    CHECK_FALSE(hermit_crab::gain_moult_chance(other, 2));
    CHECK_FALSE(hermit_crab::grow_shell(other, 8));
    CHECK(hermit_crab::grow_shell(other, 16));
    CHECK(hermit_crab::shell_size(other) == SIZE_GIANT);
    CHECK_FALSE(hermit_crab::grow_shell(other, 24));
    CHECK(hermit_crab::shell_size(crab) == SIZE_LARGE);
    CHECK(hermit_crab::break_shell(crab));
    CHECK(hermit_crab::shell_size(crab) == SIZE_MEDIUM);
    CHECK(hermit_crab::shell_size(other) == SIZE_GIANT);
    CHECK(hermit_crab::break_shell(crab));
    CHECK(hermit_crab::break_shell(crab));
    CHECK(hermit_crab::break_shell(crab));
    CHECK_FALSE(hermit_crab::break_shell(crab));
    CHECK(hermit_crab::shell_size(crab) == SIZE_TINY);
    other.species = SP_HUMAN;
    CHECK(hermit_crab::armour_bonus(other) == 0);
    CHECK_FALSE(hermit_crab::grow_shell(other, 24));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Hermit Crab shell contributes armour",
                 "[hermit-crab]")
{
    you.species = SP_HUMAN;
    const int baseline = you.armour_class_scaled(100);
    you.species = SP_HERMIT_CRAB;
    CHECK(you.armour_class_scaled(100) == baseline + 600);
    string reason;
    CHECK(get_player_equip_slot_count(SLOT_BODY_ARMOUR, &reason) == 0);
    CHECK(reason.find("shell") != string::npos);
    reason.clear();
    CHECK(get_player_equip_slot_count(SLOT_CLOAK, &reason) == 0);
    CHECK(reason.find("shell") != string::npos);
    CHECK(get_player_equip_slot_count(SLOT_HELMET) > 0);
    status_info status;
    REQUIRE(fill_status_info(STATUS_HERMIT_CRAB_SHELL, status));
    CHECK(status.light_text == "Shell +6");
    CHECK(status.long_text.find("medium shell") != string::npos);
    CHECK(status.long_text.find("3 more times") != string::npos);
    CHECK(status_light_description(status) == status.long_text);
    REQUIRE(hermit_crab::grow_shell(you, 8));
    CHECK(you.armour_class_scaled(100) == baseline + 800);
    REQUIRE(fill_status_info(STATUS_HERMIT_CRAB_SHELL, status));
    CHECK(status.light_text == "Shell +8");
    CHECK(status.long_text.find("large shell") != string::npos);
    you.species = SP_HUMAN;
    CHECK_FALSE(fill_status_info(STATUS_HERMIT_CRAB_SHELL, status));
}

TEST_CASE_METHOD(vellum_fixture, "Growing a shell updates body size and removes ill-fitting gloves",
                 "[hermit-crab]")
{
    you.species = SP_HERMIT_CRAB;
    you.equipment.update();
    CHECK(you.body_size(PSIZE_TORSO, true) == SIZE_MEDIUM);
    carry(0, OBJ_ARMOUR, ARM_GLOVES, false);
    wear(0, SLOT_GLOVES);
    REQUIRE(you.equipment.get_first_slot_item(SLOT_GLOVES));
    REQUIRE(hermit_crab::grow_shell(you, 8));
    CHECK(you.body_size(PSIZE_TORSO, true) == SIZE_LARGE);
    hermit_crab::reconcile_equipment();
    CHECK_FALSE(you.equipment.get_first_slot_item(SLOT_GLOVES));
    CHECK(you.inv[0].defined());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Crab Walk appears briefly after a shell escape",
                 "[hermit-crab]")
{
    you.species = SP_HERMIT_CRAB;
    you.elapsed_time = 100;
    CHECK_FALSE(player_has_ability(ABIL_CRAB_WALK));
    hermit_crab::start_crab_walk(you);
    CHECK_FALSE(player_has_ability(ABIL_CRAB_WALK));
    REQUIRE(hermit_crab::break_shell(you));
    hermit_crab::start_crab_walk(you);
    CHECK(player_has_ability(ABIL_CRAB_WALK));
    CHECK(hermit_crab::crab_walk_remaining(you) == 10 * BASELINE_DELAY);
    status_info status;
    REQUIRE(fill_status_info(STATUS_CRAB_WALK, status));
    CHECK(status.light_text == "Crab Walk 10");
    CHECK(status_light_description(status).find("10 more normal-speed turns")
          != string::npos);
    you.elapsed_time += BASELINE_DELAY + 1;
    REQUIRE(fill_status_info(STATUS_CRAB_WALK, status));
    CHECK(status.light_text == "Crab Walk 9");
    CHECK(hermit_crab::crab_walk_remaining(you) == 9 * BASELINE_DELAY - 1);
    CHECK(ability_name(ABIL_CRAB_WALK) == "Crab Walk");
    CHECK(hermit_crab::crab_walk_shape(coord_def(5, 5), coord_def(7, 6)));
    CHECK(hermit_crab::crab_walk_shape(coord_def(5, 5), coord_def(4, 3)));
    CHECK_FALSE(hermit_crab::crab_walk_shape(coord_def(5, 5), coord_def(7, 7)));
    CHECK_FALSE(hermit_crab::crab_walk_shape(coord_def(5, 5), coord_def(6, 5)));
    you.elapsed_time += 9 * BASELINE_DELAY - 2;
    REQUIRE(fill_status_info(STATUS_CRAB_WALK, status));
    CHECK(status.light_text == "Crab Walk 1");
    CHECK(status_light_description(status).find("1 more normal-speed turn.")
          != string::npos);
    ++you.elapsed_time;
    CHECK_FALSE(player_has_ability(ABIL_CRAB_WALK));
    CHECK(hermit_crab::crab_walk_remaining(you) == 0);
    CHECK_FALSE(fill_status_info(STATUS_CRAB_WALK, status));
    player other;
    other.species = SP_HUMAN;
    other.elapsed_time = you.elapsed_time;
    CHECK(hermit_crab::crab_walk_remaining(other) == 0);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Molting reports opportunities and restores the crab",
                 "[hermit-crab]")
{
    you.species = SP_HERMIT_CRAB;
    CHECK(player_has_ability(ABIL_HERMIT_MOULT));
    CHECK(hermit_crab::moult_reason(you).find("opportunity") != string::npos);
    CHECK(hermit_crab::gain_moult_chance(you, 2));
    CHECK(hermit_crab::moult_reason(you).empty());
    CHECK(make_cost_description(ABIL_HERMIT_MOULT).find("1 available") != string::npos);
    you.hp_max = 50;
    you.hp = 10;
    you.duration[DUR_POISONING] = 20;
    you.duration[DUR_CONF] = 20;
    hermit_crab::finish_moult();
    CHECK(you.hp == 50);
    CHECK(you.duration[DUR_POISONING] == 0);
    CHECK(you.duration[DUR_CONF] == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Molting finishes after four further owner actions",
                 "[hermit-crab]")
{
    init_monsters();
    dgn_reset_level(false);
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.species = SP_HERMIT_CRAB;
    you.religion = GOD_NO_GOD;
    you.hp_max = 50;
    you.hp = 10;
    you.on_current_level = true;
    REQUIRE(hermit_crab::gain_moult_chance(you, 2));
    REQUIRE(hermit_crab::begin_moult() == spret::success);
    REQUIRE(current_delay());
    CHECK(hermit_crab::moult_chances(you) == 0);
    const auto delay = current_delay();
    SECTION("completion consumes four owner actions")
    {
        for (int action = 0; action < 4; ++action)
        {
            you.time_taken = 0;
            you.turn_is_over = false;
            delay->handle();
            CHECK(you.time_taken == BASELINE_DELAY);
            CHECK(you.turn_is_over);
            CHECK(you.hp == (action == 3 ? 50 : 10));
        }
    }
    SECTION("interruption does not grant recovery")
    {
        delay->handle();
        CHECK(delay->try_interrupt(true));
        CHECK(you.hp == 10);
        CHECK(hermit_crab::moult_chances(you) == 0);
    }
    you.delay_queue.clear();
    dgn_reset_level(false);
}
