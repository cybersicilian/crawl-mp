#include <algorithm>
#include <random>

#include "catch_amalgamated.hpp"

#include "AppHdr.h"

#include "ability-type.h"
#include "branch.h"
#include "dungeon.h"
#include "item-prop-enum.h"
#include "map-cell.h"
#include "player.h"
#include "random.h"
#include "tags.h"
#include "test_player_fixture.h"
#include "unwind.h"

TEST_CASE("Saved wizard hotkeys remain loadable without wizard commands", "[save-compatibility]")
{
#ifdef WIZARD
    STATIC_REQUIRE(ABIL_WIZ_BUILD_TERRAIN == 10000);
    STATIC_REQUIRE(ABIL_WIZ_SET_TERRAIN == 10001);
    STATIC_REQUIRE(ABIL_WIZ_CLEAR_TERRAIN == 10002);
#endif
    for (const int ability : {int(ABIL_NON_ABILITY), int(ABIL_PAKELLAS_FIELD_KIT),
                             int(ABIL_PALADIN_INTERVENE), 9999, 10000, 10001, 10002, 10003})
    {
        vector<unsigned char> bytes;
        writer output(&bytes);
        marshallShort(output, ability);
        reader input(bytes);
        int expected = ability;
#ifndef WIZARD
        if (ability == 10000 || ability == 10001 || ability == 10002)
            expected = ABIL_NON_ABILITY;
#endif
        REQUIRE(unmarshall_player_ability_binding(input) == expected);
        REQUIRE_FALSE(input.valid());
    }
}

TEST_CASE( "Vehumet gifts can be decoded", "[single-file]" ) {

    SECTION ("spells stored as bytes can be read") {
        vector<unsigned char> input = {
            0x01, // count
            0x03, // SPELL_MAGIC_DART
            0x01, // count
            0x04, // SPELL_FIREBALL
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_SHORT_SPELL_TYPE - 1);

        const set<spell_type> expected_old_gifts = { SPELL_MAGIC_DART };
        const set<spell_type> expected_gifts = { SPELL_FIREBALL };

        set<spell_type> old_gifts, gifts;
        unmarshall_vehumet_spells(r, old_gifts, gifts);

        REQUIRE(old_gifts == expected_old_gifts);
        REQUIRE(gifts == expected_gifts);
        REQUIRE(r.valid() == false);
    }

    SECTION ("spells stored as shorts can be read") {
        vector<unsigned char> input = {
            0x01, // count
            0x00, 0x03, // SPELL_MAGIC_DART
            0x01, // count
            0x00, 0x04, // SPELL_FIREBALL
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_SHORT_SPELL_TYPE);

        const set<spell_type> expected_old_gifts = { SPELL_MAGIC_DART };
        const set<spell_type> expected_gifts = { SPELL_FIREBALL };

        set<spell_type> old_gifts, gifts;
        unmarshall_vehumet_spells(r, old_gifts, gifts);

        REQUIRE(old_gifts == expected_old_gifts);
        REQUIRE(gifts == expected_gifts);
        REQUIRE(r.valid() == false);
    }

    SECTION ("removed spells are filtered out") {
        vector<unsigned char> input = {
            0x02, // count
            0x04, // SPELL_FIREBALL
            0x06, // SPELL_DELAYED_FIREBALL
            0x02, // count
            0x03, // SPELL_MAGIC_DART
            0x07, // SPELL_STRIKING
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_SHORT_SPELL_TYPE - 1);

        const set<spell_type> expected_old_gifts = { SPELL_FIREBALL };
        const set<spell_type> expected_gifts = { SPELL_MAGIC_DART };

        set<spell_type> old_gifts, gifts;
        unmarshall_vehumet_spells(r, old_gifts, gifts);

        REQUIRE(old_gifts == expected_old_gifts);
        REQUIRE(gifts == expected_gifts);
        REQUIRE(r.valid() == false);
    }
}

