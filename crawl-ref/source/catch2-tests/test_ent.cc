#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "character-trait.h"
#include "directn.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "map-knowledge.h"
#include "mon-util.h"
#include "mutation.h"
#include "ng-restr.h"
#include "newgame-def.h"
#include "player.h"
#include "player-equip.h"
#include "species.h"
#include "spl-book.h"
#include "spl-other.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#include "transform.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ent bark, slow actions and innate protections", "[ent]")
{
    you.species = SP_HUMAN;
    you.experience_level = 1;
    const int baseline_speed = player_speed(10);
    const int baseline_ac = you.armour_class_scaled(100);
    you.species = SP_ENT;
    CHECK(species::is_starting_species(you.species));
    give_basic_mutations(you.species);
    CHECK(player_speed(10) == baseline_speed * 14 / 10);
    const auto& descriptions = species::fake_mutations(SP_ENT, false);
    CHECK(find(descriptions.begin(), descriptions.end(),
               "Your movement and actions take 40 percent longer.") != descriptions.end());
    CHECK(you.armour_class_scaled(100) == baseline_ac + 800);
    CHECK(you.is_unbreathing());
    CHECK(you.res_torment());
    CHECK(you.get_innate_mutation_level(MUT_POISON_RESISTANCE) == 1);
    CHECK(you.get_innate_mutation_level(MUT_NEGATIVE_ENERGY_RESISTANCE) == 3);
    CHECK(species::size(SP_ENT) == SIZE_LARGE);
    CHECK_FALSE(species::has_feet(SP_ENT));
    CHECK(player_has_ability(ABIL_ENT_PASSWALL));
    CHECK(ability_mp_cost(ABIL_ENT_PASSWALL) == 1);
    CHECK_FALSE(character_is_allowed(SP_ENT, JOB_SHAPESHIFTER));
    CHECK_FALSE(character_is_allowed(SP_ENT, JOB_STALKER));
    if (species::is_starting_species(SP_ENT))
    {
        newgame_def ng;
        ng.species = SP_ENT;
        ng.job = JOB_FIGHTER;
        CHECK(weapon_restriction(WPN_QUARTERSTAFF, ng) != CC_BANNED);
    }
    CHECK(cant_transform_reason(transformation::dragon, false, true).find("rooted") != string::npos);
    string reason;
    CHECK(get_player_equip_slot_count(SLOT_BODY_ARMOUR, &reason) == 0);
    CHECK(reason.find("bark") != string::npos);
    reason.clear();
    CHECK(get_player_equip_slot_count(SLOT_BOOTS, &reason) == 0);
    CHECK(reason.find("roots") != string::npos);
    you.experience_level = 10;
    CHECK(you.armour_class_scaled(100) == baseline_ac + 1700);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Ents retain plant holiness unless an undead trait overrides it", "[ent]")
{
    you.species = SP_HUMAN;
    CHECK(you.holiness() == MH_NATURAL);
    you.species = SP_VINE_STALKER;
    CHECK(you.holiness() == MH_PLANT);
    you.species = SP_ENT;
    CHECK(you.holiness() == MH_PLANT);
    you.char_class = JOB_FIGHTER;
    REQUIRE(set_character_trait(you, character_trait::ghost) == trait_restriction::allowed);
    CHECK(you.holiness() == MH_UNDEAD);
    REQUIRE(set_character_trait(you, character_trait::none) == trait_restriction::allowed);
    CHECK(you.holiness() == MH_PLANT);
}

TEST_CASE_METHOD(vellum_fixture, "Ent branches wield a two-handed weapon with a shield", "[ent]")
{
    you.species = SP_ENT;
    you.equipment.update();
    auto& axe = carry(0, OBJ_WEAPONS, WPN_BATTLEAXE, false);
    auto& club = carry(1, OBJ_WEAPONS, WPN_GIANT_CLUB, false);
    CHECK(you.hands_reqd(axe) == HANDS_ONE);
    CHECK(you.hands_reqd(club) == HANDS_TWO);
    carry(2, OBJ_ARMOUR, ARM_KITE_SHIELD, false);
    wear(2, SLOT_OFFHAND);
    CHECK(you.shield());
    CHECK(can_equip_item(axe));
    wear(0, SLOT_WEAPON);
    CHECK(you.weapon() == &axe);
    CHECK(you.shield());
}

TEST_CASE_METHOD(vellum_fixture, "Ent innate Passwall traverses trees for one MP", "[ent]")
{
    init_spell_descs();
    init_monsters();
    dgn_reset_level(false);
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.set_position(coord_def(40, 35));
    you.on_current_level = true;
    you.current_vision = you.normal_vision = 7;
    you.species = SP_ENT;
    you.religion = GOD_NO_GOD;
    you.magic_points = you.max_magic_points = 5;
    const coord_def wall(41, 35);
    const coord_def destination(42, 35);
    env.grid(wall) = DNGN_TREE;
    set_terrain_seen(wall);
    set_terrain_seen(destination);
    CHECK(passwall_simplified_check(you));
    passwall_path route(you, coord_def(1, 0), 3);
    CHECK(route.is_valid(nullptr));
    you.species = SP_HUMAN;
    CHECK_FALSE(passwall_simplified_check(you));
    you.species = SP_ENT;
    dist target;
    target.isValid = true;
    target.isTarget = true;
    target.target = wall;
    REQUIRE(activate_talent(get_talent(ABIL_ENT_PASSWALL), &target));
    CHECK(you.magic_points == 4);
    CHECK_FALSE(you.delay_queue.empty());
    CHECK(you.props.exists(PASSWALL_ARMOUR_KEY));
}
