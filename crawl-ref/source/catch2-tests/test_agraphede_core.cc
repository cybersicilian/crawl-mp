#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "character-trait.h"
#include "god-agraphede.h"
#include "god-passive.h"
#include "player.h"
#include "potion.h"
#include "religion.h"
#include "terrain.h"
#include "test_vellum_fixture.h"

TEST_CASE_METHOD(vellum_fixture, "Agraphede accepts living poisonable worshippers",
                 "[agraphede][agraphede-core]")
{
    CHECK(god_name(GOD_AGRAPHEDE) == "Agraphede");
    CHECK(feat_altar_god(altar_for_god(GOD_AGRAPHEDE)) == GOD_AGRAPHEDE);
    you.species = SP_HUMAN;
    CHECK(cannot_join_god_reason(GOD_AGRAPHEDE, false).empty());
    for (character_trait trait : {character_trait::mummy, character_trait::zombie,
                                  character_trait::ghost})
    {
        REQUIRE(set_character_trait(you, trait) == trait_restriction::allowed);
        CHECK_FALSE(cannot_join_god_reason(GOD_AGRAPHEDE, false).empty());
    }
    REQUIRE(set_character_trait(you, character_trait::none) == trait_restriction::allowed);
    for (species_type species : {SP_REVENANT, SP_POLTERGEIST, SP_AUTOMATON})
    {
        you.species = species;
        CHECK_FALSE(cannot_join_god_reason(GOD_AGRAPHEDE, false).empty());
    }
}

TEST_CASE_METHOD(vellum_fixture, "Agraphede defers damage as poison without free mitigation",
                 "[agraphede][agraphede-core]")
{
    CHECK(agraphede_diverted_damage(0, 200) == 0);
    CHECK(agraphede_diverted_damage(1, 200) == 1);
    CHECK(agraphede_diverted_damage(100, 200) == 50);
    you.religion = GOD_AGRAPHEDE;
    you.raw_piety = piety_breakpoint(0);
    you.penance[GOD_AGRAPHEDE] = 0;
    you.duration[DUR_POISONING] = 0;
    int damage = 50;
    const int deferred = agraphede_diverted_damage(damage, you.piety());
    agraphede_divert_damage(damage, KILLED_BY_MONSTER);
    CHECK(damage == 50 - deferred);
    CHECK(you.duration[DUR_POISONING] == deferred * 1000);
    damage = 50;
    agraphede_divert_damage(damage, KILLED_BY_POISON);
    CHECK(damage == 50);
    you.penance[GOD_AGRAPHEDE] = 1;
    agraphede_divert_damage(damage, KILLED_BY_MONSTER);
    CHECK(damage == 50);
    you.penance[GOD_AGRAPHEDE] = 0;
    you.duration[DUR_DIVINE_STAMINA] = BASELINE_DELAY;
    agraphede_divert_damage(damage, KILLED_BY_MONSTER);
    CHECK(damage == 50);
}

TEST_CASE_METHOD(vellum_fixture, "Agraphede suppresses acquired poison resistance and curing",
                 "[agraphede][agraphede-core]")
{
    you.duration[DUR_RESISTANCE] = BASELINE_DELAY * 10;
    you.religion = GOD_NO_GOD;
    CHECK(player_res_poison() > 0);
    you.religion = GOD_AGRAPHEDE;
    you.penance[GOD_AGRAPHEDE] = 0;
    CHECK(player_res_poison() == 0);
    you.duration[DUR_POISONING] = 3000;
    you.duration[DUR_CONF] = BASELINE_DELAY;
    REQUIRE(get_potion_effect(POT_CURING)->effect());
    CHECK(you.duration[DUR_POISONING] == 3000);
    CHECK(you.duration[DUR_CONF] == 0);
    you.religion = GOD_NO_GOD;
    REQUIRE(get_potion_effect(POT_CURING)->effect());
    CHECK(you.duration[DUR_POISONING] == 0);
}

TEST_CASE("Agraphede enhancer targets poison rather than all Alchemy",
          "[agraphede][agraphede-core]")
{
    CHECK(agraphede_poison_spell(SPELL_OLGREBS_TOXIC_RADIANCE));
    CHECK(agraphede_poison_spell(SPELL_ERINGYAS_ROOTSPIKE));
    CHECK(agraphede_poison_spell(SPELL_OLGREBS_LAST_MERCY));
    CHECK_FALSE(agraphede_poison_spell(SPELL_FREEZE));
}