TEST_CASE( "Player spells can be decoded", "[single-file]" ) {

    SECTION ("spells stored as shorts can be read") {
        vector<unsigned char> input = {
            0x02, // count
            0x00, 0x03, // SPELL_MAGIC_DART
            0x00, 0x04, // SPELL_FIREBALL
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_SHORT_SPELL_TYPE);

        FixedVector<spell_type, MAX_KNOWN_SPELLS> expected_spells(SPELL_NO_SPELL);
        expected_spells[0] = SPELL_MAGIC_DART;
        expected_spells[1] = SPELL_FIREBALL;

        const auto result = unmarshall_player_spells(r);

        for (size_t i = 0; i < result.size(); i++)
            REQUIRE(result[i] == expected_spells[i]);
        REQUIRE(r.valid() == false);
    }

    SECTION ("removed spells are filtered out") {
        vector<unsigned char> input = {
            0x02, // count
            0x00, 0x07, // SPELL_STRIKING
            0x00, 0x04, // SPELL_FIREBALL
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_SHORT_SPELL_TYPE);

        FixedVector<spell_type, MAX_KNOWN_SPELLS> expected_spells(SPELL_NO_SPELL);
        expected_spells[0] = SPELL_NO_SPELL;
        expected_spells[1] = SPELL_FIREBALL;

        const auto result = unmarshall_player_spells(r);

        for (size_t i = 0; i < result.size(); i++)
            REQUIRE(result[i] == expected_spells[i]);
        REQUIRE(r.valid() == false);
    }
}

TEST_CASE( "Removed spells remover can filter spell library", "[single-file]" ) {

    SECTION ("removed spells are removed from the library") {
        FixedBitVector<NUM_SPELLS> library;
        library.set(SPELL_STRIKING, true);

        remove_removed_library_spells(library);

        REQUIRE(library[SPELL_STRIKING] == false);
    }

    SECTION ("non-removed spells are not removed from the library") {
        FixedBitVector<NUM_SPELLS> library;
        library.set(SPELL_MAGIC_DART, true);

        remove_removed_library_spells(library);

        REQUIRE(library[SPELL_MAGIC_DART] == true);
    }

    SECTION ("non-present spells are not added to the library") {
        FixedBitVector<NUM_SPELLS> library;
        library.set(SPELL_MAGIC_DART, false);

        remove_removed_library_spells(library);

        REQUIRE(library[SPELL_MAGIC_DART] == false);
    }
}

TEST_CASE( "Monster spell unmarshalling can remove removed spells", "[single-file]" ) {

    SECTION ("removed spells are removed from the spell list") {
        vector<unsigned char> input = {
            0x01, // count
            0x00, 0x07, // SPELL_STRIKING
            0x01, // frequency
            0x00, 0x10, // MON_SPELL_WIZARD
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_TRACK_REGEN_ITEMS);
        const auto hd = 30;

        monster_spells spells;
        unmarshallSpells(r, spells, hd);

        REQUIRE(spells.empty());
        REQUIRE(r.valid() == false);
    }

    SECTION ("non-removed spells are not removed from the spell list") {
        vector<unsigned char> input = {
            0x01, // count
            0x00, 0x03, // SPELL_MAGIC_DART
            0x01, // frequency
            0x00, 0x10, // MON_SPELL_WIZARD
        };
        auto r = reader(input);
        r.setMinorVersion(TAG_MINOR_TRACK_REGEN_ITEMS);
        const auto hd = 30;

        monster_spells spells;
        unmarshallSpells(r, spells, hd);

        REQUIRE(spells.size() == 1);
        REQUIRE(r.valid() == false);
    }
}

