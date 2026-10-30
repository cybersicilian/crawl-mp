#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam.h"
#include "dungeon.h"
#include "env.h"
#include "level-state-type.h"
#include "losglobal.h"
#include "mon-book.h"
#include "mon-cast.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-util.h"
#include "state.h"
#include "test_vellum_fixture.h"
#include "unwind.h"

TEST_CASE_METHOD(vellum_fixture, "Asclepia retains her herbalist spellbook and cloud immunity",
                 "[asclepia]")
{
    init_monsters();
    const monsterentry* data = get_monster_data(MONS_ASCLEPIA);
    REQUIRE(data);
    CHECK(string(data->name) == "Asclepia");
    CHECK(data->sec == MST_ASCLEPIA);
    CHECK(data->species == MONS_ORC);
    monster herbalist;
    herbalist.type = MONS_ASCLEPIA;
    CHECK(herbalist.cloud_immune());
    const monster_info info(MONS_ASCLEPIA, MONS_ASCLEPIA);
    CHECK(info.props.exists(CLOUD_IMMUNE_MB_KEY));
    const auto spells = get_unique_spells(info);
    for (spell_type wanted : {SPELL_HEAL_OTHER, SPELL_HASTE_OTHER, SPELL_EVAPORATE})
        CHECK(std::any_of(spells.begin(), spells.end(),
                          [wanted](const mon_spell_slot& slot)
                          { return slot.spell == wanted; }));
}

TEST_CASE_METHOD(vellum_fixture, "Monster Evaporate produces the five potion-cloud flavours",
                 "[asclepia][evaporate]")
{
    const beam_type expected[] = {BEAM_MEPHITIC, BEAM_POTION_MIASMA,
                                  BEAM_POTION_POISON, BEAM_POTION_FIRE,
                                  BEAM_POTION_STEAM};
    for (int i = 0; i < 5; ++i)
    {
        bolt beam;
        setup_monster_evaporate(beam, 50, i);
        CHECK(beam.flavour == expected[i]);
        CHECK(beam.is_explosion);
        CHECK(beam.ex_size == 1);
        CHECK(beam.ench_power == 50);
        CHECK(beam.name == "potion");
    }
}

TEST_CASE_METHOD(vellum_fixture, "Asclepia's potion beam keeps monster ownership",
                 "[asclepia][evaporate]")
{
    init_monsters();
    init_spell_descs();
    monster herbalist;
    herbalist.type = MONS_ASCLEPIA;
    herbalist.mid = 51301;
    herbalist.set_position(you.pos() + coord_def(2, 0));
    const bolt beam = mons_spell_beam(&herbalist, SPELL_EVAPORATE, 50);
    CHECK(beam.source_id == herbalist.mid);
    CHECK(beam.thrower == KILL_MON_MISSILE);
    CHECK(beam.origin_spell == SPELL_EVAPORATE);
    CHECK(beam.is_explosion);
    CHECK(beam.ex_size == 1);
}

TEST_CASE_METHOD(vellum_fixture, "Still winds prevent Asclepia from casting cloud potions",
                 "[asclepia][evaporate]")
{
    unwind_var<bool> test_mode(crawl_state.test, true);
    init_monsters();
    init_spell_descs();
    init_mons_spells();
    dgn_reset_level(false);
    unwinder reset_level([] { dgn_reset_level(false); invalidate_los(); });
    unwind_var<uint32_t> restore_state(env.level_state);
    unwind_var<int> restore_max(env.max_mon_index);
    for (int x = 35; x <= 45; ++x)
        for (int y = 30; y <= 40; ++y)
            env.grid[x][y] = DNGN_FLOOR;
    you.hp = you.hp_max = 100;
    you.on_current_level = true;
    you.current_vision = you.normal_vision = 7;
    monster& herbalist = env.mons[0];
    herbalist.reset();
    herbalist.type = MONS_ASCLEPIA;
    herbalist.mid = 51301;
    herbalist.hit_points = herbalist.max_hit_points = 65;
    herbalist.set_hit_dice(10);
    herbalist.base_attitude = ATT_HOSTILE;
    herbalist.behaviour = BEH_SEEK;
    herbalist.foe = MHITYOU;
    herbalist.set_position(you.pos() + coord_def(3, 0));
    herbalist.target = you.pos();
    env.mgrid(herbalist.pos()) = 0;
    env.mid_cache[herbalist.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);
    mons_load_spells(herbalist);
    invalidate_los();
    env.level_state &= ~LSTATE_STILL_WINDS;
    REQUIRE(is_mons_cast_possible(herbalist, SPELL_EVAPORATE));
    env.level_state |= LSTATE_STILL_WINDS;
    CHECK_FALSE(is_mons_cast_possible(herbalist, SPELL_EVAPORATE));
}
