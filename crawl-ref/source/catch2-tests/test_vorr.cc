#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "cell-resource.h"
#include "corpse.h"
#include "database.h"
#include "env.h"
#include "feature.h"
#include "fineff.h"
#include "god-vorr.h"
#include "god-vorr-internal.h"
#include "items.h"
#include "initfile.h"
#include "level-time.h"
#include "losglobal.h"
#include "message.h"
#include "mon-death.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "species.h"
#include "store.h"
#include "state.h"
#include "tags.h"
#include "target.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE("Cell resources preserve independent expiry and finite capacity", "[vorr][cell-resource]")
{
    cell_resource::ledger entries;
    const coord_def cell(4, 5);
    REQUIRE(cell_resource::add(entries, cell, 2, 110, 100) == 2);
    REQUIRE(cell_resource::add(entries, cell, 2, 225, 105) == 1);
    REQUIRE(cell_resource::at(entries, cell, 109) == 3);
    REQUIRE(cell_resource::at(entries, cell, 110) == 1);
    REQUIRE(cell_resource::at(entries, cell, 225) == 0);
    REQUIRE(cell_resource::add(entries, cell, 3, 120, 130) == 0);
}

TEST_CASE("Cell resource payment is ordered, transactional and duplicate-safe", "[vorr][cell-resource]")
{
    const coord_def origin(5, 5), far(8, 5);
    cell_resource::ledger entries{{far, 3, 130}, {origin, 1, 120}, {origin, 1, 110}};
    auto plan = cell_resource::select(entries, origin, 2, 100,
        [](const coord_def&) { return true; });
    REQUIRE(plan.size() == 2);
    REQUIRE(plan[0].index == 2);
    REQUIRE(plan[1].index == 1);
    REQUIRE_FALSE(cell_resource::commit(entries, plan, 110));
    REQUIRE(entries[1].units == 1);
    REQUIRE(entries[2].units == 1);
    REQUIRE_FALSE(cell_resource::commit(entries, {{1, 1}, {1, 1}}, 100));
    REQUIRE(entries[1].units == 1);
    REQUIRE(cell_resource::select(entries, origin, 6, 100,
        [](const coord_def&) { return true; }).empty());
    REQUIRE(cell_resource::total(cell_resource::select_up_to(entries, origin, 6, 100,
        [](const coord_def&) { return true; })) == 5);
    REQUIRE(cell_resource::commit(entries, plan, 100));
    REQUIRE(cell_resource::at(entries, origin, 100) == 0);
    REQUIRE(cell_resource::at(entries, far, 100) == 3);
}

TEST_CASE("Cell deposits survive native property serialization without refreshing", "[vorr][cell-resource]")
{
    CrawlHashTable properties;
    cell_resource::ledger entries{{coord_def(5, 5), 1, 110}, {coord_def(5, 5), 2, 220}};
    cell_resource::save(properties, "resource", entries, 100);
    cell_resource::save(properties, "resource", entries, 100);
    vector<unsigned char> bytes;
    writer output(&bytes);
    properties.write(output);
    reader input(bytes);
    input.setMinorVersion(TAG_MINOR_VERSION);
    CrawlHashTable restored;
    restored.read(input);
    const auto loaded = cell_resource::load(restored, "resource", 120);
    REQUIRE(loaded.size() == 1);
    REQUIRE(loaded[0].units == 2);
    REQUIRE(loaded[0].expires == 220);
}

namespace
{
struct vorr_fixture : MockPlayerYouTestsFixture
{
    CrawlHashTable old_properties = env.properties;
    vector<dungeon_feature_type> old_terrain;
    vector<terrain_property_t> old_blood;
    vector<coord_def> spawned;
    vector<int> old_item_grid;
    vector<int> corpses;
    bool old_confirmations = crawl_state.disables[DIS_CONFIRMATIONS];
    int old_elapsed_time = env.elapsed_time;
    int old_max_mon_index = env.max_mon_index;

