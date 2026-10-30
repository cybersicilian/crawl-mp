#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>

#include "branch.h"
#include "beam.h"
#include "dungeon.h"
#include "env.h"
#include "icicle-burst.h"
#include "imus-spectrum.h"
#include "imus-mirror.h"
#include "losglobal.h"
#include "map-cell.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "spl-zap.h"
#include "terrain.h"
#include "throw.h"
#include "test_vellum_fixture.h"

namespace
{
struct icicle_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    int old_max_mon_index = env.max_mon_index;
    icicle_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~icicle_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        brdepth[BRANCH_DUNGEON] = old_depth;
        env.max_mon_index = old_max_mon_index;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(icicle_fixture, "Icicle Burst previews the same spread it casts",
                 "[icicle-burst]")
{
    CHECK(icicle_burst_count(0) == 3);
    CHECK(icicle_burst_count(100) == 11);
    const coord_def origin = you.pos();
    icicle_burst_targeter preview(&you, 100, 5);
    REQUIRE(preview.set_aim(origin + coord_def(3, 0)));
    CHECK(preview.rays.size() == 11);
    CHECK(preview.is_affected(origin) == AFF_NO);
    CHECK(preview.is_affected(origin + coord_def(1, 0)) > AFF_NO);
    CHECK(preview.is_affected(origin + coord_def(-1, 0)) == AFF_NO);
    CHECK_FALSE(preview.valid_aim(origin));
    CHECK_FALSE(preview.valid_aim(origin + coord_def(6, 0)));
    CHECK(cast_icicle_burst(100, origin, false) == spret::abort);
    CHECK(cast_icicle_burst(100, origin + coord_def(3, 0), true) == spret::fail);
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum records a timed five-ray effect",
                 "[imus-spectrum]")
{
    you.religion = GOD_IMUS_THEA;
    you.penance[GOD_IMUS_THEA] = 0;
    init_spell_descs();
    init_zap_index();
    you.duration[DUR_IMUS_SPECTRUM] = 0;
    imus_spectrum_activate();
    CHECK(you.duration[DUR_IMUS_SPECTRUM] > 0);
    CHECK(imus_spectrum_active());
    you.penance[GOD_IMUS_THEA] = 1;
    CHECK_FALSE(imus_spectrum_active());
    you.penance[GOD_IMUS_THEA] = 0;
    you.religion = GOD_NO_GOD;
    CHECK_FALSE(imus_spectrum_active());
    you.religion = GOD_IMUS_THEA;
    CHECK(you.duration[DUR_IMUS_SPECTRUM] <= 100 * BASELINE_DELAY);
    CHECK(imus_spectrum_spell(SPELL_MAGIC_DART));
    CHECK_FALSE(imus_spectrum_spell(SPELL_FIREBALL));
    CHECK_FALSE(imus_spectrum_spell(SPELL_DIG));
    icicle_burst_targeter preview(&you, 20, 5);
    REQUIRE(preview.set_aim(you.pos() + coord_def(3, 0)));
    CHECK(preview.rays.size() == 5);
    CHECK(preview.is_affected(you.pos()) == AFF_NO);
    CHECK(preview.is_affected(you.pos() + coord_def(1, 0)) > AFF_NO);
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum belongs to the activating party member",
                 "[imus-spectrum]")
{
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    party::set_multiplayer(true);
    you.duration[DUR_IMUS_SPECTRUM] = 0;
    other.duration[DUR_IMUS_SPECTRUM] = 0;
    {
        party::scoped_player_context context(1);
        imus_spectrum_activate();
        CHECK(you.duration[DUR_IMUS_SPECTRUM] > 0);
        CHECK(party::get_player(0).duration[DUR_IMUS_SPECTRUM] == 0);
        party::get_player(0).duration[DUR_IMUS_SPECTRUM] = 20;
        you.props["imus_mirror"] = 999999;
        imus_mirror::abandon();
        CHECK(you.duration[DUR_IMUS_SPECTRUM] == 0);
        CHECK_FALSE(you.props.exists("imus_mirror"));
        CHECK(party::get_player(0).duration[DUR_IMUS_SPECTRUM] == 20);
    }
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum previews its actual rebounding rays",
                 "[imus-spectrum][party]")
{
    init_spell_descs();
    init_zap_index();
    you.religion = GOD_IMUS_THEA;
    you.raw_piety = piety_breakpoint(1);
    you.penance[GOD_IMUS_THEA] = 0;
    const coord_def origin = you.pos();
    for (int y = -6; y <= 6; ++y)
    {
        const coord_def wall = origin + coord_def(2, y);
        env.grid(wall) = DNGN_ROCK_WALL;
        env.map_knowledge(wall).set_feature(DNGN_ROCK_WALL);
    }
    invalidate_los();
    bolt projectile = imus_spectrum_spell_projectile(SPELL_MAGIC_DART, 30, 7);
    imus_spectrum_targeter preview(&you, 7, projectile);
    REQUIRE(preview.set_aim(origin + coord_def(1, 0)));
    REQUIRE(preview.endpoints().size() == 5);
    int rebound_count = 0;
    for (coord_def end : preview.endpoints())
    {
        bolt traced = projectile;
        traced.target = end;
        traced.chose_ray = false;
        player_beam_tracer tracer;
        fire_partial_player_tracer(spell_to_zap(SPELL_MAGIC_DART), 30,
                                  tracer, traced);
        // Magic Dart is non-piercing and stops when it returns to its immune
        // caster. A repeated outbound cell demonstrates the reflected leg;
        // the piercing projectile test separately checks travel behind them.
        rebound_count += count(traced.path_taken.begin(), traced.path_taken.end(),
                               origin + coord_def(1, 0)) >= 2;
        for (const coord_def& cell : traced.path_taken)
            if (cell != origin && !cell_is_solid(cell))
                CHECK(preview.is_affected(cell) > AFF_NO);
    }
    CHECK(rebound_count > 0);
}

TEST_CASE_METHOD(icicle_fixture, "Rebound preview preserves piercing projectile properties",
                 "[imus-spectrum][party]")
{
    init_zap_index();
    you.religion = GOD_IMUS_THEA;
    you.raw_piety = piety_breakpoint(1);
    you.penance[GOD_IMUS_THEA] = 0;
    const coord_def origin = you.pos();
    for (int y = -6; y <= 6; ++y)
    {
        const coord_def wall = origin + coord_def(2, y);
        env.grid(wall) = DNGN_ROCK_WALL;
        env.map_knowledge(wall).set_feature(DNGN_ROCK_WALL);
    }
    invalidate_los();
    bolt projectile;
    projectile.set_agent(&you);
    projectile.source = origin;
    projectile.range = 7;
    projectile.flavour = BEAM_MISSILE;
    projectile.pierce = true;
    projectile.name = "test missile";
    targeter_beam preview(&you, 7, ZAP_MAGIC_DART, SPELL_NO_SPELL, 0, 0, 0);
    preview.set_projectile(projectile);
    CHECK(preview.beam.pierce);
    REQUIRE(preview.set_aim(origin + coord_def(1, 0)));
    CHECK(preview.is_affected(origin + coord_def(-1, 0)) > AFF_NO);
    projectile.target = origin + coord_def(1, 0);
    player_beam_tracer tracer;
    projectile.fire(tracer);
    // The tracer rolls its counters back but leaves the traversed path.
    CHECK(find(projectile.path_taken.begin(), projectile.path_taken.end(),
               origin + coord_def(-1, 0)) != projectile.path_taken.end());
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum previews and traces a real javelin without dropping it",
                 "[imus-spectrum][party]")
{
    init_monsters();
    init_zap_index();
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    companion.your_name = "Lyra";
    companion.set_position(you.pos() + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(companion.pos());
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));
    REQUIRE(you.can_see(companion));
    item_def& javelin = you.inv[0];
    javelin.clear();
    javelin.base_type = OBJ_MISSILES;
    javelin.sub_type = MI_JAVELIN;
    javelin.quantity = 1;
    javelin.rnd = 1;
    javelin.link = 0;
    ranged_attack_beam attack(you, javelin);
    attack.beam.drop_item = true; // the committed central shot owns this item

