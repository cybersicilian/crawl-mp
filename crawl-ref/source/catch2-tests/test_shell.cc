#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "branch.h"
#include "colour.h"
#include "dungeon.h"
#include "env.h"
#include "feature.h"
#include "fineff.h"
#include "losglobal.h"
#include "libunix.h"
#include "message.h"
#include "melee-attack.h"
#include "mon-util.h"
#include "movement.h"
#include "mutation.h"
#include "party.h"
#include "player.h"
#include "player-reacts.h"
#include "quiver.h"
#include "shell.h"
#include "skills.h"
#include "species.h"
#include "spl-cast.h"
#include "status.h"
#include "state.h"
#include "startup.h"
#include "stringutil.h"
#include "tags.h"
#include "target.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "transform.h"
#include "unwind.h"

namespace
{
struct shell_fixture : MockPlayerYouTestsFixture
{
    vector<coord_def> spawned;
    int old_max_mon_index = env.max_mon_index;
    bool old_confirmations = crawl_state.disables[DIS_CONFIRMATIONS];
    bool old_friendly_fire = party::friendly_fire_enabled();
    int old_dungeon_depth = brdepth[BRANCH_DUNGEON];

    shell_fixture()
    {
        static const bool ready = []() {
            msg::initialise_mpr_streams();
            init_element_colours();
            init_duration_index();
            return true;
        }();
        (void)ready;
        init_show_table();
        init_monsters();
        enter_headless_mode();
        cio_init();
        cgotoxy(1, 1);
        party::set_multiplayer(false);
        party::set_player_count(1);
        you.species = SP_TORTLE;
        for (int mutation = 0; mutation < NUM_MUTATIONS; ++mutation)
            you.mutation[mutation] = you.innate_mutation[mutation] = 0;
        give_basic_mutations(SP_TORTLE);
        you.equipment.update();
        you.where_are_you = BRANCH_DUNGEON;
        brdepth[BRANCH_DUNGEON] = 15;
        you.depth = 1;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.set_position(coord_def(40, 35));
        // Movement renders and reveals cells, so use a complete empty dungeon.
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        invalidate_los();
        set_skill_level(SK_UNARMED_COMBAT, 0, true);
    }

    ~shell_fixture()
    {
        clear_final_effects();
        for (unsigned i = 0; i < spawned.size(); ++i)
        {
            env.mgrid(spawned[i]) = NON_MONSTER;
            env.mid_cache.erase(30000 + i);
            env.mons[i].reset();
        }
        env.max_mon_index = old_max_mon_index;
        crawl_state.disables.set(DIS_CONFIRMATIONS, old_confirmations);
        party::set_friendly_fire(old_friendly_fire);
        party::set_multiplayer(false);
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        brdepth[BRANCH_DUNGEON] = old_dungeon_depth;
        invalidate_los();
    }

    monster& spawn(const coord_def& position)
    {
        const unsigned i = spawned.size();
        monster& mon = env.mons[i];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 30000 + i;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(position);
        env.mgrid(position) = i;
        env.mid_cache[mon.mid] = i;
        env.max_mon_index = max(env.max_mon_index, static_cast<int>(i));
        spawned.push_back(position);
        return mon;
    }

    void retract()
    {
        REQUIRE(shell::retract() == spret::success);
        REQUIRE(shell::retracted());
        you.turn_is_over = false;
    }

    bool incoming_hit(monster& enemy, bool hit = true)
    {
        melee_attack incoming(&enemy, &you);
        incoming.to_hit = AUTOMATIC_HIT;
        incoming.attk_damage = 0;
        incoming.flat_dmg_bonus = -1; // Cancel the monster's minimum 1 damage.
        incoming.simu = true;
        you.duration[DUR_AUTODODGE] = hit ? 0 : 1;
        REQUIRE(incoming.attack());
        CHECK(incoming.did_hit == hit);
        return you.did_reprisal(REPRISAL_BITE, enemy.mid);
    }

