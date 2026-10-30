#include "test_vellum_fixture.h"
#include "ability.h"
#include "act-iter.h"
#include "branch.h"
#include "actor-displacement.h"
#include "bloodcraft.h"
#include "chain-devil.h"
#include "dungeon.h"
#include "eldritch.h"
#include "level-time.h"
#include "level-id.h"
#include "losglobal.h"
#include "mon-util.h"
#include "mon-death.h"
#include "mutation.h"
#include "ng-restr.h"
#include "species.h"
#include "status.h"
#include "store.h"
#include "tags.h"
#include "target.h"
#include "terrain.h"
#include "transform.h"

namespace
{
struct content_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    content_fixture()
    {
        static const bool ready = []() { init_duration_index(); return true; }();
        (void)ready;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_CHAIN_DEVIL;
        you.religion = GOD_NO_GOD;
        you.raw_piety = 0;
        you.experience_level = 15;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.form = you.default_form = transformation::none;
        invalidate_los();
    }
    ~content_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
    monster& spawn(coord_def cell)
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 30001;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(cell);
        env.mgrid(cell) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }
    void steal(god_type god)
    {
        you.species = SP_ELDRITCH;
        env.grid(you.pos()) = altar_for_god(god);
        REQUIRE(eldritch::profane(false, SK_FIGHTING) == spret::success);
        CHECK(you.religion == GOD_NO_GOD);
    }
};
}

TEST_CASE("Both new species preserve native roster and demonic eligibility", "[new-species]")
{
    CHECK(species::is_starting_species(SP_CHAIN_DEVIL));
    CHECK(species::is_starting_species(SP_ELDRITCH));
    CHECK(species::is_demonic(SP_CHAIN_DEVIL));
    CHECK(species::is_demonic(SP_DEMONSPAWN));
    CHECK_FALSE(species::is_demonic(SP_ELDRITCH));
    CHECK(species_allowed(JOB_PALADIN, SP_CHAIN_DEVIL) == CC_BANNED);
    CHECK(species_allowed(JOB_BERSERKER, SP_ELDRITCH) == CC_BANNED);
    CHECK(species_allowed(JOB_FIGHTER, SP_CHAIN_DEVIL) != CC_BANNED);
    CHECK(species_allowed(JOB_CONJURER, SP_ELDRITCH) != CC_BANNED);
}

TEST_CASE_METHOD(content_fixture, "A living chain limits movement without becoming constriction", "[new-species][chains]")
{
    monster& target = spawn(you.pos() + coord_def(3, 0));
    REQUIRE(chains::attach(target));
    CHECK_FALSE(target.is_constricted());
    CHECK(chains::may_step(target, you.pos() + coord_def(2, 0)));
    CHECK_FALSE(chains::may_step(target, you.pos() + coord_def(4, 0)));
    CHECK_FALSE(chains::attachment_eligible(target));
    const auto& row = target.props["living_chain"].get_table();
    CHECK(row["radius"].get_int() == 3);
    chains::release(you);
    CHECK_FALSE(chains::held(target));
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 50);
    CHECK(bloodcraft::binding_recovery(target));
    CHECK_FALSE(chains::attach(target));
}

TEST_CASE_METHOD(content_fixture, "Chain Lash reaches four tiles and rejects the fifth", "[new-species][chains]")
{
    CHECK(ability_range(ABIL_CHAIN_LASH) == 4);
    const coord_def direction = GENERATE(coord_def(1, 0), coord_def(1, 1));
    monster& target = spawn(you.pos() + direction * 5);
    CHECK_FALSE(chains::attach(target));
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 0);
    env.mgrid(target.pos()) = NON_MONSTER;
    target.set_position(you.pos() + direction * 4);
    env.mgrid(target.pos()) = 0;
    REQUIRE(chains::attach(target));
    CHECK(chains::snapshot().radius == 4);
    CHECK(chains::may_step(target, you.pos() + direction * 4));
    CHECK_FALSE(chains::may_step(target, you.pos() + direction * 5));
}

TEST_CASE_METHOD(content_fixture, "Living chains retain the doubled lifetime at every XL tier", "[new-species][chains]")
{
    const auto tier = GENERATE(std::make_pair(1, 80), std::make_pair(6, 80),
        std::make_pair(7, 120), std::make_pair(12, 120), std::make_pair(13, 160),
        std::make_pair(27, 160));
    you.experience_level = tier.first;
    monster& target = spawn(you.pos() + coord_def(4, 0));
    REQUIRE(chains::attach(target));
    CHECK(target.props["living_chain"].get_table()["expires"].get_int()
        == level_elapsed_time(target) + tier.second);
    you.elapsed_time += tier.second - 1;
    CHECK(chains::held(target));
    ++you.elapsed_time;
    CHECK_FALSE(chains::held(target));
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 50);
}

