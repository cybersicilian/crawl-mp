#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "bloodcraft.h"

#include "ability.h"
#include "beam.h"
#include "env.h"
#include "feature.h"
#include "fight.h"
#include "items.h"
#include "jobs.h"
#include "level-time.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "message.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "newgame-def.h"
#include "ng-restr.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "skills.h"
#include "spl-book.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "tags.h"
#include "stringutil.h"
#include "test_player_fixture.h"

namespace
{
struct bloodcraft_fixture : MockPlayerYouTestsFixture
{
    vector<dungeon_feature_type> terrain;
    int monsters = 0;
    bloodcraft_fixture()
    {
        static const bool messages_ready = []() { msg::initialise_mpr_streams(); return true; }();
        (void)messages_ready;
        init_show_table();
        init_monsters();
        init_spell_descs();
        init_spell_name_cache();
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.on_current_level = true;
        you.elapsed_time = 100;
        you.current_vision = you.normal_vision = 7;
        you.set_position(coord_def(40, 35));
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
            {
                terrain.push_back(env.grid[x][y]);
                env.grid[x][y] = DNGN_FLOOR;
            }
        invalidate_los();
        you.hp_max_adj_perm += 100 - bloodcraft::unreserved_hp();
        calc_hp(false);
        you.hp = you.hp_max;
    }
    ~bloodcraft_fixture()
    {
        for (int i = 0; i < monsters; ++i)
        {
            env.mgrid(env.mons[i].pos()) = NON_MONSTER;
            env.mons[i].reset();
        }
        party::set_multiplayer(false);
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
        int index = 0;
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = terrain[index++];
        invalidate_los();
    }
    monster& spawn(monster_type type, const coord_def& pos)
    {
        const int index = monsters++;
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = type;
        mon.mid = 10000 + index;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(5);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        return mon;
    }
};
}

TEST_CASE_METHOD(bloodcraft_fixture, "Blood Liturgists start worshipping Vorr with ordinary learnable spells", "[bloodcraft]")
{
    newgame_def choices;
    choices.name = "BloodcraftTest";
    choices.type = GAME_TYPE_NORMAL;
    choices.filename = "this_should_never_be_a_name_of_a_file_bloodcraft_tests";
    choices.species = SP_HUMAN;
    choices.job = JOB_BLOOD_HUNTER;
    choices.weapon = WPN_FALCHION;
    setup_game(choices, false);
    REQUIRE(you.chr_class_name == "Blood Liturgist");
    REQUIRE(string(get_job_abbrev(you.char_class)) == "BL");
    REQUIRE(you.religion == GOD_VORR);
    REQUIRE(you.raw_piety == 35);
    REQUIRE(you.piety_max[GOD_VORR] == 35);
    REQUIRE(you.worshipped[GOD_VORR] == 1);
    REQUIRE(you.weapon());
    REQUIRE(you.weapon()->sub_type == WPN_FALCHION);
    REQUIRE(you.weapon()->brand == SPWPN_VAMPIRISM);
    REQUIRE(player_has_ability(ABIL_VORR_RUPTURE));
    REQUIRE(you.spell_no == 1);
    REQUIRE(you.has_spell(SPELL_KINDLED_VEINS));
    REQUIRE(bloodcraft::active_rite() == SPELL_NO_SPELL);
    // The shared mock fixture does not initialize YAML item generation.
    // Real kit quantities and equipped armour are covered by the native browser test.
    for (spell_type spell : {SPELL_KINDLED_VEINS, SPELL_WINTERS_DUE,
            SPELL_BORROWED_THUNDER, SPELL_SCARLET_FETTERS, SPELL_STOLEN_SIGHT})
    {
        REQUIRE(you.spell_library[spell]);
        REQUIRE(is_player_book_spell(spell));
        REQUIRE_FALSE(spell_removed(spell));
        REQUIRE(spell_power_cap(spell) == 200);
    }
    // Changing the historical background does not revoke knowledge or effects.
    you.char_class = JOB_FIGHTER;
    REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::success);
    REQUIRE(add_spell_to_memory(SPELL_SCARLET_FETTERS));
    REQUIRE(player_has_ability(ABIL_AMPLIFY_SCARLET_FETTERS));
}

