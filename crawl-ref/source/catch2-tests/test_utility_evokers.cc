#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "colour.h"
#include "evoke.h"
#include "env.h"
#include "dungeon.h"
#include "decks.h"
#include "item-name.h"
#include "item-prop.h"
#include "libconsole.h"
#include "libunix.h"
#include "losglobal.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-damage.h"
#include "spl-util.h"
#include "status.h"
#include "spl-cast.h"
#include "startup.h"
#include "test_vellum_fixture.h"
#ifdef USE_TILE
#include "rltiles/tiledef-main.h"
#include "tilepick.h"
#endif

namespace
{
struct utility_fixture : vellum_fixture
{
    utility_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
    }
    ~utility_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
    }
};
}

#ifdef USE_TILE
TEST_CASE_METHOD(utility_fixture, "Utility evokers display their active and inert art",
                 "[utility-evokers][item-tiles]")
{
    item_def item;
    item.base_type = OBJ_MISCELLANY;
    item.quantity = 1;
    item.sub_type = MISC_PIPE_OF_RECALL;
    REQUIRE(tileidx_item(item) == TILE_MISC_PIPE_OF_RECALL);
    item.sub_type = MISC_HEALING_MIST;
    evoker_debt(item.sub_type) = 0;
    REQUIRE(tileidx_item(item) == TILE_MISC_HEALING_MIST);
    evoker_debt(item.sub_type) = evoker_charge_xp_debt(item.sub_type);
    REQUIRE(tileidx_item(item) == TILE_MISC_HEALING_MIST_INERT);
    item.sub_type = MISC_AIR_HORN;
    evoker_debt(item.sub_type) = 0;
    REQUIRE(tileidx_item(item) == TILE_MISC_AIR_HORN);
    evoker_debt(item.sub_type) = evoker_charge_xp_debt(item.sub_type);
    REQUIRE(tileidx_item(item) == TILE_MISC_AIR_HORN_INERT);
}
#endif

TEST_CASE_METHOD(utility_fixture,
                 "Curated utility items retain stable identities and separate recharge",
                 "[utility-evokers]")
{
    REQUIRE(MISC_DECK_UNKNOWN == MISC_DUSTY_TOME + 1);
#if TAG_MAJOR_VERSION == 34
    REQUIRE(MISC_DECK_UNKNOWN == 37);
    REQUIRE(is_deck_type(MISC_DECK_UNKNOWN));
    REQUIRE_FALSE(is_deck_type(MISC_PIPE_OF_RECALL));
#else
    REQUIRE(MISC_DECK_UNKNOWN == 18);
#endif
    REQUIRE(MISC_PIPE_OF_RECALL == MISC_DECK_UNKNOWN + 1);
    REQUIRE(MISC_HEALING_MIST == MISC_PIPE_OF_RECALL + 1);
    REQUIRE(MISC_AIR_HORN == MISC_HEALING_MIST + 1);
    for (int subtype : {MISC_PIPE_OF_RECALL, MISC_HEALING_MIST, MISC_AIR_HORN})
    {
        CAPTURE(subtype);
        item_def item;
        item.base_type = OBJ_MISCELLANY;
        item.sub_type = subtype;
        item.quantity = 1;
        REQUIRE_FALSE(item_type_removed(OBJ_MISCELLANY, subtype));
        REQUIRE(item_ever_evokable(item));
        REQUIRE(item.name(DESC_DBNAME) != "buggy miscellaneous item");
        REQUIRE(is_xp_evoker(item) == (subtype != MISC_PIPE_OF_RECALL));
    }
    evoker_debt(MISC_HEALING_MIST) = 23;
    evoker_debt(MISC_AIR_HORN) = 47;
    REQUIRE(evoker_debt(MISC_HEALING_MIST) == 23);
    REQUIRE(evoker_debt(MISC_AIR_HORN) == 47);
}

TEST_CASE_METHOD(utility_fixture, "Utility evoker recharge belongs to each party member",
                 "[utility-evokers]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    evoker_debt(MISC_HEALING_MIST) = 5;
    evoker_debt(MISC_AIR_HORN) = 7;
    {
        party::scoped_player_context context(1);
        evoker_debt(MISC_HEALING_MIST) = 17;
        evoker_debt(MISC_AIR_HORN) = 19;
    }
    REQUIRE(evoker_debt(MISC_HEALING_MIST) == 5);
    REQUIRE(evoker_debt(MISC_AIR_HORN) == 7);
    {
        party::scoped_player_context context(1);
        REQUIRE(evoker_debt(MISC_HEALING_MIST) == 17);
        REQUIRE(evoker_debt(MISC_AIR_HORN) == 19);
    }
}

