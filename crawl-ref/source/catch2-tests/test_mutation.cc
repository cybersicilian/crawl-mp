#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "ability-type.h"
#include "env.h"
#include "message.h"
#include "mutation.h"
#include "player.h"
#include "potion.h"
#include "random.h"
#include "species.h"
#include "test_player_fixture.h"

namespace
{
struct mutation_fixture : MockPlayerYouTestsFixture
{
    mutation_fixture()
    {
        static const bool messages = []() { msg::initialise_mpr_streams(); return true; }();
        (void)messages;
        you.set_position(coord_def(40, 35));
        env.grid(you.pos()) = DNGN_FLOOR;
        you.religion = GOD_NO_GOD;
        you.experience_level = 1;
        rng::seed(94721);
    }

    void become(species_type species)
    {
        you.species = species;
        give_basic_mutations(species);
    }

    bool can_roll(mutation_type wanted)
    {
        for (int i = 0; i < 4096; ++i)
            if (concretize_mut(RANDOM_GOOD_MUTATION) == wanted)
                return true;
        return false;
    }
};
}

TEST_CASE_METHOD(mutation_fixture,
                 "Random mutations can strengthen innate exclusive traits",
                 "[mutation][innate-mutations]")
{
    const auto trait = GENERATE(
        std::make_pair(SP_NAGA, MUT_CONSTRICTING_TAIL),
        std::make_pair(SP_BARACHI, MUT_FROG_LEGS),
        std::make_pair(SP_OCTOPODE, MUT_GELATINOUS_BODY),
        std::make_pair(SP_OCTOPODE, MUT_NIMBLE_SWIMMER),
        std::make_pair(SP_GALE_CENTAUR, MUT_STAMPEDE));
    become(trait.first);
    const mutation_type mut = trait.second;
    const int base = you.get_innate_mutation_level(mut);
    REQUIRE(base > 0);
    REQUIRE(base < get_mutation_cap(mut));
    REQUIRE(can_roll(mut));
    REQUIRE(mutate(mut, "potion of mutation", false));
    CHECK(you.get_base_mutation_level(mut) == base + 1);
    CHECK(you.get_innate_mutation_level(mut) == base);
    REQUIRE(delete_mutation(mut, "potion of mutation", false));
    CHECK(you.get_base_mutation_level(mut) == base);
    CHECK_FALSE(delete_mutation(mut, "potion of mutation", false, true));
    CHECK(you.get_innate_mutation_level(mut) == base);
}

TEST_CASE_METHOD(mutation_fixture,
                 "Exclusive traits require innate ownership in random pools",
                 "[mutation][innate-mutations]")
{
    CHECK_FALSE(can_roll(MUT_FAST));
    CHECK_FALSE(can_roll(MUT_FROG_LEGS));
    CHECK_FALSE(can_roll(MUT_DEMONIC_GUARDIAN));

    // An acquired level does not unlock an otherwise exclusive trait.
    REQUIRE(mutate(MUT_FAST, "test", false, true));
    CHECK_FALSE(can_roll(MUT_FAST));
    REQUIRE(perma_mutate(MUT_FAST, 1, "test"));
    CHECK(can_roll(MUT_FAST));
    CHECK(you.get_innate_mutation_level(MUT_FAST) == 1);
}

TEST_CASE_METHOD(mutation_fixture,
                 "Mutation upgrades respect caps and conflicting innate traits",
                 "[mutation][innate-mutations]")
{
    become(SP_MINOTAUR);
    const int base = you.get_innate_mutation_level(MUT_HORNS);
    REQUIRE(base == 2);
    REQUIRE(mutate(MUT_HORNS, "potion of mutation", false));
    CHECK(you.get_base_mutation_level(MUT_HORNS) == 3);
    CHECK_FALSE(mutate(MUT_HORNS, "potion of mutation", false, true));
    CHECK_FALSE(can_roll(MUT_HORNS));
    CHECK_FALSE(mutate(MUT_ANTENNAE, "potion of mutation", false, true));
    REQUIRE(delete_mutation(RANDOM_MUTATION, "potion of mutation", false));
    CHECK(you.get_base_mutation_level(MUT_HORNS) == base);
    CHECK_FALSE(delete_mutation(RANDOM_MUTATION, "potion of mutation", false));
}

TEST_CASE_METHOD(mutation_fixture,
                 "Mutation potions remove normal upgrades while preserving temporary levels",
                 "[mutation][innate-mutations]")
{
    become(SP_BARACHI);
    REQUIRE(temp_mutate(MUT_FROG_LEGS, "test"));
    CHECK_FALSE(delete_mutation(MUT_FROG_LEGS, "potion of mutation", false));
    CHECK(you.get_base_mutation_level(MUT_FROG_LEGS) == 2);
    CHECK(you.temp_mutation[MUT_FROG_LEGS] == 1);
    REQUIRE(delete_all_temp_mutations("test"));
    REQUIRE(mutate(MUT_FROG_LEGS, "potion of mutation", false));
    REQUIRE(delete_all_mutations("test"));
    CHECK(you.get_base_mutation_level(MUT_FROG_LEGS) == 1);
    CHECK(you.get_innate_mutation_level(MUT_FROG_LEGS) == 1);
}

TEST_CASE_METHOD(mutation_fixture,
                 "Species growth makes an acquired upgrade part of the protected base",
                 "[mutation][innate-mutations]")
{
    become(SP_BARACHI);
    REQUIRE(mutate(MUT_FROG_LEGS, "potion of mutation", false));
    you.experience_level = 13;
    give_level_mutations(SP_BARACHI, 13);
    CHECK(you.get_base_mutation_level(MUT_FROG_LEGS) == 2);
    CHECK(you.get_innate_mutation_level(MUT_FROG_LEGS) == 2);
    CHECK_FALSE(delete_mutation(MUT_FROG_LEGS, "potion of mutation", false, true));
}

TEST_CASE_METHOD(mutation_fixture,
                 "Poison breath upgrades and removals preserve the ability letter",
                 "[mutation][innate-mutations]")
{
    become(SP_NAGA);
    you.ability_letter_table[7] = ABIL_SPIT_POISON;
    REQUIRE(mutate(MUT_SPIT_POISON, "potion of mutation", false));
    CHECK(you.ability_letter_table[7] == ABIL_BREATHE_POISON);
    REQUIRE(delete_mutation(MUT_SPIT_POISON, "potion of mutation", false));
    CHECK(you.ability_letter_table[7] == ABIL_SPIT_POISON);
    CHECK(you.get_innate_mutation_level(MUT_SPIT_POISON) == 1);
}

TEST_CASE_METHOD(mutation_fixture,
                 "Drinking mutation potions can upgrade exclusive innate traits",
                 "[mutation][innate-mutations]")
{
    become(SP_BARACHI);
    const PotionEffect *potion = get_potion_effect(POT_MUTATION);
    REQUIRE(potion);
    bool upgraded = false;
    for (int i = 0; i < 4096 && !upgraded; ++i)
    {
        delete_all_mutations("test reset");
        potion->effect();
        upgraded = you.get_base_mutation_level(MUT_FROG_LEGS) == 2;
        REQUIRE(you.get_innate_mutation_level(MUT_FROG_LEGS) == 1);
    }
    REQUIRE(upgraded);
    REQUIRE(delete_all_mutations("test"));
    CHECK(you.get_base_mutation_level(MUT_FROG_LEGS) == 1);
}
