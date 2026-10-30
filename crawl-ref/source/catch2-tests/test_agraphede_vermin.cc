#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "act-iter.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "items.h"
#include "losglobal.h"
#include "mon-death.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "religion.h"
#include "spl-book.h"
#include "spl-util.h"
#include "test_vellum_fixture.h"

namespace
{
struct agraphede_gift_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    int old_max = env.max_mon_index;
    agraphede_gift_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.religion = GOD_AGRAPHEDE;
        you.raw_piety = piety_breakpoint(2);
        you.piety_hysteresis = 0;
        you.penance[GOD_AGRAPHEDE] = 0;
        you.num_current_gifts[GOD_AGRAPHEDE] = 0;
        you.num_total_gifts[GOD_AGRAPHEDE] = 0;
        init_spell_descs();
        invalidate_los();
    }
    ~agraphede_gift_fixture()
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

TEST_CASE_METHOD(agraphede_gift_fixture, "Agraphede grants two poison-themed books",
                 "[agraphede][agraphede-vermin]")
{
    you.raw_piety = piety_breakpoint(0) - 1;
    CHECK_FALSE(do_god_gift());
    you.raw_piety = piety_breakpoint(0);
    REQUIRE(do_god_gift());
    CHECK(you.num_total_gifts[GOD_AGRAPHEDE] == 1);
    CHECK_FALSE(do_god_gift());
    you.raw_piety = piety_breakpoint(2);
    REQUIRE(do_god_gift());
    CHECK(you.num_total_gifts[GOD_AGRAPHEDE] == 2);
    CHECK_FALSE(do_god_gift());

    int books = 0;
    bool first = false;
    bool second = false;
    for (stack_iterator si(you.pos()); si; ++si)
    {
        if (si->base_type != OBJ_BOOKS)
            continue;
        ++books;
        const auto spells = spells_in_book(*si);
        CHECK(spells.size() == 3);
        for (const auto spell : spells)
        {
            first |= spell == SPELL_EVAPORATE;
            second |= spell == SPELL_POISON_ARROW || spell == SPELL_OLGREBS_LAST_MERCY;
        }
    }
    CHECK(books == 2);
    CHECK(first);
    CHECK(second);
}

TEST_CASE_METHOD(agraphede_gift_fixture, "Corpse vermin are temporary and owner-capped",
                 "[agraphede][agraphede-vermin]")
{
    monster& victim = env.mons[0];
    victim.reset();
    victim.type = MONS_ORC;
    victim.mid = 52701;
    victim.hit_points = victim.max_hit_points = 20;
    victim.set_hit_dice(1);
    victim.base_attitude = ATT_HOSTILE;
    victim.behaviour = BEH_SEEK;
    victim.set_position(you.pos() + coord_def(2, 0));
    env.mgrid(victim.pos()) = 0;
    env.mid_cache[victim.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    REQUIRE(you.can_see(victim));
    for (int i = 0; i < 3; ++i)
        REQUIRE(agraphede_corpse_vermin(victim, 0, true));
    CHECK_FALSE(agraphede_corpse_vermin(victim, 0, true));
    int count = 0;
    for (monster_iterator mi; mi; ++mi)
        if (mi->props.exists("agraphede_corpse_vermin"))
        {
            ++count;
            CHECK(mi->summoner == you.mid);
            CHECK(mi->friendly());
            CHECK(mi->is_summoned());
        }
    CHECK(count == 3);
}

TEST_CASE_METHOD(agraphede_gift_fixture, "Agraphede books are gifted to each follower independently",
                 "[agraphede][agraphede-vermin]")
{
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.set_position(you.pos() + coord_def(-1, 0));
    party::set_multiplayer(true);
    you.num_total_gifts[GOD_AGRAPHEDE] = 0;
    other.num_total_gifts[GOD_AGRAPHEDE] = 0;
    {
        party::scoped_player_context context(1);
        REQUIRE(do_god_gift());
        CHECK(you.num_total_gifts[GOD_AGRAPHEDE] == 1);
    }
    CHECK(party::active_slot() == 0);
    CHECK(you.num_total_gifts[GOD_AGRAPHEDE] == 0);
    CHECK(other.num_total_gifts[GOD_AGRAPHEDE] == 1);
}

TEST_CASE_METHOD(agraphede_gift_fixture, "Corpse vermin belong only to the credited player",
                 "[agraphede][agraphede-vermin]")
{
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.religion = GOD_NO_GOD;
    other.set_position(you.pos() + coord_def(-1, 0));
    party::set_multiplayer(true);
    monster& victim = env.mons[0];
    victim.reset();
    victim.type = MONS_ORC;
    victim.mid = 52702;
    victim.hit_points = victim.max_hit_points = 20;
    victim.set_hit_dice(1);
    victim.base_attitude = ATT_HOSTILE;
    victim.behaviour = BEH_SEEK;
    victim.set_position(you.pos() + coord_def(2, 0));
    env.mgrid(victim.pos()) = 0;
    env.mid_cache[victim.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    CHECK_FALSE(agraphede_corpse_vermin(victim, -1, true));
    CHECK_FALSE(agraphede_corpse_vermin(victim, 1, true));
    REQUIRE(agraphede_corpse_vermin(victim, 0, true));
    int count = 0;
    for (monster_iterator mi; mi; ++mi)
        if (mi->props.exists("agraphede_corpse_vermin"))
        {
            ++count;
            CHECK(mi->summoner == you.mid);
            CHECK(mi->summoner != other.mid);
        }
    CHECK(count == 1);
}