TEST_CASE_METHOD(utility_fixture,
                 "Recall pipe only calls the current player's own friendly summons",
                 "[utility-evokers]")
{
    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_ORC;
    target.hit_points = target.max_hit_points = 10;
    target.mid = 42701;
    target.base_attitude = ATT_FRIENDLY;
    target.summoner = you.mid;
    target.add_ench(mon_enchant(ENCH_SUMMON, &you, 100));
    REQUIRE(recall_pipe_can_recall(target));
    target.summoner = you.mid + 1;
    REQUIRE_FALSE(recall_pipe_can_recall(target));
    target.summoner = you.mid;
    target.base_attitude = ATT_HOSTILE;
    REQUIRE_FALSE(recall_pipe_can_recall(target));
}

TEST_CASE_METHOD(utility_fixture,
                 "Sonic waves spare their caster while affecting nearby actors",
                 "[utility-evokers][party]")
{
    // Sonic-wave animation refreshes the view even with no local terminal.
    if (str_to_colour("fire", -1, false, true) == -1)
        init_element_colours();
    init_duration_index();
    init_zap_index();
    init_spell_descs();
    init_spell_name_cache();
    enter_headless_mode();
    cio_init();
    cgotoxy(1, 1);
    const bool old_friendly_fire = party::friendly_fire_enabled();
    const int old_max = env.max_mon_index;
    for (int x = 25; x <= 55; ++x)
        for (int y = 20; y <= 50; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.religion = GOD_NO_GOD;
    you.on_current_level = true;
    you.current_vision = you.normal_vision = 7;
    you.hp = you.hp_max = 1000;
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(1, 0));
    party::set_friendly_fire(true);
    party::sync_all_proxies();
    party::switch_to_player(1);
    const monster* owner_proxy = party::get_proxy_monster(0);
    REQUIRE(owner_proxy);
    const monster saved_owner_proxy(*owner_proxy);
    party::switch_to_player(0);
    invalidate_los();
    REQUIRE(party::get_proxy_monster(1));
    CHECK_FALSE(party::get_proxy_monster(0));

    // Reproduce the observed live state: a stale proxy of the caster remains
    // on the caster's own square and must not be treated as another target.
    monster& self_proxy = env.mons[3];
    REQUIRE(self_proxy.type == MONS_NO_MONSTER);
    // Copy the genuine proxy created by party synchronization, including its
    // ghost metadata, before recreating the stale-proxy state from the live run.
    self_proxy = saved_owner_proxy;
    self_proxy.set_position(you.pos());
    env.mgrid(you.pos()) = self_proxy.mindex();
    env.max_mon_index = max(env.max_mon_index, self_proxy.mindex());
    REQUIRE(party::same_actor_identity(&you, &self_proxy));
    CHECK_FALSE(party::same_actor_identity(&you, party::get_proxy_monster(1)));

    monster& foe = env.mons[2];
    REQUIRE(foe.type == MONS_NO_MONSTER);
    foe.reset();
    foe.type = MONS_ORC;
    foe.mid = 52222;
    foe.hit_points = foe.max_hit_points = 1000;
    foe.set_hit_dice(1);
    foe.base_attitude = ATT_HOSTILE;
    foe.behaviour = BEH_SEEK;
    foe.set_position(you.pos() + coord_def(2, 0));
    env.mgrid(foe.pos()) = foe.mindex();
    env.mid_cache[foe.mid] = foe.mindex();
    env.max_mon_index = max(env.max_mon_index, foe.mindex());

    for (int i = 0; i < 10 && (companion.hp == 1000 || foe.hit_points == 1000); ++i)
    {
        REQUIRE(fire_los_attack_spell(SPELL_SONIC_WAVE, 100, &you)
                == spret::success);
        CHECK(you.hp == 1000);
    }
    CHECK(companion.hp < 1000);
    CHECK(foe.hit_points < 1000);
    party::set_friendly_fire(old_friendly_fire);
    env.max_mon_index = old_max;
}