    targeter_beam ordinary(&you, 7, ZAP_MAGIC_DART, SPELL_NO_SPELL, 0, 0, 0);
    ordinary.set_projectile(attack.beam);
    CHECK_FALSE(ordinary.beam.drop_item);
    REQUIRE(ordinary.set_aim(you.pos() + coord_def(3, 0)));
    imus_spectrum_targeter preview(&you, 7, attack.beam);
    REQUIRE(preview.set_aim(you.pos() + coord_def(3, 0)));
    CHECK(attack.beam.drop_item);
    player_beam_tracer tracer;
    imus_spectrum_trace_side_rays(attack.beam, preview, tracer);
    CHECK(attack.beam.drop_item);
    CHECK(javelin.quantity == 1);
    CHECK(any_of(tracer.bad_attack_targets.begin(), tracer.bad_attack_targets.end(),
                 [proxy](const player_beam_tracer::bad_target& target)
                 { return target.mon == proxy; }));
    CHECK(tracer.describe_attack_targets().find("Lyra") != string::npos);
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum tracer distinguishes its owner from companions",
                 "[imus-spectrum][party]")
{
    init_monsters();
    init_spell_descs();
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    companion.your_name = "Lyra";
    companion.set_position(you.pos() + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(companion.pos());
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));
    monster owner_proxy = *proxy;
    owner_proxy.props["party_player_slot"] = 0;

    bolt beam;
    beam.set_agent(&you);
    beam.flavour = BEAM_MISSILE;
    beam.bounces = 1;
    player_beam_tracer tracer;
    SECTION("owner is immune to an Imus rebound")
    {
        you.religion = GOD_IMUS_THEA;
        you.raw_piety = piety_breakpoint(1);
        you.penance[GOD_IMUS_THEA] = 0;
        tracer.monster_hit(beam, owner_proxy);
        CHECK(tracer.hit_self_count == 0);
        CHECK(tracer.bad_attack_targets.empty());
    }
    SECTION("a harmful rebound still warns about the owner")
    {
        you.religion = GOD_NO_GOD;
        tracer.monster_hit(beam, owner_proxy);
        tracer.monster_hit(beam, owner_proxy);
        CHECK(tracer.hit_self_count == 1);
        CHECK(tracer.bad_attack_targets.empty());
    }
    SECTION("visible companion is still an ally target")
    {
        REQUIRE(you.can_see(companion));
        tracer.monster_hit(beam, *proxy);
        CHECK(tracer.describe_attack_targets() == "your ally Lyra");
    }
    SECTION("hidden companion is not revealed by the warning")
    {
        companion.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
        REQUIRE_FALSE(you.can_see(companion));
        tracer.monster_hit(beam, *proxy);
        CHECK(tracer.bad_attack_targets.empty());
    }
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum no-harm launcher rays stop before visible and hidden companions",
                 "[imus-spectrum][party]")
{
    init_monsters();
    init_zap_index();
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    companion.your_name = "Lyra";
    companion.set_position(you.pos() + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(companion.pos());
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));

    // A visible enemy behind the companion proves that a non-stopping ray
    // would continue through this line. West Wind uses a piercing attack.
    const coord_def foe_pos = you.pos() + coord_def(2, 0);
    const int foe_index = proxy->mindex() == 0 ? 1 : 0;
    monster& foe = env.mons[foe_index];
    foe.reset();
    foe.type = MONS_RAT;
    foe.mid = 52221;
    foe.hit_points = foe.max_hit_points = 100;
    foe.set_hit_dice(1);
    foe.base_attitude = ATT_HOSTILE;
    foe.behaviour = BEH_SEEK;
    foe.set_position(foe_pos);
    env.mgrid(foe_pos) = foe_index;
    env.mid_cache[foe.mid] = foe_index;
    env.max_mon_index = max(env.max_mon_index, foe_index);
    REQUIRE(you.can_see(foe));

    item_def& bow = you.inv[0];
    bow.clear();
    bow.base_type = OBJ_WEAPONS;
    bow.sub_type = WPN_SHORTBOW;
    bow.quantity = 1;
    bow.rnd = 1;
    bow.link = 0;
    ranged_attack_beam attack(you, bow);
    attack.beam.pierce = true;
    imus_spectrum_targeter preview(&you, 7, attack.beam);
    REQUIRE(preview.set_aim(you.pos() + coord_def(4, 0)));

    SECTION("visible companion") { REQUIRE(you.can_see(companion)); }
    SECTION("hidden companion")
    {
        companion.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
        REQUIRE_FALSE(you.can_see(companion));
    }
    player_beam_tracer unrestricted;
    imus_spectrum_trace_side_rays(attack.beam, preview, unrestricted);
    CHECK(unrestricted.has_hit_foe());
    if (you.can_see(companion))
        CHECK(unrestricted.describe_attack_targets().find("Lyra") != string::npos);
    else
        CHECK(unrestricted.describe_attack_targets().find("Lyra") == string::npos);

    // This is the same stop_at_allies flag used by the no_harm_allies path
    // in do_player_ranged_attack, including West Wind's automatic shot.
    bolt safe = attack.beam;
    safe.stop_at_allies = true;
    player_beam_tracer stopped;
    imus_spectrum_trace_side_rays(safe, preview, stopped);
    CHECK_FALSE(stopped.has_hit_foe());
    CHECK(stopped.bad_attack_targets.empty());
    CHECK(stopped.describe_attack_targets().find("Lyra") == string::npos);
    CHECK(companion.hp == you.hp);
    CHECK(companion.pos() == you.pos() + coord_def(1, 0));
}