TEST_CASE("Blood Liturgists require a species that can worship", "[bloodcraft]")
{
    REQUIRE_FALSE(character_is_allowed(SP_DEMIGOD, JOB_BLOOD_HUNTER));
    REQUIRE(job_allowed(SP_DEMIGOD, JOB_BLOOD_HUNTER) == CC_BANNED);
    REQUIRE(species_allowed(JOB_BLOOD_HUNTER, SP_DEMIGOD) == CC_BANNED);
    REQUIRE(character_is_allowed(SP_HUMAN, JOB_BLOOD_HUNTER));
    REQUIRE(character_is_allowed(SP_TORTLE, JOB_BLOOD_HUNTER));
}

TEST_CASE_METHOD(bloodcraft_fixture, "Rite commitment cannot be recovered by switching or dismissal", "[bloodcraft]")
{
    REQUIRE(you.hp == 100);
    REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::success);
    REQUIRE(you.hp == 88);
    REQUIRE(you.hp_max == 88);
    REQUIRE(bloodcraft::unreserved_hp() == 100);
    REQUIRE(bloodcraft::amplification_cost(bloodcraft::unreserved_hp()) == 6);
    REQUIRE(bloodcraft::cast_rite(SPELL_WINTERS_DUE, false) == spret::success);
    REQUIRE(you.hp == 88);
    REQUIRE(you.hp_max == 88);
    REQUIRE(bloodcraft::cast_rite(SPELL_WINTERS_DUE, false) == spret::abort);
    you.hp -= 20;
    bloodcraft::dismiss_rite();
    REQUIRE(you.hp == 68);
    REQUIRE(you.hp_max == 100);
    REQUIRE(bloodcraft::cast_rite(SPELL_BORROWED_THUNDER, false) == spret::success);
    REQUIRE(you.hp == 56);
    REQUIRE(you.hp_max == 88);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Blood costs are transactional and nonlethal", "[bloodcraft]")
{
    SECTION("A miscast commits no HP")
    {
        REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, true) == spret::fail);
        REQUIRE(you.hp == 100);
        REQUIRE(you.hp_max == 100);
        monster& mon = spawn(MONS_OGRE, coord_def(42, 35));
        REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 100,
            mon.pos(), true, true) == spret::fail);
        REQUIRE(you.hp == 100);
        REQUIRE_FALSE(mon.props.exists(bloodcraft::curses_key));
    }
    SECTION("Reservation permits exactly one HP remaining")
    {
        you.hp = 13;
        REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::success);
        REQUIRE(you.hp == 1);
    }
    SECTION("Insufficient life aborts without creating a reservation")
    {
        you.hp = 12;
        REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::abort);
        REQUIRE(you.hp == 12);
        REQUIRE(you.hp_max == 100);
    }
    SECTION("Death's Door cannot fund a rite or amplification")
    {
        you.duration[DUR_DEATHS_DOOR] = 100;
        REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::abort);
        monster& mon = spawn(MONS_OGRE, coord_def(42, 35));
        REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 100,
            mon.pos(), false, true) == spret::abort);
        REQUIRE(you.hp == 100);
    }
}