    vorr_fixture()
    {
        static const bool ready = []() { msg::initialise_mpr_streams(); return true; }();
        (void)ready;
        init_show_table();
        init_monsters();
        party::set_multiplayer(false);
        party::set_player_count(1);
        crawl_state.disables.set(DIS_CONFIRMATIONS);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.on_current_level = true;
        you.elapsed_time = 100;
        you.current_vision = you.normal_vision = 7;
        you.set_position(coord_def(40, 35));
        you.religion = GOD_VORR;
        you.raw_piety = 200;
        you.hp_max_adj_perm += 100 - get_real_hp(true, true, false);
        calc_hp(false);
        you.hp = you.hp_max;
        env.properties.erase(vorr::blood_key);
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
            {
                old_terrain.push_back(env.grid[x][y]);
                old_blood.push_back(env.pgrid[x][y]);
                old_item_grid.push_back(env.igrid[x][y]);
                env.igrid[x][y] = NON_ITEM;
                env.grid[x][y] = DNGN_FLOOR;
                env.pgrid[x][y] = terrain_property_t();
            }
        invalidate_los();
    }
    ~vorr_fixture()
    {
        clear_final_effects();
        for (int index : corpses)
            if (env.item[index].defined())
                destroy_item(index);
        crawl_state.disables.set(DIS_CONFIRMATIONS, old_confirmations);
        for (unsigned i = 0; i < spawned.size(); ++i)
        {
            env.mgrid(spawned[i]) = NON_MONSTER;
            env.mid_cache.erase(20000 + i);
            env.mons[i].reset();
        }
        env.properties = old_properties;
        env.elapsed_time = old_elapsed_time;
        env.max_mon_index = old_max_mon_index;
        int i = 0;
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y, ++i)
            {
                env.grid[x][y] = old_terrain[i];
                env.pgrid[x][y] = old_blood[i];
                env.igrid[x][y] = old_item_grid[i];
            }
        invalidate_los();
    }
    monster& spawn(monster_type type, const coord_def& pos)
    {
        const unsigned i = spawned.size();
        monster& mon = env.mons[i];
        mon.reset();
        mon.type = type;
        mon.mid = 20000 + i;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(5);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = i;
        env.mid_cache[mon.mid] = i;
        env.max_mon_index = max(env.max_mon_index, static_cast<int>(i));
        spawned.push_back(pos);
        return mon;
    }
    void deposit(const coord_def& pos, int units)
    {
        auto entries = vorr::blood_ledger();
        REQUIRE(cell_resource::add(entries, pos, units, level_elapsed_time() + 120,
                                   level_elapsed_time()) == units);
        vorr::save_blood(entries);
    }
    int corpse(const coord_def& pos, monster_type type = MONS_OGRE)
    {
        int index = get_mitm_slot(0);
        REQUIRE(index != NON_ITEM);
        auto& item = env.item[index];
        item.clear();
        item.base_type = OBJ_CORPSES;
        item.sub_type = CORPSE_BODY;
        item.mon_type = type;
        item.quantity = 1;
        item.freshness = FRESHEST_CORPSE;
        move_item_to_grid(&index, pos, true);
        corpses.push_back(index);
        return index;
    }
};
}

TEST_CASE_METHOD(vorr_fixture, "Vorr registration has sparse native power grants", "[vorr]")
{
    REQUIRE(god_name(GOD_VORR) == "Vorr");
    REQUIRE(feat_altar_god(altar_for_god(GOD_VORR)) == GOD_VORR);
    const auto powers = get_god_powers(GOD_VORR);
    REQUIRE(std::none_of(powers.begin(), powers.end(), [](const god_power& power) {
        return power.rank == 2 || power.rank == 4 || power.rank == 6;
    }));
    REQUIRE(player_has_ability(ABIL_VORR_RED_PASSAGE));
}

