#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "art-enum.h"
#include "artefact.h"
#include "branch.h"
#include "database.h"
#include "dlua.h"
#include "dungeon.h"
#include "env.h"
#include "feature.h"
#include "files.h"
#include "initfile.h"
#include "item-name.h"
#include "mapdef.h"
#include "maps.h"
#include "mon-cast.h"
#include "mon-pick.h"
#include "mon-util.h"
#include "monster.h"
#include "ng-init-branches.h"
#include "player.h"
#include "spl-damage.h"
#include "stairs.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE("Golemforge is a distinct portal branch", "[golemforge]")
{
    const Branch& forge = branches[BRANCH_GOLEMFORGE];
    CHECK(forge.id == BRANCH_GOLEMFORGE);
    CHECK(forge.numlevels == 1);
    CHECK(forge.parent_branch == NUM_BRANCHES);
    CHECK(branch_by_abbrevname("Forge") == BRANCH_GOLEMFORGE);
    CHECK(level_id::parse_level_id("Forge:1") == level_id(BRANCH_GOLEMFORGE, 1));
    bool found = false;
    for (branch_iterator it; it; ++it)
        if (it->id == BRANCH_GOLEMFORGE)
        {
            found = true;
            CHECK(skip_branch_brentry(it));
        }
    CHECK(found);
    CHECK(feat_is_portal_entrance(DNGN_ENTER_GOLEMFORGE));
    CHECK(feat_is_portal_exit(DNGN_EXIT_GOLEMFORGE));
    CHECK(forge.entry_stairs == DNGN_ENTER_GOLEMFORGE);
    CHECK(forge.exit_stairs == DNGN_EXIT_GOLEMFORGE);
    CHECK(BRANCH_GOLEMFORGE != BRANCH_HIVE);
    CHECK_FALSE(branch_has_monsters(BRANCH_GOLEMFORGE));
    CHECK_FALSE(fish_population(BRANCH_GOLEMFORGE, false).empty());
    CHECK_FALSE(fish_population(BRANCH_GOLEMFORGE, true).empty());
#if TAG_MAJOR_VERSION == 34
    CHECK(BRANCH_GOLEMFORGE != BRANCH_FOREST);
#endif
    init_monsters();
    const monsterentry* golem = get_monster_data(MONS_MACHINE_GOLEM);
    REQUIRE(golem);
    CHECK(string(golem->name) == "machine golem");
}

TEST_CASE("Ancient automata retain their trample, breath, orb and metal body",
          "[golemforge][ancient-automaton]")
{
    init_monsters();
    monster automaton;
    automaton.type = MONS_ANCIENT_AUTOMATON;
    mons_load_spells(automaton);
    CHECK(mons_attack_spec(automaton, 0).flavour == AF_TRAMPLE);
    CHECK(mons_attack_spec(automaton, 0).damage == 55);
    CHECK(automaton.res_corr() == 3);
    CHECK(automaton.has_spell(SPELL_IOOD));
    CHECK(automaton.has_spell(SPELL_STEAM_BALL));
    CHECK(automaton.spell_slot_flags(SPELL_STEAM_BALL) & MON_SPELL_BREATH);
    CHECK(automaton.spell_slot_flags(SPELL_STEAM_BALL) & MON_SPELL_NOISY);
    CHECK(shatter_damage(90, &automaton).num == DEFAULT_SHATTER_DICE * 2);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Golemforge entrance is registered and cleared on its source floor",
                 "[golemforge]")
{
    unwind_var<feature_grid> restore_grid(env.grid);
    unwind_var<decltype(env.pgrid)> restore_pgrid(env.pgrid);
    unwind_var<FixedVector<level_id, NUM_BRANCHES>> restore_entries(brentry);
    unwind_var<branch_type> restore_branch(you.where_are_you, BRANCH_ELF);
    unwind_var<int> restore_depth(you.depth, 2);
    env.grid.init(DNGN_ROCK_WALL);
    env.pgrid.init(terrain_property_t{});
    brentry[BRANCH_GOLEMFORGE] = level_id();

    const auto& order = dgn_portal_generation_order();
    REQUIRE(std::count(order.begin(), order.end(), BRANCH_GOLEMFORGE) == 1);
    const coord_def door(30, 30);
    env.grid(door) = DNGN_ENTER_GOLEMFORGE;
    CHECK(stair_destination(DNGN_ENTER_GOLEMFORGE, "", false)
          == level_id(BRANCH_GOLEMFORGE, 1));
    update_portal_entrances();
    CHECK(brentry[BRANCH_GOLEMFORGE] == level_id(BRANCH_ELF, 2));
    env.grid(door) = DNGN_FLOOR;
    update_portal_entrances();
    CHECK_FALSE(brentry[BRANCH_GOLEMFORGE].is_valid());
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Golemforge places all four pieces of the masterwork",
                 "[golemforge]")
{
    unwind_var<string> data_directory(SysEnv.crawl_dir, ".");
    init_monsters();
    init_mon_name_cache();
    init_item_name_cache();
    databaseSystemInit();
    unwinder close_databases([] { databaseSystemShutdown(); });
    init_show_table();
    init_feat_desc_cache();
    init_dungeon_lua();
    read_map("des/portals/golemforge.des");

    const map_def* definition = find_map_by_name("golemforge_main");
    REQUIRE(definition);
    CHECK(definition->place.is_usable_in(level_id(BRANCH_GOLEMFORGE, 1)));
    you.where_are_you = BRANCH_GOLEMFORGE;
    you.depth = 1;
    map_def generated = *definition;
    generated.load();
    const string error = generated.run_lua(true);
    INFO(error);
    REQUIRE(error.empty());
    CHECK(generated.has_tag("no_monster_gen"));
    for (char symbol : {'h', 'a', 'g', 'b'})
        CHECK(generated.find_glyph(symbol).size() == 1);
    CHECK(generated.find_glyph('t').size() == 1);
    CHECK(get_unrandart_num("Golem helmet") == UNRAND_GOLEM_HELMET);
    CHECK(get_unrandart_num("Golem armour") == UNRAND_GOLEM_ARMOUR);
    CHECK(get_unrandart_num("Golem gauntlets") == UNRAND_GOLEM_GLOVES);
    CHECK(get_unrandart_num("Golem greaves") == UNRAND_GOLEM_BOOTS);
}
