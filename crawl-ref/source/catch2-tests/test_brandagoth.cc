#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "act-iter.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "losglobal.h"
#include "mgen-data.h"
#include "mon-book.h"
#include "mon-cast.h"
#include "mon-info.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-util.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(vellum_fixture, "Brandagoth retains lava-orc combat and movement magic",
                 "[brandagoth]")
{
    init_monsters();
    init_spell_descs();
    const monsterentry* data = get_monster_data(MONS_BRANDAGOTH);
    REQUIRE(data);
    CHECK(string(data->name) == "Brandagoth");
    CHECK(data->species == MONS_ORC);
    CHECK(data->sec == MST_BRANDAGOTH);
    CHECK(data->attack[0].flavour == AF_FIRE);
    CHECK(data->attack[0].damage == 7);
    monster sorcerer;
    sorcerer.type = MONS_BRANDAGOTH;
    CHECK(mons_habitat(sorcerer) == HT_AMPHIBIOUS_LAVA);
    CHECK(sorcerer.res_fire() == 3);
    CHECK(sorcerer.res_cold() == -1);
    mons_load_spells(sorcerer);
    CHECK(sorcerer.has_spell(SPELL_FIREBALL));
    CHECK(sorcerer.has_spell(SPELL_BOLT_OF_MAGMA));
    CHECK(sorcerer.has_spell(SPELL_FLEETFOOT));
    CHECK(sorcerer.spell_slot_flags(SPELL_FLEETFOOT) & MON_SPELL_EMERGENCY);
    CHECK_FALSE(sorcerer.has_spell(SPELL_HURL_DAMNATION));
}

TEST_CASE_METHOD(vellum_fixture, "Brandagoth leads his own fire band with a flaming staff",
                 "[brandagoth][monster-placement]")
{
    init_monsters();
    init_spell_descs();
    init_mons_spells();
    dgn_reset_level(false);
    unwinder reset_level([] { dgn_reset_level(false); invalidate_los(); });
    unwind_var<int> restore_max(env.max_mon_index);
    unwind_var<branch_type> restore_branch(you.where_are_you, BRANCH_VAULTS);
    unwind_var<int> restore_depth(you.depth, 2);
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.unique_creatures.set(MONS_BRANDAGOTH, false);
    mgen_data gen(MONS_BRANDAGOTH, BEH_HOSTILE,
                  you.pos() + coord_def(5, 0), MHITNOT,
                  MG_FORCE_PLACE | MG_PERMIT_BANDS);
    monster* leader = create_monster(gen);
    REQUIRE(leader);
    CHECK(leader->type == MONS_BRANDAGOTH);
    item_def* weapon = leader->mslot_item(MSLOT_WEAPON);
    REQUIRE(weapon);
    CHECK(weapon->is_type(OBJ_WEAPONS, WPN_QUARTERSTAFF));
    CHECK(get_weapon_brand(*weapon) == SPWPN_FLAMING);

    int followers = 0;
    for (monster_iterator mi; mi; ++mi)
        if (mi->get_band_leader() == leader)
        {
            ++followers;
            CHECK((mi->type == MONS_FIRE_ELEMENTAL || mi->type == MONS_HELL_HOUND));
        }
    CHECK(followers > 0);
    CHECK(followers <= 9);
}
