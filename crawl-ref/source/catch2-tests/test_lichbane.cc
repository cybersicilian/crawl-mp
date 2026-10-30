#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "artefact.h"
#include "art-enum.h"
#include "branch.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "mgen-data.h"
#include "mon-cast.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "spl-util.h"
#include "state.h"
#include "status.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct lichbane_fixture : vellum_fixture
{
#ifdef USE_TILE_LOCAL
    unwind_var<bool> headless{crawl_state.tiles_disabled, true};
#endif
    int old_max = env.max_mon_index;
    lichbane_fixture()
    {
        init_monsters();
        init_spell_descs();
        init_mons_spells();
        init_duration_index();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.where_are_you = BRANCH_CRYPT;
        you.depth = 2;
        you.unique_creatures.set(MONS_LICHBANE, false);
        you.unique_items[UNRAND_UNDEADHUNTER - UNRAND_START] = UNIQ_NOT_EXISTS;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }
    ~lichbane_fixture()
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
    monster* spawn_lichbane()
    {
        return create_monster(mgen_data(MONS_LICHBANE, BEH_HOSTILE,
                                       you.pos() + coord_def(5, 0), MHITNOT,
                                       MG_FORCE_PLACE));
    }
};
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane uses the original undead-hunter spells",
                 "[lichbane]")
{
    monster hunter;
    hunter.type = MONS_LICHBANE;
    CHECK(hunter.holiness() & MH_UNDEAD);
    CHECK(mons_class_flag(MONS_LICHBANE, M_NO_REGEN));
    mons_load_spells(hunter);
    CHECK(hunter.has_spell(SPELL_DISPEL_UNDEAD));
    CHECK(hunter.has_spell(SPELL_SAP_MAGIC));
    CHECK(hunter.has_spell(SPELL_HARPOON_SHOT));
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane receives Undeadhunter only when available",
                 "[lichbane][artefact]")
{
    bool available = true;
    SECTION("the artefact has not been generated") { }
    SECTION("the artefact is already carried")
    {
        item_def& held = unique(1, UNRAND_UNDEADHUNTER);
        REQUIRE(is_unrandom_artefact(held, UNRAND_UNDEADHUNTER));
        available = false;
    }
    SECTION("the artefact is lost in the Abyss")
    {
        you.unique_items[UNRAND_UNDEADHUNTER - UNRAND_START] = UNIQ_LOST_IN_ABYSS;
        available = false;
    }

    monster* hunter = spawn_lichbane();
    REQUIRE(hunter);
    item_def* weapon = hunter->mslot_item(MSLOT_WEAPON);
    REQUIRE(weapon);
    CHECK(is_unrandom_artefact(*weapon, UNRAND_UNDEADHUNTER) == available);
    CHECK(get_unique_item_status(UNRAND_UNDEADHUNTER) != UNIQ_NOT_EXISTS);
    if (available)
        CHECK(get_weapon_brand(*weapon) == SPWPN_NORMAL);
    else
        CHECK((weapon->sub_type == WPN_GREAT_MACE
               || weapon->sub_type == WPN_BATTLEAXE
               || weapon->sub_type == WPN_GREAT_SWORD));
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane honours another party member's artefact reservation",
                 "[lichbane][artefact][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    party::set_multiplayer(true);
    unique_item_status_type reserved = UNIQ_EXISTS;
    SECTION("generated artefact") { }
    SECTION("artefact lost in the Abyss") { reserved = UNIQ_LOST_IN_ABYSS; }
    SECTION("artefact generated outside levelgen") { reserved = UNIQ_EXISTS_NONLEVELGEN; }
    companion.unique_items[UNRAND_UNDEADHUNTER - UNRAND_START] = reserved;
    REQUIRE(get_unique_item_status(UNRAND_UNDEADHUNTER) == UNIQ_NOT_EXISTS);

    monster* hunter = spawn_lichbane();
    REQUIRE(hunter);
    item_def* weapon = hunter->mslot_item(MSLOT_WEAPON);
    REQUIRE(weapon);
    CHECK_FALSE(is_unrandom_artefact(*weapon, UNRAND_UNDEADHUNTER));
    CHECK(get_unique_item_status(UNRAND_UNDEADHUNTER) == reserved);
    party::sync_shared_state_from_active();
    CHECK(companion.unique_items[UNRAND_UNDEADHUNTER - UNRAND_START] == reserved);
    CHECK(get_unique_item_status(UNRAND_UNDEADHUNTER) == reserved);
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane's artefact reservation is shared with the party",
                 "[lichbane][artefact][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    party::set_multiplayer(true);
    monster* hunter = spawn_lichbane();
    REQUIRE(hunter);
    REQUIRE(hunter->mslot_item(MSLOT_WEAPON));
    REQUIRE(is_unrandom_artefact(*hunter->mslot_item(MSLOT_WEAPON),
                                 UNRAND_UNDEADHUNTER));
    CHECK(companion.unique_items[UNRAND_UNDEADHUNTER - UNRAND_START]
          != UNIQ_NOT_EXISTS);
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane preserves an existing artefact over a lost record",
                 "[lichbane][artefact][party]")
{
    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    party::set_multiplayer(true);
    unique_item_status_type existing = UNIQ_EXISTS;
    SECTION("generated on a level") { }
    SECTION("generated outside levelgen") { existing = UNIQ_EXISTS_NONLEVELGEN; }
    const int index = UNRAND_UNDEADHUNTER - UNRAND_START;
    you.unique_items[index] = UNIQ_LOST_IN_ABYSS;
    companion.unique_items[index] = existing;

    monster* hunter = spawn_lichbane();
    REQUIRE(hunter);
    REQUIRE(hunter->mslot_item(MSLOT_WEAPON));
    CHECK_FALSE(is_unrandom_artefact(*hunter->mslot_item(MSLOT_WEAPON),
                                    UNRAND_UNDEADHUNTER));
    CHECK(get_unique_item_status(UNRAND_UNDEADHUNTER) == existing);
    party::sync_shared_state_from_active();
    CHECK(get_unique_item_status(UNRAND_UNDEADHUNTER) == existing);
    CHECK(companion.unique_items[index] == existing);
}