    player& ally_at(const coord_def& position)
    {
        party::set_player_count(2);
        party::set_multiplayer(true);
        player& ally = party::get_player(1);
        ally = you;
        ally.mid = party::mid_for_slot(1);
        ally.save = nullptr;
        ally.your_name = "ShellFriend";
        ally.props.erase("shell_retracted");
        ally.mutation[MUT_ARMOURED_SHELL] = 0;
        ally.innate_mutation[MUT_ARMOURED_SHELL] = 0;
        ally.hp = ally.hp_max = 50;
        ally.set_position(position);
        return ally;
    }
};
}

TEST_CASE_METHOD(shell_fixture, "Snapping retaliation uses a one-in-three chance without spending an action", "[tortle][bite]")
{
    rng::subgenerator samples(0x534e415042495445ULL);
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    enemy.hit_points = enemy.max_hit_points = 100000;
    you.time_taken = 17;
    const int elapsed = you.elapsed_time;
    const float delay = you.attack_delay().expected();
    int bites = 0;
    for (int sample = 0; sample < 600; ++sample)
    {
        you.reprisals.clear();
        bites += incoming_hit(enemy);
    }
    // Broad deterministic bounds distinguish 1/3 from a guaranteed/rare proc.
    CHECK(bites > 150);
    CHECK(bites < 250);
    CHECK(enemy.hit_points < enemy.max_hit_points);
    CHECK(you.time_taken == 17);
    CHECK(you.elapsed_time == elapsed);
    CHECK_FALSE(you.turn_is_over);
    CHECK(you.attack_delay().expected() == delay);
}

TEST_CASE_METHOD(shell_fixture, "Snapping retaliation is capped independently for each attacker", "[tortle][bite]")
{
    rng::subgenerator samples(0x42495445434150ULL);
    monster& first = spawn(you.pos() + coord_def(1, 0));
    monster& second = spawn(you.pos() + coord_def(0, 1));
    for (monster* enemy : {&first, &second})
    {
        bool bit = false;
        for (int attempt = 0; attempt < 128 && !bit; ++attempt)
            bit = incoming_hit(*enemy);
        REQUIRE(bit);
        const int hp = enemy->hit_points;
        for (int attempt = 0; attempt < 32; ++attempt)
            incoming_hit(*enemy);
        CHECK(enemy->hit_points == hp);
    }
    CHECK(you.reprisals.size() == 2);
    you.reprisals.clear(); // The native turn loop clears this per player action.
    for (int attempt = 0; attempt < 128; ++attempt)
        incoming_hit(first);
    CHECK(you.did_reprisal(REPRISAL_BITE, first.mid));
}

TEST_CASE_METHOD(shell_fixture, "Snapping retaliation respects anatomy, awareness and shell stance", "[tortle][bite]")
{
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    SECTION("Missing mutation") { you.mutation[MUT_RETALIATORY_BITE] = 0; }
    SECTION("Confusion") { you.duration[DUR_CONF] = 100; }
    SECTION("Paralysis") { you.duration[DUR_PARALYSIS] = 100; }
    SECTION("Banishment") { you.banished = true; }
    SECTION("Retraction") { retract(); }
    SECTION("Transformation") { you.form = transformation::bat; }
    SECTION("Friendly attacker") { enemy.base_attitude = ATT_FRIENDLY; }
    SECTION("Neutral attacker") { enemy.base_attitude = ATT_NEUTRAL; }
    SECTION("Unseen attacker") { enemy.add_ench(ENCH_INVIS); }
    SECTION("Reaching attacker")
    {
        env.mgrid(enemy.pos()) = NON_MONSTER;
        enemy.set_position(you.pos() + coord_def(2, 0));
        env.mgrid(enemy.pos()) = 0;
        spawned[0] = enemy.pos();
    }
    for (int attempt = 0; attempt < 64; ++attempt)
    {
        melee_attack incoming(&enemy, &you);
        incoming.attk_reach = 2;
        incoming.to_hit = AUTOMATIC_HIT;
        incoming.attk_damage = 0;
        incoming.flat_dmg_bonus = -1;
        incoming.simu = true;
        REQUIRE(incoming.attack());
    }
    CHECK_FALSE(you.did_reprisal(REPRISAL_BITE, enemy.mid));
    CHECK(enemy.hit_points == enemy.max_hit_points);
}

