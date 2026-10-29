#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam-type.h"
#include "env.h"
#include "feature.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "mutation.h"
#include "ouch.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "species.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "transform.h"
#ifdef USE_TILE
#include "tilepick.h"
#include "tilepick-p.h"
#include "rltiles/tiledef-player.h"
#endif

namespace
{
void setup_tortle()
{
    you.species = SP_TORTLE;
    init_show_table();
    you.experience_level = 1;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(SP_TORTLE);
    you.equipment.update();
    you.set_position(coord_def(GXM / 2, GYM / 2));
    env.grid(you.pos()) = DNGN_FLOOR;
}
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Tortles use standard large equipment and weapon rules",
                 "[tortle]")
{
    setup_tortle();
    REQUIRE(species::is_starting_species(SP_TORTLE));
    CHECK(string(species::get_abbrev(SP_TORTLE)) == "To");
    CHECK(you.body_size(PSIZE_TORSO) == SIZE_LARGE);
    CHECK(species::can_throw_large_rocks(SP_TORTLE));
    CHECK(species::get_hp_modifier(SP_TORTLE) == 1);
    CHECK(get_player_equip_slot_count(SLOT_GLOVES) == 0);
    CHECK(get_player_equip_slot_count(SLOT_BOOTS) == 0);

    for (const char* name : {"robe", "animal skin", "troll leather armour",
                             "fire dragon scales", "hat", "cloak", "kite shield",
                             "tower shield", "giant spiked club"})
    {
        CAPTURE(name);
        item_def item;
        REQUIRE(get_item_by_exact_name(item, name));
        CHECK(can_equip_item(item, true));
    }
    for (const char* name : {"leather armour", "ring mail", "scale mail",
                             "chain mail", "plate armour", "crystal plate armour",
                             "helmet", "pair of gloves", "pair of boots"})
    {
        CAPTURE(name);
        item_def item;
        REQUIRE(get_item_by_exact_name(item, name));
        CHECK_FALSE(can_equip_item(item, true));
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Tortle shells grow without slowing other actions",
                 "[tortle]")
{
    setup_tortle();
    REQUIRE(you.has_innate_mutation(MUT_ARMOURED_SHELL));
    CHECK(you.armour_class_scaled(1) == 6);
    CHECK(get_mutation_desc(MUT_ARMOURED_SHELL).find("heavy shell") != string::npos);
    CHECK(get_mutation_desc(MUT_ARMOURED_SHELL).find("Shapeshifting") == string::npos);
    CHECK(player_speed() == BASELINE_DELAY);
    CHECK(player_movement_speed() == 13);
    int previous = 6;
    for (int xl = 1; xl <= 27; ++xl)
    {
        you.experience_level = xl;
        const int armour = you.armour_class_scaled(1);
        CAPTURE(xl, armour);
        CHECK(armour >= previous);
        CHECK(armour <= 18);
        CHECK(player_movement_speed() == 13);
        previous = armour;
    }
    CHECK(previous == 18);

    // A changed body loses both aspects of its shell, then regains them.
    you.form = transformation::bat;
    CHECK_FALSE(you.has_mutation(MUT_ARMOURED_SHELL));
    CHECK(you.ac_changes_from_mutations() == 0);
    CHECK(player_movement_speed() == FASTEST_PLAYER_MOVE_SPEED);
    you.form = transformation::none;
    CHECK(you.armour_class_scaled(1) == 18);
    CHECK(player_movement_speed() == 13);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Tortles swim without water speed or evasion bonuses",
                 "[tortle]")
{
    setup_tortle();
    REQUIRE(you.can_swim());
    CHECK_FALSE(you.has_mutation(MUT_NIMBLE_SWIMMER));
    const int dry_evasion = you.evasion_scaled(100);
    for (const auto terrain : {DNGN_SHALLOW_WATER, DNGN_DEEP_WATER})
    {
        CAPTURE(static_cast<int>(terrain));
        env.grid(you.pos()) = terrain;
        CHECK(you.can_pass_through_feat(terrain));
        CHECK(you.is_habitable(you.pos()));
        CHECK_FALSE(you.slow_in_water());
        CHECK(player_movement_speed() == 13);
        CHECK(you.evasion_scaled(100) == dry_evasion);
    }
    env.grid(you.pos()) = DNGN_FLOOR;
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Cold resistance protects a cold-blooded Tortle from slowing",
                 "[tortle]")
{
    setup_tortle();
    REQUIRE(you.has_innate_mutation(MUT_COLD_BLOODED));
    rng::subgenerator cold_attacks(0x544f52544c45ULL);
    CHECK(you.res_cold() == 0);
    bool slowed = false;
    for (int attempt = 0; attempt < 64; ++attempt)
    {
        you.duration[DUR_SLOW] = 0;
        expose_player_to_element(BEAM_COLD, 10);
        slowed |= you.duration[DUR_SLOW] > 0;
    }
    CHECK(slowed);
    you.mutation[MUT_COLD_RESISTANCE] = 1;
    REQUIRE(you.res_cold() > 0);
    you.duration[DUR_SLOW] = 0;
    for (int attempt = 0; attempt < 64; ++attempt)
        expose_player_to_element(BEAM_COLD, 10);
    CHECK(you.duration[DUR_SLOW] == 0);
}

#ifdef USE_TILE
TEST_CASE("Tortles have species and player tiles", "[tortle]")
{
    CHECK(tilep_species_to_base_tile(SP_TORTLE, 1) == TILEP_BASE_TORTLE);
    CHECK(tileidx_player_species(SP_TORTLE, false) != TILEP_ERROR);
    CHECK(tileidx_player_species(SP_TORTLE, true) != TILEP_ERROR);
}
#endif
