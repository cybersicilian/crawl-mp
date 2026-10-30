#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "branch.h"
#include "database.h"
#include "dlua.h"
#include "dungeon.h"
#include "feature.h"
#include "initfile.h"
#include "item-name.h"
#include "mapdef.h"
#include "maps.h"
#include "mon-util.h"
#include "player.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Slime grid and Elf layouts generate with shared geoelf helpers",
                 "[slime-layout]")
{
    unwind_var<string> data_directory(SysEnv.crawl_dir, ".");
    unwind_var<int> slime_depth(brdepth[BRANCH_SLIME], 5);
    unwind_var<int> elf_depth(brdepth[BRANCH_ELF], 3);
    init_monsters();
    init_mon_name_cache();
    init_item_name_cache();
    databaseSystemInit();
    unwinder close_databases([] { databaseSystemShutdown(); });
    init_show_table();
    init_feat_desc_cache();
    init_dungeon_lua();
    read_map("des/builder/layout_slime.des");
    read_map("des/builder/layout_geoelf.des");

    for (const auto& spec : {pair<const char*, branch_type>("layout_slime_grid", BRANCH_SLIME),
                             {"layout_geoelf_grid", BRANCH_ELF}})
    {
        const map_def* definition = find_map_by_name(spec.first);
        REQUIRE(definition);
        you.where_are_you = spec.second;
        int stone_count = 0;
        for (int depth = 1; depth <= (spec.second == BRANCH_SLIME ? 5 : 3); ++depth)
        {
            you.depth = depth;
            for (int sample = 0; sample < 8; ++sample)
            {
                map_def generated = *definition;
                generated.load();
                const string error = generated.run_lua(true);
                INFO(spec.first << " depth " << depth << ": " << error);
                REQUIRE(error.empty());
                CHECK(generated.size().x > 0);
                CHECK(generated.size().y > 0);
                CHECK_FALSE(generated.find_glyph('.').empty());
                stone_count += generated.find_glyph('c').size();
            }
        }
        if (spec.second == BRANCH_SLIME)
            CHECK(stone_count > 0);
    }
}
