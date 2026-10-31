#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "fight.h"
#include "losglobal.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-kimjoy.h"
#include "spl-monench.h"
#include "spl-shackle.h"
#include "spl-util.h"
#include "target.h"
#include "test_vellum_fixture.h"

namespace
{
struct poison_spell_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    poison_spell_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.religion = GOD_NO_GOD;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~poison_spell_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
    monster& spawn(coord_def position)
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 52221;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.set_position(position);
        env.mgrid(position) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
};
}

TEST_CASE_METHOD(poison_spell_fixture, "Shackle prompts for visible allies and not unseen foes", "[shackle]")
{
    monster& ally = spawn(you.pos() + coord_def(2, 0));
    ally.base_attitude = ATT_FRIENDLY;
    REQUIRE(you.can_see(ally));
    CHECK(stop_attack_prompt(&ally, false, you.pos(), nullptr, coord_def(), true));
    // Friendly invisible monsters remain visible to their owner in Crawl.
    ally.base_attitude = ATT_HOSTILE;
    ally.add_ench(ENCH_INVIS);
    REQUIRE_FALSE(you.can_see(ally));
    CHECK_FALSE(stop_attack_prompt(&ally, false, you.pos(), nullptr, coord_def(), true));
}

TEST_CASE_METHOD(poison_spell_fixture, "Rootspike damages and constricts its target", "[kimjoy-poison]")
{
    monster& foe = spawn(you.pos() + coord_def(2, 0));
    const int hp = foe.hit_points;
    REQUIRE(cast_eringyas_rootspike(80, foe.pos(), false) == spret::success);
    CHECK(foe.hit_points < hp);
    CHECK(foe.constricted_by == you.mid);
    CHECK(foe.constricted_type == CONSTRICT_ROOTS);
    CHECK(you.props[FASTROOT_POWER_KEY].get_int() == 80);
    CHECK(foe.props.exists(ROOTSPIKE_CONSTRICTION_KEY));
    foe.stop_being_constricted(true);
    REQUIRE(start_ranged_constriction(you, foe, 5, CONSTRICT_ROOTS));
    CHECK_FALSE(foe.props.exists(ROOTSPIKE_CONSTRICTION_KEY));
}

TEST_CASE_METHOD(poison_spell_fixture, "Last Mercy consumes poison only on a successful cast", "[kimjoy-poison]")
{
    monster& foe = spawn(you.pos() + coord_def(2, 0));
    REQUIRE(foe.add_ench(mon_enchant(ENCH_POISON, &you, 100, 2)));
    const int hp = foe.hit_points;
    CHECK(cast_olgrebs_last_mercy(80, foe.pos(), true) == spret::fail);
    CHECK(foe.hit_points == hp);
    CHECK(foe.has_ench(ENCH_POISON));
    REQUIRE(cast_olgrebs_last_mercy(80, foe.pos(), false) == spret::success);
    CHECK(foe.hit_points < hp);
    CHECK_FALSE(foe.has_ench(ENCH_POISON));
}

TEST_CASE_METHOD(poison_spell_fixture, "Last Mercy previews its possible blast", "[kimjoy-poison]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(target);
    auto blast = find_spell_targeter(SPELL_OLGREBS_LAST_MERCY, 80, LOS_RADIUS);
    REQUIRE(blast);
    REQUIRE(blast->set_aim(target));
    CHECK(blast->is_affected(target) == AFF_YES);
    CHECK(blast->is_affected(target + coord_def(1, 0)) != AFF_NO);
}

TEST_CASE_METHOD(poison_spell_fixture, "Last Mercy warns about its caster in the blast", "[kimjoy-poison]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(target);
    targeter_smite area(&you, LOS_RADIUS, 0, 1);
    REQUIRE(area.set_aim(target));
    CHECK(area.is_affected(you.pos()) != AFF_NO);
    CHECK(stop_attack_prompt(area, "detonate poison",
                             [](const actor*) { return true; }, nullptr,
                             nullptr, true, true));
}

TEST_CASE_METHOD(poison_spell_fixture, "Poison spells do not target party proxies", "[kimjoy-poison][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    const coord_def target = you.pos() + coord_def(2, 0);
    companion.set_position(target);
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(target);
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));
    const int hp = companion.hp;
    const coord_def empty = target + coord_def(1, 0);
    // An unoccupied tile and a proxy take the same fizzle/failure path, so
    // targeting cannot disclose a hidden party member.
    CHECK(cast_eringyas_rootspike(80, target, true)
          == cast_eringyas_rootspike(80, empty, true));
    CHECK(cast_olgrebs_last_mercy(80, target, true)
          == cast_olgrebs_last_mercy(80, empty, true));
    CHECK(companion.hp == hp);
    CHECK_FALSE(proxy->props.exists(ROOTSPIKE_CONSTRICTION_KEY));
}

TEST_CASE_METHOD(poison_spell_fixture, "Area prompts protect visible party members without revealing hidden ones", "[kimjoy-poison][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    const coord_def target = you.pos() + coord_def(2, 0);
    companion.set_position(target);
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(target);
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));
    targeter_smite area(&you, LOS_RADIUS, 0, 1);
    REQUIRE(area.set_aim(target));
    REQUIRE(you.can_see(companion));
    CHECK(stop_attack_prompt(area, "detonate poison", nullptr, nullptr,
                             nullptr, true));
    companion.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
    REQUIRE_FALSE(you.can_see(companion));
    CHECK_FALSE(stop_attack_prompt(area, "detonate poison", nullptr, nullptr,
                                   nullptr, true));
}

TEST_CASE_METHOD(poison_spell_fixture, "Beam warnings identify visible party members without revealing hidden ones", "[kimjoy-poison][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.mid = party::mid_for_slot(1);
    companion.save = nullptr;
    companion.your_name = "Lyra";
    companion.set_position(you.pos() + coord_def(2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster* proxy = monster_at(companion.pos());
    REQUIRE(proxy);
    REQUIRE(party::is_proxy_monster(*proxy));
    REQUIRE(you.can_see(companion));

    bolt beam;
    init_spell_descs();
    beam.set_agent(&you);
    beam.flavour = BEAM_FIRE;
    beam.origin_spell = SPELL_BLIGHT;
    player_beam_tracer visible;
    visible.monster_hit(beam, *proxy);
    REQUIRE(visible.bad_attack_targets.size() == 1);
    CHECK(visible.describe_attack_targets() == "your ally Lyra");
    visible.monster_hit(beam, *proxy);
    CHECK(visible.bad_attack_targets.size() == 1);

    companion.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
    REQUIRE_FALSE(you.can_see(companion));
    player_beam_tracer hidden;
    hidden.monster_hit(beam, *proxy);
    CHECK(hidden.bad_attack_targets.empty());
}
