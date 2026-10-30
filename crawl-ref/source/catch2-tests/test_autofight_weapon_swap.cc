#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "l-autofight.h"
#include "invent.h"
#include "options.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(vellum_fixture, "Autofight weapon swaps require a safe a/b pair",
                 "[autofight-weapon-swap]")
{
    unwind_var<bool> restore_option(Options.autofight_weapon_swap, true);
    you.equipment.items.clear();
    item_def &melee = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    item_def &launcher = carry(1, OBJ_WEAPONS, WPN_SLING, false);
    wear(0, SLOT_WEAPON);

    CHECK(autofight_weapon_swap_available(true));
    CHECK_FALSE(autofight_weapon_swap_available(false));

    SECTION("The setting is opt-in")
    {
        Options.autofight_weapon_swap = false;
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
    SECTION("A warning inscription blocks automatic wielding")
    {
        launcher.inscription = "!w";
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
    SECTION("A warning inscription blocks removing the current weapon")
    {
        melee.inscription = "!w";
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
    SECTION("A cursed current weapon cannot be removed")
    {
        melee.flags |= ISFLAG_CURSED;
        CHECK_FALSE(autofight_weapon_swap_available(true));
        melee.flags &= ~ISFLAG_CURSED;
    }
    SECTION("Swapping preserves the only flight source over lava")
    {
        REQUIRE(make_item_randart(melee, true));
        for (int i = 0; i < ART_PROPERTIES; ++i)
            artefact_set_property(melee, static_cast<artefact_prop_type>(i), 0);
        artefact_set_property(melee, ARTP_FLY, 1);
        // The fixture equipped this item before adding its artefact property.
        you.equipment.update();
        REQUIRE(you.equip_flight() == 1);
        unwind_var<dungeon_feature_type> terrain(env.grid(you.pos()), DNGN_FLOOR);
        CHECK(autofight_weapon_swap_available(true));
        env.grid(you.pos()) = DNGN_LAVA;
        CHECK_FALSE(autofight_weapon_swap_available(true));

        carry(2, OBJ_JEWELLERY, RING_FLIGHT, false);
        wear(2, SLOT_RING);
        REQUIRE(you.equip_flight() >= 2);
        CHECK(autofight_weapon_swap_available(true));
    }
    SECTION("An equipment warning blocks automatic wielding")
    {
        REQUIRE(make_item_randart(launcher, true));
        artefact_set_property(launcher, ARTP_FRAGILE, 1);
        REQUIRE(needs_handle_warning(launcher, OPER_EQUIP));
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
    SECTION("The alternate item must be a launcher")
    {
        launcher.sub_type = WPN_LONG_SWORD;
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
    SECTION("Slow wielding does not quietly replace an attack")
    {
        you.mutation[MUT_SLOW_WIELD] = 1;
        CHECK_FALSE(autofight_weapon_swap_available(true));
        you.mutation[MUT_SLOW_WIELD] = 0;
    }
    SECTION("A launcher can switch back to melee")
    {
        you.equipment.items.clear();
        wear(1, SLOT_WEAPON);
        CHECK(autofight_weapon_swap_available(false));
        CHECK_FALSE(autofight_weapon_swap_available(true));
    }
}
