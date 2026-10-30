#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "beam.h"
#include "god-abil.h"
#include "skills.h"
#include "areas.h"
#include "branch.h"
#include "colour.h"
#include "dungeon.h"
#include "env.h"
#include "feature.h"
#include "fineff.h"
#include "god-passive.h"
#include "libunix.h"
#include "losglobal.h"
#include "message.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "quiver.h"
#include "religion.h"
#include "startup.h"
#include "spl-util.h"
#include "status.h"
#include "tags.h"
#include "target-dithmenos.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "transform.h"

namespace
{
struct dithmenos_fixture : MockPlayerYouTestsFixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    int old_max_mon_index = env.max_mon_index;

    dithmenos_fixture()
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
        init_zap_index();
        init_spell_descs();
        init_spell_name_cache();
        enter_headless_mode();
        cio_init();
        cgotoxy(1, 1);
        party::set_multiplayer(false);
        party::set_player_count(1);
        you.religion = GOD_DITHMENOS;
        you.raw_piety = MAX_PIETY;
        you.penance[GOD_DITHMENOS] = 0;
        you.current_vision = you.normal_vision = 7;
        you.where_are_you = BRANCH_DUNGEON;
        brdepth[BRANCH_DUNGEON] = 15;
        you.depth = 1;
        you.on_current_level = true;
        you.set_position(coord_def(40, 35));
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        invalidate_los();
        invalidate_agrid(true);
    }

    ~dithmenos_fixture()
    {
        clear_final_effects();
        dgn_reset_level(false);
        env.max_mon_index = old_max_mon_index;
        brdepth[BRANCH_DUNGEON] = old_depth;
        invalidate_los();
        invalidate_agrid(true);
    }

    monster& enemy_at(coord_def position)
    {
        monster& mon = env.mons[0];
        mon.reset();
        mon.type = MONS_RAT;
        mon.set_new_monster_id();
        mon.hit_points = mon.max_hit_points = 10000;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(position);
        env.mgrid(position) = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        invalidate_agrid(true);
        return mon;
    }
};
}

TEST_CASE_METHOD(dithmenos_fixture, "Classic Dithmenos unlocks the original kit", "[dithmenos]")
{
    for (int piety = 0; piety <= MAX_PIETY; ++piety)
    {
        you.raw_piety = piety;
        CAPTURE(piety);
        CHECK(have_passive(passive_t::umbra) == (piety >= piety_breakpoint(0)));
        CHECK(have_passive(passive_t::nightvision) == (piety >= piety_breakpoint(0)));
        CHECK(have_passive(passive_t::hit_smoke) == (piety >= piety_breakpoint(2)));
        CHECK(have_passive(passive_t::shadow_attacks) == (piety >= piety_breakpoint(3)));
        CHECK(have_passive(passive_t::shadow_spells) == (piety >= piety_breakpoint(3)));
        CHECK_FALSE(have_passive(passive_t::dampen_noise));
        const int radius = piety < piety_breakpoint(0) ? -1
            : min(piety, 160) * 7 / 160;
        CHECK(you.umbra_radius() == radius);
    }
    you.penance[GOD_DITHMENOS] = 1;
    CHECK_FALSE(have_passive(passive_t::umbra));
    CHECK_FALSE(have_passive(passive_t::shadow_spells));
    CHECK(you.umbra_radius() == -1);

    vector<ability_type> granted;
    for (const god_power& power : get_god_powers(GOD_DITHMENOS))
        if (power.abil != ABIL_NON_ABILITY)
            granted.push_back(power.abil);
    CHECK(granted == vector<ability_type>{ABIL_DITHMENOS_SHADOW_STEP, ABIL_DITHMENOS_SHADOW_FORM});
    CHECK(is_evil_god(GOD_DITHMENOS));
}

