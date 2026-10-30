#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "automaton.h"
#include "ability.h"
#include "act-iter.h"
#include "beam.h"
#include "cloud.h"
#include "colour.h"
#include "delay.h"
#include "describe.h"
#include "dungeon.h"
#include "env.h"
#include "fight.h"
#include "fineff.h"
#include "level-state-type.h"
#include "losglobal.h"
#include "mapmark.h"
#include "mon-act.h"
#include "mon-util.h"
#include "mon-death.h"
#include "monster.h"
#include "mutation.h"
#include "ng-restr.h"
#include "ouch.h"
#include "options.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "skills.h"
#include "species.h"
#include "spl-book.h"
#include "spl-cast.h"
#include "spl-clouds.h"
#include "spl-damage.h"
#include "spl-other.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "status.h"
#include "stringutil.h"
#include "tags.h"
#include "target.h"
#include "terrain.h"
#include "timed-effects.h"
#include "unwind.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

namespace
{
struct engraving_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    use_animations_type old_animations = Options.use_animations;
    engraving_fixture()
    {
        // Headless Catch2 fixtures do not initialize a terminal for beam drawing.
        Options.use_animations &= ~UA_BEAM;
        init_monsters();
        if (str_to_colour("fire", -1, false, true) == -1)
            init_element_colours();
        init_zap_index();
        init_spell_descs();
        init_spell_name_cache();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.species = SP_AUTOMATON;
        you.religion = GOD_NO_GOD;
        you.experience_level = 15;
        you.base_stats[STAT_INT] = 40;
        set_skill_level(SK_SPELLCASTING, 20, true);
        set_skill_level(SK_CONJURATIONS, 20, true);
        set_skill_level(SK_HEXES, 20, true);
        set_skill_level(SK_EARTH_MAGIC, 20, true);
        set_skill_level(SK_ALCHEMY, 20, true);
        set_skill_level(SK_ICE_MAGIC, 20, true);
        set_skill_level(SK_AIR_MAGIC, 20, true);
        set_skill_level(SK_FIRE_MAGIC, 20, true);
        set_skill_level(SK_SUMMONINGS, 20, true);
        set_skill_level(SK_FORGECRAFT, 20, true);
        set_skill_level(SK_TRANSLOCATIONS, 20, true);
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.max_magic_points = you.magic_points = 20;
        you.elapsed_time = 100;
        invalidate_los();
    }
    ~engraving_fixture()
    {
        Options.use_animations = old_animations;
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
    monster& spawn(int index, const coord_def& pos, mon_attitude_type attitude)
    {
        monster& mon = env.mons[index];
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 40001 + index;
        mon.hit_points = mon.max_hit_points = 1000;
        mon.set_hit_dice(1);
        mon.base_attitude = attitude;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(pos);
        env.mgrid(pos) = index;
        env.mid_cache[mon.mid] = index;
        env.max_mon_index = max(env.max_mon_index, index);
        return mon;
    }
};
}

TEST_CASE("Automaton is a selectable species with supported caster starts", "[automaton]")
{
    REQUIRE(species::is_starting_species(SP_AUTOMATON));
    for (const job_type job : {JOB_HEDGE_WIZARD, JOB_CONJURER,
                               JOB_FIRE_ELEMENTALIST, JOB_ICE_ELEMENTALIST,
                               JOB_AIR_ELEMENTALIST, JOB_EARTH_ELEMENTALIST,
                               JOB_SUMMONER})
    {
        CAPTURE(job);
        CHECK(species::recommends_job(SP_AUTOMATON, job));
        CHECK(job_allowed(SP_AUTOMATON, job) == CC_UNRESTRICTED);
        CHECK(species_allowed(job, SP_AUTOMATON) != CC_BANNED);
    }
    CHECK(job_allowed(SP_AUTOMATON, JOB_FORGEWRIGHT) != CC_BANNED);
    CHECK(species_allowed(JOB_FORGEWRIGHT, SP_AUTOMATON) != CC_BANNED);
}

TEST_CASE_METHOD(engraving_fixture, "Automaton guidance describes the available trigger", "[automaton]")
{
    CHECK(automaton::engraving_guidance(SPELL_FOXFIRE).find("attack") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_BLINK).find("badly hurt") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_CALL_IMP).find("summon") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_IGNITE_POISON).find("attack") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_INTOXICATE).find("attack") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_PASSWALL).find("interrupted") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_SEARING_RAY).find("without starting a channel") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_CLOCKWORK_BEE).find("three normal-speed turns") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_SUMMON_FOREST).find("no automatic") != string::npos);
    CHECK(automaton::engraving_guidance(SPELL_DRAGON_CALL).find("call is ready") != string::npos);
}

TEST_CASE_METHOD(engraving_fixture, "Automaton support agrees with its spell guidance", "[automaton]")
{
    for (const spell_type spell : {SPELL_FOXFIRE, SPELL_BLINK, SPELL_PASSWALL,
                                   SPELL_DRAGON_CALL, SPELL_IGNITE_POISON,
                                   SPELL_OLGREBS_TOXIC_RADIANCE, SPELL_NOXIOUS_BOG,
                                   SPELL_SEARING_RAY, SPELL_CLOCKWORK_BEE,
                                   SPELL_SPIKE_LAUNCHER, SPELL_WALKING_ALEMBIC})
        CHECK(automaton::has_automatic_trigger(spell));
    for (const spell_type spell : {SPELL_SUMMON_FOREST, SPELL_MALIGN_GATEWAY,
                                   SPELL_NO_SPELL})
        CHECK_FALSE(automaton::has_automatic_trigger(spell));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic Phalanx Beetle preserves each owner's defender",
                 "[automaton][automaton-phalanx]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_PHALANX_BEETLE;
    you.spell_no = 1;
    CHECK(automaton::has_automatic_trigger(SPELL_PHALANX_BEETLE));
    CHECK(automaton::engraving_guidance(SPELL_PHALANX_BEETLE).find("without replacing")
          != string::npos);

    SECTION("attack creates one friendly defender")
    {
        REQUIRE(automaton::summon_attack_engraving_ready(SPELL_PHALANX_BEETLE));
        const int before = you.magic_points;
        REQUIRE(automaton::trigger_attack(target));
        CHECK(you.magic_points == before - spell_mana(SPELL_PHALANX_BEETLE));
        CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
        CHECK_FALSE(automaton::summon_attack_engraving_ready(SPELL_PHALANX_BEETLE));
    }
    SECTION("a hazardous aura blocks automatic summoning")
    {
        you.duration[DUR_VORTEX] = 10;
        CHECK_FALSE(automaton::summon_attack_engraving_ready(SPELL_PHALANX_BEETLE));
        CHECK_FALSE(automaton::trigger_attack(target));
    }
    SECTION("another hero's beetle does not occupy this owner's slot")
    {
        const coord_def leader = you.pos();
        party::set_player_count(2);
        party::set_multiplayer(true);
        player& other = party::get_player(1);
        other = you;
        other.mid = party::mid_for_slot(1);
        other.save = nullptr;
        other.set_position(leader + coord_def(-3, 0));
        {
            party::scoped_player_context context(1, true);
            REQUIRE(cast_phalanx_beetle(you, 100, false) == spret::success);
            REQUIRE(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
        }
        CHECK(party::active_slot() == 0);
        CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 0);
        CHECK(automaton::summon_attack_engraving_ready(SPELL_PHALANX_BEETLE));
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic Walking Alembic is summoned once and explains its fumes",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_WALKING_ALEMBIC;
    you.spell_no = 1;
    CHECK(automaton::has_automatic_trigger(SPELL_WALKING_ALEMBIC));
    CHECK(automaton::engraving_guidance(SPELL_WALKING_ALEMBIC).find("fumes disperse") != string::npos);
    REQUIRE(automaton::summon_attack_engraving_ready(SPELL_WALKING_ALEMBIC));
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_WALKING_ALEMBIC));
    monster* alembic = nullptr;
    for (monster_iterator mi; mi; ++mi)
        if (mi->was_created_by(you, SPELL_WALKING_ALEMBIC))
            alembic = &**mi;
    REQUIRE(alembic);
    CHECK(alembic->props.exists(AUTOMATON_ALEMBIC_KEY));
    CHECK(alembic->props[AUTOMATON_ALEMBIC_KEY].get_bool());
    CHECK_FALSE(automaton::summon_attack_engraving_ready(SPELL_WALKING_ALEMBIC));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic Alembic fumes disperse under protected creatures",
                 "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    monster& source = spawn(0, you.pos() + coord_def(2, 0), ATT_FRIENDLY);
    source.type = MONS_WALKING_ALEMBIC;
    source.props[AUTOMATON_ALEMBIC_KEY].get_bool() = true;
    REQUIRE(place_cloud(CLOUD_POISON, cell, 10, &source, 0,
                        -1, true, true));
    cloud_struct* cloud = cloud_at(cell);
    REQUIRE(cloud);
    CHECK(cloud->temporary());
    CHECK(cloud->exclusion_radius() == -1);
    SECTION("A friendly creature")
    {
        monster& ally = spawn(1, cell, ATT_FRIENDLY);
        actor_apply_cloud(&ally);
        CHECK_FALSE(cloud_at(cell));
        CHECK(ally.hit_points == ally.max_hit_points);
    }
    SECTION("A neutral creature")
    {
        monster& neutral = spawn(1, cell, ATT_NEUTRAL);
        actor_apply_cloud(&neutral);
        CHECK_FALSE(cloud_at(cell));
        CHECK(neutral.hit_points == neutral.max_hit_points);
    }
    SECTION("A hostile creature still encounters the fumes")
    {
        monster& foe = spawn(1, cell, ATT_HOSTILE);
        CHECK_FALSE(cloud_dissipates_for(*cloud, foe));
        actor_apply_cloud(&foe);
        CHECK(cloud_at(cell));
    }
    SECTION("Protection remains after the cloud becomes fire")
    {
        cloud->type = CLOUD_FIRE;
        monster& ally = spawn(1, cell, ATT_FRIENDLY);
        actor_apply_cloud(&ally);
        CHECK_FALSE(cloud_at(cell));
        CHECK(ally.hit_points == ally.max_hit_points);
    }
    SECTION("Manual fumes remain ordinary")
    {
        cloud->protected_nonhostiles = false;
        monster& ally = spawn(1, cell, ATT_FRIENDLY);
        CHECK_FALSE(cloud_dissipates_for(*cloud, ally));
        actor_apply_cloud(&ally);
        CHECK(cloud_at(cell));
    }
}