TEST_CASE_METHOD(vorr_fixture, "Bloodless enemies supply no blood or Communion healing", "[vorr]")
{
    auto& mon = spawn(MONS_ORB_OF_FIRE, coord_def(42, 35));
    REQUIRE_FALSE(mon.has_blood());
    you.hp = 50;
    mon.hurt(&you, 600, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(you.hp == 50);
    REQUIRE(vorr::nearby_blood() == 0);
    vorr::on_kill(mon, KILL_YOU, true, false);
    REQUIRE(vorr::nearby_blood() == 0);
    deposit(you.pos(), 2);
    const coord_def target = mon.pos();
    REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, false, &target) == spret::abort);
    REQUIRE(vorr::nearby_blood() == 2);
}

TEST_CASE_METHOD(vorr_fixture, "A victim's wound and death share a finite blood budget", "[vorr]")
{
    auto& mon = spawn(MONS_OGRE, coord_def(42, 35));
    mon.hurt(&you, 600, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(vorr::nearby_blood() == 1);
    mon.hit_points = mon.max_hit_points;
    mon.hurt(&you, 600, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(vorr::nearby_blood() == 1);
    mon.hit_points = 0;
    vorr::on_kill(mon, KILL_YOU, true, false);
    REQUIRE(vorr::nearby_blood() == 4);
    vorr::on_kill(mon, KILL_YOU, true, false);
    REQUIRE(vorr::nearby_blood() == 4);
    you.elapsed_time += 120;
    REQUIRE(vorr::nearby_blood() == 0);
}

TEST_CASE_METHOD(vorr_fixture, "Communion shares one cap across targets and respects piety", "[vorr]")
{
    auto& first = spawn(MONS_OGRE, coord_def(42, 35));
    auto& second = spawn(MONS_OGRE, coord_def(43, 35));
    you.hp = 50;
    first.hurt(&you, 100, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(you.hp == 53);
    second.hurt(&you, 100, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(you.hp == 53);
    you.elapsed_time += BASELINE_DELAY;
    second.hurt(&you, 100, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(you.hp == 56);
    deposit(you.pos(), 1);
    REQUIRE(vorr::regeneration_bonus() == 100);
    you.raw_piety = piety_breakpoint(2) - 1;
    REQUIRE(vorr::regeneration_bonus() == 0);
    first.hurt(&you, 100, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
    REQUIRE(you.hp == 56);
}

TEST_CASE_METHOD(vorr_fixture, "Rupture failure and invalid targets never pay blood", "[vorr]")
{
    auto& mon = spawn(MONS_OGRE, coord_def(42, 35));
    const coord_def target = mon.pos();
    deposit(you.pos(), 2);
    REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, true, &target) == spret::fail);
    REQUIRE(vorr::nearby_blood() == 2);
    REQUIRE(mon.hit_points == 1000);
    REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, false, &target) == spret::success);
    REQUIRE(vorr::nearby_blood() == 0);
    REQUIRE(mon.hit_points < 1000);
}

TEST_CASE_METHOD(vorr_fixture, "Red Passage validates both endpoints before payment", "[vorr]")
{
    const coord_def origin = you.pos(), destination(43, 35);
    deposit(origin, 1);
    you.hp = vorr::self_blood_cost();
    REQUIRE(vorr::invoke(ABIL_VORR_RED_PASSAGE, false, &destination) == spret::abort);
    REQUIRE(you.pos() == origin);
    REQUIRE(vorr::blood_at(origin) == 1);
    you.hp = you.hp_max;
    deposit(destination, 1);
    REQUIRE(vorr::invoke(ABIL_VORR_RED_PASSAGE, true, &destination) == spret::fail);
    REQUIRE(you.pos() == origin);
    REQUIRE(vorr::blood_at(origin) == 1);
    REQUIRE(vorr::blood_at(destination) == 1);
    auto preview = vorr::ability_targeter(ABIL_VORR_RED_PASSAGE);
    REQUIRE(preview->set_aim(destination));
    REQUIRE(preview->is_affected(destination) == AFF_LANDING);
}

TEST_CASE_METHOD(vorr_fixture, "Great Letting previews one affected result per target", "[vorr]")
{
    auto& mon = spawn(MONS_OGRE, coord_def(43, 35));
    const coord_def center(42, 35);
    deposit(coord_def(41, 35), 3);
    deposit(coord_def(42, 35), 3);
    deposit(coord_def(42, 36), 2);
    auto preview = vorr::ability_targeter(ABIL_VORR_GREAT_LETTING);
    REQUIRE(preview->set_aim(center));
    REQUIRE(preview->is_affected(mon.pos()) == AFF_YES);
    REQUIRE(vorr::invoke(ABIL_VORR_GREAT_LETTING, false, &center) == spret::success);
    REQUIRE(vorr::nearby_blood() == 0);
    REQUIRE(mon.hit_points < 1000);
    REQUIRE(mon.hit_points >= 970); // One 3d10 hit, not one hit per deposit.
}

TEST_CASE_METHOD(vorr_fixture, "Secondary death bursts stop after one phase and spare allies", "[vorr]")
{
    auto& first = spawn(MONS_OGRE, coord_def(42, 35));
    auto& second = spawn(MONS_GOBLIN, coord_def(43, 35)); // Zero AC keeps the damage assertion deterministic.
    auto& third = spawn(MONS_OGRE, coord_def(44, 35));
    auto& ally = spawn(MONS_OGRE, coord_def(42, 34));
    ally.base_attitude = ATT_FRIENDLY;
    first.hit_points = 0;
    vorr::on_kill(first, KILL_YOU, true, false);
    REQUIRE(first.props.exists("vorr_death_released"));
    fire_final_effects();
    REQUIRE(you.props.exists("vorr_burst_turn"));
    REQUIRE(second.hit_points < 1000);
    REQUIRE(third.hit_points == 1000);
    REQUIRE(ally.hit_points == 1000);
    second.hit_points = 0;
    vorr::on_kill(second, KILL_YOU, true, false);
    fire_final_effects();
    REQUIRE(third.hit_points == 1000);
}

TEST_CASE_METHOD(vorr_fixture, "Vorr endpoint checks preserve fuel on illegal relocation", "[vorr]")
{
    const coord_def destination(43, 35);
    deposit(you.pos(), 1);
    deposit(destination, 1);
    you.duration[DUR_BLINK_COOLDOWN] = 10;
    REQUIRE(vorr::invoke(ABIL_VORR_RED_PASSAGE, false, &destination) == spret::abort);
    you.duration[DUR_BLINK_COOLDOWN] = 0;
    spawn(MONS_OGRE, destination);
    REQUIRE(vorr::invoke(ABIL_VORR_RED_PASSAGE, false, &destination) == spret::abort);
    REQUIRE(you.pos() == coord_def(40, 35));
    REQUIRE(vorr::blood_at(destination) == 1);
    REQUIRE(vorr::blood_at(you.pos()) == 1);
}

TEST_CASE_METHOD(vorr_fixture, "Ritual blood follows the floor clock and penance", "[vorr]")
{
    party::set_multiplayer(true);
    env.elapsed_time = 100;
    deposit(you.pos(), 1);
    you.elapsed_time += 1000;
    REQUIRE(vorr::blood_at(you.pos()) == 1);
    you.penance[GOD_VORR] = 1;
    REQUIRE(vorr::regeneration_bonus() == 0);
    REQUIRE(vorr::nearby_blood() == 0);
    you.penance[GOD_VORR] = 0;
    env.elapsed_time += 120;
    REQUIRE(vorr::blood_at(you.pos()) == 0);
    party::set_multiplayer(false);
}

TEST_CASE_METHOD(vorr_fixture, "Communion excludes overkill and unrewarding targets", "[vorr]")
{
    auto& mon = spawn(MONS_OGRE, coord_def(42, 35));
    you.hp = 50;
    SECTION("Overkill cannot become removed HP")
    {
        mon.hit_points = 1;
        mon.hurt(&you, 1000, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
        REQUIRE(you.hp == 50);
        REQUIRE(you.props["vorr_heal_fraction"].get_int() == 8);
    }
    SECTION("Unrewarding foes supply neither blood nor life")
    {
        mon.flags |= MF_NO_REWARD;
        mon.hurt(&you, 600, BEAM_MMISSILE, KILLED_BY_BEAM, "", "", false);
        vorr::on_kill(mon, KILL_YOU, true, false);
        REQUIRE(you.hp == 50);
        REQUIRE(vorr::nearby_blood() == 0);
    }
}

TEST_CASE_METHOD(vorr_fixture, "Rupture target terrain is independent of fuel terrain", "[vorr]")
{
    auto& mon = spawn(MONS_OGRE, coord_def(42, 35));
    const coord_def target = mon.pos();
    env.grid(target) = DNGN_SHALLOW_WATER;
    invalidate_los();
    deposit(you.pos(), 2);
    REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, false, &target) == spret::success);
    REQUIRE(mon.hit_points < 1000);
    REQUIRE(vorr::nearby_blood() == 0);
}

TEST_CASE_METHOD(vorr_fixture, "Corpses replace blood once and ground blood is spent first", "[vorr]")
{
    const int body = corpse(you.pos());
    deposit(you.pos(), 1);
    const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
    REQUIRE(plan.hp == 0);
    REQUIRE(plan.corpses.size() == 1);
    REQUIRE(vorr::nearby_corpses() == 1);
    REQUIRE(vorr::commit_payment(plan));
    REQUIRE(vorr::nearby_blood() == 0);
    REQUIRE(vorr::nearby_corpses() == 0);
    REQUIRE_FALSE(env.item[body].defined());
    REQUIRE(you.hp == 100);
}

TEST_CASE_METHOD(vorr_fixture, "Sufficient fresh blood preserves corpses and health", "[vorr]")
{
    const int body = corpse(you.pos());
    deposit(you.pos(), 2);
    const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
    REQUIRE(plan.hp == 0);
    REQUIRE(plan.corpses.empty());
    REQUIRE(vorr::commit_payment(plan));
    REQUIRE(env.item[body].defined());
    REQUIRE(you.hp == 100);
}

TEST_CASE_METHOD(vorr_fixture, "Missing blood costs ten percent of maximum HP per unit", "[vorr]")
{
    SECTION("No external fuel")
    {
        const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
        REQUIRE(plan.missing == 2);
        REQUIRE(plan.hp == 20);
        REQUIRE(vorr::commit_payment(plan));
        REQUIRE(you.hp == 80);
        REQUIRE(vorr::nearby_blood() == 0);
    }
    SECTION("A corpse reduces the health payment")
    {
        corpse(you.pos());
        const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
        REQUIRE(plan.missing == 1);
        REQUIRE(plan.hp == 10);
        REQUIRE(vorr::commit_payment(plan));
        REQUIRE(you.hp == 90);
    }
    SECTION("Each unit rounds up independently")
    {
        you.hp_max = 101;
        you.hp = 101;
        const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
        REQUIRE(vorr::self_blood_cost() == 11);
        REQUIRE(plan.hp == 22);
        REQUIRE(vorr::commit_payment(plan));
        REQUIRE(you.hp == 79);
    }
}

TEST_CASE_METHOD(vorr_fixture, "Self-exsanguination requires blood and a survivable full payment", "[vorr]")
{
    corpse(you.pos());
    const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35));
    SECTION("Cannot kill its user") { you.hp = plan.hp; }
    SECTION("Death's Door cannot avoid the cost") { you.duration[DUR_DEATHS_DOOR] = 10; }
    SECTION("Bloodless worshippers need external fuel") { you.species = SP_GARGOYLE; }
    REQUIRE_FALSE(vorr::payment_reason(plan).empty());
    REQUIRE_FALSE(vorr::commit_payment(plan));
    REQUIRE(vorr::nearby_corpses() == 1);
}

