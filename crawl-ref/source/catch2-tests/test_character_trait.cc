#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "character-trait.h"
#include "god-abil.h"
#include "monster.h"
#include "mutation.h"
#include "ng-restr.h"
#include "ng-setup.h"
#include "party.h"
#include "playable.h"
#include "player.h"
#include "species.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"

TEST_CASE("Undead traits respect species and background identity", "[character-trait]")
{
    for (const auto trait : {character_trait::mummy, character_trait::zombie,
                             character_trait::ghost})
    {
        for (const auto sp : {SP_HUMAN, SP_MINOTAUR, SP_OOZLE, SP_OCTOPODE})
            CHECK(check_trait(trait, sp, JOB_FIGHTER) == trait_restriction::allowed);
        for (const auto sp : {SP_MUMMY, SP_REVENANT, SP_POLTERGEIST})
            CHECK(check_trait(trait, sp, JOB_FIGHTER) == trait_restriction::already_undead);
        for (const auto sp : {SP_GARGOYLE, SP_DJINNI, SP_AUTOMATON})
            CHECK(check_trait(trait, sp, JOB_FIGHTER) == trait_restriction::nonliving);
        for (const auto job : {JOB_PALADIN, JOB_PREACHER, JOB_HEALER,
                               JOB_SLIME_PRIEST,
                               JOB_SHAPESHIFTER, JOB_STALKER})
            CHECK(check_trait(trait, SP_HUMAN, job) == trait_restriction::incompatible_background);
        CHECK(check_trait(trait, SP_HUMAN, JOB_SAGE) == trait_restriction::allowed);
    }

    CHECK(check_trait(character_trait::none, SP_POLTERGEIST, JOB_FIGHTER)
          == trait_restriction::allowed);
    CHECK(check_trait(character_trait::mummy, SP_UNKNOWN, JOB_FIGHTER)
          == trait_restriction::invalid_species);
    CHECK(check_trait(static_cast<character_trait>(999), SP_HUMAN, JOB_FIGHTER)
          == trait_restriction::invalid_trait);
}

TEST_CASE_METHOD(vellum_fixture, "Hermit starts with a recorded Ru health sacrifice",
                 "[hermit-slime]")
{
    init_sac_index();
    you.species = SP_HUMAN;
    you.char_class = JOB_HERMIT;
    you.religion = GOD_RU;
    you.raw_piety = 10;
    calc_hp();
    you.hp = you.hp_max;
    apply_starting_background_effects();
    CHECK(you.has_innate_mutation(MUT_FRAIL));
    CHECK(you.sacrifices[MUT_FRAIL] == 1);
    REQUIRE(you.props.exists(NUM_SACRIFICES_KEY));
    CHECK(you.props[NUM_SACRIFICES_KEY].get_int() == 1);
    CHECK(you.raw_piety > 10);
    CHECK(you.props.exists(RU_SACRIFICE_DELAY_KEY));
    CHECK(you.props[HEALTH_SAC_KEY].get_vector().empty());
    const int piety = you.raw_piety;
    apply_starting_background_effects();
    CHECK(you.sacrifices[MUT_FRAIL] == 1);
    CHECK(you.raw_piety == piety);
}

TEST_CASE_METHOD(vellum_fixture, "Slime Priest starts with owner-specific Jiyva mutations",
                 "[hermit-slime]")
{
    party::set_player_count(2);
    const int active_slot = party::active_slot();
    you.species = SP_HUMAN;
    you.char_class = JOB_FIGHTER;
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.char_class = JOB_SLIME_PRIEST;
    other.religion = GOD_JIYVA;
    other.raw_piety = 5;
    other.set_position(you.pos() + coord_def(1, 0));
    {
        party::scoped_player_context ctx(1);
        apply_starting_background_effects();
        int slime_levels = 0;
        for (int i = 0; i < NUM_MUTATIONS; ++i)
            if (is_slime_mutation(static_cast<mutation_type>(i)))
                slime_levels += you.mutation[i] - you.innate_mutation[i];
        CHECK(slime_levels == 3);
        CHECK(you.raw_piety == 5);
        apply_starting_background_effects();
        int after = 0;
        for (int i = 0; i < NUM_MUTATIONS; ++i)
            if (is_slime_mutation(static_cast<mutation_type>(i)))
                after += you.mutation[i] - you.innate_mutation[i];
        CHECK(after == slime_levels);
    }
    CHECK(party::active_slot() == active_slot);
    CHECK(you.char_class == JOB_FIGHTER);
    CHECK_FALSE(you.props.exists("starting_background_effects_applied"));
    other.save = nullptr;
    party::set_player_count(1);
    CHECK_FALSE(character_is_allowed(SP_DEMIGOD, JOB_HERMIT));
    CHECK_FALSE(character_is_allowed(SP_DEMIGOD, JOB_SLIME_PRIEST));
    CHECK_FALSE(character_is_allowed(SP_AUTOMATON, JOB_SLIME_PRIEST));
    CHECK_FALSE(character_is_allowed(SP_WIGHT, JOB_SLIME_PRIEST));
    CHECK(character_is_allowed(SP_HUMAN, JOB_SLIME_PRIEST));
    CHECK(check_trait(character_trait::ghost, SP_HUMAN, JOB_SLIME_PRIEST)
          == trait_restriction::incompatible_background);
}