TEST_CASE_METHOD(engraving_fixture, "Alembic melee gives only automatic fumes the protective flag",
                 "[automaton]")
{
    monster& foe = spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    monster& alembic = spawn(1, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    alembic.type = MONS_WALKING_ALEMBIC;
    alembic.number = 30;
    bool automatic = false;
    SECTION("Automatic summon")
    {
        automatic = true;
        alembic.props[AUTOMATON_ALEMBIC_KEY].get_bool() = true;
    }
    SECTION("Manual summon") {}
    rng::seed(8128);
    for (int i = 0; i < 20 && !cloud_at(foe.pos()); ++i)
        mons_fight(&alembic, &foe, nullptr, false);
    const cloud_struct* cloud = cloud_at(foe.pos());
    REQUIRE(cloud);
    CHECK(cloud->source == alembic.mid);
    CHECK(cloud->protects_nonhostiles() == automatic);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic fumes remain safe after the source dies",
                 "[automaton]")
{
    monster& source = spawn(0, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    source.type = MONS_WALKING_ALEMBIC;
    source.props[AUTOMATON_ALEMBIC_KEY].get_bool() = true;
    REQUIRE(place_cloud(CLOUD_POISON, you.pos(), 10, &source, 0,
                        -1, true, true));
    const mid_t source_mid = source.mid;
    monster_die(source, KILL_RESET, NON_MONSTER, true);
    REQUIRE(cloud_at(you.pos()));
    CHECK(cloud_at(you.pos())->source == source_mid);
    actor_apply_cloud(&you);
    CHECK_FALSE(cloud_at(you.pos()));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic fumes protect party proxies and scoped players",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(1, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    REQUIRE(place_cloud(CLOUD_POISON, other.pos(), 10, &you, 0,
                        -1, true, true));
    monster* proxy = party::get_proxy_monster(1);
    REQUIRE(proxy);
    actor_apply_cloud(proxy);
    CHECK_FALSE(cloud_at(other.pos()));
    {
        party::scoped_player_context ctx(1);
        REQUIRE(place_cloud(CLOUD_POISON, leader, 10, &you, 0,
                            -1, true, true));
        actor_apply_cloud(&party::get_player(0));
        CHECK_FALSE(cloud_at(leader));
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic fume safety survives spread and versioned serialization",
                 "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    REQUIRE(place_cloud(CLOUD_POISON, cell, 20, &you, 100,
                        -1, true, true));
    vector<unsigned char> bytes;
    writer output(&bytes);
    marshallInt(output, cloud_at(cell)->excl_rad); // The level tag's existing field encoding.
    marshallBoolean(output, cloud_at(cell)->protected_nonhostiles);
    reader input(bytes, TAG_MINOR_VERSION);
    cloud_struct restored;
    restored.excl_rad = unmarshallInt(input);
    restored.protected_nonhostiles = unmarshall_cloud_protection(input);
    CHECK(restored.protects_nonhostiles());
    CHECK(restored.temporary());
    CHECK(restored.exclusion_radius() == -1);
    you.time_taken = BASELINE_DELAY;
    rng::seed(8128);
    manage_clouds();
    int spread = 0;
    for (adjacent_iterator ai(cell); ai; ++ai)
        if (const cloud_struct* cloud = cloud_at(*ai))
        {
            ++spread;
            CHECK(cloud->protects_nonhostiles());
            CHECK(cloud->temporary());
        }
    CHECK(spread > 0);
}

TEST_CASE("Older cloud records retain arbitrary exclusion values and stream alignment", "[automaton]")
{
    for (const int radius : {-100, -2, -1, 0, 4})
    {
        vector<unsigned char> bytes;
        writer output(&bytes);
        marshallInt(output, radius);
        marshallInt(output, 0x12345678);
        reader old_input(bytes, TAG_MINOR_PROTECTED_CLOUDS - 1);
        cloud_struct restored;
        restored.excl_rad = unmarshallInt(old_input);
        restored.protected_nonhostiles = unmarshall_cloud_protection(old_input);
        CHECK(restored.exclusion_radius() == radius);
        CHECK(restored.temporary() == (radius == -1));
        CHECK_FALSE(restored.protects_nonhostiles());
        CHECK(unmarshallInt(old_input) == 0x12345678);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Protected fumes survive a level save round trip", "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    REQUIRE(place_cloud(CLOUD_POISON, cell, 10, &you, 0,
                        -1, true, true));
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_LEVEL, output);
    delete_cloud(cell);
    REQUIRE_FALSE(cloud_at(cell));
    reader input(bytes, TAG_MINOR_VERSION);
    tag_read(input, TAG_LEVEL);
    const cloud_struct* restored = cloud_at(cell);
    REQUIRE(restored);
    CHECK(restored->type == CLOUD_POISON);
    CHECK(restored->protects_nonhostiles());
    CHECK(restored->temporary());
    CHECK(restored->exclusion_radius() == -1);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmotes kindle safely and explode against a foe", "[automaton]")
{
    const coord_def cell = you.pos();
    const coord_def target = cell + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.hp = you.hp_max = 100;
    you.spells[0] = SPELL_BLASTMOTE;
    you.spell_no = 1;
    REQUIRE(automaton::has_automatic_trigger(SPELL_BLASTMOTE));
    CHECK(automaton::engraving_guidance(SPELL_BLASTMOTE).find("Move away") != string::npos);
    { INFO("blastmote stage: trigger attack"); REQUIRE(automaton::trigger_attack(target)); }
    REQUIRE(cloud_at(cell));
    CHECK(cloud_at(cell)->protects_nonhostiles());
    CHECK(cloud_at(cell)->source == you.mid);
    { INFO("blastmote stage: owner cloud application"); actor_apply_cloud(&you); }
    REQUIRE(cloud_at(cell));
    you.props.erase(BLASTMOTE_IMMUNE_KEY);
    you.set_position(cell + coord_def(4, 4));
    invalidate_los();
    monster& visitor = spawn(1, cell, ATT_HOSTILE);
    { INFO("blastmote stage: schedule explosion"); explode_blastmotes_at(cell); }
    { INFO("blastmote stage: resolve explosion"); fire_final_effects(); }
    CHECK_FALSE(cloud_at(cell));
    CHECK(visitor.hit_points < visitor.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmotes suppress unsafe deferred explosions", "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(3, 0);
    you.hp = you.hp_max = 100;
    you.props[BLASTMOTE_POWER_KEY] = 50;
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, -1, -1, true, true));
    monster& foe = spawn(0, cell, ATT_HOSTILE);
    explode_blastmotes_at(cell);
    // A protected actor can arrive between scheduling and firing.
    monster& ally = spawn(1, cell + coord_def(1, 0), ATT_FRIENDLY);
    fire_final_effects();
    CHECK(foe.hit_points == foe.max_hit_points);
    CHECK(ally.hit_points == ally.max_hit_points);
    CHECK_FALSE(cloud_at(cell));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmotes do not cast where clouds are forbidden", "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_BLASTMOTE;
    you.spell_no = 1;
    unwind_var<uint32_t> restore_level_state(env.level_state);
    env.level_state |= LSTATE_STILL_WINDS;
    const int magic = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == magic);
    CHECK_FALSE(cloud_at(you.pos()));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmote clouds preserve their owner over a level save", "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(2, 0);
    you.props[BLASTMOTE_POWER_KEY] = 73;
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, -1, -1, true, true));
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_LEVEL, output);
    delete_cloud(cell);
    reader input(bytes, TAG_MINOR_VERSION);
    tag_read(input, TAG_LEVEL);
    const cloud_struct* restored = cloud_at(cell);
    REQUIRE(restored);
    CHECK(restored->type == CLOUD_BLASTMOTES);
    CHECK(restored->protects_nonhostiles());
    CHECK(restored->source == you.mid);
    vector<unsigned char> props_bytes;
    writer props_output(&props_bytes);
    you.props.write(props_output);
    reader props_input(props_bytes, TAG_MINOR_VERSION);
    player restored_owner;
    restored_owner.props.read(props_input);
    CHECK(restored_owner.props[BLASTMOTE_POWER_KEY].get_int() == 73);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmotes disperse beneath friendly creatures", "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(2, 0);
    you.props[BLASTMOTE_POWER_KEY] = 50;
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, -1, -1, true, true));
    monster& ally = spawn(0, cell, ATT_FRIENDLY);
    actor_apply_cloud(&ally);
    CHECK_FALSE(cloud_at(cell));
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmotes retain their inactive party owner", "[automaton]")
{
    const coord_def cell = you.pos();
    you.hp = you.hp_max = 100;
    you.props[BLASTMOTE_POWER_KEY] = 73;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.props[BLASTMOTE_POWER_KEY] = 1;
    other.set_position(cell + coord_def(4, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, -1, -1, true, true));
    party::get_player(0).set_position(cell + coord_def(-4, 0));
    monster& foe = spawn(0, cell, ATT_HOSTILE);
    {
        party::scoped_player_context ctx(1);
        invalidate_los();
        explode_blastmotes_at(cell);
        fire_final_effects();
        CHECK(party::active_slot() == 1);
        CHECK(foe.hit_points < foe.max_hit_points);
        CHECK(you.props[BLASTMOTE_POWER_KEY].get_int() == 1);
    }
    CHECK(party::active_slot() == 0);
    CHECK(you.props[BLASTMOTE_POWER_KEY].get_int() == 73);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic blastmote knockback cannot enter a hidden party position", "[automaton]")
{
    const coord_def cell = you.pos();
    you.hp = you.hp_max = 100;
    you.props[BLASTMOTE_POWER_KEY] = 73;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(cell + coord_def(2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, -1, -1, true, true));
    party::get_player(0).set_position(cell + coord_def(-4, 0));
    monster& foe = spawn(0, cell + coord_def(1, 0), ATT_HOSTILE);
    {
        party::scoped_player_context ctx(1);
        invalidate_los();
        explode_blastmotes_at(cell);
        fire_final_effects();
        CHECK(foe.hit_points < foe.max_hit_points);
        CHECK(foe.pos() == cell + coord_def(1, 0));
        CHECK(you.pos() == cell + coord_def(2, 0));
    }
}

TEST_CASE_METHOD(engraving_fixture, "Steam spawned from protected fire retains protection", "[automaton]")
{
    const coord_def fire = you.pos() + coord_def(2, 0);
    const coord_def water = fire + coord_def(1, 0);
    env.grid(water) = DNGN_SHALLOW_WATER;
    REQUIRE(place_cloud(CLOUD_FIRE, fire, 100, &you, 0,
                        -1, true, true));
    you.time_taken = 0;
    rng::seed(8128);
    for (int i = 0; i < 100 && !cloud_at(water); ++i)
        manage_clouds();
    const cloud_struct* steam = cloud_at(water);
    REQUIRE(steam);
    CHECK(steam->type == CLOUD_STEAM);
    CHECK(steam->protects_nonhostiles());
    CHECK(steam->temporary());
}

TEST_CASE_METHOD(engraving_fixture, "Visible automatic fumes explain their protection and skip the warning",
                 "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    REQUIRE(place_cloud(CLOUD_POISON, cell, 10, &you, 0,
                        -1, true, true));
    env.map_knowledge(cell).set_feature(DNGN_FLOOR);
    env.map_knowledge(cell).set_cloud(cloud_info(CLOUD_POISON, GREEN, 1, 0, cell, KILL_YOU_MISSILE));
    bool prompted = false;
    CHECK(check_moveto_cloud(cell, "step", &prompted));
    CHECK_FALSE(prompted);
    describe_info info;
    get_feature_desc(cell, info, true);
    CHECK(info.body.str().find("fumes disperse beneath friendly and neutral") != string::npos);
}

