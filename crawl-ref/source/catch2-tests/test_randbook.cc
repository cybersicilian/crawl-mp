#include <random>

#include "catch_amalgamated.hpp"

#include "AppHdr.h"

#include "artefact.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-prop-enum.h"
#include "items.h"
#include "player.h"
#include "store.h"
#include "randbook.h"
#include "spl-book.h"
#include "spl-util.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Random spellbooks do not grant equipment abilities or Evocations training",
                 "[randbook][item-training]")
{
    init_spell_descs();
    item_def book;
    book.base_type = OBJ_BOOKS;
    book.sub_type = BOOK_RANDART_THEME;
    book.quantity = 1;
    book.flags |= ISFLAG_RANDART | ISFLAG_IDENTIFIED;
    _set_book_spell_list(book, {SPELL_AURA_OF_PASSAGE, SPELL_AURA_OF_RESONANCE,
                               SPELL_FIREBALL, SPELL_SWIFTNESS});

    book.pos = coord_def(40, 35);
    book.link = NON_ITEM;
    REQUIRE(is_random_artefact(book));
    REQUIRE(book.is_identified());
    REQUIRE_FALSE(is_useless_item(book));
    for (const bool carried : {false, true})
    {
        CAPTURE(carried);
        if (carried)
        {
            you.inv[0] = book;
            you.inv[0].pos = ITEM_IN_INVENTORY;
            you.inv[0].link = 0;
            you.inv[0].slot = 'a';
        }
        const item_def& inspected = carried ? you.inv[0] : book;
        CHECK_FALSE(gives_ability(inspected));
        set<skill_type> book_skills;
        CHECK_FALSE(item_skills(inspected, book_skills));
        CHECK(book_skills.empty());
    }

    set<skill_type> skills;
    item_def manual;
    manual.base_type = OBJ_BOOKS;
    manual.sub_type = BOOK_MANUAL;
    manual.quantity = 1;
    manual.plus = SK_ARMOUR;
    manual.flags |= ISFLAG_IDENTIFIED;
    CHECK(item_skills(manual, skills));
    CHECK(skills.count(SK_ARMOUR) == 1);
    CHECK(skills.count(SK_EVOCATIONS) == 0);

    item_def cloak;
    cloak.base_type = OBJ_ARMOUR;
    cloak.sub_type = ARM_CLOAK;
    cloak.quantity = 1;
    cloak.brand = SPARM_INVISIBILITY;
    cloak.flags |= ISFLAG_IDENTIFIED;
    CHECK(gives_ability(cloak));

    item_def blinking_dagger;
    blinking_dagger.base_type = OBJ_WEAPONS;
    blinking_dagger.sub_type = WPN_DAGGER;
    blinking_dagger.quantity = 1;
    blinking_dagger.flags |= ISFLAG_RANDART | ISFLAG_IDENTIFIED;
    CrawlVector& properties = blinking_dagger.props[ARTEFACT_PROPS_KEY].new_vector(SV_SHORT);
    properties.resize(ART_PROPERTIES);
    properties.set_max_size(ART_PROPERTIES);
    for (vec_size i = 0; i < ART_PROPERTIES; ++i)
        properties[i].get_short() = 0;
    artefact_set_property(blinking_dagger, ARTP_BLINK, 1);
    CHECK(gives_ability(blinking_dagger));
    skills.clear();
    CHECK(item_skills(blinking_dagger, skills));
    CHECK(skills.count(SK_EVOCATIONS) == 1);
}

TEST_CASE( "When setting book spell list", "[single-file]" ) {

    item_def book;

    SECTION("spells will be padded with SPELL_NO_SPELL") {
        init_spell_descs();
        vector<spell_type> spells = {SPELL_MAGIC_DART, SPELL_CAUSE_FEAR};

        _set_book_spell_list(book, spells);

        const auto& book_spells = book.props[SPELL_LIST_KEY].get_vector();
        REQUIRE(book_spells.size() == RANDBOOK_SIZE);
        for (auto i = 2; i < RANDBOOK_SIZE; i++ )
            REQUIRE(book_spells[i].get_int() == SPELL_NO_SPELL);
    }

    SECTION("the spell list will be truncated to RANDBOOK_SIZE entries") {
        init_spell_descs();
        vector<spell_type> spells = {
            SPELL_FREEZE,
            SPELL_SOUL_SPLINTER,
            SPELL_APPORTATION,
            SPELL_SUMMON_SMALL_MAMMAL,
            SPELL_MAGIC_DART,
            SPELL_SHOCK,
            SPELL_SANDBLAST,
            SPELL_FOXFIRE,
            SPELL_STING,
        };

        _set_book_spell_list(book, spells);

        const auto& book_spells = book.props[SPELL_LIST_KEY].get_vector();
        REQUIRE(book_spells.size() == RANDBOOK_SIZE);
    }
}
