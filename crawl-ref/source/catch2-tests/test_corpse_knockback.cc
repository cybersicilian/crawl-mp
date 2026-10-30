#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "corpse-knockback.h"
#include "corpse.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "items.h"
#include "losglobal.h"
#include "mapdef.h"
#include "melee-attack.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "status.h"
#include "test_vellum_fixture.h"

namespace
{
struct corpse_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    int old_depth = brdepth[BRANCH_DUNGEON];
    bool old_friendly_fire = party::friendly_fire_enabled();

    corpse_fixture()
    {
        static const bool ready = []() { init_duration_index(); return true; }();
        (void)ready;
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 35; x <= 48; ++x)
            for (int y = 30; y <= 40; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.religion = GOD_NO_GOD;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 100;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }

    ~corpse_fixture()
    {
        party::remove_all_proxies();
        party::set_friendly_fire(old_friendly_fire);
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        brdepth[BRANCH_DUNGEON] = old_depth;
        invalidate_los();
    }

    int corpse_at(coord_def pos)
    {
        int index = get_mitm_slot(0);
        REQUIRE(index != NON_ITEM);
        item_def& item = env.item[index];
        item.clear();
        item.base_type = OBJ_CORPSES;
        item.sub_type = CORPSE_BODY;
        item.mon_type = MONS_RAT;
        item.freshness = FRESHEST_CORPSE;
        item.quantity = 1;
        REQUIRE(move_item_to_grid(&index, pos, true));
        return index;
    }
};
}

TEST_CASE_METHOD(corpse_fixture, "Lethal melee launches only real corpses from maces",
                 "[corpse-knockback][combat]")
{
    bool mace = true;
    bool leaves_corpse = true;
    SECTION("mace killing blows") { }
    SECTION("another weapon") { mace = false; }
    SECTION("a consumed corpse") { leaves_corpse = false; }

    item_def& weapon = carry(0, OBJ_WEAPONS,
                             mace ? WPN_GREAT_MACE : WPN_LONG_SWORD, false);
    weapon.plus = 20;
    you.equipment.add(weapon, SLOT_WEAPON);
    you.equipment.update();
    const coord_def death_pos = you.pos() + coord_def(1, 0);
    bool saw_launch = false;
    const int kills = mace && leaves_corpse ? 20 : 1;
    for (int attempt = 0; attempt < kills && !saw_launch; ++attempt)
    {
        const int victim_mid = 53000 + attempt;
        monster& victim = env.mons[0];
        victim.reset();
        victim.type = MONS_RAT;
        victim.mid = victim_mid;
        victim.hit_points = victim.max_hit_points = 1;
        victim.set_hit_dice(1);
        victim.base_attitude = ATT_HOSTILE;
        victim.behaviour = BEH_SEEK;
        victim.foe = MHITYOU;
        victim.set_position(death_pos);
        victim.props[ALWAYS_CORPSE_KEY] = true;
        if (!leaves_corpse)
            victim.props[NEVER_CORPSE_KEY] = true;
        env.mgrid(death_pos) = 0;
        env.mid_cache[victim.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);

        for (int swing_count = 0; swing_count < 100 && victim.alive(); ++swing_count)
        {
            melee_attack swing(&you, &victim);
            swing.launch_attack_set(true);
        }
        REQUIRE_FALSE(victim.alive());

        bool found = false;
        for (int x = death_pos.x; x <= death_pos.x + 4; ++x)
            for (stack_iterator si(coord_def(x, death_pos.y)); si; ++si)
                if (si->is_type(OBJ_CORPSES, CORPSE_BODY)
                    && si->props.exists(MONSTER_MID)
                    && si->props[MONSTER_MID].get_int() == victim_mid)
                {
                    found = true;
                    if (item_pos(*si) != death_pos)
                        saw_launch = true;
                }
        CHECK(found == leaves_corpse);
        if (!mace)
            CHECK_FALSE(saw_launch);
    }
    if (mace && leaves_corpse)
        CHECK(saw_launch);
}