TEST_CASE_METHOD(vorr_fixture, "Skeletons expired bodies and bloodless corpses cannot fuel rites", "[vorr]")
{
    const int index = corpse(you.pos());
    SECTION("Skeleton") { env.item[index].sub_type = CORPSE_SKELETON; }
    SECTION("Expired corpse") { env.item[index].freshness = 0; }
    SECTION("Bloodless corpse") { env.item[index].mon_type = MONS_STONE_GOLEM; }
    REQUIRE(vorr::nearby_corpses() == 0);
    REQUIRE(vorr::plan_payment(ABIL_VORR_RUPTURE, coord_def(42, 35)).hp == 20);
}

TEST_CASE_METHOD(vorr_fixture, "Every bloodless species rejects self-exsanguination without consuming corpses", "[vorr]")
{
    const int body = corpse(you.pos());
    const coord_def target(42, 35);
    spawn(MONS_OGRE, target);
    const int hp = you.hp;
    for (species_type species : species::get_all_species())
    {
        if (species::has_blood(species))
            continue;
        INFO("Species " << int(species));
        you.species = species;
        REQUIRE_FALSE(vorr::self_blood_available());
        const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, target);
        REQUIRE_FALSE(vorr::payment_reason(plan).empty());
        REQUIRE_FALSE(vorr::commit_payment(plan));
        REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, false, &target) == spret::abort);
        REQUIRE(vorr::cost_description(ABIL_VORR_RUPTURE).find("bloodless") != std::string::npos);
        REQUIRE(you.hp == hp);
        REQUIRE(env.item[body].defined());
    }
}

