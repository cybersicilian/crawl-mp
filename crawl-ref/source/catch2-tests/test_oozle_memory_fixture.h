#pragma once
#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "equipment-memory-items.h"
#include "artefact.h"
#include "ability.h"
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
#include "fight.h"
#include "melee-attack.h"
#include "transform.h"
#include "test_player_fixture.h"

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
    void digest_fire_ring()
    {
        carry(0, "ring of protection from fire");
        wear(0, SLOT_RING);
        oozle::digest_equipment(oozle::digestion_aut);
    }
};