TEST_CASE( "Basic marshalling/unmarshalling works correctly.", "[single-file]" ) {

    void marshallMapCell (writer &, const map_cell &);
    void unmarshallMapCell (reader &, map_cell& cell);

    SECTION ("Short integers can be roundtripped.") {
        rng::subgenerator subgen(0, 0);

        for (auto i = 0; i < 1000; i++)
        {
            short number = random_range(INT16_MIN, INT16_MAX);

            vector<unsigned char> buf;
            auto w = writer(&buf);
            marshallShort(w, number);

            auto r = reader(buf);
            const auto roundtrip_number = unmarshallShort(r);

            REQUIRE(number == roundtrip_number);
            REQUIRE(r.valid() == false);
        }
    }

    SECTION ("Map cells can be roundtripped.") {
        auto roundtrip_map_cell = [](const map_cell cell) {
            vector<unsigned char> buf;
            auto w = writer(&buf);
            marshallMapCell(w, cell);

            auto r = reader(buf);
            map_cell roundtrip_cell;
            unmarshallMapCell(r, roundtrip_cell);

            // TODO: Compare other members.
            REQUIRE(cell.flags == roundtrip_cell.flags);
            REQUIRE(r.valid() == false);
        };

        map_cell cell;

        cell.flags = 129;
        roundtrip_map_cell(cell);

        cell.flags = 32769;
        roundtrip_map_cell(cell);

        random_device rd;
        mt19937 generator(rd());
        uniform_int_distribution<uint32_t> distribution(0, UINT32_MAX);
        for (auto i = 0; i < 1000; i++)
        {
            cell.flags = distribution(generator);
            roundtrip_map_cell(cell);
        }
    }
}

static int _gem_time_marker(int gem)
{
    return 0x00A55A00 + gem;
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Saves from before the Burrows gem keep their stream alignment",
                 "[save-compatibility]")
{
    dgn_reset_level(false);
    unwind_var<int> dungeon_depth(brdepth[BRANCH_DUNGEON], 15);
    you.where_are_you = BRANCH_DUNGEON;
    you.depth = 1;
    for (int gem = 0; gem < NUM_GEM_TYPES; ++gem)
        you.gem_time_spent[gem] = _gem_time_marker(gem);

    vector<unsigned char> current;
    writer output(&current);
    tag_write(TAG_YOU, output);

    // Find the gem times and drop the Burrows one, as the writer did before
    // GEM_BURROWS existed. The tag starts with its payload size.
    vector<unsigned char> times;
    writer time_output(&times);
    for (int gem = 0; gem < NUM_GEM_TYPES; ++gem)
        marshallInt(time_output, _gem_time_marker(gem));
    const auto found = search(current.begin(), current.end(),
                              times.begin(), times.end());
    REQUIRE(found != current.end());
    vector<unsigned char> old = current;
    const auto burrows = old.begin() + (found - current.begin())
                         + GEM_BURROWS * 4;
    old.erase(burrows, burrows + 4);
    reader size_input(current);
    const int size = unmarshallInt(size_input);
    vector<unsigned char> old_size;
    writer size_output(&old_size);
    marshallInt(size_output, size - 4);
    copy(old_size.begin(), old_size.end(), old.begin());

    const auto check_read = [](const vector<unsigned char> &bytes, int minor,
                               bool has_burrows)
    {
        for (int gem = 0; gem < NUM_GEM_TYPES; ++gem)
            you.gem_time_spent[gem] = -1;
        reader input(bytes, minor);
        tag_read(input, TAG_YOU);
        for (int gem = 0; gem < GEM_BURROWS; ++gem)
            CHECK(you.gem_time_spent[gem] == _gem_time_marker(gem));
        CHECK(you.gem_time_spent[GEM_BURROWS]
              == (has_burrows ? _gem_time_marker(GEM_BURROWS) : 0));
    };

    check_read(old, TAG_MINOR_PROTECTED_CLOUDS, false);
    check_read(old, TAG_MINOR_PROTECTED_CLOUDS - 1, false);
    check_read(current, TAG_MINOR_PROTECTED_CLOUDS, true);
    check_read(current, TAG_MINOR_VERSION, true);
}
