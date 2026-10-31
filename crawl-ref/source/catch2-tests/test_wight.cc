#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "artefact.h"
#include "character-trait.h"
#include "env.h"
#include "item-status-flag-type.h"
#include "items.h"
#include "message.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "mutation.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "species.h"
#include "test_player_fixture.h"
#include "unwind.h"
#include "wight.h"
#ifdef USE_TILE
#include "tilepick.h"
#include "rltiles/tiledef-gui.h"
#endif

#ifdef USE_TILE
TEST_CASE("Standalone backgrounds use valid selection tiles", "[standalone-job-tiles]")
{
    for (const auto [job, normal, recommended] : {
             tuple{JOB_HERMIT, TILEG_JOB_MONK, TILEG_JOB_RECOMMENDED_MONK},
             tuple{JOB_SLIME_PRIEST, TILEG_JOB_SUMMONER, TILEG_JOB_RECOMMENDED_SUMMONER},
             tuple{JOB_ARCHAEOLOGIST, TILEG_JOB_DELVER, TILEG_JOB_RECOMMENDED_DELVER},
             tuple{JOB_ROGUE, TILEG_JOB_BRIGAND, TILEG_JOB_RECOMMENDED_BRIGAND},
             tuple{JOB_FENCER, TILEG_JOB_GLADIATOR, TILEG_JOB_RECOMMENDED_GLADIATOR},
             tuple{JOB_RONIN, TILEG_JOB_MONK, TILEG_JOB_RECOMMENDED_MONK},
             tuple{JOB_APOTHECARY, TILEG_JOB_ALCHEMIST, TILEG_JOB_RECOMMENDED_ALCHEMIST},
             tuple{JOB_BILLIONAIRE, TILEG_JOB_WANDERER, TILEG_JOB_RECOMMENDED_WANDERER},
             tuple{JOB_NECKBEARD, TILEG_JOB_GLADIATOR, TILEG_JOB_RECOMMENDED_GLADIATOR},
             tuple{JOB_PHILOSOPHER, TILEG_JOB_HEDGE_WIZARD, TILEG_JOB_RECOMMENDED_HEDGE_WIZARD},
             tuple{JOB_CARAVAN, TILEG_JOB_ARTIFICER, TILEG_JOB_RECOMMENDED_ARTIFICER},
             tuple{JOB_COLLECTOR, TILEG_JOB_WANDERER, TILEG_JOB_RECOMMENDED_WANDERER}})
    {
        CHECK(tileidx_player_job(job, false) == normal);
        CHECK(tileidx_player_job(job, true) == recommended);
    }
}
#endif