TEST_CASE_METHOD(vorr_fixture, "Bloodless forms cannot self-exsanguinate but external fuel still works", "[vorr]")
{
    SECTION("Bloodless body") { you.form = transformation::statue; }
    SECTION("Bloodless species") { you.species = SP_GARGOYLE; }
    REQUIRE_FALSE(vorr::self_blood_available());
    REQUIRE_FALSE(vorr::payment_reason(vorr::plan_payment(ABIL_VORR_RUPTURE, you.pos())).empty());
    corpse(you.pos());
    corpse(coord_def(41, 35));
    const int hp = you.hp;
    const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, you.pos());
    REQUIRE(plan.hp == 0);
    REQUIRE(vorr::payment_reason(plan).empty());
    REQUIRE(vorr::commit_payment(plan));
    REQUIRE(you.hp == hp);
    REQUIRE(vorr::nearby_corpses() == 0);
}

TEST_CASE_METHOD(vorr_fixture, "Failed rites and stale quotes preserve all remaining resources", "[vorr]")
{
    const int body = corpse(you.pos());
    const coord_def target(42, 35);
    spawn(MONS_OGRE, target);
    const auto plan = vorr::plan_payment(ABIL_VORR_RUPTURE, target);
    SECTION("Invocation fails before any payment")
    {
        REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, true, &target) == spret::fail);
        REQUIRE(env.item[body].defined());
    }
    SECTION("A quoted corpse has already been consumed")
    {
        destroy_item(body);
        REQUIRE_FALSE(vorr::commit_payment(plan));
    }
    SECTION("Changed maximum HP requires a fresh cost confirmation")
    {
        you.hp_max = 101;
        REQUIRE_FALSE(vorr::commit_payment(plan));
        REQUIRE(env.item[body].defined());
    }
    SECTION("An expired blood ledger cannot be replayed")
    {
        deposit(you.pos(), 1);
        const auto mixed = vorr::plan_payment(ABIL_VORR_RUPTURE, target);
        you.elapsed_time += 120;
        REQUIRE_FALSE(vorr::commit_payment(mixed));
        REQUIRE(env.item[body].defined());
    }
    SECTION("A duplicate corpse debit cannot consume a different body")
    {
        auto duplicate = plan;
        duplicate.corpses.push_back(duplicate.corpses.front());
        REQUIRE_FALSE(vorr::commit_payment(duplicate));
        REQUIRE(env.item[body].defined());
    }
    REQUIRE(you.hp == 100);
}