TEST_CASE_METHOD(bloodcraft_fixture, "Blood curses retain useful effects against resistant and bloodless quarry", "[bloodcraft]")
{
    monster& mon = spawn(MONS_ORB_OF_FIRE, coord_def(42, 35));
    REQUIRE_FALSE(mon.has_blood());
    REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 200, mon.pos(), false) == spret::success);
    REQUIRE(bloodcraft::accuracy_penalty(mon) == 25);
    REQUIRE_FALSE(mon.blinded());
    REQUIRE(bloodcraft::cast_curse(SPELL_SCARLET_FETTERS, 0,
        mon.pos(), false, true) == spret::success);
    REQUIRE(you.hp == 94);
    REQUIRE_FALSE(bloodcraft::bound(mon));
    REQUIRE(bloodcraft::anchored(mon));
    REQUIRE(mon.no_tele());
    REQUIRE(bloodcraft::accuracy_penalty(mon) == 25);
    you.elapsed_time += 30;
    REQUIRE_FALSE(bloodcraft::anchored(mon));
    REQUIRE(bloodcraft::accuracy_penalty(mon) == 25);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Binding permits attacks and has a shared recovery window", "[bloodcraft]")
{
    monster& mon = spawn(MONS_RAT, coord_def(42, 35));
    REQUIRE(bloodcraft::cast_curse(SPELL_SCARLET_FETTERS, 200, mon.pos(), false) == spret::success);
    REQUIRE(bloodcraft::bound(mon));
    REQUIRE(mon.cannot_move());
    REQUIRE_FALSE(mon.cannot_act());
    REQUIRE_FALSE(mon.cannot_keep_channelling());
    REQUIRE(bloodcraft::cast_curse(SPELL_SCARLET_FETTERS, 200, mon.pos(), false) == spret::abort);
    you.elapsed_time += 30;
    REQUIRE_FALSE(mon.cannot_move());
    REQUIRE(bloodcraft::binding_recovery(mon));
    REQUIRE(bloodcraft::cast_curse(SPELL_SCARLET_FETTERS, 200, mon.pos(), false) == spret::abort);
    you.elapsed_time += 30;
    REQUIRE_FALSE(bloodcraft::binding_recovery(mon));
    REQUIRE(bloodcraft::cast_curse(SPELL_SCARLET_FETTERS, 200, mon.pos(), false) == spret::success);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Quarry ownership survives serialization and caster changes", "[bloodcraft]")
{
    monster& first = spawn(MONS_RAT, coord_def(42, 35));
    monster& second = spawn(MONS_OGRE, coord_def(43, 35));
    REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 100, first.pos(), false) == spret::success);
    vector<unsigned char> saved;
    { writer out(&saved); first.props.write(out); }
    first.props.clear();
    { reader in(saved); in.setMinorVersion(TAG_MINOR_VERSION); first.props.read(in); }
    REQUIRE(bloodcraft::accuracy_penalty(first) == 20);
    party::set_player_count(2);
    party::get_player(1) = you;
    party::get_player(1).mid = party::mid_for_slot(1);
    party::get_player(1).save = nullptr;
    {
        party::scoped_player_context peer(1);
        REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 200, first.pos(), false) == spret::success);
    }
    REQUIRE(bloodcraft::accuracy_penalty(first) == 25);
    REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 50, second.pos(), false) == spret::success);
    REQUIRE(bloodcraft::accuracy_penalty(first) == 25);
    REQUIRE(bloodcraft::accuracy_penalty(second) == 17);
    bloodcraft::clear_curses();
    REQUIRE(bloodcraft::accuracy_penalty(second) == 0);
    REQUIRE(bloodcraft::accuracy_penalty(first) == 25);
    {
        party::scoped_player_context peer(1);
        bloodcraft::clear_curses();
    }
    REQUIRE(bloodcraft::accuracy_penalty(first) == 0);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Curse expiry follows floor time in multiplayer", "[bloodcraft]")
{
    party::set_multiplayer(true);
    env.elapsed_time = 10;
    monster& mon = spawn(MONS_OGRE, coord_def(42, 35));
    REQUIRE(bloodcraft::cast_curse(SPELL_STOLEN_SIGHT, 100, mon.pos(), false) == spret::success);
    you.elapsed_time += 1000;
    REQUIRE(bloodcraft::accuracy_penalty(mon) == 20);
    env.elapsed_time += 50;
    REQUIRE(bloodcraft::accuracy_penalty(mon) == 0);
}

