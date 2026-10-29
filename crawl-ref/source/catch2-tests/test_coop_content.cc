#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "artefact.h"
#include "coop-content.h"
#include "env.h"
#include "dlua.h"
#include "database.h"
#include "item-name.h"
#include "mon-util.h"
#include "terrain.h"
#include "maps.h"
#include "evoke.h"
#include "feature.h"
#include "fight.h"
#include "item-prop.h"
#include "initfile.h"
#include "unwind.h"
#include "los.h"
#include "makeitem.h"
#include "mon-pick.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "spl-book.h"
#include "spl-selfench.h"
#include "spl-util.h"
#include "test_player_fixture.h"

namespace
{
struct fellowship_fixture : MockPlayerYouTestsFixture
{
    vector<dungeon_feature_type> terrain;
    fellowship_fixture()
    {
        init_spell_descs();
        init_show_table();
        party::set_multiplayer(false);
        party::set_player_count(1);
        you.set_position(coord_def(40, 35));
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = 10;
        you.hp_max = 50;
        you.religion = GOD_ELYVILON;
        you.raw_piety = 100;
        you.penance[GOD_ELYVILON] = 0;
        for (int y = 28; y <= 42; ++y)
            for (int x = 33; x <= 47; ++x)
            {
                terrain.push_back(env.grid(coord_def(x, y)));
                env.grid(coord_def(x, y)) = DNGN_FLOOR;
            }
        los_changed();
    }
    ~fellowship_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        int i = 0;
        for (int y = 28; y <= 42; ++y)
            for (int x = 33; x <= 47; ++x)
                env.grid(coord_def(x, y)) = terrain[i++];
        los_changed();
    }
    player &companion(int slot, god_type god = GOD_ZIN)
    {
        player &ally = party::get_player(slot);
        ally = you;
        ally.save = nullptr;
        ally.mid = party::mid_for_slot(slot);
        ally.religion = god;
        ally.penance[god] = 0;
        ally.set_position(you.pos() + coord_def(slot, 0));
        party::set_player_downed(slot, false);
        return ally;
    }
};
}

TEST_CASE_METHOD(fellowship_fixture, "Exclusive content follows saved multiplayer mode, not roster size", "[coop-content]")
{
    CHECK_FALSE(coop_content::enabled());
    CHECK_FALSE(player_has_ability(ABIL_PANTHEON_CONVERGENCE));
    CHECK(consumable_rarity(OBJ_POTIONS, POT_CONCORD) == RARITY_NONE);
    CHECK_FALSE(coop_content::spell_available(SPELL_AEGIS_LINK));
    CHECK(coop_content::spell_available(SPELL_AURA_OF_PROTECTION));
    CHECK_FALSE(coop_content::exclusive_item(OBJ_POTIONS, POT_CURING));
    CHECK(coop_content::exclusive_item(OBJ_MISCELLANY, MISC_SKALD_HORN));
    CHECK(coop_content::exclusive_unrand(UNRAND_DAWNFORGED));
    CHECK(coop_content::exclusive_unrand(UNRAND_SHIELDMATE_GAUNTLETS));
    party::set_player_count(2);
    companion(1);
    CHECK_FALSE(coop_content::enabled()); // A local multi-hero roster is insufficient.
    CHECK_FALSE(coop_content::has_spell_companion());
    CHECK(coop_content::pray(false) == spret::abort);
    party::set_multiplayer(true);
    CHECK(coop_content::enabled());
    CHECK(player_has_ability(ABIL_PANTHEON_CONVERGENCE));
    CHECK(consumable_rarity(OBJ_POTIONS, POT_CONCORD) != RARITY_NONE);
    party::set_player_count(1);
    CHECK(coop_content::enabled()); // A disconnected peer does not change the game mode.
    CHECK_FALSE(coop_content::can_pray(true));
}

TEST_CASE_METHOD(fellowship_fixture, "Solo generation and starting libraries exclude dedicated support content", "[coop-content]")
{
    CHECK(items(false, OBJ_SCROLLS, SCR_RALLYING, 10) == NON_ITEM);
    CHECK(items(false, OBJ_JEWELLERY, RING_CAMARADERIE, 10) == NON_ITEM);
    CHECK(items(true, OBJ_WEAPONS, WPN_BROAD_AXE, 10, -UNRAND_DAWNFORGED) == NON_ITEM);
    CHECK(get_misc_item_type(MISC_AEGIS_STANDARD) == NUM_MISCELLANY);
    CHECK_FALSE(library_add_spells({SPELL_AEGIS_LINK}, true));
    CHECK_FALSE(you.spell_library[SPELL_AEGIS_LINK]);
    CHECK_FALSE(add_spell_to_memory(SPELL_AEGIS_LINK));
    CHECK_FALSE(you_can_memorise(SPELL_AEGIS_LINK));
    item_def book;
    book.base_type = OBJ_BOOKS;
    book.sub_type = BOOK_BATTLE;
    auto spells = spells_in_book(book);
    CHECK(find(spells.begin(), spells.end(), SPELL_AEGIS_LINK) == spells.end());
    party::set_multiplayer(true);
    CHECK(library_add_spells({SPELL_AEGIS_LINK}, true));
    CHECK(you_can_memorise(SPELL_AEGIS_LINK));
    spells = spells_in_book(book);
    CHECK(find(spells.begin(), spells.end(), SPELL_AEGIS_LINK) != spells.end());
}

