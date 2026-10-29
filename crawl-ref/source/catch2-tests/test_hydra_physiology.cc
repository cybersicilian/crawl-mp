#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "character-trait.h"
#include "dungeon.h"
#include "env.h"
#include "hydra-physiology.h"
#include "item-name.h"
#include "items.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "mon-util.h"
#include "mutation.h"
#include "ng-restr.h"
#include "newgame-def.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "species.h"
#include "status.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#include "transform.h"
#ifdef USE_TILE
#include "tiledoll.h"
#include "tilepick-p.h"
#include "rltiles/tiledef-player.h"
#endif

namespace
{
struct hydra_combat_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    hydra_combat_fixture()
    {
        static const bool ready = []() { init_duration_index(); return true; }();
        (void)ready;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_HYDRA;
        you.experience_level = 7;
        you.religion = GOD_NO_GOD;
        you.raw_piety = 0;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.form = you.default_form = transformation::none;
        for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
            you.mutation[mut] = you.innate_mutation[mut] = 0;
        give_basic_mutations(you.species);
        you.equipment.update();
        invalidate_los();
    }
    ~hydra_combat_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
    monster& spawn(int index, coord_def position, mon_attitude_type attitude)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 30001 + index;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(1);
        mon.base_attitude = attitude;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(position);
        env.mgrid(position) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE("Hydra heads determine primary bites and amulet capacity",
          "[hydra-physiology]")
{
    for (const auto [heads, slots] : {pair{1, 1}, pair{3, 1}, pair{4, 2},
                                      pair{6, 2}, pair{7, 3}, pair{27, 9}})
    {
        CAPTURE(heads);
        CHECK(hydra::heads_for_level(heads) == heads);
        CHECK(hydra::primary_bites(heads) == slots);
        CHECK(hydra::amulet_slots(heads) == slots);
    }
    CHECK(hydra::heads_for_level(10, 3) == 7);
    CHECK(hydra::heads_for_level(10, -3) == 13);
    CHECK(hydra::heads_for_level(1, 99) == 1);
    CHECK(hydra::heads_for_level(27, -10) == 27);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Hydra anatomy uses growing amulet slots and no weapons",
                 "[hydra-physiology]")
{
    you.species = SP_HYDRA;
    you.experience_level = 7;
    you.form = you.default_form = transformation::none;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(you.species);
    you.equipment.update();

    CHECK(species::is_starting_species(SP_HYDRA));
    CHECK(job_allowed(SP_HYDRA, JOB_GLADIATOR) == CC_UNRESTRICTED);
    CHECK(job_allowed(SP_HYDRA, JOB_HUNTER) == CC_BANNED);
    CHECK(job_allowed(SP_HYDRA, JOB_HEXSLINGER) == CC_BANNED);
    newgame_def ng;
    ng.species = SP_HYDRA;
    ng.job = JOB_GLADIATOR;
    CHECK(weapon_restriction(WPN_UNARMED, ng) == CC_UNRESTRICTED);
    CHECK(weapon_restriction(WPN_MACE, ng) == CC_BANNED);
    CHECK(you.heads() == 7);
    CHECK(get_player_equip_slot_count(SLOT_AMULET) == 3);
    CHECK(you.equipment.num_slots[SLOT_AMULET] == 3);
    CHECK(get_player_equip_slot_count(SLOT_RING) == 0);
    CHECK(get_player_equip_slot_count(SLOT_WEAPON) == 0);
    CHECK_FALSE(you.has_mutation(MUT_NO_GRASPING)); // Throwing remains available.
    item_def weapon;
    REQUIRE(get_item_by_exact_name(weapon, "mace"));
    CHECK_FALSE(can_equip_item(weapon, true));
    you.mutation[MUT_WIELD_OFFHAND] = 1;
    CHECK(get_player_equip_slot_count(SLOT_WEAPON_OR_OFFHAND) == 0);
    CHECK_FALSE(can_equip_item(weapon, true));
    you.mutation[MUT_WIELD_OFFHAND] = 0;
    CHECK(check_trait(character_trait::mummy, SP_HYDRA, JOB_GLADIATOR)
          == trait_restriction::allowed);

    you.props[hydra::HEAD_LOSS_KEY] = 4;
    CHECK(you.heads() == 3);
    CHECK(get_player_equip_slot_count(SLOT_AMULET) == 1);
    you.equipment.update();
    CHECK(you.equipment.num_slots[SLOT_AMULET] == 1);
    you.form = transformation::bat;
    CHECK(you.heads() == 1);
    you.form = transformation::statue;
    CHECK(you.heads() == 3);
}

TEST_CASE("Hydra head loss belongs to each character and survives serialization",
          "[hydra-physiology]")
{
    player first, second;
    first.species = second.species = SP_HYDRA;
    first.experience_level = second.experience_level = 10;
    first.props[hydra::HEAD_LOSS_KEY] = 4;
    second.props[hydra::HEAD_LOSS_KEY] = -2;
    CHECK(hydra::heads(first) == 6);
    CHECK(hydra::heads(second) == 12);

    vector<unsigned char> bytes;
    writer output(&bytes);
    first.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.species = SP_HYDRA;
    restored.experience_level = 10;
    restored.props.read(input);
    CHECK(hydra::heads(restored) == 6);
    CHECK(hydra::heads(second) == 12);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Hydra head loss preserves removed amulets and recovers with experience",
                 "[hydra-physiology]")
{
    you.species = SP_HYDRA;
    you.experience_level = 7;
    you.form = you.default_form = transformation::none;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(you.species);
    you.equipment.update();

    const char* names[] = {"amulet of faith", "amulet of reflection",
                           "amulet of regeneration"};
    for (int i = 0; i < 3; ++i)
    {
        REQUIRE(get_item_by_exact_name(you.inv[i], names[i]));
        you.inv[i].link = i;
        you.inv[i].pos = ITEM_IN_INVENTORY;
        REQUIRE(can_equip_item(you.inv[i], true));
        you.equipment.add(you.inv[i], SLOT_AMULET);
        you.equipment.update();
    }
    REQUIRE(you.equipment.get_slot_items(SLOT_AMULET).size() == 3);
    REQUIRE(hydra::change_heads(-5));
    CHECK(you.heads() == 2);
    CHECK(you.equipment.get_slot_items(SLOT_AMULET).size() == 1);
    for (int i = 0; i < 3; ++i)
        CHECK(you.inv[i].defined());

    you.props[hydra::HEAD_RECOVERY_KEY] = 1;
    hydra::recover_on_experience(1);
    CHECK(you.heads() == 3);
    you.props[hydra::HEAD_RECOVERY_KEY] = 1;
    hydra::recover_on_experience(1);
    CHECK(you.heads() == 4);
    CHECK(you.equipment.num_slots[SLOT_AMULET] == 2);
    you.form = transformation::statue;
    you.props[hydra::HEAD_RECOVERY_KEY] = 1;
    hydra::recover_on_experience(1);
    CHECK(you.heads() == 4);
    you.form = transformation::none;
    you.experience_level = 27;
    you.props[hydra::HEAD_LOSS_KEY] = -2;
    hydra::on_level_change();
    CHECK(you.heads() == 27);
    CHECK(you.props[hydra::HEAD_LOSS_KEY].get_int() == 0);
    CHECK_FALSE(you.props.exists(hydra::HEAD_RECOVERY_KEY));
}

TEST_CASE_METHOD(hydra_combat_fixture,
                 "Hydra bites its target repeatedly and avoids allied bystanders",
                 "[hydra-combat]")
{
    const coord_def origin = you.pos();
    monster& primary = spawn(0, origin + coord_def(1, 0), ATT_HOSTILE);
    monster& left = spawn(1, origin + coord_def(1, -1), ATT_HOSTILE);
    monster& right = spawn(2, origin + coord_def(1, 1), ATT_HOSTILE);
    monster& ally = spawn(3, origin + coord_def(0, 1), ATT_FRIENDLY);
    rng::subgenerator controlled_rng(0x4859445241ULL);

    primary.hit_points = primary.max_hit_points = 10000;
    for (int attempt = 0; attempt < 20
                          && (primary.hit_points == primary.max_hit_points
                              || (left.hit_points == left.max_hit_points
                                  && right.hit_points == right.max_hit_points)); ++attempt)
    {
        melee_attack attack(&you, &primary);
        REQUIRE(attack.launch_attack_set(true));
        CHECK(attack.attack_number == 2); // Seven heads give three primary bites.
        CHECK(attack.did_attack_hostiles());
        CHECK(ally.hit_points == ally.max_hit_points);
    }
    CHECK(primary.hit_points < primary.max_hit_points);
    CHECK((left.hit_points < left.max_hit_points
           || right.hit_points < right.max_hit_points));
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(hydra_combat_fixture,
                 "Hydras swim swiftly and their head count updates their appearance",
                 "[hydra-physiology]")
{
    you.base_stats[STAT_DEX] = 25;
    env.grid(you.pos()) = DNGN_FLOOR;
    const int dry_speed = player_movement_speed();
    you.experience_level = 8;
    const int stealth_at_eight = player_stealth();
    you.experience_level = 9;
    CHECK(player_stealth() < stealth_at_eight);
    env.grid(you.pos()) = DNGN_DEEP_WATER;
    REQUIRE(you.in_water());
    CHECK(player_movement_speed() < dry_speed);
    CHECK(player_movement_speed(false) == dry_speed);
    env.grid(you.pos()) = DNGN_FLOOR;

#ifdef USE_TILE
    CHECK(tilep_species_to_base_tile(SP_HYDRA, 9) == TILEP_BASE_HYDRA + 8);
    REQUIRE(hydra::change_heads(-5));
    CHECK(you.heads() == 4);
    CHECK(tilep_species_to_base_tile(SP_HYDRA, 9) == TILEP_BASE_HYDRA + 3);
    you.form = transformation::statue;
    dolls_data doll;
    fill_player_equipment_doll(doll);
    CHECK(doll.parts[TILEP_PART_BASE] == TILEP_TRAN_STATUE_HYDRA + 3);
#endif
}

TEST_CASE_METHOD(hydra_combat_fixture,
                 "Cut Hydra heads regrow unless cauterised",
                 "[hydra-combat]")
{
    bool flaming = false;
    SECTION("a normal cut grows two heads") {}
    SECTION("a flaming cut prevents regrowth") { flaming = true; }

    monster& attacker = spawn(0, you.pos() + coord_def(1, 0), ATT_HOSTILE);
    attacker.type = MONS_IRON_TROLL;
    attacker.set_hit_dice(16);
    you.hp = you.hp_max = 5000;
    rng::subgenerator controlled_rng(0x48454144435554ULL);
    for (int attempt = 0; attempt < 30 && you.heads() == 7; ++attempt)
    {
        melee_attack strike(&attacker, &you, 1, 1); // Iron troll's first claw.
        if (flaming)
            strike.damage_brand = SPWPN_FLAMING;
        strike.attack();
    }
    CHECK(you.heads() == (flaming ? 6 : 8));
    CHECK(you.props.exists(hydra::HEAD_RECOVERY_KEY));
}