TEST_CASE_METHOD(dithmenos_fixture, "Dithmenos radius respects species LOS and leaves Yred unchanged", "[dithmenos]")
{
    for (int vision : {5, 6, 7, 8})
    {
        CHECK(dithmenos_umbra_radius(160, vision) == vision);
        CHECK(dithmenos_umbra_radius(200, vision) == vision);
        CHECK(dithmenos_umbra_radius(80, vision) == vision / 2);
    }
    you.religion = GOD_YREDELEMNUL;
    you.raw_piety = 40;
    CHECK(you.umbra_radius() == 2);
    you.raw_piety = piety_breakpoint(3);
    CHECK(you.umbra_radius() == 3);
    you.raw_piety = piety_breakpoint(4);
    CHECK(you.umbra_radius() == 4);
}

TEST_CASE_METHOD(dithmenos_fixture, "Shadow Step targets hostile shadows and viable landings", "[dithmenos]")
{
    const coord_def target = you.pos() + coord_def(3, 0);
    monster& enemy = enemy_at(target);
    targeter_shadow_step step(&you, you.umbra_radius());
    CHECK_FALSE(step.valid_aim(you.pos()));
    CHECK_FALSE(step.valid_aim(you.pos() + coord_def(2, 2)));
    REQUIRE(step.valid_aim(target));
    REQUIRE(step.set_aim(target));
    CHECK(step.additional_sites.count(step.landing_site) == 1);
    CHECK(grid_distance(target, step.landing_site) == 1);
    CHECK(step.is_affected(step.landing_site) == AFF_LANDING);
    enemy.base_attitude = ATT_FRIENDLY;
    CHECK_FALSE(step.valid_aim(target));
    enemy.base_attitude = ATT_HOSTILE;
    you.raw_piety = piety_breakpoint(1);
    targeter_shadow_step small(&you, you.umbra_radius());
    CHECK_FALSE(small.valid_aim(target));
    you.raw_piety = MAX_PIETY;
    invalidate_agrid(true);
    const coord_def before = you.pos();
    REQUIRE(dithmenos_shadow_step(target, false) == spret::success);
    CHECK(you.pos() != before);
    CHECK(grid_distance(you.pos(), target) == 1);
}

TEST_CASE_METHOD(dithmenos_fixture, "Classic shadow mimics deal damage and leave no lingering monster", "[dithmenos]")
{
    rng::seed(8128);
    you.experience_level = 15;
    set_skill_level(SK_UNARMED_COMBAT, 15, true);
    set_skill_level(SK_FIGHTING, 15, true);
    monster& enemy = enemy_at(you.pos() + coord_def(1, 0));
    int mimics = 0;
    for (int i = 0; i < 80; ++i)
    {
        you.triggers_done.init(0);
        dithmenos_shadow_melee(&enemy);
        if (you.triggers_done[DID_DITH_SHADOW])
        {
            ++mimics;
            const mid_t last_mid = you.last_mid;
            dithmenos_shadow_melee(&enemy);
            CHECK(you.last_mid == last_mid);
        }
        REQUIRE(monster_at(you.pos()) == nullptr);
        REQUIRE(dithmenos_get_player_shadow() == nullptr);
    }
    CHECK(mimics > 0);
    CHECK(enemy.hit_points < enemy.max_hit_points);
    const int before_shooting = enemy.hit_points;
    for (int i = 0; i < 80; ++i)
    {
        you.triggers_done.init(0);
        dithmenos_shadow_shoot(enemy.pos(), MI_JAVELIN);
        REQUIRE(monster_at(you.pos()) == nullptr);
    }
    CHECK(enemy.hit_points < before_shooting);
}

TEST_CASE_METHOD(dithmenos_fixture, "Classic spell mimic repeats aimed offense and ignores utility spells", "[dithmenos]")
{
    rng::seed(9271);
    you.experience_level = 15;
    monster& enemy = enemy_at(you.pos() + coord_def(3, 0));
    bolt original;
    original.target = enemy.pos();
    original.flavour = BEAM_MMISSILE;
    for (int i = 0; i < 80; ++i)
    {
        you.triggers_done.init(0);
        dithmenos_shadow_spell(original, SPELL_BLINK);
        dithmenos_shadow_spell(original, SPELL_APPORTATION);
        CHECK(you.triggers_done[DID_DITH_SHADOW] == 0);
    }
    CHECK(enemy.hit_points == enemy.max_hit_points);
    int casts = 0;
    for (int i = 0; i < 80; ++i)
    {
        you.triggers_done.init(0);
        dithmenos_shadow_spell(original, SPELL_MAGIC_DART);
        casts += you.triggers_done[DID_DITH_SHADOW];
        REQUIRE(monster_at(you.pos()) == nullptr);
    }
    CAPTURE(casts, you.current_vision, you.raw_piety, have_passive(passive_t::shadow_spells), original.is_enchantment());
    CHECK(casts > 0);
    CHECK(enemy.hit_points < enemy.max_hit_points);
}

