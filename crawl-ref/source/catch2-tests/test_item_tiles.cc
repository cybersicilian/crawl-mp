#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#ifdef USE_TILE
#include "artefact.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "player.h"
#include "random.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-player.h"
#include "test_player_fixture.h"
#include "tilepick.h"
#include "tilepick-p.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Every retained weapon has inventory and wielded sprites",
                 "[item-tiles]")
{
    for (const int subtype : all_item_subtypes(OBJ_WEAPONS))
    {
        for (const iflags_t style : {iflags_t{0}, iflags_t{ISFLAG_GLOWING},
                                    iflags_t{ISFLAG_RUNED},
                                    iflags_t{ISFLAG_EMBROIDERED_SHINY},
                                    iflags_t{ISFLAG_RANDART}})
        {
            CAPTURE(subtype, style);
            item_def item;
            item.base_type = OBJ_WEAPONS;
            item.sub_type = subtype;
            item.quantity = 1;
            item.flags = style;
            item.rnd = 1;

            const tileidx_t inventory = tileidx_item(item);
            CHECK(inventory > 0);
            CHECK(inventory < TILE_MAIN_MAX);
            CHECK(inventory != TILE_ERROR);
            CHECK(inventory != TILE_TODO);

            const tileidx_t wielded = tilep_equ_weapon(item);
            CHECK(wielded >= TILEP_HAND1_FIRST);
            CHECK(wielded <= TILEP_HAND1_LAST);
            const tileidx_t mirrored = mirror_weapon(item);
            CHECK(mirrored >= TILEP_HAND1_MIRROR_FIRST);
            CHECK(mirrored <= TILEP_HAND1_MIRROR_LAST);
        }
    }
}

#if TAG_MAJOR_VERSION == 34
TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Restored weapons use their own artwork and enchant variants",
                 "[item-tiles]")
{
    rng::generator inspection(rng::UI);
    const pair<weapon_type, tileidx_t> weapons[] = {
        {WPN_SPIKED_FLAIL, TILE_WPN_SPIKED_FLAIL},
        {WPN_HAMMER, TILE_WPN_HAMMER},
        {WPN_CUTLASS, TILE_WPN_CUTLASS},
        {WPN_SCYTHE, TILE_WPN_SCYTHE},
        {WPN_FUSTIBALUS, TILE_WPN_FUSTIBALUS},
    };
    for (const auto &weapon : weapons)
    {
        CAPTURE(weapon.first);
        item_def item;
        item.base_type = OBJ_WEAPONS;
        item.sub_type = weapon.first;
        item.quantity = 1;
        item_colour(item);
        CHECK(tileidx_item(item) == weapon.second);

        item.flags |= ISFLAG_GLOWING;
        CHECK(tileidx_item(item) == tile_main_enchanted(weapon.second, 3));
        CHECK(tileidx_item(item) != weapon.second);
        item.flags &= ~ISFLAG_COSMETIC_MASK;
        REQUIRE(make_item_randart(item, true));
        CHECK(tileidx_item(item) == tile_main_enchanted(weapon.second, 4));
        CHECK(tileidx_item(item) != weapon.second);

        vector<tile_def> layers;
        REQUIRE(get_tiles_for_item(item, layers, false));
        REQUIRE_FALSE(layers.empty());
        CHECK(layers[0].tile == tileidx_item(item));
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Centaur barding has inventory and equipped sprites",
                 "[item-tiles]")
{
    item_def item;
    item.base_type = OBJ_ARMOUR;
    item.sub_type = ARM_CENTAUR_BARDING;
    item.quantity = 1;
    item.rnd = 1;
    for (const iflags_t style : {iflags_t{0}, iflags_t{ISFLAG_GLOWING},
                                iflags_t{ISFLAG_RUNED},
                                iflags_t{ISFLAG_EMBROIDERED_SHINY},
                                iflags_t{ISFLAG_RANDART}})
    {
        CAPTURE(style);
        item.flags = style;
        const int enchant = enchant_to_int(item);
        CHECK(tileidx_item(item)
              == tile_main_enchanted(TILE_ARM_CENTAUR_BARDING, enchant));
        CHECK(tilep_equ_boots(item)
              == tile_player_enchanted(TILEP_BOOTS_CENTAUR_BARDING, enchant));
    }
}
#endif

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Identifying an item preserves its inventory sprite",
                 "[item-tiles]")
{
    rng::generator inspection(rng::UI);
    for (const auto base : {OBJ_POTIONS, OBJ_SCROLLS, OBJ_JEWELLERY,
                            OBJ_WANDS, OBJ_STAVES})
    {
        for (const int subtype : all_item_subtypes(base))
        {
            if (base == OBJ_JEWELLERY && subtype >= NUM_RINGS
                && subtype < AMU_FIRST_AMULET)
            {
                continue;
            }
            for (const bool type_known : {false, true})
            {
                CAPTURE(static_cast<int>(base), subtype, type_known);
                you.type_ids.init(false);
                item_def item;
                item.base_type = base;
                item.sub_type = subtype;
                item.quantity = 1;
                item_colour(item);
                const tileidx_t appearance = tileidx_item(item);
                vector<tile_def> unknown;
                REQUIRE(get_tiles_for_item(item, unknown, false));
                REQUIRE(unknown.size() == 1);
                REQUIRE(unknown[0].tile == appearance);

                if (type_known)
                    you.type_ids[base][subtype] = true;
                else
                    item.flags |= ISFLAG_IDENTIFIED;
                REQUIRE(item.is_identified());
                vector<tile_def> layers;
                REQUIRE(get_tiles_for_item(item, layers, false));
                REQUIRE(layers.size() >= 2);
                CHECK(layers[0].tile == appearance);
                CHECK(layers[1].tile == tileidx_item(item));
            }
        }
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Catalogue labels still hide unknown appearances",
                 "[item-tiles]")
{
    you.type_ids.init(false);
    CHECK(tileidx_known_base_item(TILE_POT_HEAL_WOUNDS) == TILE_UNSEEN_POTION);
    CHECK(tileidx_known_base_item(TILE_RING_SLAYING) == TILE_UNSEEN_RING);
    CHECK(tileidx_known_base_item(TILE_AMU_GUARDIAN_SPIRIT) == TILE_UNSEEN_AMULET);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Random artefacts keep their unique inventory sprite",
                 "[item-tiles]")
{
    rng::generator inspection(rng::UI);
    for (const auto base : {OBJ_JEWELLERY, OBJ_STAVES})
    {
        item_def item;
        item.base_type = base;
        item.sub_type = base == OBJ_JEWELLERY ? RING_PROTECTION : STAFF_FIRE;
        item.quantity = 1;
        item_colour(item);
        REQUIRE(make_item_randart(item, true));
        const tileidx_t appearance = tileidx_item(item);
        item.flags |= ISFLAG_IDENTIFIED;
        vector<tile_def> layers;
        REQUIRE(get_tiles_for_item(item, layers, false));
        CHECK(layers[0].tile == appearance);
    }
}
#endif
