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

// Shared setup for the curated content-port vault checks. The map loader
// refuses to load a map name twice in one process, and other test files
// (test_golemforge.cc, test_slime_layout.cc) read .des files of their own,
// so each file is only read when one of its maps is not already known.
namespace
{
    struct curated_vault_env
    {
        unwind_var<string> data_directory;
        unwind_var<int> dungeon_depth;
        unwind_var<int> orc_depth;
        unwind_var<int> elf_depth;
        unwind_var<int> lair_depth;
        unwind_var<int> vaults_depth;
        unwind_var<int> depths_depth;
        unwind_var<int> zot_depth;
        unwind_var<int> crypt_depth;
        unwind_var<int> tomb_depth;
        unwind_var<int> spider_depth;
        unwind_var<int> pan_depth;

        curated_vault_env()
            : data_directory(SysEnv.crawl_dir, "."),
              dungeon_depth(brdepth[BRANCH_DUNGEON], 15),
              orc_depth(brdepth[BRANCH_ORC], 2),
              elf_depth(brdepth[BRANCH_ELF], 3),
              lair_depth(brdepth[BRANCH_LAIR], 5),
              vaults_depth(brdepth[BRANCH_VAULTS], 5),
              depths_depth(brdepth[BRANCH_DEPTHS], 4),
              zot_depth(brdepth[BRANCH_ZOT], 5),
              crypt_depth(brdepth[BRANCH_CRYPT], 3),
              tomb_depth(brdepth[BRANCH_TOMB], 3),
              spider_depth(brdepth[BRANCH_SPIDER], 4),
              pan_depth(brdepth[BRANCH_PANDEMONIUM], 1)
        {
            init_monsters();
            init_mon_name_cache();
            init_item_name_cache();
            databaseSystemInit();
            init_show_table();
            init_feat_desc_cache();
            // The dungeon Lua state (and dungeon.lua's hook tables) must be
            // initialised exactly once per process; re-running it between
            // test cases leaves dgn.MAP_HOOK_NAMES undefined for later maps.
            static const bool lua_ready = []() { init_dungeon_lua(); return true; }();
            (void)lua_ready;
        }

        ~curated_vault_env()
        {
            databaseSystemShutdown();
        }
    };

    void _load_des_once(const char* file, const char* sentinel)
    {
        if (!find_map_by_name(sentinel))
            read_map(file);
    }

    const map_def* _require_map(const char* name)
    {
        const map_def* definition = find_map_by_name(name);
        INFO("map " << name);
        REQUIRE(definition);
        return definition;
    }

    // Load and run the map's lua so that tags and monster specs added
    // through the des lua helpers (place_unique, standard_overflow_setup,
    // golemforge_portal) are present on the returned copy.
    map_def _generate(const map_def* definition, branch_type branch, int depth)
    {
        you.where_are_you = branch;
        you.depth = depth;
        map_def generated = *definition;
        generated.load();
        const string error = generated.run_lua(true);
        INFO(definition->name << ": " << error);
        REQUIRE(error.empty());
        return generated;
    }

