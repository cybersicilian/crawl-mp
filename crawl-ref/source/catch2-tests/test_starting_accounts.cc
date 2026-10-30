#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "account-start.h"
#include "coordit.h"
#include "env.h"
#include "items.h"
#include "los.h"
#include "mutation.h"
#include "newgame-def.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "terrain.h"
#include "test_player_fixture.h"

namespace
{
class scoped_account
{
public:
    scoped_account(int slot, const char *account)
        : key("CRAWL_ACCOUNT_" + std::to_string(slot)),
          existed(getenv(key.c_str()) != nullptr),
          previous(existed ? getenv(key.c_str()) : "")
    {
        set(account);
    }

    ~scoped_account()
    {
        set(existed ? previous.c_str() : nullptr);
    }

private:
    void set(const char *value)
    {
#ifdef TARGET_OS_WINDOWS
        _putenv_s(key.c_str(), value ? value : "");
#else
        if (value)
            setenv(key.c_str(), value, 1);
        else
            unsetenv(key.c_str());
#endif
    }

    string key;
    bool existed;
    string previous;
};

int acquirement_count(const player &p)
{
    int count = 0;
    for (const auto &item : p.inv)
        if (item.is_type(OBJ_SCROLLS, SCR_ACQUIREMENT))
            count += item.quantity;
    return count;
}

void give_starting_items(species_type species, const string &name)
{
    you.species = species;
    you.your_name = name;
    you.char_class = JOB_FIGHTER;
    give_basic_mutations(species);
    newgame_def ng;
    ng.name = name;
    ng.species = species;
    ng.job = JOB_FIGHTER;
    ng.weapon = WPN_UNARMED;
    give_items_skills(ng);
}

struct altar_fixture : MockPlayerYouTestsFixture
{
    struct tile_state
    {
        coord_def pos;
        dungeon_feature_type feature;
        int item, monster;
    };
    vector<tile_state> original;
    altar_fixture()
    {
        party::set_player_count(1);
        you.set_position(coord_def(40, 35));
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.species = SP_OOZLE;
        for (int x = 38; x <= 47; ++x)
            for (int y = 33; y <= 37; ++y)
            {
                const coord_def pos(x, y);
                original.push_back({pos, env.grid(pos), env.igrid(pos), env.mgrid(pos)});
                env.grid(pos) = DNGN_FLOOR;
                env.igrid(pos) = NON_ITEM;
                env.mgrid(pos) = NON_MONSTER;
            }
        env.grid(you.pos()) = DNGN_STONE_STAIRS_UP_I;
        los_changed();
    }
    ~altar_fixture()
    {
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
        for (const auto& cell : original)
        {
            env.grid(cell.pos) = cell.feature;
            env.igrid(cell.pos) = cell.item;
            env.mgrid(cell.pos) = cell.monster;
        }
        los_changed();
    }
    int adjacent_altars(const coord_def& start)
    {
        int count = 0;
        for (adjacent_iterator cell(start); cell; ++cell)
            count += env.grid(*cell) == DNGN_ALTAR_JIYVA;
        return count;
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Rogue's Oozles and characters named Tav receive starting scrolls",
                 "[starting-accounts]")
{
    const char *account = "Rogue";
    species_type species = SP_OOZLE;
    string name = "Jelly";
    int expected = 2;
    SECTION("Rogue Oozle with a different character name") {}
    SECTION("Account login matching ignores case") { account = "rOgUe"; }
    SECTION("Rogue's Human named Tav")
    {
        species = SP_HUMAN;
        name = "Tav";
    }
    SECTION("Tav character name matching ignores case")
    {
        species = SP_HUMAN;
        name = "tAv";
    }
    SECTION("Rogue's Oozle named Tav receives only two scrolls") { name = "Tav"; }
    SECTION("Rogue playing a different species")
    {
        species = SP_HUMAN;
        expected = 0;
    }
    SECTION("Another account naming an Oozle Rogue")
    {
        account = "Other";
        name = "Rogue";
        expected = 0;
    }
    SECTION("Unsigned local character named Rogue")
    {
        account = nullptr;
        name = "Rogue";
        expected = 0;
    }
    SECTION("Another account's Human named Tav")
    {
        account = "Other";
        species = SP_HUMAN;
        name = "Tav";
        expected = 0;
    }
    SECTION("Unsigned local Human named Tav")
    {
        account = nullptr;
        species = SP_HUMAN;
        name = "Tav";
        expected = 0;
    }
    SECTION("Rogue's Human with a longer name containing Tav")
    {
        species = SP_HUMAN;
        name = "Tavern";
        expected = 0;
    }
    scoped_account identity(party::active_slot(), account);
    give_starting_items(species, name);
    CHECK(acquirement_count(you) == expected);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Starting accounts follow the active native party member",
                 "[starting-accounts]")
{
    const char *host = "Host";
    const char *guest = "Rogue";
    species_type species = SP_OOZLE;
    string name = "Rogue";
    int expected = 2;
    SECTION("Rogue guest receives the scrolls") {}
    SECTION("Rogue guest playing a Human named Tav receives the scrolls")
    {
        species = SP_HUMAN;
        name = "Tav";
    }
    SECTION("Another guest's Tav does not inherit Rogue host's bonus")
    {
        host = "Rogue";
        guest = "Other";
        species = SP_HUMAN;
        name = "Tav";
        expected = 0;
    }
    SECTION("Companion named Tav does not inherit Rogue host's bonus")
    {
        host = "Rogue";
        guest = "";
        species = SP_HUMAN;
        name = "Tav";
        expected = 0;
    }
    SECTION("Another guest does not inherit Rogue host's bonus")
    {
        host = "Rogue";
        guest = "Other";
        expected = 0;
    }
    SECTION("Companion does not inherit Rogue host's bonus")
    {
        host = "Rogue";
        guest = "";
        expected = 0;
    }
    scoped_account host_identity(0, host);
    scoped_account guest_identity(1, guest);
    party::set_player_count(2);
    party::get_player(1) = you;
    party::get_player(1).save = nullptr;
    {
        party::scoped_player_context guest_context(1, false);
        give_starting_items(species, name);
        CHECK(acquirement_count(you) == expected);
    }
    CHECK(acquirement_count(you) == 0);
    party::get_player(1).save = nullptr;
    party::set_player_count(1);
}

TEST_CASE_METHOD(altar_fixture, "Every Oozle starts with a Jiyva altar regardless of account",
                 "[starting-accounts][starting-altar]")
{
    const char* account = "Rogue";
    int expected = 1;
    you.your_name = "Jelly";
    SECTION("Rogue Oozle receives an adjacent altar") {}
    SECTION("Mixed-case Rogue account") { account = "rOgUe"; }
    SECTION("Rogue playing a Human") { you.species = SP_HUMAN; expected = 0; }
    SECTION("Another account with a character named Rogue")
    {
        account = "Other";
        you.your_name = "Rogue";
    }
    SECTION("Unsigned character named Rogue")
    {
        account = nullptr;
        you.your_name = "Rogue";
    }
    SECTION("Another account's Human has no starting altar")
    {
        account = "Other";
        you.species = SP_HUMAN;
        expected = 0;
    }
    SECTION("Unsigned Human has no starting altar")
    {
        account = nullptr;
        you.species = SP_HUMAN;
        expected = 0;
    }
    scoped_account identity(0, account);
    const auto religion = you.religion;
    account_start::place_features();
    CHECK(adjacent_altars(you.pos()) == expected);
    CHECK(env.grid(you.pos()) == DNGN_STONE_STAIRS_UP_I);
    CHECK(you.religion == religion);
    account_start::place_features();
    CHECK(adjacent_altars(you.pos()) == expected);
}

TEST_CASE_METHOD(altar_fixture, "Starting altar preserves features and prefers floor to rock",
                 "[starting-accounts][starting-altar]")
{
    scoped_account identity(0, "Rogue");
    for (adjacent_iterator cell(you.pos()); cell; ++cell)
        env.grid(*cell) = DNGN_ROCK_WALL;
    const coord_def floor = you.pos() + coord_def(1, 0);
    const coord_def stairs = you.pos() + coord_def(0, 1);
    const coord_def door = you.pos() + coord_def(-1, 0);
    env.grid(stairs) = DNGN_STONE_STAIRS_DOWN_I;
    env.grid(door) = DNGN_CLOSED_DOOR;
    SECTION("An adjacent floor is used before any wall")
    {
        env.grid(floor) = DNGN_FLOOR;
        account_start::place_features();
        CHECK(env.grid(floor) == DNGN_ALTAR_JIYVA);
    }
    SECTION("A cramped start receives an adjacent rock alcove")
    {
        account_start::place_features();
    }
    CHECK(adjacent_altars(you.pos()) == 1);
    CHECK(env.grid(stairs) == DNGN_STONE_STAIRS_DOWN_I);
    CHECK(env.grid(door) == DNGN_CLOSED_DOOR);
    CHECK(env.grid(you.pos()) == DNGN_STONE_STAIRS_UP_I);
}

TEST_CASE_METHOD(altar_fixture, "Starting altars follow each Oozle party member's position",
                 "[starting-accounts][starting-altar]")
{
    const char* host = "Host";
    const char* guest = "Rogue";
    int host_altars = 0, guest_altars = 1;
    species_type guest_species = SP_OOZLE;
    you.species = SP_HUMAN;
    SECTION("Rogue guest starts with an altar at their own position") {}
    SECTION("Another account's Oozle guest receives an altar")
    {
        host = "Rogue"; guest = "Other";
    }
    SECTION("Oozle companions receive an altar without an account")
    {
        host = "Rogue"; guest = "";
    }
    SECTION("Rogue and another account both playing Oozles receive altars")
    {
        host = "Rogue"; guest = "Other";
        you.species = SP_OOZLE;
        host_altars = 1;
    }
    SECTION("Oozle host receives an altar without Rogue in the party")
    {
        guest = "Other";
        you.species = SP_OOZLE;
        host_altars = 1;
    }
    SECTION("Human guest receives no altar even on Rogue's account")
    {
        guest_species = SP_HUMAN;
        guest_altars = 0;
    }
    scoped_account host_identity(0, host), guest_identity(1, guest);
    party::set_player_count(2);
    auto& peer = party::get_player(1);
    peer = you;
    peer.save = nullptr;
    peer.species = guest_species;
    peer.set_position(coord_def(45, 35));
    account_start::place_features();
    CHECK(adjacent_altars(you.pos()) == host_altars);
    CHECK(adjacent_altars(peer.pos()) == guest_altars);
}