TEST_CASE_METHOD(bloodcraft_fixture, "One weapon action cannot multiply its rite budget", "[bloodcraft]")
{
    monster& first = spawn(MONS_OGRE, coord_def(42, 35));
    monster& second = spawn(MONS_OGRE, coord_def(43, 35));
    REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::success);
    const int maximum = bloodcraft::rite_die(calc_spell_power(SPELL_KINDLED_VEINS));
    SECTION("Repeated hits and multiple targets share one roll")
    {
        bloodcraft::weapon_action action(true);
        for (int i = 0; i < 10; ++i) bloodcraft::record_hit(you, first);
        bloodcraft::record_hit(you, second);
        action.finish(10);
        const int damage = 2000 - first.hit_points - second.hit_points;
        REQUIRE(damage > 0);
        REQUIRE(damage <= maximum);
    }
    SECTION("Nested spell attacks cannot borrow the outer weapon action")
    {
        bloodcraft::weapon_action action(true);
        { bloodcraft::weapon_action spell_attack(false); bloodcraft::record_hit(you, first); }
        action.finish(10);
        REQUIRE(first.hit_points == 1000);
    }
    SECTION("Another hero cannot borrow the current hero's rite budget")
    {
        party::set_player_count(2);
        party::get_player(1) = you;
        party::get_player(1).mid = party::mid_for_slot(1);
        party::get_player(1).save = nullptr;
        bloodcraft::weapon_action action(true);
        {
            party::scoped_player_context peer(1);
            bloodcraft::record_hit(you, first);
        }
        action.finish(10);
        REQUIRE(first.hit_points == 1000);
    }
    SECTION("Death's Door suppresses damage from an existing rite")
    {
        you.duration[DUR_DEATHS_DOOR] = 100;
        bloodcraft::weapon_action action(true);
        bloodcraft::record_hit(you, first);
        action.finish(10);
        REQUIRE(first.hit_points == 1000);
    }
}

