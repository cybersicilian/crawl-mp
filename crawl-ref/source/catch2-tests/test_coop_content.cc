#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "artefact.h"
#include "coop-content.h"
#include "env.h"
#include "dlua.h"
#include "database.h"
#include "dungeon.h"
#include "item-name.h"
#include "mon-util.h"
#include "terrain.h"
#include "maps.h"
#include "evoke.h"
#include "feature.h"
#include "fight.h"
#include "item-prop.h"
#include "initfile.h"
#include "invent.h"
#include "unwind.h"
#include "los.h"
#include "makeitem.h"
#include "mon-pick.h"
#include "newgame-def.h"
#include "nearby-danger.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "spl-book.h"
#include "spl-selfench.h"
#include "spl-util.h"
#include "tags.h"
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
    CHECK(consumable_rarity(OBJ_SCROLLS, SCR_SOUL_RECALL) == RARITY_NONE);
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
    CHECK(consumable_rarity(OBJ_SCROLLS, SCR_SOUL_RECALL) == RARITY_RARE);
    party::set_player_count(1);
    CHECK(coop_content::enabled()); // A disconnected peer does not change the game mode.
    CHECK_FALSE(coop_content::can_pray(true));
}

TEST_CASE_METHOD(fellowship_fixture, "Every new multiplayer hero receives one identified resurrection scroll",
                 "[coop-content][resurrection]")
{
    init_item_name_cache();
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_MONK;
    ng.weapon = WPN_UNARMED;
    SECTION("solo parties receive no free scroll")
    {
        give_items_skills(ng);
        for (const item_def &item : you.inv)
            CHECK_FALSE(item.is_type(OBJ_SCROLLS, SCR_SOUL_RECALL));
    }
    SECTION("leader, starting companions and a late join all receive one")
    {
        init_monsters();
        party::configure_from_arg("3,mp=on,shared_fate=on,First:Human/Monk,Second:Human/Monk,Third:Felid/Monk");
        party::apply_starting_campaign_modifiers(you);
        give_items_skills(ng);
        identify_inventory();
        party::setup_party_members_on_new_game();
        REQUIRE(party::add_party_member("Late:Human/Monk"));
        REQUIRE(party::player_count() == 4);
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            CAPTURE(slot);
            int quantity = 0;
            for (const item_def &item : party::get_player(slot).inv)
                if (item.is_type(OBJ_SCROLLS, SCR_SOUL_RECALL))
                {
                    quantity += item.quantity;
                    CHECK(item.is_identified());
                }
            CHECK(quantity == 1);
            CHECK(game_modifiers::shared_fate(party::get_player(slot)));
        }
        party::remove_all_proxies();
        party::set_starting_shared_fate(false);
    }
}

