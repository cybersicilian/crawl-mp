#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "dungeon.h"
#include "env.h"
#include "item-name.h"
#include "item-prop.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "mon-util.h"
#include "player-equip.h"
#include "spl-goditem.h"
#include "status.h"
#include "test_vellum_fixture.h"
#include "transform.h"

namespace
{
struct blessing_combat_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    blessing_combat_fixture()
    {
        static const bool ready = []() { init_duration_index(); return true; }();
        (void)ready;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.religion = GOD_ELYVILON;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.form = you.default_form = transformation::none;
        invalidate_los();
    }
    ~blessing_combat_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(blessing_combat_fixture,
                 "Pacifying a target stops the rest of a quick blade swing",
                 "[weapon-blessings][combat]")
{
    item_def& blade = carry(0, OBJ_WEAPONS, WPN_QUICK_BLADE, false);
    REQUIRE(set_item_ego_type(blade, OBJ_WEAPONS, SPWPN_PACIFYING));
    blade.plus = 20;
    you.equipment.add(blade, SLOT_WEAPON);
    you.equipment.update();

    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_GARGOYLE;
    target.mid = 30001;
    target.hit_points = target.max_hit_points = 10000;
    target.set_hit_dice(1);
    target.base_attitude = ATT_HOSTILE;
    target.behaviour = BEH_SEEK;
    target.foe = MHITYOU;
    target.set_position(you.pos() + coord_def(1, 0));
    env.mgrid(target.pos()) = 0;
    env.mid_cache[target.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);

    // Nonliving targets cannot be pacified; attacks must still proceed.
    REQUIRE_FALSE(unpacifiable_reason(target).empty());
    for (int i = 0; i < 500 && target.hit_points == target.max_hit_points; ++i)
    {
        melee_attack swing(&you, &target);
        swing.launch_attack_set(true);
    }
    REQUIRE(target.hit_points < target.max_hit_points);
    CHECK_FALSE(target.pacified());

    // A rat can be pacified. Its high HP leaves room for repeated real swings;
    // pacification heals it, so any damaging follow-up will be observable.
    target.type = MONS_RAT;
    target.hit_points = target.max_hit_points;
    REQUIRE(unpacifiable_reason(target).empty());
    for (int i = 0; i < 500 && !target.pacified(); ++i)
    {
        melee_attack swing(&you, &target);
        swing.launch_attack_set(true);
    }
    REQUIRE(target.pacified());
    CHECK(target.hit_points == target.max_hit_points);
}
