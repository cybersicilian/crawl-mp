#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "archaeologist.h"
#include "artefact.h"
#include "art-enum.h"
#include "branch.h"
#include "character-trait.h"
#include "dungeon.h"
#include "env.h"
#include "item-prop.h"
#include "items.h"
#include "mon-util.h"
#include "mutation.h"
#include "ng-restr.h"
#include "party.h"
#include "playable.h"
#include "player.h"
#include "religion.h"
#include "skills.h"
#include "state.h"
#include "tags.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

namespace
{
struct archaeologist_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    archaeologist_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        you.species = SP_HUMAN;
        you.char_class = JOB_ARCHAEOLOGIST;
        you.religion = GOD_NO_GOD;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.your_name = "Scholar";
        you.hp = you.hp_max = 100;
        you.experience_level = you.max_level = 1;
        you.unique_items.init(UNIQ_NOT_EXISTS);
        for (item_def& item : you.inv)
            item.clear();
    }
    ~archaeologist_fixture()
    {
        party::set_multiplayer(false);
        for (int slot = 1; slot < party::MAX_PARTY_PLAYERS; ++slot)
            party::get_player(slot).save = nullptr;
        party::set_player_count(1);
        brdepth[BRANCH_DUNGEON] = old_depth;
        dgn_reset_level(false);
    }
    int find_item(misc_item_type kind) const
    {
        for (int i = 0; i < ENDOFPACK; ++i)
            if (you.inv[i].is_type(OBJ_MISCELLANY, kind))
                return i;
        return -1;
    }
};
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist lessons move when Trog forbids their skill", "[archaeologist]")
{
    you.props["archaeologist_phase"] = 2;
    you.props["archaeologist_skill"] = static_cast<int>(SK_FIRE_MAGIC);
    you.props["archaeologist_remaining"] = 400;
    you.skill_manual_points[SK_FIRE_MAGIC] = 600; // 200 from another manual.
    you.religion = GOD_TROG;
    join_trog_skills();
    const skill_type next = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    CHECK(next != SK_FIRE_MAGIC);
    CHECK_FALSE(is_useless_skill(next));
    CHECK(you.skill_manual_points[SK_FIRE_MAGIC] == 200);
    CHECK(you.skill_manual_points[next] == 400);
    CHECK(you.props["archaeologist_remaining"].get_int() == 400);
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist keeps trainable distributed magic lessons", "[archaeologist]")
{
    you.props["archaeologist_phase"] = 2;
    you.props["archaeologist_skill"] = static_cast<int>(SK_FIRE_MAGIC);
    you.props["archaeologist_remaining"] = 400;
    you.skill_manual_points[SK_FIRE_MAGIC] = 400;
    you.mutation[MUT_DISTRIBUTED_TRAINING] = 1;
    you.religion = GOD_TROG;
    join_trog_skills();
    CHECK(you.props["archaeologist_skill"].get_int() == SK_FIRE_MAGIC);
    CHECK(you.skill_manual_points[SK_FIRE_MAGIC] == 400);
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist avoids sacrificed skills when moving lessons", "[archaeologist]")
{
    you.props["archaeologist_phase"] = 2;
    you.props["archaeologist_skill"] = static_cast<int>(SK_FIRE_MAGIC);
    you.props["archaeologist_remaining"] = 400;
    you.skill_manual_points[SK_FIRE_MAGIC] = 600;
    you.mutation[MUT_NO_FIRE_MAGIC] = 1;
    you.mutation[MUT_NO_STEALTH] = 1;
    REQUIRE(is_useless_skill(SK_FIRE_MAGIC));
    archaeologist::reconcile_training();
    const skill_type next = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    CHECK_FALSE(is_useless_skill(next));
    CHECK(you.skill_manual_points[SK_FIRE_MAGIC] == 200);
    CHECK(you.skill_manual_points[next] == 400);
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist lesson reconciliation stays with its party member", "[archaeologist]")
{
    you.props["archaeologist_phase"] = 2;
    you.props["archaeologist_skill"] = static_cast<int>(SK_FIRE_MAGIC);
    you.props["archaeologist_remaining"] = 400;
    you.skill_manual_points[SK_FIRE_MAGIC] = 400;
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = you;
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.religion = GOD_TROG;
    party::set_multiplayer(true);
    {
        party::scoped_player_context context(1);
        join_trog_skills();
        CHECK(you.props["archaeologist_skill"].get_int() != SK_FIRE_MAGIC);
        CHECK(party::get_player(0).props["archaeologist_skill"].get_int() == SK_FIRE_MAGIC);
        CHECK(party::get_player(0).skill_manual_points[SK_FIRE_MAGIC] == 400);
    }
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist reserves one usable relic and carries its clues", "[archaeologist]")
{
    archaeologist::start_quest();
    const int crate = find_item(MISC_ANCIENT_CRATE);
    const int tome = find_item(MISC_DUSTY_TOME);
    REQUIRE(crate >= 0);
    REQUIRE(tome >= 0);
    REQUIRE(you.props.exists("archaeologist_unrand"));
    const int index = you.props["archaeologist_unrand"].get_int();
    CHECK(get_unique_item_status(index) == UNIQ_EXISTS);
    CHECK(archaeologist::item_description(you.inv[crate]).find("level 3") != string::npos);
    CHECK(archaeologist::item_description(you.inv[tome]).find("Scholar") != string::npos);
    archaeologist::start_quest();
    CHECK(find_item(MISC_ANCIENT_CRATE) == crate);
    CHECK(find_item(MISC_DUSTY_TOME) == tome);
}

TEST_CASE_METHOD(archaeologist_fixture, "Every eligible Archaeologist can reserve distinct party relics",
                 "[archaeologist][archaeologist-species]")
{
    player baseline = you;
    auto* const save = you.save;
    baseline.save = nullptr;
    for (species_type species : playable_species())
    {
        if (!character_is_allowed(species, JOB_ARCHAEOLOGIST))
            continue;
        for (character_trait trait : {character_trait::none, character_trait::mummy,
                                      character_trait::zombie, character_trait::ghost})
        {
            if (check_trait(trait, species, JOB_ARCHAEOLOGIST)
                != trait_restriction::allowed)
                continue;
            CAPTURE(species, static_cast<int>(trait));
            you = baseline;
            you.save = save;
            you.species = species;
            you.char_class = JOB_ARCHAEOLOGIST;
            give_basic_mutations(species);
            REQUIRE(set_character_trait(you, trait) == trait_restriction::allowed);
            give_basic_trait_mutations();
            set<int> reserved;
            for (int member = 0; member < party::MAX_PARTY_PLAYERS; ++member)
            {
                CAPTURE(member);
                for (item_def& item : you.inv)
                    item.clear();
                you.props.erase("archaeologist_phase");
                archaeologist::start_quest();
                REQUIRE(you.props.exists("archaeologist_phase"));
                REQUIRE(find_item(MISC_ANCIENT_CRATE) >= 0);
                REQUIRE(find_item(MISC_DUSTY_TOME) >= 0);
                const int index = you.props["archaeologist_unrand"].get_int();
                CHECK(reserved.insert(index).second);
                CHECK(get_unique_item_status(index) == UNIQ_EXISTS);
            }
        }
    }
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist recovers a dropped tome and finishes its own manual", "[archaeologist]")
{
    archaeologist::start_quest();
    const int crate_slot = find_item(MISC_ANCIENT_CRATE);
    const int tome_slot = find_item(MISC_DUSTY_TOME);
    REQUIRE(crate_slot >= 0);
    REQUIRE(tome_slot >= 0);
    item_def tome = you.inv[tome_slot];
    you.inv[tome_slot].clear();
    you.experience_level = 3;
    archaeologist::on_level_change();
    CHECK(you.props["archaeologist_phase"].get_int() == 1);
    REQUIRE(archaeologist::on_pickup(tome));
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    REQUIRE(you.skill_manual_points[skill] == 700);
    you.skill_manual_points[skill] += 500; // An unrelated manual of the same skill.
    {
        unwind_var<bool> simulation(crawl_state.simulating_xp_gain, true);
        archaeologist::on_manual_training(skill, 50);
        CHECK(you.props["archaeologist_remaining"].get_int() == 700);
    }
    archaeologist::on_manual_training(skill, 250);
    CHECK(you.props["archaeologist_remaining"].get_int() == 450);
    you.skill_manual_points[skill] -= 700;
    archaeologist::on_manual_training(skill, 450);
    CHECK(you.skill_manual_points[skill] == 500);
    CHECK(is_unrandom_artefact(you.inv[crate_slot]));
    const int index = you.props["archaeologist_unrand"].get_int();
    const unrandart_entry* entry = get_unrand_entry(index);
    REQUIRE(entry);
    CHECK(you.inv[crate_slot].unrand_idx == index);
    CHECK(you.inv[crate_slot].base_type == entry->base_type);
    CHECK(you.inv[crate_slot].sub_type == entry->sub_type);
    CHECK(you.props["archaeologist_phase"].get_int() == 4);
}

TEST_CASE_METHOD(archaeologist_fixture, "Archaeologist quest state and dropped crate survive recovery", "[archaeologist]")
{
    archaeologist::start_quest();
    const int crate_slot = find_item(MISC_ANCIENT_CRATE);
    REQUIRE(crate_slot >= 0);
    item_def dropped = you.inv[crate_slot];
    you.inv[crate_slot].clear();
    you.experience_level = 3;
    archaeologist::on_level_change();
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    archaeologist::on_manual_training(skill, 700);
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_YOU, output);
    you.props.erase("archaeologist_phase");
    reader input(bytes, TAG_MINOR_VERSION);
    tag_read(input, TAG_YOU);
    CHECK(you.props["archaeologist_phase"].get_int() == 3);
    CHECK_FALSE(archaeologist::on_pickup(dropped));
    CHECK(is_unrandom_artefact(dropped));
    CHECK(you.props["archaeologist_phase"].get_int() == 4);
}

TEST_CASE_METHOD(archaeologist_fixture, "Real skill training advances the Archaeologist tome", "[archaeologist]")
{
    archaeologist::start_quest();
    REQUIRE(find_item(MISC_DUSTY_TOME) >= 0);
    you.experience_level = 3;
    archaeologist::on_level_change();
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    set_skill_level(skill, 1, true);
    you.auto_training = false;
    you.train.init(TRAINING_DISABLED);
    you.train[skill] = TRAINING_ENABLED;
    reset_training();
    you.exp_available = 100;
    train_skills(false);
    CHECK(you.props["archaeologist_remaining"].get_int() < 700);
    CHECK(you.skill_manual_points[skill]
          == static_cast<unsigned>(you.props["archaeologist_remaining"].get_int()));
}

TEST_CASE_METHOD(archaeologist_fixture, "A capped quest skill transfers its lessons", "[archaeologist]")
{
    archaeologist::start_quest();
    const skill_type initial = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    SECTION("the skill is capped before the tome is deciphered")
    {
        you.skills[initial] = MAX_SKILL_LEVEL;
        you.experience_level = 3;
        archaeologist::on_level_change();
        const skill_type next = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
        CHECK(next != initial);
        CHECK(you.skill_manual_points[next] == 700);
    }
    SECTION("the skill reaches its cap while studying")
    {
        you.experience_level = 3;
        archaeologist::on_level_change();
        REQUIRE(you.skill_manual_points[initial] == 700);
        you.skills[initial] = MAX_SKILL_LEVEL;
        archaeologist::on_skill_maxed(initial);
        const skill_type next = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
        CHECK(next != initial);
        CHECK(you.skill_manual_points[initial] == 0);
        CHECK(you.skill_manual_points[next] == 700);
    }
}

TEST_CASE_METHOD(archaeologist_fixture, "A missing reservation cannot consume or duplicate a crate", "[archaeologist]")
{
    archaeologist::start_quest();
    const int crate_slot = find_item(MISC_ANCIENT_CRATE);
    REQUIRE(crate_slot >= 0);
    item_def crate = you.inv[crate_slot];
    you.inv[crate_slot].clear();
    you.experience_level = 3;
    archaeologist::on_level_change();
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    archaeologist::on_manual_training(skill, 700);
    const int index = you.props["archaeologist_unrand"].get_int();
    you.unique_items[index - UNRAND_START] = UNIQ_NOT_EXISTS;
    CHECK_FALSE(archaeologist::on_pickup(crate));
    CHECK(crate.is_type(OBJ_MISCELLANY, MISC_ANCIENT_CRATE));
    CHECK(crate.props.exists("archaeologist_owner"));
    CHECK(you.props["archaeologist_phase"].get_int() == 3);
    you.unique_items[index - UNRAND_START] = UNIQ_EXISTS;
    item_def duplicate = crate;
    CHECK_FALSE(archaeologist::on_pickup(crate));
    REQUIRE(is_unrandom_artefact(crate));
    CHECK_FALSE(archaeologist::on_pickup(duplicate));
    CHECK(duplicate.is_type(OBJ_MISCELLANY, MISC_ANCIENT_CRATE));
}

TEST_CASE_METHOD(archaeologist_fixture, "Party archaeologists reserve distinct relics", "[archaeologist]")
{
    archaeologist::start_quest();
    const int first = you.props["archaeologist_unrand"].get_int();
    party::set_player_count(2);
    player& other = party::get_player(1);
    other = player();
    other.mid = party::mid_for_slot(1);
    other.save = nullptr;
    other.species = SP_HUMAN;
    other.char_class = JOB_ARCHAEOLOGIST;
    other.religion = GOD_NO_GOD;
    other.where_are_you = BRANCH_DUNGEON;
    other.depth = 1;
    other.hp = other.hp_max = 100;
    other.unique_items = you.unique_items;
    party::set_multiplayer(true);
    int second = -1;
    {
        party::scoped_player_context context(1);
        archaeologist::start_quest();
        REQUIRE(you.props.exists("archaeologist_unrand"));
        second = you.props["archaeologist_unrand"].get_int();
        CHECK(second != first);
    }
    CHECK(you.unique_items[first - UNRAND_START] == UNIQ_EXISTS);
    CHECK(you.unique_items[second - UNRAND_START] == UNIQ_EXISTS);
    CHECK(other.unique_items[first - UNRAND_START] == UNIQ_EXISTS);
    CHECK(other.unique_items[second - UNRAND_START] == UNIQ_EXISTS);
}

TEST_CASE_METHOD(archaeologist_fixture, "A companion-held crate opens for its owner", "[archaeologist]")
{
    archaeologist::start_quest();
    const int crate_slot = find_item(MISC_ANCIENT_CRATE);
    REQUIRE(crate_slot >= 0);
    party::set_player_count(2);
    player& holder = party::get_player(1);
    holder = player();
    holder.mid = party::mid_for_slot(1);
    holder.save = nullptr;
    holder.species = SP_HUMAN;
    holder.where_are_you = BRANCH_DUNGEON;
    holder.depth = 1;
    holder.hp = holder.hp_max = 100;
    holder.inv[0] = you.inv[crate_slot];
    holder.inv[0].link = 0;
    you.inv[crate_slot].clear();
    party::set_multiplayer(true);
    you.experience_level = 3;
    archaeologist::on_level_change();
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    archaeologist::on_manual_training(skill, 700);
    CHECK(is_unrandom_artefact(holder.inv[0]));
    CHECK(party::active_slot() == 0);
}

TEST_CASE_METHOD(archaeologist_fixture, "A companion-held tome is deciphered for its owner", "[archaeologist]")
{
    archaeologist::start_quest();
    const int tome_slot = find_item(MISC_DUSTY_TOME);
    REQUIRE(tome_slot >= 0);
    party::set_player_count(2);
    player& holder = party::get_player(1);
    holder = player();
    holder.mid = party::mid_for_slot(1);
    holder.save = nullptr;
    holder.species = SP_HUMAN;
    holder.where_are_you = BRANCH_DUNGEON;
    holder.depth = 1;
    holder.hp = holder.hp_max = 100;
    holder.inv[0] = you.inv[tome_slot];
    holder.inv[0].link = 0;
    you.inv[tome_slot].clear();
    party::set_multiplayer(true);
    you.experience_level = 3;
    archaeologist::on_level_change();
    CHECK_FALSE(holder.inv[0].defined());
    CHECK(you.props["archaeologist_phase"].get_int() == 2);
    const skill_type skill = static_cast<skill_type>(you.props["archaeologist_skill"].get_int());
    CHECK(you.skill_manual_points[skill] == 700);
    CHECK(party::active_slot() == 0);
}
