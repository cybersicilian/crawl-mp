#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "beam.h"
#include "dungeon.h"
#include "env.h"
#include "losglobal.h"
#include "mon-cast.h"
#include "mon-ench.h"
#include "mon-mst.h"
#include "mon-util.h"
#include "monster.h"
#include "mutation.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "spl-util.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

namespace
{
struct kitsune_charm_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    kitsune_charm_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_KITSUNE;
        you.religion = GOD_NO_GOD;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~kitsune_charm_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
    monster& spawn(int index, coord_def pos, mon_attitude_type attitude)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 41001 + index;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = attitude;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Kitsune have Charm and cannot wear headgear", "[kitsune]")
{
    you.species = SP_HUMAN;
    CHECK_FALSE(player_has_ability(ABIL_KITSUNE_CHARM));
    you.species = SP_KITSUNE;
    give_basic_mutations(you.species);
    CHECK(you.get_innate_mutation_level(MUT_CLAWS) == 1);
    CHECK(player_has_ability(ABIL_KITSUNE_CHARM));
    CHECK(make_cost_description(ABIL_KITSUNE_CHARM).find("Exhaustion") != string::npos);
    CHECK(check_ability_possible(ABIL_KITSUNE_CHARM, true));
    you.duration[DUR_EXHAUSTED] = 10;
    CHECK_FALSE(check_ability_possible(ABIL_KITSUNE_CHARM, true));
    you.duration[DUR_EXHAUSTED] = 0;
    string reason;
    CHECK(get_player_equip_slot_count(SLOT_HELMET, &reason) == 0);
    CHECK(reason.find("fox ears") != string::npos);
}

TEST_CASE("Rin and fire foxes have their own monster definitions", "[kitsune]")
{
    init_monsters();
    const monsterentry* rin = get_monster_data(MONS_RIN);
    const monsterentry* fox = get_monster_data(MONS_FIRE_FOX);
    REQUIRE(rin);
    REQUIRE(fox);
    CHECK(string(rin->name) == "Rin the nine-tailed");
    CHECK(rin->bitfields & M_UNIQUE);
    CHECK(rin->genus == MONS_HUMAN);
    CHECK(rin->species == MONS_HUMAN);
    CHECK(rin->attack[0].type == AT_HIT);
    CHECK(rin->attack[0].damage == 24);
    CHECK(rin->attack[1].flavour == AF_ANTIMAGIC);
    CHECK(rin->attack[1].damage == 14);
    CHECK(rin->exp == 2438);
    CHECK(rin->sec == MST_RIN);
    CHECK(string(fox->name) == "fire fox");
    CHECK(fox->genus == MONS_HOUND);
    CHECK(fox->species == MONS_FIRE_FOX);
    CHECK_FALSE(fox->bitfields & M_SEE_INVIS);
    CHECK(fox->attack[0].type == AT_BITE);
    CHECK(fox->attack[0].damage == 6);
    CHECK(fox->exp == 180);
    CHECK(fox->sec == MST_FIRE_FOX);
    init_spell_descs();
    init_mons_spells();
    for (spell_type spell : {SPELL_FOXFIRE, SPELL_BLINK, SPELL_FORCE_LANCE,
                             SPELL_BATTLESPHERE, SPELL_IOOD, SPELL_MESMERISE})
        CHECK(is_valid_mon_spell(spell));
}

TEST_CASE_METHOD(kitsune_charm_fixture,
                 "Kitsune charm counters hostile control of an ally", "[kitsune]")
{
    monster& controlled = spawn(0, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    monster& hostile = spawn(1, you.pos() + coord_def(0, 1), ATT_HOSTILE);
    monster& friendly = spawn(2, you.pos() + coord_def(-1, 0), ATT_FRIENDLY);
    monster& immune = spawn(3, you.pos() + coord_def(0, -1), ATT_HOSTILE);
    immune.type = MONS_ORB_OF_FIRE;
    REQUIRE(immune.willpower() == WILL_INVULN);
    bool was_charmed = false;
    SECTION("A naturally friendly ally is hexed") {}
    SECTION("A previously charmed ally is hexed")
    {
        controlled.base_attitude = ATT_HOSTILE;
        REQUIRE(controlled.add_ench(mon_enchant(ENCH_CHARM, &you, 100)));
        was_charmed = true;
    }
    SECTION("A hostile monster has only hostile control")
    {
        controlled.base_attitude = ATT_HOSTILE;
        was_charmed = true; // A successful counter must charm it afterward.
    }
    REQUIRE(controlled.add_ench(mon_enchant(ENCH_HEXED, &you, 100)));
    REQUIRE(controlled.attitude() == ATT_HOSTILE);
    rng::seed(442);
    // Enchantment power is resisted probabilistically. Repeat the native
    // effect, as a player can, until both vulnerable targets succumb.
    for (int attempt = 0; attempt < 100
         && (controlled.has_ench(ENCH_HEXED) || !hostile.has_ench(ENCH_CHARM)); ++attempt)
        REQUIRE(mass_enchantment(ENCH_CHARM, 1000) == spret::success);
    CHECK_FALSE(controlled.has_ench(ENCH_HEXED));
    CHECK(controlled.attitude() == ATT_FRIENDLY);
    CHECK(controlled.has_ench(ENCH_CHARM) == was_charmed);
    CHECK(hostile.has_ench(ENCH_CHARM));
    CHECK(hostile.attitude() == ATT_FRIENDLY);
    CHECK_FALSE(friendly.has_ench(ENCH_CHARM));
    CHECK(friendly.attitude() == ATT_FRIENDLY);
    CHECK_FALSE(immune.has_ench(ENCH_CHARM));
    CHECK(immune.attitude() == ATT_HOSTILE);
}