TEST_CASE_METHOD(vellum_fixture, "Hermit sacrifice belongs to its party member",
                 "[hermit-slime]")
{
    init_sac_index();
    party::set_player_count(2);
    you.species = SP_HUMAN;
    you.char_class = JOB_FIGHTER;
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.char_class = JOB_HERMIT;
    other.religion = GOD_RU;
    other.raw_piety = 10;
    other.set_position(you.pos() + coord_def(1, 0));
    {
        party::scoped_player_context ctx(1);
        apply_starting_background_effects();
        CHECK(you.sacrifices[MUT_FRAIL] == 1);
        CHECK(you.raw_piety > 10);
    }
    CHECK(party::active_slot() == 0);
    CHECK(you.sacrifices[MUT_FRAIL] == 0);
    CHECK(other.sacrifices[MUT_FRAIL] == 1);
    other.save = nullptr;
    party::set_player_count(1);
}

TEST_CASE_METHOD(vellum_fixture, "Hermit and Slime Priest effects fit eligible species",
                 "[hermit-slime-species]")
{
    init_sac_index();
    player baseline = you;
    auto* const save = you.save;
    baseline.save = nullptr;
    for (const species_type sp : playable_species())
    {
        for (const job_type job : {JOB_HERMIT, JOB_SLIME_PRIEST})
        {
            if (!character_is_allowed(sp, job))
                continue;
            CAPTURE(sp, job);
            you = baseline;
            you.save = save;
            // Start from a clean mutation slate: the fixture's own species
            // mutations must not stack under the species being tested.
            you.mutation.init(0);
            you.innate_mutation.init(0);
            you.temp_mutation.init(0);
            you.species = sp;
            you.char_class = job;
            you.religion = job == JOB_HERMIT ? GOD_RU : GOD_JIYVA;
            you.raw_piety = job == JOB_HERMIT ? 10 : 5;
            give_basic_mutations(sp);
            roll_demonspawn_mutations();
            calc_hp();
            you.hp = max(1, you.hp_max);
            apply_starting_background_effects();
            CHECK(you.props.exists("starting_background_effects_applied"));
            if (job == JOB_HERMIT)
                CHECK(you.props[NUM_SACRIFICES_KEY].get_int() == 1);
            else
            {
                int slime_levels = 0;
                for (int i = 0; i < NUM_MUTATIONS; ++i)
                    if (is_slime_mutation(static_cast<mutation_type>(i)))
                        slime_levels += you.mutation[i] - you.innate_mutation[i];
                CHECK(slime_levels == 3);
            }
        }
    }
}

TEST_CASE("Automaton is selectable while retaining its nonliving identity",
          "[character-trait]")
{
    CHECK(species::is_valid(SP_AUTOMATON));
    CHECK(species::is_starting_species(SP_AUTOMATON));
}

TEST_CASE("Each character retains its own validated trait", "[character-trait]")
{
    player first;
    first.species = SP_HUMAN;
    first.char_class = JOB_FIGHTER;
    player second;
    second.species = SP_MINOTAUR;
    second.char_class = JOB_FIGHTER;
    CHECK(get_character_trait(first) == character_trait::none);
    CHECK(set_character_trait(first, character_trait::mummy) == trait_restriction::allowed);
    CHECK(set_character_trait(second, character_trait::ghost) == trait_restriction::allowed);
    CHECK(get_character_trait(first) == character_trait::mummy);
    CHECK(get_character_trait(second) == character_trait::ghost);
    second.species = SP_POLTERGEIST;
    CHECK(set_character_trait(second, character_trait::zombie) == trait_restriction::already_undead);
    CHECK(get_character_trait(second) == character_trait::ghost);

    character_trait parsed = character_trait::none;
    CHECK(parse_character_trait("mummy", parsed));
    CHECK(parsed == character_trait::mummy);
    CHECK_FALSE(parse_character_trait("vampire", parsed));
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Undead traits compose with host physiology",
                 "[character-trait]")
{
    const int old_fire = player_res_fire(false, false, false);
    const int old_cold = player_res_cold(false, false, false);
    REQUIRE(set_character_trait(you, character_trait::mummy) == trait_restriction::allowed);
    give_basic_trait_mutations();
    CHECK(you.undead_state(false) == US_UNDEAD);
    CHECK(you.holiness(false) & MH_UNDEAD);
    CHECK(you.is_unbreathing());
    CHECK(you.res_negative_energy() == 3);
    CHECK(you.res_torment());
    CHECK_FALSE(you.can_drink());
    CHECK(you.has_mutation(MUT_FAITH));
    CHECK(player_res_fire(false, false, false) == old_fire - 1);
    CHECK(player_res_cold(false, false, false) == old_cold + 1);
    CHECK(you.get_innate_mutation_level(MUT_NECRO_ENHANCER) == 1);
}