TEST_CASE_METHOD(shell_fixture, "Dodging a melee attack does not provoke a bite", "[tortle][bite]")
{
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    for (int attempt = 0; attempt < 64; ++attempt)
        CHECK_FALSE(incoming_hit(enemy, false));
    CHECK(enemy.hit_points == enemy.max_hit_points);
}

TEST_CASE_METHOD(shell_fixture, "A lethal bite safely ends the incoming monster's attack", "[tortle][bite]")
{
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    enemy.hit_points = 1;
    for (int attempt = 0; attempt < 128 && enemy.alive(); ++attempt)
    {
        you.reprisals.clear();
        incoming_hit(enemy);
    }
    CHECK_FALSE(enemy.alive());
    CHECK_FALSE(you.turn_is_over);
}

TEST_CASE_METHOD(shell_fixture, "Shield-blocked melee attacks do not provoke a bite", "[tortle][bite]")
{
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    you.duration[DUR_DIVINE_SHIELD] = 1000;
    for (int attempt = 0; attempt < 64; ++attempt)
    {
        melee_attack incoming(&enemy, &you);
        incoming.simu = true;
        REQUIRE(incoming.attack());
        CHECK_FALSE(incoming.did_hit);
    }
    CHECK_FALSE(you.did_reprisal(REPRISAL_BITE, enemy.mid));
    CHECK(enemy.hit_points == enemy.max_hit_points);
    CHECK(you.duration[DUR_DIVINE_SHIELD] == 1000 - 64);
}

TEST_CASE_METHOD(shell_fixture, "Bite scaling and descriptions use the same native auxiliary contract", "[tortle][bite]")
{
    REQUIRE(you.has_innate_mutation(MUT_RETALIATORY_BITE));
    CHECK(mut_aux_attack_desc(MUT_RETALIATORY_BITE).find("1 in 3") != string::npos);
    for (const auto values : {pair<int, int>{1, 0}, {27, 0}, {27, 27}})
    {
        you.experience_level = values.first;
        set_skill_level(SK_UNARMED_COMBAT, values.second, true);
        // The canonical public description exposes pre-stat, pre-armour damage.
        const string description = mut_aux_attack_desc(MUT_RETALIATORY_BITE);
        CHECK(description.find(make_stringf("Base damage:     %d",
            6 + values.first / 2 + values.second / 2)) != string::npos);
    }
    const auto auxiliaries = get_player_aux_names();
    CHECK(find(auxiliaries.begin(), auxiliaries.end(), "bite") == auxiliaries.end());
    you.species = SP_HUMAN; // Capability belongs to the mutation, not species.
    monster& enemy = spawn(you.pos() + coord_def(1, 0));
    for (int attempt = 0; attempt < 128; ++attempt)
        incoming_hit(enemy);
    CHECK(you.did_reprisal(REPRISAL_BITE, enemy.mid));
}

TEST_CASE_METHOD(shell_fixture, "A companion's bite uses its own mutation and reprisal state", "[tortle][bite]")
{
    player& companion = ally_at(you.pos() + coord_def(3, 0));
    you.mutation[MUT_RETALIATORY_BITE] = 0;
    companion.time_taken = 19;
    monster& enemy = spawn(companion.pos() + coord_def(1, 0));
    party::sync_all_proxies();
    monster* proxy = party::get_proxy_monster(1);
    REQUIRE(proxy);
    for (int attempt = 0; attempt < 128
         && !companion.did_reprisal(REPRISAL_BITE, enemy.mid); ++attempt)
    {
        melee_attack incoming(&enemy, proxy);
        incoming.to_hit = AUTOMATIC_HIT;
        incoming.attk_damage = 0;
        incoming.flat_dmg_bonus = -1;
        incoming.simu = true;
        REQUIRE(incoming.attack());
    }
    CHECK(companion.did_reprisal(REPRISAL_BITE, enemy.mid));
    CHECK_FALSE(you.did_reprisal(REPRISAL_BITE, enemy.mid));
    CHECK(companion.time_taken == 19);
    CHECK(party::active_slot() == 0);
    party::remove_all_proxies();
}

