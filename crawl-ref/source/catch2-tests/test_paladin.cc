#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability.h"
#include "auras.h"
#include "env.h"
#include "feature.h"
#include "jobs.h"
#include "los.h"
#include "mutation.h"
#include "ng-restr.h"
#include "paladin.h"
#include "party.h"
#include "player.h"
#include "spl-cast.h"
#include "spl-selfench.h"
#include "spl-util.h"
#include "skills.h"
#include "test_player_fixture.h"

namespace
{
struct aura_fixture : MockPlayerYouTestsFixture
{
    vector<dungeon_feature_type> terrain;

    aura_fixture()
    {
        init_show_table();
        you.hp = 10;
        you.hp_max = 50;
        you.set_position(coord_def(40, 35));
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        for (int y = 28; y <= 42; ++y)
            for (int x = 33; x <= 47; ++x)
            {
                terrain.push_back(env.grid(coord_def(x, y)));
                env.grid(coord_def(x, y)) = DNGN_FLOOR;
            }
        los_changed();
        party::set_player_count(1);
    }

    ~aura_fixture()
    {
        party::set_multiplayer(false);
        for (int i = 1; i < party::MAX_PARTY_PLAYERS; ++i)
            party::get_player(i).save = nullptr;
        party::set_player_count(1);
        int i = 0;
        for (int y = 28; y <= 42; ++y)
            for (int x = 33; x <= 47; ++x)
                env.grid(coord_def(x, y)) = terrain[i++];
        los_changed();
    }

    void add_companion(int slot, int power, spell_type spell = SPELL_AURA_OF_PROTECTION)
    {
        player& member = party::get_player(slot);
        member = you;
        member.save = nullptr;
        member.mid = party::mid_for_slot(slot);
        member.set_position(you.pos() + coord_def(slot, 0));
        member.props["active_aura_pow"] = power;
        member.props["active_aura_spell"] = static_cast<int>(spell);
        member.duration[DUR_PALADIN_ZEAL] = 100;
    }
};
}

TEST_CASE("Paladin replaces Priest without changing the historical job identity", "[paladin]")
{
    init_spell_descs();
    CHECK(is_starting_job(JOB_PALADIN));
#if TAG_MAJOR_VERSION == 34
    CHECK_FALSE(is_starting_job(JOB_PRIEST));
    CHECK(string(get_job_name(JOB_PRIEST)) == "Priest");
#endif
    for (species_type species : {SP_DEMIGOD, SP_DEMONSPAWN, SP_MUMMY, SP_REVENANT})
    {
        CAPTURE(species);
        CHECK_FALSE(character_is_allowed(species, JOB_PALADIN));
        CHECK(job_allowed(species, JOB_PALADIN) == CC_BANNED);
        CHECK(species_allowed(JOB_PALADIN, species) == CC_BANNED);
    }
    CHECK(character_is_allowed(SP_HUMAN, JOB_PALADIN));
    CHECK(character_is_allowed(SP_DEMIGOD, JOB_FIGHTER));
    CHECK_FALSE(job_gets_good_weapons(JOB_PALADIN));
    CHECK(get_job_spells(JOB_PALADIN).size() == 5);
    CHECK(spell_difficulty(SPELL_AURA_OF_PROTECTION) == 1);
    CHECK(spell_difficulty(SPELL_AURA_OF_ZEAL) == 3);
    CHECK(spell_difficulty(SPELL_AURA_OF_SANCTUARY) == 5);
    for (spell_type spell : auras::spells)
    {
        CAPTURE(spell);
        CHECK(!!(get_spell_disciplines(spell) & spschool::auramancy));
    }
}

TEST_CASE_METHOD(aura_fixture, "Aura stances replace each other without cleansing or instant healing", "[paladin][auras]")
{
    you.duration[DUR_POISONING] = 100;
    you.duration[DUR_CONF] = 100;
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_PROTECTION, 0, false) == spret::success);
    CHECK(you.duration[DUR_PALADIN_ZEAL] == 12 * BASELINE_DELAY);
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_VITALITY, 200, false) == spret::success);
    CHECK(you.hp == 10);
    CHECK(you.duration[DUR_POISONING] == 100);
    CHECK(you.duration[DUR_CONF] == 100);
    CHECK(you.duration[DUR_PALADIN_ZEAL] == 32 * BASELINE_DELAY);
    CHECK_FALSE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION));
    CHECK(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_VITALITY));
    CHECK(auras::power(you, SPELL_AURA_OF_VITALITY) == 100);
    CHECK(cast_aura_spell(SPELL_AURA_OF_PROTECTION, 40, true) == spret::fail);
    CHECK(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_VITALITY));
}

