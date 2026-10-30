#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "agraphede-web.h"
#include "act-iter.h"
#include "dungeon.h"
#include "env.h"
#include "fineff.h"
#include "god-type.h"
#include "losglobal.h"
#include "mon-explode.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#include "zap-type.h"

#include <memory>

namespace
{
struct web_blast_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    bool old_friendly_fire = party::friendly_fire_enabled();
    web_blast_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.set_position(coord_def(40, 35));
        you.hp = you.hp_max = 100;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        you.religion = GOD_AGRAPHEDE;
        you.penance[GOD_AGRAPHEDE] = 0;
        invalidate_los();
    }
    ~web_blast_fixture()
    {
        party::remove_all_proxies();
        party::set_friendly_fire(old_friendly_fire);
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

TEST_CASE_METHOD(web_blast_fixture,
                 "Web ball explosion protects only its owner in good standing",
                 "[agraphede][agra-web]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.religion = GOD_NO_GOD;
    companion.set_position(coord_def(40, 36));
    party::set_multiplayer(true);
    party::set_friendly_fire(true);
    party::sync_all_proxies();
    REQUIRE(party::get_proxy_monster(1));

    REQUIRE(agra_web::summon(40, 1));
    monster* ball = nullptr;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_AGRAPHEDE_WEB_BALL)
            ball = *mi;
    REQUIRE(ball);
    REQUIRE(ball->summoner == you.mid);
    env.mgrid(ball->pos()) = NON_MONSTER;
    ball->set_position(coord_def(41, 35));
    env.mgrid(ball->pos()) = ball->mindex();

    unique_ptr<party::scoped_player_context> active_companion;
    SECTION("the owner is active") { }
    SECTION("the owner is a party proxy")
    {
        // Switch the actor and its proxies without invoking the interactive
        // redraw path, which needs an initialized console.
        active_companion.reset(new party::scoped_player_context(1, true));
        REQUIRE(party::get_proxy_monster(0));
    }
    SECTION("penance removes the owner's protection")
    {
        party::get_player(0).penance[GOD_AGRAPHEDE] = 1;
    }
    SECTION("the party friendly-fire setting still protects companions")
    {
        party::set_friendly_fire(false);
    }

    const bool protected_owner = !party::get_player(0).penance[GOD_AGRAPHEDE];
    REQUIRE(explode_monster(ball, KILL_NON_ACTOR, false));
    fire_final_effects();
    CHECK((party::get_player(0).attribute[ATTR_HELD] != 0) == !protected_owner);
    CHECK((party::get_player(0).hp == 100) == protected_owner);
    CHECK((companion.attribute[ATTR_HELD] != 0) == party::friendly_fire_enabled());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Agraphede web balls preserve their owner and burst shape",
                 "[agraphede][agra-web]")
{
    init_monsters();
    REQUIRE(mon_explodes_on_death(MONS_AGRAPHEDE_WEB_BALL));
    monster ball;
    ball.type = MONS_AGRAPHEDE_WEB_BALL;
    ball.summoner = you.mid;
    ball.set_position(you.pos() + coord_def(1, 0));
    ball.set_hit_dice(8);
    bolt blast;
    setup_agraphede_web_explosion(blast, ball);
    CHECK(blast.agraphede_web);
    CHECK(blast.source_id == you.mid);
    CHECK(blast.agent() == &you);
    CHECK(blast.flavour == BEAM_ENSNARE);
    CHECK(blast.ex_size == 2);
    CHECK(blast.damage.num == 3);
    CHECK(blast.damage.size == 15);
    you.religion = GOD_AGRAPHEDE;
    const int hp = you.hp;
    blast.affect_actor(&you);
    CHECK(you.hp == hp);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Hornet Sting has a dedicated poison beam", "[agraphede][agra-web]")
{
    init_zap_index();
    bolt sting;
    zappy(ZAP_AGRAPHEDE_STING, 50, false, sting);
    CHECK(sting.flavour == BEAM_AGRAPHEDE_STING);
    CHECK_FALSE(sting.is_enchantment());
    CHECK(sting.damage.num == 4);
    CHECK_FALSE(sting.pierce);
}
