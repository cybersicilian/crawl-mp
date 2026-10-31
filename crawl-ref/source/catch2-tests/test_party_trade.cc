#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "env.h"
#include "feature.h"
#include "item-prop.h"
#include "items.h"
#include "losglobal.h"
#include "party.h"
#include "party-trade.h"
#include "player.h"
#include "prompt.h"
#include "test_player_fixture.h"

namespace
{
struct trade_fixture : MockPlayerYouTestsFixture
{
    vector<dungeon_feature_type> terrain;
    trade_fixture()
    {
        init_show_table();
        party::set_player_count(2);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.hp = you.hp_max = 20;
        you.current_vision = 7;
        you.set_position(coord_def(40, 35));
        player& recipient = party::get_player(1);
        recipient = you;
        recipient.your_name = "Recipient";
        recipient.mid = party::mid_for_slot(1);
        recipient.save = nullptr;
        recipient.set_position(coord_def(42, 35));
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
            {
                terrain.push_back(env.grid[x][y]);
                env.grid[x][y] = DNGN_FLOOR;
            }
        invalidate_los();
        you.turn_is_over = false;
    }
    ~trade_fixture()
    {
        party::remove_all_proxies();
        party::get_player(1).save = nullptr;
        party::set_player_count(1);
        int index = 0;
        for (int x = 30; x <= 50; ++x)
            for (int y = 25; y <= 45; ++y)
                env.grid[x][y] = terrain[index++];
        invalidate_los();
    }
    item_def& item(player& owner, int slot, const char* name, int quantity = 1)
    {
        REQUIRE(get_item_by_exact_name(owner.inv[slot], name));
        auto& result = owner.inv[slot];
        result.link = slot;
        result.slot = slot < MAX_GEAR ? index_to_letter(slot) : 'a';
        result.pos = ITEM_IN_INVENTORY;
        result.quantity = quantity;
        return result;
    }
    int quantity(player& owner, object_class_type type)
    {
        int total = 0;
        for (const auto& entry : owner.inv)
            if (entry.defined() && entry.base_type == type)
                total += entry.quantity;
        return total;
    }
};
}

TEST_CASE_METHOD(trade_fixture, "Party trade requires the giver's own sightline", "[party-trade]")
{
    INFO(party::trade_block_reason(0, 1));
    REQUIRE(party::trade_block_reason(0, 1).empty());
    item(you, MAX_GEAR, "potion of curing", 5);
    SECTION("Opaque terrain blocks a nearby hero")
    {
        env.grid[41][35] = DNGN_ROCK_WALL;
        invalidate_los();
        REQUIRE_FALSE(party::trade_block_reason(0, 1).empty());
    }
    SECTION("Reduced vision blocks a hero even in an open room")
    {
        you.current_vision = 1;
        REQUIRE_FALSE(party::trade_block_reason(0, 1).empty());
        REQUIRE(party::trade_block_reason(1, 0).empty());
    }
    SECTION("Floor identity is authoritative") { party::get_player(1).depth = 2; }
    SECTION("Downed recipients cannot trade") { party::get_player(1).hp = 0; }
    REQUIRE_FALSE(party::transfer_item(1, MAX_GEAR, 1).empty());
    REQUIRE(you.inv[MAX_GEAR].quantity == 5);
    REQUIRE(quantity(party::get_player(1), OBJ_POTIONS) == 0);
    REQUIRE_FALSE(you.turn_is_over);
    REQUIRE_FALSE(party::trade_block_reason(0, 0).empty());
    REQUIRE_FALSE(party::trade_block_reason(0, 4).empty());
}

TEST_CASE_METHOD(trade_fixture, "Party transfers conserve native inventory", "[party-trade]")
{
    INFO(party::trade_block_reason(0, 1));
    player& recipient = party::get_player(1);
    SECTION("Partial and whole stacks merge with existing supplies")
    {
        item(you, MAX_GEAR, "potion of curing", 5);
        item(recipient, MAX_GEAR, "potion of curing", 2);
        REQUIRE(party::transfer_item(1, MAX_GEAR, 2).empty());
        REQUIRE(you.inv[MAX_GEAR].quantity == 3);
        REQUIRE(quantity(recipient, OBJ_POTIONS) == 4);
        REQUIRE(you.turn_is_over);
        REQUIRE(party::active_slot() == 0);
        REQUIRE(party::transfer_item(1, MAX_GEAR, 3).empty());
        REQUIRE_FALSE(you.inv[MAX_GEAR].defined());
        REQUIRE(quantity(recipient, OBJ_POTIONS) == 7);
    }
    SECTION("Equipped items require unequipping")
    {
        item(you, 0, "dagger");
        you.equipment.items.emplace_back(0, SLOT_WEAPON, false, false, false);
        REQUIRE_FALSE(party::transfer_item(1, 0, 1).empty());
        REQUIRE(you.inv[0].defined());
        REQUIRE_FALSE(you.turn_is_over);
    }
    SECTION("Invalid quantities do not remove items")
    {
        item(you, MAX_GEAR, "potion of curing", 5);
        for (int amount : { -1, 0, 6 })
            REQUIRE_FALSE(party::transfer_item(1, MAX_GEAR, amount).empty());
        REQUIRE(you.inv[MAX_GEAR].quantity == 5);
        REQUIRE_FALSE(you.turn_is_over);
    }
    SECTION("Full gear inventory leaves the source intact")
    {
        item(you, 0, "dagger");
        for (int i = 0; i < MAX_GEAR; ++i) item(recipient, i, "dagger");
        REQUIRE_FALSE(party::transfer_item(1, 0, 1).empty());
        REQUIRE(you.inv[0].defined());
        REQUIRE(quantity(recipient, OBJ_WEAPONS) == MAX_GEAR);
        REQUIRE_FALSE(you.turn_is_over);
    }
    SECTION("A full supplies inventory still accepts compatible stacks")
    {
        item(you, MAX_GEAR, "potion of curing", 5);
        for (int i = MAX_GEAR; i < ENDOFPACK; ++i) item(recipient, i, "potion of curing", 2);
        REQUIRE(party::transfer_item(1, MAX_GEAR, 2).empty());
        REQUIRE(quantity(recipient, OBJ_POTIONS) == 2 * (ENDOFPACK - MAX_GEAR) + 2);
    }
    SECTION("Full supplies with no matching stack reject without an assertion")
    {
        item(you, MAX_GEAR, "potion of curing", 5);
        for (int i = MAX_GEAR; i < ENDOFPACK; ++i) item(recipient, i, "scroll of teleportation");
        REQUIRE_FALSE(party::transfer_item(1, MAX_GEAR, 2).empty());
        REQUIRE(you.inv[MAX_GEAR].quantity == 5);
        REQUIRE_FALSE(you.turn_is_over);
    }
    SECTION("Native charge merging preserves wand charges")
    {
        auto& source = item(you, MAX_GEAR, "wand of flame"); source.charges = 4;
        auto& destination = item(recipient, MAX_GEAR, "wand of flame"); destination.charges = 3;
        REQUIRE(party::transfer_item(1, MAX_GEAR, 1).empty());
        REQUIRE_FALSE(you.inv[MAX_GEAR].defined());
        REQUIRE(recipient.inv[MAX_GEAR].charges == 7);
    }
}