TEST_CASE_METHOD(aura_fixture, "Party auras require proximity, line of sight and a living caster on this floor", "[paladin][auras]")
{
    party::set_player_count(3);
    add_companion(1, 25);
    add_companion(2, 75);
    party::set_multiplayer(true);
    int power = 0;
    REQUIRE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION, &power));
    CHECK(power == 75); // Equal auras never add power together.
    party::get_player(2).depth = 2;
    REQUIRE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION, &power));
    CHECK(power == 25);
    party::get_player(1).hp = 0;
    CHECK_FALSE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION));
    party::get_player(1).hp = 10;
    party::get_player(1).set_position(you.pos() + coord_def(4, 0));
    CHECK_FALSE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION));
    party::get_player(1).set_position(you.pos() + coord_def(2, 0));
    env.grid(you.pos() + coord_def(1, 0)) = DNGN_ROCK_WALL;
    los_changed();
    CHECK_FALSE(party::has_active_aura_near(you.pos(), SPELL_AURA_OF_PROTECTION));
}

TEST_CASE_METHOD(aura_fixture, "Lay on Hands scales with faith and cannot be spammed or survive apostasy", "[paladin]")
{
    you.props["paladin_aura"] = true;
    you.religion = GOD_SHINING_ONE;
    you.raw_piety = 45;
    you.penance[GOD_SHINING_ONE] = 0;
    REQUIRE(paladin::can_intervene(true));
    const coord_def position = you.pos();
    REQUIRE(paladin::intervene(false) == spret::success);
    CHECK(you.hp > 10);
    CHECK(you.pos() == position);
    CHECK(you.duration[DUR_AEGIS_LINK] > 0);
    CHECK(you.duration[DUR_PALADIN_INTERVENE_COOLDOWN] == 30 * BASELINE_DELAY);
    const int healed_hp = you.hp;
    CHECK(paladin::intervene(false) == spret::abort);
    CHECK(you.hp == healed_hp);
    you.duration[DUR_PALADIN_INTERVENE_COOLDOWN] = 0;
    you.religion = GOD_NO_GOD;
    CHECK_FALSE(paladin::can_intervene(true));
    CHECK_FALSE(player_has_ability(ABIL_PALADIN_INTERVENE));
}

TEST_CASE_METHOD(aura_fixture, "Djinni can include a newly appended school without duplicating magic experience", "[paladin][auramancy]")
{
    you.species = SP_DJINNI;
    give_basic_mutations(SP_DJINNI);
    unsigned int before = 0;
    unsigned int count = 0;
    for (skill_type skill : magic_skills())
    {
        if (is_useless_skill(skill, false))
            continue;
        const int points = skill == SK_AURAMANCY ? 0 : 1000;
        you.skill_points[skill] = points;
        before += points;
        ++count;
    }
    cleanup_innate_magic_skills();
    unsigned int after = 0;
    for (skill_type skill : magic_skills())
    {
        if (is_useless_skill(skill, false))
            continue;
        CHECK(you.skill_points[skill] == you.skill_points[SK_AURAMANCY]);
        after += you.skill_points[skill];
    }
    CHECK(you.skill_points[SK_AURAMANCY] > 0);
    CHECK(after <= before);
    CHECK(before - after < count);
}

TEST_CASE_METHOD(aura_fixture, "Auramancy is trainable magic and expands every aura through shared rules", "[paladin][auramancy]")
{
    CHECK(is_magic_skill(SK_AURAMANCY));
    CHECK(spell_type2skill(spschool::auramancy) == SK_AURAMANCY);
    CHECK(skill2spell_type(SK_AURAMANCY) == spschool::auramancy);
    CHECK(string(skill_name(SK_AURAMANCY)) == "Auramancy");
    CHECK_FALSE(is_useless_skill(SK_AURAMANCY));
    you.train[SK_INVOCATIONS] = TRAINING_DISABLED;
    set_magic_training(TRAINING_ENABLED);
    CHECK(you.train[SK_AURAMANCY] == TRAINING_ENABLED);
    CHECK(you.train[SK_INVOCATIONS] == TRAINING_DISABLED);
    int previous_power = 0;
    for (int level : {0, 6, 12, 18, 24, 27})
    {
        you.skills[SK_AURAMANCY] = level;
        you.skill_points[SK_AURAMANCY] = skill_exp_needed(level, SK_AURAMANCY);
        CAPTURE(level);
        const int radius = 2 + min(4, level / 6);
        CHECK(auras::radius(you) == radius);
        for (spell_type spell : auras::spells)
        {
            REQUIRE(cast_aura_spell(spell, 50, false) == spret::success);
            CHECK(party::has_active_aura_near(you.pos() + coord_def(radius, 0), spell));
            CHECK_FALSE(party::has_active_aura_near(you.pos() + coord_def(radius + 1, 0), spell));
        }
        const int power = calc_spell_power(SPELL_AURA_OF_SANCTUARY);
        CHECK(power >= previous_power);
        previous_power = power;
    }
    CHECK(previous_power > 0);
}

