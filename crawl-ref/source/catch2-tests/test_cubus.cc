#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "cubus.h"
#include "beam.h"
#include "colour.h"
#include "dungeon.h"
#include "env.h"
#include "fprop.h"
#include "losglobal.h"
#include "mon-cast.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-util.h"
#include "state.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct cubus_fixture : vellum_fixture
{
#ifdef USE_TILE_LOCAL
    unwind_var<bool> headless{crawl_state.tiles_disabled, true};
#endif
    int old_max = env.max_mon_index;
    cubus_fixture()
    {
        init_monsters();
        if (str_to_colour("fire", -1, false, true) == -1)
            init_element_colours();
        dgn_reset_level(false);
        for (int x = 35; x <= 48; ++x)
            for (int y = 30; y <= 40; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HUMAN;
        you.hp = you.hp_max = 100;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~cubus_fixture()
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
    monster& caster()
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_ORC_WIZARD;
        mon.mid = 54321;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(10);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.set_position(you.pos() + coord_def(3, 0));
        env.mgrid(mon.pos()) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
};
}

TEST_CASE_METHOD(cubus_fixture, "Cubus disarm keeps the weapon in inventory",
                 "[cubus][disarm]")
{
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    monster& mon = caster();
    REQUIRE(cubus::can_affect(mon, you, cubus::effect::disarm));
    REQUIRE(cubus::apply(mon, you, cubus::effect::disarm, 5000));
    CHECK(weapon.defined());
    CHECK(you.equipment.find_equipped_slot(weapon) == SLOT_UNUSED);
    CHECK_FALSE(cubus::can_affect(mon, you, cubus::effect::disarm));
}

TEST_CASE_METHOD(cubus_fixture, "Cubus leaves bound and flight-critical gear alone",
                 "[cubus][disarm]")
{
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    monster& mon = caster();
    SECTION("cursed equipment") { weapon.flags |= ISFLAG_CURSED; }
    SECTION("melded equipment") { you.equipment.get_entry_for(weapon).melded = true; }
    CHECK_FALSE(cubus::can_affect(mon, you, cubus::effect::disarm));
    CHECK(weapon.defined());
}

TEST_CASE_METHOD(cubus_fixture, "Cubus cannot remove the only flight source over lava",
                 "[cubus][disarm]")
{
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    REQUIRE(make_item_randart(weapon, true));
    for (int i = 0; i < ART_PROPERTIES; ++i)
        artefact_set_property(weapon, static_cast<artefact_prop_type>(i), 0);
    artefact_set_property(weapon, ARTP_FLY, 1);
    you.equipment.update();
    REQUIRE(you.equip_flight() == 1);
    monster& mon = caster();
    REQUIRE(cubus::can_affect(mon, you, cubus::effect::disarm));
    env.grid(you.pos()) = DNGN_LAVA;
    CHECK_FALSE(cubus::can_affect(mon, you, cubus::effect::disarm));
    CHECK(you.equipment.find_equipped_slot(weapon) == SLOT_WEAPON);
}

TEST_CASE_METHOD(cubus_fixture, "Cubus allure only affects living foes with jewellery",
                 "[cubus][allure]")
{
    item_def& ring = carry(0, OBJ_JEWELLERY, RING_FIRE, false);
    wear(0, SLOT_RING);
    monster& mon = caster();
    REQUIRE(cubus::can_affect(mon, you, cubus::effect::allure));
    for (int i = 0; i < 40 && you.equipment.find_equipped_slot(ring) != SLOT_UNUSED; ++i)
        cubus::apply(mon, you, cubus::effect::allure, 50);
    CHECK(ring.defined());
    CHECK(you.equipment.find_equipped_slot(ring) == SLOT_UNUSED);
}

TEST_CASE_METHOD(cubus_fixture, "Cubus allure cannot strip undead jewellery",
                 "[cubus][allure]")
{
    item_def& ring = carry(0, OBJ_JEWELLERY, RING_FIRE, false);
    wear(0, SLOT_RING);
    you.species = SP_GHOUL;
    monster& mon = caster();
    REQUIRE(you.holiness() & MH_UNDEAD);
    CHECK_FALSE(cubus::can_affect(mon, you, cubus::effect::allure));
    CHECK_FALSE(cubus::apply(mon, you, cubus::effect::allure, 50));
    CHECK(you.equipment.find_equipped_slot(ring) == SLOT_RING);
}

TEST_CASE_METHOD(cubus_fixture, "Cubus disarms the targeted party member",
                 "[cubus][party]")
{
    item_def& leader_weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    monster& mon = caster();
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.set_position(you.pos() + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = party::get_proxy_monster(1);
    REQUIRE(proxy);
    REQUIRE(cubus::apply(mon, *proxy, cubus::effect::disarm, 5000));
    CHECK(you.equipment.find_equipped_slot(leader_weapon) == SLOT_WEAPON);
    CHECK(companion.inv[0].defined());
    CHECK(companion.equipment.find_equipped_slot(companion.inv[0]) == SLOT_UNUSED);
}

TEST_CASE_METHOD(cubus_fixture, "Cubus disarm traces its target and respects sanctuary",
                 "[cubus][casting]")
{
    init_spell_descs();
    init_mons_spells();
    unwind_var<bool> game_test(crawl_state.test, true);
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    monster& mon = caster();
    mon.foe = MHITYOU;
    mon.target = you.pos();
    mon.spells = {{SPELL_CUBUS_DISARM, 29, MON_SPELL_MAGICAL}};
    REQUIRE(is_mons_cast_possible(mon, SPELL_CUBUS_DISARM));

    SECTION("a cast reaches and disarms its target")
    {
        mon.set_hit_dice(200);
        for (int i = 0; i < 20 && you.equipment.find_equipped_slot(weapon) != SLOT_UNUSED; ++i)
            REQUIRE(try_mons_cast(mon, SPELL_CUBUS_DISARM));
        CHECK(you.equipment.find_equipped_slot(weapon) == SLOT_UNUSED);
        CHECK(weapon.defined());
        return;
    }
    SECTION("a friendly blocker intercepts the hex")
    {
        monster& blocker = env.mons[1];
        blocker.reset();
        blocker.type = MONS_ORC;
        blocker.mid = 54322;
        blocker.hit_points = blocker.max_hit_points = 50;
        blocker.set_hit_dice(4);
        blocker.base_attitude = ATT_HOSTILE;
        blocker.behaviour = BEH_SEEK;
        blocker.set_position(you.pos() + coord_def(1, 0));
        env.mgrid(blocker.pos()) = 1;
        env.mid_cache[blocker.mid] = 1;
        env.max_mon_index = max(env.max_mon_index, 1);
        CHECK_FALSE(is_mons_cast_possible(mon, SPELL_CUBUS_DISARM));
    }
    SECTION("a solid wall blocks targeting")
    {
        env.grid(you.pos() + coord_def(1, 0)) = DNGN_ROCK_WALL;
        invalidate_los();
        CHECK_FALSE(is_mons_cast_possible(mon, SPELL_CUBUS_DISARM));
    }
    SECTION("a transparent wall blocks the hex")
    {
        env.grid(you.pos() + coord_def(1, 0)) = DNGN_CLEAR_ROCK_WALL;
        invalidate_los();
        CHECK_FALSE(is_mons_cast_possible(mon, SPELL_CUBUS_DISARM));
    }
    SECTION("sanctuary protects the target")
    {
        unwind_var<int> sanctuary_time(env.sanctuary_time, 10);
        env.pgrid(you.pos()) |= FPROP_SANCTUARY_1;
        CHECK_FALSE(is_mons_cast_possible(mon, SPELL_CUBUS_DISARM));
        env.pgrid(you.pos()) &= ~FPROP_SANCTUARY_1;
    }
    CHECK(you.equipment.find_equipped_slot(weapon) == SLOT_WEAPON);
}

TEST_CASE_METHOD(cubus_fixture, "Cubus can disarm a distant monster but respects immunity",
                 "[cubus][monster]")
{
    monster& mon = caster();
    monster& target = env.mons[1];
    target.reset();
    target.type = MONS_ORC;
    SECTION("will-immune target") { target.type = MONS_IRON_GOLEM; }
    target.mid = 54322;
    target.hit_points = target.max_hit_points = 100;
    target.set_hit_dice(8);
    target.base_attitude = ATT_FRIENDLY;
    target.behaviour = BEH_SEEK;
    target.set_position(mon.pos() + coord_def(3, 0));
    env.mgrid(target.pos()) = 1;
    env.mid_cache[target.mid] = 1;
    env.max_mon_index = max(env.max_mon_index, 1);
    item_def& weapon = env.item[0];
    weapon.clear();
    weapon.base_type = OBJ_WEAPONS;
    weapon.sub_type = WPN_DAGGER;
    weapon.quantity = 1;
    target.inv[MSLOT_WEAPON] = 0;
    weapon.set_holding_monster(target);
    REQUIRE(cubus::can_affect(mon, target, cubus::effect::disarm));
    if (target.type == MONS_IRON_GOLEM)
    {
        CHECK(target.willpower() == WILL_INVULN);
        CHECK_FALSE(cubus::apply(mon, target, cubus::effect::disarm, 5000));
        CHECK(target.mslot_item(MSLOT_WEAPON) == &weapon);
    }
    else
    {
        REQUIRE(cubus::apply(mon, target, cubus::effect::disarm, 5000));
        CHECK_FALSE(target.mslot_item(MSLOT_WEAPON));
        CHECK(weapon.defined());
        CHECK(item_pos(weapon) == target.pos());
    }
}
