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

#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "losglobal.h"
#include "mon-util.h"
#include "monster.h"
#include "random.h"
#include "ranged-attack.h"
#include "spl-transloc.h"

namespace
{
// A small open room so launched attacks have line of sight and a path to
// pull targets along.
struct scorpio_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;

    scorpio_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 33; x <= 47; ++x)
            for (int y = 28; y <= 42; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.religion = GOD_NO_GOD;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 100;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }

    ~scorpio_fixture()
    {
        if (env.mons[0].alive())
            env.mgrid(env.mons[0].pos()) = NON_MONSTER;
        env.mons[0].reset();
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }

    monster& target(const coord_def& pos)
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 54000;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
};
}

TEST_CASE_METHOD(scorpio_fixture, "Scorpio's shots beckon surviving targets toward the wielder",
                 "[bc-unrands]")
{
    item_def& scorpio = unique(0, UNRAND_SCORPIO);
    REQUIRE(is_range_weapon(scorpio));
    you.equipment.add(scorpio, SLOT_WEAPON);
    you.equipment.update();

    const coord_def far = you.pos() + coord_def(4, 0);
    monster& rat = target(far);
    REQUIRE(you.can_see(rat));
    REQUIRE(can_beckon(rat));

    // Every shot that lands fires the beckon hook. Misses are possible, so
    // keep shooting on a seeded RNG until the first hit moves the target.
    rng::seed(2024);
    int shots = 0;
    for (; shots < 50 && rat.pos() == far; ++shots)
    {
        ranged_attack shot(&you, &rat, &scorpio);
        shot.attack();
        REQUIRE(rat.alive());
    }
    REQUIRE(rat.pos() != far);
    CHECK(shots < 50);
    // The path tracer runs from the shooter, so the first free cell on it is
    // the one adjacent to the player.
    CHECK(rat.pos() == you.pos() + coord_def(1, 0));
    CHECK(env.mgrid(rat.pos()) == 0);
    CHECK(env.mgrid(far) == NON_MONSTER);
    CHECK(rat.hit_points < rat.max_hit_points);
}

TEST_CASE_METHOD(scorpio_fixture, "Ordinary hand cannons leave their targets in place",
                 "[bc-unrands]")
{
    item_def& cannon = carry(0, OBJ_WEAPONS, WPN_HAND_CANNON, false);
    cannon.plus = 6;
    REQUIRE(is_range_weapon(cannon));
    you.equipment.add(cannon, SLOT_WEAPON);
    you.equipment.update();

    const coord_def far = you.pos() + coord_def(4, 0);
    monster& rat = target(far);

    rng::seed(2024);
    for (int shot_number = 0; shot_number < 20; ++shot_number)
    {
        ranged_attack shot(&you, &rat, &cannon);
        shot.attack();
        REQUIRE(rat.alive());
        REQUIRE(rat.pos() == far);
    }
    // At least one of twenty shots connected, so the hook had its chance.
    CHECK(rat.hit_points < rat.max_hit_points);
    CHECK(env.mgrid(far) == 0);
}