TEST_CASE_METHOD(shell_fixture, "Loading grants old Tortles their bite and preserves independent consumers", "[tortle][bite]")
{
    SECTION("An existing Tortle predates snapping retaliation")
    {
        you.mutation[MUT_RETALIATORY_BITE] = 0;
        you.innate_mutation[MUT_RETALIATORY_BITE] = 0;
    }
    SECTION("Another species independently owns the anatomy mutation")
    {
        you.species = SP_HUMAN;
    }
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_YOU, output);
    you.mutation[MUT_RETALIATORY_BITE] = 0;
    you.innate_mutation[MUT_RETALIATORY_BITE] = 0;
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    tag_read(input, TAG_YOU);
    CHECK(you.has_innate_mutation(MUT_RETALIATORY_BITE));
}

TEST_CASE_METHOD(shell_fixture, "Retraction changes armour, evasion and native abilities", "[tortle][shell]")
{
    REQUIRE(player_has_ability(ABIL_RETRACT_SHELL));
    CHECK_FALSE(player_has_ability(ABIL_SHELL_DASH));
    const int evasion = you.evasion_scaled(100);
    const int permanent_evasion = you.evasion_scaled(100, false);
    CHECK(you.armour_class_scaled(100) == 600);
    retract();
    CHECK(you.armour_class_scaled(100) == 900);
    CHECK(you.evasion_scaled(100) == evasion / 2);
    CHECK(you.evasion_scaled(100, false) == permanent_evasion);
    CHECK(you.evasion() <= (evasion / 200) + 1);
    CHECK(player_has_ability(ABIL_SHELL_DASH));
    CHECK(ability_name(ABIL_RETRACT_SHELL) == "Emerge from Shell");
    CHECK(ability_name(ABIL_RETRACT_SHELL, true) == "Retract into Shell");
    status_info status;
    REQUIRE(fill_status_info(STATUS_RETRACTED_SHELL, status));
    CHECK(status.light_text == "Shell");
    you.experience_level = 27;
    CHECK(you.armour_class_scaled(100) == 2700);
    REQUIRE(shell::retract() == spret::success);
    CHECK_FALSE(shell::retracted());
    CHECK(you.armour_class_scaled(100) == 1800);
    CHECK_FALSE(fill_status_info(STATUS_RETRACTED_SHELL, status));
}

TEST_CASE_METHOD(shell_fixture, "Shell anatomy grants reusable abilities and changing form clears stance", "[tortle][shell]")
{
    you.species = SP_HUMAN;
    REQUIRE(player_has_ability(ABIL_RETRACT_SHELL));
    retract();
    set_form(transformation::bat, 10, false);
    CHECK_FALSE(shell::retracted());
    CHECK_FALSE(shell::can_retract(true));
    CHECK_FALSE(player_has_ability(ABIL_RETRACT_SHELL));
    set_form(transformation::none, 0, false);
    CHECK_FALSE(shell::retracted());
    CHECK(player_has_ability(ABIL_RETRACT_SHELL));
    you.mutation[MUT_ARMOURED_SHELL] = 0;
    CHECK_FALSE(shell::can_retract(true));
}

TEST_CASE_METHOD(shell_fixture, "Shell damage scales independently with level, unarmed combat and distance", "[tortle][shell]")
{
    CHECK(shell::dash_damage(1).num == 2);
    CHECK(shell::dash_damage(1).size == 5);
    CHECK(shell::dash_damage(7).size == 17);
    you.experience_level = 27;
    CHECK(shell::dash_damage(1).size == 18);
    set_skill_level(SK_UNARMED_COMBAT, 27, true);
    CHECK(shell::dash_damage(1).size == 45);
    CHECK(shell::dash_damage(7).size == 57);
}

