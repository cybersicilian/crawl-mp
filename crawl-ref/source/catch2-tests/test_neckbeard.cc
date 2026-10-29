#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "branch.h"
#include "directn.h"
#include "dungeon.h"
#include "env.h"
#include "losglobal.h"
#include "mon-util.h"
#include "monster.h"
#include "neckbeard.h"
#include "party.h"
#include "player.h"
#include "spl-cast.h"
#include "target.h"
#include "tags.h"
#include "test_vellum_fixture.h"

namespace
{
struct neckbeard_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    int old_depth = brdepth[BRANCH_DUNGEON];
    neckbeard_fixture()
    {
        init_monsters();
        brdepth[BRANCH_DUNGEON] = 15;
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.char_class = JOB_NECKBEARD;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 100;
        you.magic_points = you.max_magic_points = 5;
        you.religion = GOD_NO_GOD;
        you.current_vision = you.normal_vision = 7;
        you.duration[DUR_BLINK_COOLDOWN] = 0;
        invalidate_los();
    }
    ~neckbeard_fixture()
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
    monster& spawn(int index, coord_def pos, mon_attitude_type attitude)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 42000 + index;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = attitude;
        mon.behaviour = BEH_SEEK;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE_METHOD(neckbeard_fixture, "Step Behind previews its landing and preserves Blink cooldown", "[neckbeard]")
{
    const coord_def start = you.pos();
    const coord_def foe = start + coord_def(2, 1);
    const coord_def dest = foe + coord_def(1, 1);
    spawn(0, foe, ATT_HOSTILE);
    CHECK(player_has_ability(ABIL_STEP_BEHIND));
    CHECK(make_cost_description(ABIL_STEP_BEHIND).find("2 MP") != string::npos);
    CHECK(make_cost_description(ABIL_STEP_BEHIND).find("5-turn") != string::npos);
    CHECK(neckbeard::landing(start, foe) == dest);
    auto targeter = neckbeard::step_targeter();
    REQUIRE(targeter->valid_aim(foe));
    REQUIRE(targeter->set_aim(foe));
    CHECK(targeter->is_affected(dest) == AFF_YES);
    you.duration[DUR_BLINK_COOLDOWN] = 5 * BASELINE_DELAY;
    CHECK_FALSE(neckbeard::blocked_reason().empty());
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_YOU, output);
    you.duration[DUR_BLINK_COOLDOWN] = 0;
    reader input(bytes, TAG_MINOR_VERSION);
    tag_read(input, TAG_YOU);
    CHECK(you.duration[DUR_BLINK_COOLDOWN] == 5 * BASELINE_DELAY);
}

TEST_CASE_METHOD(neckbeard_fixture, "Step Behind respects stasis and the Orb", "[neckbeard]")
{
    you.species = SP_FORMICID;
    CHECK_FALSE(neckbeard::blocked_reason().empty());
    you.species = SP_HUMAN;
    you.where_are_you = BRANCH_ZOT;
    CHECK_FALSE(neckbeard::blocked_reason().empty());
    you.where_are_you = BRANCH_DUNGEON;
    CHECK(neckbeard::blocked_reason().empty());
}

TEST_CASE_METHOD(neckbeard_fixture, "Step Behind preview does not reveal unseen occupants", "[neckbeard]")
{
    const coord_def start = you.pos();
    const coord_def foe = start + coord_def(2, 0);
    spawn(0, foe, ATT_HOSTILE);
    monster& hidden = spawn(1, start + coord_def(3, 0), ATT_HOSTILE);
    hidden.add_ench(ENCH_INVIS);
    REQUIRE_FALSE(you.can_see(hidden));
    auto targeter = neckbeard::step_targeter();
    REQUIRE(targeter->valid_aim(foe));
    CHECK(neckbeard::step_behind(foe) == spret::abort);
    CHECK(you.pos() == start);
    CHECK(you.magic_points == 5);
    CHECK(you.duration[DUR_BLINK_COOLDOWN] == 0);
}

TEST_CASE_METHOD(neckbeard_fixture, "Step Behind never lands on a hidden party member", "[neckbeard]")
{
    const coord_def start = you.pos();
    const coord_def foe = start + coord_def(2, 1);
    const coord_def dest = start + coord_def(3, 1);
    spawn(0, foe, ATT_HOSTILE);
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(start + coord_def(0, 1));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    party::get_player(0).set_position(dest);
    {
        party::scoped_player_context ctx(1);
        invalidate_los();
        const coord_def before = you.pos();
        auto targeter = neckbeard::step_targeter();
        CHECK_FALSE(targeter->valid_aim(foe));
        CHECK(neckbeard::step_behind(foe) == spret::abort);
        CHECK(you.pos() == before);
        CHECK(you.duration[DUR_BLINK_COOLDOWN] == 0);
    }
}
