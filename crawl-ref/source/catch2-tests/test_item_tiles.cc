#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#ifdef USE_TILE
#include "ability-type.h"
#include "artefact.h"
#include "bag.h"
#include "coord.h"
#include "describe.h"
#include "describe-god.h"
#include "god-type.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "mon-info.h"
#include "mon-util.h"
#include "player.h"
#include "potion-type.h"
#include "random.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-feat.h"
#include "rltiles/tiledef-gui.h"
#include "rltiles/tiledef-icons.h"
#include "rltiles/tiledef-player.h"
#include "test_player_fixture.h"
#include "terrain.h"
#include "tilepick.h"
#include "tilepick-p.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Stored bag items render in menus without a floor position",
                 "[item-tiles][bag-menu]")
{
    item_def pouch;
    pouch.base_type = OBJ_MISCELLANY;
    pouch.sub_type = MISC_POUCH;
    pouch.quantity = 1;
    pouch.rnd = 1;
    item_def potion;
    potion.base_type = OBJ_POTIONS;
    potion.sub_type = POT_CURING;
    potion.quantity = 1;
    potion.rnd = 1;
    REQUIRE(bag::store(pouch, potion, 1));
    vector<item_def> contents = bag::contents(pouch);
    REQUIRE(contents.size() == 1);
    contents[0].link = 0; // The bag menu assigns a selection identity.
    REQUIRE_FALSE(in_bounds(contents[0].pos));
    vector<tile_def> layers;
    REQUIRE(get_tiles_for_item(contents[0], layers, true));
    REQUIRE_FALSE(layers.empty());
}

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
    CHECK(tileidx_known_base_item(TILE_RING_INSULATION) == TILE_UNSEEN_RING);
    you.type_ids[OBJ_JEWELLERY][RING_ELEC_RESISTANCE] = true;
    CHECK(tileidx_known_base_item(TILE_RING_INSULATION)
          == TILE_RING_NORMAL_OFFSET
             + you.item_description[IDESC_RINGS][RING_ELEC_RESISTANCE]
               % NDSC_JEWEL_PRI);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Wyrm essence labels are distinct and hide unknown potions",
                 "[item-tiles][wyrm-ui]")
{
    const pair<potion_type, tileidx_t> essences[] = {
        {POT_NIGREDO, TILE_WYRM_NIGREDO},
        {POT_ALBEDO, TILE_WYRM_ALBEDO},
        {POT_CITRINITAS, TILE_WYRM_CITRINITAS},
        {POT_VIRIDITAS, TILE_WYRM_VIRIDITAS},
        {POT_RUBEDO, TILE_WYRM_RUBEDO},
    };
    you.type_ids.init(false);
    for (const auto& essence : essences)
    {
        CAPTURE(essence.first);
        item_def item;
        item.base_type = OBJ_POTIONS;
        item.sub_type = essence.first;
        item.quantity = 1;
        item.rnd = 1;
        item_colour(item);
        CHECK(tileidx_item(item) != essence.second);
        CHECK(tileidx_known_base_item(essence.second) == TILE_UNSEEN_POTION);
        you.type_ids[OBJ_POTIONS][essence.first] = true;
        CHECK(tileidx_known_base_item(essence.second) != TILE_UNSEEN_POTION);
        item.flags |= ISFLAG_IDENTIFIED;
        CHECK(tileidx_item(item) == essence.second);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "The Great Wyrm has altar and invocation artwork",
                 "[item-tiles][wyrm-ui]")
{
    CHECK(feat_altar_god(altar_for_god(GOD_GREAT_WYRM)) == GOD_GREAT_WYRM);
    CHECK(tileidx_feature_base(DNGN_ALTAR_GREAT_WYRM)
          == TILE_DNGN_ALTAR_GREAT_WYRM);
    you.religion = GOD_GREAT_WYRM;
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_ENABLED) == TILEG_INVOCATIONS_WYRM_ON);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_FOCUSED) == TILEG_INVOCATIONS_WYRM_FOCUS);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_DISABLED) == TILEG_INVOCATIONS_WYRM_OFF);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_INACTIVE) == TILEG_INVOCATIONS_WYRM_INACTIVE);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_MASTERED) == TILEG_INVOCATIONS_WYRM_MAX);
    CHECK(tileidx_ability(ABIL_WYRM_INFUSE) == TILEG_ABILITY_WYRM_INFUSE);
    CHECK(tileidx_ability(ABIL_WYRM_NIGREDO) == TILEG_ABILITY_WYRM_NIGREDO);
    CHECK(tileidx_ability(ABIL_WYRM_ALBEDO) == TILEG_ABILITY_WYRM_ALBEDO);
    CHECK(tileidx_ability(ABIL_WYRM_CITRINITAS) == TILEG_ABILITY_WYRM_CITRINITAS);
    CHECK(tileidx_ability(ABIL_WYRM_VIRIDITAS) == TILEG_ABILITY_WYRM_VIRIDITAS);
    CHECK(tileidx_ability(ABIL_WYRM_RUBEDO) == TILEG_ABILITY_WYRM_RUBEDO);
    CHECK(tileidx_ability(ABIL_WYRM_FULSOME_DISTILLATION) == TILEG_ABILITY_WYRM_FULSOME_DISTILLATION);
    CHECK(tileidx_ability(ABIL_WYRM_EVAPORATE) == TILEG_ABILITY_WYRM_EVAPORATE);

    init_monsters();
    monster_info monster(MONS_ORC);
    monster.mb.set(MB_WYRM_NIGREDO);
    monster.mb.set(MB_WYRM_ALBEDO);
    monster.mb.set(MB_WYRM_CITRINITAS);
    monster.mb.set(MB_WYRM_VIRIDITAS);
    const auto icons = status_icons_for(monster);
    CHECK(icons.count(TILEI_WYRM_NIGREDO) == 1);
    CHECK(icons.count(TILEI_WYRM_ALBEDO) == 1);
    CHECK(icons.count(TILEI_WYRM_CITRINITAS) == 1);
    CHECK(icons.count(TILEI_WYRM_VIRIDITAS) == 1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Agraphede has altar and invocation artwork",
                 "[item-tiles][agraphede-ui]")
{
    CHECK(feat_altar_god(altar_for_god(GOD_AGRAPHEDE)) == GOD_AGRAPHEDE);
    CHECK(tileidx_feature_base(DNGN_ALTAR_AGRAPHEDE)
          == TILE_DNGN_ALTAR_AGRAPHEDE);
    you.religion = GOD_AGRAPHEDE;
    CHECK(god_title(GOD_AGRAPHEDE, SP_HUMAN, 1) == "Host");
    CHECK(god_title(GOD_AGRAPHEDE, SP_HUMAN, 200) == "Hivemind");
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_ENABLED) == TILEG_INVOCATIONS_AGRAPHEDE_ON);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_FOCUSED) == TILEG_INVOCATIONS_AGRAPHEDE_FOCUS);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_DISABLED) == TILEG_INVOCATIONS_AGRAPHEDE_OFF);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_INACTIVE) == TILEG_INVOCATIONS_AGRAPHEDE_INACTIVE);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_MASTERED) == TILEG_INVOCATIONS_AGRAPHEDE_MAX);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_WEB) == TILEG_ABILITY_AGRAPHEDE_WEB);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_CONVERT_POISON) == TILEG_ABILITY_AGRAPHEDE_CONVERT_POISON);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_ENCHANT_POISON) == TILEG_ABILITY_AGRAPHEDE_ENCHANT_POISON);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_TRAP) == TILEG_ABILITY_AGRAPHEDE_TRAP);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_HORNET_STING) == TILEG_ABILITY_AGRAPHEDE_HORNET_STING);
    CHECK(tileidx_ability(ABIL_AGRAPHEDE_SUMMON_SPIDER) == TILEG_ABILITY_AGRAPHEDE_SUMMON_SPIDER);
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