TEST_CASE_METHOD(shell_fixture, "A shell dash rolls to the first wall in one action and emerges", "[tortle][shell]")
{
    retract();
    env.grid[46][35] = DNGN_ROCK_WALL;
    invalidate_los();
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    CHECK(you.pos() == coord_def(45, 35));
    CHECK(you.time_taken == player_speed());
    CHECK(you.turn_is_over);
    CHECK_FALSE(shell::retracted());
}

TEST_CASE_METHOD(shell_fixture, "Ordinary shell movement is half speed without dash costs", "[tortle][shell]")
{
    const int normal = player_movement_speed();
    const int hp = you.hp;
    CHECK(normal == 13);
    retract();
    CHECK(player_movement_speed() == normal * 2);
    CHECK(player_movement_speed(true, false) == normal);
    move_player_action(coord_def(1, 0));
    CHECK(you.pos() == coord_def(41, 35));
    CHECK(you.time_taken == 26);
    CHECK(shell::retracted());
    CHECK(you.hp == hp);
    CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] == 0);
    shell::emerge();
    CHECK(player_movement_speed() == normal);
}

TEST_CASE_METHOD(shell_fixture, "Shell Dash hits only the first enemy and stops before it", "[tortle][shell]")
{
    retract();
    monster& first = spawn(coord_def(44, 35));
    monster& second = spawn(coord_def(45, 35));
    rng::subgenerator deterministic(0x5348454c4cULL);
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    CHECK(you.pos() == coord_def(43, 35));
    CHECK(first.hit_points < 1000);
    CHECK(first.hit_points >= 1000 - 22); // 2d11, four-tile impact
    CHECK(second.hit_points == 1000);
    CHECK(you.attempted_attack);
}

TEST_CASE_METHOD(shell_fixture, "An adjacent shell impact cannot move through its victim", "[tortle][shell]")
{
    retract();
    monster& victim = spawn(coord_def(41, 35));
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    CHECK(you.pos() == coord_def(40, 35));
    CHECK(victim.hit_points < 1000);
    CHECK(you.turn_is_over);
}

TEST_CASE_METHOD(shell_fixture, "A killing shell impact still stops before the next enemy", "[tortle][shell]")
{
    retract();
    monster& victim = spawn(coord_def(43, 35));
    monster& next = spawn(coord_def(44, 35));
    victim.hit_points = 1;
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    CHECK(you.pos() == coord_def(42, 35));
    CHECK(monster_at(coord_def(43, 35)) == nullptr);
    CHECK(next.hit_points == 1000);
}

TEST_CASE_METHOD(shell_fixture, "Shells cross deep water and do not stop at their old sight range", "[tortle][shell]")
{
    retract();
    for (int x = 41; x < 52; ++x)
        env.grid[x][35] = DNGN_DEEP_WATER;
    env.grid[52][35] = DNGN_ROCK_WALL;
    invalidate_los();
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    CHECK(you.pos() == coord_def(51, 35));
    CHECK(you.time_taken == player_speed());
}

TEST_CASE_METHOD(shell_fixture, "Shell impacts count as friendly fire and stop at the first creature", "[tortle][shell]")
{
    retract();
    crawl_state.disables.set(DIS_CONFIRMATIONS);
    SECTION("friendly monster")
    {
        monster& friend_mon = spawn(coord_def(43, 35));
        friend_mon.base_attitude = ATT_FRIENDLY;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
        CHECK(friend_mon.hit_points < 1000);
    }
    SECTION("neutral monster")
    {
        monster& neutral = spawn(coord_def(43, 35));
        neutral.base_attitude = ATT_NEUTRAL;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
        CHECK(neutral.hit_points < 1000);
    }
    SECTION("co-op hero")
    {
        player& ally = ally_at(coord_def(43, 35));
        const int attacker_hp = you.hp;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
        CHECK(ally.hp < 50);
        CHECK(party::active_slot() == 0);
        CHECK(you.hp == attacker_hp - shell::dash_recoil(2, true));
        CHECK_FALSE(shell::retracted());
        CHECK_FALSE(ally.props.exists("shell_retracted"));
    }
    SECTION("friendly fire disabled for co-op heroes")
    {
        player& ally = ally_at(coord_def(43, 35));
        party::set_friendly_fire(false);
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
        CHECK(ally.hp == 50);
    }
    SECTION("closed door")
    {
        env.grid[43][35] = DNGN_CLOSED_DOOR;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
        CHECK(env.grid[43][35] == DNGN_CLOSED_DOOR);
    }
    SECTION("lava")
    {
        env.grid[43][35] = DNGN_LAVA;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.pos() == coord_def(42, 35));
    }
}

