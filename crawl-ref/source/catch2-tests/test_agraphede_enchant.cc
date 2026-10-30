#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "agraphede-enchant.h"
#include "dungeon.h"
#include "env.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "test_vellum_fixture.h"

namespace
{
struct venom_fixture : vellum_fixture
{
    venom_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
    }
    ~venom_fixture() { dgn_reset_level(false); }

    monster& target()
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 52224;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.set_position(you.pos() + coord_def(2, 0));
        env.mgrid(mon.pos()) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
};
}

TEST_CASE_METHOD(venom_fixture, "Agraphede's enchanted attacks poison for their owner", "[agraphede-enchant]")
{
    monster& rat = target();
    you.duration[DUR_AGRAPHEDE_ENCHANT_POISON] = 0;
    CHECK_FALSE(agraphede_enchant_hit(&you, &rat));
    CHECK_FALSE(rat.has_ench(ENCH_POISON));

    agraphede_enchant_poison(1);
    REQUIRE(you.duration[DUR_AGRAPHEDE_ENCHANT_POISON] > 0);
    REQUIRE(agraphede_enchant_hit(&you, &rat));
    REQUIRE(rat.has_ench(ENCH_POISON));
    CHECK(rat.get_ench(ENCH_POISON).source == you.mid);
}

TEST_CASE_METHOD(venom_fixture, "Agraphede's enchantment is per player", "[agraphede-enchant][party]")
{
    monster& rat = target();
    player other;
    other.mid = you.mid + 100;
    other.duration[DUR_AGRAPHEDE_ENCHANT_POISON] = 0;
    you.duration[DUR_AGRAPHEDE_ENCHANT_POISON] = 10 * BASELINE_DELAY;
    CHECK_FALSE(agraphede_enchant_hit(&other, &rat));
    CHECK_FALSE(rat.has_ench(ENCH_POISON));
    CHECK(agraphede_enchant_hit(&you, &rat));
    CHECK(rat.get_ench(ENCH_POISON).source == you.mid);
}