TEST_CASE_METHOD(icicle_fixture, "Spectrum preview combines both launcher paths",
                 "[imus-spectrum][party]")
{
    init_monsters();
    init_zap_index();
    you.religion = GOD_NO_GOD;
    const coord_def origin = you.pos();
    const coord_def blocker = origin + coord_def(2, 0);
    monster& mon = env.mons[0];
    mon.reset();
    mon.type = MONS_RAT;
    mon.mid = 52221;
    mon.hit_points = mon.max_hit_points = 100;
    mon.set_hit_dice(1);
    mon.base_attitude = ATT_HOSTILE;
    mon.behaviour = BEH_SEEK;
    mon.set_position(blocker);
    env.mgrid(blocker) = 0;
    env.mid_cache[mon.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    env.map_knowledge(blocker).set_monster(monster_info(&mon));
    bolt ordinary;
    ordinary.set_agent(&you);
    ordinary.source = origin;
    ordinary.range = 6;
    ordinary.flavour = BEAM_MISSILE;
    ordinary.name = "test missile";
    bolt piercing = ordinary;
    piercing.pierce = true;
    imus_spectrum_targeter first(&you, 6, ordinary);
    imus_spectrum_targeter second(&you, 6, piercing);
    imus_spectrum_targeter combined(&you, 6, ordinary);
    combined.add_projectile(piercing);
    const coord_def aim = origin + coord_def(4, 0);
    REQUIRE(first.set_aim(aim));
    REQUIRE(second.set_aim(aim));
    REQUIRE(combined.set_aim(aim));
    const coord_def beyond = origin + coord_def(5, 0);
    CHECK(second.is_affected(beyond) > first.is_affected(beyond));
    CHECK(combined.is_affected(beyond)
          == max(first.is_affected(beyond), second.is_affected(beyond)));
}