TEST_CASE_METHOD(shell_fixture, "Blocked or invalid dashes spend no turn and cannot bypass restraints", "[tortle][shell]")
{
    const int hp = you.hp;
    CHECK_FALSE(shell::can_dash(true));
    retract();
    dist cancelled;
    cancelled.isCancel = true;
    CHECK(shell::choose_dash_direction(&cancelled) == spret::abort);
    SECTION("wall") { env.grid[41][35] = DNGN_ROCK_WALL; }
    SECTION("net") { you.attribute[ATTR_HELD] = 1; }
    SECTION("immobility") { you.duration[DUR_NO_MOMENTUM] = 10; }
    SECTION("confusion") { you.duration[DUR_CONF] = 10; }
    CHECK(shell::dash(coord_def(1, 0)) == spret::abort);
    CHECK(you.pos() == coord_def(40, 35));
    CHECK_FALSE(you.turn_is_over);
    CHECK(shell::dash(coord_def(0, 0)) == spret::abort);
    CHECK(shell::dash(coord_def(2, 1)) == spret::abort);
    CHECK(you.hp == hp);
    CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] == 0);
}

TEST_CASE_METHOD(shell_fixture, "Shell recovery prevents repeated dashes through every entry point", "[tortle][shell]")
{
    retract();
    env.grid[44][35] = DNGN_ROCK_WALL;
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    const int hp = you.hp;
    CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] == 50 + you.time_taken);
    you.turn_is_over = false;
    CHECK_FALSE(shell::can_dash(true));
    CHECK_FALSE(check_ability_possible(ABIL_SHELL_DASH, true));
    CHECK(shell::dash(coord_def(-1, 0)) == spret::abort);
    CHECK_FALSE(you.turn_is_over);
    CHECK_FALSE(shell::retracted());
    move_player_action(coord_def(-1, 0));
    CHECK(you.pos() == coord_def(42, 35));
    CHECK(you.time_taken == 13);
    CHECK(you.hp == hp);
    CHECK(you.turn_is_over);
    CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] > 0);
    retract();
    CHECK_FALSE(shell::can_dash(true));
    status_info status;
    REQUIRE(fill_status_info(DUR_SHELL_DASH_COOLDOWN, status));
    CHECK(status.light_text == "-Dash");
    CHECK(duration_decrements_normally(DUR_SHELL_DASH_COOLDOWN));
    CHECK_FALSE(duration_dispellable(DUR_SHELL_DASH_COOLDOWN));
}

TEST_CASE_METHOD(shell_fixture, "Shell recovery leaves five full turns after the dash resolves", "[tortle][shell]")
{
    SECTION("ordinary speed") {}
    SECTION("hasted") { you.duration[DUR_HASTE] = 200; }
    SECTION("slowed") { you.duration[DUR_SLOW] = 200; }
    retract();
    env.grid[43][35] = DNGN_ROCK_WALL;
    REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
    player_reacts();
    REQUIRE(you.duration[DUR_SHELL_DASH_COOLDOWN] == 50);
    for (int turn = 0; turn < 5; ++turn)
    {
        CHECK_FALSE(shell::can_dash(true));
        you.time_taken = BASELINE_DELAY;
        player_reacts();
        CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] == (4 - turn) * BASELINE_DELAY);
    }
    retract();
    CHECK(shell::can_dash(true));
}