TEST_CASE_METHOD(engraving_fixture, "Visible protected blastmotes explain their safety",
                 "[automaton]")
{
    coord_def cell = you.pos() + coord_def(1, 0);
    bool automatic = true;
    SECTION("protected blastmotes") {}
    SECTION("ordinary blastmotes") { automatic = false; }
    SECTION("unseen protected blastmotes") { cell = you.pos() + coord_def(12, 0); }
    env.grid(cell) = DNGN_FLOOR;
    REQUIRE(place_cloud(CLOUD_BLASTMOTES, cell, 10, &you, 0, -1, true, automatic));
    env.map_knowledge(cell).set_feature(DNGN_FLOOR);
    env.map_knowledge(cell).set_cloud(cloud_info(CLOUD_BLASTMOTES, GREEN, 1, 0,
                                                 cell, KILL_YOU_MISSILE));
    invalidate_los();
    describe_info info;
    get_feature_desc(cell, info, true);
    const bool shown = info.body.str().find("blastmotes disperse harmlessly") != string::npos;
    CHECK(shown == (automatic && you.see_cell(cell)));
    CHECK(info.body.str().find("fumes disperse beneath") == string::npos);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic spike launcher chooses a useful wall and preserves an existing launcher",
                 "[automaton]")
{
    const coord_def wall = you.pos() + coord_def(1, 0);
    const coord_def target = you.pos() + coord_def(1, 1);
    spawn(0, target, ATT_HOSTILE);
    CHECK_FALSE(automaton::safe_spike_engraving());
    env.grid(wall) = DNGN_ROCK_WALL;
    invalidate_los();
    REQUIRE(automaton::safe_spike_engraving());
    you.spells[0] = SPELL_SPIKE_LAUNCHER;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_SPIKE_LAUNCHER));
    auto* marker = env.markers.get_active_feature_at(wall, DNGN_SPIKE_LAUNCHER);
    REQUIRE(marker);
    CHECK(marker->automatic_spike());
    CHECK(marker->spike_power() >= 0);
    CHECK_FALSE(automaton::safe_spike_engraving());
    CHECK(automaton::engraving_guidance(SPELL_SPIKE_LAUNCHER).find("will not replace") != string::npos);

    env.map_knowledge(wall).set_feature(DNGN_SPIKE_LAUNCHER);
    describe_info info;
    get_feature_desc(wall, info, false);
    const dice_def damage = zap_damage(ZAP_SPIKE_LAUNCHER, marker->spike_power(), false, false);
    CHECK(info.body.str().find(make_stringf("%dd%d damage", damage.num, damage.size)) != string::npos);
    CHECK(info.body.str().find("avoids neutral and friendly") != string::npos);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic spike launchers never target later neutral or friendly arrivals",
                 "[automaton]")
{
    const coord_def wall = you.pos() + coord_def(1, 0);
    const coord_def neutral_pos = you.pos() + coord_def(0, 1);
    env.grid(wall) = DNGN_SPIKE_LAUNCHER;
    invalidate_los();
    monster& neutral = spawn(0, neutral_pos, ATT_NEUTRAL);
    monster& ally = spawn(1, you.pos() + coord_def(1, 1), ATT_FRIENDLY);
    map_active_feature_marker marker(wall, DNGN_SPIKE_LAUNCHER, you.mid, ATT_FRIENDLY,
        map_active_feature_marker::encoded_spike_power(50, true), 1000, 0, true);
    CHECK_FALSE(marker.run(11));
    CHECK(neutral.hit_points == neutral.max_hit_points);
    CHECK(ally.hit_points == ally.max_hit_points);
    CHECK(you.hp == you.hp_max);
    monster& foe = spawn(2, you.pos() + coord_def(2, -1), ATT_HOSTILE);
    rng::seed(8128);
    for (int i = 0; i < 12 && foe.hit_points == foe.max_hit_points; ++i)
        CHECK_FALSE(marker.run(BASELINE_DELAY));
    CHECK(foe.hit_points < foe.max_hit_points);
    CHECK(neutral.hit_points == neutral.max_hit_points);
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Manual spike launchers retain their original neutral targeting",
                 "[automaton]")
{
    const coord_def wall = you.pos() + coord_def(1, 0);
    env.grid(wall) = DNGN_SPIKE_LAUNCHER;
    invalidate_los();
    monster& neutral = spawn(0, you.pos() + coord_def(0, 1), ATT_NEUTRAL);
    map_active_feature_marker marker(wall, DNGN_SPIKE_LAUNCHER, you.mid,
                                     ATT_FRIENDLY, 50, 1000, 0, true);
    rng::seed(8128);
    for (int i = 0; i < 12 && neutral.hit_points == neutral.max_hit_points; ++i)
        CHECK_FALSE(marker.run(BASELINE_DELAY));
    CHECK(neutral.hit_points < neutral.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic spike launchers protect party members in scoped contexts",
                 "[automaton]")
{
    const coord_def origin = you.pos();
    const coord_def wall = origin + coord_def(1, 0);
    spawn(0, origin + coord_def(1, 1), ATT_HOSTILE);
    you.hp = you.hp_max = 100;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(origin + coord_def(0, 1));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    env.grid(wall) = DNGN_SPIKE_LAUNCHER;
    invalidate_los();
    map_active_feature_marker marker(wall, DNGN_SPIKE_LAUNCHER, you.mid, ATT_FRIENDLY,
        map_active_feature_marker::encoded_spike_power(50, true), 1000, 0, true);
    {
        party::scoped_player_context ctx(1);
        CHECK_FALSE(marker.run(11));
        CHECK(you.hp == 100);
        CHECK(party::get_player(0).hp == 100);
    }
}

TEST_CASE("Automatic spike marker power survives clone and save", "[automaton]")
{
    map_active_feature_marker automatic(coord_def(30, 30), DNGN_SPIKE_LAUNCHER,
        MID_PLAYER, ATT_FRIENDLY, map_active_feature_marker::encoded_spike_power(47, true),
        100, 10, true);
    unique_ptr<map_marker> clone(automatic.clone());
    const auto* cloned = dynamic_cast<const map_active_feature_marker*>(clone.get());
    REQUIRE(cloned);
    CHECK(cloned->automatic_spike());
    CHECK(cloned->spike_power() == 47);
    vector<unsigned char> bytes;
    writer output(&bytes);
    automatic.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    REQUIRE(unmarshallShort(input) == MAT_ACTIVE_FEATURE);
    unique_ptr<map_marker> saved(map_active_feature_marker::read(input, MAT_ACTIVE_FEATURE));
    const auto* restored = dynamic_cast<const map_active_feature_marker*>(saved.get());
    REQUIRE(restored);
    CHECK(restored->automatic_spike());
    CHECK(restored->spike_power() == 47);
    map_active_feature_marker manual(coord_def(30, 30), DNGN_SPIKE_LAUNCHER,
                                     MID_PLAYER, ATT_FRIENDLY, 47, 100, 10, true);
    CHECK_FALSE(manual.automatic_spike());
    CHECK(manual.spike_power() == 47);
}

TEST_CASE_METHOD(engraving_fixture, "Bog engraving checks creatures and temporary terrain",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    REQUIRE(automaton::safe_bog_engraving());
    CHECK(automaton::engraving_guidance(SPELL_NOXIOUS_BOG).find("recedes") != string::npos);
    SECTION("A friendly creature occupies a bog cell")
    {
        spawn(1, you.pos() + coord_def(1, 1), ATT_FRIENDLY);
        CHECK_FALSE(automaton::safe_bog_engraving());
    }
    SECTION("Another temporary terrain effect would be overwritten")
    {
        const coord_def cell = you.pos() + coord_def(1, 1);
        temp_change_terrain(cell, DNGN_MUD, 100, TERRAIN_CHANGE_GENERIC, you.mid);
        CHECK_FALSE(automaton::safe_bog_engraving());
    }
    SECTION("Existing bogs are not renewed")
    {
        you.duration[DUR_NOXIOUS_BOG] = 10;
        CHECK_FALSE(automaton::safe_bog_engraving());
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic bog recedes under allies while retaining other terrain",
                 "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    temp_change_terrain(cell, DNGN_TOXIC_BOG, 100,
                        TERRAIN_CHANGE_AUTOMATON_BOG, you.mid);
    SECTION("An arriving ally")
    {
        monster& ally = spawn(0, cell, ATT_FRIENDLY);
        actor_apply_toxic_bog(&ally);
        CHECK(ally.hit_points == ally.max_hit_points);
        CHECK(env.grid(cell) == DNGN_FLOOR);
    }
    SECTION("An arriving neutral")
    {
        monster& neutral = spawn(0, cell, ATT_NEUTRAL);
        actor_apply_toxic_bog(&neutral);
        CHECK(neutral.hit_points == neutral.max_hit_points);
        CHECK(env.grid(cell) == DNGN_FLOOR);
    }
    SECTION("An unrelated later terrain change remains")
    {
        temp_change_terrain(cell, DNGN_MUD, 100, TERRAIN_CHANGE_GENERIC, you.mid);
        // Reverting the automatic layer must not erase the later layer.
        REQUIRE(revert_terrain_change(cell, TERRAIN_CHANGE_AUTOMATON_BOG));
        CHECK(env.grid(cell) == DNGN_MUD);
        CHECK(is_temp_terrain(cell));
    }
    SECTION("The automatic effect expires with its owner")
    {
        CHECK(end_terrain_changes(you, TERRAIN_CHANGE_AUTOMATON_BOG));
        CHECK(env.grid(cell) == DNGN_FLOOR);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Manual bog remains hazardous to allies", "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    temp_change_terrain(cell, DNGN_TOXIC_BOG, 100, TERRAIN_CHANGE_BOG, you.mid);
    monster& ally = spawn(0, cell, ATT_FRIENDLY);
    actor_apply_toxic_bog(&ally);
    CHECK(ally.hit_points < ally.max_hit_points);
    CHECK(env.grid(cell) == DNGN_TOXIC_BOG);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic bog protects another party member", "[automaton]")
{
    const coord_def leader = you.pos();
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(-2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    {
        party::scoped_player_context ctx(1);
        temp_change_terrain(leader, DNGN_TOXIC_BOG, 100,
                            TERRAIN_CHANGE_AUTOMATON_BOG, you.mid);
    }
    const int hp_before = you.hp;
    actor_apply_toxic_bog(&you);
    CHECK(you.hp == hp_before);
    CHECK(env.grid(leader) == DNGN_FLOOR);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic bog markers survive save serialization", "[automaton]")
{
    map_terrain_change_marker marker(you.pos(), DNGN_FLOOR, DNGN_TOXIC_BOG,
                                    0, 0, 100, TERRAIN_CHANGE_AUTOMATON_BOG,
                                    you.mid);
    vector<unsigned char> bytes;
    writer output(&bytes);
    marker.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    REQUIRE(unmarshallShort(input) == MAT_TERRAIN_CHANGE);
    unique_ptr<map_marker> restored(map_terrain_change_marker::read(input, MAT_TERRAIN_CHANGE));
    const auto* terrain = dynamic_cast<const map_terrain_change_marker*>(restored.get());
    REQUIRE(terrain);
    CHECK(terrain->change_type == TERRAIN_CHANGE_AUTOMATON_BOG);
    CHECK(terrain->source_mid == you.mid);
    CHECK(terrain->duration == 100);
}

TEST_CASE_METHOD(engraving_fixture, "Toxic engraving needs a susceptible foe and a safe area",
                 "[automaton]")
{
    CHECK_FALSE(automaton::safe_toxic_engraving());
    monster& foe = spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    CHECK(automaton::safe_toxic_engraving());
    CHECK(automaton::engraving_guidance(SPELL_OLGREBS_TOXIC_RADIANCE)
              .find("aura ends") != string::npos);
    SECTION("Existing aura is not renewed")
    {
        you.duration[DUR_TOXIC_RADIANCE] = 20;
        CHECK_FALSE(automaton::safe_toxic_engraving());
    }
    SECTION("A friendly creature prevents activation")
    {
        spawn(1, you.pos() + coord_def(1, 1), ATT_FRIENDLY);
        CHECK_FALSE(automaton::safe_toxic_engraving());
    }
    SECTION("An immune enemy alone does not trigger")
    {
        foe.type = MONS_IRON_GOLEM;
        CHECK_FALSE(automaton::safe_toxic_engraving());
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic toxic aura ends before harming an arriving ally",
                 "[automaton]")
{
    you.duration[DUR_TOXIC_RADIANCE] = 20;
    automaton::mark_toxic_engraving();
    automaton::protect_toxic_engraving();
    REQUIRE(you.duration[DUR_TOXIC_RADIANCE] == 20);
    spawn(0, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    automaton::protect_toxic_engraving();
    CHECK(you.duration[DUR_TOXIC_RADIANCE] == 0);
    // Manual use retains its usual persistent-aura behavior.
    you.duration[DUR_TOXIC_RADIANCE] = 20;
    automaton::protect_toxic_engraving();
    CHECK(you.duration[DUR_TOXIC_RADIANCE] == 20);
}

TEST_CASE_METHOD(engraving_fixture, "Automaton deletion explains its drain", "[automaton]")
{
    CHECK(make_cost_description(ABIL_AUTOMATON_DELETE_SPELL).find("Maximum HP drain")
          != string::npos);
    const string desc = get_ability_desc(ABIL_AUTOMATON_DELETE_SPELL, false);
    CHECK(desc.find("Deleting an engraving drains maximum HP") != string::npos);
    CHECK(desc.find("Cancelling costs nothing") != string::npos);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic clockwork bee winds per turn without taking control",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_CLOCKWORK_BEE;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    you.attribute[ATTR_CHANNELLED_SPELL] = SPELL_FLAME_WAVE;
    you.attribute[ATTR_CHANNEL_DURATION] = 3;
    const int before = you.magic_points;
    REQUIRE(automaton::safe_bee_engraving(target));
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_CLOCKWORK_BEE));
    CHECK(you.time_taken == BASELINE_DELAY);
    CHECK(you.turn_is_over);
    CHECK(you.attribute[ATTR_CHANNELLED_SPELL] == SPELL_FLAME_WAVE);
    CHECK(you.attribute[ATTR_CHANNEL_DURATION] == 3);
    CHECK(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
    CHECK_FALSE(automaton::safe_bee_engraving(target));

    status_info status;
    REQUIRE(fill_status_info(STATUS_AUTOMATON_BEE, status));
    CHECK(status.light_text == "Bee 3");
    CHECK(status.long_text.find("Taking damage") != string::npos);
    CHECK(status.long_text.find("normal-speed turns") != string::npos);
    CHECK(status_light_description(status) == status.long_text);
    automaton::advance_bee_engraving(); // The initiating action is not counted.
    CHECK(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
    automaton::advance_bee_engraving();
    CHECK(automaton::bee_winding_remaining(you) == 2 * BASELINE_DELAY);
    automaton::advance_bee_engraving();
    CHECK(automaton::bee_winding_remaining(you) == BASELINE_DELAY);
    automaton::advance_bee_engraving();
    CHECK(automaton::bee_winding_remaining(you) == 0);
    int bees = 0;
    for (monster_iterator mi; mi; ++mi)
        if (mi->was_created_by(you, SPELL_CLOCKWORK_BEE))
            ++bees;
    CHECK(bees == 1);
    CHECK_FALSE(automaton::safe_bee_engraving(target));
}

TEST_CASE_METHOD(engraving_fixture, "Bee winding tracks action time rather than action count",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_CLOCKWORK_BEE;
    you.spell_no = 1;
    REQUIRE(automaton::trigger_attack(target));
    automaton::advance_bee_engraving();
    you.time_taken = 5;
    automaton::advance_bee_engraving();
    CHECK(automaton::bee_winding_remaining(you) == 25);
    status_info status;
    REQUIRE(fill_status_info(STATUS_AUTOMATON_BEE, status));
    CHECK(status.light_text == "Bee 3");
    you.time_taken = 15;
    automaton::advance_bee_engraving();
    CHECK(automaton::bee_winding_remaining(you) == 10);
    REQUIRE(fill_status_info(STATUS_AUTOMATON_BEE, status));
    CHECK(status.light_text == "Bee 1");
}

TEST_CASE_METHOD(engraving_fixture, "Automatic bee winding stops on damage or changed target",
                 "[automaton]")
{
    monster& foe = spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_CLOCKWORK_BEE;
    you.spell_no = 1;
    you.hp = you.hp_max = 100;
    REQUIRE(automaton::trigger_attack(foe.pos()));
    SECTION("Damage interrupts the owner")
    {
        ouch(3, KILLED_BY_MONSTER, foe.mid, nullptr, nullptr, true);
        CHECK(you.hp == 97);
        CHECK(automaton::bee_winding_remaining(you) == 0);
    }
    SECTION("A neutral target cancels the winding")
    {
        foe.base_attitude = ATT_NEUTRAL;
        automaton::advance_bee_engraving();
        CHECK(automaton::bee_winding_remaining(you) == 0);
    }
    SECTION("A removed engraving cancels the winding")
    {
        you.spells[0] = SPELL_NO_SPELL;
        you.spell_no = 0;
        automaton::advance_bee_engraving();
        CHECK(automaton::bee_winding_remaining(you) == 0);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic bee winding survives save and belongs to its owner",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    spawn(0, leader + coord_def(-3, 0), ATT_HOSTILE);
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(-2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    {
        party::scoped_player_context ctx(1);
        you.spells[0] = SPELL_CLOCKWORK_BEE;
        you.spell_no = 1;
        REQUIRE(automaton::trigger_attack(leader + coord_def(-3, 0)));
        CHECK(automaton::bee_winding_remaining(party::get_player(0)) == 0);
        CHECK(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
        vector<unsigned char> bytes;
        writer output(&bytes);
        you.props.write(output);
        reader input(bytes, TAG_MINOR_VERSION);
        player restored;
        restored.props.read(input);
        CHECK(automaton::bee_winding_remaining(restored) == 3 * BASELINE_DELAY);
        CHECK(restored.props["automaton_bee_target"].get_int() == 40001);
        CHECK(restored.props["automaton_bee_fresh"].get_bool());
        automaton::advance_bee_engraving();
        CHECK(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
    }
    CHECK(automaton::bee_winding_remaining(you) == 0);
    CHECK(automaton::bee_winding_remaining(party::get_player(1)) == 3 * BASELINE_DELAY);
}

TEST_CASE_METHOD(engraving_fixture, "Damage interrupts only the affected party member's bee",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    monster& first_foe = spawn(0, leader + coord_def(3, 0), ATT_HOSTILE);
    monster& second_foe = spawn(1, leader + coord_def(-3, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_CLOCKWORK_BEE;
    you.spell_no = 1;
    you.hp = you.hp_max = 100;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(-2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    REQUIRE(automaton::trigger_attack(first_foe.pos()));
    {
        party::scoped_player_context ctx(1);
        REQUIRE(automaton::trigger_attack(second_foe.pos()));
        ouch(3, KILLED_BY_MONSTER, second_foe.mid, nullptr, nullptr, true);
        CHECK(automaton::bee_winding_remaining(you) == 0);
        CHECK(automaton::bee_winding_remaining(party::get_player(0)) == 3 * BASELINE_DELAY);
    }
    CHECK(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
}

TEST_CASE_METHOD(engraving_fixture, "Searing Ray fires one beam without replacing a channel",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_SEARING_RAY;
    you.spell_no = 1;
    you.attribute[ATTR_CHANNELLED_SPELL] = SPELL_FLAME_WAVE;
    you.attribute[ATTR_CHANNEL_DURATION] = 3;
    you.time_taken = 7;
    you.turn_is_over = true;
    REQUIRE(automaton::safe_attack_engraving(SPELL_SEARING_RAY, target));
    const int before = you.magic_points;
    rng::seed(8128);
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_SEARING_RAY));
    CHECK(you.time_taken == 7);
    CHECK(you.turn_is_over);
    CHECK(you.attribute[ATTR_CHANNELLED_SPELL] == SPELL_FLAME_WAVE);
    CHECK(you.attribute[ATTR_CHANNEL_DURATION] == 3);
    CHECK(foe.hit_points < foe.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Searing Ray avoids protected creatures in its path",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& bystander = spawn(1, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_SEARING_RAY, target));
    bystander.base_attitude = ATT_NEUTRAL;
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_SEARING_RAY, target));
}

TEST_CASE_METHOD(engraving_fixture, "Caster starting engravings activate against a suitable foe",
                 "[automaton]")
{
    spell_type spell = SPELL_NO_SPELL;
    coord_def target;
    SECTION("Forgewright: Kinetic Grapnel")
    {
        spell = SPELL_KINETIC_GRAPNEL;
        target = you.pos() + coord_def(3, 0);
    }
    SECTION("Ice Elementalist: Freeze")
    {
        spell = SPELL_FREEZE;
        target = you.pos() + coord_def(1, 0);
    }
    SECTION("Necromancer: Soul Splinter")
    {
        spell = SPELL_SOUL_SPLINTER;
        target = you.pos() + coord_def(3, 0);
    }
    monster& foe = spawn(0, target, ATT_HOSTILE);
    you.spells[0] = spell;
    you.spell_no = 1;
    CHECK(automaton::has_automatic_trigger(spell));
    REQUIRE(automaton::safe_attack_engraving(spell, target));
    rng::seed(8128);
    bool affected = false;
    for (int attempt = 0; attempt < 12 && !affected; ++attempt)
    {
        you.magic_points = you.max_magic_points;
        you.elapsed_time += 100;
        REQUIRE(automaton::trigger_attack(target));
        CHECK(you.magic_points < you.max_magic_points);
        affected = spell == SPELL_SOUL_SPLINTER
            ? foe.props.exists(SOUL_SPLINTERED_KEY)
            : foe.hit_points < foe.max_hit_points;
    }
    CHECK(affected);
}

TEST_CASE_METHOD(engraving_fixture, "Caster starting engravings reject a neutral target",
                 "[automaton]")
{
    for (const spell_type spell : {SPELL_KINETIC_GRAPNEL, SPELL_FREEZE, SPELL_SOUL_SPLINTER})
    {
        const coord_def target = you.pos() + coord_def(spell == SPELL_FREEZE ? 1 : 3, 0);
        monster& neutral = spawn(0, target, ATT_NEUTRAL);
        CHECK_FALSE(automaton::safe_attack_engraving(spell, target));
        env.mgrid(target) = NON_MONSTER;
        neutral.reset();
    }
}

TEST_CASE_METHOD(engraving_fixture, "Passwall engraving chooses a known clear escape",
                 "[automaton]")
{
    const coord_def wall = you.pos() + coord_def(1, 0);
    const coord_def exit = you.pos() + coord_def(2, 0);
    env.grid(wall) = DNGN_ROCK_WALL;
    env.map_knowledge(wall).set_feature(DNGN_ROCK_WALL);
    env.map_knowledge(exit).set_feature(DNGN_FLOOR);
    spawn(0, you.pos() + coord_def(-3, 0), ATT_HOSTILE);
    invalidate_los();
    you.spells[0] = SPELL_PASSWALL;
    you.spell_no = 1;
    you.hp_max = 100;
    you.hp = 25;
    coord_def aim;

    SECTION("a clear exit starts the native passage delay")
    {
        REQUIRE(automaton::passwall_escape_aim(aim));
        CHECK(aim == wall);
        const int before = you.magic_points;
        REQUIRE(automaton::trigger_escape());
        CHECK(you.magic_points == before - spell_mana(SPELL_PASSWALL));
        CHECK(you_are_delayed());
        CHECK(dynamic_cast<PasswallDelay*>(current_delay().get()) != nullptr);
        CHECK(you.pos() != exit);
        you.delay_queue.clear();
    }
    SECTION("an unknown exit is rejected")
    {
        env.map_knowledge(exit).clear();
        CHECK_FALSE(automaton::passwall_escape_aim(aim));
        CHECK_FALSE(automaton::trigger_escape());
    }
    SECTION("an occupied exit is rejected")
    {
        spawn(1, exit, ATT_FRIENDLY);
        CHECK_FALSE(automaton::passwall_escape_aim(aim));
        CHECK_FALSE(automaton::trigger_escape());
    }
    SECTION("a nearby threat at the exit is rejected")
    {
        spawn(1, exit + coord_def(1, 0), ATT_HOSTILE);
        CHECK_FALSE(automaton::passwall_escape_aim(aim));
    }
    SECTION("an active ice spell prevents a confirmation prompt")
    {
        you.duration[DUR_ICY_ARMOUR] = 10;
        CHECK_FALSE(automaton::passwall_escape_aim(aim));
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic Passwall checks the exit again on completion",
                 "[automaton]")
{
    const coord_def origin = you.pos();
    const coord_def exit = origin + coord_def(2, 0);
    env.map_knowledge(exit).set_feature(DNGN_FLOOR);
    REQUIRE(automaton::safe_passwall_destination(exit));
    PasswallDelay passage(0, exit, true);
    SECTION("an ally arrives") { spawn(0, exit, ATT_FRIENDLY); }
    SECTION("a trap appears") { env.grid(exit) = DNGN_TRAP_TELEPORT; }
    SECTION("a cloud appears") { REQUIRE(place_cloud(CLOUD_FIRE, exit, 5, &you)); }
    passage.complete_passage();
    CHECK(you.pos() == origin);
}

TEST_CASE_METHOD(engraving_fixture, "Automatic Passwall checks party positions in a scoped context",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(-2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    env.map_knowledge(leader).set_feature(DNGN_FLOOR);
    {
        party::scoped_player_context ctx(1);
        CHECK_FALSE(automaton::safe_passwall_destination(leader));
        auto passage = start_delay<PasswallDelay>(0, leader, true);
        REQUIRE(you_are_delayed());
        CHECK(party::get_player(0).delay_queue.empty());
        static_pointer_cast<PasswallDelay>(passage)->complete_passage();
        CHECK(you.pos() == leader + coord_def(-2, 0));
        you.delay_queue.clear();
    }
    CHECK(you.pos() == leader);
    CHECK(you.delay_queue.empty());
}

TEST_CASE_METHOD(engraving_fixture, "Engravings protect a party member hidden by scoped damage",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    monster& foe = spawn(0, leader + coord_def(-3, 0), ATT_HOSTILE);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_POISON, &you, 100, 2)));
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(-2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    {
        party::scoped_player_context ctx(1);
        invalidate_los();
        REQUIRE(actor_at(leader) == nullptr);
        CHECK_FALSE(automaton::safe_area_engraving(SPELL_DISPERSAL));
        CHECK_FALSE(automaton::safe_area_engraving(SPELL_ARCJOLT));
        CHECK_FALSE(automaton::safe_area_engraving(SPELL_ENGLACIATION));
        CHECK_FALSE(automaton::safe_area_engraving(SPELL_MASS_CONFUSION));
        CHECK_FALSE(automaton::safe_area_engraving(SPELL_ANGUISH));
        CHECK_FALSE(automaton::safe_ignite_engraving());
        CHECK_FALSE(automaton::safe_bog_engraving());
        party::get_player(0).set_position(leader + coord_def(9, 0));
        CHECK(automaton::safe_area_engraving(SPELL_DISPERSAL));
        CHECK(automaton::safe_area_engraving(SPELL_ARCJOLT));
        CHECK(automaton::safe_area_engraving(SPELL_ENGLACIATION));
        CHECK(automaton::safe_area_engraving(SPELL_MASS_CONFUSION));
        CHECK(automaton::safe_area_engraving(SPELL_ANGUISH));
        CHECK(automaton::safe_ignite_engraving());
        CHECK(automaton::safe_bog_engraving());
        party::get_player(0).set_position(leader);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Ignite Poison engraving identifies a safe poisoned enemy", "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_POISON, &you, 100, 2)));
    you.spells[0] = SPELL_IGNITE_POISON;
    you.spell_no = 1;
    CHECK(automaton::safe_ignite_engraving());
    CHECK(foe.has_ench(ENCH_POISON));
}

TEST_CASE_METHOD(engraving_fixture, "Ignite Poison engraving avoids allies and unseen neutrals", "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_POISON, &you, 100, 2)));
    SECTION("Friendly ally")
    {
        spawn(1, you.pos() + coord_def(2, 1), ATT_FRIENDLY);
    }
    SECTION("Invisible neutral")
    {
        monster& neutral = spawn(1, you.pos() + coord_def(2, 1), ATT_NEUTRAL);
        neutral.add_ench(mon_enchant(ENCH_INVIS));
        REQUIRE_FALSE(you.can_see(neutral));
    }
    you.spells[0] = SPELL_IGNITE_POISON;
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(foe.has_ench(ENCH_POISON));
    CHECK(env.mons[1].hit_points == env.mons[1].max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Ignite Poison engraving avoids a cloud under its caster", "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    REQUIRE(foe.add_ench(mon_enchant(ENCH_POISON, &you, 100, 2)));
    REQUIRE(place_cloud(CLOUD_POISON, you.pos(), 5, &you));
    you.spells[0] = SPELL_IGNITE_POISON;
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(foe.has_ench(ENCH_POISON));
}

TEST_CASE_METHOD(engraving_fixture, "Intoxication engraving requires a susceptible hostile", "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    CHECK_FALSE(automaton::safe_intoxication_engraving()); // A rat is not human-minded.
    foe.type = MONS_ORC;
    CHECK(automaton::safe_intoxication_engraving());
    foe.add_ench(mon_enchant(ENCH_CONFUSION));
    CHECK_FALSE(automaton::safe_intoxication_engraving());
    foe.del_ench(ENCH_CONFUSION);
    spawn(1, you.pos() + coord_def(2, 1), ATT_FRIENDLY);
    CHECK_FALSE(automaton::safe_intoxication_engraving());
}

TEST_CASE("Automatic beams decline all tracer warnings", "[automaton]")
{
    player_beam_tracer tracer;
    monster target;
    CHECK_FALSE(automaton::beam_requires_confirmation(tracer));
    tracer.hit_self_count = 1;
    CHECK(automaton::beam_requires_confirmation(tracer));
    tracer.hit_self_count = 0;
    tracer.bad_charm_target = &target;
    CHECK(automaton::beam_requires_confirmation(tracer));
    tracer.bad_charm_target = nullptr;
    tracer.god_hated_target = &target;
    CHECK(automaton::beam_requires_confirmation(tracer));
    tracer.god_hated_target = nullptr;
    tracer.bad_attack_targets.push_back({&target, "", "", false});
    CHECK(automaton::beam_requires_confirmation(tracer));
}

TEST_CASE("Automaton heat and cooling belong to each hero", "[automaton]")
{
    player first;
    player second;
    first.species = second.species = SP_AUTOMATON;
    first.max_magic_points = second.max_magic_points = 20;
    first.magic_points = second.magic_points = 12;
    first.elapsed_time = second.elapsed_time = 100;
    CHECK(automaton::heat(first) == 8);
    CHECK(automaton::cooling_rate(first, 20) == 110);
    automaton::mark_combat(first);
    CHECK(automaton::cooling_rate(first, 20) == 30);
    CHECK(automaton::cooling_rate(second, 20) == 110);
    first.elapsed_time += 5 * BASELINE_DELAY;
    CHECK(automaton::cooling_rate(first, 20) == 110);
    first.duration[DUR_BERSERK] = 1;
    CHECK(automaton::cooling_rate(first, 20) == 0);
    second.species = SP_HUMAN;
    CHECK(automaton::cooling_rate(second, 20) == 20);
}

TEST_CASE("Berserk overheats only the Automaton that enters it", "[automaton]")
{
    player first;
    player second;
    player human;
    first.species = second.species = SP_AUTOMATON;
    human.species = SP_HUMAN;
    first.max_magic_points = second.max_magic_points = human.max_magic_points = 20;
    first.magic_points = second.magic_points = human.magic_points = 14;
    first.redraw_magic_points = false;
    CHECK(automaton::overheat_from_berserk(first));
    CHECK(automaton::heat(first) == 20);
    CHECK(first.redraw_magic_points);
    CHECK(second.magic_points == 14);
    CHECK_FALSE(automaton::overheat_from_berserk(human));
    CHECK(human.magic_points == 14);
}

TEST_CASE_METHOD(engraving_fixture, "Entering berserk fills an Automaton's heat gauge",
                 "[automaton]")
{
    you.magic_points = 14;
    REQUIRE(you.go_berserk(true, false));
    CHECK(you.duration[DUR_BERSERK] > 0);
    CHECK(you.magic_points == 0);
    CHECK(automaton::heat(you) == you.max_magic_points);
    CHECK(automaton::cooling_rate(you, 20) == 0);
}

TEST_CASE("The laser pattern unlocks for each Automaton at level five", "[automaton]")
{
    player first;
    player second;
    first.species = second.species = SP_AUTOMATON;
    first.experience_level = 4;
    second.experience_level = 5;
    CHECK_FALSE(automaton::unlock_laser(first));
    CHECK(automaton::unlock_laser(second));
    CHECK(second.spell_library[SPELL_AUTOMATON_LASER]);
    CHECK_FALSE(first.spell_library[SPELL_AUTOMATON_LASER]);
    CHECK_FALSE(automaton::unlock_laser(second));
    first.species = SP_HUMAN;
    first.experience_level = 5;
    CHECK_FALSE(automaton::unlock_laser(first));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Deleting an engraving is an Automaton ability",
                 "[automaton]")
{
    you.species = SP_HUMAN;
    CHECK_FALSE(player_has_ability(ABIL_AUTOMATON_DELETE_SPELL));
    you.species = SP_AUTOMATON;
    CHECK(player_has_ability(ABIL_AUTOMATON_DELETE_SPELL));
    CHECK(ability_name(ABIL_AUTOMATON_DELETE_SPELL) == "Delete Spell");
    you.spell_no = 0;
    CHECK_FALSE(check_ability_possible(ABIL_AUTOMATON_DELETE_SPELL, true));
    you.spell_no = 1;
    CHECK(check_ability_possible(ABIL_AUTOMATON_DELETE_SPELL, true));
    you.species = SP_HUMAN;
    CHECK_FALSE(player_has_ability(ABIL_AUTOMATON_DELETE_SPELL));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Mutagenic exposure corrodes Automata",
                 "[automaton]")
{
    you.species = SP_AUTOMATON;
    const int previous = you.mutation[MUT_CLAWS];
    CHECK_FALSE(you.can_safely_mutate());
    REQUIRE(mutate(MUT_CLAWS, "test exposure", false, true));
    CHECK(you.mutation[MUT_CLAWS] == previous);
    CHECK(you.duration[DUR_CORROSION] > 0);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Magical contamination corrodes Automata instead of glowing",
                 "[automaton]")
{
    you.species = SP_AUTOMATON;
    you.magic_contamination = 0;
    contaminate_player(1400, false, false);
    CHECK(you.magic_contamination == 0);
    CHECK(you.duration[DUR_CORROSION] > 0);
    you.magic_contamination = 400;
    contaminate_player(-100, false, false);
    CHECK(you.magic_contamination < 400);
    you.species = SP_HUMAN;
    you.magic_contamination = 0;
    contaminate_player(400, false, false);
    CHECK(you.magic_contamination == 400);
}

TEST_CASE("Automaton combat heat survives property serialization", "[automaton]")
{
    player original;
    original.species = SP_AUTOMATON;
    original.elapsed_time = 100;
    automaton::mark_combat(original);
    vector<unsigned char> bytes;
    writer output(&bytes);
    original.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.species = SP_AUTOMATON;
    restored.elapsed_time = 100;
    restored.max_magic_points = 20;
    restored.magic_points = 12;
    restored.props.read(input);
    CHECK(automaton::cooling_rate(restored, 20) == 30);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Automaton uses heat cooling in player regeneration",
                 "[automaton]")
{
    you.species = SP_HUMAN;
    you.max_magic_points = 20;
    you.magic_points = 12;
    you.elapsed_time = 100;
    const int normal = player_mp_regen();
    you.species = SP_AUTOMATON;
    CHECK(player_mp_regen() == normal * 3 / 2 + 80);
    automaton::mark_combat(you);
    CHECK(player_mp_regen() == normal * 3 / 2);
}

TEST_CASE_METHOD(engraving_fixture, "Attack engravings avoid allies and preserve the action",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, target + coord_def(0, 1), ATT_FRIENDLY);
    CHECK(you.can_see(foe));
    CHECK_FALSE(foe.wont_attack());
    CHECK_FALSE(party::is_proxy_monster(foe));
    string adj, suffix;
    bool penance = false;
    CHECK_FALSE(bad_attack(&foe, adj, suffix, penance));
    const spell_flags flags = get_spell_flags(SPELL_MAGIC_DART);
    CHECK(testbits(flags, spflag::direct_damage_only));
    CHECK(bool(flags & spflag::targeting_mask));
    CHECK_FALSE(bool(flags & (spflag::helpful | spflag::obj)));
    const int power = calc_spell_power(SPELL_MAGIC_DART);
    auto trace = find_spell_targeter(SPELL_MAGIC_DART, power,
                                      spell_range(SPELL_MAGIC_DART, &you, power));
    REQUIRE(trace);
    REQUIRE(trace->set_aim(target));
    CHECK(trace->is_affected(target) > AFF_NO);
    CHECK(trace->is_affected(you.pos()) <= AFF_NO);
    CHECK(trace->is_affected(ally.pos()) <= AFF_NO);
    CHECK(automaton::safe_attack_engraving(SPELL_MAGIC_DART, target));
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_FIREBALL, target));
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_MAGIC_DART, ally.pos()));
    ally.base_attitude = ATT_NEUTRAL;
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_FIREBALL, target));
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_MAGIC_DART, ally.pos()));
    ally.base_attitude = ATT_HOSTILE;
    ally.props["party_player_slot"].get_int() = 1;
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_FIREBALL, target));
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_MAGIC_DART, ally.pos()));
    ally.props.erase("party_player_slot");
    ally.base_attitude = ATT_FRIENDLY;
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    you.time_taken = 7;
    you.turn_is_over = true;
    const int before = you.magic_points;
    rng::seed(8128); // Keep the damage roll deterministic for this assertion.
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points < before);
    CHECK(you.time_taken == 7);
    CHECK(you.turn_is_over);
    CHECK(ally.hit_points == ally.max_hit_points);
    CHECK(foe.hit_points < foe.max_hit_points);
    CHECK_FALSE(automaton::trigger_attack(target)); // Same engraving is cooling down.
    const string key = "automaton_engraving_" + to_string(static_cast<int>(SPELL_MAGIC_DART));
    REQUIRE(you.props.exists(key));
    CHECK(you.props[key].get_int() > you.elapsed_time);
    player second;
    second.species = SP_AUTOMATON;
    CHECK_FALSE(second.props.exists(key));
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    second.props.read(input);
    CHECK(second.props[key].get_int() == you.props[key].get_int());
    CHECK(foe.alive());
}

