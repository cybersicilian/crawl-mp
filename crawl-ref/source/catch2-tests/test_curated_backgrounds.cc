#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "account-start.h"
#include "art-enum.h"
#include "artefact.h"
#include "character-trait.h"
#include "coordit.h"
#include "env.h"
#include "items.h"
#include "item-name.h"
#include "item-prop.h"
#include "jobs.h"
#include "los.h"
#include "mutation.h"
#include "mapdef.h"
#include "newgame-def.h"
#include "ng-setup.h"
#include "ng-restr.h"
#include "party.h"
#include "player.h"
#include "spl-util.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "job-data.h"

TEST_CASE("Elder jobs preserve existing job numbers and enforce religious eligibility",
          "[elder-jobs]")
{
#if TAG_MAJOR_VERSION == 34
    CHECK(static_cast<int>(JOB_HEALER) == 19);
    CHECK(static_cast<int>(JOB_PALADIN) == 35);
#else
    CHECK(static_cast<int>(JOB_PALADIN) == 29);
#endif
    CHECK(is_starting_job(JOB_HEALER));
    CHECK(is_starting_job(JOB_PREACHER));
    CHECK(is_starting_job(JOB_SAGE));
    CHECK(get_job_by_abbrev("Pc") == JOB_PREACHER);
    CHECK(get_job_by_abbrev("Sa") == JOB_SAGE);
    CHECK(job_allowed(SP_DEMIGOD, JOB_PREACHER) == CC_BANNED);
    CHECK(job_allowed(SP_DEMIGOD, JOB_SAGE) == CC_BANNED);
    CHECK(job_allowed(SP_DEMIGOD, JOB_HEALER) == CC_BANNED);
    CHECK(job_allowed(SP_DEMONSPAWN, JOB_PREACHER) == CC_BANNED);
    CHECK(job_allowed(SP_WIGHT, JOB_PREACHER) == CC_BANNED);
    CHECK(job_allowed(SP_HUMAN, JOB_PREACHER) != CC_BANNED);
    CHECK(job_allowed(SP_WIGHT, JOB_SAGE) != CC_BANNED);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Standalone placeholder equipment uses valid item specs",
                 "[standalone-jobs]")
{
    init_item_name_cache();
    for (const auto job : {JOB_HERMIT, JOB_SLIME_PRIEST, JOB_ARCHAEOLOGIST,
                           JOB_ROGUE, JOB_FENCER, JOB_RONIN, JOB_APOTHECARY,
                           JOB_BILLIONAIRE, JOB_NECKBEARD, JOB_PHILOSOPHER})
    {
        CAPTURE(get_job_name(job));
        for (const string& spec : job_data.at(job).equipment)
        {
            CAPTURE(spec);
            item_list items;
            CHECK(items.add_item(spec, false).empty());
        }
    }
}

