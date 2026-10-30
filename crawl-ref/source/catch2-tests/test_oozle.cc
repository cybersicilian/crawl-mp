#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "env.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "mutation.h"
#include "player.h"
#include "player-equip.h"
#include "species.h"
#include "test_player_fixture.h"
#include "transform.h"
#ifdef USE_TILE
#include "tile-player-flag-cut.h"
#include "tiledoll.h"
#include "tilepick.h"
#include "tilepick-p.h"
#include "rltiles/tiledef-player.h"
#endif

namespace
{
void setup_oozle()
{
    you.species = SP_OOZLE;
    you.experience_level = 1;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(SP_OOZLE);
    you.equipment.update();
    you.set_position(coord_def(GXM / 2, GYM / 2));
    env.grid(you.pos()) = DNGN_FLOOR;
}
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Oozles retain ordinary weapons shields and jewellery",
                 "[oozle][equipment-profile]")
{
    setup_oozle();
    REQUIRE(species::is_starting_species(SP_OOZLE));
    CHECK(string(species::get_abbrev(SP_OOZLE)) == "Oz");
    CHECK(species::from_str("Oozle") == SP_OOZLE);
    CHECK(you.body_size(PSIZE_TORSO) == SIZE_MEDIUM);
    CHECK(species::get_hp_modifier(SP_OOZLE) == -1);
    CHECK(get_player_equip_slot_count(SLOT_WEAPON) == 1);
    CHECK(get_player_equip_slot_count(SLOT_OFFHAND) == 1);
    CHECK(get_player_equip_slot_count(SLOT_RING) == 2);
    CHECK(get_player_equip_slot_count(SLOT_AMULET) == 1);
    CHECK(player_can_use_armour()); // Held shields remain in OBJ_ARMOUR.
    for (const auto slot : { SLOT_BODY_ARMOUR, SLOT_GLOVES,
                            SLOT_BOOTS, SLOT_BARDING })
    {
        string reason;
        CAPTURE(static_cast<int>(slot));
        CHECK(get_player_equip_slot_count(slot, &reason) == 0);
        CHECK_FALSE(reason.empty());
    }
    for (const char* name : { "dagger", "quarterstaff", "great sword",
         "buckler", "kite shield", "ring of protection", "amulet of reflection",
         "hat", "scarf" })
    {
        CAPTURE(name);
        item_def item;
        REQUIRE(get_item_by_exact_name(item, name));
        CHECK(can_equip_item(item, true));
    }
    for (const char* name : { "robe", "animal skin", "troll leather armour",
         "fire dragon scales", "plate armour", "helmet", "cloak",
         "pair of gloves", "pair of boots", "giant spiked club" })
    {
        CAPTURE(name);
        item_def item;
        REQUIRE(get_item_by_exact_name(item, name));
        CHECK_FALSE(can_equip_item(item, true));
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Armour capability distinguishes shields from worn armour",
                 "[oozle][equipment-profile]")
{
    setup_oozle();
    REQUIRE(player_can_use_armour());
    you.mutation[MUT_NO_GRASPING] = 1;
    you.equipment.update();
    CHECK(player_can_use_armour()); // Hats/scarves do not require hands.
    you.mutation[MUT_NO_GRASPING] = 0;
    you.equipment.update();
    CHECK(player_can_use_armour());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Oozle gel gains protection at level thirteen",
                 "[oozle]")
{
    setup_oozle();
    for (int xl = 1; xl <= 27; ++xl)
    {
        you.experience_level = xl;
        if (xl > 1)
            give_level_mutations(SP_OOZLE, xl);
        const int gel = xl < 13 ? 2 : 3;
        CAPTURE(xl);
        CHECK(you.get_mutation_level(MUT_GELATINOUS_BODY) == gel);
        CHECK(you.armour_class_scaled(1) == gel);
        const int evasion = you.evasion_scaled(100);
        you.mutation[MUT_GELATINOUS_BODY] = 0;
        you.innate_mutation[MUT_GELATINOUS_BODY] = 0;
        CHECK(evasion - you.evasion_scaled(100) == 100 * gel);
        you.mutation[MUT_GELATINOUS_BODY] = gel;
        you.innate_mutation[MUT_GELATINOUS_BODY] = gel;
        CHECK(player_movement_speed() == BASELINE_DELAY);
        CHECK(player_speed() == BASELINE_DELAY);
    }
    CHECK(you.res_poison() == 1);
    CHECK(you.res_corr() == 1);
    CHECK(you.res_fire() == -1);
    CHECK(you.res_cold() == 0);
    CHECK_FALSE(you.can_swim());
    CHECK_FALSE(you.is_nonliving());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Amorphous bodies reject native nets webs and constriction",
                 "[oozle]")
{
    setup_oozle();
    REQUIRE(you.has_innate_mutation(MUT_AMORPHOUS_BODY));
    CHECK(you.is_amorphous());
    CHECK(you.res_constrict());
    CHECK(you.is_web_immune());
    CHECK_FALSE(you.trap_in_web());
    CHECK_FALSE(you.trap_in_net(false, true));
    CHECK_FALSE(you.caught());

    you.form = transformation::bat;
    CHECK_FALSE(you.has_mutation(MUT_AMORPHOUS_BODY));
    CHECK_FALSE(you.is_amorphous());
    CHECK_FALSE(you.is_web_immune());
    CHECK_FALSE(you.res_constrict());

    you.form = transformation::statue;
    CHECK_FALSE(you.has_mutation(MUT_AMORPHOUS_BODY));
    CHECK_FALSE(you.has_mutation(MUT_GELATINOUS_BODY));
    CHECK_FALSE(you.is_amorphous());

    // These forms keep their own native amorphousness, even though the
    // mutation is suppressed. Returning restores the species' anatomy.
    for (const auto form : { transformation::jelly, transformation::aqua,
                            transformation::none })
    {
        you.form = form;
        CHECK(you.is_amorphous());
        CHECK(you.res_constrict());
        CHECK_FALSE(you.trap_in_web());
        CHECK_FALSE(you.trap_in_net(false, true));
    }
    CHECK(you.has_mutation(MUT_AMORPHOUS_BODY));
    CHECK(you.get_mutation_level(MUT_GELATINOUS_BODY) == 2);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Amorphous anatomy is reusable without changing species",
                 "[oozle]")
{
    REQUIRE(you.species == SP_HUMAN);
    CHECK_FALSE(you.is_amorphous());
    CHECK_FALSE(you.res_constrict());
    CHECK_FALSE(you.is_web_immune());
    you.mutation[MUT_AMORPHOUS_BODY] = 1;
    CHECK(you.is_amorphous());
    CHECK(you.res_constrict());
    CHECK_FALSE(you.trap_in_web());
    CHECK_FALSE(you.trap_in_net(false, true));
    you.mutation[MUT_AMORPHOUS_BODY] = 0;
    CHECK_FALSE(you.is_amorphous());
    CHECK_FALSE(you.res_constrict());
    CHECK_FALSE(you.is_web_immune());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Oozle descriptions name gel and pseudopods",
                 "[oozle]")
{
    setup_oozle();
    CHECK_FALSE(species::has_blood(SP_OOZLE));
    CHECK_FALSE(species::has_bones(SP_OOZLE));
    CHECK_FALSE(species::has_feet(SP_OOZLE));
    CHECK_FALSE(species::has_ears(SP_OOZLE));
    CHECK_FALSE(species::has_hair(SP_OOZLE));
    CHECK(species::skin_name(SP_OOZLE) == "gel");
    CHECK(species::arm_name(SP_OOZLE) == "pseudopod");
    CHECK(you.hand_name(true) == "pseudopods");
    CHECK(you.foot_name(true) == "puddle");
    CHECK(you.unarmed_attack_name() == "Pseudopods");
}

#ifdef USE_TILE
TEST_CASE("Oozle dolls preserve held equipment without humanoid clothes",
          "[oozle]")
{
    CHECK(tilep_species_to_base_tile(SP_OOZLE, 1) == TILEP_BASE_OOZLE);
    CHECK(tileidx_player_species(SP_OOZLE, false) != TILEP_ERROR);
    CHECK(tileidx_player_species(SP_OOZLE, true) != TILEP_ERROR);
    dolls_data doll;
    for (int part = 0; part < TILEP_PART_MAX; ++part)
        doll.parts[part] = 0;
    doll.parts[TILEP_PART_BASE] = TILEP_BASE_OOZLE;
    int flags[TILEP_PART_MAX];
    tilep_calc_flags(doll, flags);
    for (const auto part : { TILEP_PART_BOOTS,
         TILEP_PART_LEG, TILEP_PART_BODY, TILEP_PART_ARM,
         TILEP_PART_HAIR, TILEP_PART_BEARD, TILEP_PART_SHADOW, TILEP_PART_DRCWING })
    {
        CAPTURE(static_cast<int>(part));
        CHECK(flags[part] == TILEP_FLAG_HIDE);
    }
    CHECK(flags[TILEP_PART_HELM] == TILEP_FLAG_NORMAL);
    CHECK(flags[TILEP_PART_CLOAK] == TILEP_FLAG_NORMAL);
    CHECK(flags[TILEP_PART_BASE] == TILEP_FLAG_NORMAL);
    CHECK(flags[TILEP_PART_HAND1] == TILEP_FLAG_NORMAL);
    CHECK(flags[TILEP_PART_HAND2] == TILEP_FLAG_NORMAL);
}
#endif

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Oozle unarmed attacks use native acid without branding weapons",
                 "[oozle]")
{
    setup_oozle();
    CHECK(you.damage_brand(nullptr) == SPWPN_ACID);
    item_def weapon;
    REQUIRE(get_item_by_exact_name(weapon, "dagger"));
    CHECK(you.damage_brand(&weapon) == SPWPN_NORMAL);
    you.form = transformation::bat;
    CHECK_FALSE(you.has_mutation(MUT_ACIDIC_TOUCH));
    CHECK(you.damage_brand(nullptr) == get_form()->get_uc_brand());
    you.form = transformation::none;
    CHECK(you.damage_brand(nullptr) == SPWPN_ACID);
}