TEST_CASE_METHOD(engraving_fixture, "Melee attacks trigger engraved damage without a second turn",
                 "[automaton]")
{
    monster& foe = spawn(0, you.pos() + coord_def(1, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    you.turn_is_over = true;
    const int before = you.magic_points;
    REQUIRE(player_fight(&foe));
    CHECK(you.magic_points < before);
    CHECK(you.time_taken > 0);
    CHECK(you.turn_is_over);
}

TEST_CASE_METHOD(engraving_fixture, "Automata cannot manually cast their engravings",
                 "[automaton]")
{
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    const int before = you.magic_points;
    you.turn_is_over = false;
    CHECK(cast_a_spell(false, SPELL_MAGIC_DART) == spret::abort);
    CHECK(you.magic_points == before);
    CHECK_FALSE(you.turn_is_over);
}

TEST_CASE_METHOD(engraving_fixture, "Hostile hex engravings trigger on attack",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_PETRIFY;
    you.spell_no = 1;
    CHECK(automaton::safe_attack_engraving(SPELL_PETRIFY, target));
    for (int attempt = 0; attempt < 10 && !foe.has_ench(ENCH_PETRIFYING); ++attempt)
    {
        you.magic_points = you.max_magic_points;
        you.elapsed_time += 100;
        REQUIRE(automaton::trigger_attack(target));
    }
    CHECK(foe.has_ench(ENCH_PETRIFYING));
}

TEST_CASE_METHOD(engraving_fixture, "The engraved laser fires through the spell system",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    CHECK(is_player_spell(SPELL_AUTOMATON_LASER));
    CHECK(you_can_memorise(SPELL_AUTOMATON_LASER));
    CHECK(automaton::safe_attack_engraving(SPELL_AUTOMATON_LASER, target));
    you.spells[0] = SPELL_AUTOMATON_LASER;
    you.spell_no = 1;
    for (int attempt = 0; attempt < 15 && foe.hit_points == foe.max_hit_points; ++attempt)
    {
        you.magic_points = you.max_magic_points;
        you.elapsed_time += 100;
        REQUIRE(automaton::trigger_attack(target));
        CHECK(you.magic_points == you.max_magic_points - 6);
    }
    CHECK(foe.hit_points < foe.max_hit_points);
    you.species = SP_HUMAN;
    CHECK_FALSE(you_can_memorise(SPELL_AUTOMATON_LASER));
}

TEST_CASE_METHOD(engraving_fixture, "Combat engravings activate useful self buffs once",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_OZOCUBUS_ARMOUR;
    you.spell_no = 1;
    you.time_taken = 8;
    you.turn_is_over = true;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.duration[DUR_ICY_ARMOUR] > 0);
    CHECK(you.time_taken == 8);
    CHECK(you.turn_is_over);
    you.elapsed_time += 100;
    CHECK_FALSE(automaton::trigger_attack(target));
}

TEST_CASE_METHOD(engraving_fixture, "Automaton aura engravings preserve an active stance",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_AURA_OF_PROTECTION;
    you.spells[1] = SPELL_AURA_OF_ZEAL;
    you.spell_no = 2;
    you.props["active_aura_spell"].get_int() = SPELL_AURA_OF_PROTECTION;
    you.duration[DUR_PALADIN_ZEAL] = 100;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(you.props["active_aura_spell"].get_int() == SPELL_AURA_OF_PROTECTION);

    you.duration[DUR_PALADIN_ZEAL] = 0;
    you.spells[1] = SPELL_NO_SPELL;
    you.spell_no = 1;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.duration[DUR_PALADIN_ZEAL] > 0);
    CHECK(you.props["active_aura_spell"].get_int() == SPELL_AURA_OF_PROTECTION);
}