TEST_CASE_METHOD(aura_fixture, "Passage helps allies regroup without granting self haste or speeding retreat", "[paladin][auramancy]")
{
    party::set_player_count(2);
    add_companion(1, 100, SPELL_AURA_OF_PASSAGE);
    party::get_player(1).set_position(you.pos() + coord_def(2, 0));
    party::set_multiplayer(true);
    const coord_def from = you.pos();
    CHECK(auras::movement_discount(from, from + coord_def(1, 0)) == 20);
    CHECK(auras::movement_discount(from, from - coord_def(1, 0)) == 0);
    CHECK(auras::movement_discount(from, from + coord_def(0, 1)) == 0);
    you.religion = GOD_CHEIBRIADOS;
    CHECK(auras::movement_discount(from, from + coord_def(1, 0)) == 0);
    you.religion = GOD_NO_GOD;
    party::get_player(1).depth = 2;
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_PASSAGE, 100, false) == spret::success);
    CHECK(auras::movement_discount(from, from + coord_def(1, 0)) == 0);
}

TEST_CASE_METHOD(aura_fixture, "Sanctuary transfers one share to an eligible guardian without loops or lethal payment", "[paladin][auramancy]")
{
    party::set_player_count(3);
    add_companion(1, 100, SPELL_AURA_OF_SANCTUARY);
    add_companion(2, 50, SPELL_AURA_OF_SANCTUARY);
    party::get_player(1).hp = 50;
    party::get_player(2).hp = 50;
    party::set_multiplayer(true);
    CHECK(auras::intercept_damage(20) == 14);
    CHECK(party::get_player(1).hp == 44);
    CHECK(party::get_player(2).hp == 50);
    CHECK(auras::intercept_damage(1000) == 973);
    CHECK(party::get_player(1).hp == 17);
    CHECK(auras::intercept_damage(20) == 16);
    CHECK(party::get_player(2).hp == 46);
    you.hp = you.hp_max;
    CHECK(auras::intercept_damage(20) == 20);
}

TEST_CASE_METHOD(aura_fixture, "Resonance strengthens ordinary magic without amplifying auras", "[paladin][auramancy]")
{
    you.skills[SK_CONJURATIONS] = 10;
    you.skill_points[SK_CONJURATIONS] = skill_exp_needed(10, SK_CONJURATIONS);
    const int fireball_power = calc_spell_power(SPELL_FIREBALL);
    const int aura_power = calc_spell_power(SPELL_AURA_OF_PROTECTION);
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_RESONANCE, 100, false) == spret::success);
    CHECK(calc_spell_power(SPELL_FIREBALL) > fireball_power);
    CHECK(calc_spell_power(SPELL_AURA_OF_PROTECTION) == aura_power);
}

TEST_CASE_METHOD(aura_fixture, "Aura effects scale without duplicating their formation roles", "[paladin][auramancy]")
{
    const int armour = you.armour_class();
    const int cold = player_res_cold();
    const int regen = player_regen();
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_PROTECTION, 100, false) == spret::success);
    CHECK(you.armour_class() == armour + 3);
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_RIME, 100, false) == spret::success);
    CHECK(you.armour_class() == armour);
    CHECK(player_res_cold() == cold + 1);
    REQUIRE(cast_aura_spell(SPELL_AURA_OF_VITALITY, 100, false) == spret::success);
    CHECK(player_res_cold() == cold);
    CHECK(player_regen() == regen + 200);
    you.hp = 30;
    CHECK(player_regen() == regen + 100);
}

TEST_CASE_METHOD(aura_fixture, "Ru can sacrifice Auramancy using the normal school lockout contract", "[paladin][auramancy]")
{
    CHECK_FALSE(cannot_use_schools(spschool::auramancy));
    you.mutation[MUT_NO_AURAMANCY_MAGIC] = 1;
    CHECK(cannot_use_schools(spschool::auramancy));
    CHECK(cannot_use_schools(get_spell_disciplines(SPELL_AURA_OF_PROTECTION)));
    CHECK(is_useless_skill(SK_AURAMANCY));
    CHECK_FALSE(cannot_use_schools(spschool::conjuration));
}
