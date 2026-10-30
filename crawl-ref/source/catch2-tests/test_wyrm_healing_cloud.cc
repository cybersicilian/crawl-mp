#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "cloud.h"
#include "dungeon.h"
#include "env.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "terrain.h"
#include "test_vellum_fixture.h"

namespace
{
struct healing_cloud_fixture : vellum_fixture
{
    const int old_max_mon_index = env.max_mon_index;
    healing_cloud_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 35; x <= 45; ++x)
            for (int y = 30; y <= 40; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.set_position(coord_def(40, 35));
        you.hp_max = 100;
        you.hp = 50;
    }
    ~healing_cloud_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max_mon_index;
    }
};
}

TEST_CASE_METHOD(healing_cloud_fixture, "Viriditas mist heals without harming its occupants",
                 "[wyrm-healing-cloud]")
{
    CHECK(beam2cloud(BEAM_POTION_HEAL) == CLOUD_WYRM_HEAL);
    CHECK(is_harmless_cloud(CLOUD_WYRM_HEAL));
    CHECK(cloud_type_name(CLOUD_WYRM_HEAL) == "healing mist");
    bolt healing;
    healing.flavour = BEAM_POTION_HEAL;
    CHECK(healing.harmless_to_player());
    REQUIRE(place_cloud(CLOUD_WYRM_HEAL, you.pos(), 10, &you));
    actor_apply_cloud(&you);
    CHECK(you.hp == 51);
    you.duration[DUR_DEATHS_DOOR] = 10;
    actor_apply_cloud(&you);
    CHECK(you.hp == 51);

    const coord_def position(41, 35);
    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_RAT;
    target.mid = 40001;
    target.hit_points = 40;
    target.max_hit_points = 100;
    target.set_hit_dice(1);
    target.set_position(position);
    env.mgrid(position) = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    REQUIRE(place_cloud(CLOUD_WYRM_HEAL, position, 10, &you));
    actor_apply_cloud(&target);
    CHECK(target.hit_points == 51);
}

TEST_CASE_METHOD(healing_cloud_fixture, "Viriditas mist uses each party recipient's state",
                 "[wyrm-healing-cloud]")
{
    const coord_def leader = you.pos();
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.hp = 30;
    companion.set_position(leader + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = party::get_proxy_monster(1);
    REQUIRE(proxy);
    REQUIRE(place_cloud(CLOUD_WYRM_HEAL, companion.pos(), 10, &you));
    actor_apply_cloud(proxy);
    CHECK(party::get_player(1).hp == 31);
    CHECK(you.hp == 50);
    party::get_player(1).duration[DUR_DEATHS_DOOR] = 10;
    actor_apply_cloud(proxy);
    CHECK(party::get_player(1).hp == 31);
    CHECK(you.hp == 50);
    party::get_player(1).duration[DUR_DEATHS_DOOR] = 0;
    party::get_player(1).duration[DUR_TEMP_CLOUD_IMMUNITY] = 10;
    actor_apply_cloud(proxy);
    CHECK(party::get_player(1).hp == 31);
    CHECK(you.hp == 50);
}