TEST_CASE_METHOD(vorr_fixture, "Red Passage can supply either endpoint with corpses or health", "[vorr]")
{
    const coord_def destination(43, 35);
    SECTION("Both endpoints supplied through self-exsanguination")
    {
        const auto plan = vorr::plan_payment(ABIL_VORR_RED_PASSAGE, destination);
        REQUIRE(plan.missing == 2);
        REQUIRE(plan.hp == 20);
    }
    SECTION("Two corpses require no health")
    {
        corpse(you.pos());
        corpse(destination);
        const auto plan = vorr::plan_payment(ABIL_VORR_RED_PASSAGE, destination);
        REQUIRE(plan.hp == 0);
        REQUIRE(plan.corpses.size() == 2);
        REQUIRE(vorr::commit_payment(plan));
        REQUIRE(vorr::nearby_corpses() == 0);
    }
    auto targeter = vorr::ability_targeter(ABIL_VORR_RED_PASSAGE);
    REQUIRE(targeter->set_aim(destination));
    REQUIRE(targeter->is_affected(destination) == AFF_LANDING);
    REQUIRE(you.pos() == coord_def(40, 35)); // A quote and preview do not move or pay.
    REQUIRE(you.hp == 100);
}

TEST_CASE_METHOD(vorr_fixture, "Great Letting creates a real area when health supplies all fuel", "[vorr]")
{
    const coord_def target(42, 35);
    auto preview = vorr::ability_targeter(ABIL_VORR_GREAT_LETTING);
    REQUIRE(preview->set_aim(target));
    REQUIRE(preview->is_affected(coord_def(43, 35)) == AFF_YES);
    REQUIRE(preview->is_affected(coord_def(44, 35)) == AFF_NO);
    const auto plan = vorr::plan_payment(ABIL_VORR_GREAT_LETTING, target);
    REQUIRE(plan.missing == 8);
    REQUIRE(plan.hp == 80);
    REQUIRE(vorr::commit_payment(plan));
    REQUIRE(you.hp == 20);
    REQUIRE(vorr::nearby_blood() == 0);
}

