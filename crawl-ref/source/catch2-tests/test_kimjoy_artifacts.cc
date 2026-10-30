#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "art-enum.h"
#include "artefact.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "items.h"
#include "kimjoy-artifacts.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "player-equip.h"
#include "prompt.h"
#include "test_vellum_fixture.h"
#include "transform.h"

namespace
{
struct kimjoy_artifact_fixture : vellum_fixture
{
    kimjoy_artifact_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        env.grid(you.pos()) = DNGN_FLOOR;
    }
    ~kimjoy_artifact_fixture() { dgn_reset_level(false); }

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

    void wear(int unrand, int slot)
    {
        item_def& item = you.inv[slot];
        item.clear();
        item.quantity = 1;
        REQUIRE(make_item_unrandart(item, unrand));
        item.link = slot;
        item.pos = ITEM_IN_INVENTORY;
        item.slot = index_to_letter(slot);
        you.equipment.add(item, get_item_slot(item));
        you.equipment.update();
    }
};
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Viper's Fang applies owned virulence on a damaging hit", "[kimjoy-artifacts]")
{
    monster& rat = target();
    CHECK_FALSE(vipers_fang_virulence(&you, &rat, 0));
    CHECK_FALSE(rat.has_ench(ENCH_POISON_VULN));
    REQUIRE(vipers_fang_virulence(&you, &rat, 5));
    REQUIRE(rat.has_ench(ENCH_POISON_VULN));
    CHECK(rat.get_ench(ENCH_POISON_VULN).source == you.mid);
    CHECK_FALSE(vipers_fang_virulence(&you, &rat, 5));
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Golem activation requires the wearer's complete set", "[kimjoy-artifacts]")
{
    CHECK_FALSE(golem_armour_complete(you));
    CHECK_FALSE(player_has_ability(ABIL_GOLEM_FORM));
    CHECK_FALSE(activate_golem_armour());
    wear(UNRAND_GOLEM_ARMOUR, 0);
    wear(UNRAND_GOLEM_BOOTS, 1);
    wear(UNRAND_GOLEM_GLOVES, 2);
    CHECK_FALSE(golem_armour_complete(you));
    wear(UNRAND_GOLEM_HELMET, 3);
    REQUIRE(golem_armour_complete(you));
    CHECK(player_has_ability(ABIL_GOLEM_FORM));
    REQUIRE(activate_golem_armour());
    CHECK(you.form == transformation::golem);
    CHECK(golem_armour_complete(you));
    CHECK_FALSE(player_has_ability(ABIL_GOLEM_FORM));
    deactivate_golem_armour();
    CHECK(you.form != transformation::golem);
}
