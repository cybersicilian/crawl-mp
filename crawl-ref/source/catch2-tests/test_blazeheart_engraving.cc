#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "act-iter.h"
#include "automaton.h"
#include "cloud.h"
#include "coordit.h"
#include "dungeon.h"
#include "env.h"
#include "fineff.h"
#include "losglobal.h"
#include "mon-death.h"
#include "mon-explode.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "skills.h"
#include "spl-book.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "spl-zap.h"
#include "tags.h"
#include "terrain.h"
#include "test_vellum_fixture.h"

namespace
{
struct blazeheart_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    blazeheart_fixture()
    {
        init_monsters();
        init_zap_index();
        init_spell_descs();
        init_spell_name_cache();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_AUTOMATON;
        you.religion = GOD_NO_GOD;
        you.experience_level = 15;
        you.base_stats[STAT_INT] = 40;
        set_skill_level(SK_SPELLCASTING, 20, true);
        set_skill_level(SK_FORGECRAFT, 20, true);
        set_skill_level(SK_FIRE_MAGIC, 20, true);
        you.hp = you.hp_max = 100;
        you.magic_points = you.max_magic_points = 20;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        you.elapsed_time = 100;
        invalidate_los();
    }
    ~blazeheart_fixture()
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
    monster& spawn(int index, monster_type type, coord_def pos,
                   mon_attitude_type attitude)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = type;
        mon.mid = 44001 + index;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(3);
        mon.base_attitude = attitude;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE_METHOD(blazeheart_fixture, "Automatic blazeheart casts preserve their core marker", "[automaton][blazeheart]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, MONS_RAT, target, ATT_HOSTILE);
    you.spells[0] = SPELL_FORGE_BLAZEHEART_GOLEM;
    you.spell_no = 1;
    CHECK(automaton::has_automatic_trigger(SPELL_FORGE_BLAZEHEART_GOLEM));
    CHECK(automaton::engraving_guidance(SPELL_FORGE_BLAZEHEART_GOLEM).find("fire clouds") != string::npos);
    REQUIRE(automaton::trigger_attack(target));
    monster* golem = nullptr;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_BLAZEHEART_GOLEM)
            golem = *mi;
    REQUIRE(golem);
    CHECK(automaton_blazeheart::marked(*golem));
    CHECK_FALSE(automaton::summon_attack_engraving_ready(SPELL_FORGE_BLAZEHEART_GOLEM));
    if (grid_distance(you.pos(), golem->pos()) > 1)
    {
        for (adjacent_iterator ai(golem->pos()); ai; ++ai)
            if (!actor_at(*ai) && env.grid(*ai) == DNGN_FLOOR)
            {
                you.set_position(*ai);
                break;
            }
    }
    INFO("summoner " << golem->summoner << ", player " << you.mid
         << ", distance " << grid_distance(you.pos(), golem->pos()));
    REQUIRE(automaton_blazeheart::owner_adjacent(*golem));
    golem->suicide();
    monster_die(*golem, KILL_NON_ACTOR, NON_MONSTER);
    REQUIRE(golem->type == MONS_BLAZEHEART_CORE);
    CHECK(automaton_blazeheart::marked(*golem));
    vector<unsigned char> bytes;
    writer output(&bytes);
    marshallMonster(output, *golem);
    reader input(bytes, TAG_MINOR_VERSION);
    monster restored;
    unmarshallMonster(input, restored);
    CHECK(restored.type == MONS_BLAZEHEART_CORE);
    CHECK(automaton_blazeheart::marked(restored));
    CHECK(restored.summoner == golem->summoner);
}

