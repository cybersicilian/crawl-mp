#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <set>

#include "act-iter.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "grape-monster.h"
#include "item-def.h"
#include "losglobal.h"
#include "mon-cast.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "status.h"
#include "state.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct awaken_fixture : vellum_fixture
{
#ifdef USE_TILE_LOCAL
    unwind_var<bool> headless{crawl_state.tiles_disabled, true};
#endif
    int old_max = env.max_mon_index;
    awaken_fixture()
    {
        init_monsters();
        init_spell_descs();
        init_mons_spells();
        init_duration_index();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.religion = GOD_NO_GOD;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 100;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~awaken_fixture()
    {
        party::remove_all_proxies();
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(awaken_fixture, "Awaken Armour keeps source identity and party ownership separate",
                 "[awaken-armour][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(4, 0));
    party::set_multiplayer(true);

    std::set<int> item_ids;
    for (int slot : {0, 1})
    {
        party::scoped_player_context context(slot);
        party::sync_shared_state_from_active();
        item_def& source = carry(0, OBJ_ARMOUR, ARM_ROBE, false);
        source.plus = 2 + slot;
        const int source_uid = source.give_unique_id();
        REQUIRE(item_ids.insert(source_uid).second);
        wear(0);
        REQUIRE(you.body_armour() == &source);
        REQUIRE(cast_awaken_armour(50, false) == spret::success);
        CHECK(you.body_armour() == &source);
        CHECK(source.props[ITEM_UNIQUE_ID].get_int() == source_uid);

        monster* echo = nullptr;
        for (monster_iterator mi; mi; ++mi)
            if (mi->type == MONS_ARMOUR_ECHO && mi->summoner == you.mid)
                echo = *mi;
        REQUIRE(echo);
        item_def* copy = echo->mslot_item(MSLOT_ARMOUR);
        REQUIRE(copy);
        CHECK(copy != &source);
        CHECK(copy->sub_type == source.sub_type);
        CHECK(copy->plus == source.plus);
        CHECK_FALSE(copy->props.exists(ITEM_UNIQUE_ID));
        CHECK(copy->flags & ISFLAG_SUMMONED);
        REQUIRE(grape_monster::suppress(*echo, MSLOT_ARMOUR));
        REQUIRE(copy->props.exists(ITEM_UNIQUE_ID));
        CHECK(copy->props[ITEM_UNIQUE_ID].get_int() != source_uid);
        CHECK(item_ids.insert(copy->props[ITEM_UNIQUE_ID].get_int()).second);
        CHECK(source.props[ITEM_UNIQUE_ID].get_int() == source_uid);
        CHECK(you.body_armour() == &source);
        party::sync_shared_state_from_active();
    }
    int echoes = 0;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_ARMOUR_ECHO)
            ++echoes;
    CHECK(echoes == 2);
}
