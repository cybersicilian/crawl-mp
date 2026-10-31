#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "player.h"
#include "skills.h"
#include "species.h"
#include "test_player_fixture.h"

TEST_CASE("High Elf training floor is per hero and uses base skill levels", "[high-elf]")
{
    player elf;
    player companion;
    elf.species = SP_HIGH_ELF;
    companion.species = SP_HIGH_ELF;
    elf.experience_level = 9;
    companion.experience_level = 2;
    elf.skills[SK_AXES] = 2;
    CHECK(high_elf_skill_locked(elf, SK_AXES));
    CHECK_FALSE(high_elf_skill_locked(companion, SK_AXES));
    CHECK(high_elf_skill_lock_reason(elf, SK_AXES).find("level 3") != string::npos);
    CHECK_FALSE(high_elf_skill_locked(elf, SK_FIGHTING));
    CHECK_FALSE(high_elf_skill_locked(elf, SK_SPELLCASTING));
    CHECK_FALSE(high_elf_skill_locked(elf, SK_INVOCATIONS));
    elf.skills[SK_AXES] = 3;
    CHECK_FALSE(high_elf_skill_locked(elf, SK_AXES));
    elf.species = SP_HUMAN;
    elf.skills[SK_AXES] = 0;
    CHECK_FALSE(high_elf_skill_locked(elf, SK_AXES));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "High Elf locked skills receive no training", "[high-elf]")
{
    you.species = SP_HIGH_ELF;
    CHECK(species::is_starting_species(you.species));
    you.experience_level = 9;
    you.skills[SK_AXES] = 0;
    you.skill_points[SK_AXES] = 0;
    you.auto_training = false;
    you.train[SK_AXES] = TRAINING_FOCUSED;
    you.train[SK_FIGHTING] = TRAINING_ENABLED;
    reset_training();
    CHECK_FALSE(skill_trained(SK_AXES));
    CHECK_FALSE(can_enable_skill(SK_AXES));
    CHECK(you.training[SK_AXES] == 0);
    CHECK(you.skill_points[SK_AXES] == 0);
    CHECK(can_enable_skill(SK_FIGHTING));
    const unsigned int fighting_before = you.skill_points[SK_FIGHTING];
    you.exp_available = 500;
    train_skills();
    CHECK(you.skill_points[SK_AXES] == 0);
    CHECK(you.skill_points[SK_FIGHTING] > fighting_before);
    you.train[SK_AXES] = TRAINING_DISABLED;
    set_training_status(SK_AXES, TRAINING_ENABLED);
    CHECK(you.train[SK_AXES] == TRAINING_DISABLED);
    you.skills[SK_AXES] = 3;
    you.skill_points[SK_AXES] = skill_exp_needed(3, SK_AXES);
    CHECK(can_enable_skill(SK_AXES));
    set_training_status(SK_AXES, TRAINING_ENABLED);
    reset_training();
    CHECK(skill_trained(SK_AXES));
    CHECK(you.training[SK_AXES] > 0);
}