TEST_CASE_METHOD(shell_fixture, "Shell recoil is bounded, personal, and nonlethal", "[tortle][shell]")
{
    CHECK(shell::dash_recoil(0, true) == 2);
    CHECK(shell::dash_recoil(1, false) == 1);
    CHECK(shell::dash_recoil(4, false) == 2);
    CHECK(shell::dash_recoil(8, true) == 4);
    CHECK(shell::dash_recoil(80, true) == 5);
    CHECK(make_cost_description(ABIL_SHELL_DASH).find("recoil") != string::npos);
    you.experience_level = 27; // High shell AC must not mitigate recoil.
    retract();
    SECTION("long roll")
    {
        you.hp = 20;
        env.grid[52][35] = DNGN_ROCK_WALL;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.hp == 17); // Eleven traversed tiles, no creature impact.
    }
    SECTION("one HP")
    {
        you.hp = 1;
        env.grid[44][35] = DNGN_ROCK_WALL;
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.hp == 1);
    }
    SECTION("adjacent creature")
    {
        you.hp = 20;
        spawn(coord_def(41, 35));
        REQUIRE(shell::dash(coord_def(1, 0)) == spret::success);
        CHECK(you.hp == 18);
    }
}

TEST_CASE_METHOD(shell_fixture, "Shell cooldown survives native saving and is independent for companions", "[tortle][shell]")
{
    you.duration[DUR_SHELL_DASH_COOLDOWN] = 37;
    player& ally = ally_at(coord_def(43, 35));
    ally.duration[DUR_SHELL_DASH_COOLDOWN] = 0;
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_YOU, output);
    you.duration[DUR_SHELL_DASH_COOLDOWN] = 0;
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    tag_read(input, TAG_YOU);
    CHECK(you.duration[DUR_SHELL_DASH_COOLDOWN] == 37);
    CHECK(ally.duration[DUR_SHELL_DASH_COOLDOWN] == 0);
    CHECK(party::active_slot() == 0);
}

TEST_CASE_METHOD(shell_fixture, "Dash reticles show compass paths and stop at visible collisions", "[tortle][shell]")
{
    auto preview = find_ability_targeter(ABIL_SHELL_DASH);
    REQUIRE(preview);
    CHECK(testbits(get_ability_flags(ABIL_SHELL_DASH), abflag::dir_or_target));
    CHECK_FALSE(preview->valid_aim(you.pos()));
    CHECK_FALSE(preview->valid_aim(coord_def(44, 37)));
    CHECK_FALSE(preview->set_aim(you.pos()));
    SECTION("wall")
    {
        env.grid[45][35] = DNGN_ROCK_WALL;
        invalidate_los();
        REQUIRE(preview->set_aim(coord_def(44, 35)));
        CHECK(preview->is_affected(coord_def(41, 35)) == AFF_MAYBE);
        CHECK(preview->is_affected(coord_def(44, 35)) == AFF_YES);
        CHECK(preview->is_affected(coord_def(45, 35)) == AFF_NO);
    }
    SECTION("creature")
    {
        spawn(coord_def(43, 35));
        REQUIRE(preview->set_aim(coord_def(46, 35)));
        CHECK(preview->is_affected(coord_def(42, 35)) == AFF_MAYBE);
        CHECK(preview->is_affected(coord_def(43, 35)) == AFF_YES);
        CHECK(preview->is_affected(coord_def(44, 35)) == AFF_NO);
    }
    SECTION("unseen creature")
    {
        spawn(coord_def(43, 35)).add_ench(ENCH_INVIS);
        REQUIRE(preview->set_aim(coord_def(46, 35)));
        CHECK(preview->is_affected(coord_def(44, 35)) != AFF_NO);
    }
    SECTION("visible co-op hero")
    {
        player& ally = ally_at(coord_def(43, 35));
        REQUIRE(you.can_see(ally));
        REQUIRE(preview->set_aim(coord_def(46, 35)));
        CHECK(preview->is_affected(coord_def(43, 35)) == AFF_YES);
        CHECK(preview->is_affected(coord_def(44, 35)) == AFF_NO);
    }
    SECTION("invisible co-op hero")
    {
        player& ally = ally_at(coord_def(43, 35));
        ally.duration[DUR_INVIS] = 100;
        CHECK_FALSE(you.can_see(ally));
        REQUIRE(preview->set_aim(coord_def(46, 35)));
        CHECK(preview->is_affected(coord_def(44, 35)) != AFF_NO);
        you.mutation[MUT_ACUTE_VISION] = 1;
        CHECK(you.can_see(ally));
        REQUIRE(preview->set_aim(coord_def(46, 35)));
        CHECK(preview->is_affected(coord_def(43, 35)) == AFF_YES);
    }
    SECTION("diagonal")
    {
        env.grid[44][39] = DNGN_CLOSED_DOOR;
        invalidate_los();
        REQUIRE(preview->set_aim(coord_def(43, 38)));
        CHECK(preview->is_affected(coord_def(41, 36)) == AFF_MAYBE);
        CHECK(preview->is_affected(coord_def(43, 38)) == AFF_YES);
        CHECK(preview->is_affected(coord_def(44, 39)) == AFF_NO);
        CHECK(preview->is_affected(coord_def(42, 36)) == AFF_NO);
    }
}