TEST_CASE_METHOD(dithmenos_fixture, "Shadow Form restores defensive powers without Shapeshifting bonuses", "[dithmenos]")
{
    const int duration = dithmenos_shadow_form_duration();
    CHECK(duration == 20);
    REQUIRE(transform(duration, transformation::shadow));
    CHECK(you.duration[DUR_TRANSFORMATION] == 20 * BASELINE_DELAY);
    you.duration[DUR_CORONA] = 100;
    CHECK(you.invisible());
    CHECK_FALSE(you.backlit());
    CHECK(you.willpower() == WILL_INVULN);
    CHECK(you.res_torment());
    CHECK(get_form()->blocked_slots == 0);
    CHECK(get_form()->ev_bonus() == 0);
    CHECK(get_form()->get_base_unarmed_damage() == 3);
    you.species = SP_MUMMY;
    CHECK_FALSE(lifeless_prevents_form(transformation::shadow));
    CHECK(lifeless_prevents_form(transformation::dragon));
    status_info info;
    REQUIRE(fill_status_info(STATUS_INVISIBLE, info));
    CHECK(info.short_text == "invisible");
}

TEST_CASE_METHOD(dithmenos_fixture, "Restored Dithmenos preserves quivered mobility and stealth scaling", "[dithmenos]")
{
    auto step = quiver::ability_to_action(ABIL_DITHMENOS_SHADOWSLIP);
    auto form = quiver::ability_to_action(ABIL_DITHMENOS_PRIMORDIAL_NIGHTFALL);
    CHECK(*step == *quiver::ability_to_action(ABIL_DITHMENOS_SHADOW_STEP));
    CHECK(*form == *quiver::ability_to_action(ABIL_DITHMENOS_SHADOW_FORM));
    CHECK(step->is_valid());
    CHECK(form->is_valid());
    CHECK_FALSE(quiver::ability_to_action(ABIL_DITHMENOS_APHOTIC_MARIONETTE)->is_valid());
    you.religion = GOD_NO_GOD;
    invalidate_agrid(true);
    const int baseline = player_stealth();
    REQUIRE(baseline > 0);
    you.religion = GOD_DITHMENOS;
    invalidate_agrid(true);
    CHECK(player_stealth() == baseline * 2);
    you.form = transformation::shadow;
    CHECK(player_stealth() == baseline * 4);
}

TEST_CASE("Saved rework hotkeys migrate to classic Dithmenos powers", "[dithmenos][save-compatibility]")
{
    const vector<pair<ability_type, ability_type>> bindings = {
        {ABIL_DITHMENOS_SHADOWSLIP, ABIL_DITHMENOS_SHADOW_STEP},
        {ABIL_DITHMENOS_PRIMORDIAL_NIGHTFALL, ABIL_DITHMENOS_SHADOW_FORM},
        {ABIL_DITHMENOS_APHOTIC_MARIONETTE, ABIL_NON_ABILITY},
        {ABIL_DITHMENOS_SHADOW_STEP, ABIL_DITHMENOS_SHADOW_STEP},
        {ABIL_DITHMENOS_SHADOW_FORM, ABIL_DITHMENOS_SHADOW_FORM},
        {ABIL_TROG_BERSERK, ABIL_TROG_BERSERK},
    };
    for (const auto& binding : bindings)
    {
        vector<unsigned char> bytes;
        writer output(&bytes);
        marshallShort(output, binding.first);
        reader input(bytes);
        CHECK(unmarshall_player_ability_binding(input) == binding.second);
    }
}