TEST_CASE_METHOD(fellowship_fixture, "Specialist co-op enemies stay out of solo population draws", "[coop-content]")
{
    for (monster_type monster : {MONS_CHAIN_WARDEN, MONS_VOID_TETHER_STALKER})
    {
        CAPTURE(monster);
        const vector<pop_entry> population = {{1, 1, 100, FLAT, monster}};
        CHECK(pick_monster_from(population, 1) == MONS_0);
        party::set_multiplayer(true);
        CHECK(pick_monster_from(population, 1) == monster);
        party::set_multiplayer(false);
    }
}

TEST_CASE_METHOD(fellowship_fixture, "Shared prayer respects faith, penance, sight and floor boundaries", "[coop-content]")
{
    party::set_player_count(3);
    player &ally = companion(1);
    player &stranger = companion(2, GOD_TROG);
    party::set_multiplayer(true);
    CHECK(coop_content::can_pray(true));
    ally.depth = 2;
    CHECK_FALSE(coop_content::can_pray(true));
    ally.depth = 1;
    ally.penance[GOD_ZIN] = 1;
    CHECK_FALSE(coop_content::can_pray(true));
    ally.penance[GOD_ZIN] = 0;
    party::set_player_downed(1, true);
    CHECK_FALSE(coop_content::can_pray(true));
    party::set_player_downed(1, false);
    ally.hp = 10;
    env.grid(ally.pos()) = DNGN_ROCK_WALL;
    ally.set_position(you.pos() + coord_def(2, 0));
    los_changed();
    CHECK_FALSE(coop_content::can_pray(true));
    env.grid(you.pos() + coord_def(1, 0)) = DNGN_FLOOR;
    los_changed();
    CHECK(coop_content::pray(true) == spret::fail);
    CHECK(you.hp == 10);
    CHECK(coop_content::pray(false) == spret::success);
    CHECK(you.hp > 10);
    CHECK(ally.hp > 10);
    CHECK(you.duration[DUR_REGENERATION] > 0);
    CHECK(ally.duration[DUR_REGENERATION] > 0);
    CHECK(stranger.hp == 10);
    CHECK(stranger.duration[DUR_REGENERATION] == 0);
    CHECK(you.duration[DUR_HEROISM] == 0);
    CHECK(you.duration[DUR_SANCTUARY_CHORUS] == 0);
    CHECK(you.duration[DUR_MIGHT] == 0);
    you.religion = GOD_TROG;
    CHECK_FALSE(coop_content::offers_fellowship_prayer());
}

TEST_CASE_METHOD(fellowship_fixture, "Support spells require multiplayer companions and have matching effects", "[coop-content]")
{
    CHECK(cast_aegis_link(50, false) == spret::abort);
    CHECK(cast_ballad_of_the_vanguard(50, false) == spret::abort);
    CHECK(cast_sanctuary_chorus(50, false) == spret::abort);
    CHECK(you.duration[DUR_AEGIS_LINK] == 0);
    party::set_player_count(3);
    player &ally = companion(1);
    player &away = companion(2);
    away.depth = 2;
    party::set_multiplayer(true);
    const int ac_before = you.armour_class_scaled(100);
    const int sh_before = player_displayed_shield_class(100);
    CHECK(cast_aegis_link(50, false) == spret::success);
    CHECK(you.armour_class_scaled(100) == ac_before + 200);
    CHECK(player_displayed_shield_class(100) == sh_before + 100);
    CHECK(ally.duration[DUR_AEGIS_LINK] > 0);
    CHECK(away.duration[DUR_AEGIS_LINK] == 0);
    CHECK(cast_ballad_of_the_vanguard(50, false) == spret::success);
    CHECK(ally.duration[DUR_BALLAD_VANGUARD] > 0);
    CHECK(away.duration[DUR_BALLAD_VANGUARD] == 0);
    CHECK_FALSE(attack_cleaves(you, nullptr, -1));
    you.duration[DUR_POISONING] = ally.duration[DUR_POISONING] = 100;
    you.duration[DUR_CORROSION] = ally.duration[DUR_CORROSION] = 100;
    you.duration[DUR_CONF] = ally.duration[DUR_CONF] = 100;
    CHECK(cast_sanctuary_chorus(50, false) == spret::success);
    CHECK(you.duration[DUR_POISONING] == 0);
    CHECK(ally.duration[DUR_CORROSION] == 0);
    CHECK(you.duration[DUR_CONF] == 100);
    CHECK(ally.duration[DUR_CONF] == 100);
    CHECK(away.duration[DUR_SANCTUARY_CHORUS] == 0);
}

