#include "catch_amalgamated.hpp"

#include "AppHdr.h"
#include "automaton.h"
#include "delay.h"
#include "spl-util.h"
#include "player.h"
#include "skills.h"
#include "spl-book.h"
#include "rltiles/tiledef-gui.h"
#include "test_player_fixture.h"

TEST_CASE("Fixed spellbooks list spells in level order", "[spellbooks]")
{
    init_spell_descs();
    for (int i = 0; i < NUM_BOOKS; ++i)
    {
        const book_type book = static_cast<book_type>(i);
        if (!book_exists(book))
            continue;
        int previous_level = 0;
        for (const spell_type spell : spellbook_template(book))
        {
            INFO("book=" << i << " spell=" << static_cast<int>(spell));
            REQUIRE(spell != SPELL_NO_SPELL);
            const int level = spell_difficulty(spell);
            CHECK(level >= previous_level);
            previous_level = level;
        }
    }
}

TEST_CASE("All spells are valid")
{
    // we require that all spells are `valid`: this means that they must have
    // a spell stub in spl-data.h, even if removed. (This is a change from the
    // past, before spell stubs existed.)
    init_spell_descs();

    for (int s = SPELL_FIRST_SPELL; s < NUM_SPELLS; s++)
    {
        const spell_type spell = static_cast<spell_type>(s);
        if (spell == SPELL_NO_SPELL)
            continue;
        // A fail here means that there is a removed spell with no data at all.
        // For consistency, add an AXED_SPELL line to spl-data.h.
        // n.b. if a spell is invalid, it won't have a name, and so if it's very
        // far into the enum, your best bet to find out what it is is to print
        // all the names before it.
        INFO("Testing validity for spell #" << s);
        REQUIRE(is_valid_spell(spell));
    }
}

