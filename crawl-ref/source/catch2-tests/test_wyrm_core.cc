#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "god-passive.h"
#include "beam.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "items.h"
#include "los.h"
#include "losglobal.h"
#include "mon-death.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

namespace
{
struct wyrm_kill_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    int old_depth = brdepth[BRANCH_DUNGEON];
    wyrm_kill_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 35; x <= 45; ++x)
            for (int y = 30; y <= 40; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.religion = GOD_NO_GOD;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~wyrm_kill_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        brdepth[BRANCH_DUNGEON] = old_depth;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Great Wyrm registration and passive depend on worship", "[wyrm][wyrm-core]")
{
    CHECK(god_name(GOD_GREAT_WYRM) == "the Great Wyrm");
    CHECK(feat_altar_god(altar_for_god(GOD_GREAT_WYRM)) == GOD_GREAT_WYRM);
    you.religion = GOD_GREAT_WYRM;
    you.penance[GOD_GREAT_WYRM] = 0;
    CHECK(have_passive(passive_t::wyrm_quicksilver));
    you.penance[GOD_GREAT_WYRM] = 1;
    CHECK_FALSE(have_passive(passive_t::wyrm_quicksilver));
    you.religion = GOD_NO_GOD;
    you.penance[GOD_GREAT_WYRM] = 0;
    CHECK_FALSE(have_passive(passive_t::wyrm_quicksilver));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Great Wyrm extraction attributes player kills to their own slot", "[wyrm][wyrm-core]")
{
    CHECK(wyrm_credited_killer_slot(KILL_NON_ACTOR, NON_MONSTER) == -1);
    CHECK(wyrm_credited_killer_slot(KILL_YOU, NON_MONSTER) == 0);
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    you.religion = GOD_NO_GOD;
    other.religion = GOD_GREAT_WYRM;
    other.penance[GOD_GREAT_WYRM] = 0;
    party::set_multiplayer(true);
    CHECK_FALSE(have_passive(passive_t::wyrm_quicksilver));
    {
        party::scoped_player_context context(1);
        CHECK(wyrm_credited_killer_slot(KILL_YOU_MISSILE, NON_MONSTER) == 1);
        CHECK(wyrm_credited_killer_slot(KILL_NON_ACTOR, NON_MONSTER) == -1);
        CHECK(have_passive(passive_t::wyrm_quicksilver));
    }
    CHECK_FALSE(have_passive(passive_t::wyrm_quicksilver));
    other.save = nullptr;
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Great Wyrm distils supported temporary enchantments", "[wyrm][wyrm-core]")
{
    monster foe;
    foe.type = MONS_RAT;
    foe.hit_points = foe.max_hit_points = 30;
    CHECK(wyrm_distilled_potion(foe) == NUM_POTIONS);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_HASTE, &you, 100)));
    CHECK(wyrm_distilled_potion(foe) == POT_HASTE);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_GOZAG_INCITE, &you, 100)));
    CHECK(wyrm_distilled_potion(foe) == NUM_POTIONS);
    foe.del_ench(ENCH_HASTE, true, false);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_MIGHT, &you, 100)));
    CHECK(wyrm_distilled_potion(foe) == POT_MIGHT);
    foe.del_ench(ENCH_MIGHT, true, false);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_RESISTANCE, &you, 100)));
    CHECK(wyrm_distilled_potion(foe) == POT_RESISTANCE);
}

