#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "corpse.h"
#include "directn.h"
#include "dungeon.h"
#include "env.h"
#include "losglobal.h"
#include "mgen-data.h"
#include "mon-ench.h"
#include "mon-info.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "items.h"
#include "player.h"
#include "spl-cast.h"
#include "spl-clouds.h"
#include "spl-other.h"
#include "test_vellum_fixture.h"
#include "wyrm-abilities.h"
#include "wyrm-essence.h"

TEST_CASE_METHOD(vellum_fixture, "Great Wyrm transmutation commits one potion only after placement", "[wyrm][wyrm-abilities]")
{
    item_def& reagent = carry(0, OBJ_POTIONS, POT_CURING, false);
    reagent.quantity = 2;
    env.grid(you.pos()) = DNGN_FLOOR;

    CHECK(wyrm_abilities::transmute_slot(ABIL_WYRM_NIGREDO, 0, false)
          == spret::success);
    CHECK(reagent.quantity == 1);
    bool found = false;
    for (stack_iterator si(you.pos()); si; ++si)
        found |= si->is_type(OBJ_POTIONS, POT_NIGREDO);
    CHECK(found);

    CHECK(wyrm_abilities::transmute_slot(ABIL_WYRM_ALBEDO, 0, true)
          == spret::fail);
    CHECK(reagent.quantity == 1);
    CHECK(wyrm_abilities::transmute_slot(ABIL_WYRM_ALBEDO, -1, false)
          == spret::abort);
    CHECK(reagent.quantity == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Great Wyrm retains reagent when output is destroyed", "[wyrm][wyrm-abilities]")
{
    item_def& reagent = carry(0, OBJ_POTIONS, POT_CURING, false);
    reagent.quantity = 2;
    env.grid(you.pos()) = DNGN_LAVA;
    CHECK(wyrm_abilities::transmute_slot(ABIL_WYRM_ALBEDO, 0, false)
          == spret::abort);
    CHECK(reagent.quantity == 2);
    env.grid(you.pos()) = DNGN_FLOOR;
}

TEST_CASE_METHOD(vellum_fixture, "Great Wyrm rejects invalid essence targets without spending the reagent", "[wyrm][wyrm-abilities]")
{
    item_def& essence = carry(0, OBJ_POTIONS, POT_CITRINITAS, false);
    essence.quantity = 2;
    CHECK(wyrm_abilities::infuse_slot(-1, you.pos(), false) == spret::abort);
    CHECK(wyrm_abilities::infuse_slot(0, you.pos(), false) == spret::abort);
    CHECK(essence.quantity == 2);
}

namespace
{
struct wyrm_party_fixture : vellum_fixture
{
    wyrm_party_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        for (int x = 32; x <= 48; ++x)
            for (int y = 27; y <= 43; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        party::set_player_count(2);
        player& other = party::get_player(1);
        other = you;
        other.save = nullptr;
        other.mid = party::mid_for_slot(1);
        other.set_position(you.pos() + coord_def(2, 0));
        party::set_multiplayer(true);
        party::sync_all_proxies();
        invalidate_los();
    }
    ~wyrm_party_fixture()
    {
        party::set_multiplayer(false);
        party::get_player(1).save = nullptr;
        party::get_player(2).save = nullptr;
        party::set_player_count(1);
        dgn_reset_level(false);
        invalidate_los();
    }
};

struct wyrm_targeting_fixture : targeting_behaviour
{
    bool hide_target(const coord_def& pos) const override
    {
        return wyrm_abilities::hidden_party_target(pos);
    }
};
}

TEST_CASE_METHOD(wyrm_party_fixture, "Great Wyrm targeting hides invisible party identity", "[wyrm][wyrm-abilities][party]")
{
    player& other = party::get_player(1);
    monster* proxy = monster_at(other.pos());
    REQUIRE(proxy);
    env.map_knowledge(other.pos()).set_monster(monster_info(proxy));
    wyrm_targeting_fixture targeting;
    REQUIRE(you.can_see(other));
    CHECK_FALSE(targeting.hide_target(other.pos()));
    CHECK_FALSE(cell_monster_description(other.pos(), true, &targeting).empty());
    CHECK_FALSE(targeting.hide_target(you.pos()));
    CHECK_FALSE(targeting.hide_target(you.pos() + coord_def(0, 1)));

    other.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
    REQUIRE_FALSE(you.can_see(other));
    CHECK(targeting.hide_target(other.pos()));
    CHECK(cell_monster_description(other.pos(), true, &targeting).empty());
    CHECK_FALSE(cell_monster_description(other.pos(), true, nullptr).empty());
}

TEST_CASE_METHOD(wyrm_party_fixture, "Viriditas evaporation checks its actual blast area", "[wyrm][wyrm-abilities][party]")
{
    const coord_def target = you.pos() + coord_def(0, 3);
    monster* enemy = create_monster(mgen_data(MONS_ORC, BEH_HOSTILE, target,
                                             MHITNOT, MG_FORCE_PLACE));
    REQUIRE(enemy);
    REQUIRE(enemy->pos() == target);
    REQUIRE(monster_at(target) == enemy);
    REQUIRE_FALSE(mons_aligned(&you, enemy));
    REQUIRE(you.can_see(*enemy));
    // Both the centre and an adjacent square cover the actual target.  A
    // two-square gap must not trigger a warning for an unrelated enemy.
    CHECK(evaporate_heals_visible_enemy(target));
    CHECK(evaporate_heals_visible_enemy(target + coord_def(1, 0)));
    CHECK_FALSE(evaporate_heals_visible_enemy(target + coord_def(2, 0)));

    enemy->base_attitude = ATT_FRIENDLY;
    CHECK_FALSE(evaporate_heals_visible_enemy(target));
    enemy->base_attitude = ATT_HOSTILE;
    REQUIRE(enemy->add_ench(ENCH_INVIS));
    REQUIRE_FALSE(you.can_see(*enemy));
    CHECK_FALSE(evaporate_heals_visible_enemy(target));

    // A party proxy is not a hostile monster, even if it occupies the centre.
    CHECK_FALSE(evaporate_heals_visible_enemy(party::get_player(1).pos()));
}

TEST_CASE_METHOD(wyrm_party_fixture, "Great Wyrm infuses a visible party member without changing the caster", "[wyrm][wyrm-abilities][party]")
{
    player& other = party::get_player(1);
    item_def& essence = carry(0, OBJ_POTIONS, POT_CITRINITAS, false);
    essence.quantity = 2;
    REQUIRE(you.can_see(other));
    REQUIRE(wyrm_abilities::infuse_slot(0, other.pos(), false) == spret::success);
    CHECK(other.duration[DUR_WYRM_CITRINITAS] > 0);
    CHECK(you.duration[DUR_WYRM_CITRINITAS] == 0);
    CHECK(essence.quantity == 1);
}

TEST_CASE_METHOD(wyrm_party_fixture, "Rubedo spreads a party member's infusion to another member", "[wyrm][wyrm-abilities][party]")
{
    party::set_player_count(3);
    player& donor = party::get_player(1);
    player& recipient = party::get_player(2);
    recipient = you;
    recipient.save = nullptr;
    recipient.mid = party::mid_for_slot(2);
    recipient.set_position(you.pos() + coord_def(3, 0));
    party::sync_all_proxies();
    invalidate_los();
    REQUIRE(you.can_see(donor));
    REQUIRE(you.can_see(recipient));
    wyrm_essence::empower_player(donor, 20, you.mid);
    item_def& rubedo = carry(0, OBJ_POTIONS, POT_RUBEDO, false);
    rubedo.quantity = 2;
    REQUIRE(wyrm_abilities::infuse_slot(0, donor.pos(), false) == spret::success);
    CHECK(recipient.duration[DUR_WYRM_CITRINITAS] > 0);
    CHECK(you.duration[DUR_WYRM_CITRINITAS] == 0);
    CHECK(rubedo.quantity == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Each Great Wyrm transmutation creates exactly one essence", "[wyrm][wyrm-abilities]")
{
    item_def& reagent = carry(0, OBJ_POTIONS, POT_CURING, false);
    reagent.quantity = 49;
    env.grid(you.pos()) = DNGN_FLOOR;
    int baseline = 0;
    for (stack_iterator si(you.pos()); si; ++si)
        if (si->is_type(OBJ_POTIONS, POT_NIGREDO))
            baseline += si->quantity;
    for (int attempt = 1; attempt <= 48; ++attempt)
    {
        REQUIRE(wyrm_abilities::transmute_slot(ABIL_WYRM_NIGREDO, 0, false)
                == spret::success);
        int produced = 0;
        for (stack_iterator si(you.pos()); si; ++si)
            if (si->is_type(OBJ_POTIONS, POT_NIGREDO))
                produced += si->quantity;
        CHECK(produced == baseline + attempt);
        CHECK(reagent.quantity == 49 - attempt);
    }
}

TEST_CASE_METHOD(wyrm_party_fixture, "Fulsome preserves a corpse if its distillate cannot be placed", "[wyrm][wyrm-abilities]")
{
    int index = get_mitm_slot(10);
    REQUIRE(index != NON_ITEM);
    item_def& corpse = env.item[index];
    corpse.clear();
    corpse.base_type = OBJ_CORPSES;
    corpse.sub_type = CORPSE_BODY;
    corpse.mon_type = MONS_RAT;
    corpse.freshness = FRESHEST_CORPSE;
    corpse.quantity = 1;
    REQUIRE(move_item_to_grid(&index, you.pos(), true));
    env.grid(you.pos()) = DNGN_LAVA;
    CHECK(cast_fulsome_distillation(100, true, false) == spret::abort);
    CHECK(env.item[index].is_type(OBJ_CORPSES, CORPSE_BODY));
    env.grid(you.pos()) = DNGN_FLOOR;
    CHECK(cast_fulsome_distillation(100, true, false) == spret::success);
    CHECK_FALSE(env.item[index].defined());
}

TEST_CASE_METHOD(wyrm_party_fixture, "Fulsome creates one potion per corpse", "[wyrm][wyrm-abilities]")
{
    const auto potion_count = []()
    {
        int count = 0;
        for (const item_def& item : you.inv)
            if (item.defined() && item.base_type == OBJ_POTIONS)
                count += item.quantity;
        for (stack_iterator si(you.pos()); si; ++si)
            if (si->base_type == OBJ_POTIONS)
                count += si->quantity;
        return count;
    };
    const int baseline = potion_count();
    for (int attempt = 1; attempt <= 32; ++attempt)
    {
        int index = get_mitm_slot(10);
        REQUIRE(index != NON_ITEM);
        item_def& corpse = env.item[index];
        corpse.clear();
        corpse.base_type = OBJ_CORPSES;
        corpse.sub_type = CORPSE_BODY;
        corpse.mon_type = MONS_RAT;
        corpse.freshness = FRESHEST_CORPSE;
        corpse.quantity = 1;
        REQUIRE(move_item_to_grid(&index, you.pos(), true));
        REQUIRE(cast_fulsome_distillation(100, true, false) == spret::success);
        CHECK(potion_count() == baseline + attempt);
    }
}

TEST_CASE_METHOD(wyrm_party_fixture, "Rubedo does not reveal or infuse an invisible party recipient", "[wyrm][wyrm-abilities][party]")
{
    party::set_player_count(3);
    player& donor = party::get_player(1);
    player& hidden = party::get_player(2);
    hidden = you;
    hidden.save = nullptr;
    hidden.mid = party::mid_for_slot(2);
    hidden.set_position(you.pos() + coord_def(3, 0));
    hidden.duration[DUR_INVIS] = 10 * BASELINE_DELAY;
    party::sync_all_proxies();
    invalidate_los();
    REQUIRE(you.can_see(donor));
    REQUIRE_FALSE(you.can_see(hidden));
    wyrm_essence::empower_player(donor, 20, you.mid);
    item_def& rubedo = carry(0, OBJ_POTIONS, POT_RUBEDO, false);
    rubedo.quantity = 2;
    CHECK(wyrm_abilities::infuse_slot(0, donor.pos(), false) == spret::abort);
    CHECK(hidden.duration[DUR_WYRM_CITRINITAS] == 0);
    CHECK(rubedo.quantity == 2);
}