TEST_CASE_METHOD(vorr_fixture, "Native ability help exposes ranges damage and self-exsanguination", "[vorr]")
{
    unwind_var<std::string> data_directory(SysEnv.crawl_dir, ".");
    databaseSystemInit();
    unwinder close_databases([] { databaseSystemShutdown(); });
    for (ability_type ability : {ABIL_VORR_RUPTURE, ABIL_VORR_RED_PASSAGE, ABIL_VORR_GREAT_LETTING})
    {
        REQUIRE(ability_range(ability) == (ability == ABIL_VORR_RUPTURE ? 5 : 6));
        REQUIRE_FALSE(vorr::damage_description(ability).empty());
        const auto help = get_ability_desc(ability);
        REQUIRE(help.find("self-exsanguination") != std::string::npos);
        REQUIRE(help.find("maximum HP") != std::string::npos);
        REQUIRE(help.find("No description found") == std::string::npos);
    }
}

TEST_CASE_METHOD(vorr_fixture, "A real Rupture consumes a corpse and only the missing blood's HP", "[vorr]")
{
    const int body = corpse(you.pos());
    const coord_def target(42, 35);
    auto& mon = spawn(MONS_OGRE, target);
    you.raw_piety = 35; // Keep Communion healing separate from the payment assertion.
    REQUIRE(vorr::invoke(ABIL_VORR_RUPTURE, false, &target) == spret::success);
    REQUIRE_FALSE(env.item[body].defined());
    REQUIRE(you.hp == 90);
    REQUIRE(mon.hit_points < 1000);
}

TEST_CASE_METHOD(vorr_fixture, "Blood Communion speed follows visible finite blood without a cap", "[vorr]")
{
    REQUIRE(vorr::speed_bonus() == 0);
    corpse(you.pos());
    REQUIRE(vorr::speed_bonus() == 0);
    deposit(coord_def(45, 35), 3); // Beyond the four-cell radius.
    REQUIRE(vorr::speed_bonus() == 0);
    deposit(you.pos(), 3);
    REQUIRE(vorr::speed_bonus() == 6);
    REQUIRE(vorr::commit_payment(vorr::plan_payment(ABIL_VORR_RUPTURE, you.pos())));
    REQUIRE(vorr::speed_bonus() == 2);
    deposit(coord_def(40, 36), 3);
    deposit(coord_def(40, 37), 3);
    deposit(coord_def(40, 38), 3);
    REQUIRE(vorr::speed_bonus() == 20);
    deposit(coord_def(41, 35), 3);
    REQUIRE(vorr::speed_bonus() == 26);
    you.penance[GOD_VORR] = 1;
    REQUIRE(vorr::speed_bonus() == 0);
    you.penance[GOD_VORR] = 0;
    you.raw_piety = piety_breakpoint(2) - 1;
    REQUIRE(vorr::speed_bonus() == 0);
    you.raw_piety = 200;
    you.elapsed_time += 120;
    REQUIRE(vorr::speed_bonus() == 0);
}

