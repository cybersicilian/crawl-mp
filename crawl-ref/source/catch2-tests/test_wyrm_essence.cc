#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "item-name.h"
#include "item-prop.h"
#include "cloud.h"
#include "mon-ench.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "potion.h"
#include "test_vellum_fixture.h"
#include "wyrm-essence.h"

TEST_CASE_METHOD(vellum_fixture, "Wyrm essences are named, usable and excluded from random potion generation",
                 "[wyrm][wyrm-essence]")
{
    for (potion_type pot : { POT_NIGREDO, POT_ALBEDO, POT_CITRINITAS,
                             POT_VIRIDITAS, POT_RUBEDO })
    {
        CHECK(wyrm_essence::is_essence(pot));
        CHECK(string(potion_type_name(pot)) != "bugginess");
        CHECK(get_potion_effect(pot) != nullptr);
        CHECK(consumable_rarity(OBJ_POTIONS, pot) == RARITY_NONE);
    }
    CHECK_FALSE(wyrm_essence::is_essence(POT_CURING));
}

TEST_CASE_METHOD(vellum_fixture, "Viriditas restores ailments only for Wyrm followers",
                 "[wyrm][wyrm-essence]")
{
    you.religion = GOD_NO_GOD;
    you.duration[DUR_POISONING] = 20;
    you.duration[DUR_CONF] = 20;
    REQUIRE(get_potion_effect(POT_VIRIDITAS)->effect());
    CHECK(you.duration[DUR_POISONING] == 20);
    CHECK(you.duration[DUR_CONF] == 20);

    you.religion = GOD_GREAT_WYRM;
    you.duration[DUR_SLOW] = 20;
    you.duration[DUR_PETRIFYING] = 20;
    you.duration[DUR_WEAK] = 20;
    REQUIRE(get_potion_effect(POT_VIRIDITAS)->effect());
    CHECK(you.duration[DUR_POISONING] == 0);
    CHECK(you.duration[DUR_CONF] == 0);
    CHECK(you.duration[DUR_SLOW] == 0);
    CHECK(you.duration[DUR_PETRIFYING] == 0);
    CHECK(you.duration[DUR_WEAK] == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Wyrm infusion effects retain their owner's identity",
                 "[wyrm][wyrm-essence]")
{
    init_monsters();
    you.religion = GOD_GREAT_WYRM;
    you.raw_piety = 120;
    monster victim;
    victim.type = MONS_ORC;
    victim.add_ench(mon_enchant(ENCH_WYRM_VIRIDITAS, &you, 100));
    victim.add_ench(mon_enchant(ENCH_WYRM_CITRINITAS, &you, 100));
    CHECK(wyrm_essence::converts_damage(victim));
    CHECK(wyrm_essence::infusion_piety(victim, ENCH_WYRM_CITRINITAS) == you.piety());
    const mid_t owner = you.mid;
    you.mid = owner + 100;
    CHECK_FALSE(wyrm_essence::converts_damage(victim));
    you.mid = owner;
}

TEST_CASE_METHOD(vellum_fixture, "Citrinitas empowers its recipient and records its owner",
                 "[wyrm][wyrm-essence]")
{
    you.religion = GOD_GREAT_WYRM;
    you.raw_piety = 120;
    wyrm_essence::empower_player(you, 10, you.mid);
    CHECK(you.duration[DUR_WYRM_CITRINITAS] == 10 * BASELINE_DELAY);
    CHECK(wyrm_essence::empowerment_piety() == you.piety());
    player recipient;
    wyrm_essence::empower_player(recipient, 7, you.mid);
    CHECK(recipient.duration[DUR_WYRM_CITRINITAS] == 7 * BASELINE_DELAY);
    CHECK(recipient.props["wyrm_citrinitas_owner"].get_int() == static_cast<int>(you.mid));
    CHECK(you.duration[DUR_WYRM_CITRINITAS] == 10 * BASELINE_DELAY);
}

TEST_CASE_METHOD(vellum_fixture, "Nigredo keeps its owner and leaves miasma on the previous square",
                 "[wyrm][wyrm-essence]")
{
    const coord_def previous = you.pos() + coord_def(1, 0);
    env.grid(previous) = DNGN_FLOOR;
    if (cloud_at(previous))
        delete_cloud(previous);
    wyrm_essence::leave_player_miasma(you, previous);
    CHECK(cloud_at(previous) == nullptr);
    wyrm_essence::infuse_player_nigredo(you, 10, you.mid);
    CHECK(you.duration[DUR_WYRM_NIGREDO] == 10 * BASELINE_DELAY);
    CHECK(you.props["wyrm_nigredo_owner"].get_int() == static_cast<int>(you.mid));
    wyrm_essence::leave_player_miasma(you, previous);
    REQUIRE(cloud_at(previous));
    CHECK(cloud_at(previous)->type == CLOUD_MIASMA);
    CHECK(cloud_at(previous)->source == you.mid);
    delete_cloud(previous);
}

TEST_CASE_METHOD(vellum_fixture, "Party Citrinitas uses its infuser's piety",
                 "[wyrm][wyrm-essence][party]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& owner = party::get_player(1);
    owner = you;
    owner.save = nullptr;
    owner.mid = party::mid_for_slot(1);
    owner.religion = GOD_GREAT_WYRM;
    owner.raw_piety = 160;
    you.raw_piety = 30;
    wyrm_essence::empower_player(you, 10, owner.mid);
    CHECK(wyrm_essence::empowerment_piety() == owner.piety());
    CHECK(wyrm_essence::empowerment_piety() != you.piety());
    you.duration[DUR_WYRM_CITRINITAS] = 0;
    you.props.erase("wyrm_citrinitas_owner");
    owner.save = nullptr;
    party::set_multiplayer(false);
    party::set_player_count(1);
}

TEST_CASE_METHOD(vellum_fixture, "Wyrm penance extracts one of three potion attempts",
                 "[wyrm][wyrm-essence]")
{
    you.penance[GOD_GREAT_WYRM] = 0;
    CHECK_FALSE(wyrm_essence::penance_extracts_potion(0));
    you.penance[GOD_GREAT_WYRM] = 1;
    CHECK(wyrm_essence::penance_extracts_potion(0));
    CHECK_FALSE(wyrm_essence::penance_extracts_potion(1));
    CHECK_FALSE(wyrm_essence::penance_extracts_potion(2));
}

TEST_CASE_METHOD(vellum_fixture, "Wyrm infusions appear in monster information",
                 "[wyrm][wyrm-essence]")
{
    init_monsters();
    monster& mon = env.mons[0];
    mon.reset();
    mon.type = MONS_ORC;
    mon.mid = 52221;
    mon.hit_points = mon.max_hit_points = 30;
    mon.set_hit_dice(2);
    mon.base_attitude = ATT_HOSTILE;
    mon.behaviour = BEH_SEEK;
    mon.set_position(you.pos() + coord_def(1, 0));
    env.grid(mon.pos()) = DNGN_FLOOR;
    env.mgrid(mon.pos()) = 0;
    env.mid_cache[mon.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    for (enchant_type enchant : {ENCH_WYRM_NIGREDO, ENCH_WYRM_ALBEDO,
                                  ENCH_WYRM_CITRINITAS, ENCH_WYRM_VIRIDITAS})
        mon.add_ench(mon_enchant(enchant, &you, 100));
    const monster_info info(&mon);
    CHECK(info.is(MB_WYRM_NIGREDO));
    CHECK(info.is(MB_WYRM_ALBEDO));
    CHECK(info.is(MB_WYRM_CITRINITAS));
    CHECK(info.is(MB_WYRM_VIRIDITAS));
    env.mgrid(mon.pos()) = NON_MONSTER;
    env.mid_cache.erase(mon.mid);
    mon.reset();
}