    string _first_monster_name(map_def& generated)
    {
        REQUIRE_FALSE(generated.mons.empty());
        const mons_spec spec = generated.mons.get_monster(0);
        const monsterentry* entry = get_monster_data(spec.type);
        REQUIRE(entry);
        return entry->name;
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Curated unique vaults place the ported uniques at their depths",
                 "[curated-vaults][uniques]")
{
    curated_vault_env env;
    _load_des_once("des/builder/uniques.des", "uniq_asclepia");

    struct unique_case
    {
        const char* vault;
        const char* monster;
        vector<level_id> usable;
        vector<level_id> unusable;
    };

    const vector<unique_case> cases = {
        { "uniq_asclepia", "Asclepia",
          { level_id(BRANCH_DUNGEON, 10), level_id(BRANCH_DUNGEON, 12),
            level_id(BRANCH_ORC, 1), level_id(BRANCH_LAIR, 1),
            level_id(BRANCH_LAIR, 3) },
          { level_id(BRANCH_DUNGEON, 9), level_id(BRANCH_DUNGEON, 13),
            level_id(BRANCH_ORC, 2), level_id(BRANCH_LAIR, 4) } },
        { "uniq_brandagoth", "Brandagoth",
          { level_id(BRANCH_DUNGEON, 12), level_id(BRANCH_DUNGEON, 15),
            level_id(BRANCH_ELF, 1), level_id(BRANCH_VAULTS, 1),
            level_id(BRANCH_VAULTS, 3) },
          { level_id(BRANCH_DUNGEON, 11), level_id(BRANCH_ELF, 3),
            level_id(BRANCH_VAULTS, 4) } },
        { "uniq_lichbane", "Lichbane",
          { level_id(BRANCH_DEPTHS, 3), level_id(BRANCH_DEPTHS, 4),
            level_id(BRANCH_VAULTS, 2), level_id(BRANCH_CRYPT, 1),
            level_id(BRANCH_TOMB, 1) },
          { level_id(BRANCH_DEPTHS, 2), level_id(BRANCH_VAULTS, 1),
            level_id(BRANCH_DUNGEON, 15) } },
        { "uniq_fallen", "Fallen",
          { level_id(BRANCH_DEPTHS, 3), level_id(BRANCH_VAULTS, 2),
            level_id(BRANCH_CRYPT, 1), level_id(BRANCH_TOMB, 1) },
          { level_id(BRANCH_DEPTHS, 2), level_id(BRANCH_VAULTS, 1),
            level_id(BRANCH_PANDEMONIUM, 1) } },
        { "uniq_fallen_pan", "Fallen",
          { level_id(BRANCH_PANDEMONIUM, 1) },
          { level_id(BRANCH_DEPTHS, 3), level_id(BRANCH_DUNGEON, 15) } },
        { "uniq_rin", "Rin the nine-tailed",
          { level_id(BRANCH_DEPTHS, 3), level_id(BRANCH_VAULTS, 2),
            level_id(BRANCH_CRYPT, 1) },
          { level_id(BRANCH_DEPTHS, 2), level_id(BRANCH_VAULTS, 1),
            level_id(BRANCH_TOMB, 1) } },
    };

    for (const unique_case& uc : cases)
    {
        const map_def* definition = _require_map(uc.vault);
        INFO(uc.vault << ": " << definition->depths.describe());
        for (const level_id& lid : uc.usable)
        {
            INFO("expected usable in " << lid.describe());
            CHECK(definition->is_usable_in(lid));
        }
        for (const level_id& lid : uc.unusable)
        {
            INFO("expected unusable in " << lid.describe());
            CHECK_FALSE(definition->is_usable_in(lid));
        }

        map_def generated = _generate(definition, uc.usable[0].branch,
                                      uc.usable[0].depth);
        CHECK(_first_monster_name(generated) == uc.monster);
        CHECK(generated.find_glyph('1').size() == 1);
    }

    // The Pan variant is an extra, duplicable fallback that must not double
    // up with the regular placement.
    const map_def* fallen_pan = _require_map("uniq_fallen_pan");
    CHECK(fallen_pan->has_tag("luniq_fallen"));
    CHECK(fallen_pan->has_tag("allow_dup"));
    CHECK(fallen_pan->has_tag("extra"));
    CHECK_FALSE(fallen_pan->has_tag("place_unique"));

    map_def rin = _generate(_require_map("uniq_rin"), BRANCH_DEPTHS, 3);
    CHECK(rin.has_tag("place_unique"));
    CHECK(rin.has_tag("transparent"));
    map_def brandagoth = _generate(_require_map("uniq_brandagoth"),
                                   BRANCH_ELF, 1);
    CHECK(brandagoth.mons.get_monster(0).band);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Curated shop and Zot vaults are defined at their depths",
                 "[curated-vaults]")
{
    curated_vault_env env;
    _load_des_once("des/builder/shops.des", "caravan_mercenary_shop");
    _load_des_once("des/branches/zot.des", "hall_of_Zot_bcrawl");

    const map_def* shop = _require_map("caravan_mercenary_shop");
    INFO(shop->depths.describe());
    for (const level_id& lid : { level_id(BRANCH_DUNGEON, 4),
                                 level_id(BRANCH_DUNGEON, 15),
                                 level_id(BRANCH_DEPTHS, 1),
                                 level_id(BRANCH_ORC, 1),
                                 level_id(BRANCH_ELF, 2),
                                 level_id(BRANCH_SHOALS, 1),
                                 level_id(BRANCH_SNAKE, 1),
                                 level_id(BRANCH_VAULTS, 3) })
    {
        INFO("expected usable in " << lid.describe());
        CHECK(shop->is_usable_in(lid));
    }
    for (const level_id& lid : { level_id(BRANCH_DUNGEON, 3),
                                 level_id(BRANCH_LAIR, 1),
                                 level_id(BRANCH_ZOT, 1) })
    {
        INFO("expected unusable in " << lid.describe());
        CHECK_FALSE(shop->is_usable_in(lid));
    }
    CHECK(shop->find_glyph('S').size() == 1);

    const map_def* zot = _require_map("hall_of_Zot_bcrawl");
    INFO(zot->place.describe());
    CHECK(zot->place.is_usable_in(level_id(BRANCH_ZOT, brdepth[BRANCH_ZOT])));
    CHECK_FALSE(zot->place.is_usable_in(level_id(BRANCH_ZOT, 1)));
    CHECK_FALSE(zot->place.is_usable_in(level_id(BRANCH_DEPTHS, 1)));
    CHECK(zot->orient == MAP_NORTH);
    CHECK(zot->has_tag("no_dump"));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Overflow altar vaults exist for the three ported gods",
                 "[curated-vaults][altars]")
{
    curated_vault_env env;
    _load_des_once("des/altar/overflow.des", "altar_imus_thea_hall_of_mirrors");

    struct altar_case
    {
        const char* vault;
        const char* god_tag;
        const char* altar_feature;
        vector<level_id> usable;
        vector<level_id> unusable;
    };

    const vector<altar_case> cases = {
        { "altar_imus_thea_hall_of_mirrors", "imus_thea", "altar_imus_thea",
          { level_id(BRANCH_DUNGEON, 3), level_id(BRANCH_DUNGEON, 9),
            level_id(BRANCH_ORC, 1), level_id(BRANCH_ELF, 1) },
          { level_id(BRANCH_DUNGEON, 2), level_id(BRANCH_LAIR, 1) } },
        { "altar_great_wyrm_alchemical_lab", "the_great_wyrm",
          "altar_great_wyrm",
          { level_id(BRANCH_DUNGEON, 3), level_id(BRANCH_DUNGEON, 9),
            level_id(BRANCH_ORC, 1), level_id(BRANCH_ELF, 1) },
          { level_id(BRANCH_DUNGEON, 2), level_id(BRANCH_LAIR, 1) } },
        { "altar_agraphede_web_nest", "agraphede", "altar_agraphede",
          { level_id(BRANCH_DUNGEON, 4), level_id(BRANCH_DUNGEON, 9),
            level_id(BRANCH_LAIR, 1), level_id(BRANCH_SPIDER, 1) },
          { level_id(BRANCH_DUNGEON, 3), level_id(BRANCH_ORC, 1) } },
    };

    for (const altar_case& ac : cases)
    {
        const map_def* definition = _require_map(ac.vault);
        INFO(ac.vault << ": " << definition->depths.describe());
        for (const level_id& lid : ac.usable)
        {
            INFO("expected usable in " << lid.describe());
            CHECK(definition->is_usable_in(lid));
        }
        for (const level_id& lid : ac.unusable)
        {
            INFO("expected unusable in " << lid.describe());
            CHECK_FALSE(definition->is_usable_in(lid));
        }

        // The altar feature itself must be a real feature name.
        const dungeon_feature_type altar
            = dungeon_feature_by_name(ac.altar_feature);
        CHECK(altar != DNGN_UNSEEN);
        CHECK(feat_is_altar(altar));

        map_def generated = _generate(definition, ac.usable[0].branch,
                                      ac.usable[0].depth);
        // The tags the overflow temple code (dungeon.cc) looks for are
        // temple_overflow_1 plus temple_overflow_<god name with underscores>
        // and buniq_altar_<same>.
        CHECK(generated.has_tag("temple_overflow_1"));
        CHECK(generated.has_tag(string("temple_overflow_") + ac.god_tag));
        CHECK(generated.has_tag(string("buniq_altar_") + ac.god_tag));
        CHECK_FALSE(generated.has_tag("temple_overflow_generic_1"));
        // A single altar glyph, and a map that stays small.
        CHECK(generated.find_glyph('_').size() == 1);
        CHECK(generated.size().x <= 9);
        CHECK(generated.size().y <= 9);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Golemforge entry vaults share one portal chance",
                 "[curated-vaults][golemforge]")
{
    curated_vault_env env;
    _load_des_once("des/portals/golemforge.des", "golemforge_main");

    for (const char* name : { "portal_golemforge_entry",
                              "portal_golemforge_entry_sealed_gate",
                              "portal_golemforge_entry_anvil_hall" })
    {
        const map_def* definition = _require_map(name);
        INFO(name << ": " << definition->depths.describe());
        for (const level_id& lid : { level_id(BRANCH_ELF, 1),
                                     level_id(BRANCH_ELF, 3),
                                     level_id(BRANCH_DEPTHS, 1),
                                     level_id(BRANCH_DEPTHS, 4) })
        {
            INFO("expected usable in " << lid.describe());
            CHECK(definition->is_usable_in(lid));
        }
        for (const level_id& lid : { level_id(BRANCH_DEPTHS, 5),
                                     level_id(BRANCH_DUNGEON, 15),
                                     level_id(BRANCH_VAULTS, 1) })
        {
            INFO("expected unusable in " << lid.describe());
            CHECK_FALSE(definition->is_usable_in(lid));
        }

        map_def generated = _generate(definition, BRANCH_ELF, 1);
        // golemforge_portal(_G) gives every entry the same uniq_/chance_
        // tags, so adding layouts does not multiply the per-level chance.
        CHECK(generated.has_tag("uniq_golemforge"));
        CHECK(generated.has_tag("chance_golemforge"));
        CHECK(generated.has_tag("transparent"));
        CHECK(generated.find_glyph('O').size() == 1);
    }
}
