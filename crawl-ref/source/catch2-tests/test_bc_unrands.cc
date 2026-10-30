#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "artefact.h"
#include "art-enum.h"
#include "item-prop.h"
#include "player-equip.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Thunder wraps preserve claws and brand only unarmed attacks",
                 "[bc-unrands]")
{
    you.religion = GOD_NO_GOD;
    you.mutation[MUT_CLAWS] = 2;
    you.equipment.update();
    item_def& wraps = unique(0, UNRAND_FISTS_OF_THUNDER);
    item_def& gloves = carry(1, OBJ_ARMOUR, ARM_GLOVES, false);
    CHECK(can_equip_item(wraps, true));
    CHECK(can_equip_item(gloves, true));

    wear(0, SLOT_GLOVES);
    CHECK(you.has_usable_claws());
    CHECK(you.damage_brand(nullptr) == SPWPN_ELECTROCUTION);
    CHECK(you.unarmed_attack_name("Fists").find("(elec)") != string::npos);

    item_def& sword = carry(2, OBJ_WEAPONS, WPN_LONG_SWORD, false);
    CHECK(you.damage_brand(&sword) == SPWPN_NORMAL);
}

TEST_CASE_METHOD(vellum_fixture, "Huge claws still block the ordinary glove slot",
                 "[bc-unrands]")
{
    you.religion = GOD_NO_GOD;
    you.mutation[MUT_CLAWS] = 3;
    you.equipment.update();
    item_def& wraps = unique(0, UNRAND_FISTS_OF_THUNDER);
    item_def& gloves = carry(1, OBJ_ARMOUR, ARM_GLOVES, false);
    CHECK_FALSE(can_equip_item(wraps, true));
    CHECK_FALSE(can_equip_item(gloves, true));
    CHECK(get_player_equip_slot_count(SLOT_GLOVES) == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Imported unrands keep distinct identities and effects",
                 "[bc-unrands]")
{
    // The historical end marker had a serialized identity too. Keep it in
    // place and add new identities only after it.
    CHECK(UNRAND_DUMMY2 == 340);
    CHECK(UNRAND_FISTS_OF_THUNDER == 341);
    CHECK(get_unrand_entry(UNRAND_DUMMY2)->flags & UNRAND_FLAG_DELETED);
    item_def& scorpio = unique(0, UNRAND_SCORPIO);
    item_def& butterfly = unique(1, UNRAND_BUTTERFLY_SWORD);
    item_def& staff = unique(2, UNRAND_SPECTRAL_BATTLE_STAFF);
    CHECK(scorpio.sub_type == WPN_HAND_CANNON);
    CHECK(butterfly.sub_type == WPN_GREAT_SWORD);
    CHECK(staff.sub_type == WPN_LAJATANG);
    CHECK(get_weapon_brand(staff) == SPWPN_SPECTRAL);
    CHECK(get_unrand_entry(UNRAND_BUTTERFLY_SWORD)->melee_effects != nullptr);
    CHECK(get_unrand_entry(UNRAND_SPECTRAL_BATTLE_STAFF)->world_reacts_func != nullptr);
    CHECK(get_unrand_entry(UNRAND_SPECTRAL_BATTLE_STAFF)->unequip_func != nullptr);
    CHECK(UNRAND_SPECTRAL_BATTLE_STAFF != UNRAND_BATTLE);
}
