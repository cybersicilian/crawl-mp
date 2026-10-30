#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "env.h"
#include "branch.h"
#include "coordit.h"
#include "dungeon.h"
#include "imus-mirror.h"
#include "losglobal.h"
#include "mon-info.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "tags.h"
#include "test_vellum_fixture.h"
#include "throw.h"

namespace
{
struct imus_mirror_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    imus_mirror_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~imus_mirror_fixture()
    {
        dgn_reset_level(false);
        brdepth[BRANCH_DUNGEON] = old_depth;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(imus_mirror_fixture,
                 "Recasting Fragmentation recalls only its owner's distant mirror",
                 "[imus-mirror]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(1, 0));
    you.religion = GOD_IMUS_THEA;
    you.penance[GOD_IMUS_THEA] = 0;

    // Leave one vacant cell and a second cell occupied by a companion without
    // installing a proxy. The recall must not choose that companion's square.
    for (radius_iterator ri(you.pos(), 3, C_SQUARE, true); ri; ++ri)
        env.grid(*ri) = DNGN_ROCK_WALL;
    env.grid(you.pos()) = DNGN_FLOOR;
    env.grid(companion.pos()) = DNGN_FLOOR;
    const coord_def vacant = you.pos() + coord_def(-1, 0);
    env.grid(vacant) = DNGN_FLOOR;

    monster& own = env.mons[0];
    own.reset();
    own.type = MONS_IMUS_MIRROR;
    own.mid = 42201;
    own.summoner = you.mid;
    own.base_attitude = ATT_FRIENDLY;
    own.hit_points = own.max_hit_points = 10;
    own.set_hit_dice(1);
    own.set_position(you.pos() + coord_def(9, 0));
    env.grid(own.pos()) = DNGN_FLOOR;
    env.mgrid(own.pos()) = 0;
    env.mid_cache[own.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 1);
    own.add_ench(mon_enchant(ENCH_SUMMON_TIMER, &you, 100));
    you.props["imus_mirror"] = static_cast<int>(own.mid);

    monster& theirs = env.mons[1];
    theirs.reset();
    theirs.type = MONS_IMUS_MIRROR;
    theirs.mid = 42202;
    theirs.summoner = companion.mid;
    theirs.base_attitude = ATT_FRIENDLY;
    theirs.hit_points = theirs.max_hit_points = 10;
    theirs.set_hit_dice(1);
    theirs.set_position(you.pos() + coord_def(9, 1));
    env.grid(theirs.pos()) = DNGN_FLOOR;
    env.mgrid(theirs.pos()) = 1;
    env.mid_cache[theirs.mid] = 1;
    companion.props["imus_mirror"] = static_cast<int>(theirs.mid);
    const coord_def their_original = theirs.pos();
    invalidate_los();

    SECTION("a vacant square recalls the owner's mirror")
    {
        CHECK_FALSE(you.can_see(own));
        CHECK(imus_mirror::cast(10, false) == spret::success);
        CHECK(own.pos() == vacant);
        CHECK(own.get_ench(ENCH_SUMMON_TIMER).duration > 100);
        CHECK(theirs.pos() == their_original);
        CHECK(imus_mirror::find(companion) == &theirs);
    }
    SECTION("blocked recall still strengthens the existing mirror")
    {
        env.grid(vacant) = DNGN_ROCK_WALL;
        invalidate_los();
        const coord_def original = own.pos();
        CHECK(imus_mirror::cast(10, false) == spret::success);
        CHECK(own.pos() == original);
        CHECK(own.get_ench(ENCH_SUMMON_TIMER).duration > 100);
        CHECK(theirs.pos() == their_original);
    }

    you.props.erase("imus_mirror");
    companion.props.erase("imus_mirror");
    companion.save = nullptr;
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(imus_mirror_fixture,
                 "Fragmentation belongs to its own caster", "[imus-mirror]")
{
    you.religion = GOD_IMUS_THEA;
    you.penance[GOD_IMUS_THEA] = 0;
    init_monsters();
    const int old_max = env.max_mon_index;
    monster& mirror = env.mons[0];
    mirror.reset();
    mirror.type = MONS_IMUS_MIRROR;
    mirror.mid = 42101;
    mirror.summoner = you.mid;
    mirror.hit_points = mirror.max_hit_points = 10;
    mirror.set_hit_dice(1);
    mirror.set_position(you.pos() + coord_def(1, 0));
    env.mid_cache[mirror.mid] = 0;
    env.max_mon_index = max(old_max, 0);
    you.props["imus_mirror"] = static_cast<int>(mirror.mid);
    CHECK(imus_mirror::find(you) == &mirror);
    player other;
    other.mid = you.mid + 100;
    other.props["imus_mirror"] = static_cast<int>(mirror.mid);
    CHECK(imus_mirror::find(other) == nullptr);
    const monster_info info(&mirror);
    REQUIRE(info.props.exists("false_image_owner"));
    CHECK(info.props["false_image_owner"].get_int() == static_cast<int>(you.mid));

    // A successful cast orders the mirror to act later, rather than damaging
    // the target synchronously in the owner's action.
    init_spell_descs();
    monster& target = env.mons[1];
    target.reset();
    target.type = MONS_RAT;
    target.mid = 42102;
    target.base_attitude = ATT_HOSTILE;
    target.hit_points = target.max_hit_points = 100;
    target.set_hit_dice(1);
    target.set_position(you.pos() + coord_def(2, 0));
    env.mgrid(target.pos()) = 1;
    env.mid_cache[target.mid] = 1;
    env.max_mon_index = max(old_max, 1);
    imus_mirror::replay_spell(SPELL_MAGIC_DART, 30, target.pos());
    REQUIRE(mirror.props.exists("imus_echo_target"));
    CHECK(mirror.props["imus_echo_target"].get_int() == static_cast<int>(target.mid));
    CHECK(mirror.props["imus_echo_spell"].get_int() == SPELL_MAGIC_DART);
    CHECK(target.hit_points == 100);
    mirror.props.erase("imus_echo_target");
    you.penance[GOD_IMUS_THEA] = 1;
    imus_mirror::replay_spell(SPELL_MAGIC_DART, 30, target.pos());
    CHECK_FALSE(mirror.props.exists("imus_echo_target"));
    you.penance[GOD_IMUS_THEA] = 0;
    imus_mirror::replay_spell(SPELL_MAGIC_DART, 30, target.pos());
    REQUIRE(mirror.props.exists("imus_echo_target"));
    item_def projectile;
    projectile.base_type = OBJ_WEAPONS;
    projectile.sub_type = WPN_SHORTBOW;
    projectile.quantity = 1;
    projectile.rnd = 1;
    mirror.props["imus_echo_item"] = projectile;
    vector<unsigned char> bytes;
    writer output(&bytes);
    mirror.props.write(output);
    CrawlHashTable restored;
    reader input(bytes, TAG_MINOR_VERSION);
    restored.read(input);
    CHECK(restored["imus_echo_target"].get_int() == static_cast<int>(target.mid));
    CHECK(restored["imus_echo_spell"].get_int() == SPELL_MAGIC_DART);
    CHECK(restored["imus_echo_item"].get_item().sub_type == WPN_SHORTBOW);

    // A projected melee weapon is an item snapshot, not the currently
    // wielded object. Its replay keeps projection combat rules even when
    // pointer identity and the caster's current god no longer match.
    item_def blade;
    blade.base_type = OBJ_WEAPONS;
    blade.sub_type = WPN_DAGGER;
    blade.quantity = 1;
    blade.rnd = 1;
    ranged_attack_beam projected(you, blade, true);
    CHECK(projected.atk.is_illusory_projection());
    projected.beam.target = target.pos();
    imus_mirror::replay_projectile(projected);
    REQUIRE(mirror.props.exists("imus_echo_projection"));
    CHECK(mirror.props["imus_echo_projection"].get_bool());
    CHECK(mirror.props["imus_echo_item"].get_item().sub_type == WPN_DAGGER);
    CHECK(mirror.props["imus_echo_item"].get_item().quantity == 1);
    vector<unsigned char> projectile_bytes;
    writer projectile_output(&projectile_bytes);
    mirror.props.write(projectile_output);
    CrawlHashTable projectile_restored;
    reader projectile_input(projectile_bytes, TAG_MINOR_VERSION);
    projectile_restored.read(projectile_input);
    CHECK(projectile_restored["imus_echo_projection"].get_bool());
    CHECK(projectile_restored["imus_echo_item"].get_item().sub_type == WPN_DAGGER);
    item_def& detached = projectile_restored["imus_echo_item"].get_item();
    ranged_attack_beam recovered(you, detached,
        projectile_restored["imus_echo_projection"].get_bool());
    CHECK(recovered.atk.is_illusory_projection());
    CHECK(recovered.beam.drop_item == false);
    env.mgrid(target.pos()) = NON_MONSTER;
    env.mid_cache.erase(target.mid);
    target.reset();
    you.props.erase("imus_mirror");
    env.mid_cache.erase(mirror.mid);
    mirror.reset();
    env.max_mon_index = old_max;
}