TEST_CASE("Standalone backgrounds are registered and selectable",
          "[standalone-jobs]")
{
    const vector<pair<job_type, string>> jobs = {
        {JOB_HERMIT, "Hm"}, {JOB_SLIME_PRIEST, "Sp"},
        {JOB_ARCHAEOLOGIST, "Ac"},
        {JOB_RONIN, "Ro"}, {JOB_NECKBEARD, "Nb"},
    };
    for (const auto &entry : jobs)
    {
        CAPTURE(entry.second);
        CHECK(job_type_valid(entry.first));
        CHECK(get_job_by_abbrev(entry.second.c_str()) == entry.first);
        CHECK(is_starting_job(entry.first));
        CHECK(job_allowed(SP_HUMAN, entry.first) != CC_BANNED);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Rogues start with stealth and magical tools",
                 "[rogue-job]")
{
    CHECK(is_starting_job(JOB_ROGUE));
    CHECK(get_job_by_abbrev("Rg") == JOB_ROGUE);
    CHECK(job_allowed(SP_HUMAN, JOB_ROGUE) != CC_BANNED);
    CHECK(job_allowed(SP_FELID, JOB_ROGUE) == CC_BANNED);
    CHECK(job_recommends_species(JOB_ROGUE, SP_KOBOLD));
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_ROGUE;
    // The shared fixture creates a Monk first; emulate fresh starting skills.
    for (const skill_type skill : {SK_FIGHTING, SK_STEALTH, SK_SHORT_BLADES, SK_EVOCATIONS})
        you.skills[skill] = 0;
    init_item_name_cache();
    give_items_skills(ng);
    bool dagger = false, robe = false, cloak = false, poisoned = false;
    bool flame = false, charming = false;
    for (const item_def &item : you.inv)
    {
        dagger |= item.is_type(OBJ_WEAPONS, WPN_DAGGER) && item.plus == 2;
        robe |= item.is_type(OBJ_ARMOUR, ARM_ROBE);
        cloak |= item.is_type(OBJ_ARMOUR, ARM_CLOAK);
        poisoned |= item.is_type(OBJ_MISSILES, MI_DART)
                    && get_ammo_brand(item) == SPMSL_POISONED && item.quantity == 9;
        flame |= item.is_type(OBJ_WANDS, WAND_FLAME) && item.plus == 15;
        charming |= item.is_type(OBJ_WANDS, WAND_CHARMING) && item.plus == 15;
    }
    CHECK(dagger);
    CHECK(robe);
    CHECK(cloak);
    CHECK(poisoned);
    CHECK(flame);
    CHECK(charming);
    CHECK(you.skills[SK_FIGHTING] == 2);
    CHECK(you.skills[SK_STEALTH] == 4);
    CHECK(you.skills[SK_SHORT_BLADES] == 2);
    CHECK(you.skills[SK_EVOCATIONS] == 2);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Special backgrounds equip their unique starting items",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    int expected = 0;
    SECTION("Fencer") { ng.job = JOB_FENCER; expected = UNRAND_FENCERS; }
    SECTION("Apothecary") { ng.job = JOB_APOTHECARY; expected = UNRAND_ALCHEMIST; }
    SECTION("Philosopher") { ng.job = JOB_PHILOSOPHER; expected = UNRAND_PONDERING; }
    you.char_class = ng.job;
    init_item_name_cache();
    give_items_skills(ng);
    CHECK(you.unrand_equipped(expected));
    CHECK(get_unique_item_status(expected) != UNIQ_NOT_EXISTS);
}

TEST_CASE("Equipment-dependent backgrounds reject incompatible species",
          "[standalone-special-starts]")
{
    CHECK(character_is_allowed(SP_HUMAN, JOB_FENCER));
    CHECK_FALSE(character_is_allowed(SP_HYDRA, JOB_FENCER));
    CHECK_FALSE(character_is_allowed(SP_FELID, JOB_FENCER));
    CHECK_FALSE(character_is_allowed(SP_TROLL, JOB_FENCER));
    CHECK_FALSE(character_is_allowed(SP_KITSUNE, JOB_PHILOSOPHER));
    CHECK_FALSE(character_is_allowed(SP_POLTERGEIST, JOB_APOTHECARY));
    CHECK(character_is_allowed(SP_HUMAN, JOB_APOTHECARY));
    CHECK(character_is_allowed(SP_HUMAN, JOB_PHILOSOPHER));
    CHECK_FALSE(character_is_allowed(SP_MUMMY, JOB_APOTHECARY));
    CHECK(check_trait(character_trait::mummy, SP_HUMAN, JOB_APOTHECARY)
          == trait_restriction::incompatible_background);
    CHECK(check_trait(character_trait::zombie, SP_HUMAN, JOB_APOTHECARY)
          == trait_restriction::allowed);
    CHECK(check_trait(character_trait::ghost, SP_HUMAN, JOB_APOTHECARY)
          == trait_restriction::allowed);
}

TEST_CASE("Special backgrounds recommend only compatible starting species",
          "[standalone-special-starts]")
{
    const vector<pair<job_type, species_type>> choices = {
        {JOB_FENCER, SP_MERFOLK}, {JOB_FENCER, SP_MINOTAUR},
        {JOB_FENCER, SP_KOBOLD}, {JOB_APOTHECARY, SP_SPRIGGAN},
        {JOB_APOTHECARY, SP_HUMAN}, {JOB_BILLIONAIRE, SP_TROLL},
        {JOB_BILLIONAIRE, SP_HUMAN}, {JOB_PHILOSOPHER, SP_NAGA},
        {JOB_PHILOSOPHER, SP_SPRIGGAN}, {JOB_PHILOSOPHER, SP_GALE_CENTAUR},
        {JOB_HERMIT, SP_HUMAN}, {JOB_HERMIT, SP_KOBOLD}, {JOB_HERMIT, SP_TROLL},
        {JOB_SLIME_PRIEST, SP_TROLL}, {JOB_SLIME_PRIEST, SP_OCTOPODE},
        {JOB_SLIME_PRIEST, SP_MINOTAUR}, {JOB_SLIME_PRIEST, SP_DEMONSPAWN},
        {JOB_ARCHAEOLOGIST, SP_HUMAN}, {JOB_ARCHAEOLOGIST, SP_FORMICID},
        {JOB_ARCHAEOLOGIST, SP_MINOTAUR}, {JOB_ARCHAEOLOGIST, SP_VINE_STALKER},
        {JOB_RONIN, SP_HUMAN}, {JOB_NECKBEARD, SP_HUMAN},
        {JOB_NECKBEARD, SP_MINOTAUR}, {JOB_NECKBEARD, SP_MERFOLK},
    };
    for (const auto& choice : choices)
    {
        CAPTURE(choice.first, choice.second);
        CHECK(is_starting_job(choice.first));
        CHECK(character_is_allowed(choice.second, choice.first));
        CHECK(job_recommends_species(choice.first, choice.second));
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Reserved starting artefacts are not duplicated",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_PHILOSOPHER;
    // The same status is used by an Archaeologist's reserved crate.
    you.unique_items[UNRAND_PONDERING - UNRAND_START] = UNIQ_EXISTS;
    init_item_name_cache();
    give_items_skills(ng);
    CHECK_FALSE(you.unrand_equipped(UNRAND_PONDERING));
    bool ordinary_hat = false;
    for (const item_def& item : you.inv)
        ordinary_hat |= item.is_type(OBJ_ARMOUR, ARM_HAT) && !is_artefact(item);
    CHECK(ordinary_hat);
    CHECK(get_unique_item_status(UNRAND_PONDERING) == UNIQ_EXISTS);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Starting artefact reservations are party-wide",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_FENCER;
    init_item_name_cache();
    party::set_player_count(2);
    player& second = party::get_player(1);
    second = you;
    second.mid = party::mid_for_slot(1);
    second.save = nullptr;
    give_items_skills(ng);
    CHECK(you.unrand_equipped(UNRAND_FENCERS));
    CHECK(second.unique_items[UNRAND_FENCERS - UNRAND_START] != UNIQ_NOT_EXISTS);
    {
        party::scoped_player_context context(1, false);
        give_items_skills(ng);
        CHECK_FALSE(you.unrand_equipped(UNRAND_FENCERS));
    }
    second.save = nullptr;
    party::set_player_count(1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "The Billionaire fortune is not granted twice",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_BILLIONAIRE;
    init_item_name_cache();
    you.gold = 0;
    give_items_skills(ng);
    CHECK(you.gold == 1000000);
    you.gold = 750000;
    give_items_skills(ng);
    CHECK(you.gold == 750000);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Billionaire wealth is shared across party members",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = you.species = SP_HUMAN;
    ng.job = you.char_class = JOB_BILLIONAIRE;
    init_item_name_cache();
    party::set_player_count(2);
    player& second = party::get_player(1);
    second = you;
    second.mid = party::mid_for_slot(1);
    second.save = nullptr;
    you.gold = 0;
    give_items_skills(ng);
    CHECK(you.gold == 1000000);
    CHECK(second.gold == 1000000);
    party::sync_shared_gold(750000);
    {
        party::scoped_player_context context(1, false);
        give_items_skills(ng);
        CHECK(you.gold == 750000);
    }
    CHECK(you.gold == 750000);
    second.save = nullptr;
    party::set_player_count(1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "A nonleader Billionaire grants the party fortune",
                 "[standalone-special-starts]")
{
    newgame_def ng;
    ng.species = SP_HUMAN;
    ng.job = JOB_BILLIONAIRE;
    init_item_name_cache();
    party::set_player_count(2);
    player& second = party::get_player(1);
    second = you;
    second.mid = party::mid_for_slot(1);
    second.save = nullptr;
    second.species = SP_HUMAN;
    second.char_class = JOB_BILLIONAIRE;
    party::sync_shared_gold(0);
    {
        party::scoped_player_context context(1, false);
        give_items_skills(ng);
        CHECK(you.gold == 1000000);
    }
    CHECK(you.gold == 1000000);
    second.save = nullptr;
    party::set_player_count(1);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Elder backgrounds receive their gods and kits",
                 "[elder-jobs]")
{
    newgame_def ng;
    ng.species = SP_HUMAN;
    ng.weapon = WPN_MACE;
    init_spell_descs();
    init_item_name_cache();
    you.species = SP_HUMAN;
    you.religion = GOD_NO_GOD;
    you.raw_piety = 0;
    SECTION("Preacher")
    {
        item_list parsed;
        CHECK(parsed.add_item("javelin ego:silver q:3").empty());
        REQUIRE(parsed.size() == 1);
        const item_spec silver_spec = parsed.get_item(0);
        CHECK(silver_spec.base_type == OBJ_MISSILES);
        CHECK(silver_spec.sub_type == MI_JAVELIN);
        CHECK(silver_spec.ego == SPMSL_SILVER);
        CHECK(silver_spec.qty == 3);
        ng.job = you.char_class = JOB_PREACHER;
        give_items_skills(ng);
        CHECK(you.religion == GOD_ZIN);
        CHECK(you.raw_piety == 35);
        bool silver = false;
        for (const item_def &item : you.inv)
        {
            INFO("inventory base " << item.base_type << " subtype " << item.sub_type
                 << " brand " << item.brand << " quantity " << item.quantity);
            if (item.is_type(OBJ_MISSILES, MI_JAVELIN)
                && get_ammo_brand(item) == SPMSL_SILVER && item.quantity == 3)
                silver = true;
        }
        CHECK(silver);
    }
    SECTION("Sage")
    {
        ng.job = you.char_class = JOB_SAGE;
        give_items_skills(ng);
        CHECK(you.religion == GOD_SIF_MUNA);
        CHECK(you.raw_piety == 35);
        CHECK(you.has_spell(SPELL_APPORTATION));
        CHECK(you.spell_library[SPELL_APPORTATION]);
        CHECK(you.spell_library.count() > 1);
    }
    SECTION("Healer")
    {
        ng.job = you.char_class = JOB_HEALER;
        give_items_skills(ng);
        CHECK(you.religion == GOD_ELYVILON);
        CHECK(you.raw_piety == 45);
    }
}