TEST_CASE_METHOD(engraving_fixture, "Frozen Ramparts engravings need a threatened wall",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    const coord_def wall = you.pos() + coord_def(2, 1);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_FROZEN_RAMPARTS;
    you.spell_no = 1;
    CHECK_FALSE(automaton::trigger_attack(target));
    env.grid(wall) = DNGN_ROCK_WALL;
    invalidate_los();
    env.level_state |= LSTATE_ICY_WALL;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.duration[DUR_FROZEN_RAMPARTS] == 0);
    CHECK(env.level_state & LSTATE_ICY_WALL);
    env.level_state &= ~LSTATE_ICY_WALL;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.duration[DUR_FROZEN_RAMPARTS] > 0);
    CHECK(count_adjacent_icy_walls(target) > 0);
    you.elapsed_time += 100;
    CHECK_FALSE(automaton::trigger_attack(target));
    end_frozen_ramparts();
    you.duration[DUR_FROZEN_RAMPARTS] = 0;
}

TEST_CASE_METHOD(engraving_fixture, "Static Discharge engravings fire near a hostile",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_DISCHARGE;
    you.spell_no = 1;
    you.hp = you.hp_max = 100;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points < before);
}

TEST_CASE_METHOD(engraving_fixture, "Static Discharge engravings avoid allies beyond invisible conductors",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& unseen = spawn(1, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    unseen.add_ench(ENCH_INVIS);
    monster& ally = spawn(2, you.pos() + coord_def(3, 0), ATT_FRIENDLY);
    you.spells[0] = SPELL_DISCHARGE;
    you.spell_no = 1;
    CHECK_FALSE(you.can_see(unseen));
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(ally.hit_points == ally.max_hit_points);
    ally.base_attitude = ATT_NEUTRAL;
    CHECK_FALSE(automaton::trigger_attack(target));
    ally.base_attitude = ATT_HOSTILE;
    ally.props["party_player_slot"].get_int() = 1;
    CHECK_FALSE(automaton::trigger_attack(target));
}

TEST_CASE_METHOD(engraving_fixture, "Untargeted combat engravings select nearby hostiles",
                 "[automaton]")
{
    spell_type spell = GENERATE(SPELL_SCORCH, SPELL_HAILSTORM, SPELL_IRRADIATE,
                                SPELL_ISKENDERUNS_MYSTIC_BLAST);
    const coord_def target = you.pos()
                             + coord_def(spell == SPELL_ISKENDERUNS_MYSTIC_BLAST
                                         || spell == SPELL_IRRADIATE ? 1 : 3, 0);
    spawn(0, target, ATT_HOSTILE);
    CHECK(automaton::safe_area_engraving(spell));
}

TEST_CASE_METHOD(engraving_fixture, "Automatic binding sigils protect allies and preserve their owner",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.hp = you.hp_max = 100;
    you.spells[0] = SPELL_SIGIL_OF_BINDING;
    you.spell_no = 1;
    REQUIRE(automaton::has_automatic_trigger(SPELL_SIGIL_OF_BINDING));
    CHECK(automaton::engraving_guidance(SPELL_SIGIL_OF_BINDING).find("protected") != string::npos);
    REQUIRE(automaton::trigger_attack(target));
    map_terrain_change_marker* sigil = nullptr;
    for (map_marker* mark : env.markers.get_all(MAT_TERRAIN_CHANGE))
    {
        auto* change = static_cast<map_terrain_change_marker*>(mark);
        if (change->change_type == TERRAIN_CHANGE_BINDING_SIGIL)
        {
            sigil = change;
            break;
        }
    }
    REQUIRE(sigil);
    const coord_def cell = sigil->pos;
    CHECK(sigil->power == -1);
    CHECK(automatic_binding_sigil_at(cell));
    env.map_knowledge(cell).set_feature(DNGN_BINDING_SIGIL);
    bool prompted = false;
    CHECK(check_terrain_warnings(vector<coord_def>{cell}, "step", "", &prompted));
    CHECK_FALSE(prompted);
    const coord_def start = you.pos();
    const int no_momentum = you.duration[DUR_NO_MOMENTUM];
    you.set_position(cell);
    trigger_binding_sigil(you);
    CHECK(you.duration[DUR_NO_MOMENTUM] == no_momentum);
    CHECK(env.grid(cell) == DNGN_BINDING_SIGIL);
    you.set_position(start);
    vector<unsigned char> bytes;
    writer output(&bytes);
    sigil->write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    REQUIRE(unmarshallShort(input) == MAT_TERRAIN_CHANGE);
    unique_ptr<map_marker> restored(map_terrain_change_marker::read(input, MAT_TERRAIN_CHANGE));
    const auto* terrain = dynamic_cast<const map_terrain_change_marker*>(restored.get());
    REQUIRE(terrain);
    CHECK(terrain->power == -1);
    CHECK(terrain->source_mid == you.mid);
    monster& visitor = spawn(1, cell, ATT_FRIENDLY);
    trigger_binding_sigil(visitor);
    CHECK_FALSE(visitor.has_ench(ENCH_BOUND));
    CHECK(env.grid(cell) == DNGN_BINDING_SIGIL);
    visitor.base_attitude = ATT_NEUTRAL;
    trigger_binding_sigil(visitor);
    CHECK_FALSE(visitor.has_ench(ENCH_BOUND));
    visitor.base_attitude = ATT_HOSTILE;
    trigger_binding_sigil(visitor);
    CHECK(visitor.has_ench(ENCH_BOUND));
    CHECK(env.grid(cell) != DNGN_BINDING_SIGIL);
    CHECK_FALSE(automatic_binding_sigil_at(cell));
}

TEST_CASE_METHOD(engraving_fixture, "Visible automatic sigils explain protected passage",
                 "[automaton]")
{
    const coord_def cell = you.pos() + coord_def(1, 0);
    const coord_def distant = you.pos() + coord_def(12, 0);
    env.grid(distant) = DNGN_FLOOR;
    SECTION("visible automatic sigil")
    {
        temp_change_terrain(cell, DNGN_BINDING_SIGIL, 100,
                            TERRAIN_CHANGE_BINDING_SIGIL, you.mid, -1);
        env.map_knowledge(cell).set_feature(DNGN_BINDING_SIGIL);
        invalidate_los();
        REQUIRE(you.see_cell(cell));
        describe_info info;
        get_feature_desc(cell, info, false);
        CHECK(info.body.str().find("Friendly, neutral and protected creatures pass safely")
              != string::npos);
        CHECK(info.body.str().find("susceptible hostile creatures trigger this sigil")
              != string::npos);
    }
    SECTION("visible manual sigil")
    {
        temp_change_terrain(cell, DNGN_BINDING_SIGIL, 100,
                            TERRAIN_CHANGE_BINDING_SIGIL, you.mid, 0);
        env.map_knowledge(cell).set_feature(DNGN_BINDING_SIGIL);
        invalidate_los();
        REQUIRE(you.see_cell(cell));
        describe_info info;
        get_feature_desc(cell, info, false);
        CHECK(info.body.str().find("protected creatures pass safely") == string::npos);
    }
    SECTION("remembered but unseen automatic sigil")
    {
        temp_change_terrain(distant, DNGN_BINDING_SIGIL, 100,
                            TERRAIN_CHANGE_BINDING_SIGIL, you.mid, -1);
        env.map_knowledge(distant).set_feature(DNGN_BINDING_SIGIL);
        invalidate_los();
        REQUIRE_FALSE(you.see_cell(distant));
        describe_info info;
        get_feature_desc(distant, info, false);
        CHECK(info.body.str().find("protected creatures pass safely") == string::npos);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Automatic binding sigils use their inactive party owner",
                 "[automaton]")
{
    const coord_def leader = you.pos();
    you.hp = you.hp_max = 100;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(leader + coord_def(2, 0));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    const coord_def cell = leader + coord_def(1, 1);
    temp_change_terrain(cell, DNGN_BINDING_SIGIL, 100,
                        TERRAIN_CHANGE_BINDING_SIGIL, you.mid, -1);
    monster& visitor = spawn(0, cell, ATT_HOSTILE);
    {
        party::scoped_player_context ctx(1);
        trigger_binding_sigil(visitor);
        REQUIRE(visitor.has_ench(ENCH_BOUND));
        CHECK(visitor.get_ench(ENCH_BOUND).source == party::mid_for_slot(0));
        CHECK(party::active_slot() == 1);
    }
    CHECK(party::active_slot() == 0);
}

TEST_CASE_METHOD(engraving_fixture, "Area engravings do not hurt allies",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(0, 1), ATT_FRIENDLY);
    you.spells[0] = GENERATE(SPELL_ISKENDERUNS_MYSTIC_BLAST, SPELL_IRRADIATE);
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "LOS hex engravings activate against susceptible hostiles",
                 "[automaton]")
{
    const spell_type spell = GENERATE(SPELL_ENGLACIATION, SPELL_MASS_CONFUSION,
                                      SPELL_ANGUISH);
    const enchant_type enchant = spell == SPELL_ENGLACIATION ? ENCH_SLOW
                                  : spell == SPELL_MASS_CONFUSION ? ENCH_CONFUSION
                                  : ENCH_ANGUISH;
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    you.hp = you.hp_max = 100;
    you.spells[0] = spell;
    you.spell_no = 1;
    CHECK(automaton::has_automatic_trigger(spell));
    CHECK(automaton::engraving_guidance(spell).find("attack") != string::npos);
    REQUIRE(automaton::safe_area_engraving(spell));
    rng::seed(8128);
    REQUIRE(automaton::trigger_attack(target));
    CHECK(foe.has_ench(enchant));
    CHECK_FALSE(automaton::safe_area_engraving(spell));
}

TEST_CASE_METHOD(engraving_fixture, "LOS hex engravings protect unseen allies and neutrals",
                 "[automaton]")
{
    const spell_type spell = GENERATE(SPELL_ENGLACIATION, SPELL_MASS_CONFUSION,
                                      SPELL_ANGUISH);
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(2, 1), ATT_FRIENDLY);
    ally.add_ench(ENCH_INVIS);
    REQUIRE(ally.invisible());
    you.spells[0] = spell;
    you.spell_no = 1;
    CHECK_FALSE(automaton::trigger_attack(target));
    ally.base_attitude = ATT_NEUTRAL;
    REQUIRE_FALSE(you.can_see(ally));
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK_FALSE(ally.has_ench(ENCH_SLOW));
    CHECK_FALSE(ally.has_ench(ENCH_CONFUSION));
    CHECK_FALSE(ally.has_ench(ENCH_ANGUISH));
}