TEST_CASE_METHOD(wyrm_kill_fixture, "Great Wyrm credits an inactive poison owner", "[wyrm][wyrm-core]")
{
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.religion = GOD_GREAT_WYRM;
    other.penance[GOD_GREAT_WYRM] = 0;
    other.set_position(you.pos() + coord_def(-1, 0));
    party::set_multiplayer(true);

    monster& victim = env.mons[0];
    victim.reset();
    victim.type = MONS_ORC;
    victim.mid = 52691;
    victim.hit_points = victim.max_hit_points = 20;
    victim.set_hit_dice(1);
    victim.base_attitude = ATT_HOSTILE;
    victim.behaviour = BEH_SEEK;
    const coord_def death_pos = you.pos() + coord_def(2, 0);
    victim.set_position(death_pos);
    victim.props[ALWAYS_CORPSE_KEY] = true;
    env.mgrid(death_pos) = 0;
    env.mid_cache[victim.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    REQUIRE(victim.add_ench(mon_enchant(ENCH_MIGHT, &other, 100)));
    victim.hurt(&other, 100, BEAM_POISON, KILLED_BY_POISON);

    bool found_might = false;
    for (stack_iterator si(death_pos); si; ++si)
        if (si->is_type(OBJ_POTIONS, POT_MIGHT))
        {
            found_might = true;
            CHECK(si->is_identified());
        }
    CHECK(found_might);
    CHECK(party::active_slot() == 0);
    CHECK(you.religion == GOD_NO_GOD);
}

TEST_CASE_METHOD(wyrm_kill_fixture, "Great Wyrm credits the actual projectile owner or reflector", "[wyrm][wyrm-core]")
{
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.religion = GOD_GREAT_WYRM;
    other.penance[GOD_GREAT_WYRM] = 0;
    other.set_position(you.pos() + coord_def(-1, 0));
    party::set_multiplayer(true);

    monster& victim = env.mons[0];
    victim.reset();
    victim.type = MONS_ORC;
    victim.mid = 52692;
    victim.hit_points = victim.max_hit_points = 20;
    victim.set_hit_dice(1);
    victim.base_attitude = ATT_HOSTILE;
    victim.behaviour = BEH_SEEK;
    const coord_def death_pos = you.pos() + coord_def(2, 0);
    victim.set_position(death_pos);
    victim.props[ALWAYS_CORPSE_KEY] = true;
    env.mgrid(death_pos) = 0;
    env.mid_cache[victim.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    REQUIRE(victim.add_ench(mon_enchant(ENCH_MIGHT, &other, 100)));
    victim.damage_total = victim.damage_friendly = 20;
    victim.hit_points = 1;

    bolt beam;
    beam.name = "test projectile";
    beam.flavour = BEAM_MMISSILE;
    beam.real_flavour = BEAM_MMISSILE;
    beam.damage = dice_def(20, 20);
    beam.hit = AUTOMATIC_HIT;
    beam.source = you.pos();
    beam.target = death_pos;
    beam.range = LOS_RADIUS;
    bool expect_might = true;
    SECTION("inactive player's projectile")
    {
        beam.thrower = KILL_YOU_MISSILE;
        beam.source_id = other.mid;
    }
    SECTION("enemy projectile reflected by inactive player")
    {
        beam.thrower = KILL_MON_MISSILE;
        beam.source_id = MID_NOBODY;
        beam.reflections = 1;
        beam.reflector = other.mid;
    }
    SECTION("player projectile reflected by an unrelated monster")
    {
        you.religion = GOD_GREAT_WYRM;
        beam.thrower = KILL_YOU_MISSILE;
        beam.source_id = you.mid;
        beam.reflections = 1;
        beam.reflector = 52693;
        expect_might = false;
    }
    fallback_ray(beam.source, beam.target, beam.ray);
    for (int i = 0; i < 4 && beam.ray.pos() != death_pos; ++i)
        REQUIRE(beam.ray.advance());
    REQUIRE(beam.ray.pos() == death_pos);
    beam.affect_actor(&victim);
    REQUIRE_FALSE(victim.alive());
    bool found_might = false;
    for (stack_iterator si(death_pos); si; ++si)
        if (si->is_type(OBJ_POTIONS, POT_MIGHT))
        {
            found_might = true;
            CHECK(si->is_identified());
        }
    CHECK(found_might == expect_might);
    CHECK(party::active_slot() == 0);
    CHECK(you.religion == (expect_might ? GOD_NO_GOD : GOD_GREAT_WYRM));
}