TEST_CASE("Party creation parses separate traits for each hero", "[character-trait]")
{
    party::configure_from_arg("2,One:Human/Fighter/unarmed/1/mummy,Two:Minotaur/Fighter/unarmed/2/ghost");
    CHECK(party::starting_member(0).trait == character_trait::mummy);
    CHECK(party::starting_member(1).trait == character_trait::ghost);
    party::configure_from_arg("2,Hero:Minotaur/Fighter,Lyra:Deep Elf/Conjurer");
    party::set_player_count(1);
}

TEST_CASE("Mummy saves keep their species identity while new choices use a trait",
          "[character-trait]")
{
    CHECK(species::is_valid(SP_MUMMY));
    CHECK(species::undead_type(SP_MUMMY) == US_UNDEAD);
    CHECK_FALSE(species::is_starting_species(SP_MUMMY));
}

TEST_CASE("Trait properties survive save serialization", "[character-trait]")
{
    player original;
    original.species = SP_HUMAN;
    original.char_class = JOB_FIGHTER;
    REQUIRE(set_character_trait(original, character_trait::ghost) == trait_restriction::allowed);
    vector<unsigned char> bytes;
    writer output(&bytes);
    original.props.write(output);
    reader input(bytes, TAG_MINOR_VERSION);
    player restored;
    restored.props.read(input);
    CHECK(get_character_trait(restored) == character_trait::ghost);
}