TEST_CASE_METHOD(engraving_fixture, "Englaciation engraving does not waste heat on cold-immune foes",
                 "[automaton]")
{
    monster& foe = spawn(0, you.pos() + coord_def(3, 0), ATT_HOSTILE);
    foe.type = MONS_ICE_BEAST;
    REQUIRE(foe.res_cold() > 0);
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_ENGLACIATION));
}

TEST_CASE_METHOD(engraving_fixture, "Starburst engravings aim their eight-way fan",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    REQUIRE(automaton::safe_area_engraving(SPELL_STARBURST));
    const coord_def aim = automaton::area_engraving_aim(SPELL_STARBURST, you.pos());
    CHECK(aim != you.pos());
    const int power = calc_spell_power(SPELL_STARBURST);
    auto area = find_spell_targeter(SPELL_STARBURST, power,
                                    spell_range(SPELL_STARBURST, &you, power));
    REQUIRE(area);
    REQUIRE(area->set_aim(aim));
    CHECK(area->is_affected(target) > AFF_NO);
    CHECK(automaton::area_engraving_aim(SPELL_HAILSTORM, you.pos()) == you.pos());
}

TEST_CASE_METHOD(engraving_fixture, "Starburst engravings avoid allies in the fan",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(0, 2), ATT_FRIENDLY);
    you.spells[0] = SPELL_STARBURST;
    you.spell_no = 1;
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_STARBURST));
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Manifold Assault engravings trigger from melee only",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(2, 1), ATT_FRIENDLY);
    set_skill_level(SK_UNARMED_COMBAT, 20, true);
    you.spells[0] = SPELL_MANIFOLD_ASSAULT;
    you.spell_no = 1;
    CHECK_FALSE(automaton::trigger_attack(target, true));
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_MANIFOLD_ASSAULT));
    for (int attempt = 0; attempt < 10 && foe.hit_points == foe.max_hit_points; ++attempt)
    {
        you.magic_points = you.max_magic_points;
        you.elapsed_time += 100;
        REQUIRE(automaton::trigger_attack(target));
    }
    CHECK(ally.hit_points == ally.max_hit_points);
    CHECK(foe.hit_points < foe.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Arcjolt engraving checks allies reached by the chain",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    CHECK(automaton::safe_area_engraving(SPELL_ARCJOLT));
    spawn(1, you.pos() + coord_def(3, 0), ATT_FRIENDLY);
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_ARCJOLT));
}

