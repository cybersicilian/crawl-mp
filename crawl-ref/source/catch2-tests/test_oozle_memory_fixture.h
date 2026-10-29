#pragma once
#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "equipment-memory-items.h"
#include "artefact.h"
#include "ability.h"
#include "clua.h"
#include "delay.h"
#include "equipment-profile.h"
#include "item-def.h"
#include "item-prop.h"
#include "items.h"
#include "invent.h"
#include "json-wrapper.h"
#include "mutation.h"
#include "oozle-memory.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "skills.h"
#include "spl-cast.h"
#include "fight.h"
#include "melee-attack.h"
#include "transform.h"
#include "test_player_fixture.h"

// Exercise the same confirmed native ability and owner-turn delay as play.
inline void assimilate_item(int index)
{
    if (item_is_equipped(you.inv[index]))
        REQUIRE(unequip_item(you.inv[index], true, false, false));
    REQUIRE(clua.execstring("local previous = c_answer_prompt; "
        "c_answer_prompt = function() return true end; "
        "restore_memory_test_prompt = function() c_answer_prompt = previous end") == 0);
    const auto result = oozle::assimilate(index);
    REQUIRE(clua.execstring("restore_memory_test_prompt(); restore_memory_test_prompt = nil") == 0);
    REQUIRE(result == spret::success);
    REQUIRE(current_delay());
    const auto delay = current_delay();
    for (int turn = 1; turn < oozle::current_policy().assimilation_turns; ++turn)
        delay->handle();
    CHECK(delay->duration == 0);
    CHECK_FALSE(you.inv[index].defined());
    you.delay_queue.clear();
}

struct memory_fixture : MockPlayerYouTestsFixture
{
    memory_fixture()
    {
        you.species = SP_OOZLE;
        you.experience_level = 1;
        give_basic_mutations(SP_OOZLE);
        you.equipment.update();
    }
    item_def& carry(int index, const char* name)
    {
        REQUIRE(get_item_by_exact_name(you.inv[index], name));
        auto& item = you.inv[index];
        item.link = index;
        item.slot = 'a' + index;
        item.pos = ITEM_IN_INVENTORY;
        return item;
    }
    void wear(int index, equipment_slot slot)
    {
        you.equipment.items.emplace_back(index, slot, false, false, false);
        you.equipment.update();
    }
    void assimilate_fire_ring()
    {
        carry(0, "ring of protection from fire");
        assimilate_item(0);
    }
};