TEST_CASE_METHOD(lichbane_fixture, "Lichbane's Undeadhunter actually disrupts undead",
                 "[lichbane][artefact][combat]")
{
    monster* hunter = spawn_lichbane();
    REQUIRE(hunter);
    REQUIRE(hunter->mslot_item(MSLOT_WEAPON));
    REQUIRE(is_unrandom_artefact(*hunter->mslot_item(MSLOT_WEAPON),
                                 UNRAND_UNDEADHUNTER));
    bool undead_target = true;
    monster_type target_type = MONS_DRAUGR;
    SECTION("undead") { }
    SECTION("living") { target_type = MONS_ORC; undead_target = false; }
    mgen_data target_gen(target_type, BEH_FRIENDLY,
                         hunter->pos() + coord_def(1, 0), MHITNOT,
                         MG_FORCE_PLACE);
    if (undead_target)
        target_gen.base_type = MONS_ORC;
    monster* target = create_monster(target_gen);
    REQUIRE(target);
    REQUIRE(bool(target->holiness() & MH_UNDEAD) == undead_target);
    target->hit_points = target->max_hit_points = 30000;
    target->set_hit_dice(1);
    bool saw_extra_damage = false;
    bool saw_hit = false;
    for (int i = 0; i < 100 && target->alive() && !saw_extra_damage; ++i)
    {
        melee_attack hit(hunter, target);
        hit.attack();
        saw_hit |= hit.damage_done > 0;
        if (hit.damage_done > 0 && hit.total_damage_done > hit.damage_done)
            saw_extra_damage = true;
    }
    CHECK(saw_hit);
    CHECK(saw_extra_damage == undead_target);
}
