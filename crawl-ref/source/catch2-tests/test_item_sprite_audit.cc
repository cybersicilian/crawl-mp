#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#ifdef USE_TILE
#include <fstream>
#include <set>
#include <tuple>
#include "artefact.h"
#include "art-enum.h"
#include "book-type.h"
#include "decks.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "json-wrapper.h"
#include "makeitem.h"
#include "mon-util.h"
#include "player.h"
#include "random.h"
#include "spell-type.h"
#include "spl-util.h"
#include "test_player_fixture.h"
#include "tilepick.h"
#include "tilepick-p.h"
#include "tiles.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-player.h"
#include "rltiles/tiledef-icons.h"

namespace
{
class ItemSpriteAudit
{
    JsonWrapper report{json_mkobject()};
    JsonNode *rows = json_mkarray();
    JsonNode *excluded = json_mkarray();
    std::set<std::tuple<int, int, int, string, int>> seen;
    std::set<std::tuple<int, int, int>> entries;
    unsigned cases = 0;

    void emit(const item_def &item, const string &role, tileidx_t tile)
    {
        const int identity = is_unrandom_artefact(item) ? item.unrand_idx
                           : item.base_type == OBJ_CORPSES ? int(item.mon_type) : 0;
        if (!seen.emplace(item.base_type, item.sub_type, identity, role, tile).second)
            return;
        const bool primary = role == "base";
        const bool equipped = role == "equipped" || role == "mirrored";
        CHECK(tile != 0);
        CHECK(tile != TILE_ERROR);
        CHECK(tile != TILE_TODO);
        if (primary)
        {
            CHECK(tile >= TILE_FEAT_MAX);
            CHECK(tile < TILE_MAIN_MAX);
            CHECK(tile != TILE_UNSEEN_ITEM);
            CHECK(tile != TILE_UNSEEN_WEAPON);
            CHECK(tile != TILE_UNSEEN_ARMOUR);
        }
        if (equipped)
        {
            CHECK(tile >= TILE_MAIN_MAX);
            CHECK(tile < TILEP_PLAYER_MAX);
        }
        JsonNode *row = json_mkobject();
        auto number = [row](const char *name, int value) {
            json_append_member(row, name, json_mknumber(value));
        };
        number("base", item.base_type); number("subtype", item.sub_type);
        number("identity", identity);
        number("tile", tile);
        json_append_member(row, "class", json_mkstring(item_class_name(item.base_type)));
        json_append_member(row, "item", json_mkstring(item.name(DESC_PLAIN, true).c_str()));
        json_append_member(row, "role", json_mkstring(role.c_str()));
        const TextureID texture = get_tile_texture(tile);
        const char *name = texture == TEX_PLAYER ? "player"
                         : texture == TEX_ICONS ? "icons" : "main";
        json_append_member(row, "texture", json_mkstring(name));
        if (tile && tile != TILE_ERROR && tile != TILE_TODO
            && (texture == TEX_PLAYER || texture == TEX_DEFAULT || texture == TEX_ICONS))
        {
            const tile_info &info = texture == TEX_PLAYER ? tile_player_info(tile)
                                  : texture == TEX_ICONS ? tile_icons_info(tile) : tile_main_info(tile);
            number("sx", info.sx); number("sy", info.sy);
            number("ex", info.ex); number("ey", info.ey);
            number("ox", info.offset_x); number("oy", info.offset_y);
            json_append_member(row, "tile_name", json_mkstring(texture == TEX_PLAYER ? tile_player_name(tile)
                : texture == TEX_ICONS ? tile_icons_name(tile) : tile_main_name(tile)));
        }
        json_append_element(rows, row);
    }

public:
    ItemSpriteAudit()
    {
        json_append_member(report.node, "rows", rows);
        json_append_member(report.node, "legacy_exclusions", excluded);
    }

    void exclude(const item_def &item)
    {
        JsonNode *entry = json_mkobject();
        json_append_member(entry, "base", json_mknumber(item.base_type));
        json_append_member(entry, "subtype", json_mknumber(item.sub_type));
        json_append_member(entry, "item", json_mkstring(item.name(DESC_PLAIN, true).c_str()));
        json_append_element(excluded, entry);
    }