TEST_CASE_METHOD(content_fixture, "Reel from four tiles still pulls only two cells", "[new-species][chains]")
{
    monster& target = spawn(you.pos() + coord_def(4, 0));
    REQUIRE(chains::attach(target));
    REQUIRE(chains::invoke(ABIL_REEL_IN) == spret::success);
    CHECK(target.pos() == you.pos() + coord_def(2, 0));
    CHECK_FALSE(chains::held(target));
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 50);
}

TEST_CASE_METHOD(content_fixture, "Reel follows consecutive physical cells and consumes the tether once", "[new-species][chains]")
{
    monster& target = spawn(you.pos() + coord_def(3, 0));
    REQUIRE(chains::attach(target));
    const auto path = physical_pull_path(target, you.pos(), 2);
    REQUIRE(path.size() == 2);
    CHECK(path.back() == you.pos() + coord_def(1, 0));
    REQUIRE(chains::invoke(ABIL_REEL_IN) == spret::success);
    CHECK(target.pos() == you.pos() + coord_def(1, 0));
    CHECK_FALSE(chains::held(target));
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 50);
    CHECK(chains::invoke(ABIL_REEL_IN) == spret::abort);
}

TEST_CASE_METHOD(content_fixture, "A blocked Reel preserves the original hold and spends no action", "[new-species][chains]")
{
    monster& target = spawn(you.pos() + coord_def(3, 0));
    REQUIRE(chains::attach(target));
    env.grid(you.pos() + coord_def(2, 0)) = DNGN_ROCK_WALL;
    invalidate_los();
    // Lost physical sight breaks a chain; the recovery cannot be reset by a
    // rejected follow-up. Direct geometry never skips the intervening wall.
    CHECK(physical_pull_path(target, you.pos(), 2).empty());
    CHECK(chains::invoke(ABIL_REEL_IN) == spret::abort);
    CHECK(you.duration[DUR_CHAIN_RECOVERY] == 50);
}

TEST_CASE_METHOD(content_fixture, "Pin replaces one tether without refreshing its lifetime", "[new-species][chains]")
{
    monster& target = spawn(you.pos() + coord_def(3, 0));
    REQUIRE(chains::attach(target));
    REQUIRE(chains::invoke(ABIL_PINNING_CHAIN) == spret::success);
    CHECK(chains::may_step(target, target.pos() + coord_def(1, 0)));
    CHECK_FALSE(chains::may_step(target, target.pos() + coord_def(2, 0)));
    CHECK_FALSE(chains::reason(ABIL_PINNING_CHAIN).empty());
    const int before = target.props["living_chain"].get_table()["expires"].get_int();
    REQUIRE(chains::strain(target));
    CHECK(target.props["living_chain"].get_table()["expires"].get_int() == before - 10);
}

TEST_CASE_METHOD(content_fixture, "Pin doubles its cap without extending a shortened tether", "[new-species][chains]")
{
    const int remaining = GENERATE(20, 60, 80, 160);
    monster& target = spawn(you.pos() + coord_def(4, 0));
    REQUIRE(chains::attach(target));
    target.props["living_chain"].get_table()["expires"] = level_elapsed_time(target) + remaining;
    REQUIRE(chains::invoke(ABIL_PINNING_CHAIN) == spret::success);
    CHECK(target.props["living_chain"].get_table()["expires"].get_int()
        == level_elapsed_time(target) + min(80, remaining));
    CHECK(chains::snapshot().pinned);
    CHECK(chains::snapshot().anchor == target.pos());
    CHECK(chains::snapshot().radius == 1);
}

TEST_CASE("Eldritch policies cover every concrete god exactly once", "[new-species][eldritch]")
{
    std::set<god_type> gods;
    std::set<ability_type> abilities;
    for (const auto& row : eldritch::powers())
    {
        CHECK(gods.insert(row.god).second);
        CHECK(abilities.insert(eldritch::ability(row.god)).second);
        CHECK(eldritch::god_for_ability(eldritch::ability(row.god)) == row.god);
        CHECK_FALSE(is_religious_ability(eldritch::ability(row.god)));
        CHECK(row.defiance <= 100);
        CHECK(std::string(row.benefit).size() > 0);
        CHECK(std::string(row.punishment).size() > 0);
    }
    CHECK(gods.size() == NUM_GODS - 1);
    CHECK_FALSE(eldritch::policy(GOD_ECUMENICAL));
}