TEST_CASE_METHOD(blazeheart_fixture, "Automatic core checks protected actors at detonation", "[automaton][blazeheart]")
{
    monster& core = spawn(0, MONS_BLAZEHEART_CORE, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    core.props[automaton_blazeheart::MARKER_KEY] = true;
    REQUIRE(automaton_blazeheart::protected_near(core));
    const int hp_before = you.hp;
    REQUIRE(explode_monster(&core, KILL_NON_ACTOR, false));
    CHECK(you.hp == hp_before);
    CHECK_FALSE(cloud_at(core.pos()));

    you.set_position(coord_def(35, 35));
    CHECK_FALSE(automaton_blazeheart::protected_near(core));
    monster& ally = spawn(1, MONS_RAT, core.pos() + coord_def(0, 1), ATT_FRIENDLY);
    CHECK(automaton_blazeheart::protected_near(core));
    ally.base_attitude = ATT_HOSTILE;
    CHECK_FALSE(automaton_blazeheart::protected_near(core));
    REQUIRE(explode_monster(&core, KILL_NON_ACTOR, false));
    // A protected creature can move into danger after the blast is queued.
    ally.base_attitude = ATT_FRIENDLY;
    fire_final_effects();
    CHECK_FALSE(cloud_at(core.pos()));
    CHECK(ally.hit_points == 100);

    core.hit_points = 100;
    ally.base_attitude = ATT_HOSTILE;
    REQUIRE(explode_monster(&core, KILL_NON_ACTOR, false));
    fire_final_effects();
    CHECK(cloud_at(core.pos()));
}

TEST_CASE_METHOD(blazeheart_fixture, "Automatic golem follows its owner across party contexts", "[automaton][blazeheart]")
{
    party::set_player_count(2);
    player& owner = party::get_player(1);
    owner = you;
    owner.mid = party::mid_for_slot(1);
    owner.save = nullptr;
    owner.set_position(coord_def(44, 35));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    monster& golem = spawn(5, MONS_BLAZEHEART_GOLEM, coord_def(45, 35), ATT_FRIENDLY);
    golem.summoner = owner.mid;
    golem.props[automaton_blazeheart::MARKER_KEY] = true;
    CHECK(grid_distance(you.pos(), golem.pos()) > 1);
    CHECK(automaton_blazeheart::owner_adjacent(golem));
    CHECK(automaton_blazeheart::protected_near(golem));
    owner.set_position(coord_def(48, 35));
    CHECK_FALSE(automaton_blazeheart::owner_adjacent(golem));
}

TEST_CASE_METHOD(blazeheart_fixture, "Automatic core protects an ally entering the blast center", "[automaton][blazeheart]")
{
    const coord_def center(45, 35);
    monster& core = spawn(0, MONS_BLAZEHEART_CORE, center, ATT_FRIENDLY);
    monster& ally = spawn(1, MONS_RAT, coord_def(47, 35), ATT_FRIENDLY);
    core.props[automaton_blazeheart::MARKER_KEY] = true;
    REQUIRE_FALSE(automaton_blazeheart::protected_near(core));
    REQUIRE(explode_monster(&core, KILL_NON_ACTOR, false));
    env.mgrid(ally.pos()) = NON_MONSTER;
    ally.set_position(center);
    env.mgrid(center) = ally.mindex();
    fire_final_effects();
    CHECK(ally.hit_points == 100);
    CHECK_FALSE(cloud_at(center));
}

TEST_CASE_METHOD(blazeheart_fixture, "Manual blazeheart golems are not marked", "[automaton][blazeheart]")
{
    you.species = SP_HUMAN;
    REQUIRE(cast_forge_blazeheart_golem(40, false) == spret::success);
    monster* golem = nullptr;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_BLAZEHEART_GOLEM)
            golem = *mi;
    REQUIRE(golem);
    CHECK_FALSE(automaton_blazeheart::marked(*golem));
}

TEST_CASE_METHOD(blazeheart_fixture, "Manual blazeheart cores retain their explosion", "[automaton][blazeheart]")
{
    monster& core = spawn(0, MONS_BLAZEHEART_CORE, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    CHECK_FALSE(automaton_blazeheart::marked(core));
    REQUIRE(explode_monster(&core, KILL_NON_ACTOR, false));
    fire_final_effects();
    CHECK(cloud_at(core.pos()));
}
