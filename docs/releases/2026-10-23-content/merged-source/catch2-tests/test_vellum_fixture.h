#pragma once
#include "catch_amalgamated.hpp"
#include "AppHdr.h"
#include "artefact.h"
#include "art-enum.h"
#include "equipment-memory-items.h"
#include "env.h"
#include "feature.h"
#include "god-vellum.h"
#include "item-prop.h"
#include "items.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "religion.h"
#include "test_player_fixture.h"

struct vellum_fixture : MockPlayerYouTestsFixture
{
    vellum_fixture()
    {
        static const bool messages = []() { msg::initialise_mpr_streams(); return true; }();
        (void)messages;
        party::set_multiplayer(false);
        party::set_player_count(1);
        init_show_table();
        you.set_position(coord_def(40, 35));
        env.grid(you.pos()) = DNGN_FLOOR;
        you.religion = GOD_VELLUM;
        you.raw_piety = 200;
        you.piety_max[GOD_VELLUM] = 200;
        you.piety_hysteresis = 0;
    }
    ~vellum_fixture() { you.delay_queue.clear(); }
    item_def& carry(int slot, object_class_type base = OBJ_ARMOUR, int subtype = ARM_ROBE,
                    bool artifact = true)
    {
        auto& item = you.inv[slot];
        item.clear();
        item.base_type = base;
        item.sub_type = subtype;
        item.quantity = 1;
        item.link = slot;
        item.slot = 'a' + slot;
        item.pos = ITEM_IN_INVENTORY;
        if (artifact)
        {
            REQUIRE(make_item_randart(item, true));
            for (int i = 0; i < ART_PROPERTIES; ++i)
                artefact_set_property(item, static_cast<artefact_prop_type>(i), 0);
        }
        identify_item(item);
        item.give_unique_id();
        return item;
    }
    item_def& unique(int slot, int index)
    {
        auto& item = carry(slot, OBJ_ARMOUR, ARM_ROBE, false);
        REQUIRE(make_item_unrandart(item, index));
        item.link = slot;
        item.pos = ITEM_IN_INVENTORY;
        identify_item(item);
        item.give_unique_id();
        return item;
    }
    void wear(int slot, equipment_slot position = SLOT_BODY_ARMOUR)
    {
        you.equipment.items.emplace_back(slot, position, false, true, false);
        you.equipment.update();
    }
    vellum::request transfer(int donor, int target, artefact_prop_type property, int value)
    {
        artefact_set_property(you.inv[donor], property, value);
        vellum::request work;
        work.action = vellum::operation::extract;
        work.source = vellum::item_id(you.inv[donor]);
        work.target = target < 0 ? 0 : vellum::item_id(you.inv[target]);
        work.magic = {property, value};
        work.magic.brand_class = you.inv[donor].base_type;
        return work;
    }
    void finish(const vellum::request& work)
    {
        const auto quote = vellum::preview(work);
        INFO(quote.blocked);
        REQUIRE(quote.blocked.empty());
        REQUIRE(vellum::commit(quote));
    }
};
