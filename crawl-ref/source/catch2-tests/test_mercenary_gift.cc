#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "dungeon.h"
#include "env.h"
#include "mercenary-gift.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "test_vellum_fixture.h"

namespace
{
struct mercenary_gift_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    mercenary_gift_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.on_current_level = true;
    }
    ~mercenary_gift_fixture()
    {
        party::set_multiplayer(false);
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
    }

    monster& hire(monster_type type)
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = type;
        mon.mid = 30123;
        mon.hit_points = mon.max_hit_points = 100;
        mon.base_attitude = ATT_FRIENDLY;
        mon.set_position(you.pos() + coord_def(1, 0));
        env.mgrid(mon.pos()) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        mon.props["mercenary"] = true;
        mon.props["mercenary_owner_mid"] = static_cast<int>(you.mid);
        return mon;
    }
};
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "A witch accepts their owner's staff and changes spells",
                 "[mercenary-gift]")
{
    monster& witch = hire(MONS_MERC_WITCH);
    item_def& staff = carry(0, OBJ_STAVES, STAFF_FIRE, false);
    staff.plus = 3;
    REQUIRE(mercenary::can_receive_item(witch, staff));
    REQUIRE(mercenary::give_item(witch, 0));
    CHECK_FALSE(you.inv[0].defined());
    REQUIRE(witch.mslot_item(MSLOT_WEAPON));
    CHECK(witch.mslot_item(MSLOT_WEAPON)->plus == 3);
    REQUIRE(witch.spells.size() == 1);
    CHECK(witch.spells[0].spell == SPELL_THROW_FLAME);
    CHECK(witch.props.exists(CUSTOM_SPELLS_KEY));
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "A mercenary refuses another player's equipment",
                 "[mercenary-gift][party]")
{
    monster& witch = hire(MONS_MERC_WITCH);
    item_def& staff = carry(0, OBJ_STAVES, STAFF_FIRE, false);
    witch.props["mercenary_owner_mid"] = static_cast<int>(party::mid_for_slot(1));
    CHECK_FALSE(mercenary::can_receive_item(witch, staff));
    CHECK_FALSE(mercenary::give_item(witch, 0));
    CHECK(you.inv[0].defined());
    CHECK_FALSE(witch.mslot_item(MSLOT_WEAPON));
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "Replacing a staff keeps the original on safe ground",
                 "[mercenary-gift]")
{
    monster& witch = hire(MONS_MERC_SORCERESS);
    item_def& fire = carry(0, OBJ_STAVES, STAFF_FIRE, false);
    fire.plus = 2;
    REQUIRE(mercenary::give_item(witch, 0));
    item_def& cold = carry(1, OBJ_STAVES, STAFF_COLD, false);
    cold.plus = 4;
    REQUIRE(mercenary::give_item(witch, 1));
    REQUIRE(witch.mslot_item(MSLOT_WEAPON));
    CHECK(witch.mslot_item(MSLOT_WEAPON)->sub_type == STAFF_COLD);
    REQUIRE(witch.spells.size() == 1);
    CHECK(witch.spells[0].spell == SPELL_BOLT_OF_COLD);
    bool found = false;
    for (stack_iterator it(witch.pos()); it; ++it)
        found |= it->base_type == OBJ_STAVES && it->sub_type == STAFF_FIRE
                 && it->plus == 2;
    CHECK(found);
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "Staff spell preview does not erase existing spells on refusal",
                 "[mercenary-gift]")
{
    monster& witch = hire(MONS_MERC_SORCERESS);
    witch.spells = {{SPELL_MAGIC_DART, 10, MON_SPELL_WIZARD}};
    item_def& sword = carry(0, OBJ_WEAPONS, WPN_LONG_SWORD, false);
    CHECK_FALSE(mercenary::can_receive_item(witch, sword));
    CHECK_FALSE(mercenary::refresh_witch_spells(witch, sword));
    REQUIRE(witch.spells.size() == 1);
    CHECK(witch.spells[0].spell == SPELL_MAGIC_DART);
    CHECK(you.inv[0].defined());
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "Mercenary roles reject unsuitable armour without consuming it",
                 "[mercenary-gift]")
{
    monster& witch = hire(MONS_MERC_WITCH);
    item_def& armour = carry(0, OBJ_ARMOUR, ARM_PLATE_ARMOUR, false);
    CHECK_FALSE(mercenary::can_receive_item(witch, armour));
    CHECK_FALSE(mercenary::give_item(witch, 0));
    CHECK(you.inv[0].defined());
    CHECK_FALSE(witch.mslot_item(MSLOT_ARMOUR));
}

TEST_CASE_METHOD(mercenary_gift_fixture,
                 "Brigands reject artefacts that interfere with stealth",
                 "[mercenary-gift]")
{
    monster& brigand = hire(MONS_MERC_BRIGAND);
    item_def& armour = carry(0, OBJ_ARMOUR, ARM_ROBE);
    REQUIRE(mercenary::can_receive_item(brigand, armour));
    for (const auto property : {ARTP_ANGRY, ARTP_NOISE})
    {
        artefact_set_property(armour, property, 1);
        CHECK_FALSE(mercenary::can_receive_item(brigand, armour));
        artefact_set_property(armour, property, 0);
    }
#if TAG_MAJOR_VERSION == 34
    artefact_set_property(armour, ARTP_CAUSE_TELEPORTATION, 1);
    CHECK_FALSE(mercenary::can_receive_item(brigand, armour));
#endif
}