#ifdef USE_TILE
TEST_CASE("Ported species have distinct selection tiles", "[wight]")
{
    for (const auto [species, normal, recommended] : {
             tuple{SP_WIGHT, TILEG_SP_WIGHT, TILEG_SP_RECOMMENDED_WIGHT},
             tuple{SP_IRIT, TILEG_SP_IRIT, TILEG_SP_RECOMMENDED_IRIT},
             tuple{SP_SPARKBORN, TILEG_SP_SPARKBORN, TILEG_SP_RECOMMENDED_SPARKBORN},
             tuple{SP_MELIAI, TILEG_SP_MELIAI, TILEG_SP_RECOMMENDED_MELIAI},
             tuple{SP_KITSUNE, TILEG_SP_KITSUNE, TILEG_SP_RECOMMENDED_KITSUNE}})
    {
        CHECK(tileidx_player_species(species, false) == normal);
        CHECK(tileidx_player_species(species, true) == recommended);
    }
}
#endif

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Wight burial enhances a weapon and preserves existing curses", "[wight]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    you.species = SP_WIGHT;
    you.experience_level = 12;
    calc_hp(false);
    you.hp = you.hp_max;
    CHECK(check_trait(character_trait::mummy, SP_WIGHT, JOB_FIGHTER)
          == trait_restriction::already_undead);
    CHECK_FALSE(wight::burial_reason(nullptr).empty());
    item_def weapon;
    weapon.base_type = OBJ_WEAPONS;
    weapon.sub_type = WPN_LONG_SWORD;
    weapon.quantity = 1;
    weapon.plus = 2;
    SECTION("A newly bound weapon is released without leaving a curse") {}
    SECTION("An existing curse remains when the binding is released")
    {
        weapon.flags |= ISFLAG_CURSED;
    }
    const bool originally_cursed = weapon.cursed();
    const int before_drain = you.hp_max_adj_temp;
    REQUIRE(wight::bury(weapon));
    CHECK(you.hp_max_adj_temp < before_drain);
    CHECK(weapon.cursed());
    CHECK(wight::owns_curse(weapon) == !originally_cursed);
    CHECK(wight::weapon_bonus(weapon) >= 3);
    CHECK(effective_item_enchantment(weapon) == weapon.plus + wight::weapon_bonus(weapon));
    CHECK_FALSE(wight::bury(weapon));
    weapon.flags &= ~ISFLAG_CURSED;
    CHECK(wight::weapon_bonus(weapon) == 0);
    weapon.flags |= ISFLAG_CURSED;
    REQUIRE(wight::release(weapon));
    CHECK(weapon.cursed() == originally_cursed);
    CHECK(wight::weapon_bonus(weapon) == 0);
    CHECK(effective_item_enchantment(weapon) == weapon.plus);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Wight melee drains living monsters without bonus damage", "[wight]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    init_monsters();
    you.species = SP_WIGHT;
    you.experience_level = 5;
    monster mon;
    mon.reset();
    mon.type = MONS_OGRE;
    mon.mid = 10001;
    mon.hit_points = mon.max_hit_points = 100;
    mon.set_hit_dice(5);
    wight::drain_target(mon);
    CHECK_FALSE(mon.has_ench(ENCH_DRAINED));
    you.experience_level = 6;
    wight::drain_target(mon);
    CHECK(mon.has_ench(ENCH_DRAINED));
    CHECK(mon.hit_points == 100);
    mon.del_ench(ENCH_DRAINED);
    you.experience_level = 18;
    wight::drain_target(mon);
    CHECK(mon.get_ench(ENCH_DRAINED).degree == 2);
    CHECK(mon.hit_points == 100);
    mon.reset();
    mon.type = MONS_WIGHT;
    mon.mid = 10002;
    mon.hit_points = mon.max_hit_points = 100;
    mon.set_hit_dice(5);
    wight::drain_target(mon);
    CHECK_FALSE(mon.has_ench(ENCH_DRAINED));
    mon.reset();
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Wight proxy draining scales at level eighteen and respects resistance", "[wight]")
{
    static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
    (void)messages_ready;
    init_monsters();
    you.set_position(coord_def(40, 35));
    unwind_var<dungeon_feature_type> leader_terrain(env.grid(you.pos()), DNGN_FLOOR);
    unwind_var<dungeon_feature_type> other_terrain(env.grid(coord_def(41, 35)), DNGN_FLOOR);
    you.species = SP_WIGHT;
    you.experience_level = 18;
    you.hp = you.hp_max = 100;
    you.hp_max_adj_temp = 0;
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    you.on_current_level = true;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.species = SP_HUMAN;
    other.set_position(coord_def(41, 35));
    other.hp_max_adj_perm = 725;
    other.hp_max_adj_temp = 0;
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = party::get_proxy_monster(1);
    REQUIRE(proxy);

    int seed = 1;
    for (; seed < 100; ++seed)
    {
        rng::seed(seed);
        if (random2(2) == 1)
            break;
    }
    REQUIRE(seed < 100);
    int real_hp;
    {
        party::scoped_player_context victim(1);
        real_hp = get_real_hp(false, false);
    }
    rng::seed(seed);
    REQUIRE(random2(2) == 1);
    const int expected_drain = 1 + div_rand_round(12 * real_hp, 750);
    rng::seed(seed);
    wight::drain_target(*proxy);
    CHECK(other.hp_max_adj_temp == -expected_drain);
    CHECK(you.hp_max_adj_temp == 0);
    CHECK(party::active_slot() == 0);

    other.mutation[MUT_NEGATIVE_ENERGY_RESISTANCE] = 3;
    const int before = other.hp_max_adj_temp;
    wight::drain_target(*proxy);
    CHECK(other.hp_max_adj_temp == before);
    party::remove_all_proxies();
    party::set_multiplayer(false);
    other.save = nullptr;
    party::set_player_count(1);
}