TEST_CASE_METHOD(engraving_fixture, "Arcjolt does not chain through invisible foes into allies",
                 "[automaton]")
{
    spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    monster& hidden = spawn(1, you.pos() + coord_def(3, 0), ATT_HOSTILE);
    hidden.add_ench(mon_enchant(ENCH_INVIS));
    REQUIRE_FALSE(you.can_see(hidden));
    spawn(2, you.pos() + coord_def(4, 0), ATT_FRIENDLY);
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_ARCJOLT));
}

TEST_CASE_METHOD(engraving_fixture, "Refrigeration engraving protects invisible allies",
                 "[automaton]")
{
    spawn(0, you.pos() + coord_def(3, 0), ATT_HOSTILE);
    CHECK(automaton::safe_area_engraving(SPELL_OZOCUBUS_REFRIGERATION));
    monster& ally = spawn(1, you.pos() + coord_def(2, 1), ATT_FRIENDLY);
    ally.add_ench(mon_enchant(ENCH_INVIS));
    REQUIRE(ally.has_ench(ENCH_INVIS));
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_OZOCUBUS_REFRIGERATION));
}

TEST_CASE_METHOD(engraving_fixture, "Ignition engraving uses its ally-shielded blast geometry",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    spawn(1, target + coord_def(0, 1), ATT_FRIENDLY);
    CHECK(automaton::safe_area_engraving(SPELL_IGNITION));
}

TEST_CASE_METHOD(engraving_fixture, "Refrigeration engraving protects unseen neutral monsters",
                 "[automaton]")
{
    spawn(0, you.pos() + coord_def(3, 0), ATT_HOSTILE);
    monster& neutral = spawn(1, you.pos() + coord_def(2, 1), ATT_NEUTRAL);
    neutral.add_ench(mon_enchant(ENCH_INVIS));
    REQUIRE_FALSE(you.can_see(neutral));
    CHECK_FALSE(automaton::safe_area_engraving(SPELL_OZOCUBUS_REFRIGERATION));
}

TEST_CASE_METHOD(engraving_fixture, "Forgecraft engravings create friendly constructs in combat",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_FORGE_LIGHTNING_SPIRE;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_FORGE_LIGHTNING_SPIRE));
    bool friendly_spire = false;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_LIGHTNING_SPIRE && mi->friendly())
            friendly_spire = true;
    CHECK(friendly_spire);
}

TEST_CASE_METHOD(engraving_fixture, "Ice Thorns engravings surround a hostile target",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_ICE_THORNS;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::safe_attack_engraving(SPELL_ICE_THORNS, target));
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_ICE_THORNS));
    CHECK(env.grid(target + coord_def(1, 0)) == DNGN_ICE_THORNS);
}

TEST_CASE_METHOD(engraving_fixture, "Ice Thorns engravings avoid allied occupants",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, target + coord_def(0, 1), ATT_FRIENDLY);
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_ICE_THORNS, target));
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Ice Thorns avoid an ally outside the visible preview",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(LOS_RADIUS - 1, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, target + coord_def(1, 0), ATT_FRIENDLY);
    invalidate_los();
    REQUIRE(you.can_see(*monster_at(target)));
    REQUIRE_FALSE(you.see_cell_no_trans(ally.pos()));
    CHECK_FALSE(automaton::safe_attack_engraving(SPELL_ICE_THORNS, target));
}

TEST_CASE_METHOD(engraving_fixture, "Prism engravings choose an empty safe square near an enemy",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(4, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_FULMINANT_PRISM;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_FULMINANT_PRISM));
    bool found = false;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_FULMINANT_PRISM && mi->friendly())
        {
            CHECK(grid_distance(mi->pos(), target) == 1);
            CHECK(grid_distance(mi->pos(), you.pos()) > 2);
            found = true;
        }
    CHECK(found);
}

TEST_CASE_METHOD(engraving_fixture, "Prism engravings do not place blasts near allies",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(4, 0);
    spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(3, 0), ATT_FRIENDLY);
    you.spells[0] = SPELL_FULMINANT_PRISM;
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Summoning engravings create friendly allies in combat",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_SUMMON_ICE_BEAST;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_SUMMON_ICE_BEAST));
    bool friendly_beast = false;
    for (monster_iterator mi; mi; ++mi)
        if (mi->type == MONS_ICE_BEAST && mi->friendly())
            friendly_beast = true;
    CHECK(friendly_beast);
}

TEST_CASE_METHOD(engraving_fixture, "Dragon's Call engraving respects its active call and cooldown",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_DRAGON_CALL;
    you.spell_no = 1;
    SECTION("active call") { you.duration[DUR_DRAGON_CALL] = 20; }
    SECTION("cooldown") { you.duration[DUR_DRAGON_CALL_COOLDOWN] = 20; }
    const int before = you.magic_points;
    CHECK_FALSE(automaton::summon_attack_engraving_ready(SPELL_DRAGON_CALL));
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
}

TEST_CASE_METHOD(engraving_fixture, "Dragon's Call engraving is eligible when its call is ready",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_DRAGON_CALL;
    you.spell_no = 1;
    CHECK(automaton::summon_attack_engraving_ready(SPELL_DRAGON_CALL));
}

TEST_CASE_METHOD(engraving_fixture, "Summon Forest never activates automatically",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_SUMMON_FOREST;
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
    CHECK(you.duration[DUR_FORESTED] == 0);
}

TEST_CASE_METHOD(engraving_fixture, "Foxfire engravings create aligned seekers when space permits",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(1, 0), ATT_FRIENDLY);
    you.spells[0] = SPELL_FOXFIRE;
    you.spell_no = 1;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before - spell_mana(SPELL_FOXFIRE));
    int seekers = 0;
    for (monster_iterator mi; mi; ++mi)
    {
        if (mi->type != MONS_FOXFIRE)
            continue;
        ++seekers;
        CHECK(mi->friendly());
        CHECK(mons_aligned(*mi, &ally));
        CHECK_FALSE(mons_aligned(*mi, &foe));
    }
    CHECK(seekers == 2);
    CHECK(ally.hit_points == ally.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Foxfire engravings do not trigger without open adjacent space",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    spawn(0, target, ATT_HOSTILE);
    for (adjacent_iterator ai(you.pos()); ai; ++ai)
        env.grid(*ai) = DNGN_ROCK_WALL;
    you.spells[0] = SPELL_FOXFIRE;
    you.spell_no = 1;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
}