TEST_CASE_METHOD(shell_fixture, "Dash ability accepts compass targets and rejects off-axis targeting", "[tortle][shell]")
{
    retract();
    dist target;
    target.isValid = true;
    target.isTarget = true;
    target.target = coord_def(44, 37);
    CHECK(shell::choose_dash_direction(&target) == spret::abort);
    env.grid[44][39] = DNGN_ROCK_WALL;
    invalidate_los();
    target.target = coord_def(43, 38); // Aim before the wall, within line of sight.
    REQUIRE(activate_talent(get_talent(ABIL_SHELL_DASH), &target));
    CHECK(you.pos() == coord_def(43, 38));
    CHECK(you.turn_is_over);
}

TEST_CASE_METHOD(shell_fixture, "Shell stance survives saving and read-only commands but ends for physical actions", "[tortle][shell]")
{
    retract();
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    you.props.clear();
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    you.props.read(input);
    REQUIRE(shell::retracted());
    for (command_type command : {CMD_SAVE_GAME, CMD_LOOK_AROUND,
             CMD_DISPLAY_INVENTORY, CMD_WAIT, CMD_REST, CMD_MOVE_RIGHT,
             CMD_EXPLORE, CMD_INTERLEVEL_TRAVEL})
    {
        shell::prepare_command(command);
        CHECK(shell::retracted());
    }
    shell::prepare_command(CMD_CAST_SPELL);
    CHECK_FALSE(shell::retracted());
    CHECK(you.armour_class_scaled(1) == 6);
}

TEST_CASE_METHOD(shell_fixture, "Firing a quivered shell dash emerges after the roll", "[tortle][shell]")
{
    retract();
    REQUIRE(you.quiver_action.set(quiver::ability_to_action(ABIL_SHELL_DASH)));
    REQUIRE(you.quiver_action.get()->is_enabled()); // No hostile target is needed.
    shell::prepare_command(CMD_FIRE);
    REQUIRE(shell::retracted());
    env.grid[44][35] = DNGN_ROCK_WALL;
    dist target;
    target.isValid = true;
    target.isTarget = false;
    target.interactive = false; // Dispatch an already chosen reticle direction.
    target.delta = coord_def(1, 0);
    target.target = you.pos() + target.delta;
    // This fixture has no Lua autofight helpers. Manual targeting skips them;
    // use the same scoped bypass for this already-resolved target.
    unwind_var<bool> skip_autofight(crawl_state.skip_autofight_check, true);
    you.quiver_action.get()->trigger(target);
    CHECK(you.pos() == coord_def(43, 35));
    CHECK(you.turn_is_over);
    CHECK_FALSE(shell::retracted());
}