TEST_CASE_METHOD(fellowship_fixture, "Soul recall restores saved fallen state across floors without harming survivors",
                 "[coop-content][resurrection]")
{
    init_monsters();
    dgn_reset_level(false);
    for (int x = 30; x <= 50; ++x)
        for (int y = 25; y <= 45; ++y)
            env.grid(coord_def(x, y)) = DNGN_FLOOR;
    party::set_player_count(4);
    party::set_multiplayer(true);
    player &fallen = companion(1);
    player &distant = companion(2);
    player &living = companion(3);
    fallen.hp_max = distant.hp_max = 60;
    fallen.max_magic_points = distant.max_magic_points = 20;
    party::set_player_downed(1, true);
    party::set_player_downed(2, true);
    distant.depth = 2;
    fallen.pending_revival = distant.pending_revival = true;
    fallen.duration[DUR_POISONING] = 100;
    const int hp = you.hp, other_hp = living.hp;
    const coord_def other_pos = living.pos();
    REQUIRE(party::scroll_soul_recall());
    CHECK(you.hp == hp);
    CHECK(you.get_max_xl() == 27);
    CHECK(living.hp == other_hp);
    CHECK(living.pos() == other_pos);
    for (int slot : {1, 2})
    {
        const player &restored = party::get_player(slot);
        CHECK_FALSE(party::is_player_downed(slot));
        CHECK_FALSE(restored.props["party_downed"].get_bool());
        CHECK_FALSE(restored.pending_revival);
        CHECK(restored.hp == 30);
        CHECK(restored.magic_points == 10);
        CHECK(restored.get_max_xl() == 26);
        CHECK(restored.depth == you.depth);
        CHECK(restored.pos() != you.pos());
        CHECK(restored.duration[DUR_POISONING] == 0);
        CHECK(party::member_aut_clock(slot) == party::member_region_clock(slot));
        vector<unsigned char> bytes;
        writer output(&bytes);
        restored.props.write(output);
        reader input(bytes, TAG_MINOR_VERSION);
        player saved;
        saved.props.read(input);
        CHECK_FALSE(saved.props["party_downed"].get_bool());
        CHECK(saved.get_max_xl() == 26);
    }
    CHECK(fallen.pos() != distant.pos());
    party::restore_downed_state();
    CHECK_FALSE(party::is_player_downed(1));
    CHECK_FALSE(party::is_player_downed(2));
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Soul recall cannot stack a resurrected hero onto a trapped reader",
                 "[coop-content][resurrection]")
{
    init_monsters();
    dgn_reset_level(false);
    for (int x = 30; x <= 50; ++x)
        for (int y = 25; y <= 45; ++y)
            env.grid(coord_def(x, y)) = DNGN_ROCK_WALL;
    env.grid(you.pos()) = DNGN_FLOOR;
    party::set_player_count(2);
    player &fallen = companion(1);
    party::set_multiplayer(true);
    party::set_player_downed(1, true);
    fallen.depth = 2;
    const coord_def before = fallen.pos();
    CHECK_FALSE(party::scroll_soul_recall());
    CHECK(party::is_player_downed(1));
    CHECK(fallen.depth == 2);
    CHECK(fallen.pos() == before);
    CHECK(fallen.get_max_xl() == 27);
    party::set_player_downed(1, false);
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Multiplayer cannot replace resurrection resources with a free last stand",
                 "[coop-content][resurrection]")
{
    party::set_player_count(2);
    companion(1);
    party::set_multiplayer(true);
    party::set_player_downed(1, true);
    you.hp = 0;
    CHECK_FALSE(party::prepare_survivor_for_death(0));
    CHECK_FALSE(party::try_last_stand_revive(0));
    CHECK(party::is_player_downed(1));
    party::set_player_downed(1, false);
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Other resurrection sources share the persistent restoration contract",
                 "[coop-content][resurrection]")
{
    init_monsters();
    party::set_player_count(2);
    player &fallen = companion(1);
    party::set_multiplayer(true);
    party::set_player_downed(1, true);
    fallen.pending_revival = true;
    SECTION("splashed soul ambrosia")
    {
        REQUIRE(party::try_revive_downed_ghost_in_radius(fallen.pos(), 2, 25));
        CHECK(fallen.hp == fallen.hp_max / 4);
    }
    SECTION("divine and rune revival")
    {
        party::revive_downed_players(false, 0);
        CHECK(fallen.hp == fallen.hp_max / 3);
    }
    CHECK_FALSE(party::is_player_downed(1));
    CHECK_FALSE(fallen.props["party_downed"].get_bool());
    CHECK_FALSE(fallen.pending_revival);
    CHECK(fallen.get_max_xl() == 26);
    party::revive_downed_players(false, 0);
    CHECK(fallen.get_max_xl() == 26); // A no-op recovery cannot charge twice.
    for (int cap = 25; cap >= 22; --cap)
    {
        party::set_player_downed(1, true);
        party::revive_downed_players(false, 0);
        CHECK(fallen.get_max_xl() == cap);
    }
    party::restore_downed_state();
    CHECK_FALSE(party::is_player_downed(1));
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Shared Fate applies only to multiplayer and prevents every party revival path",
                 "[coop-content][resurrection]")
{
    party::set_player_count(2);
    player &ally = companion(1);
    game_modifiers::set_campaign(you, false, game_modifiers::traps::normal, true);
    CHECK_FALSE(party::shared_fate_enabled());
    party::set_multiplayer(true);
    CHECK(party::shared_fate_enabled());
    CHECK_FALSE(party::prepare_survivor_for_death(0));
    party::set_player_downed(1, true);
    CHECK_FALSE(party::scroll_soul_recall());
    party::revive_downed_players(false, 0);
    CHECK_FALSE(party::try_revive_downed_ghost_in_radius(ally.pos(), 2, 50));
    CHECK(party::is_player_downed(1));
    CHECK(ally.props["party_downed"].get_bool());
    CHECK(ally.get_max_xl() == 27);
    party::set_player_downed(1, false);
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Personal extra-life revival charges only the actually restored hero once",
                 "[coop-content][resurrection][level-cap]")
{
    init_monsters();
    party::set_player_count(2);
    player &ally = companion(1);
    party::set_multiplayer(true);
    you.religion = ally.religion = GOD_NO_GOD;
    ally.pending_revival = true;
    ally.hp = 0;
    SECTION("inactive hero")
    {
        REQUIRE(party::resolve_pending_revivals());
        CHECK(ally.get_max_xl() == 26);
        CHECK(you.get_max_xl() == 27);
        CHECK_FALSE(party::resolve_pending_revivals());
        CHECK(ally.get_max_xl() == 26);
    }
    SECTION("off-floor pending life is not yet a resurrection")
    {
        ally.depth = 2;
        CHECK_FALSE(party::resolve_pending_revivals());
        CHECK(ally.get_max_xl() == 27);
    }
    SECTION("active hero, and solo compatibility")
    {
        you.pending_revival = true;
        you.hp = 0;
        revive();
        CHECK(you.get_max_xl() == 26);
        CHECK(ally.get_max_xl() == 27);
        revive(); // No pending life: this must not double charge.
        CHECK(you.get_max_xl() == 26);
        party::set_multiplayer(false);
        you.pending_revival = true;
        revive();
        CHECK(you.get_max_xl() == 26);
    }
    ally.pending_revival = false;
    party::remove_all_proxies();
}

TEST_CASE_METHOD(fellowship_fixture, "Resurrection at the cap restores health from the reduced level's maxima",
                 "[coop-content][resurrection][level-cap]")
{
    init_monsters();
    party::set_player_count(2);
    player &fallen = companion(1);
    party::set_multiplayer(true);
    fallen.experience_level = 27;
    fallen.max_level = 30;
    fallen.experience = exp_needed(30);
    party::set_player_downed(1, true);
    REQUIRE(party::scroll_soul_recall());
    CHECK(fallen.get_max_xl() == 26);
    CHECK(fallen.experience_level == 26);
    CHECK(fallen.hp == max(1, fallen.hp_max / 2));
    CHECK(fallen.magic_points == fallen.max_magic_points / 2);
    CHECK(you.get_max_xl() == 27);
    party::remove_all_proxies();
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