TEST_CASE_METHOD(corpse_fixture, "Corpse knockback takes single grid steps and respects terrain",
                 "[corpse-knockback]")
{
    const coord_def start = you.pos() + coord_def(2, 0);
    const int index = corpse_at(start);
    SECTION("a reach attack does not skip intervening squares")
    {
        env.grid(start + coord_def(2, 0)) = DNGN_ROCK_WALL;
        corpse_knockback::launch(env.item[index], you, you.pos(), 4, 10);
        CHECK(item_pos(env.item[index]) == start + coord_def(1, 0));
    }
    SECTION("item-destroying terrain stops the corpse")
    {
        env.grid(start + coord_def(1, 0)) = DNGN_LAVA;
        corpse_knockback::launch(env.item[index], you, you.pos(), 4, 10);
        CHECK(env.item[index].defined());
        CHECK(item_pos(env.item[index]) == start);
    }
    SECTION("no movement is possible without a direction")
    {
        corpse_knockback::launch(env.item[index], you, start, 4, 10);
        CHECK(item_pos(env.item[index]) == start);
    }
    SECTION("non-corpse items cannot be launched")
    {
        env.item[index].base_type = OBJ_GOLD;
        corpse_knockback::launch(env.item[index], you, you.pos(), 4, 10);
        CHECK(item_pos(env.item[index]) == start);
    }
}

TEST_CASE_METHOD(corpse_fixture, "A launched corpse collides without occupying the victim's square",
                 "[corpse-knockback]")
{
    const coord_def start = you.pos() + coord_def(1, 0);
    const int index = corpse_at(start);
    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_RAT;
    target.mid = 30001;
    target.hit_points = target.max_hit_points = 200;
    target.set_hit_dice(1);
    target.base_attitude = ATT_HOSTILE;
    target.behaviour = BEH_SEEK;
    target.foe = MHITYOU;
    target.set_position(start + coord_def(2, 0));
    env.mgrid(target.pos()) = 0;
    env.mid_cache[target.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);

    corpse_knockback::launch(env.item[index], you, you.pos(), 4, 100);
    CHECK(item_pos(env.item[index]) == start + coord_def(1, 0));
    CHECK(target.hit_points < 200);
    CHECK(target.hit_points > 0);
}

TEST_CASE_METHOD(corpse_fixture, "Corpse impacts spare friendly and good-neutral monsters",
                 "[corpse-knockback]")
{
    const coord_def start = you.pos() + coord_def(1, 0);
    const int index = corpse_at(start);
    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_RAT;
    target.mid = 30002;
    target.hit_points = target.max_hit_points = 200;
    target.set_hit_dice(1);
    target.behaviour = BEH_SEEK;
    target.set_position(start + coord_def(1, 0));
    env.mgrid(target.pos()) = 0;
    env.mid_cache[target.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    SECTION("friendly") { target.base_attitude = ATT_FRIENDLY; }
    SECTION("good-neutral") { target.base_attitude = ATT_GOOD_NEUTRAL; }

    corpse_knockback::launch(env.item[index], you, you.pos(), 2, 100);
    CHECK(item_pos(env.item[index]) == start);
    CHECK(target.hit_points == 200);
}

TEST_CASE_METHOD(corpse_fixture, "Party friendly-fire protection applies to corpse impacts",
                 "[corpse-knockback][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(2, 0));
    party::set_multiplayer(true);
    SECTION("friendly fire disabled") { party::set_friendly_fire(false); }
    SECTION("friendly fire enabled") { party::set_friendly_fire(true); }
    const bool damage_allowed = party::friendly_fire_enabled();
    party::sync_all_proxies();
    REQUIRE(party::get_proxy_monster(1));
    const int index = corpse_at(you.pos() + coord_def(1, 0));

    corpse_knockback::launch(env.item[index], you, you.pos(), 2, 25);
    CHECK((companion.hp < 100) == damage_allowed);
    CHECK(item_pos(env.item[index]) == you.pos() + coord_def(1, 0));
}
