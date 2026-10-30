#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "monster-type.h"
#include "player.h"
#include "player-equip.h"
#include "test_player_fixture.h"

TEST_CASE("Curated item types have the intended names and restrictions", "[port-item-bits]")
{
    CHECK(string(jewellery_effect_name(RING_ELEC_RESISTANCE)) == "insulation");
    CHECK_FALSE(jewellery_is_amulet(RING_ELEC_RESISTANCE));
    CHECK(string(brand_type_name(SPWPN_SEEKING, false)) == "seeking");
    CHECK(is_weapon_brand_ok(WPN_SHORTBOW, SPWPN_SEEKING, true));
    CHECK(is_weapon_brand_ok(WPN_LONGBOW, SPWPN_SEEKING, true));
    CHECK_FALSE(is_weapon_brand_ok(WPN_ARBALEST, SPWPN_SEEKING, true));
    CHECK_FALSE(is_weapon_brand_ok(WPN_DAGGER, SPWPN_SEEKING, true));
    CHECK(is_armour_brand_ok(ARM_SCARF, SPARM_STASIS, true));
    CHECK_FALSE(is_armour_brand_ok(ARM_ROBE, SPARM_STASIS, true));
    CHECK(is_armour_brand_ok(ARM_ROBE, SPARM_MANA_REGEN, true));
    CHECK_FALSE(is_armour_brand_ok(ARM_PLATE_ARMOUR, SPARM_MANA_REGEN, true));
    CHECK(hide_for_monster(MONS_IRON_DRAGON) == ARM_IRON_DRAGON_ARMOUR);
    CHECK(monster_for_hide(ARM_IRON_DRAGON_ARMOUR) == MONS_IRON_DRAGON);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Insulation, stasis and magic recovery apply while equipped",
                 "[port-item-bits]")
{
    you.species = SP_HUMAN;
    you.max_magic_points = 20;
    const int base_regen = player_mp_regen();
    const int base_elec = player_res_electricity(false, false);
    const auto equip = [](int slot, object_class_type base, int subtype,
                          int brand, equipment_slot equipment)
    {
        item_def &item = you.inv[slot];
        item.clear();
        item.base_type = base;
        item.sub_type = subtype;
        item.brand = brand;
        item.quantity = 1;
        item.link = slot;
        item.pos = ITEM_IN_INVENTORY;
        you.equipment.add(item, equipment);
        you.equipment.update();
    };
    equip(0, OBJ_JEWELLERY, RING_ELEC_RESISTANCE, 0, SLOT_RING);
    CHECK(player_res_electricity(false, false) == std::min(1, base_elec + 1));
    equip(1, OBJ_ARMOUR, ARM_SCARF, SPARM_STASIS, SLOT_CLOAK);
    CHECK(you.stasis());
    equip(2, OBJ_ARMOUR, ARM_ROBE, SPARM_MANA_REGEN, SLOT_BODY_ARMOUR);
    CHECK(player_mp_regen() == base_regen * 2);
}
