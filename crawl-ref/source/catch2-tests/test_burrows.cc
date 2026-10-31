#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "item-name.h"
#include "libutil.h"
#include "losglobal.h"
#include "message.h"
#include "mon-cast.h"
#include "mon-pick.h"
#include "mon-pick-data.h"
#include "mon-util.h"
#include "monster.h"
#include "ng-init-branches.h"
#include "show.h"
#include "spl-util.h"
#include "state.h"
#include "stairs.h"
#include "tags.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE("Burrows route is guaranteed alongside the two Lair rune branches", "[burrows]")
{
    CHECK(branches_are_mutually_exclusive(BRANCH_SNAKE, BRANCH_SPIDER));
    CHECK(branches_are_mutually_exclusive(BRANCH_SWAMP, BRANCH_SHOALS));
    CHECK_FALSE(is_random_subbranch(BRANCH_BURROWS));
    CHECK_FALSE(branches_are_mutually_exclusive(BRANCH_BURROWS, BRANCH_SNAKE));
    for (int attempt = 0; attempt < 100; ++attempt)
    {
        const auto entries = create_brentry();
        CHECK(entries[BRANCH_BURROWS] == level_id(BRANCH_LAIR, 5));
        CHECK(entries[BRANCH_WORMLANDS] == level_id(BRANCH_BURROWS, 4));
        CHECK(entries[BRANCH_HIVE] == level_id(BRANCH_BURROWS, 2));
        CHECK(entries[BRANCH_DEPTHS] == level_id(BRANCH_DUNGEON, 15));
        CHECK(entries[BRANCH_SNAKE].is_valid() + entries[BRANCH_SPIDER].is_valid() == 1);
        CHECK(entries[BRANCH_SWAMP].is_valid() + entries[BRANCH_SHOALS].is_valid() == 1);
    }
    CHECK(branches[BRANCH_BURROWS].runes.empty());
    CHECK(branches[BRANCH_WORMLANDS].runes.empty());
    CHECK(branches[BRANCH_HIVE].runes.empty());
    CHECK(rune_location(RUNE_BURROWS) == NUM_BRANCHES);
    CHECK(branches[BRANCH_HIVE].numlevels == 2);
    const level_id bottom(BRANCH_BURROWS, branches[BRANCH_BURROWS].numlevels);
    CHECK(branches[BRANCH_WORMLANDS].numlevels
          == level_id(BRANCH_DEPTHS, 1).absdepth() - bottom.absdepth());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Descent retains the rune choice and the optional Burrows route", "[burrows]")
{
    const unwind_var<game_type> mode(crawl_state.type, GAME_TYPE_DESCENT);
    const unwind_var<branch_type> location(you.where_are_you, BRANCH_ORC);
    for (branch_type selected : {BRANCH_SNAKE, BRANCH_SPIDER})
    {
        you.props[DESCENT_POIS_BRANCH_KEY] = selected;
        for (branch_type candidate : {BRANCH_SNAKE, BRANCH_SPIDER})
            CHECK(in_descent_parent(candidate) == (candidate == selected));
    }
    you.where_are_you = BRANCH_LAIR;
    CHECK(in_descent_parent(BRANCH_BURROWS));
    you.where_are_you = BRANCH_BURROWS;
    CHECK(in_descent_parent(BRANCH_WORMLANDS));
    CHECK(in_descent_parent(BRANCH_HIVE));
    you.where_are_you = BRANCH_WORMLANDS;
    CHECK(in_descent_parent(BRANCH_DEPTHS));
    you.props.erase(DESCENT_POIS_BRANCH_KEY);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Additional branch links share native stair and travel endpoints", "[burrows]")
{
    const coord_def cell(30, 30);
    const unwind_var<dungeon_feature_type> floor(env.grid(cell), DNGN_FLOOR);
    const unwind_var<branch_type> location(you.where_are_you, BRANCH_WORMLANDS);
    const unwind_var<int> depth(you.depth, branches[BRANCH_WORMLANDS].numlevels);
    for (const auto& link : branch_connections)
    {
        CHECK(feat_stair_direction(link.downstairs) == CMD_GO_DOWNSTAIRS);
        CHECK(feat_stair_direction(link.upstairs) == CMD_GO_UPSTAIRS);
        CHECK(feat_is_travelable_stair(link.downstairs));
        CHECK(feat_is_travelable_stair(link.upstairs));
        CHECK(branch_connection_return(link.downstairs) == link.upstairs);
        CHECK(branch_connection_return(link.upstairs) == link.downstairs);
        you.where_are_you = link.from.branch;
        you.depth = link.from.depth;
        env.grid(cell) = link.downstairs;
        CHECK(stair_destination(link.downstairs, "", false) == link.to);
        CHECK(link.from.next_level_id(cell) == link.to);
        you.where_are_you = link.to.branch;
        you.depth = link.to.depth;
        env.grid(cell) = link.upstairs;
        CHECK(stair_destination(link.upstairs, "", false) == link.from);
        CHECK(link.to.next_level_id(cell) == link.from);
        CHECK_FALSE(branch_connection_destination(link.downstairs, link.to).is_valid());
        CHECK_FALSE(branch_connection_destination(link.upstairs, link.from).is_valid());
    }
    // The original Depths entrance and return remain a separate path.
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 15;
    CHECK(stair_destination(DNGN_ENTER_DEPTHS, "", false) == level_id(BRANCH_DEPTHS, 1));
    const unwind_var<level_id> entry(brentry[BRANCH_DEPTHS], level_id(BRANCH_DUNGEON, 15));
    CHECK(branch_exit_destination(DNGN_EXIT_DEPTHS, level_id(BRANCH_DEPTHS, 1))
          == level_id(BRANCH_DUNGEON, 15));
}

TEST_CASE("New branches preserve existing save IDs", "[burrows]")
{
    CHECK(string(rune_type_name(RUNE_BURROWS)) == "clay");
    STATIC_REQUIRE(BRANCH_BURROWS == BRANCH_GULCH + 1);
    STATIC_REQUIRE(BRANCH_WORMLANDS == BRANCH_BURROWS + 1);
    STATIC_REQUIRE(BRANCH_HIVE == BRANCH_WORMLANDS + 1);
    STATIC_REQUIRE(RUNE_BURROWS == RUNE_FOREST + 1);
    STATIC_REQUIRE(GEM_BURROWS == GEM_ZOT + 1);
    STATIC_REQUIRE(DNGN_ENTER_BURROWS == DNGN_ALTAR_VELLUM + 1);
    STATIC_REQUIRE(DNGN_ENTER_WORMLANDS == DNGN_EXIT_BURROWS + 1);
    STATIC_REQUIRE(MONS_BURROWING_BEAST == MONS_VOID_TETHER_STALKER + 1);
    STATIC_REQUIRE(MONS_GALLERY_WORM == MONS_WORLDWORM + 1);
    STATIC_REQUIRE(MONS_CAUSTIC_WORM == MONS_COIL_WORM + 1);
    STATIC_REQUIRE(MONS_VESPARA == MONS_CAUSTIC_WORM + 4);
}

TEST_CASE("Burrows diggers respect native wall and spell rules", "[burrows]")
{
    init_monsters();
    monster beast;
    beast.type = MONS_BURROWING_BEAST;
    beast.behaviour = BEH_SEEK;
    const coord_def cell(30, 30);
    const unwind_var<dungeon_feature_type> wall(env.grid(cell), DNGN_ROCK_WALL);
    CHECK(beast.can_burrow_through(cell));
    env.grid(cell) = DNGN_STONE_WALL;
    CHECK_FALSE(beast.can_burrow_through(cell));
    env.grid(cell) = DNGN_PERMAROCK_WALL;
    CHECK_FALSE(beast.can_burrow_through(cell));
    env.grid(cell) = DNGN_SLIMY_WALL;
    CHECK_FALSE(beast.can_burrow_through(cell));

    monster delver;
    delver.type = MONS_DEEP_TROLL_DELVER;
    mons_load_spells(delver);
    CHECK(delver.has_spell(SPELL_DIG));
    CHECK(delver.has_spell(SPELL_STONE_ARROW));
    CHECK_FALSE(delver.has_spell(SPELL_LRD));
    CHECK(delver.spell_slot_flags(SPELL_DIG) & MON_SPELL_WIZARD);

    monster drake;
    drake.type = MONS_SHALE_DRAKE;
    mons_load_spells(drake);
    CHECK(drake.has_spell(SPELL_STONE_ARROW));
    CHECK(drake.spell_slot_flags(SPELL_STONE_ARROW) & MON_SPELL_NATURAL);
    CHECK(drake.spell_slot_flags(SPELL_STONE_ARROW) & MON_SPELL_BREATH);

    monster boar;
    boar.type = MONS_CRAG_BOAR;
    mons_load_spells(boar);
    CHECK(boar.spells.empty());
    CHECK_FALSE(boar.can_burrow());
    CHECK(mons_is_unique(MONS_WORLDWORM));
    for (branch_type branch : {BRANCH_BURROWS, BRANCH_WORMLANDS, BRANCH_HIVE})
        for (const auto& entry : population[branch])
            CHECK_FALSE(mons_is_unique(entry.value));

    monster gallery;
    gallery.type = MONS_GALLERY_WORM;
    gallery.behaviour = BEH_SEEK;
    CHECK(gallery.can_burrow());
    monster coil;
    coil.type = MONS_COIL_WORM;
    CHECK_FALSE(coil.can_burrow());
    CHECK(mons_attack_spec(coil, 0).type == AT_CONSTRICT);
}

TEST_CASE("Regional creatures reuse native attacks and breath recovery", "[burrows]")
{
    init_monsters();
    monster caustic;
    caustic.type = MONS_CAUSTIC_WORM;
    caustic.behaviour = BEH_SEEK;
    mons_load_spells(caustic);
    REQUIRE(caustic.spells.size() == 1);
    CHECK(caustic.has_spell(SPELL_SPIT_ACID));
    CHECK(caustic.spell_slot_flags(SPELL_SPIT_ACID) & MON_SPELL_BREATH);
    CHECK(caustic.spell_slot_flags(SPELL_SPIT_ACID) & MON_SPELL_NATURAL);
    CHECK_FALSE(caustic.can_burrow());
    CHECK(caustic.res_corr() > 0);

    monster wasp;
    wasp.type = MONS_VENOM_WASP;
    mons_load_spells(wasp);
    REQUIRE(wasp.spells.size() == 1);
    CHECK(wasp.has_spell(SPELL_SPIT_POISON));
    CHECK(wasp.spell_slot_flags(SPELL_SPIT_POISON) & MON_SPELL_BREATH);
    CHECK(wasp.spell_slot_flags(SPELL_SPIT_POISON) & MON_SPELL_NATURAL);
    CHECK(wasp.airborne());
    CHECK(mons_attack_spec(wasp, 0).flavour == AF_POISON);

    monster beetle;
    beetle.type = MONS_WAX_BEETLE;
    mons_load_spells(beetle);
    CHECK(beetle.spells.empty());
    CHECK_FALSE(beetle.airborne());
    CHECK(mons_attack_spec(beetle, 0).flavour == AF_PLAIN);

    monster coil;
    coil.type = MONS_OLD_COIL;
    mons_load_spells(coil);
    CHECK(coil.spells.empty());
    CHECK(mons_is_unique(coil.type));
    CHECK_FALSE(coil.can_burrow());
    CHECK(mons_attack_spec(coil, 0).type == AT_CONSTRICT);
    CHECK(mons_attack_spec(coil, 1).flavour == AF_VAMPIRIC);

    for (monster_type type : {MONS_QUEEN_BEE, MONS_VESPARA})
    {
        monster queen;
        queen.type = type;
        mons_load_spells(queen);
        CHECK(mons_genus(type) == MONS_KILLER_BEE);
        CHECK(queen.has_spell(SPELL_BERSERK_OTHER));
        CHECK(queen.spell_slot_flags(SPELL_BERSERK_OTHER) & MON_SPELL_NATURAL);
    }
    CHECK(mons_is_unique(MONS_VESPARA));
    CHECK_FALSE(mons_genus(MONS_VENOM_WASP) == MONS_KILLER_BEE);
}

namespace
{
struct bee_incite_fixture : MockPlayerYouTestsFixture
{
    vector<dungeon_feature_type> terrain;
    vector<monster> previous;
    int old_max_index = env.max_mon_index;
    bee_incite_fixture()
    {
        static const bool ready = []() { msg::initialise_mpr_streams(); return true; }();
        (void)ready;
        init_show_table();
        init_monsters();
        init_spell_descs();
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.set_position(coord_def(40, 35));
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
            {
                terrain.push_back(env.grid[x][y]);
                env.grid[x][y] = DNGN_FLOOR;
            }
        invalidate_los();
    }
    ~bee_incite_fixture()
    {
        for (unsigned i = 0; i < previous.size(); ++i)
        {
            env.mgrid(env.mons[i].pos()) = NON_MONSTER;
            env.mid_cache.erase(env.mons[i].mid);
            env.mons[i] = previous[i];
        }
        env.max_mon_index = old_max_index;
        int index = 0;
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = terrain[index++];
        invalidate_los();
    }
    monster& spawn(monster_type type, coord_def pos)
    {
        const int index = previous.size();
        auto& mon = env.mons[index];
        previous.push_back(mon);
        mon.reset();
        mon.type = type;
        mon.mid = 31000 + index;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(12);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        mons_load_spells(mon);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE_METHOD(bee_incite_fixture, "Queens incite only worker bees and meliai", "[burrows]")
{
    const auto queen_type = GENERATE(MONS_QUEEN_BEE, MONS_VESPARA);
    const auto worker_type = GENERATE(MONS_KILLER_BEE, MONS_MELIAI,
                                      MONS_VENOM_WASP, MONS_WAX_BEETLE);
    auto& queen = spawn(queen_type, coord_def(44, 35));
    auto& worker = spawn(worker_type, coord_def(42, 35));
    CAPTURE(queen_type, worker_type);
    mons_cast(&queen, bolt(), SPELL_BERSERK_OTHER, MON_SPELL_NATURAL, false);
    CHECK(worker.has_ench(ENCH_BERSERK)
          == (worker_type == MONS_KILLER_BEE || worker_type == MONS_MELIAI));
}

TEST_CASE("Wormlands mixes native fungi with repeatable crawling fauna", "[burrows]")
{
    init_monsters();
    for (monster_type type : {MONS_GALLERY_WORM, MONS_COIL_WORM,
                              MONS_CAUSTIC_WORM, MONS_WANDERING_MUSHROOM,
                              MONS_DEATHCAP})
    {
        CHECK(monster_in_population(BRANCH_WORMLANDS, type));
        CHECK_FALSE(mons_is_unique(type));
        CHECK_FALSE(mons_class_flag(type, M_NO_EXP_GAIN));
    }
    CHECK_FALSE(monster_in_population(BRANCH_WORMLANDS, MONS_FUNGUS));
    CHECK_FALSE(monster_in_population(BRANCH_WORMLANDS, MONS_TOADSTOOL));
    monster deathcap;
    deathcap.type = MONS_DEATHCAP;
    mons_load_spells(deathcap);
    CHECK(deathcap.has_spell(SPELL_DRAIN_LIFE));
    CHECK(deathcap.spell_slot_flags(SPELL_DRAIN_LIFE) & MON_SPELL_MAGICAL);
    CHECK(mons_attack_spec(deathcap, 0).flavour == AF_CONFUSE);
}

TEST_CASE("Clay rune survives native item serialization", "[burrows][save-compatibility]")
{
    item_def original;
    original.base_type = OBJ_RUNES;
    original.sub_type = RUNE_BURROWS;
    original.quantity = 1;
    original.rnd = 1;
    vector<unsigned char> bytes;
    writer output(&bytes);
    marshallItem(output, original);
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    item_def restored;
    unmarshallItem(input, restored);
    CHECK(restored.base_type == OBJ_RUNES);
    CHECK(restored.sub_type == RUNE_BURROWS);
    CHECK(restored.quantity == 1);
    CHECK_FALSE(input.valid());
}

TEST_CASE("Regional populations separate overlapping late threats", "[burrows][encounters]")
{
    for (monster_type type : {MONS_DEEP_TROLL_SHAMAN, MONS_DEEP_TROLL_EARTH_MAGE,
                              MONS_GREAT_ORB_OF_EYES})
        CHECK_FALSE(monster_in_population(BRANCH_WORMLANDS, type, false));
    CHECK(monster_probability(level_id(BRANCH_BURROWS,1), MONS_BOULDER_BEETLE)==0);
    CHECK(monster_probability(level_id(BRANCH_BURROWS,2), MONS_BOULDER_BEETLE)>0);
    CHECK(monster_probability(level_id(BRANCH_WORMLANDS,2), MONS_DEATHCAP)==0);
    CHECK(monster_probability(level_id(BRANCH_WORMLANDS,3), MONS_DEATHCAP)>0);
    CHECK(monster_in_population(BRANCH_WORMLANDS, MONS_WANDERING_MUSHROOM));
    CHECK(monster_in_population(BRANCH_DEPTHS, MONS_DEEP_TROLL_SHAMAN));
}
