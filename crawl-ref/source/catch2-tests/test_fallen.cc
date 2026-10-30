#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "areas.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "losglobal.h"
#include "mapdef.h"
#include "mgen-data.h"
#include "mon-cast.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-util.h"
#include "state.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct fallen_fixture : vellum_fixture
{
#ifdef USE_TILE_LOCAL
    unwind_var<bool> headless{crawl_state.tiles_disabled, true};
#endif
    int old_max = env.max_mon_index;
    fallen_fixture()
    {
        init_monsters();
        init_spell_descs();
        init_mons_spells();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_CRYPT;
        you.depth = 2;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.unique_creatures.set(MONS_FALLEN, false);
        invalidate_los();
        invalidate_agrid(true);
    }
    ~fallen_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
        invalidate_agrid(true);
    }
    monster* spawn()
    {
        return create_monster(mgen_data(MONS_FALLEN, BEH_HOSTILE,
                                       coord_def(45, 35), MHITNOT,
                                       MG_FORCE_PLACE));
    }
};
}

TEST_CASE_METHOD(fallen_fixture, "The Fallen retains her undead attacks and priestly spells",
                 "[fallen]")
{
    monster fallen;
    fallen.type = MONS_FALLEN;
    CHECK(fallen.holiness() & MH_UNDEAD);
    CHECK(fallen.res_holy_energy() == 3);
    CHECK(fallen.umbra_radius() == 5);
    CHECK(fallen.halo_radius() < 0);
    CHECK(mons_attack_spec(fallen, 0).flavour == AF_VAMPIRIC);
    CHECK(mons_attack_spec(fallen, 1).flavour == AF_DRAIN);
    mons_load_spells(fallen);
    CHECK(fallen.has_spell(SPELL_SPECTRAL_CLOUD));
    CHECK(fallen.has_spell(SPELL_DRAIN_LIFE));
    CHECK(fallen.spell_slot_flags(SPELL_SPECTRAL_CLOUD) & MON_SPELL_PRIEST);
    CHECK(fallen.spell_slot_flags(SPELL_DRAIN_LIFE) & MON_SPELL_PRIEST);

    monster servitor;
    servitor.type = MONS_PROFANE_SERVITOR;
    CHECK(servitor.res_holy_energy() == 3);
    CHECK(servitor.umbra_radius() == 5);
}

TEST_CASE_METHOD(fallen_fixture, "The Fallen's umbra follows her and ends on removal",
                 "[fallen][umbra]")
{
    const coord_def original(45, 35);
    const coord_def destination(51, 35);
    CHECK_FALSE(umbraed(original));
    monster* fallen = spawn();
    REQUIRE(fallen);
    CHECK(umbraed(original));
    CHECK_FALSE(umbraed(destination));
    for (int x = original.x + 1; x <= destination.x; ++x)
        REQUIRE(fallen->move_to(coord_def(x, original.y)));
    CHECK_FALSE(umbraed(original));
    CHECK(umbraed(destination));
    monster_die(*fallen, KILL_RESET, NON_MONSTER, true);
    CHECK_FALSE(umbraed(destination));
}

TEST_CASE_METHOD(fallen_fixture, "The Fallen carries her glaive and remains unique",
                 "[fallen][monster-placement]")
{
    REQUIRE(mons_is_unique(MONS_FALLEN));
    REQUIRE_FALSE(you.unique_creatures[MONS_FALLEN]);
    monster* fallen = spawn();
    REQUIRE(fallen);
    item_def* weapon = fallen->mslot_item(MSLOT_WEAPON);
    REQUIRE(weapon);
    CHECK(weapon->is_type(OBJ_WEAPONS, WPN_GLAIVE));
    CHECK(weapon->plus >= 3);
    CHECK(weapon->plus <= 8);
    const brand_type brand = get_weapon_brand(*weapon);
    CHECK((brand == SPWPN_HEAVY || brand == SPWPN_DISTORTION
           || brand == SPWPN_ANTIMAGIC));
    CHECK(you.unique_creatures[MONS_FALLEN]);
    // Vault placement checks the unique flag before calling the lower-level
    // creation routine, which treats duplicate unique creation as an error.
    mons_spec duplicate(MONS_FALLEN);
    CHECK_FALSE(dgn_place_monster(duplicate, coord_def(48, 38), true));
}
