#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#ifdef USE_TILE_WEB
#include <limits>

#include "env.h"
#include "feature.h"
#include "item-prop.h"
#include "json-wrapper.h"
#include "map-knowledge.h"
#include "mon-info.h"
#include "random.h"
#include "rltiles/tiledef-icons.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-player.h"
#include "test_player_fixture.h"
#include "tilecell.h"
#include "tilemcache.h"
#include "tilepick.h"
#include "tileweb.h"
#include "unwind.h"

namespace
{
// Protected member pointers address the real global serializer. No framework
// instance is downcast, and helpers that write through global tiles stay bound.
struct cell_serializer_probe : TilesFramework
{
    static string serialize(tile_with_flags_t foreground)
    {
        init_show_table();
        const auto buffer = &cell_serializer_probe::m_msg_buf;
        const auto frames = &cell_serializer_probe::m_json_stack;
        const auto send_cell = &cell_serializer_probe::_send_cell;
        unwind_var<string> captured(tiles.*buffer, "");
        unwind_var<vector<JsonFrame>> saved_frames(tiles.*frames, {});
        const coord_def position(40, 35);
        map_cell unknown;
        unwind_var<map_cell> known(env.map_knowledge(position), unknown);
        screen_cell_t previous{};
        previous.glyph = ' ';
        previous.colour = 7;
        previous.tile.bg = TILE_FLAG_UNSEEN;
        screen_cell_t next{};
        next.glyph = '@';
        next.colour = 7;
        next.tile.fg = foreground;
        map<uint32_t, coord_def> monster_locs;
        tiles.json_open_object();
        (tiles.*send_cell)(position, previous, next, unknown, unknown,
                          monster_locs, true);
        tiles.json_close_object();
        return tiles.*buffer;
    }
};

const JsonNode* member(const JsonNode* object, const char* name, JsonTag tag)
{
    REQUIRE(object != nullptr);
    REQUIRE(object->tag == JSON_OBJECT);
    const JsonNode* value = json_find_member(object, name);
    REQUIRE(value != nullptr);
    REQUIRE(value->tag == tag);
    return value;
}

const JsonNode* element(const JsonNode* array, int index, JsonTag tag)
{
    REQUIRE(array != nullptr);
    REQUIRE(array->tag == JSON_ARRAY);
    const JsonNode* value = json_find_element(array, index);
    REQUIRE(value != nullptr);
    REQUIRE(value->tag == tag);
    return value;
}

struct held_cache_entries
{
    vector<mcache_entry*> entries;
    ~held_cache_entries()
    {
        for (auto* entry : entries)
            entry->dec_ref();
    }
    tileidx_t add(const monster_info& monster)
    {
        const tileidx_t id = mcache.register_monster(monster);
        auto* entry = mcache.get(id);
        REQUIRE(entry != nullptr);
        entries.push_back(entry);
        entry->inc_ref();
        return id;
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Cached foreground beyond every atlas keeps its real layers",
                 "[webtiles-cached-foreground]")
{
    rng::generator ui_rng(rng::UI);
    monster_info monster(MONS_ORC);
    monster.props[MONSTER_TILE_KEY] = int(TILEP_MONS_ORC);
    auto* weapon = new item_def;
    weapon->base_type = OBJ_WEAPONS;
    weapon->sub_type = WPN_LONG_SWORD;
    weapon->quantity = 1;
    monster.inv[MSLOT_WEAPON].reset(weapon);
    REQUIRE(TILEI_ICONS_MAX >= TILEP_MCACHE_START);
    REQUIRE(TILEI_ICONS_MAX <= std::numeric_limits<tileidx_t>::max());
    held_cache_entries held;
    tileidx_t id = 0;
    const int limit = TILEI_ICONS_MAX - TILEP_MCACHE_START + 1;
    for (int attempt = 0; attempt < limit && id < TILEI_ICONS_MAX; ++attempt)
        id = held.add(monster);
    REQUIRE(id >= TILEI_ICONS_MAX);
    auto* entry = mcache.get(id);
    REQUIRE(entry != nullptr);
    tile_draw_info expected[mcache_entry::MAX_INFO_COUNT];
    const int count = entry->info(expected);
    REQUIRE(count > 0);
    const tile_with_flags_t foreground(id, TILE_FLAG_PET | TILE_FLAG_FLYING);
    CAPTURE(id, foreground.value, TILEI_ICONS_MAX, TILEP_MCACHE_START);
    const string wire = cell_serializer_probe::serialize(foreground);
    JsonWrapper decoded(json_decode(wire.c_str()));
    const JsonNode* tile = member(decoded.node, "t", JSON_OBJECT);
    CHECK(member(tile, "fg", JSON_NUMBER)->number_ == foreground.value);
    CHECK(json_find_member(tile, "base") == nullptr);
    member(tile, "doll", JSON_ARRAY);
    const JsonNode* layers = member(tile, "mcache", JSON_ARRAY);
    for (int index = 0; index < count; ++index)
    {
        const JsonNode* layer = element(layers, index, JSON_ARRAY);
        CHECK(element(layer, 0, JSON_NUMBER)->number_ == expected[index].idx);
        CHECK(element(layer, 1, JSON_NUMBER)->number_ == expected[index].ofs_x);
        CHECK(element(layer, 2, JSON_NUMBER)->number_ == expected[index].ofs_y);
        CHECK(json_find_element(layer, 3) == nullptr);
    }
    CHECK(json_find_element(layers, count) == nullptr);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Missing cached foreground keeps the native unknown fallback",
                 "[webtiles-cached-foreground]")
{
    const tileidx_t id = std::numeric_limits<tileidx_t>::max();
    REQUIRE(id >= TILEI_ICONS_MAX);
    REQUIRE(mcache.get(id) == nullptr);
    const tile_with_flags_t foreground(id, TILE_FLAG_PET | TILE_FLAG_FLYING);
    const string wire = cell_serializer_probe::serialize(foreground);
    JsonWrapper decoded(json_decode(wire.c_str()));
    const JsonNode* tile = member(decoded.node, "t", JSON_OBJECT);
    CHECK(member(tile, "fg", JSON_NUMBER)->number_ == foreground.value);
    CHECK(json_find_member(tile, "base") == nullptr);
    member(tile, "mcache", JSON_NULL);
    const JsonNode* doll = member(tile, "doll", JSON_ARRAY);
    const JsonNode* layer = element(doll, 0, JSON_ARRAY);
    CHECK(element(layer, 0, JSON_NUMBER)->number_ == TILEP_MONS_UNKNOWN);
    CHECK(element(layer, 1, JSON_NUMBER)->number_ == TILE_Y);
    CHECK(json_find_element(doll, 1) == nullptr);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Item foreground keeps its unknown appearance base metadata",
                 "[webtiles-cached-foreground]")
{
    const string wire = cell_serializer_probe::serialize(TILE_POT_HEAL_WOUNDS);
    JsonWrapper decoded(json_decode(wire.c_str()));
    const JsonNode* tile = member(decoded.node, "t", JSON_OBJECT);
    CHECK(member(tile, "fg", JSON_NUMBER)->number_ == TILE_POT_HEAL_WOUNDS);
    CHECK(member(tile, "base", JSON_NUMBER)->number_ == TILE_UNSEEN_POTION);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Ordinary monster atlas foreground keeps its single doll",
                 "[webtiles-cached-foreground]")
{
    const string wire = cell_serializer_probe::serialize(TILEP_MONS_ORC);
    JsonWrapper decoded(json_decode(wire.c_str()));
    const JsonNode* tile = member(decoded.node, "t", JSON_OBJECT);
    CHECK(member(tile, "fg", JSON_NUMBER)->number_ == TILEP_MONS_ORC);
    CHECK(json_find_member(tile, "base") == nullptr);
    const JsonNode* doll = member(tile, "doll", JSON_ARRAY);
    const JsonNode* layer = element(doll, 0, JSON_ARRAY);
    CHECK(element(layer, 0, JSON_NUMBER)->number_ == TILEP_MONS_ORC);
    CHECK(element(layer, 1, JSON_NUMBER)->number_ == TILE_Y);
}
#endif