TEST_CASE_METHOD(engraving_fixture, "Summoning engravings decline hazardous auras",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_SUMMON_ICE_BEAST;
    you.spell_no = 1;
    you.duration[DUR_TOXIC_RADIANCE] = 10;
    const int before = you.magic_points;
    CHECK_FALSE(automaton::trigger_attack(target));
    CHECK(you.magic_points == before);
}

TEST_CASE_METHOD(engraving_fixture, "Dispersal engraving is reserved for safe escapes",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_DISPERSAL;
    you.spell_no = 1;
    you.hp_max = 100;
    you.hp = 100;
    CHECK_FALSE(automaton::trigger_escape());
    CHECK_FALSE(automaton::trigger_attack(target));
    monster& ally = spawn(1, you.pos() + coord_def(1, 1), ATT_FRIENDLY);
    you.hp = 25;
    CHECK_FALSE(automaton::trigger_escape());
    CHECK(ally.pos() == you.pos() + coord_def(1, 1));
    ally.base_attitude = ATT_HOSTILE;
    const int before = you.magic_points;
    REQUIRE(automaton::trigger_escape());
    CHECK(you.magic_points == before - spell_mana(SPELL_DISPERSAL));
}

TEST_CASE_METHOD(engraving_fixture, "Cause Fear engraving protects allies when escaping",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(2, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(1, 1), ATT_FRIENDLY);
    you.spells[0] = SPELL_CAUSE_FEAR;
    you.spell_no = 1;
    you.hp_max = 100;
    you.hp = 100;
    CHECK_FALSE(automaton::trigger_escape());
    CHECK_FALSE(automaton::trigger_attack(target));
    you.hp = 25;
    for (int attempt = 0; attempt < 15 && !foe.has_ench(ENCH_FEAR); ++attempt)
    {
        you.magic_points = you.max_magic_points;
        you.elapsed_time += 100;
        REQUIRE(automaton::trigger_escape());
    }
    CHECK(foe.has_ench(ENCH_FEAR));
    CHECK_FALSE(ally.has_ench(ENCH_FEAR));
}

TEST_CASE_METHOD(engraving_fixture, "Escape engravings require danger and low health",
                 "[automaton]")
{
    const coord_def target = you.pos() + coord_def(1, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_SWIFTNESS;
    you.spell_no = 1;
    you.hp_max = 20;
    you.hp = 6;
    CHECK_FALSE(automaton::trigger_escape());
    you.hp = 5;
    you.time_taken = 8;
    you.turn_is_over = true;
    REQUIRE(automaton::trigger_escape());
    CHECK(you.duration[DUR_SWIFTNESS] > 0);
    CHECK(you.time_taken == 8);
    CHECK(you.turn_is_over);
}

TEST_CASE_METHOD(engraving_fixture, "Damage triggers escape engravings except for poison",
                 "[automaton]")
{
    monster& foe = spawn(0, you.pos() + coord_def(1, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_SWIFTNESS;
    you.spell_no = 1;
    you.hp_max = 20;
    you.hp = 8;
    you.time_taken = 8;
    you.turn_is_over = true;
    SECTION("an enemy hit triggers escape at one quarter health")
    {
        ouch(3, KILLED_BY_MONSTER, foe.mid, nullptr, nullptr, true);
        CHECK(you.hp == 5);
        CHECK(you.duration[DUR_SWIFTNESS] > 0);
        CHECK(you.time_taken == 8);
        CHECK(you.turn_is_over);
    }
    SECTION("poison damage does not trigger escape")
    {
        ouch(3, KILLED_BY_POISON, foe.mid, nullptr, nullptr, true);
        CHECK(you.hp == 5);
        CHECK(you.duration[DUR_SWIFTNESS] == 0);
    }
}

TEST_CASE_METHOD(engraving_fixture, "Encounter engravings remember visible threats per hero",
                 "[automaton]")
{
    spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_OZOCUBUS_ARMOUR;
    you.spell_no = 1;
    you.time_taken = 8;
    you.turn_is_over = true;
    automaton::observe_encounter();
    REQUIRE(you.duration[DUR_ICY_ARMOUR] > 0);
    CHECK(you.time_taken == 8);
    CHECK(you.turn_is_over);
    const int after_first = you.magic_points;
    you.duration[DUR_ICY_ARMOUR] = 0;
    you.elapsed_time += 100;
    automaton::observe_encounter();
    CHECK(you.magic_points == after_first);
    CHECK(you.duration[DUR_ICY_ARMOUR] == 0);
    player second;
    second.species = SP_AUTOMATON;
    CHECK_FALSE(second.props.exists("automaton_visible_threats"));
    spawn(1, you.pos() + coord_def(2, 1), ATT_HOSTILE);
    automaton::observe_encounter();
    CHECK(you.magic_points < after_first);
    CHECK(you.duration[DUR_ICY_ARMOUR] > 0);
}

TEST_CASE_METHOD(engraving_fixture, "Each party member observes encounters in their own context",
                 "[automaton]")
{
    spawn(0, you.pos() + coord_def(2, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_OZOCUBUS_ARMOUR;
    you.spell_no = 1;
    you.time_taken = 8;
    you.turn_is_over = true;
    you.hp = you.hp_max = 20;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(you.pos() + coord_def(0, 1));
    party::set_multiplayer(true);
    party::sync_all_proxies();
    seen_monsters_react();
    CHECK(you.duration[DUR_ICY_ARMOUR] > 0);
    CHECK(other.duration[DUR_ICY_ARMOUR] > 0);
    CHECK(you.magic_points < you.max_magic_points);
    CHECK(other.magic_points < other.max_magic_points);
    CHECK(you.props.exists("automaton_visible_threats"));
    CHECK(other.props.exists("automaton_visible_threats"));
}

TEST_CASE_METHOD(engraving_fixture, "Ranged engravings fire after an action without a weapon attack",
                 "[automaton][automaton-action]")
{
    monster& foe = spawn(0, you.pos() + coord_def(4, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    you.time_taken = 8;
    you.turn_is_over = true;
    you.last_cast_spell = SPELL_BLINK;
    SECTION("waiting in place") {}
    SECTION("moving before the reaction")
    {
        you.set_position(you.pos() + coord_def(0, 1));
        invalidate_los();
    }
    const int before = you.magic_points;
    rng::seed(8128);
    automaton::react_to_action();
    CHECK(foe.hit_points < foe.max_hit_points);
    CHECK(you.magic_points == before - spell_mana(SPELL_MAGIC_DART));
    CHECK(you.time_taken == 8);
    CHECK(you.turn_is_over);
    CHECK(you.last_cast_spell == SPELL_BLINK);
    CHECK(you.props["automaton_combat_heat_until"].get_int() > you.elapsed_time);
    automaton::react_to_action();
    CHECK(you.magic_points == before - spell_mana(SPELL_MAGIC_DART));
    ++you.num_turns;
    automaton::react_to_action();
    CHECK(you.magic_points == before - spell_mana(SPELL_MAGIC_DART));
    ++you.num_turns;
    you.elapsed_time += 100;
    automaton::react_to_action();
    CHECK(you.magic_points == before - 2 * spell_mana(SPELL_MAGIC_DART));
}

TEST_CASE_METHOD(engraving_fixture, "Summoning engravings work while distant foes are visible",
                 "[automaton][automaton-action]")
{
    spawn(0, you.pos() + coord_def(5, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_PHALANX_BEETLE;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    const int before = you.magic_points;
    automaton::react_to_action();
    CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
    CHECK(you.magic_points == before - spell_mana(SPELL_PHALANX_BEETLE));
    ++you.num_turns;
    you.elapsed_time += 100;
    automaton::react_to_action();
    CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
    CHECK(you.magic_points == before - spell_mana(SPELL_PHALANX_BEETLE));
}

TEST_CASE_METHOD(engraving_fixture, "Action engravings require an action and a safe reachable threat",
                 "[automaton][automaton-action]")
{
    const coord_def target = you.pos() + coord_def(4, 0);
    monster& foe = spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    SECTION("zero time") { you.time_taken = 0; }
    SECTION("menu or cancelled action") { you.turn_is_over = false; }
    SECTION("paralysed") { you.duration[DUR_PARALYSIS] = 10; }
    SECTION("no remaining thermal capacity") { you.magic_points = 0; }
    SECTION("non automaton") { you.species = SP_HUMAN; }
    SECTION("only friendly creatures") { foe.base_attitude = ATT_FRIENDLY; }
    SECTION("only neutral creatures") { foe.base_attitude = ATT_NEUTRAL; }
    SECTION("out of spell range") { you.spells[0] = SPELL_FREEZE; }
    SECTION("an ally blocks the beam")
    {
        spawn(1, you.pos() + coord_def(2, 0), ATT_FRIENDLY);
    }
    SECTION("Manifold Assault needs a melee attack")
    {
        you.spells[0] = SPELL_MANIFOLD_ASSAULT;
    }
    const int before = you.magic_points;
    automaton::react_to_action();
    CHECK(you.magic_points == before);
    CHECK(foe.hit_points == foe.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Action engravings try another foe when the nearest target is unsafe",
                 "[automaton][automaton-action]")
{
    monster& blocked = spawn(0, you.pos() + coord_def(3, 0), ATT_HOSTILE);
    monster& ally = spawn(1, you.pos() + coord_def(2, 0), ATT_FRIENDLY);
    monster& clear = spawn(2, you.pos() + coord_def(0, 4), ATT_HOSTILE);
    you.spells[0] = SPELL_MAGIC_DART;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    rng::seed(8128);
    automaton::react_to_action();
    CHECK(blocked.hit_points == blocked.max_hit_points);
    CHECK(ally.hit_points == ally.max_hit_points);
    CHECK(clear.hit_points < clear.max_hit_points);
}

TEST_CASE_METHOD(engraving_fixture, "Attacking cannot also gain an action engraving",
                 "[automaton][automaton-action]")
{
    const coord_def target = you.pos() + coord_def(4, 0);
    spawn(0, target, ATT_HOSTILE);
    you.spells[0] = SPELL_MAGIC_DART;
    you.spells[1] = SPELL_PHALANX_BEETLE;
    you.spell_no = 2;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    REQUIRE(automaton::trigger_attack(target, true));
    const int after_attack = you.magic_points;
    automaton::react_to_action();
    CHECK(you.magic_points == after_attack);
}

TEST_CASE_METHOD(engraving_fixture, "Encounter observation does not fire offensive engravings for another hero",
                 "[automaton][automaton-action]")
{
    spawn(0, you.pos() + coord_def(4, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_PHALANX_BEETLE;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    const int before = you.magic_points;
    automaton::observe_encounter();
    CHECK(you.magic_points == before);
    CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 0);
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.set_position(you.pos() + coord_def(-2, 0));
    automaton::react_to_action();
    REQUIRE(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
    CHECK(other.magic_points == before);
    {
        party::scoped_player_context context(1, true);
        automaton::react_to_action();
        CHECK(count_summons(&you, SPELL_PHALANX_BEETLE) == 1);
        CHECK(you.magic_points == before - spell_mana(SPELL_PHALANX_BEETLE));
    }
    CHECK(you.magic_points == before - spell_mana(SPELL_PHALANX_BEETLE));
}

TEST_CASE_METHOD(engraving_fixture, "Action engravings keep the bee's three-turn winding",
                 "[automaton][automaton-action]")
{
    spawn(0, you.pos() + coord_def(4, 0), ATT_HOSTILE);
    you.spells[0] = SPELL_CLOCKWORK_BEE;
    you.spell_no = 1;
    you.time_taken = BASELINE_DELAY;
    you.turn_is_over = true;
    automaton::react_to_action();
    automaton::advance_bee_engraving();
    REQUIRE(automaton::bee_winding_remaining(you) == 3 * BASELINE_DELAY);
    for (int turns = 2; turns >= 0; --turns)
    {
        ++you.num_turns;
        you.elapsed_time += BASELINE_DELAY;
        automaton::react_to_action();
        automaton::advance_bee_engraving();
        CHECK(automaton::bee_winding_remaining(you) == turns * BASELINE_DELAY);
    }
    CHECK(count_summons(&you, SPELL_CLOCKWORK_BEE) == 1);
}