TEST_CASE_METHOD(vellum_fixture, "Ghost trait fades steadily but never below 1 HP",
                 "[character-trait][ghost]")
{
    you.religion = GOD_NO_GOD;
    REQUIRE(set_character_trait(you, character_trait::ghost) == trait_restriction::allowed);
    you.hp_max = 30;
    you.hp = 30;

    // Nothing happens until a full fade period has elapsed.
    CHECK(ghost_trait_fade(you, GHOST_FADE_TURNS * BASELINE_DELAY - 1) == 0);
    CHECK(you.hp == 30);
    // The next aut completes the period: exactly one point fades.
    CHECK(ghost_trait_fade(you, 1) == 1);
    CHECK(you.hp == 29);
    // Long delays fade proportionally, with the remainder carried over.
    CHECK(ghost_trait_fade(you, GHOST_FADE_TURNS * BASELINE_DELAY * 3) == 3);
    CHECK(you.hp == 26);
    CHECK(ghost_trait_fade(you, 0) == 0);

    // Fading cannot finish a ghost off.
    you.hp = 2;
    CHECK(ghost_trait_fade(you, GHOST_FADE_TURNS * BASELINE_DELAY * 5) == 1);
    CHECK(you.hp == 1);
    CHECK(ghost_trait_fade(you, GHOST_FADE_TURNS * BASELINE_DELAY * 5) == 0);
    CHECK(you.hp == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Ghost trait harvests health from kills",
                 "[character-trait][ghost]")
{
    you.religion = GOD_NO_GOD;
    REQUIRE(set_character_trait(you, character_trait::ghost) == trait_restriction::allowed);
    you.hp_max = 40;
    you.hp = 10;

    monster victim;
    victim.type = MONS_ORC;
    victim.set_hit_dice(4);

    // 1 + HD, well under the cap of hp_max / 4 = 10.
    CHECK(ghost_trait_harvest_amount(4, 40) == 5);
    CHECK(ghost_trait_harvest(you, victim, true) == 5);
    CHECK(you.hp == 15);

    // Unrewarding kills restore nothing.
    CHECK(ghost_trait_harvest(you, victim, false) == 0);
    CHECK(you.hp == 15);

    // Big victims are capped at a quarter of max HP ...
    victim.set_hit_dice(30);
    CHECK(ghost_trait_harvest_amount(30, 40) == 10);
    CHECK(ghost_trait_harvest(you, victim, true) == 10);
    CHECK(you.hp == 25);
    // ... and the cap is never less than one point.
    CHECK(ghost_trait_harvest_amount(30, 3) == 1);
    CHECK(ghost_trait_harvest_amount(0, 40) == 1);

    // Harvest never overfills.
    you.hp = 38;
    CHECK(ghost_trait_harvest(you, victim, true) == 2);
    CHECK(you.hp == 40);
    CHECK(ghost_trait_harvest(you, victim, true) == 0);
    CHECK(you.hp == 40);
}

TEST_CASE_METHOD(vellum_fixture, "Ghost trait suppresses natural regeneration only",
                 "[character-trait][ghost]")
{
    you.religion = GOD_NO_GOD;
    you.duration[DUR_SICKNESS] = 0;
    you.duration[DUR_TROGS_HAND] = 0;
    you.hp_max = 30;
    you.hp = 10;
    REQUIRE(player_regenerates_hp());
    REQUIRE(player_regen() > 0);

    REQUIRE(set_character_trait(you, character_trait::ghost) == trait_restriction::allowed);
    CHECK(trait_blocks_natural_regen(you));
    CHECK_FALSE(player_regenerates_hp());
    CHECK(player_regen() == 0);
    // A ghost with nothing to rest for counts as rested for HP purposes.
    you.magic_points = you.max_magic_points;
    CHECK(you.is_sufficiently_rested(true));

    // Divine healing still bypasses the gate, as it does for sickness.
    you.duration[DUR_TROGS_HAND] = 100;
    CHECK(player_regen() == 100);
    you.duration[DUR_TROGS_HAND] = 0;
}

TEST_CASE_METHOD(vellum_fixture, "Other traits neither fade nor harvest",
                 "[character-trait][ghost]")
{
    you.religion = GOD_NO_GOD;
    you.hp_max = 30;
    monster victim;
    victim.type = MONS_ORC;
    victim.set_hit_dice(4);

    for (const auto trait : {character_trait::none, character_trait::mummy,
                             character_trait::zombie})
    {
        CAPTURE(static_cast<int>(trait));
        REQUIRE(set_character_trait(you, trait) == trait_restriction::allowed);
        you.hp = 20;
        CHECK_FALSE(trait_blocks_natural_regen(you));
        CHECK(ghost_trait_fade(you, GHOST_FADE_TURNS * BASELINE_DELAY * 4) == 0);
        CHECK(you.hp == 20);
        CHECK(ghost_trait_harvest(you, victim, true) == 0);
        CHECK(you.hp == 20);
        if (trait == character_trait::zombie)
        {
            // Zombies keep natural regeneration but lose it while enemies
            // are in view; that remains their own, separate mechanism.
            CHECK(regeneration_is_ever_inhibited());
        }
        else
        {
            CHECK_FALSE(regeneration_is_ever_inhibited());
            CHECK(player_regenerates_hp());
            CHECK(player_regen() > 0);
        }
    }
}

TEST_CASE("Ghost fade and harvest follow each party member's own trait",
          "[character-trait][ghost]")
{
    player ghost;
    ghost.species = SP_HUMAN;
    ghost.char_class = JOB_FIGHTER;
    ghost.hp_max = 20;
    ghost.hp = 20;
    player mortal;
    mortal.species = SP_MINOTAUR;
    mortal.char_class = JOB_FIGHTER;
    mortal.hp_max = 20;
    mortal.hp = 20;
    REQUIRE(set_character_trait(ghost, character_trait::ghost) == trait_restriction::allowed);

    CHECK(ghost_trait_fade(ghost, GHOST_FADE_TURNS * BASELINE_DELAY) == 1);
    CHECK(ghost_trait_fade(mortal, GHOST_FADE_TURNS * BASELINE_DELAY) == 0);
    CHECK(ghost.hp == 19);
    CHECK(mortal.hp == 20);

    monster victim;
    victim.type = MONS_ORC;
    victim.set_hit_dice(2);
    mortal.hp = 10;
    CHECK(ghost_trait_harvest(mortal, victim, true) == 0);
    CHECK(mortal.hp == 10);
    CHECK(ghost_trait_harvest(ghost, victim, true) == 1);
    CHECK(ghost.hp == 20);
    CHECK(trait_blocks_natural_regen(ghost));
    CHECK_FALSE(trait_blocks_natural_regen(mortal));
}