// TODO: in principle many of the checks in init_spell_descs could be refactored
// as catch2 tests.
TEST_CASE("Removed spells and AXED_SPELLs are in sync" )
{
    // A spell should be AXED iff it is removed.
    // TODO: is there a way for SPELL_AXED to automatically set removed status,
    // making this test unnecessary?
    init_monsters();
    init_spell_descs();
    init_spell_name_cache();

    for (int s = SPELL_FIRST_SPELL; s < NUM_SPELLS; s++)
    {
        const spell_type spell = static_cast<spell_type>(s);
        // validity is tested separately: a completely invalid spell will
        // crash below this check.
        if (spell == SPELL_NO_SPELL || !is_valid_spell(spell))
            continue;

        // Use a heuristic to identify spells that have a stub set with
        // SPELL_AXED.
        // TODO: is it worth checking every field here?
        const bool spell_is_axed = get_spell_flags(spell) == spflag::none
            && get_spell_tile(spell) == TILEG_ERROR
            && get_spell_disciplines(spell) == spschool::none;

        INFO("Testing removedness for " << spell_title(spell));
        REQUIRE(spell_removed(spell) == spell_is_axed);
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Spell library counts match the hero's memorisation limits",
                 "[spell-library]")
{
    init_spell_descs();
    you.spell_library.reset();
    you.vehumet_gifts.clear();
    you.spells.fill(SPELL_NO_SPELL);
    you.spell_no = 0;
    you.experience_level = 5;
    REQUIRE(player_spell_levels() == 4);
    REQUIRE(get_spell_library_summary().total == 0);
    REQUIRE(get_spell_library_summary().memorisable == 0);

    for (spell_type spell : {SPELL_MAGIC_DART, SPELL_SEARING_RAY, SPELL_FIREBALL})
        you.spell_library.set(spell, true);

    int total = 3;
    int memorisable = 2;
    SECTION("Unlearned spells include those above free spell levels") {}
    SECTION("Known spells are counted with casting powers instead")
    {
        you.spells[0] = SPELL_MAGIC_DART;
        you.spell_no = 1;
        total = 2;
        memorisable = 1;
    }
    SECTION("Experience limits eligibility even with enough free levels")
    {
        you.experience_level = 1;
        set_skill_level(SK_SPELLCASTING, 5, true);
        REQUIRE(player_spell_levels() >= 5);
        memorisable = 1;
    }
    SECTION("No free levels prevents memorisation")
    {
        you.experience_level = 1;
        memorisable = 0;
    }
    SECTION("Hidden spells and divine offers use unique spell IDs")
    {
        you.hidden_spells.set(SPELL_MAGIC_DART, true);
        you.vehumet_gifts.insert(SPELL_SEARING_RAY);
        you.vehumet_gifts.insert(SPELL_FROZEN_RAMPARTS);
        total = 4;
        memorisable = 3;
    }
    SECTION("Confusion temporarily prevents learning")
    {
        you.duration[DUR_CONF] = 10;
        memorisable = 0;
    }
    SECTION("Berserk temporarily prevents learning")
    {
        you.duration[DUR_BERSERK] = 10;
        memorisable = 0;
    }
    SECTION("Full spell memory prevents further learning")
    {
        you.spell_no = MAX_KNOWN_SPELLS;
        memorisable = 0;
    }
    SECTION("Spells already being learned are not offered twice")
    {
        you.delay_queue.push_back(make_shared<MemoriseDelay>(2, SPELL_SEARING_RAY));
        memorisable = 1;
    }
    SECTION("Sacrificed schools cannot be memorised")
    {
        you.mutation[MUT_NO_CONJURATION_MAGIC] = 1;
        memorisable = 0;
    }
    SECTION("Religious restrictions apply to every library entry")
    {
        you.religion = GOD_TROG;
        memorisable = 0;
    }
    const spell_library_summary summary = get_spell_library_summary();
    REQUIRE(summary.total == total);
    REQUIRE(summary.memorisable == memorisable);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Automaton library counts unlearned spells without triggers separately",
                 "[spell-library]")
{
    init_spell_descs();
    you.species = SP_AUTOMATON;
    you.spell_library.reset();
    you.hidden_spells.reset();
    you.vehumet_gifts.clear();
    you.spells.fill(SPELL_NO_SPELL);
    you.spell_no = 0;
    you.experience_level = 27;
    you.spell_library.set(SPELL_MAGIC_DART, true);
    you.spell_library.set(SPELL_SUMMON_FOREST, true);
    you.hidden_spells.set(SPELL_SUMMON_FOREST, true);

    SECTION("unsupported saved spells cannot be memorised even when hidden")
    {
        const auto summary = get_spell_library_summary();
        CHECK(summary.total == 2);
        CHECK(summary.memorisable == 1);
        CHECK(summary.without_automatic_trigger == 1);
        CHECK_FALSE(you_can_memorise(SPELL_SUMMON_FOREST));
        CHECK(desc_cannot_memorise_reason(SPELL_SUMMON_FOREST)
              == "this spell has no automatic engraving trigger.");
    }
    SECTION("known spells leave the library count")
    {
        you.spells[0] = SPELL_SUMMON_FOREST;
        you.spell_no = 1;
        const auto summary = get_spell_library_summary();
        CHECK(summary.total == 1);
        CHECK(summary.without_automatic_trigger == 0);
    }
    SECTION("other species do not report an Automaton trigger count")
    {
        you.species = SP_HUMAN;
        CHECK(get_spell_library_summary().without_automatic_trigger == 0);
        CHECK(you_can_memorise(SPELL_SUMMON_FOREST));
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Every Sage book grant excludes unsupported Automaton spells",
                 "[automaton][spell-library][sage]")
{
    init_spell_descs();
    you.species = SP_AUTOMATON;
    for (int b = 0; b < BOOK_ANNIHILATIONS; ++b)
    {
        const auto book = static_cast<book_type>(b);
        if (!book_exists(book))
            continue;
        CAPTURE(b);
        you.spell_library.reset();
        you.hidden_spells.reset();
        library_add_spells(spellbook_template(book), true);
        for (int s = 0; s < NUM_SPELLS; ++s)
            if (you.spell_library[s])
            {
                CAPTURE(s);
                CHECK(automaton::has_automatic_trigger(static_cast<spell_type>(s)));
            }
    }
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Automatons can only acquire and memorise spells with triggers",
                 "[automaton][spell-library]")
{
    init_spell_descs();
    you.species = SP_AUTOMATON;
    you.spell_library.reset();
    you.hidden_spells.reset();
    you.vehumet_gifts.clear();
    you.spells.fill(SPELL_NO_SPELL);
    you.spell_no = 0;

    for (spell_type spell : {SPELL_SUMMON_FOREST, SPELL_MALIGN_GATEWAY})
    {
        CAPTURE(spell);
        REQUIRE_FALSE(automaton::has_automatic_trigger(spell));
        CHECK_FALSE(you_can_memorise(spell));
        CHECK_FALSE(library_add_spells({spell}, true));
        CHECK_FALSE(you.spell_library[spell]);
        CHECK_FALSE(you.hidden_spells[spell]);
        CHECK_FALSE(add_spell_to_memory(spell));
        CHECK_FALSE(you.has_spell(spell));
        CHECK(you.spell_no == 0);
        // The wizard path must also respect permanent species restrictions.
        CHECK_FALSE(learn_spell(spell, true, false));
    }

    SECTION("mixed rewards retain supported spells")
    {
        CHECK(library_add_spells({SPELL_SUMMON_FOREST, SPELL_MAGIC_DART,
                                  SPELL_MALIGN_GATEWAY}, true));
        CHECK(you.spell_library[SPELL_MAGIC_DART]);
        CHECK_FALSE(you.spell_library[SPELL_SUMMON_FOREST]);
        CHECK_FALSE(you.spell_library[SPELL_MALIGN_GATEWAY]);
        CHECK(you_can_memorise(SPELL_MAGIC_DART));
        CHECK(add_spell_to_memory(SPELL_MAGIC_DART));
        CHECK(you.has_spell(SPELL_MAGIC_DART));
    }
    SECTION("old divine offers remain unmemorisable")
    {
        you.vehumet_gifts.insert(SPELL_SUMMON_FOREST);
        CHECK(get_spell_library_summary().memorisable == 0);
        CHECK_FALSE(learn_spell(SPELL_SUMMON_FOREST, false, false));
        CHECK_FALSE(you.spell_library[SPELL_SUMMON_FOREST]);
    }
    SECTION("other species can still acquire unsupported engravings")
    {
        you.species = SP_HUMAN;
        CHECK(library_add_spells({SPELL_SUMMON_FOREST}, true));
        CHECK(you.spell_library[SPELL_SUMMON_FOREST]);
        CHECK(you_can_memorise(SPELL_SUMMON_FOREST));
        CHECK(add_spell_to_memory(SPELL_SUMMON_FOREST));
    }
}