TEST_CASE_METHOD(content_fixture, "Profanation choices are permanent, capped and do not refill Defiance", "[new-species][eldritch]")
{
    steal(GOD_ZIN);
    CHECK(eldritch::reserve(you) == 40);
    CHECK(eldritch::profane(false) == spret::abort);
    REQUIRE(eldritch::spend(10));
    steal(GOD_MAKHLEB);
    CHECK(eldritch::reserve(you) == 30);
    steal(GOD_VEHUMET);
    CHECK(eldritch::reserve(you) == 30);
    env.grid(you.pos()) = altar_for_god(GOD_TROG);
    CHECK(eldritch::profane(false) == spret::abort);
    CHECK_FALSE(eldritch::has(GOD_TROG));
    CHECK(eldritch::wrath_remaining(you, GOD_MAKHLEB) > eldritch::wrath_remaining(you, GOD_ZIN));
}

TEST_CASE_METHOD(content_fixture, "Combat XP restores the shared reserve and reduces every outstanding wrath", "[new-species][eldritch]")
{
    steal(GOD_ZIN);
    steal(GOD_MAKHLEB);
    REQUIRE(eldritch::spend(40));
    const int old_wrath = eldritch::wrath_remaining(you, GOD_ZIN);
    eldritch::recover(500);
    CHECK(eldritch::reserve(you) > 0);
    CHECK(eldritch::wrath_remaining(you, GOD_ZIN) == old_wrath - 500);
    const int reserve = eldritch::reserve(you);
    eldritch::recover(0);
    CHECK(eldritch::reserve(you) == reserve);
}

TEST_CASE_METHOD(content_fixture, "A stolen shield pays Defiance while ordinary worship remains godless", "[new-species][eldritch]")
{
    steal(GOD_SHINING_ONE);
    REQUIRE(eldritch::invoke(eldritch::ability(GOD_SHINING_ONE)) == spret::success);
    CHECK(eldritch::reserve(you) == 32);
    CHECK(eldritch::shield_bonus(you) == 3);
    CHECK(player_displayed_shield_class(1, true) >= 3);
    CHECK(you.religion == GOD_NO_GOD);
    you.props["eldritch_rites"] = 3;
    CHECK(eldritch::shield_bonus(you) == 6);
}

TEST_CASE_METHOD(content_fixture, "Eldritch choices, reserve and rites survive native property serialization", "[new-species][eldritch]")
{
    steal(GOD_ASHENZARI);
    steal(GOD_KIKUBAAQUDGHA);
    you.props["eldritch_rites"] = 2;
    REQUIRE(eldritch::spend(17));
    std::vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    CrawlHashTable restored;
    restored.read(input);
    you.props = restored;
    CHECK(eldritch::rank() == 2);
    CHECK(eldritch::reserve(you) == 23);
    CHECK(eldritch::torment_reduction() == 40);
    CHECK(eldritch::skill_bonus(you, SK_FIGHTING, true) == 3);
    CHECK(you.religion == GOD_NO_GOD);
}

TEST_CASE_METHOD(content_fixture, "Borrowed Thread uses one conserved Vellum ledger with Defiance funding", "[new-species][eldritch][vellum]")
{
    steal(GOD_VELLUM);
    carry(0);
    carry(1);
    auto request = transfer(0, 1, ARTP_FIRE, 1);
    const auto quote = vellum::preview(request);
    INFO(quote.blocked);
    REQUIRE(quote.blocked.empty());
    CHECK(quote.cost == 0);
    CHECK(quote.defiance_cost == 20);
    REQUIRE(vellum::commit(quote));
    CHECK(eldritch::reserve(you) == 20);
    CHECK(native_artefact_property(you.inv[0], ARTP_FIRE) == 0);
    CHECK(vellum::load(you).threads.size() == 1);
    carry(2);
    CHECK_FALSE(vellum::preview(transfer(2, 1, ARTP_COLD, 1)).blocked.empty());
}

TEST_CASE_METHOD(content_fixture, "Every active Echo rejects an empty shared reserve before targeting or materials", "[new-species][eldritch]")
{
    you.species = SP_ELDRITCH;
    for (const auto& row : eldritch::powers())
        if (!row.passive)
        {
            CAPTURE(row.name);
            auto& choices = you.props["eldritch_choices"].new_vector(SV_HASH);
            CrawlHashTable choice;
            choice["god"] = static_cast<int>(row.god);
            choice["wrath"] = 0;
            choices.push_back(CrawlStoreValue(choice));
            you.props["eldritch_defiance"] = 0;
            CHECK(eldritch::invoke(eldritch::ability(row.god)) == spret::abort);
            CHECK(eldritch::reserve(you) == 0);
            CHECK(you.religion == GOD_NO_GOD);
        }
}

