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

#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "feature.h"
#include "fight.h"
#include "prompt.h"
#include "losglobal.h"
#include "message.h"
#include "mon-death.h"
#include "mon-util.h"
#include "monster.h"
#include "random.h"
#include "ranged-attack.h"
#include "skills.h"

namespace
{
// A reset level with an open room, for tests that need items on the floor
// or actors with line of sight.
struct port_level_fixture : MockPlayerYouTestsFixture
{
    int old_max = env.max_mon_index;
    int monsters = 0;

    port_level_fixture()
    {
        static const bool messages = []() { msg::initialise_mpr_streams(); return true; }();
        (void)messages;
        init_show_table();
        init_monsters();
        dgn_reset_level(false);
        for (int x = 33; x <= 47; ++x)
            for (int y = 28; y <= 42; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.religion = GOD_NO_GOD;
        you.set_position(coord_def(40, 35));
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 100;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }

    ~port_level_fixture()
    {
        for (int i = 0; i < monsters; ++i)
        {
            if (env.mons[i].alive())
                env.mgrid(env.mons[i].pos()) = NON_MONSTER;
            env.mons[i].reset();
        }
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }

    monster& spawn(monster_type type, const coord_def& pos)
    {
        const int index = monsters++;
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = type;
        mon.mid = 56000 + index;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }

    item_def& carry(int slot, object_class_type base, int subtype, int brand)
    {
        item_def& item = you.inv[slot];
        item.clear();
        item.base_type = base;
        item.sub_type = subtype;
        item.brand = brand;
        item.quantity = 1;
        item.link = slot;
        item.slot = index_to_letter(slot);
        item.pos = ITEM_IN_INVENTORY;
        return item;
    }
};
}

TEST_CASE_METHOD(port_level_fixture, "Seeking launchers replace skill with a fixed to-hit contribution",
                 "[port-item-bits]")
{
    monster& rat = spawn(MONS_RAT, you.pos() + coord_def(3, 0));
    REQUIRE(you.can_see(rat));
    item_def& plain = carry(0, OBJ_WEAPONS, WPN_SHORTBOW, SPWPN_NORMAL);
    item_def& seeking = carry(1, OBJ_WEAPONS, WPN_SHORTBOW, SPWPN_SEEKING);
    REQUIRE(get_weapon_brand(plain) == SPWPN_NORMAL);
    REQUIRE(get_weapon_brand(seeking) == SPWPN_SEEKING);

    const auto player_to_hit = [&rat](const item_def& bow)
    {
        ranged_attack shot(&you, &rat, &bow);
        return shot.calc_pre_roll_to_hit(false);
    };

    SECTION("an untrained archer")
    {
        REQUIRE(you.skill(SK_RANGED_WEAPONS, 100) == 0);
    }
    SECTION("a master archer")
    {
        set_skill_level(SK_FIGHTING, 27);
        set_skill_level(SK_RANGED_WEAPONS, 27);
        REQUIRE(you.skill(SK_RANGED_WEAPONS, 100) == 2700);
    }

    // The deterministic average replaces both the Fighting and the launcher
    // skill contributions with the equivalent of 50 skill levels each.
    const int skill_part =
        maybe_random2_div(you.skill(SK_FIGHTING, 100), 100, false)
        + maybe_random2_div(you.skill(SK_RANGED_WEAPONS, 100), 100, false);
    const int seeking_part = 2 * maybe_random2_div(5000, 100, false);
    CHECK(seeking_part == 50);
    const int plain_hit = player_to_hit(plain);
    const int seeking_hit = player_to_hit(seeking);
    CHECK(seeking_hit - plain_hit == seeking_part - skill_part);
    CHECK(seeking_hit > plain_hit);

    // Monsters instead get a floor of 50 on their base to-hit before the
    // launcher's enchantment and accuracy are added.
    monster& archer = spawn(MONS_RAT, you.pos() + coord_def(0, 3));
    const auto monster_to_hit = [&archer](const item_def& bow)
    {
        ranged_attack shot(&archer, &you, &bow);
        return shot.calc_pre_roll_to_hit(false);
    };
    const int base = mon_to_hit_base(archer.get_hit_dice(), archer.is_archer());
    REQUIRE(base < 50);
    CHECK(monster_to_hit(seeking) - monster_to_hit(plain) == 50 - base);
}

TEST_CASE_METHOD(port_level_fixture, "Iron dragons leave iron dragon scales when their hide survives",
                 "[port-item-bits]")
{
    REQUIRE(hide_for_monster(MONS_IRON_DRAGON) == ARM_IRON_DRAGON_ARMOUR);
    REQUIRE(mons_class_leaves_hide(MONS_IRON_DRAGON));
    REQUIRE(monster_for_hide(ARM_IRON_DRAGON_ARMOUR) == MONS_IRON_DRAGON);

    const coord_def pos = you.pos() + coord_def(2, 0);
    REQUIRE(env.igrid(pos) == NON_ITEM);

    // Two deaths in three leave the hide behind; repeat on a seeded RNG
    // until one does.
    rng::seed(4096);
    int deaths = 0;
    for (; deaths < 30 && env.igrid(pos) == NON_ITEM; ++deaths)
        maybe_drop_monster_organ(MONS_IRON_DRAGON, MONS_IRON_DRAGON, pos, true);
    REQUIRE(env.igrid(pos) != NON_ITEM);
    CHECK(deaths < 30);

    const item_def& scales = env.item[env.igrid(pos)];
    CHECK(scales.is_type(OBJ_ARMOUR, ARM_IRON_DRAGON_ARMOUR));
    CHECK(scales.quantity == 1);
    CHECK(scales.pos == pos);
    CHECK(scales.flags & ISFLAG_IDENTIFIED);
    // Only uniques' hides are inscribed with the monster's name.
    CHECK(scales.inscription.empty());
    CHECK(scales.name(DESC_PLAIN).find("iron dragon scales") != string::npos);
}