TEST_CASE_METHOD(bloodcraft_fixture, "Native amplified casting pays both resources exactly once", "[bloodcraft]")
{
    you.experience_level = 10;
    you.base_stats[STAT_INT] = 40;
    set_skill_level(SK_HEXES, 27);
    set_skill_level(SK_SPELLCASTING, 27);
    REQUIRE(add_spell_to_memory(SPELL_STOLEN_SIGHT));
    REQUIRE(raw_spell_fail(SPELL_STOLEN_SIGHT) == 0);
    monster& mon = spawn(MONS_OGRE, coord_def(42, 35));
    you.hp = bloodcraft::unreserved_hp();
    calc_hp(false);
    you.magic_points = you.max_magic_points = 50;
    const int initial_hp = you.hp;
    const int hp_cost = bloodcraft::amplification_cost(bloodcraft::unreserved_hp());
    dist target;
    target.target = mon.pos();
    target.isTarget = true;
    target.isValid = true;
    target.interactive = false;
    target.find_target = false;
    REQUIRE(bloodcraft::cast_amplified(SPELL_STOLEN_SIGHT, &target) == spret::success);
    REQUIRE(you.hp == initial_hp - hp_cost);
    REQUIRE(you.magic_points == 45);
    REQUIRE(you.turn_is_over);
    REQUIRE(bloodcraft::amplified_mana(SPELL_STOLEN_SIGHT) == 5);
    REQUIRE(spell_mana(SPELL_STOLEN_SIGHT) == 3);

    // HP-casting must validate the combined spell and amplification price,
    // rather than allowing either individually affordable payment to kill.
    you.mutation[MUT_HP_CASTING] = 1;
    const string hp_price = bloodcraft::cost_description(SPELL_STOLEN_SIGHT, true);
    REQUIRE(hp_price.find("MP") == string::npos);
    REQUIRE(hp_price.find(std::to_string(hp_cost + 5) + " HP") == 0);
    you.hp = hp_cost + 5;
    const int too_low = you.hp;
    you.turn_is_over = false;
    REQUIRE(bloodcraft::cast_amplified(SPELL_STOLEN_SIGHT, &target) == spret::abort);
    REQUIRE(you.hp == too_low);
    you.hp = hp_cost + 6;
    you.turn_is_over = false;
    REQUIRE(bloodcraft::cast_amplified(SPELL_STOLEN_SIGHT, &target) == spret::success);
    REQUIRE(you.hp == 1);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Native unarmed combat triggers a rite without changing its base attack", "[bloodcraft]")
{
    monster& mon = spawn(MONS_OGRE, coord_def(41, 35));
    set_skill_level(SK_UNARMED_COMBAT, 27);
    you.base_stats[STAT_DEX] = 40;
    int ordinary_damage = 0;
    string rolls;
    for (int i = 0; i < 20; ++i)
    {
        mon.hit_points = 1000;
        mon.behaviour = BEH_SEEK;
        rng::seed(8128 + i);
        REQUIRE(player_fight(&mon));
        ordinary_damage += 1000 - mon.hit_points;
        rolls += make_stringf("%d,", 1000 - mon.hit_points);
    }
    REQUIRE(bloodcraft::cast_rite(SPELL_KINDLED_VEINS, false) == spret::success);
    int empowered_damage = 0;
    rolls += " -> ";
    for (int i = 0; i < 20; ++i)
    {
        mon.hit_points = 1000;
        mon.behaviour = BEH_SEEK;
        rng::seed(8128 + i);
        REQUIRE(player_fight(&mon));
        empowered_damage += 1000 - mon.hit_points;
        rolls += make_stringf("%d,", 1000 - mon.hit_points);
    }
    INFO(rolls);
    INFO("Active rite " << bloodcraft::active_rite() << " delay " << you.time_taken);
    REQUIRE(empowered_damage > ordinary_damage);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Rites respect elemental immunity and religious restrictions", "[bloodcraft]")
{
    spell_type rite = SPELL_KINDLED_VEINS;
    monster_type type = MONS_FIRE_ELEMENTAL;
    bool forbidden = false;
    SECTION("Fire immunity") { }
    SECTION("Cold immunity") { rite = SPELL_WINTERS_DUE; type = MONS_ICE_BEAST; }
    SECTION("Electricity immunity") { rite = SPELL_BORROWED_THUNDER; type = MONS_ELECTRIC_GOLEM; }
    SECTION("A pre-existing rite cannot bypass Trog") { type = MONS_OGRE; forbidden = true; }
    monster& mon = spawn(type, coord_def(42, 35));
    REQUIRE(bloodcraft::cast_rite(rite, false) == spret::success);
    if (forbidden) you.religion = GOD_TROG;
    bloodcraft::weapon_action action(true);
    bloodcraft::record_hit(you, mon);
    action.finish(10);
    REQUIRE(mon.hit_points == 1000);
}

TEST_CASE_METHOD(bloodcraft_fixture, "Saved reservations rebuild without healing and forgetting releases them", "[bloodcraft]")
{
    REQUIRE(add_spell_to_memory(SPELL_WINTERS_DUE));
    REQUIRE(bloodcraft::cast_rite(SPELL_WINTERS_DUE, false) == spret::success);
    you.hp = 65;
    vector<unsigned char> saved;
    { writer out(&saved); you.props.write(out); }
    you.props.clear();
    calc_hp(false);
    { reader in(saved); in.setMinorVersion(TAG_MINOR_VERSION); you.props.read(in); }
    calc_hp(false);
    REQUIRE(you.hp_max == 88);
    REQUIRE(you.hp == 65);
    REQUIRE(bloodcraft::active_rite() == SPELL_WINTERS_DUE);
    REQUIRE(del_spell_from_memory(SPELL_WINTERS_DUE));
    REQUIRE(you.hp_max == 100);
    REQUIRE(you.hp == 65);
    REQUIRE(bloodcraft::active_rite() == SPELL_NO_SPELL);
}
