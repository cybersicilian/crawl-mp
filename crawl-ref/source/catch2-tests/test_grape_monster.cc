#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "artefact.h"
#include "directn.h"
#include "dungeon.h"
#include "env.h"
#include "grape-monster.h"
#include "item-prop.h"
#include "mon-util.h"
#include "mon-info.h"
#include "monster.h"
#include "test_vellum_fixture.h"

namespace
{
struct grape_monster_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    grape_monster_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
    }
    ~grape_monster_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
    }
    monster& wearer()
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_ORC;
        mon.mid = 51999;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(4);
        mon.set_position(you.pos() + coord_def(1, 0));
        env.mgrid(mon.pos()) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
    item_def& equip(monster& mon, mon_inv_type slot, int index, int subtype)
    {
        item_def& item = env.item[index];
        item.clear();
        item.base_type = OBJ_ARMOUR;
        item.sub_type = subtype;
        item.quantity = 1;
        mon.inv[slot] = index;
        return item;
    }
};
}

TEST_CASE_METHOD(grape_monster_fixture, "Grape melding removes and restores monster armour effects",
                 "[grape][monster-equipment]")
{
    monster& mon = wearer();
    item_def& armour = equip(mon, MSLOT_ARMOUR, 0, ARM_FIRE_DRAGON_ARMOUR);
    armour.plus = 4;
    REQUIRE(make_item_randart(armour, true));
    for (int i = 0; i < ART_PROPERTIES; ++i)
        artefact_set_property(armour, static_cast<artefact_prop_type>(i), 0);
    artefact_set_property(armour, ARTP_POISON, 1);
    item_def& shield = equip(mon, MSLOT_SHIELD, 1, ARM_KITE_SHIELD);
    shield.plus = 3;
    const int ac = mon.armour_class();
    const int ev = mon.evasion(false);
    const int sh = mon.shield_class();
    const int fire = mon.res_fire();
    const int poison = mon.res_poison();
    REQUIRE(sh > 0);
    REQUIRE(poison > 0);
    REQUIRE(grape_monster::suppress(mon, MSLOT_ARMOUR));
    REQUIRE(grape_monster::suppress(mon, MSLOT_SHIELD));
    CHECK(mon.mslot_item(MSLOT_ARMOUR) == &armour);
    CHECK(mon.mslot_item(MSLOT_SHIELD) == &shield);
    CHECK(mon.armour_class() < ac);
    CHECK(mon.evasion(false) >= ev);
    CHECK(mon.shield_class() < sh);
    CHECK(mon.res_fire() < fire);
    CHECK(mon.res_poison() < poison);
    const monster_info melded(&mon);
    CHECK(melded.props.exists("grape_body_melded"));
    CHECK(melded.props.exists("grape_shield_melded"));
    CHECK(get_monster_equipment_desc(melded, DESC_FULL).find("(melded)")
          != string::npos);
    CHECK_FALSE(grape_monster::suppress(mon, MSLOT_ARMOUR));
    REQUIRE(grape_monster::restore(mon, MSLOT_ARMOUR));
    REQUIRE(grape_monster::restore(mon, MSLOT_SHIELD));
    CHECK(mon.armour_class() == ac);
    CHECK(mon.evasion(false) == ev);
    CHECK(mon.shield_class() == sh);
    CHECK(mon.res_fire() == fire);
    CHECK(mon.res_poison() == poison);
}

TEST_CASE_METHOD(grape_monster_fixture, "Grape suppression follows the item, not a replacement",
                 "[grape][monster-equipment]")
{
    monster& mon = wearer();
    item_def& original = equip(mon, MSLOT_ARMOUR, 0, ARM_ROBE);
    REQUIRE(grape_monster::suppress(mon, MSLOT_ARMOUR));
    REQUIRE(grape_monster::suppressed(mon, MSLOT_ARMOUR));
    item_def& replacement = equip(mon, MSLOT_ARMOUR, 1, ARM_PLATE_ARMOUR);
    CHECK_FALSE(grape_monster::suppressed(mon, MSLOT_ARMOUR));
    CHECK(grape_monster::effective_item(mon, MSLOT_ARMOUR) == &replacement);
    CHECK_FALSE(grape_monster::restore(mon, MSLOT_ARMOUR));
    mon.inv[MSLOT_ARMOUR] = 0;
    CHECK(grape_monster::effective_item(mon, MSLOT_ARMOUR) == &original);
    CHECK_FALSE(grape_monster::suppress(mon, MSLOT_WEAPON));
}

TEST_CASE_METHOD(grape_monster_fixture, "Grape melding suppresses auxiliary armour by item identity",
                 "[grape][monster-equipment]")
{
    monster& mon = wearer();
    item_def& gloves = equip(mon, MSLOT_AUX_ARMOUR, 0, ARM_GLOVES);
    gloves.plus = 4;
    REQUIRE(make_item_randart(gloves, true));
    for (int i = 0; i < ART_PROPERTIES; ++i)
        artefact_set_property(gloves, static_cast<artefact_prop_type>(i), 0);
    artefact_set_property(gloves, ARTP_POISON, 1);
    item_def& shield = equip(mon, MSLOT_SHIELD, 1, ARM_KITE_SHIELD);
    REQUIRE(make_item_randart(shield, true));
    for (int i = 0; i < ART_PROPERTIES; ++i)
        artefact_set_property(shield, static_cast<artefact_prop_type>(i), 0);
    artefact_set_property(shield, ARTP_FIRE, 1);
    const int ac = mon.armour_class();
    const int sh = mon.shield_class();
    const int poison = mon.res_poison();
    REQUIRE(poison > 0);
    REQUIRE(grape_monster::suppress(mon, MSLOT_AUX_ARMOUR));
    CHECK(mon.mslot_item(MSLOT_AUX_ARMOUR) == &gloves);
    CHECK(mon.armour_class() < ac);
    CHECK(mon.shield_class() == sh);
    CHECK(mon.res_poison() < poison);
    const monster_info melded(&mon);
    CHECK(melded.props.exists("grape_aux_melded"));
    CHECK_FALSE(melded.props.exists("grape_shield_melded"));
    REQUIRE(melded.inv[MSLOT_SHIELD]);
    CHECK(melded.randarts(ARTP_FIRE) == 1);
    CHECK(melded.randarts(ARTP_POISON) == 0);
    CHECK(get_monster_equipment_desc(melded, DESC_FULL).find("(melded)")
          != string::npos);
    REQUIRE(grape_monster::restore(mon, MSLOT_AUX_ARMOUR));
    CHECK(mon.armour_class() == ac);
    CHECK(mon.res_poison() == poison);
    const monster_info restored(&mon);
    CHECK(restored.randarts(ARTP_POISON) == 1);
    REQUIRE(grape_monster::suppress(mon, MSLOT_AUX_ARMOUR));
    item_def& replacement = equip(mon, MSLOT_AUX_ARMOUR, 2, ARM_BOOTS);
    CHECK_FALSE(grape_monster::suppressed(mon, MSLOT_AUX_ARMOUR));
    CHECK(grape_monster::effective_item(mon, MSLOT_AUX_ARMOUR) == &replacement);
}