TEST_CASE_METHOD(vorr_fixture, "The native attack-delay path scales weapons and unarmed but not throwing", "[vorr]")
{
    item_def weapon;
    weapon.base_type = OBJ_WEAPONS;
    weapon.sub_type = WPN_FALCHION;
    weapon.quantity = 1;
    SECTION("Unarmed") { weapon.clear(); }
    SECTION("Melee weapon") { }
    SECTION("Ranged weapon") { weapon.sub_type = WPN_SHORTBOW; }
    SECTION("Thrown missile") { weapon.base_type = OBJ_MISSILES; weapon.sub_type = MI_BOOMERANG; }
    const item_def* item = weapon.defined() ? &weapon : nullptr;
    const auto ordinary = you.attack_delay_with(item, false).expected();
    deposit(you.pos(), 3);
    deposit(coord_def(40, 36), 3);
    deposit(coord_def(40, 37), 3);
    deposit(coord_def(40, 38), 1);
    const double factor = item && item->base_type == OBJ_MISSILES ? 1.0 : 100.0 / 120.0;
    REQUIRE(you.attack_delay_with(item, false).expected() == Catch::Approx(ordinary * factor));
    REQUIRE(you.attack_delay_with(item, false, false).expected() == Catch::Approx(ordinary));
}

TEST_CASE_METHOD(vorr_fixture, "Three-star blood speed scales native movement below its ordinary minimum", "[vorr]")
{
    const int scale = 600;
    const int ordinary = player_movement_speed(false, true, scale);
    const int generic = player_speed(scale);
    const double attack = you.attack_delay_with(nullptr, false).expected();
    for (int x = 38; x <= 42; ++x)
        for (int y = 33; y <= 37; ++y)
            deposit(coord_def(x, y), 3);
    REQUIRE(vorr::nearby_blood() == 75);
    REQUIRE(vorr::speed_bonus() == 150);
    REQUIRE(player_movement_speed(false, true, scale) == ordinary * 2 / 5);
    REQUIRE(you.attack_delay_with(nullptr, false).expected() == Catch::Approx(attack * 2 / 5));
    REQUIRE(player_movement_speed(false, false, scale) == ordinary);
    REQUIRE(player_speed(scale) == generic); // Casting and other general actions stay unchanged.
    you.raw_piety = piety_breakpoint(2) - 1;
    REQUIRE(player_movement_speed(false, true, scale) == ordinary);
    you.raw_piety = piety_breakpoint(2);
    REQUIRE(player_movement_speed(false, true, scale) == ordinary * 2 / 5);
    you.penance[GOD_VORR] = 1;
    REQUIRE(player_movement_speed(false, true, scale) == ordinary);
    you.penance[GOD_VORR] = 0;
    you.religion = GOD_NO_GOD;
    REQUIRE(player_movement_speed(false, true, scale) == ordinary);
}

TEST_CASE_METHOD(vorr_fixture, "Maximum blood density and haste retain positive movement time", "[vorr]")
{
    for (int x = 36; x <= 44; ++x)
        for (int y = 31; y <= 39; ++y)
            deposit(coord_def(x, y), 3);
    REQUIRE(vorr::speed_bonus() == 486);
    you.duration[DUR_HASTE] = 10;
    you.duration[DUR_SWIFTNESS] = 10;
    REQUIRE(player_movement_speed(false, true, 600) > 0);
    REQUIRE(player_overall_move_delay(600, false, true, false) >= 600);
}