TEST_CASE_METHOD(fellowship_fixture, "Religion has no invented alliances or automatic conversion damage", "[coop-content]")
{
    using relation = party::pantheon_relation_type;
    CHECK(party::get_god_political_relation(GOD_ZIN, GOD_ELYVILON) == relation::ALLIED_CONCORDAT);
    CHECK(party::get_god_political_relation(GOD_TROG, GOD_TROG) == relation::SHARED_COVENANT);
    CHECK(party::get_god_political_relation(GOD_TROG, GOD_MAKHLEB) == relation::NEUTRAL);
    CHECK(party::get_god_political_relation(GOD_SHINING_ONE, GOD_OKAWARU) == relation::NEUTRAL);
    CHECK(party::get_god_political_relation(GOD_ZIN, GOD_XOM) == relation::ANATHEMA);
    party::set_player_count(2);
    player &ally = companion(1, GOD_MAKHLEB);
    party::set_multiplayer(true);
    party::on_player_join_god(0, GOD_ELYVILON, GOD_NO_GOD);
    CHECK(you.hp == 10);
    CHECK(ally.hp == 10);
    CHECK(you.hp_max_adj_temp == 0);
    CHECK(ally.hp_max_adj_temp == 0);
    CHECK(you.raw_piety == 100);
    CHECK(party::adjust_kill_piety_for_party_politics(12) == 12);
    party::apply_party_aura_buff(DUR_HEROISM, 5, LOS_RADIUS, false, GOD_ELYVILON);
    CHECK(ally.hp == 10);
    CHECK(ally.duration[DUR_WEAK] == 0);
    CHECK(ally.duration[DUR_HEROISM] == 0);
}

TEST_CASE_METHOD(fellowship_fixture, "Companions' conduct and gifts cannot punish or bless another hero", "[coop-content]")
{
    party::set_player_count(2);
    player &ally = companion(1, GOD_TROG);
    party::set_multiplayer(true);
    you.duration[DUR_HASTE] = 100;
    const int hp = you.hp, mp = you.magic_points, piety = you.raw_piety;
    for (int n = 0; n < 10; ++n)
        party::on_party_witness_conduct(DID_SPELL_CASTING, 1);
    ally.religion = GOD_CHEIBRIADOS;
    party::on_party_witness_conduct(DID_HASTY, 1);
    CHECK(you.duration[DUR_HASTE] == 100);
    CHECK(you.hp == hp);
    CHECK(you.magic_points == mp);
    CHECK(you.raw_piety == piety);
    CHECK(you.duration[DUR_WEAK] == 0);
    ally.religion = GOD_MAKHLEB;
    ally.gift_timeout = 30;
    party::apply_pantheon_gift_resonance(0, GOD_ELYVILON, "a gift");
    CHECK(you.hp == hp);
    CHECK(ally.hp == 10);
    CHECK(ally.gift_timeout == 30);
    CHECK(ally.duration[DUR_WEAK] == 0);
    ally.religion = GOD_ELYVILON;
    party::apply_pantheon_gift_resonance(0, GOD_ELYVILON, "a gift");
    CHECK(ally.hp == 10);
    CHECK(ally.gift_timeout == 30);
    CHECK(ally.duration[DUR_REGENERATION] == 0);
}

TEST_CASE_METHOD(fellowship_fixture, "Dedicated vaults query the native saved multiplayer mode", "[coop-content]")
{
    unwind_var<string> data_directory(SysEnv.crawl_dir, ".");
    init_monsters();
    init_mon_name_cache();
    init_item_name_cache();
    databaseSystemInit();
    unwinder close_databases([] { databaseSystemShutdown(); });
    init_feat_desc_cache();
    init_dungeon_lua();
    read_map("des/variable/coop_vaults.des");
    for (const char *name : {"coop_twin_crucible", "coop_sunken_reliquary",
                             "coop_concordat_sanctum_vaelen_nyx"})
    {
        CAPTURE(name);
        const map_def *definition = find_map_by_name(name);
        REQUIRE(definition);
        map_def solo = *definition;
        solo.load();
        REQUIRE_FALSE(solo.veto.empty());
        CHECK(solo.test_lua_veto());
        party::set_multiplayer(true);
        map_def multiplayer = *definition;
        multiplayer.load();
        CHECK_FALSE(multiplayer.test_lua_veto());
        party::set_multiplayer(false);
    }
}
