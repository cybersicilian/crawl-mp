#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "dungeon.h"
#include "env.h"
#include "files.h"
#include "god-companions.h"
#include "losglobal.h"
#include "mercenary-transit.h"
#include "mon-transit.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "test_vellum_fixture.h"

namespace
{
struct mercenary_fixture : vellum_fixture
{
    mercenary_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        init_companions();
        the_lost_ones.clear();
        party::set_player_count(2);
        party::set_multiplayer(true);
        player& other = party::get_player(1);
        other = you;
        other.save = nullptr;
        other.mid = party::mid_for_slot(1);
    }

    ~mercenary_fixture()
    {
        init_companions();
        the_lost_ones.clear();
        party::get_player(1).save = nullptr;
        party::set_multiplayer(false);
        party::set_player_count(1);
        dgn_reset_level(false);
    }

    monster& friendly(int index, int mid)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = mid;
        mon.hit_points = mon.max_hit_points = 20;
        mon.base_attitude = ATT_FRIENDLY;
        mon.behaviour = BEH_SEEK;
        mon.set_position(you.pos() + coord_def(index + 1, 0));
        env.mgrid(mon.pos()) = index;
        env.mid_cache[mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE_METHOD(mercenary_fixture, "Hired companions retain their individual owners",
                 "[mercenary-transit][party]")
{
    monster& first = friendly(0, 32001);
    monster& second = friendly(1, 32002);
    REQUIRE_FALSE(is_hired_mercenary(first));
    register_mercenary(first, you);
    register_mercenary(second, party::get_player(1));

    REQUIRE(is_hired_mercenary(first));
    CHECK(mercenary_owned_by(first, you));
    CHECK_FALSE(mercenary_owned_by(first, party::get_player(1)));
    CHECK(mercenary_owned_by(second, party::get_player(1)));
    CHECK_FALSE(mercenary_owned_by(second, you));
    REQUIRE(companion_list.count(first.mid) == 1);
    REQUIRE(companion_list.count(second.mid) == 1);
    CHECK(mercenary_owned_by(companion_list[first.mid].mons.mons, you));
    CHECK(mercenary_owned_by(companion_list[second.mid].mons.mons,
                             party::get_player(1)));

    // Recall targets the active player's location, so it must never allow an
    // inactive owner to recall by passing their player object directly.
    CHECK_FALSE(recall_owned_mercenaries(party::get_player(1)));
}

TEST_CASE_METHOD(mercenary_fixture, "Mercenary transit preserves owner and snapshot",
                 "[mercenary-transit][party]")
{
    monster& hired = friendly(0, 32011);
    register_mercenary(hired, you);
    hired.hit_points = 13;
    update_companions();
    REQUIRE(companion_list.count(hired.mid) == 1);
    CHECK(companion_list[hired.mid].mons.mons.hit_points == 13);

    const level_id destination(BRANCH_DUNGEON, 2);
    add_monster_to_transit(destination, hired);
    REQUIRE(companion_list.count(hired.mid) == 1);
    CHECK(companion_list[hired.mid].level == destination);
    CHECK(mercenary_owned_by(companion_list[hired.mid].mons.mons, you));
    REQUIRE(get_transit_list(destination));
    CHECK(get_transit_list(destination)->size() == 1);
}

TEST_CASE_METHOD(mercenary_fixture,
                 "A split-floor departure moves only the active owner's tagged hire",
                 "[mercenary-transit][party]")
{
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    env.grid(you.pos()) = DNGN_STONE_STAIRS_DOWN_I;
    invalidate_los();

    monster& ours = friendly(0, 32031);
    ours.speed_increment = 100;
    ours.foe = MHITNOT; // A newly hired, idle companion can still follow.
    register_mercenary(ours, you);

    monster& theirs = friendly(1, 32032);
    theirs.speed_increment = 100;
    theirs.foe = MHITYOU;
    register_mercenary(theirs, party::get_player(1));

    monster& ordinary = friendly(2, 32033);
    ordinary.speed_increment = 100;
    ordinary.foe = MHITYOU;

    monster& incapacitated = friendly(3, 32034);
    env.mgrid(incapacitated.pos()) = NON_MONSTER;
    incapacitated.set_position(you.pos() + coord_def(0, 1));
    env.mgrid(incapacitated.pos()) = incapacitated.mindex();
    incapacitated.speed_increment = 100;
    incapacitated.foe = MHITYOU;
    register_mercenary(incapacitated, you);

    tag_followers();
    REQUIRE(static_cast<bool>(ours.flags & MF_TAKING_STAIRS));
    CHECK_FALSE(static_cast<bool>(theirs.flags & MF_TAKING_STAIRS));
    REQUIRE(static_cast<bool>(ordinary.flags & MF_TAKING_STAIRS));
    REQUIRE(static_cast<bool>(incapacitated.flags & MF_TAKING_STAIRS));
    // A hire may become unable to move after the stair delay starts.
    incapacitated.behaviour = BEH_SLEEP;

    // load_level updates the destination before saving the old floor.
    you.depth = 2;
    grab_multiplayer_hired_followers();
    const auto* transit = get_transit_list(level_id(BRANCH_DUNGEON, 2));
    REQUIRE(transit);
    REQUIRE(transit->size() == 1);
    CHECK(transit->front().mons.mid == 32031);
    CHECK(mercenary_owned_by(transit->front().mons, you));
    CHECK(monster_by_mid(32032) == &theirs);
    CHECK(monster_by_mid(32033) == &ordinary);
    CHECK(monster_by_mid(32034) == &incapacitated);
    CHECK_FALSE(static_cast<bool>(incapacitated.flags & MF_TAKING_STAIRS));
}

TEST_CASE_METHOD(mercenary_fixture,
                 "A shared branch departure tags nearby mercenaries of transported owners",
                 "[mercenary-transit][party]")
{
    party::set_multiplayer(false);
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    player& other = party::get_player(1);
    other.where_are_you = BRANCH_DUNGEON;
    other.depth = 1;
    other.set_position(you.pos() + coord_def(6, 0));
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    env.grid(you.pos()) = DNGN_ENTER_LAIR;
    invalidate_los();

    monster& theirs = friendly(0, 32021);
    env.mgrid(theirs.pos()) = NON_MONSTER;
    theirs.set_position(other.pos() + coord_def(1, 0));
    env.mgrid(theirs.pos()) = theirs.mindex();
    theirs.speed_increment = 100;
    theirs.foe = MHITYOU;
    register_mercenary(theirs, other);

    monster& ours = friendly(1, 32022);
    env.mgrid(ours.pos()) = NON_MONSTER;
    ours.set_position(other.pos() + coord_def(0, 1));
    env.mgrid(ours.pos()) = ours.mindex();
    ours.speed_increment = 100;
    ours.foe = MHITYOU;
    register_mercenary(ours, you);

    const level_id source(BRANCH_DUNGEON, 1);
    tag_transported_party_mercenaries(source, you.pos(), false);
    CHECK_FALSE(static_cast<bool>(theirs.flags & MF_TAKING_STAIRS));
    other.depth = 2; // Do not touch a member already on another floor.
    tag_transported_party_mercenaries(source, you.pos(), true);
    CHECK_FALSE(static_cast<bool>(theirs.flags & MF_TAKING_STAIRS));
    other.depth = 1;
    const int active = party::active_slot();
    tag_transported_party_mercenaries(source, you.pos(), true);
    CHECK(party::active_slot() == active);
    CHECK(static_cast<bool>(theirs.flags & MF_TAKING_STAIRS));
    // A transported member cannot carry another member's mercenary with them.
    CHECK_FALSE(static_cast<bool>(ours.flags & MF_TAKING_STAIRS));

    // The other member's hire is outside the active member's follower radius.
    // It must still be extracted on a shared branch transition, before the
    // member is placed on the destination floor.
    you.where_are_you = BRANCH_LAIR;
    you.depth = 1;
    grab_shared_party_hired_followers(source);
    const auto* transit = get_transit_list(level_id(BRANCH_LAIR, 1));
    REQUIRE(transit);
    REQUIRE(transit->size() == 1);
    CHECK(transit->front().mons.mid == 32021);
    CHECK(mercenary_owned_by(transit->front().mons, other));
    CHECK(monster_by_mid(32022) == &ours);
}