    void inspect(item_def &item)
    {
        ++cases;
        entries.emplace(item.base_type, item.sub_type, is_unrandom_artefact(item) ? item.unrand_idx
            : item.base_type == OBJ_CORPSES ? int(item.mon_type) : 0);
        CAPTURE(int(item.base_type), int(item.sub_type), item.rnd, item.flags, item.brand);
        emit(item, "base", tileidx_item(item));
        if (item.base_type == OBJ_CORPSES || item.base_type == OBJ_ORBS)
        {
            const auto first = tile_main_basetile(tileidx_item(item));
            for (unsigned variant = 0; variant < tile_main_count(first); ++variant)
                emit(item, "animation", first + variant);
        }
        vector<tile_def> layers;
        CHECK(get_tiles_for_item(item, layers, false));
        CHECK_FALSE(layers.empty());
        for (const auto &layer : layers)
            emit(item, "layer", layer.tile);
        if (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
        {
            emit(item, "equipped", tilep_equ_weapon(item));
            emit(item, "mirrored", mirror_weapon(item));
        }
        else if (item.base_type == OBJ_ARMOUR)
        {
            const tileidx_t doll[] = {tilep_equ_armour(item), tilep_equ_shield(item),
                tilep_equ_cloak(item), tilep_equ_helm(item), tilep_equ_gloves(item), tilep_equ_boots(item)};
            unsigned visible = 0;
            for (const auto tile : doll)
                if (tile) { emit(item, "equipped", tile); ++visible; }
            CHECK(visible > 0);
        }
    }

    void finish()
    {
        json_append_member(report.node, "cases_examined", json_mknumber(cases));
        json_append_member(report.node, "unique_rows", json_mknumber(seen.size()));
        json_append_member(report.node, "catalogue_entries", json_mknumber(entries.size()));
        const char *path = getenv("DCSS_ITEM_SPRITE_AUDIT");
        REQUIRE(path != nullptr);
        std::ofstream output(path);
        REQUIRE(output.good());
        output << report.to_string() << '\n';
    }
};

bool appearance_class(object_class_type base)
{
    return base == OBJ_POTIONS || base == OBJ_WANDS || base == OBJ_SCROLLS
           || base == OBJ_JEWELLERY || base == OBJ_STAVES;
}

bool save_only(const item_def &item)
{
#if TAG_MAJOR_VERSION == 34
    // Match the known-item catalogue exclusions and tags.cc's unconditional
    // hide conversion / needle migration. These are not active gameplay items.
    if (item.base_type == OBJ_FOOD) return true;
    if (item.base_type == OBJ_ARMOUR)
    {
        // armour_is_hide() also includes active dragon/troll armour. Only the
        // old raw-hide IDs are normalized away by save loading.
        switch (item.sub_type)
        {
        case ARM_TROLL_HIDE: case ARM_FIRE_DRAGON_HIDE: case ARM_ICE_DRAGON_HIDE:
        case ARM_STEAM_DRAGON_HIDE: case ARM_ACID_DRAGON_HIDE: case ARM_STORM_DRAGON_HIDE:
        case ARM_GOLDEN_DRAGON_HIDE: case ARM_SWAMP_DRAGON_HIDE: case ARM_PEARL_DRAGON_HIDE:
        case ARM_SHADOW_DRAGON_HIDE: case ARM_QUICKSILVER_DRAGON_HIDE: return true;
        }
    }
    if (item.is_type(OBJ_MISSILES, MI_NEEDLE)) return true;
    if (item.base_type == OBJ_MISCELLANY)
        return is_deck_type(item.sub_type) || item.sub_type == MISC_DECK_UNKNOWN
            || item.sub_type == MISC_BUGGY_EBONY_CASKET || item.sub_type == MISC_RUNE_OF_ZOT
            || item.sub_type == MISC_XOMS_CHESSBOARD;
#endif
    return false;
}
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "All retained items and artefacts have complete sprite layers",
                 "[item-sprite-audit]")
{
    rng::generator inspection(rng::UI);
    init_monsters();
    init_spell_descs();
    you.type_ids.init(false);
    ItemSpriteAudit audit;
    for (int type = 0; type < NUM_OBJECT_CLASSES; ++type)
    {
        const auto base = static_cast<object_class_type>(type);
        for (const int sub : all_item_subtypes(base))
        {
            if (base == OBJ_JEWELLERY && sub >= NUM_RINGS && sub < AMU_FIRST_AMULET)
                continue;
            item_def original;
            original.base_type = base; original.sub_type = sub; original.quantity = 1;
            if (save_only(original)) { audit.exclude(original); continue; }
            if (base == OBJ_BOOKS && sub == BOOK_PARCHMENT) original.plus = SPELL_MAGIC_DART;
            item_colour(original);
            for (const bool known : {false, true})
            {
                item_def item = original;
                if (known) item.flags |= ISFLAG_IDENTIFIED;
                for (int rnd = 0; rnd < 256; ++rnd)
                {
                    item.rnd = rnd;
                    if (base == OBJ_ORBS) you.frame_no = rnd;
                    if (appearance_class(base)) item.subtype_rnd = rnd;
                    audit.inspect(item);
                }
            }
            if (base == OBJ_WEAPONS || base == OBJ_ARMOUR)
            {
                for (const iflags_t style : {iflags_t{ISFLAG_GLOWING}, iflags_t{ISFLAG_RUNED},
                                             iflags_t{ISFLAG_EMBROIDERED_SHINY}})
                {
                    item_def item = original; item.flags |= style | ISFLAG_IDENTIFIED;
                    for (int rnd = 0; rnd < 256; ++rnd) { item.rnd = rnd; audit.inspect(item); }
                }
            }
            if (base == OBJ_WEAPONS || base == OBJ_ARMOUR || base == OBJ_JEWELLERY || base == OBJ_STAVES)
            {
                item_def item = original;
                const bool generated = make_item_randart(item, true);
                CHECK(generated);
                if (generated) for (const bool known : {false, true})
                {
                    if (known) item.flags |= ISFLAG_IDENTIFIED;
                    for (int rnd = 0; rnd < 256; ++rnd) { item.rnd = rnd; audit.inspect(item); }
                }
            }
            const int brands = base == OBJ_WEAPONS ? NUM_SPECIAL_WEAPONS
                             : base == OBJ_ARMOUR ? NUM_SPECIAL_ARMOURS
                             : base == OBJ_MISSILES ? NUM_SPECIAL_MISSILES : 0;
            for (int brand = 0; brand < brands; ++brand)
            {
                // Enum space also contains sentinels and transient attack effects;
                // the generation predicates deliberately abort for those values.
                if (base == OBJ_WEAPONS && (brand == NUM_REAL_SPECIAL_WEAPONS
                    || brand == SPWPN_CONFUSE || brand == SPWPN_WEAKNESS
                    || brand == SPWPN_VULNERABILITY || brand == SPWPN_DEBUG_RANDART)) continue;
                if (base == OBJ_ARMOUR && brand == NUM_REAL_SPECIAL_ARMOURS) continue;
                if (!(base == OBJ_WEAPONS ? is_weapon_brand_ok(sub, brand, true)
                    : base == OBJ_ARMOUR ? is_armour_brand_ok(sub, brand, true)
                    : is_missile_brand_ok(sub, brand, true))) continue;
                item_def item = original; item.brand = brand; item.flags |= ISFLAG_IDENTIFIED;
                audit.inspect(item);
            }
            if (base == OBJ_ORBS || base == OBJ_RUNES || base == OBJ_GEMS)
            {
                item_def item = original; item.quantity = 0; audit.inspect(item);
            }
            if (base == OBJ_GOLD)
            {
                item_def item = original;
                for (int quantity = 1; quantity <= 100; ++quantity)
                { item.quantity = quantity; audit.inspect(item); }
            }
            if (base == OBJ_MISCELLANY && is_xp_evoker(original))
            {
                item_def item = original;
                evoker_debt(sub) = 100000000; audit.inspect(item);
                evoker_debt(sub) = 0; audit.inspect(item);
            }
            if (base == OBJ_GEMS)
            {
                item_def item = original;
                you.gems_shattered.set(sub); audit.inspect(item);
                you.gems_shattered.reset();
            }
            if (base == OBJ_BOOKS && sub == BOOK_PARCHMENT)
            {
                for (int spell = 0; spell < NUM_SPELLS; ++spell)
                {
                    const auto spell_kind = static_cast<spell_type>(spell);
                    if (!is_valid_spell(spell_kind)) continue;
                    item_def item = original; item.plus = spell; audit.inspect(item);
                }
            }
        }
    }
    for (int index = UNRAND_START + 1; index <= UNRAND_LAST; ++index)
    {
        const auto *entry = get_unrand_entry(index);
        if (entry->base_type >= NUM_OBJECT_CLASSES || (entry->flags & UNRAND_FLAG_DELETED)
            || string(entry->name).find("DUMMY") != string::npos) continue;
        item_def item;
        item.base_type = entry->base_type; item.sub_type = entry->sub_type; item.quantity = 1;
        item_colour(item);
        REQUIRE(make_item_unrandart(item, index));
        for (const int plus : {0, 10, 12, 15, 18})
        {
            item.plus = plus;
            item.flags &= ~ISFLAG_IDENTIFIED; audit.inspect(item);
            item.flags |= ISFLAG_IDENTIFIED; audit.inspect(item);
        }
    }
    for (int type = 0; type < NUM_MONSTERS; ++type)
    {
        const auto monster = static_cast<monster_type>(type);
        if (invalid_monster_type(monster) || mons_is_removed(monster)
            || mons_class_flag(monster, M_CANT_SPAWN)) continue;
        const auto corpse_species = mons_species(monster);
        if (!mons_class_can_leave_corpse(corpse_species)) continue;
        for (const int sub : {CORPSE_BODY, CORPSE_SKELETON})
        {
            item_def item;
            item.base_type = OBJ_CORPSES; item.sub_type = sub;
            item.quantity = 1; item.mon_type = corpse_species; item.orig_monnum = monster;
            item_colour(item); audit.inspect(item);
        }
    }
    audit.finish();
}
#endif