TEST_CASE_METHOD(content_fixture, "Elder Rites require both scheduled waves and grant no kill resources", "[new-species][eldritch][elder-rites]")
{
    steal(GOD_ZIN);
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(eldritch::start_rite() == spret::success);
    CHECK(eldritch::rite_active());
    int count = 0;
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists("elder_rite_actor"))
        {
            CHECK(mon->is_unrewarding());
            CHECK((mon->flags & MF_HARD_RESET));
            ++count;
        }
    CHECK(count == 2);
    you.elapsed_time += 40;
    eldritch::rite_tick();
    std::vector<mid_t> actors;
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists("elder_rite_actor"))
            actors.push_back(mon->mid);
    REQUIRE(actors.size() == 4);
    const auto xp = you.experience_pool;
    for (mid_t id : actors)
        if (monster* mon = monster_by_mid(id))
            monster_die(*mon, KILL_YOU, NON_MONSTER, true);
    eldritch::rite_tick();
    CHECK(eldritch::rank() == 1);
    CHECK_FALSE(eldritch::rite_active());
    CHECK(you.experience_pool == xp);
    CHECK(eldritch::reserve(you) == 40);
    CHECK_FALSE(eldritch::party_rite_active());
}

TEST_CASE_METHOD(content_fixture, "A saved off-floor rite prevents a second party attempt", "[new-species][eldritch][elder-rites]")
{
    steal(GOD_ZIN);
    env.grid(you.pos()) = DNGN_FLOOR;
    you.props["eldritch_rite_active"] = true;
    CHECK_FALSE(eldritch::rite_active());
    CHECK(eldritch::party_rite_active());
    CHECK(eldritch::start_rite() == spret::abort);
    you.props.erase("eldritch_rite_active");
    CHECK_FALSE(eldritch::party_rite_active());
}

TEST_CASE_METHOD(content_fixture, "Forced rescue abandons the old floor without trapping party rites", "[new-species][eldritch][elder-rites]")
{
    steal(GOD_ZIN);
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(eldritch::start_rite() == spret::success);
    const int depth = you.depth;
    ++you.depth; // Native co-op rescue can relocate a downed hero without stairs.
    CHECK_FALSE(eldritch::party_rite_active());
    CHECK_FALSE(eldritch::rite_active());
    CHECK_FALSE(you.props.exists("eldritch_rite_active"));
    CHECK(eldritch::rank() == 0);
    you.depth = depth;
}

TEST_CASE_METHOD(content_fixture, "Old-floor trial cleanup preserves a newer floor's owner marker", "[new-species][eldritch][elder-rites]")
{
    steal(GOD_ZIN);
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(eldritch::start_rite() == spret::success);
    const int depth = you.depth;
    ++you.depth;
    you.props["eldritch_rite_floor"] = level_id(you.where_are_you, you.depth).describe();
    eldritch::rite_tick();
    CHECK_FALSE(eldritch::rite_active());
    CHECK(you.props.exists("eldritch_rite_active"));
    CHECK(eldritch::party_rite_active());
    you.props.erase("eldritch_rite_active");
    you.props.erase("eldritch_rite_floor");
    you.depth = depth;
}

TEST_CASE_METHOD(content_fixture, "Resetting a trial actor cannot counterfeit an Elder Rite victory", "[new-species][eldritch][elder-rites]")
{
    steal(GOD_ZIN);
    env.grid(you.pos()) = DNGN_FLOOR;
    REQUIRE(eldritch::start_rite() == spret::success);
    std::vector<mid_t> actors;
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists("elder_rite_actor"))
            actors.push_back(mon->mid);
    REQUIRE(actors.size() == 2);
    for (mid_t id : actors)
        if (monster* mon = monster_by_mid(id))
            monster_die(*mon, KILL_RESET, NON_MONSTER, true);
    you.elapsed_time += 40;
    eldritch::rite_tick();
    actors.clear();
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists("elder_rite_actor"))
            actors.push_back(mon->mid);
    for (mid_t id : actors)
        if (monster* mon = monster_by_mid(id))
            monster_die(*mon, KILL_YOU, NON_MONSTER, true);
    eldritch::rite_tick();
    CHECK(eldritch::rank() == 0);
    CHECK(eldritch::rite_active());
    // A co-op helper leaving is not the invoking hero abandoning the trial.
    const int owner = static_cast<int>(you.mid);
    env.properties["eldritch_rite"].get_table()["owner"] = owner + 1;
    eldritch::leave_floor();
    CHECK(eldritch::rite_active());
    env.properties["eldritch_rite"].get_table()["owner"] = owner;
    eldritch::leave_floor();
    CHECK_FALSE(eldritch::rite_active());
    CHECK(eldritch::has(GOD_ZIN));
}
